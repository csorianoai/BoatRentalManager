# NBIC — Catálogo de 27 Reportes
**Nadaki Business Intelligence Center**
Versión: 1.0 | Fecha: 2026-04-20

---

## Leyenda de niveles de completitud

| Símbolo | Significado |
|---------|-------------|
| ✅ Completo | Buildable hoy con datos actuales |
| 🟡 Parcial | Buildable pero con datos incompletos (boat_id NULL, etc.) |
| 🔴 Bloqueado | Requiere datos que no existen aún |

---

## DOMINIO A — Revenue (6 reportes)

### RPT-A1 — Conciliación de Ingresos
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-A1 |
| **Nombre** | Conciliación de Ingresos |
| **Dominio** | Revenue |
| **Nivel** | Operacional + Gerencial |
| **Grain** | Un registro por booking |
| **Fuente** | `bookings` + `booking_receivables` + `bank_statements` + `transactions` |
| **Métricas** | `gross_revenue`, `collected`, `deposited`, `revenue_leakage`, `collection_rate`, `deposit_reconciliation_rate` |
| **Visualización** | Tabla con semáforo por fila + KPI cards + gráfico waterfall |
| **Filtros** | date_from/to (por booking_date / payment_date / statement_date), boat_ids, channel_ids, payment_methods, status, solo_alertas |
| **Drill-down** | Click en fila → modal con todas las transacciones y bank_statements vinculados al booking |
| **Completeness esperado** | 0.40 hoy (6 bookings sin boat_id, sin payment_date, sin bank_statements) |
| **Estado** | 🟡 Parcial — bloqueado por: `bookings.boat_id=NULL`, `payment_date` no capturado, `bank_statements` vacíos |
| **Columnas de tabla** | booking_id, fecha_servicio, fecha_cobro, fecha_banco, barco, canal, cliente, vendedor, metodo_pago, monto_bruto, descuento, neto_vendido, cobrado, deposito_banco, diff_vendido_cobrado, diff_cobrado_depositado, alerta |

---

### RPT-A2 — Aging de Cuentas por Cobrar
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-A2 |
| **Nombre** | Aging de Cuentas por Cobrar |
| **Dominio** | Revenue |
| **Nivel** | Operacional |
| **Grain** | Un registro por AR pendiente |
| **Fuente** | `booking_receivables` + `booking_deposits` + `bookings_ledger` |
| **Métricas** | `total_pending`, `aging_0_7`, `aging_8_15`, `aging_16_30`, `aging_31_60`, `aging_60_plus`, `count_overdue` |
| **Visualización** | Tabla de aging + stacked bar chart por bucket |
| **Filtros** | date_from/to (por due_date), boat_ids, party_type (customer/broker), status |
| **Drill-down** | Click en bucket → lista de ARs individuales con cliente, monto, días vencida |
| **Completeness esperado** | 0.10 hoy (booking_receivables vacío) |
| **Estado** | 🔴 Bloqueado por: `booking_receivables` vacío |
| **Columnas de tabla** | ar_id, booking_id, cliente, tipo_parte, monto, fecha_vencimiento, dias_vencida, bucket, status |

---

### RPT-A3 — Flujo por Método de Pago
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-A3 |
| **Nombre** | Flujo por Método de Pago |
| **Dominio** | Revenue |
| **Nivel** | Gerencial |
| **Grain** | Agregado por método de pago × día/semana/mes |
| **Fuente** | `bookings` + `bookings_ledger` + `transactions` |
| **Métricas** | `revenue_por_metodo`, `count_por_metodo`, `pct_distribucion`, `avg_ticket_por_metodo` |
| **Visualización** | Pie chart + time series por método + tabla comparativa |
| **Filtros** | date_from/to, boat_ids, granularity (day/week/month), payment_methods |
| **Drill-down** | Click en método → lista de bookings individuales de ese método |
| **Completeness esperado** | 0.05 hoy (payment_method NULL en los 6 bookings actuales) |
| **Estado** | 🔴 Bloqueado por: `payment_method` no capturado históricamente — depende de datos nuevos |

