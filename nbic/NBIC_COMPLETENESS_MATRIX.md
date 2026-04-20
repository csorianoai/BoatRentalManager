# NBIC — Matriz de Completitud
**27 reportes × estado actual de datos**
Versión: 1.0 | Fecha: 2026-04-20 | Post-Fase 1

---

## Resumen Ejecutivo

| Categoría | Cantidad |
|-----------|---------|
| ✅ Buildable hoy (≥ 70% completitud) | 1 |
| 🟡 Buildable parcial (10–69%) | 13 |
| 🔴 Bloqueado (< 10%) | 13 |

**Completitud promedio actual del sistema**: **28%**

El principal bloqueador de 20 de los 27 reportes es la combinación de:
1. `bookings.boat_id = NULL` en los 6 bookings existentes
2. `payment_method` sin datos históricos
3. `bank_statements` vacío
4. `captain_payments` / `stew_payments` vacíos
5. `base_price` sin datos (pricing policies con boat_id inválido)

---

## Matriz Completa

| Código | Nombre | % Hoy | Qué lo bloquea | Cuándo se desbloquea |
|--------|--------|-------|----------------|---------------------|
| **RPT-A1** | Conciliación de Ingresos | **40%** | `boat_id=NULL`, `bank_statements` vacío, `payment_date` sin datos | Al capturar: boat_id en bookings, comenzar a importar bank_statements, registrar payment_date |
| **RPT-A2** | Aging de Cuentas por Cobrar | **10%** | `booking_receivables` vacío | Al crear primeras ARs via booking_deposits workflow |
| **RPT-A3** | Flujo por Método de Pago | **5%** | `payment_method` NULL en todos los bookings | Al registrar método de pago en bookings nuevos |
| **RPT-A4** | Depósitos Pendientes | **10%** | `booking_deposits` vacío | Al registrar primer depósito via el módulo de depósitos |
| **RPT-A5** | Ingresos por Dimensión | **30%** | `boat_id=NULL` impide dimensión barco; `payment_method` NULL | Al asignar boat_id a bookings existentes y nuevos |
| **RPT-A6** | Cash Days Outstanding | **10%** | `payment_date` no capturado, `bank_statements` vacío | Al capturar payment_date en bookings y comenzar importación bancaria |
| **RPT-B1** | Análisis de Precios por Barco | **15%** | `boat_id=NULL`, pricing policies con boat_id inválido | Al asignar boat_id a bookings y actualizar policies con IDs reales de flota |
| **RPT-B2** | Variación de Precios Semanal | **20%** | `boat_id=NULL`, insuficiente historia temporal (solo 2 semanas de datos) | Al acumular ≥ 4 semanas con boat_id asignado |
| **RPT-B3** | Outliers de Precio (Z-Score) | **10%** | < 30 bookings por barco+canal (mínimo estadístico) | Al acumular ≥ 30 bookings por combinación barco/canal |
| **RPT-B4** | Ticket Promedio | **35%** | `boat_id=NULL` impide desglose; funciona a nivel empresa | Parcialmente funcional hoy; mejorado al asignar boat_id |
| **RPT-B5** | Análisis de Descuentos | **5%** | `base_price` y `discount_amount` sin datos históricos | Al registrar base_price en bookings nuevos |
| **RPT-B6** | Revenue Leakage Waterfall | **15%** | `base_price` sin datos, `bank_statements` vacío | Al capturar base_price + importar bank_statements |
| **RPT-C1** | Gastos por Barco | **45%** | `captain_payments` y `stew_payments` vacíos; `boat_expenses` tiene datos parciales | Al registrar pagos de crew; ya funciona para mantenimiento |
| **RPT-C2** | Gastos por Categoría | **75%** | Ya funciona via accounting.html; mejorar con NBIC format | **BUILDABLE AHORA** — reutiliza endpoint existente |
| **RPT-C3** | Evolución de Gastos | **55%** | Necesita fact tables materializadas; datos contables disponibles | Al crear analytics schema + fact tables |
| **RPT-C4** | Top Proveedores | **50%** | `vendor` solo en `boat_expenses`; transactions sin vendor | Funcional para boat_expenses; mejorado al agregar vendor a transactions |
| **RPT-C5** | Anomalías de Gasto (2σ) | **30%** | Pocas transacciones por categoría para stddev confiable | Al acumular ≥ 20 transacciones por categoría |
| **RPT-C6** | Break-even por Barco | **20%** | `captain_payments` vacío; sin datos de costo fijo por barco | Al registrar crew + definir daily_cost_estimate en dim_boat |
| **RPT-D1** | Rentabilidad por Barco | **30%** | `boat_id=NULL` en bookings; crew sin datos | Al asignar boat_id + registrar crew payments |
| **RPT-D2** | Evolución de Margen | **20%** | Solo 2 meses de datos; necesita ≥ 6 meses para tendencia | Progresivo — mejora automáticamente con el tiempo |
| **RPT-D3** | Margen por Canal | **40%** | Comisiones reales no vinculadas sistemáticamente | Al poblar commission_payments con comisiones reales |
| **RPT-D4** | RevPAB y Utilización | **20%** | `boat_id=NULL`; `availability_blocks` sin datos suficientes | Al asignar boat_id + registrar disponibilidad |
| **RPT-D5** | P&L por Barco | **25%** | `boat_id=NULL`; crew sin datos; gastos parciales | Al completar todos los flujos operativos con boat_id |
| **RPT-E1** | Barco vs Barco | **20%** | Requiere ≥ 2 barcos con datos completos | Al asignar boat_id a bookings de ≥ 2 barcos |
| **RPT-E2** | Período vs Período | **35%** | Funcional pero con datos limitados; solo 2 meses | Funcional ahora a nivel empresa; mejora con boat_id |
| **RPT-E3** | Seasonality Heatmap | **10%** | < 30 días de datos operativos; heatmap 52×7 requiere historia anual | Progresivo — funcional visualmente desde el mes 1, confiable desde el año 1 |
| **RPT-F1** | Executive Dashboard | **50%** | Muchos KPIs calculables; RevPAB y utilization degradados por boat_id=NULL | Mejora inmediata con analytics schema + fact tables |
| **RPT-F2** | Panel de Alertas | **65%** | Necesita analytics.alert_rules y alert_events creados | Al ejecutar 05_alert_rules.sql |
| **RPT-F3** | Board Report PDF | **30%** | Requiere UI base construida + fact tables | Al completar Pasos 3 + 8 del plan |

