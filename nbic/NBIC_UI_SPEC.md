# NBIC — Especificación de UI
**Nadaki Business Intelligence Center — reports.html**
Versión: 1.0 | Fecha: 2026-04-20

---

## 1. Layout General

```
┌────────────────────────────────────────────────────────────────────┐
│ HEADER GLOBAL (sticky, z-index: 9999)                              │
│ Logo NBIC │ Última actualización │ Refresh manual │ Perfil usuario │
├───────────┬────────────────────────────────────────────────────────┤
│           │ FILTER BAR (sticky bajo header)                        │
│  SIDEBAR  │ [Fecha From] [Fecha To] [Presets▼] [Barcos▼] [Canal▼] │
│  (240px)  │ [Método Pago▼] [Vendedor▼] [Status▼] [Más filtros...]  │
│           ├────────────────────────────────────────────────────────┤
│  Nav      │ CONTENT AREA (scroll)                                  │
│  Groups:  │                                                        │
│           │  [Título del Reporte]                                  │
│  ◆ F1     │  [Completeness Badge: 42%]  [Warnings Collapsibles]   │
│  Executive│                                                        │
│  ─────    │  [KPI Cards Row]                                       │
│  A Revenue│                                                        │
│  B Pricing│  [Charts Row]                                          │
│  C Expens │                                                        │
│  D Profit │  [DataTable con paginación + drill-down]               │
│  ─────    │                                                        │
│  E Compare│  [Export CSV]  [Export PDF]                            │
│  F Execut │                                                        │
│  ─────    │                                                        │
│  🔔 Alerts│                                                        │
│           │                                                        │
└───────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Sidebar

### Grupos de navegación

```html
<!-- Estructura del sidebar -->
<nav id="nbic-sidebar">

  <!-- Sección Executive -->
  <div class="nav-group">
    <span class="nav-group-label">Executive</span>
    <a href="#f1" class="nav-item active">F1 · Dashboard Ejecutivo</a>
    <a href="#f2" class="nav-item">F2 · Panel de Alertas</a>
    <a href="#f3" class="nav-item">F3 · Board Report PDF</a>
  </div>

  <!-- Sección Revenue -->
  <div class="nav-group">
    <span class="nav-group-label">Revenue</span>
    <a href="#a1" class="nav-item">A1 · Conciliación</a>
    <a href="#a2" class="nav-item">A2 · Aging AR</a>
    <a href="#a3" class="nav-item">A3 · Flujo Método Pago</a>
    <a href="#a4" class="nav-item">A4 · Depósitos Pendientes</a>
    <a href="#a5" class="nav-item">A5 · Por Dimensión</a>
    <a href="#a6" class="nav-item">A6 · Cash Days</a>
  </div>

  <!-- Sección Pricing -->
  <div class="nav-group">
    <span class="nav-group-label">Pricing</span>
    <a href="#b1" class="nav-item">B1 · Por Barco</a>
    <a href="#b2" class="nav-item">B2 · Variación Semanal</a>
    <a href="#b3" class="nav-item">B3 · Outliers (Z-Score)</a>
    <a href="#b4" class="nav-item">B4 · Ticket Promedio</a>
    <a href="#b5" class="nav-item">B5 · Descuentos</a>
    <a href="#b6" class="nav-item">B6 · Revenue Leakage</a>
  </div>

  <!-- Sección Expenses -->
  <div class="nav-group">
    <span class="nav-group-label">Gastos</span>
    <a href="#c1" class="nav-item">C1 · Por Barco</a>
    <a href="#c2" class="nav-item">C2 · Por Categoría</a>
    <a href="#c3" class="nav-item">C3 · Evolución</a>
    <a href="#c4" class="nav-item">C4 · Top Proveedores</a>
    <a href="#c5" class="nav-item">C5 · Anomalías</a>
    <a href="#c6" class="nav-item">C6 · Break-even</a>
  </div>

  <!-- Sección Profitability -->
  <div class="nav-group">
    <span class="nav-group-label">Rentabilidad</span>
    <a href="#d1" class="nav-item">D1 · Por Barco</a>
    <a href="#d2" class="nav-item">D2 · Evolución Margen</a>
    <a href="#d3" class="nav-item">D3 · Por Canal</a>
    <a href="#d4" class="nav-item">D4 · RevPAB y Utilización</a>
    <a href="#d5" class="nav-item">D5 · P&amp;L</a>
  </div>

  <!-- Sección Compare -->
  <div class="nav-group">
    <span class="nav-group-label">Comparativas</span>
    <a href="#e1" class="nav-item">E1 · Barco vs Barco</a>
    <a href="#e2" class="nav-item">E2 · Período vs Período</a>
    <a href="#e3" class="nav-item">E3 · Seasonality Heatmap</a>
  </div>