---

### RPT-A4 — Depósitos Pendientes de Aplicar
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-A4 |
| **Nombre** | Depósitos Pendientes de Aplicar |
| **Dominio** | Revenue |
| **Nivel** | Operacional |
| **Grain** | Un registro por depósito en status='pending' |
| **Fuente** | `booking_deposits` + `bookings_ledger` + `boats` |
| **Métricas** | `total_pending_amount`, `count_pending`, `dias_promedio_pendiente`, `riesgo_caducidad` |
| **Visualización** | Tabla + KPI card "Total en depósitos" + alerta para pendientes > 48h |
| **Filtros** | date_from/to (por deposit_date), boat_ids, booking_source, dias_pendiente |
| **Drill-down** | Click → modal con detalle del depósito, cliente, barco, AR vinculada |
| **Completeness esperado** | 0.10 hoy (booking_deposits vacío) |
| **Estado** | 🔴 Bloqueado por: `booking_deposits` vacío |

---

### RPT-A5 — Ingresos por Dimensión
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-A5 |
| **Nombre** | Ingresos por Dimensión |
| **Dominio** | Revenue |
| **Nivel** | Gerencial + Estratégico |
| **Grain** | Agregado por dimensión × período |
| **Fuente** | `mv_fact_daily_boat` (materializado) |
| **Métricas** | `gross_revenue`, `net_revenue`, `count_bookings`, `avg_ticket` desagregados por barco / canal / método de pago / vendedor |
| **Visualización** | Tabla pivot + bar chart apilado + treemap |
| **Filtros** | date_from/to, granularity, dimension_primary (barco/canal/vendedor/metodo_pago), dimension_secondary |
| **Drill-down** | Click en celda → bookings individuales de esa dimensión × período |
| **Completeness esperado** | 0.30 hoy (bookings sin boat_id ni payment_method dificultan dimensiones) |
| **Estado** | 🟡 Parcial — bloqueado por: `boat_id` y `payment_method` NULL histórico |

---

### RPT-A6 — Cash Days Outstanding
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-A6 |
| **Nombre** | Cash Days Outstanding (CDO) |
| **Dominio** | Revenue |
| **Nivel** | Gerencial |
| **Grain** | Un registro por booking completado |
| **Fuente** | `bookings` + `booking_receivables` + `bank_statements` |
| **Métricas** | `dias_booking_to_payment`, `dias_payment_to_bank`, `dias_totales_outstanding`, `avg_cdo`, `median_cdo` |
| **Visualización** | Histograma de distribución CDO + línea de tendencia + tabla |
| **Filtros** | date_from/to, boat_ids, channel_ids, payment_methods |
| **Drill-down** | Click en bucket de días → bookings individuales |
| **Completeness esperado** | 0.10 hoy (payment_date y bank_statements sin datos) |
| **Estado** | 🔴 Bloqueado por: `payment_date` no capturado, `bank_statements` vacíos |

---

## DOMINIO B — Pricing (6 reportes)

### RPT-B1 — Análisis de Precios por Barco
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-B1 |
| **Nombre** | Análisis de Precios por Barco |
| **Dominio** | Pricing |
| **Nivel** | Operacional + Gerencial |
| **Grain** | Un registro por booking |
| **Fuente** | `bookings` + `platform_pricing_policies` + `boats` |
| **Métricas** | `precio_vendido`, `precio_base_lista`, `diferencia_abs`, `diferencia_pct`, `clasificacion_alerta` |
| **Visualización** | Tabla con semáforo + scatter plot precio vs tarifa + KPI cards |
| **Filtros** | date_from/to, boat_ids, channel_ids, umbral_alerta_pct (configurable, default -15%), solo_alertas |
| **Drill-down** | Click en booking → detalle completo: cliente, duración, vendedor, tarifa base, descuento aplicado |
| **Completeness esperado** | 0.15 hoy (6 bookings sin boat_id, pricing policies con boat_id inválido) |
| **Estado** | 🔴 Bloqueado por: `bookings.boat_id=NULL`, `platform_pricing_policies` con boat_id inexistente |

