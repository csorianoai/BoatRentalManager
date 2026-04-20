# NBIC — Arquitectura del Sistema
**Nadaki Business Intelligence Center**
Versión: 1.0 | Fecha: 2026-04-20

---

## 1. Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────┐
│                         CAPA UI                                  │
│  reports.html  (Mega UI — sidebar + filtros + 27 reportes)      │
│  Componentes: KPICard · DataTable · TimeSeriesChart · Waterfall │
│               HeatmapChart · AlertFeed · DrilldownModal         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/JSON (NBIC JSON Standard)
┌──────────────────────────▼──────────────────────────────────────┐
│                       CAPA API                                   │
│  /api/nbic/* — Express.js (isAuthenticated middleware)          │
│  Logging: usuario, filtros, latencia, report_code               │
│  Caché: in-memory TTL (15 min executive, 1h detail)             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ SQL via pg pool
┌──────────────────────────▼──────────────────────────────────────┐
│                    CAPA ANALÍTICA                                │
│  Schema: analytics (separado del schema public)                 │
│                                                                  │
│  Dimensiones:                                                    │
│    dim_date · dim_boat · dim_user · dim_channel                 │
│    dim_payment_method · dim_tour · dim_expense_category         │
│                                                                  │
│  Vistas Base Enriquecidas:                                       │
│    v_booking_enriched · v_transaction_enriched                  │
│    v_expense_enriched · v_reconciliation                         │
│    v_price_variance · v_boat_daily                              │
│                                                                  │
│  Fact Tables Materializadas:                                     │
│    mv_fact_daily_boat   (refresh: cada hora)                    │
│    mv_fact_weekly_boat  (refresh: nocturno 02:00)               │
│    mv_fact_monthly_boat (refresh: día 1 de mes + manual)        │
│    mv_executive_kpis    (refresh: cada 15 min)                  │
│                                                                  │
│  Alertas:                                                        │
│    analytics.alert_rules · analytics.alert_events               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Referencias (READ ONLY)
┌──────────────────────────▼──────────────────────────────────────┐
│                   TABLAS TRANSACCIONALES (public.*)              │
│  bookings · bookings_ledger · booking_deposits                  │
│  booking_receivables · transactions · chart_of_accounts         │
│  bank_statements · platform_pricing_policies                    │
│  boat_expenses · captain_payments · stew_payments               │
│  boat_fuel_log · boats · captains · stews · brokers · customers │
│  commission_rules · commission_payments                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Schema Analytics

El schema `analytics` vive en la misma base de datos PostgreSQL pero en un namespace separado para evitar colisiones con el schema transaccional `public`.

```sql
CREATE SCHEMA IF NOT EXISTS analytics;
```

**Ventajas de schema separado:**
- Permisos diferenciados (analytics es read-heavy, public es write-heavy)
- Refresh de materializadas sin impacto en schema transaccional
- Backup independiente posible

---

## 3. Dimensiones

### dim_date
Tabla de fechas pre-calculada: 2020-01-01 a 2030-12-31 (3,653 filas).
```
date_id (DATE PK) · day_of_week · day_name · week_num · month_num · month_name
quarter · year · is_weekend · is_holiday · fiscal_year · fiscal_quarter
season (high/low/shoulder)
```
**Nota de dominio**: temporada alta = Diciembre–Abril (zona caribeña típica).

### dim_boat
```
boat_id (TEXT PK) · name · type · capacity · make · model · length_ft
status · year_acquired · daily_cost_estimate · avg_fuel_per_hour
```
Sinc desde `public.boats` en cada refresh.

### dim_user
```
user_id (TEXT PK) · display_name · email · role · is_active
```
Sinc desde `public.users` (Replit Auth).

### dim_channel
```
channel_id (TEXT PK) · channel_name · channel_type (ota/direct/broker)
commission_rate_standard · is_active
```
Sinc desde `public.platform_configs` + `commission_rules`.

### dim_payment_method
```
payment_method_id (TEXT PK) · method_name · method_type (cash/digital)
settlement_days · is_reconcilable
```
Valores fijos: cash·card·transfer·online_platform·mixed·pending·unknown.

### dim_tour
```
tour_id (TEXT PK) · tour_type (half_day/full_day/custom) · duration_hours
typical_boat_type · is_active
```

### dim_expense_category
```
category_id (TEXT PK) · category_key · category_name · category_type (fixed/variable)
account_codes[] · parent_category
```
Sinc desde `UNIFIED_EXPENSE_CATEGORIES` del servidor.

---

## 4. Vistas Base Enriquecidas

### v_booking_enriched
Vista sobre `bookings UNION ALL bookings_ledger` con todas las dimensiones JOIN.
```
booking_id, source_table, booking_date (DATE), payment_date, fecha_servicio
boat_id, boat_name, canal, channel_type, customer_name, sold_by_name
total_amount, base_price, discount_amount, discount_pct
payment_method, duration_hours, num_guests, status
-- Campos calculados:
neto_vendido, diff_vs_tarifa, diff_pct_vs_tarifa, clasificacion_precio
semana (DATE_TRUNC week), mes (DATE_TRUNC month)
```

### v_transaction_enriched
Vista sobre `transactions` JOIN `chart_of_accounts` + JOIN `bookings` via `booking_id`.
```
tx_id, transaction_date, type, amount, account_code, account_name, account_type
category_key, booking_id, boat_id, platform, description
-- Campos calculados:
es_ingreso_booking, es_gasto_operativo, semana, mes
```

### v_expense_enriched
Vista sobre `boat_expenses` UNION ALL `transactions WHERE type='expense'` UNION ALL `captain_payments` UNION ALL `stew_payments` UNION ALL `boat_fuel_log`.
```
expense_id, source_table, expense_date, boat_id, category, subcategory
amount, vendor, payment_method, description
-- Campos calculados: semana, mes
```
**Supuesto documentado**: si un gasto aparece en `boat_expenses` y también como `transaction`, la versión de `transactions` tiene prioridad (campo `synced_to_accounting=1` en boat_expenses indica que ya fue contabilizado, evitar doble conteo).

### v_reconciliation
Vista para RPT-A1.
```
booking_id, fecha_servicio, payment_date, fecha_banco
barco, canal, customer_name, sold_by_name, payment_method
monto_bruto, descuento, neto_vendido
monto_cobrado, monto_banco, deposito_garantia
diff_vendido_cobrado, diff_cobrado_depositado
status_booking, status_ar, status_banco, alerta
```

### v_price_variance
Vista para RPT-B1/B3/B5/B6.
```
booking_id, booking_date, barco, canal, duration_hours
precio_vendido, precio_base_lista, diff_abs, diff_pct
clasificacion (normal/ligeramente_bajo/significativamente_bajo/sobre_tarifa/sin_referencia)
z_score_90d (ventana móvil calculada via window function)
semana, mes
```

### v_boat_daily
Agrega todas las métricas por barco × día (input para fact tables materializadas).
```
fecha, boat_id, boat_name
count_bookings, count_completados, horas_operadas
gross_revenue, discount_amount, net_revenue
total_expenses_directo, crew_cost, fuel_cost, mant_cost
gross_margin, margin_pct, RevPAB
utilization_rate
```

---

## 5. Fact Tables Materializadas

### mv_fact_daily_boat
**Grain**: barco × día
**Refresh**: cada hora via `pg_cron` o job de Node.js
**Estrategia**: REFRESH MATERIALIZED VIEW CONCURRENTLY (no bloquea reads)

Columnas: todas las de `v_boat_daily` + índices en (fecha, boat_id).

### mv_fact_weekly_boat
**Grain**: barco × semana (ISO week)
**Refresh**: nocturno 02:00 UTC
**Derivado de**: `mv_fact_daily_boat` agregado

Columnas añadidas: `WoW_pct` para revenue, expenses, margin. `rolling_4w_avg`.

### mv_fact_monthly_boat
**Grain**: barco × mes
**Refresh**: primer día del mes (automático) + endpoint `/api/nbic/admin/refresh-monthly`
**Derivado de**: `mv_fact_weekly_boat` agregado + recalculo desde transacciones para exactitud

Columnas añadidas: `MoM_pct`, `YoY_pct`, `contribution_margin`, `RevPAB`, `utilization_rate_mensual`.

### mv_executive_kpis
**Grain**: empresa × período actual (hoy, semana, mes, trimestre)
**Refresh**: cada 15 minutos
**Contenido**: todos los KPIs clave con deltas WoW, MoM y estado de alertas críticas activas.

---

## 6. Estrategia de Refresh (sin pg_cron disponible)

Como Replit/Neon no garantiza pg_cron, los refreshes se implementan via **scheduled jobs en Node.js** usando el mismo patrón de los scheduled tasks existentes en server.js:

| Job | Frecuencia | Hora | Pool | Bloqueo |
|-----|-----------|------|------|---------|
| `refresh_mv_executive_kpis` | Cada 15 min | Continuo | analytics | CONCURRENT (no bloquea) |
| `refresh_mv_fact_daily_boat` | Cada hora | :00 | analytics | CONCURRENT |
| `refresh_mv_fact_weekly_boat` | Diario | 02:00 UTC | analytics | CONCURRENT |
| `refresh_mv_fact_monthly_boat` | Mensual | Día 1 02:30 UTC | analytics | FULL REFRESH |
| `evaluate_alert_rules` | Cada hora | :05 | analytics | INSERT only |

**Alternativa pg_cron** (si disponible en Neon):
```sql
SELECT cron.schedule('refresh-executive', '*/15 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_executive_kpis');
```

---

## 7. Endpoints Completos

### Prefijo: `/api/nbic/`
### Middleware universal: `isAuthenticated` + `nbicLogger` (user, filters, latency)
### Caché: `NodeCache` con TTL configurable

| Endpoint | Método | TTL | Descripción |
|----------|--------|-----|-------------|
| `/catalog` | GET | 24h | Lista de 27 reportes con metadata |
| `/executive/kpis` | GET | 15m | KPIs ejecutivos + deltas |
| `/executive/alerts` | GET | 5m | Alertas activas del período |
| `/admin/refresh` | POST | — | Trigger manual de refresh (auth only) |
| `/revenue/reconciliation` | GET | 1h | RPT-A1 |
| `/revenue/aging` | GET | 1h | RPT-A2 |
| `/revenue/payment-flow` | GET | 1h | RPT-A3 |
| `/revenue/pending-deposits` | GET | 30m | RPT-A4 |
| `/revenue/by-dimension` | GET | 1h | RPT-A5 |
| `/revenue/cash-days` | GET | 1h | RPT-A6 |
| `/pricing/variance` | GET | 1h | RPT-B1 |
| `/pricing/weekly` | GET | 1h | RPT-B2 |
| `/pricing/outliers` | GET | 1h | RPT-B3 |
| `/pricing/avg-ticket` | GET | 1h | RPT-B4 |
| `/pricing/discount-analysis` | GET | 1h | RPT-B5 |
| `/pricing/leakage-waterfall` | GET | 1h | RPT-B6 |
| `/expenses/by-boat` | GET | 1h | RPT-C1 |
| `/expenses/by-category` | GET | 30m | RPT-C2 |
| `/expenses/period` | GET | 1h | RPT-C3 |
| `/expenses/top-suppliers` | GET | 2h | RPT-C4 |
| `/expenses/anomalies` | GET | 1h | RPT-C5 |
| `/expenses/breakeven` | GET | 2h | RPT-C6 |
| `/profitability/by-boat` | GET | 1h | RPT-D1 |
| `/profitability/margin-trend` | GET | 2h | RPT-D2 |
| `/profitability/by-channel` | GET | 1h | RPT-D3 |
| `/profitability/revpab` | GET | 1h | RPT-D4 |
| `/profitability/pnl` | GET | 2h | RPT-D5 |
| `/compare/boats` | GET | 1h | RPT-E1 |
| `/compare/periods` | GET | 1h | RPT-E2 |
| `/compare/seasonality` | GET | 6h | RPT-E3 |
| `/exports/csv` | POST | — | Export CSV genérico |
| `/exports/board-report` | POST | — | RPT-F3 PDF |

---

## 8. JSON Estándar NBIC

Todos los endpoints devuelven exactamente este formato:

```json
{
  "meta": {
    "report_code": "RPT-A1",
    "report_name": "Conciliación de Ingresos",
    "generated_at": "2026-04-20T14:00:00Z",
    "data_freshness": "2026-04-20T13:45:00Z",
    "filters_applied": {
      "date_from": "2026-04-01",
      "date_to": "2026-04-20",
      "boat_ids": [],
      "channel_ids": [],
      "granularity": "day"
    },
    "completeness_score": 0.42,
    "warnings": [
      "6 bookings sin boat_id asignado — excluidos de análisis por barco",
      "bank_statements sin datos — columna 'deposited' muestra NULL"
    ],
    "row_count": 6,
    "execution_ms": 87
  },
  "kpis": [
    {
      "code": "gross_revenue",
      "label": "Ingresos Brutos",
      "value": 6025.00,
      "unit": "USD",
      "delta_wow_pct": null,
      "delta_mom_pct": null,
      "trend": "insufficient_data",
      "alert": null
    }
  ],
  "series": [
    {
      "label": "Ingresos",
      "data": [
        { "x": "2026-04-01", "y": 1521.00 }
      ]
    }
  ],
  "table": {
    "columns": [
      { "key": "booking_id", "label": "Booking", "type": "text", "drillable": true },
      { "key": "total_amount", "label": "Monto", "type": "currency" }
    ],
    "rows": []
  },
  "alerts": []
}
```

**Reglas:**
- `completeness_score`: 0.0–1.0, calculado como `(campos_no_nulos / campos_esperados)` de la muestra
- `warnings[]`: mensajes no fatales sobre calidad del dato o campos faltantes
- `delta_wow_pct`/`delta_mom_pct`: `null` si datos insuficientes (no string "N/A")
- `drillable: true` en columnas: click envía GET al mismo endpoint con filtro más específico
- Errores: status HTTP 4xx/5xx con `{ "error": "...", "code": "NBIC_XXX" }`

---

## 9. Supuestos de Negocio Documentados

| ID | Supuesto | Fuente |
|----|----------|--------|
| SUP-01 | Temporada alta = Diciembre–Abril | Basado en zona caribeña |
| SUP-02 | Medio día = ≤ 4 horas; día completo = > 4 horas | Política interna inferida de platform_pricing_policies |
| SUP-03 | Precio "normal" = ≥ 95% del precio de lista | Umbral configurable, default -15% |
| SUP-04 | CDO normal = ≤ 7 días (booking date → payment date) | ALT-07 |
| SUP-05 | Costo variable de crew = captain_payments.amount / booking_hours | Sin tarifa estandarizada en DB |
| SUP-06 | RevPAB = revenue / días calendarios del período por barco | No ajusta por disponibilidad real si availability_blocks vacío |
| SUP-07 | Doble conteo prevenido: si boat_expenses.synced_to_accounting=1, usar transactions | Regla de prioridad implementada en v_expense_enriched |
| SUP-08 | Descuento = base_price - total_amount cuando base_price > total_amount; si base_price NULL, descuento = 0 | No inferible de datos históricos |
| SUP-09 | Leakage waterfall: potencial = SUM(base_price * booked_hours); si NULL usa total_amount como proxy | |
| SUP-10 | Z-score requiere ≥ 30 observaciones por barco+canal para ser confiable | Estadística básica |