</nav>
```

---

## 3. Filter Bar Global (sticky)

Los filtros persisten en la URL via `URLSearchParams`. Cualquier cambio dispara re-fetch de los endpoints activos.

### Presets de fecha

| Preset | Equivalente |
|--------|------------|
| Hoy | today |
| Ayer | yesterday |
| Últimos 7 días | last_7d |
| Esta semana | this_week |
| Semana pasada | last_week |
| Últimos 30 días | last_30d |
| Este mes | this_month |
| Mes pasado | last_month |
| Este trimestre | this_quarter |
| Este año | this_year |
| Personalizado | custom (activa date pickers) |

### Parámetros URL estándar

```
?date_from=2026-04-01
&date_to=2026-04-20
&preset=this_month
&boat_ids[]=boat_abc&boat_ids[]=boat_xyz
&channel_ids[]=getmyboat&channel_ids[]=airbnb
&payment_methods[]=cash&payment_methods[]=card
&user_ids[]=usr_abc
&status[]=completed&status[]=confirmed
&granularity=day
&only_alerts=false
&with_discount_only=false
&completed_only=false
```

### Filtros avanzados (colapsable)

- Toggle: Solo bookings con alerta
- Toggle: Solo con descuento
- Toggle: Solo completados
- Umbral de alerta de precio: slider -5% a -30% (default -15%)
- Z-score mínimo: input numérico (default 2.0)

---

## 4. Componentes Reutilizables

### KPICard

```javascript
// Parámetros:
// code, label, value, unit ('USD'|'%'|'days'|'count'),
// delta_wow_pct, delta_mom_pct, trend, alert
// severity: null | 'warn' | 'critical'

class KPICard {
    // Muestra: valor principal + badge de delta WoW y MoM
    // Si delta > 0: verde; si delta < 0: rojo; si null: gris "N/D"
    // Si severity = 'critical': borde rojo + icono de alerta
    // Click: abre DrilldownModal con detalle del KPI
}
```

**Variantes**: `KPICard` (estándar), `KPICard--mini` (para grids densos), `KPICard--spark` (con sparkline integrada).

---

### DataTable

```javascript
// Parámetros:
// columns: [{ key, label, type, drillable, format }]
//   type: 'text'|'currency'|'pct'|'date'|'badge'|'alert_badge'
//   drillable: true → celda es clickeable → abre DrilldownModal
// rows: [] de objetos
// pagination: true, pageSize: 25
// sortable: true (click en header)
// searchable: true (búsqueda client-side)
// onRowClick: función → DrilldownModal

class DataTable {
    // Renderiza tabla con:
    // - Formato automático por tipo de columna
    // - Badge de semáforo para columnas tipo 'alert_badge'
    // - Highlight de filas con alerta != 'ok'
    // - Export CSV del contenido actual (respeta filtros)
    // - Paginación con total de filas
}
```

**Estados**: `DataTable--loading` (skeleton), `DataTable--empty` (mensaje + sugerencia de filtros), `DataTable--error`.

---

### TimeSeriesChart

```javascript
// Parámetros:
// series: [{ label, data: [{x: date, y: value}], color, type: 'line'|'bar'|'area' }]
// granularity: 'day'|'week'|'month'
// yFormat: 'USD'|'%'|'count'
// annotations: [{ x: date, label, color }]
// onDatapointClick: función → DrilldownModal del período