---

### RPT-B2 — Variación de Precios Semanal
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-B2 |
| **Nombre** | Variación de Precios Semanal |
| **Dominio** | Pricing |
| **Nivel** | Gerencial |
| **Grain** | Agregado por barco × semana |
| **Fuente** | `mv_fact_weekly_boat` |
| **Métricas** | `avg_ticket`, `min_precio`, `max_precio`, `median_precio`, `stddev_precio`, `WoW_pct` |
| **Visualización** | Heatmap semana × barco + líneas de tendencia por barco |
| **Filtros** | date_from/to (semanas), boat_ids, channel_ids |
| **Drill-down** | Click en celda semana/barco → todos los bookings de esa semana para ese barco |
| **Completeness esperado** | 0.20 hoy (necesita boat_id y al menos 4 semanas de datos) |
| **Estado** | 🟡 Parcial — bloqueado por: `boat_id=NULL`, insuficiente historia temporal |

---

### RPT-B3 — Outliers de Precio (Z-Score)
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-B3 |
| **Nombre** | Outliers de Precio (Z-Score 90 días) |
| **Dominio** | Pricing |
| **Nivel** | Operacional |
| **Grain** | Un registro por booking con z-score > 2 |
| **Fuente** | `bookings` + ventana móvil 90 días |
| **Métricas** | `precio_vendido`, `media_90d`, `stddev_90d`, `z_score`, `clasificacion` |
| **Fórmula** | `z_score = (precio - AVG(precio últimos 90d por barco+canal)) / STDDEV(precio últimos 90d)` |
| **Visualización** | Tabla de outliers + box plot por barco |
| **Filtros** | date_from/to, boat_ids, channel_ids, z_score_minimo (default 2) |
| **Drill-down** | Click en outlier → contexto: los 10 bookings más recientes del mismo barco/canal |
| **Completeness esperado** | 0.10 hoy (insuficientes datos para ventana de 90 días) |
| **Estado** | 🔴 Bloqueado por: < 30 bookings en historia (mínimo necesario: 30 por barco/canal para Z-score confiable) |

---

### RPT-B4 — Ticket Promedio
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-B4 |
| **Nombre** | Ticket Promedio |
| **Dominio** | Pricing |
| **Nivel** | Gerencial + Estratégico |
| **Grain** | Agregado por barco × período |
| **Fuente** | `mv_fact_daily_boat` |
| **Métricas** | `avg_ticket`, `median_ticket`, `avg_ticket_half_day`, `avg_ticket_full_day`, `avg_ticket_por_hora`, `MoM_pct`, `YoY_pct` |
| **Visualización** | Line chart tendencia + tabla por barco × período |
| **Filtros** | date_from/to, granularity (week/month), boat_ids, channel_ids, duracion (half_day/full_day/all) |
| **Drill-down** | Click en período → bookings individuales de ese período |
| **Completeness esperado** | 0.30 hoy (datos existentes aunque sin boat_id) |
| **Estado** | 🟡 Parcial — bloqueado por: `boat_id=NULL` impide desglose por barco |

---

### RPT-B5 — Análisis de Descuentos
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-B5 |
| **Nombre** | Análisis de Descuentos |
| **Dominio** | Pricing |
| **Nivel** | Operacional + Gerencial |
| **Grain** | Un registro por booking con descuento > 0 |
| **Fuente** | `bookings` + `bookings_ledger` |
| **Métricas** | `avg_discount_pct`, `total_discount_abs`, `count_con_descuento`, `pct_bookings_con_descuento`, `mayor_descuento_vendedor` |
| **Visualización** | Tabla de descuentos + bar chart por vendedor + pie chart distribución |
| **Filtros** | date_from/to, boat_ids, channel_ids, sold_by, descuento_minimo_pct |
| **Drill-down** | Click en vendedor → sus bookings con descuento, montos, clientes |
| **Completeness esperado** | 0.05 hoy (discount_amount=0 en todos los bookings, sin datos de vendedor) |
| **Estado** | 🔴 Bloqueado por: `base_price` y `discount_amount` sin datos históricos |

