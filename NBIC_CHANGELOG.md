# NBIC Changelog

## v1.1.0 — Reconexión a Fuente de Verdad (2026-04-20)

### Contexto
Sprint de consolidación post-lanzamiento. El NBIC v1.0 tenía tres desconexiones críticas con respecto al Centro de Operaciones (fuente de verdad del negocio).

---

### P1 — Corrección de nombres de barcos (boat_type)

**Problema:** Los endpoints que agrupaban por barco usaban `bookings.boat_id` (FK a tabla `boats`, con 0% fill rate). Todos los bookings históricos usan el campo denormalizado `bookings.boat_type` (e.g., "CRANCHI", "SILVER LINNING") para el nombre del barco.

**Corrección:** Cambiar `COALESCE(boat_id, 'Sin asignar')` → `COALESCE(boat_type, boat_id, 'Sin asignar')` en SELECT y GROUP BY de los siguientes endpoints:

| Endpoint | Report | Línea (server.js) |
|----------|--------|-------------------|
| `/api/nbic/pricing/variance` | RPT-B1 | 14228, 14236 |
| `/api/nbic/profitability/by-boat` | RPT-D1 | 14358, 14363 |
| `/api/nbic/compare/boats` | RPT-E1 | 14394, 14400 |
| `/api/nbic/executive/kpis` (tabla reciente) | RPT-F1 | 14042 |

**Resultado:** Los reportes muestran nombres comerciales reales (CRANCHI, SEARAY 500, SILVER LINNING, etc.) en lugar de IDs técnicos o "Sin asignar".

---

### P2 — Dualidad de ingresos: Facturado vs Cobrado

**Problema:** El KPI "Ingresos Brutos" del Dashboard Ejecutivo F1 usaba `SUM(transactions.amount WHERE account_type=revenue)` (efectivo contabilizado). Esto difería del Centro de Operaciones que usa `SUM(bookings.total_amount)` (facturado). El resultado era $0 cuando no había transacciones de ingreso registradas.

**Corrección:** Separar en dos KPIs con definiciones explícitas:

| KPI | Definición | Fuente |
|-----|-----------|--------|
| **Ingresos Brutos** | `SUM(bookings.total_amount WHERE status!=cancelled)` | Facturado · fuente de verdad operativa |
| **Ingresos Cobrados** | `SUM(transactions.amount WHERE account_type=revenue)` | Efectivo registrado en contabilidad |
| **Collection Gap** | Ingresos Brutos − Ingresos Cobrados | Métrica de conciliación |
| **Ingresos Netos** | `SUM(total_amount − discount_amount)` | Facturado menos descuentos |
| **Tasa de Cobro** | Ingresos Cobrados / Ingresos Brutos | % conciliación |

**Resultado:** "Ingresos Brutos" coincide con el Centro de Operaciones al dólar. El "Collection Gap" es la métrica principal de conciliación del NBIC.

---

### P3 — Rango de fechas: "Todo el historial" como default

**Problema:** `nbicDateRange()` usaba el mes actual (MTD) por defecto, mientras que el Centro de Operaciones usa todo el historial. Esto causaba que el NBIC mostrara 0 bookings cuando existían reservas fuera del mes actual.

**Corrección:**
- `nbicDateRange()` convertida a función `async`.
- Default cambiado a `preset=all`: consulta `MIN/MAX(booking_date)` de la tabla `bookings` al vuelo (misma lógica que el endpoint `/api/dashboard-data`).
- Presets conservados: `all`, `mtd`, `ytd`, `last7`, `last30`, `last90`, `last365`, `custom`.
- Filter bar del NBIC: "Todo el historial" como opción y selección por defecto.

**Resultado:** Al abrir el NBIC sin filtros, muestra exactamente el mismo rango histórico que el Centro de Operaciones.

---

### Impacto en completeness scores

| Reporte | Antes | Después |
|---------|-------|---------|
| RPT-B1 Precios por Barco | 0.70 | 0.80 |
| RPT-D1 Rentabilidad por Barco | 0.45 | 0.65 |
| RPT-E1 Comparación Barcos | 0.60 | 0.75 |
| RPT-F1 Dashboard Ejecutivo | 0.72 | 0.85 |

---

### Tablas afectadas

Solo queries modificadas. Cero cambios de schema, cero migraciones, cero riesgo de pérdida de datos.

- `public.bookings` (campo `boat_type` ahora es fuente de nombres de barco en NBIC)
- `public.transactions` (sigue siendo fuente de "Ingresos Cobrados")
- `public.chart_of_accounts` (sin cambio)