class TimeSeriesChart {
    // Chart.js base
    // Tooltip con valor + delta vs período anterior
    // Click en punto → DrilldownModal
    // Responsive + resize automático
}
```

---

### ComparisonChart

```javascript
// Para RPT-E1/E2: barras agrupadas o radar
// series: [{ entity_id, entity_name, metrics: { revenue, margin, RevPAB, ... }}]
// chartType: 'grouped_bar'|'radar'

class ComparisonChart {
    // Selección dinámica de métrica a comparar
    // Toggle entre tipos de chart
}
```

---

### HeatmapChart

```javascript
// Para RPT-E3: 52 semanas × 7 días
// data: [{ week: number, day: 0-6, value: number, date: Date }]
// colorScale: 'green' (más = mejor) | 'red' (más = peor)
// onCellClick: función → DrilldownModal del día

class HeatmapChart {
    // SVG grid con interpolación de color
    // Tooltip con fecha y métricas del día
}
```

---

### WaterfallChart

```javascript
// Para RPT-B6 (Revenue Leakage) y RPT-D5 (P&L)
// steps: [{ label, value, type: 'base'|'positive'|'negative'|'total' }]

class WaterfallChart {
    // Chart.js con plugin de waterfall
    // Labels con valor en cada barra
    // Click en barra → DrilldownModal con transacciones del componente
}
```

---

### AlertFeed

```javascript
// Para RPT-F2
// alerts: [{ code, name, severity, entity_name, detected_value, created_at, status }]
// onAck: función (PATCH /api/nbic/alerts/:id/ack)
// onResolve: función (PATCH /api/nbic/alerts/:id/resolve)

class AlertFeed {
    // Lista de alertas con severity badge (crítica/advertencia/info)
    // Botones: Ver detalle, Reconocer, Marcar resuelta
    // Agrupación por severity
    // Indicador de tiempo transcurrido (hace 2h, etc.)
}
```

---

### DrilldownModal

```javascript
// Modal universal de detalle transaccional
// Se abre desde CUALQUIER celda drillable de cualquier reporte
// Parámetros:
//   report_code: 'RPT-A1' etc.
//   entity_type: 'booking'|'transaction'|'expense'|'boat'|'period'
//   entity_id: id de la entidad
//   filters: filtros actuales propagados al detalle

class DrilldownModal {
    // Título: "Detalle de [entity_name]"
    // Carga datos via: GET /api/nbic/[endpoint]/detail?entity_id=&...filters
    // Renderiza: DataTable con registros detallados
    // Incluye botón "Ir al registro" → link a módulo transaccional (accounting.html, etc.)
    // Export CSV del detalle
    // Navegación: breadcrumb de drill-downs anidados
}
```

---

### ExportButton

```javascript
// Parámetros:
// reportCode, currentFilters, format: 'csv'|'pdf'