---

### RPT-B6 — Revenue Leakage Waterfall
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-B6 |
| **Nombre** | Revenue Leakage Waterfall |
| **Dominio** | Pricing |
| **Nivel** | Estratégico |
| **Grain** | Período completo (mes / trimestre) |
| **Fuente** | `mv_fact_monthly_boat` + `bookings` + `booking_receivables` + `bank_statements` |
| **Métricas** | `revenue_potencial_tarifa`, `menos_descuentos`, `menos_cancelaciones`, `menos_cobro_parcial`, `menos_no_depositado`, `revenue_real_neto` |
| **Fórmula** | `Potencial → Vendido → Cobrado → Depositado` con cada brecha como "leakage" |
| **Visualización** | Waterfall chart + tabla de brechas con % |
| **Filtros** | date_from/to (por mes/trimestre), boat_ids, channel_ids |
| **Drill-down** | Click en barra de leakage → transacciones que componen esa brecha |
| **Completeness esperado** | 0.15 hoy (sin base_price ni bank_statements) |
| **Estado** | 🔴 Bloqueado por: `base_price` sin datos, `bank_statements` vacíos |

---

## DOMINIO C — Expenses (6 reportes)

### RPT-C1 — Gastos por Barco
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-C1 |
| **Nombre** | Gastos por Barco |
| **Dominio** | Expenses |
| **Nivel** | Operacional + Gerencial |
| **Grain** | Agregado por barco × período |
| **Fuente** | `boat_expenses` + `captain_payments` + `stew_payments` + `boat_fuel_log` + `transactions` (account_type='expense') |
| **Métricas** | `total_expenses`, `mant_mecanico`, `combustible`, `crew_cost`, `otros`, `gasto_por_hora_operacion` |
| **Visualización** | Stacked bar chart por barco + tabla detallada |
| **Filtros** | date_from/to, boat_ids, category (mant/fuel/crew/otros) |
| **Drill-down** | Click en categoría → transacciones individuales |
| **Completeness esperado** | 0.55 hoy (boat_expenses tiene datos; captain/stew vacíos) |
| **Estado** | 🟡 Parcial — bloqueado por: `captain_payments` y `stew_payments` sin datos |

---

### RPT-C2 — Gastos por Categoría
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-C2 |
| **Nombre** | Gastos por Categoría |
| **Dominio** | Expenses |
| **Nivel** | Gerencial |
| **Grain** | Agregado por categoría contable × período |
| **Fuente** | `transactions` JOIN `chart_of_accounts` (account_type='expense') |
| **Métricas** | `total_por_categoria`, `pct_del_total`, `WoW_pct`, `MoM_pct` |
| **Visualización** | Bar chart horizontal + pie chart + tabla |
| **Filtros** | date_from/to, granularity, boat_ids, category_keys (UNIFIED_EXPENSE_CATEGORIES) |
| **Drill-down** | Click en categoría → transacciones individuales (ya funcional en accounting.html) |
| **Completeness esperado** | 0.70 hoy (ya existe en accounting.html, mejorar con NBIC format) |
| **Estado** | ✅ Buildable — usa endpoint existente `/api/accounting/expenses/analysis` |

---

### RPT-C3 — Evolución de Gastos Semanal vs Mensual
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-C3 |
| **Nombre** | Evolución de Gastos Semanal vs Mensual |
| **Dominio** | Expenses |
| **Nivel** | Gerencial |
| **Grain** | Agregado por período |
| **Fuente** | `mv_fact_weekly_boat` + `mv_fact_monthly_boat` |
| **Métricas** | `total_gastos`, `WoW_pct`, `MoM_pct`, `rolling_4w_avg` |
| **Visualización** | Dual time series (semanal vs mensual) + área bajo la curva |
| **Filtros** | date_from/to, granularity, boat_ids, categories |
| **Drill-down** | Click en semana/mes → detalle de transacciones del período |
| **Completeness esperado** | 0.60 hoy |
| **Estado** | 🟡 Parcial — necesita fact tables materializadas |