---

## Desglose de Bloqueadores

### Bloqueador B-01 — `bookings.boat_id = NULL`
**Afecta**: RPT-A1, A3, A5, B1, B2, B4, C1, D1, D2, D4, D5, E1, E2 (13 reportes)
**Solución**: Asignar `boat_id` a los 6 bookings existentes manualmente; capturar obligatoriamente en formulario de nuevo booking
**Esfuerzo**: 15 minutos de datos + 2h de código (hacer `boat_id` required en POST /api/bookings)

### Bloqueador B-02 — `bank_statements` vacío
**Afecta**: RPT-A1, A6, B6 (3 reportes)
**Solución**: Comenzar importación de extractos bancarios via el módulo de Clasificación Inteligente en accounting.html
**Esfuerzo**: Operacional (subir archivos de banco)

### Bloqueador B-03 — `captain_payments` y `stew_payments` vacíos
**Afecta**: RPT-C1, C6, D1, D4, D5 (5 reportes)
**Solución**: Registrar pagos de crew via el módulo de crew existente
**Esfuerzo**: Operacional

### Bloqueador B-04 — `payment_method` sin capturar
**Afecta**: RPT-A3, A1 parcialmente (2 reportes)
**Solución**: Agregar campo `payment_method` al formulario de creación de booking (código)
**Esfuerzo**: 2h de código

### Bloqueador B-05 — `base_price` sin datos (pricing policies con boat_id inválido)
**Afecta**: RPT-B1, B5, B6, D3 (4 reportes)
**Solución**: (1) Actualizar platform_pricing_policies con boat_id reales de flota; (2) Capturar base_price en nuevo booking
**Esfuerzo**: 30 min de datos + 2h de código

### Bloqueador B-06 — Insuficiente historia temporal
**Afecta**: RPT-B3, D2, E3 (3 reportes)
**Solución**: No tiene solución inmediata — los datos se acumulan con el tiempo
**Esfuerzo**: Progresivo (B3 en ~3 meses; D2 en ~6 meses; E3 en ~12 meses)

### Bloqueador B-07 — Analytics schema no creado aún
**Afecta**: TODOS los reportes que usan fact tables (Pasos 2-7 del plan)
**Solución**: Ejecutar 01_dimensions.sql → 02_views.sql → 03_materialized_views.sql → 04_jobs.sql → 05_alert_rules.sql
**Esfuerzo**: 1-2h con aprobación

---

## Plan de Desbloqueo Progresivo

### Semana 1 (inmediato) → 13 reportes mejoran
1. Ejecutar scripts DDL Fase 2 (analytics schema)
2. Asignar `boat_id` a los 6 bookings existentes
3. Actualizar platform_pricing_policies con boat_id reales
4. Hacer `boat_id` obligatorio en formulario de booking

### Semana 2-4 (operacional)
5. Registrar primeros pagos de crew (captain_payments)
6. Importar primeros extractos bancarios
7. Capturar `payment_method` en bookings nuevos
8. Capturar `base_price` automáticamente en booking según pricing policy

### Mes 2-3 (acumulación)
9. Z-score estadísticamente válido cuando hay ≥ 30 bookings por barco/canal
10. Tendencias de margen comienzan a ser significativas

### Mes 6+ (madurez analítica)
11. Seasonality heatmap confiable
12. YoY comparables
13. Break-even calibrado con datos reales

---

## Criterios de "Reporte Productivo"

Un reporte se considera **productivo** cuando:
- `completeness_score >= 0.70`
- `meta.warnings[]` tiene ≤ 2 avisos
- Al menos 30 filas de datos subyacentes
- Los deltas WoW/MoM están disponibles (al menos 2 períodos)

**Reportes productivos hoy**: RPT-C2 (75%)
**Reportes productivos tras Semana 1**: RPT-C2, F1, C1, A5, D3, E2 (~6 reportes)
**Reportes productivos tras Mes 1**: ~14 de 27
**Reportes productivos tras Mes 6**: ~24 de 27 (los 3 restantes requieren historia de ≥ 12 meses)