class ExportButton {
    // CSV: GET /api/nbic/exports/csv?report=RPT-A1&...filters
    //      → descarga directa vía blob URL
    // PDF: POST /api/nbic/exports/board-report
    //      → loading spinner → descarga PDF
}
```

---

## 5. Rutas (hash routing, sin framework)

```javascript
const NBIC_ROUTES = {
    '#f1':  { report: 'RPT-F1', endpoint: '/api/nbic/executive/kpis' },
    '#f2':  { report: 'RPT-F2', endpoint: '/api/nbic/executive/alerts' },
    '#f3':  { report: 'RPT-F3', endpoint: null, action: 'generate_pdf' },
    '#a1':  { report: 'RPT-A1', endpoint: '/api/nbic/revenue/reconciliation' },
    '#a2':  { report: 'RPT-A2', endpoint: '/api/nbic/revenue/aging' },
    '#a3':  { report: 'RPT-A3', endpoint: '/api/nbic/revenue/payment-flow' },
    '#a4':  { report: 'RPT-A4', endpoint: '/api/nbic/revenue/pending-deposits' },
    '#a5':  { report: 'RPT-A5', endpoint: '/api/nbic/revenue/by-dimension' },
    '#a6':  { report: 'RPT-A6', endpoint: '/api/nbic/revenue/cash-days' },
    '#b1':  { report: 'RPT-B1', endpoint: '/api/nbic/pricing/variance' },
    '#b2':  { report: 'RPT-B2', endpoint: '/api/nbic/pricing/weekly' },
    '#b3':  { report: 'RPT-B3', endpoint: '/api/nbic/pricing/outliers' },
    '#b4':  { report: 'RPT-B4', endpoint: '/api/nbic/pricing/avg-ticket' },
    '#b5':  { report: 'RPT-B5', endpoint: '/api/nbic/pricing/discount-analysis' },
    '#b6':  { report: 'RPT-B6', endpoint: '/api/nbic/pricing/leakage-waterfall' },
    '#c1':  { report: 'RPT-C1', endpoint: '/api/nbic/expenses/by-boat' },
    '#c2':  { report: 'RPT-C2', endpoint: '/api/nbic/expenses/by-category' },
    '#c3':  { report: 'RPT-C3', endpoint: '/api/nbic/expenses/period' },
    '#c4':  { report: 'RPT-C4', endpoint: '/api/nbic/expenses/top-suppliers' },
    '#c5':  { report: 'RPT-C5', endpoint: '/api/nbic/expenses/anomalies' },
    '#c6':  { report: 'RPT-C6', endpoint: '/api/nbic/expenses/breakeven' },
    '#d1':  { report: 'RPT-D1', endpoint: '/api/nbic/profitability/by-boat' },
    '#d2':  { report: 'RPT-D2', endpoint: '/api/nbic/profitability/margin-trend' },
    '#d3':  { report: 'RPT-D3', endpoint: '/api/nbic/profitability/by-channel' },
    '#d4':  { report: 'RPT-D4', endpoint: '/api/nbic/profitability/revpab' },
    '#d5':  { report: 'RPT-D5', endpoint: '/api/nbic/profitability/pnl' },
    '#e1':  { report: 'RPT-E1', endpoint: '/api/nbic/compare/boats' },
    '#e2':  { report: 'RPT-E2', endpoint: '/api/nbic/compare/periods' },
    '#e3':  { report: 'RPT-E3', endpoint: '/api/nbic/compare/seasonality' },
};
```

---

## 6. Estados de UI por Componente

### Estado: loading

```html
<!-- Skeleton uniform para todos los reportes -->
<div class="nbic-skeleton">
    <div class="skeleton-kpis">          <!-- 4 KPI card skeletons -->
    <div class="skeleton-chart">         <!-- Chart placeholder 300px -->
    <div class="skeleton-table">         <!-- 5 rows × N cols -->
</div>
```

### Estado: empty (sin datos en filtros actuales)

```html
<div class="nbic-empty">
    <svg><!-- icono gráfico vacío --></svg>
    <h3>Sin datos para este período</h3>
    <p>Prueba expandiendo el rango de fechas o quitando filtros.</p>
    <button onclick="resetFilters()">Limpiar filtros</button>
</div>
```

### Estado: blocked (completeness_score < 0.10)

```html
<div class="nbic-blocked">
    <span class="badge badge--warn">Reporte bloqueado</span>
    <p>Este reporte requiere datos que aún no están disponibles:</p>
    <ul><!-- lista de warnings del meta.warnings[] --></ul>
    <p>Completa la información en <a href="/fleet.html">Gestión de Flota</a>.</p>
</div>
```

### Estado: error

```html
<div class="nbic-error">
    <span class="badge badge--critical">Error al cargar</span>
    <p><!-- meta.error --></p>
    <button onclick="retryLoad()">Reintentar</button>
</div>
```

### Estado: partial (0.10 ≤ completeness_score < 0.70)

Banner amarillo en la parte superior del reporte:
```html
<div class="completeness-banner completeness-banner--warn">
    <span>Completitud: 42%</span>
    <button onclick="toggleWarnings()">Ver limitaciones ▾</button>
    <div class="warnings-detail" hidden>
        <!-- meta.warnings[] como lista -->
    </div>