---

### RPT-C4 — Top Proveedores
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-C4 |
| **Nombre** | Top Proveedores por Gasto |
| **Dominio** | Expenses |
| **Nivel** | Operacional |
| **Grain** | Un registro por proveedor |
| **Fuente** | `boat_expenses.vendor` + `transactions.description` |
| **Métricas** | `total_pagado`, `count_transacciones`, `avg_ticket`, `pct_del_total`, `ultima_compra` |
| **Visualización** | Tabla top 20 + bar chart horizontal |
| **Filtros** | date_from/to, boat_ids, categories, top_n |
| **Drill-down** | Click en proveedor → todas sus transacciones |
| **Completeness esperado** | 0.50 hoy (boat_expenses tiene vendor; transactions.description heurístico) |
| **Estado** | 🟡 Parcial — `vendor` solo en boat_expenses, no en todas las transactions |

---

### RPT-C5 — Anomalías de Gasto (2σ)
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-C5 |
| **Nombre** | Anomalías de Gasto (2 desviaciones estándar) |
| **Dominio** | Expenses |
| **Nivel** | Operacional |
| **Grain** | Un registro por transacción anómala |
| **Fuente** | `transactions` + ventana histórica rolling |
| **Métricas** | `amount`, `media_categoria`, `stddev_categoria`, `z_score`, `clasificacion` |
| **Fórmula** | `z = (amount - AVG(categoria_últimos_90d)) / STDDEV(categoria_últimos_90d)` |
| **Visualización** | Tabla de anomalías + box plot por categoría |
| **Filtros** | date_from/to, boat_ids, categories, z_minimo (default 2) |
| **Drill-down** | Click en transacción → contexto: historial de la categoría |
| **Completeness esperado** | 0.40 hoy (pocas transacciones → stddev no confiable) |
| **Estado** | 🟡 Parcial — mínimo 20 transacciones por categoría para confiabilidad estadística |

---

### RPT-C6 — Break-even por Barco
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-C6 |
| **Nombre** | Break-even por Barco |
| **Dominio** | Expenses |
| **Nivel** | Estratégico |
| **Grain** | Un registro por barco × período |
| **Fuente** | `mv_fact_monthly_boat` |
| **Métricas** | `costos_fijos_estimados`, `costo_variable_por_hora`, `precio_breakeven`, `bookings_breakeven`, `horas_breakeven` |
| **Supuestos documentados** | Costos fijos = suma mantenimiento + seguro (si existe) / mes; costo variable = combustible_por_hora + crew_por_hora |
| **Visualización** | Gráfico break-even (costo vs ingreso) + tabla de sensibilidad de precio |
| **Filtros** | date_from/to (mes), boat_ids |
| **Completeness esperado** | 0.25 hoy (sin datos de crew ni fuel por barco) |
| **Estado** | 🔴 Bloqueado por: `captain_payments` vacío, `boat_fuel_log` sin datos vinculados a bookings |

---

## DOMINIO D — Profitability (5 reportes)

### RPT-D1 — Rentabilidad por Barco
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-D1 |
| **Nombre** | Rentabilidad por Barco |
| **Dominio** | Profitability |
| **Nivel** | Gerencial + Estratégico |
| **Grain** | Agregado por barco × período |
| **Fuente** | `mv_fact_monthly_boat` |
| **Métricas** | `gross_revenue`, `total_expenses`, `gross_margin`, `margin_pct`, `contribution_margin`, `RevPAB` |
| **Fórmula RevPAB** | `Revenue Per Available Boat-Day = gross_revenue / dias_disponibles_período` |
| **Visualización** | Tabla por barco + grouped bar chart ingresos/gastos/margen |
| **Filtros** | date_from/to, boat_ids, granularity |
| **Drill-down** | Click en barco → desglose ingresos y gastos del barco con detalle |
| **Completeness esperado** | 0.35 hoy (ingresos parciales, gastos sin crew) |
| **Estado** | 🟡 Parcial — bloqueado por: `bookings.boat_id=NULL`, crew sin datos |