</div>
```

---

## 7. Wireframes Textuales por Reporte

### RPT-F1 — Executive Dashboard

```
[HEADER] NBIC Executive Dashboard | Datos al: 14:45 | [Refresh]
[FILTER BAR] Este mes ▼ | Todos los barcos ▼

[KPI ROW — 6 cards]
Ingresos Brutos    Ingresos Netos    Gastos Totales
$6,025             $6,025            $2,100
↑ WoW N/D          ↑ WoW N/D         ↑ WoW N/D

Margen Bruto       Bookings          RevPAB
$3,925 / 65.2%     6                 $201/día
↑ WoW N/D          ↑ WoW N/D         ↑ WoW N/D

[ROW — 2 columnas]
[TimeSeriesChart: Ingresos por día (bar)]    [AlertFeed: 3 alertas activas]
[30 días rolling]                            ALT-09 ⚠ 6 bookings sin método pago
                                             ALT-03 ⚠ 1 precio bajo tarifa
                                             ALT-02 ℹ Verificar depósitos

[DataTable: Top 5 bookings del período — con indicadores de conciliación]
```

---

### RPT-A1 — Conciliación de Ingresos

```
[Completeness: 40%] [Warnings: 6 bookings sin boat_id, bank_statements vacíos]

[KPI ROW — 4 cards]
Total Vendido      Total Cobrado     Total Depositado   Leakage
$6,025             N/D               N/D                N/D
↑ WoW N/D

[WaterfallChart: Vendido → Cobrado → Depositado]
Potencial: $X → Vendido: $6,025 → Cobrado: N/D → Depositado: N/D

[DataTable: Una fila por booking]
ID | Fecha Servicio | Barco | Canal | Cliente | Método Pago | 
Bruto | Descuento | Neto | Cobrado | Banco | Alerta
------
book_pEjr6ZEabc | 2026-04-25 | Sin barco | GetMyBoat | ... | NULL | $1,521 | $0 | $1,521 | N/D | N/D | ⚠ sin_método_pago

[Drill-down al hacer click] → Modal con transacciones + bank_statements del booking
```

---

### RPT-B1 — Análisis de Precios por Barco

```
[Completeness: 15%] [Warning: boat_id NULL en todos los bookings actuales]

[KPI ROW — 4 cards]
Precio Promedio    Precio Mínimo    Máximo    % Bajo Tarifa
$1,004             $850             $1,521    0% (sin tarifa de referencia)

[Scatter Plot: Precio vendido vs Precio esperado]
[Cada punto = booking; eje X = precio esperado, eje Y = precio vendido]
[Línea diagonal = precio igual a tarifa]
[Actualmente: todos los puntos en X=0 (sin base_price)]

[DataTable]
Booking | Fecha | Barco | Canal | Vendido | Tarifa Base | Diff | Diff% | Clasificación | Z-score
book_pEjr6ZEabc | 2026-04-25 | Sin barco | GetMyBoat | $1,521 | N/D | N/D | sin_tarifa_referencia | N/D
```

---

### RPT-C2 — Gastos por Categoría (más completo hoy)

```
[Completeness: 70%] [Datos desde transactions.type='expense']

[KPI ROW — 3 cards]
Total Gastos    Categorías    Transacciones
$2,100          3 activas     8

[Bar Chart Horizontal: categorías ordenadas por monto]
Otros: ████████████████ $1,200 (57%)
Mantenimiento: ████████ $650 (31%)
Combustible: ████ $250 (12%)

[DataTable: una fila por categoría]
Categoría | Monto | Qty | % Total | WoW | MoM
[Drill-down → lista de transacciones de esa categoría]
```

---

## 8. Drill-down Universal

**Regla**: TODA celda con `drillable: true` en `columns[]` del DataTable abre un `DrilldownModal`.

### Flujo de drill-down

```
Usuario hace click en celda [drillable]
  ↓