---

### RPT-D2 — Evolución de Margen
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-D2 |
| **Nombre** | Evolución de Margen |
| **Dominio** | Profitability |
| **Nivel** | Estratégico |
| **Grain** | Agregado por período |
| **Fuente** | `mv_fact_monthly_boat` |
| **Métricas** | `margin_pct` por mes, `rolling_3m_avg`, `YoY_pct`, `tendencia` (regresión lineal) |
| **Visualización** | Line chart margen % con banda de confianza |
| **Filtros** | date_from/to, boat_ids |
| **Completeness esperado** | 0.25 hoy (insuficiente historia temporal) |
| **Estado** | 🟡 Parcial — necesita ≥ 6 meses de datos |

---

### RPT-D3 — Margen por Canal
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-D3 |
| **Nombre** | Margen por Canal de Venta |
| **Dominio** | Profitability |
| **Nivel** | Estratégico |
| **Grain** | Agregado por canal × período |
| **Fuente** | `mv_fact_monthly_boat` + `commission_rules` |
| **Métricas** | `gross_revenue_canal`, `comision_canal`, `net_revenue_canal`, `margin_pct_canal` |
| **Visualización** | Grouped bar chart por canal + tabla |
| **Filtros** | date_from/to, boat_ids, channel_ids |
| **Drill-down** | Click en canal → bookings del canal |
| **Completeness esperado** | 0.40 hoy (datos de canal existen en bookings.platform) |
| **Estado** | 🟡 Parcial — comisiones reales no vinculadas sistemáticamente |

---

### RPT-D4 — RevPAB y Utilización
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-D4 |
| **Nombre** | RevPAB y Tasa de Utilización |
| **Dominio** | Profitability |
| **Nivel** | Estratégico |
| **Grain** | Agregado por barco × semana |
| **Fuente** | `mv_fact_weekly_boat` + `availability_blocks` |
| **Métricas** | `RevPAB`, `utilization_rate`, `dias_operados`, `dias_disponibles`, `dias_bloqueados` |
| **Fórmula utilization** | `bookings_completados / (dias_en_período - dias_bloqueados)` |
| **Visualización** | Dual axis: RevPAB (bar) + utilization_rate (line) |
| **Filtros** | date_from/to, boat_ids, granularity |
| **Completeness esperado** | 0.25 hoy (boat_id NULL, sin availability_blocks suficientes) |
| **Estado** | 🔴 Bloqueado por: `bookings.boat_id=NULL`, sin sistema de disponibilidad poblado |

---

### RPT-D5 — P&L por Barco
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-D5 |
| **Nombre** | Estado de Resultados por Barco |
| **Dominio** | Profitability |
| **Nivel** | Estratégico |
| **Grain** | Agregado por barco × mes |
| **Fuente** | `mv_fact_monthly_boat` |
| **Secciones** | Ingresos: bruto / descuentos / neto. Gastos: mantenimiento / combustible / crew / otros. Resultado: margen bruto / margen operativo / EBITDA |
| **Visualización** | Tabla P&L estilo financiero + KPI cards |
| **Filtros** | date_from/to (mes), boat_ids |
| **Drill-down** | Click en línea → transacciones componentes |
| **Completeness esperado** | 0.30 hoy (datos parciales de ingresos y gastos por barco) |
| **Estado** | 🟡 Parcial — bloqueado por: boat_id NULL, crew sin datos |

---

## DOMINIO E — Compare (3 reportes)

### RPT-E1 — Barco vs Barco
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-E1 |
| **Nombre** | Comparativa Barco vs Barco |
| **Dominio** | Compare |
| **Nivel** | Estratégico |
| **Grain** | Agregado por barco × período |
| **Fuente** | `mv_fact_monthly_boat` |
| **Métricas** | `revenue`, `expenses`, `margin`, `RevPAB`, `utilization`, `avg_ticket`, `total_bookings` — todos comparables entre barcos |
| **Visualización** | Radar chart (multidimensional) + tabla comparativa con highlights |
| **Filtros** | date_from/to, boat_ids (selección múltiple), granularity |
| **Completeness esperado** | 0.25 hoy |
| **Estado** | 🟡 Parcial — requiere ≥ 2 barcos con boat_id asignado |