DrilldownModal.open({ report_code, entity_type, entity_id, filters })
  ↓
GET /api/nbic/[report-path]/detail?entity_id=&...filters
  ↓
Modal muestra:
  - Título: "Detalle de [entity_name]"
  - Completeness badge del detalle
  - DataTable con registros individuales
  - Link "Ver en [módulo transaccional]" → accounting.html, fleet.html, etc.
  - Botón Export CSV del detalle
  - Posibilidad de segundo nivel de drill-down (si aplica)
```

### Ejemplo: drill-down desde RPT-A1

```
Click en booking_id "book_pEjr6ZEabc"
  → DrilldownModal
  → Título: "Booking GetMyBoat - $1,521 - 2026-04-25"
  → Secciones:
     • Datos del booking (cliente, barco, duración, vendedor)
     • Transacciones vinculadas: ninguna (booking_id=NULL en transactions)
     • AR vinculada: ninguna (booking_receivables vacío)
     • Bank statement vinculado: ninguno
     • Alerta: ⚠ Booking sin trazabilidad contable completa
     • Link: "Ver en Contabilidad" → accounting.html?booking=book_pEjr6ZEabc
```

---

## 9. Exportación

### CSV (genérico)

```javascript
// GET /api/nbic/exports/csv
// Parámetros: report_code + todos los filtros activos
// Response: text/csv con headers correctos
// Client: crea blob URL y dispara descarga automática
// Nombre archivo: NBIC_[RPT-A1]_[2026-04-01]_[2026-04-20].csv
```

### PDF — Board Report

```javascript
// POST /api/nbic/exports/board-report
// Body: { period_from, period_to, boat_ids[], include_sections[] }
// Server: genera HTML completo del reporte y usa puppeteer
// Response: application/pdf stream
// Nombre: NBIC_BoardReport_[YYYY-MM].pdf

// Secciones del PDF:
// 1. Executive Summary (portada con KPIs)
// 2. Revenue Breakdown (waterfall + tabla)
// 3. Asset Performance (tabla por barco)
// 4. Cost Analysis
// 5. Cash Integrity
// 6. Pricing Integrity
// 7. Alerts Summary
// 8. Forward Outlook (próximos 30 días)
```

---

## 10. Patrones de Implementación

### Carga de datos (sin framework)

```javascript
class NBICReport {
    constructor(reportCode, endpoint) {
        this.reportCode = reportCode;
        this.endpoint   = endpoint;
        this.cache      = {};
    }

    async load(filters) {
        const cacheKey = JSON.stringify(filters);
        if (this.cache[cacheKey]) return this.cache[cacheKey];

        this.setState('loading');
        try {
            const params = new URLSearchParams(filters);
            const res = await fetch(`${this.endpoint}?${params}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.cache[cacheKey] = data;
            this.render(data);
            this.setState(data.meta.completeness_score < 0.10 ? 'blocked' : 'ready');
        } catch (err) {
            this.setState('error', err.message);
        }
    }

    render(data) {
        this.renderCompleteness(data.meta);
        this.renderWarnings(data.meta.warnings);
        this.renderKPIs(data.kpis);
        this.renderCharts(data.series);
        this.renderTable(data.table);
    }
}
```

### Persistencia de filtros en URL

```javascript
function syncFiltersToURL(filters) {
    const url = new URL(window.location);
    Object.entries(filters).forEach(([key, val]) => {
        if (Array.isArray(val)) {
            url.searchParams.delete(key);
            val.forEach(v => url.searchParams.append(key, v));
        } else {
            url.searchParams.set(key, val);
        }
    });
    window.history.replaceState({}, '', url);
}

function readFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    return {
        date_from:       params.get('date_from') || defaultFromDate(),
        date_to:         params.get('date_to')   || today(),
        boat_ids:        params.getAll('boat_ids[]'),
        channel_ids:     params.getAll('channel_ids[]'),
        payment_methods: params.getAll('payment_methods[]'),
        granularity:     params.get('granularity') || 'day',
        only_alerts:     params.get('only_alerts') === 'true',
    };
}
```