---

### RPT-E2 — Período vs Período
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-E2 |
| **Nombre** | Período vs Período |
| **Dominio** | Compare |
| **Nivel** | Gerencial + Estratégico |
| **Grain** | Agregado por período A y período B |
| **Fuente** | `mv_fact_monthly_boat` |
| **Métricas** | Todas las métricas de revenue + expenses + profitability con delta absoluto y pct entre períodos |
| **Visualización** | Tabla comparativa lado a lado + grouped bar chart |
| **Filtros** | period_a_from/to, period_b_from/to, boat_ids |
| **Completeness esperado** | 0.35 hoy |
| **Estado** | 🟡 Parcial — se puede construir pero con datos limitados |

---

### RPT-E3 — Seasonality Heatmap
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-E3 |
| **Nombre** | Seasonality Heatmap |
| **Dominio** | Compare |
| **Nivel** | Estratégico |
| **Grain** | Día de la semana × semana del año |
| **Fuente** | `bookings` + `dim_date` |
| **Métricas** | `count_bookings`, `avg_revenue`, `avg_ticket` por celda de heatmap |
| **Visualización** | Heatmap 52×7 (semanas × días de la semana) |
| **Filtros** | year, boat_ids |
| **Completeness esperado** | 0.10 hoy (insuficientes datos temporales) |
| **Estado** | 🔴 Bloqueado por: < 30 días de datos operativos con booking_date poblado |

---

## DOMINIO F — Executive (3 reportes)

### RPT-F1 — Executive Dashboard
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-F1 |
| **Nombre** | Executive Dashboard |
| **Dominio** | Executive |
| **Nivel** | Estratégico |
| **Grain** | KPIs del período actual |
| **Fuente** | `mv_executive_kpis` (refresh cada 15 min) |
| **Métricas** | `gross_revenue`, `net_revenue`, `total_expenses`, `gross_margin_pct`, `total_bookings`, `RevPAB`, `collection_rate`, `reconciliation_rate`, `cash_days_outstanding`, todos con `WoW_pct` y `MoM_pct` |
| **Visualización** | KPI cards + mini sparklines + alert feed |
| **Filtros** | date_from/to, boat_ids |
| **Completeness esperado** | 0.50 hoy |
| **Estado** | 🟡 Parcial — muchos KPIs son calculables aunque con datos limitados |

---

### RPT-F2 — Panel de Alertas
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-F2 |
| **Nombre** | Panel de Alertas Activas |
| **Dominio** | Executive |
| **Nivel** | Operacional |
| **Grain** | Un registro por alerta activa |
| **Fuente** | `analytics.alert_events` + `analytics.alert_rules` |
| **Métricas** | `count_critical`, `count_warn`, `count_info`, feed de alertas con timestamp y contexto |
| **Visualización** | Alert feed con severity badges + counts + drill-down a entidad afectada |
| **Filtros** | severity, status (open/ack/resolved), date_from/to, alert_code |
| **Completeness esperado** | 0.70 hoy (una vez creado el schema analytics) |
| **Estado** | 🟡 Parcial — necesita schema analytics creado |

---

### RPT-F3 — Board Report PDF
| Campo | Detalle |
|-------|---------|
| **Código** | RPT-F3 |
| **Nombre** | Board Report Exportable |
| **Dominio** | Executive |
| **Nivel** | Estratégico |
| **Grain** | Resumen mensual o trimestral |
| **Fuente** | `mv_executive_kpis` + todos los fact tables mensuales |
| **Secciones** | Executive Summary / Revenue Breakdown / Asset Performance / Cost Analysis / Cash Integrity / Pricing Integrity / Alerts Summary / Forward Outlook |
| **Formato** | PDF generado server-side (puppeteer o similar) |
| **Completeness esperado** | 0.35 hoy |
| **Estado** | 🟡 Parcial — requiere fact tables y UI base construida primero |
