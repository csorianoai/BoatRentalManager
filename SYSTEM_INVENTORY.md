# SYSTEM INVENTORY — Nadaki Excursions Portal
**Fecha de auditoría:** 21 de abril de 2026
**Auditor:** Agente (revisión automática + manual)
**Objetivo:** Visibilidad total del sistema antes de reorganización.

---

## ALERTAS CRÍTICAS (leer antes que todo)

| # | Tipo | Descripción |
|---|------|-------------|
| 🔴 | BROKEN LINK | `/sync.html` — referenciado en el navbar de `fleet.html` y `pricing.html` como "Sincronización", pero **el archivo no existe**. Cualquier usuario que haga clic obtiene error 404. |
| 🟡 | HUÉRFANA | `/captain.html` — página existente pero **no enlazada desde ningún menú ni botón** del sistema. Completamente inaccesible para el usuario normal. |
| 🟡 | DUPLICADOS | Existen **3 "dashboards ejecutivos"** compitiendo: `dashboard.html` (sección Centro de Control), `executive.html` (página separada), y `reports.html` sección F1 (Executive Dashboard). El propósito de cada uno no está claro desde fuera. |
| 🟡 | NAVBAR INCONSISTENTE | El menú principal no es el mismo en todas las páginas. `fleet.html` tiene 5 items, `accounting.html` tiene 2, `schedule.html` tiene 3 diferentes, `messages.html` tiene 4 diferentes. No hay una barra de navegación global coherente. |
| 🔵 | API LEGACY | `/api/boats` (GET) existe junto a `/api/fleet/boats`. Aparentemente el primero es legacy y devuelve datos crudos sin enriquecer. Posiblemente obsoleto o candidato a consolidar. |

---

## SECCIÓN 1 — Páginas HTML existentes (19 páginas)

| Página | Propósito | ¿Enlazada desde? | Última modificación | Tamaño |
|--------|-----------|------------------|---------------------|--------|
| `/dashboard.html` | Centro de operaciones principal. KPI cards, módulos de acceso rápido, resumen de reservas recientes, alertas. | Es la página raíz — todas las demás tienen enlace "← Dashboard" | 2026-04-21 | 36 KB |
| `/schedule.html` | Calendario de reservas por semana. Vista cronológica de bookings, navegación semana a semana. | Dashboard (6 KPI cards + módulo "Calendario") | 2026-04-03 | 26 KB |
| `/fleet.html` | Gestión de flotilla + Fleet Operations Center. 5 tabs internas. | Dashboard (módulo "Flotilla") | 2026-04-21 | 65 KB |
| `/accounting.html` | Contabilidad completa. 10 tabs que cubren desde transacciones hasta conciliación bancaria e importación OFX/CSV. | Dashboard (módulos: Contabilidad, Análisis Ingresos, Análisis Gastos) | 2026-04-06 | 236 KB |
| `/reports.html` | NBIC Analytics — panel de reportes avanzados de negocio con sidebar propio. 15+ secciones. | Dashboard (módulo "NBIC") | 2026-04-20 | 19 KB |
| `/boat-maintenance.html` | Gestión de mantenimiento de barcos. 7 tabs: gastos, gastos programados, mantenimiento, órdenes de trabajo, inventario de partes, mecánicos, analíticas. | Dashboard (módulo "Mantenimiento") | 2026-03-30 | 53 KB |
| `/messages.html` | Bandeja de entrada unificada. Mensajes de clientes por canal, templates AI, respuestas. | Dashboard (módulo "Mensajes") | 2026-03-27 | 34 KB |
| `/crew.html` | Gestión de tripulación. 2 tabs: Capitanes y Stewarts. CRUD + pagos. | Dashboard (módulo "Tripulación") | 2026-04-03 | 39 KB |
| `/operations.html` | Módulo de tareas/operaciones internas. 4 tabs: Resumen, Tareas, Timeline, Categorías. | Dashboard (módulo "Tareas") | 2026-03-26 | 36 KB |
| `/executive.html` | Dashboard ejecutivo financiero separado. Resumen de ingresos, KPIs financieros, gráficas de tendencia. | Dashboard (módulo "Dashboard Ejecutivo") | 2026-03-30 | 24 KB |
| `/commissions.html` | Gestión de comisiones de plataformas y agentes. Reglas, cálculos, pagos. | Dashboard (módulo "Comisiones") | 2026-04-16 | 53 KB |
| `/pricing.html` | Precios base. 4 tabs: Políticas, Ajustes, Calculadora, Sincronización de jobs. | Dashboard (módulo "Precios") | 2026-03-26 | 12 KB |
| `/dynamic-pricing.html` | Precios dinámicos con ML/AI. 5 tabs: Insights, Recomendaciones, Oportunidades, Competidores, Eventos. | Dashboard (módulo "Precios Dinámicos") | 2026-03-27 | 17 KB |
| `/documents.html` | Almacenamiento de documentos. Upload, categorización, descarga, preview. | Dashboard (módulo "Documentos") | 2026-03-31 | 55 KB |
| `/marine-conditions.html` | Condiciones marinas en tiempo real (NOAA). Oleaje, viento, mareas, alertas de seguridad. | Dashboard (módulo "Condiciones Marinas") | 2026-03-27 | 13 KB |
| `/fuel-tracker.html` | Rastreador de combustible por barco. Registro de cargas, motor, consumo histórico. | Dashboard (módulo "Combustible") | 2026-04-08 | 30 KB |
| `/assets.html` | Gestión de activos físicos. Inventario de equipos, movimientos. | Dashboard (módulo "Activos") | 2026-03-30 | 16 KB |
| `/captain.html` | App del capitán. Check-in, check-out, reporte de viaje, asignaciones. | **HUÉRFANA** — no enlazada desde ningún menú | 2026-03-27 | 5 KB |
| `/login.html` | Pantalla de autenticación. | Redirige automáticamente cuando no hay sesión. | 2025-11-02 | 4 KB |

**Nota:** `/sync.html` aparece en la barra de navegación de `fleet.html` y `pricing.html` pero **no existe como archivo** → 404 para el usuario.

---

## SECCIÓN 2 — Endpoints API (≈ 230 endpoints totales en server.js)

### /api/accounting/* — 53 endpoints
**Propósito:** Módulo contable completo.
Cubre: transacciones (CRUD), extractos bancarios (importar CSV/OFX, auto-match, bulk-classify, duplicados), reglas de categorización, patrones de clasificación, conciliación bancaria, análisis de ingresos/gastos con drilldown, cash flow, P&L, balance sheet, ROI, alertas financieras, cuentas contables, periodos fiscales.

### /api/nbic/* — 13 endpoints
**Propósito:** Business Intelligence para reportes NBIC.
Cubre: KPIs ejecutivos, alertas, revenue (conciliación, aging AR, por dimensión), pricing (por barco, ticket promedio, revenue leakage), gastos (por barco, por período), profitability (por barco), comparativas (períodos, barcos, estacionalidad).

### /api/pricing/* — 13 endpoints
**Propósito:** Motor de precios base + dinámico.
Cubre: políticas de precios, ajustes, calculadora de precios, forecast de demanda, eventos de mercado, insights, oportunidades, datos de competidores, recomendaciones AI, vista previa de impacto, sincronización de precios por barco/plataforma.

### /api/messages/* — 11 endpoints
**Propósito:** Centro de mensajería unificada.
Cubre: bandeja de entrada, hilos de conversación, ingesta (webhooks WhatsApp/Email), envío de mensajes, templates (CRUD + preview), sugerencias AI, mensaje manual.

### /api/sync/* — 9 endpoints
**Propósito:** Sincronización con las 13 plataformas de reservas.
Cubre: estado de sync, jobs (listar, procesar, reintentar), conflictos (listar, resolver), trigger de sync por plataforma o todas.

### /api/fleet/* — 10 endpoints
**Propósito:** Fleet Operations Center — datos para el calendario operacional.
Cubre: timeline de reservas (el endpoint principal del FOC), today-strip (reservas de hoy), alertas operacionales, KPIs de flota, disponibilidad, barcos (CRUD + fotos + platform IDs), capitanes disponibles, búsqueda inteligente.

### /api/availability/* — 8 endpoints
**Propósito:** Gestión de disponibilidad de barcos.
Cubre: bloques de disponibilidad (CRUD), verificar conflictos, verificar disponibilidad puntual, release de bloques.

### /api/fuel-tracker/* — 8 endpoints
**Propósito:** Registro y análisis de combustible.
Cubre: barcos del tracker, cargas de combustible (CRUD), configuración de barco, resumen de uso, análisis de tendencias, backfill de uso histórico.

### /api/marine/* — 7 endpoints
**Propósito:** Condiciones marinas en tiempo real.
Cubre: condiciones actuales, oleaje, mareas, viento, alertas de seguridad, clear de caché, datos de estación de boya NOAA.

### /api/bookings/* — 7 endpoints
**Propósito:** CRUD de reservas + acciones de estado.
Cubre: listar, crear, editar, borrar, marcar pagado, confirmar, asignar capitán, registrar check-in.

### /api/captain/* + /api/captains/* — 9 endpoints combinados
**Propósito:** Gestión de capitanes (admin) + app del capitán (campo).
- `/api/captains` — CRUD de capitanes (admin)
- `/api/captain` — operaciones del capitán en campo: check-in, check-out, reporte de viaje, ver asignaciones, ver trip logs
- `/api/schedule/:captainId` — agenda del capitán

### /api/operations/* — 6 endpoints
**Propósito:** Módulo de tareas/operaciones.
Cubre: tareas (CRUD + duplicar + enviar a gastos), categorías, asignados.

### /api/commissions/* — 5 endpoints
**Propósito:** Comisiones de plataformas y agentes.
Cubre: reglas (crear, listar), calcular comisiones, marcar pagadas, reportes.

### /api/stews/* + /api/stew-payments/* — 8 endpoints
**Propósito:** Gestión de stewarts y sus pagos.
Cubre: stewarts (CRUD), pagos (CRUD + summary).

### /api/captain-payments/* — 3 endpoints
**Propósito:** Pagos a capitanes. CRUD + resumen de pagos.

### /api/documents/* — 5 endpoints
**Propósito:** Almacén documental. Upload, listar, ver, descargar, estadísticas.

### /api/boat-expenses/* — 5 endpoints
**Propósito:** Gastos por barco (separado de boat-maintenance). CRUD + analíticas + agrupado por barco.

### /api/maintenance-records/* + /api/work-orders/* + /api/parts-inventory/* + /api/mechanics/* — 12 endpoints
**Propósito:** Sistema de mantenimiento completo. Registros, órdenes de trabajo (CRUD + completar), inventario de partes (CRUD + restock), mecánicos.

### /api/scheduled-expenses/* — 5 endpoints
**Propósito:** Gastos programados/recurrentes. CRUD + marcar pagado.

### /api/booking-deposits/* + /api/booking-receivables/* + /api/bookings-ledger/* — 10 endpoints
**Propósito:** Sistema de depósitos y trazabilidad financiera de reservas.
Cubre: depósitos (CRUD + aplicar a reserva), cuentas por cobrar, ledger de reservas.

### /api/brokers/* + /api/customers/* — 5 endpoints
**Propósito:** Gestión de brokers y clientes para el sistema de depósitos.

### /api/assets/* — 4 endpoints
**Propósito:** Activos físicos. CRUD + movimientos de activos.

### /api/email/* — 3 endpoints
**Propósito:** Integración con Gmail (IMAP). Sincronización, ingesta de emails, estadísticas.

### /api/ai/* + /api/chat/* — 4 endpoints
**Propósito:** Servicios de IA. Chat con clientes (público), escalado a humano, historial de conversaciones.

### Endpoints sueltos (1-2 cada uno)
- `/api/dashboard-data` — datos del dashboard principal (KPIs, últimas reservas, alertas)
- `/api/executive-dashboard` — datos del dashboard ejecutivo financiero
- `/api/boats` — lista básica de barcos (parece **legacy**, coexiste con `/api/fleet/boats`)
- `/api/platforms` — lista de plataformas disponibles
- `/api/alerts/:id/resolve` — resolver alertas
- `/api/webhooks/email` + `/api/webhooks/whatsapp` — webhooks externos entrantes

---

## SECCIÓN 3 — Tabs y secciones internas por página

### /dashboard.html
- **Sección superior:** 7 KPI cards clickeables (reservas del período, ingresos, próximas reservas, capitanes activos, historial total, reservas pasadas, reservas de hoy)
- **Centro de Control — bloque OPERACIONES (azul):** Calendario, Tareas, Mensajes, Condiciones Marinas
- **Centro de Control — bloque FLOTA (verde):** Flotilla, Mantenimiento, Combustible, Activos, Tripulación
- **Centro de Control — bloque FINANZAS (violeta):** Contabilidad, Análisis de Ingresos, Análisis de Gastos, Dashboard Ejecutivo, NBIC
- **Centro de Control — bloque COMERCIAL (ámbar):** Comisiones, Precios, Precios Dinámicos, Documentos
- **Sección inferior:** Próximas reservas (tabla), Reservas Recientes (tabla)

### /fleet.html
- Tab 1: **Gestión de Barcos** — cards de barcos con fotos, CRUD de barcos, gestión de fotos
- Tab 2: **Fleet Operations Center** — calendario/timeline operacional (Timeline + Weekly + Monthly + Lista con 13 columnas)
- Tab 3: **Vinculación de Plataformas** — mapeo de IDs de barcos por plataforma
- Tab 4: **Consulta Rápida** — búsqueda de disponibilidad por fecha y barco
- Tab 5: **Gastos Recurrentes** — lista de gastos programados con acceso rápido a boat-maintenance

### /accounting.html (236 KB — la más grande del sistema)
- Tab 1: **Transacciones** — tabla de transacciones con CRUD, filtros, categorización
- Tab 2: **Análisis de Ingresos** — KPIs, gráfica de tendencia 6 meses, breakdown por categoría, drilldown
- Tab 3: **Análisis de Gastos** — mismo formato que ingresos pero para gastos
- Tab 4: **Clasificación AI** — auto-clasificación inteligente de transacciones bancarias
- Tab 5: **Conciliación Bancaria Final** — conciliación de extractos vs transacciones
- Tab 6: **Importación de Extractos** — upload CSV/OFX de bancos
- Tab 7: **Reconciliation** — módulo avanzado de reconciliación con variance analysis
- Tab 8: **Reglas** — reglas de categorización automática
- Tab 9: **Reportes** — reportes básicos de contabilidad
- Tab 10: **Depósitos** — sistema de depósitos de reservas (brokers, clientes, ledger)

### /reports.html (NBIC Analytics)
Sidebar izquierdo con 2 niveles (vista rápida + catálogo expandido):
- **Vista rápida (7 iconos):** Executive, Revenue, Pricing, Gastos, Rentabilidad, Compare, Alertas
- **Sección A — Ingresos:** A1 Conciliación · A2 Aging AR · A5 Por Dimensión
- **Sección B — Pricing:** B1 Por Barco · B4 Ticket Promedio · B6 Revenue Leakage
- **Sección C — Gastos:** C1 Por Barco · C2 Por Categoría · C5 Anomalías
- **Sección D — Rentabilidad:** D1 Por Barco · D5 P&L
- **Sección E — Comparativo:** (Compare entre períodos/barcos)
- **Sección F — Ejecutivo:** F1 Executive Dashboard · F2 Alertas

### /boat-maintenance.html
- Tab 1: **Gastos** — gastos ad-hoc de mantenimiento
- Tab 2: **Gastos Programados** — mantenimientos recurrentes calendarizados
- Tab 3: **Mantenimiento** — registros de mantenimiento con historial
- Tab 4: **Órdenes de Trabajo** — work orders (crear, asignar a mecánico, completar)
- Tab 5: **Inventario de Partes** — partes y repuestos (CRUD + restock)
- Tab 6: **Mecánicos** — directorio de mecánicos externos
- Tab 7: **Analíticas** — costos por barco, tendencias, predicciones

### /operations.html
- Tab 1: **Resumen** — vista general de tareas pendientes/completadas
- Tab 2: **Tareas** — lista completa con filtros, asignación, fechas
- Tab 3: **Timeline** — vista cronológica de tareas
- Tab 4: **Categorías** — gestión de categorías de tareas

### /crew.html
- Tab 1: **Capitanes** — lista de capitanes, CRUD, disponibilidad, pagos
- Tab 2: **Stewarts** — lista de stewarts, CRUD, pagos

### /pricing.html
- Tab 1: **Políticas** — reglas de precio base por barco/plataforma/temporada
- Tab 2: **Ajustes** — ajustes manuales de precio por fecha/barco
- Tab 3: **Calculadora** — simulador de precio para una reserva específica
- Tab 4: **Sync Jobs** — estado de sincronización de precios hacia plataformas

### /dynamic-pricing.html
- Tab 1: **Insights** — análisis de mercado actual (demanda, estacionalidad)
- Tab 2: **Recomendaciones** — recomendaciones AI de precio por barco
- Tab 3: **Oportunidades** — fechas o barcos con oportunidad de subir precio
- Tab 4: **Competidores** — datos de precios de la competencia
- Tab 5: **Eventos** — eventos del mercado que afectan demanda

### /schedule.html
Una sola vista: calendario de reservas por semana con navegación. Sin tabs.

### /executive.html
Una sola vista: Dashboard ejecutivo financiero. KPIs de ingresos, gráficas de P&L, análisis de rendimiento. Sin tabs.

### /marine-conditions.html
Una sola vista: condiciones marinas en tiempo real. Sin tabs.

### /messages.html
Una sola vista: bandeja de mensajes unificada (WhatsApp + Email). Sin tabs.

### /fuel-tracker.html
Mini-tabs contextuales dentro del detalle de cada barco: Motor · Combustible · Agregar Carga.

### /commissions.html
Una sola vista: gestión de comisiones. Sin tabs explícitas (posibles secciones internas).

### /documents.html
Una sola vista: gestión documental con upload, grid de documentos, filtros. Sin tabs.

### /assets.html
Una sola vista: gestión de activos. Sin tabs.

### /captain.html
Una sola vista: app simplificada del capitán (check-in/out, reporte). Sin tabs.

---

## SECCIÓN 4 — Features construidos vs accesibles desde Dashboard

| Feature construido | Acceso desde Dashboard | Clicks | Observación |
|-------------------|------------------------|--------|-------------|
| Fleet Operations Center (calendario/timeline) | SÍ (indirecto) | **2** | Dashboard → Flotilla → Tab "Fleet Ops Center" |
| Gestión de Barcos (CRUD barcos, fotos) | SÍ | **2** | Dashboard → Flotilla → Tab "Gestión de Barcos" (default) |
| Vinculación de Plataformas | SÍ (indirecto) | **2** | Dashboard → Flotilla → Tab "Vinculación de Plataformas" |
| Consulta Rápida de disponibilidad | SÍ (indirecto) | **2** | Dashboard → Flotilla → Tab "Consulta Rápida" |
| NBIC Analytics (/reports.html) | SÍ | **1** | Dashboard → módulo "NBIC" |
| Calendario de Reservas (/schedule.html) | SÍ | **1** | Dashboard → módulo "Calendario" (también KPI cards) |
| Contabilidad completa (/accounting.html) | SÍ | **1** | Dashboard → módulo "Contabilidad" |
| Análisis de Ingresos | SÍ | **1** | Dashboard → módulo "Análisis de Ingresos" (va a /accounting.html#income) |
| Análisis de Gastos | SÍ | **1** | Dashboard → módulo "Análisis de Gastos" (va a /accounting.html#expenses) |
| Dashboard Ejecutivo (/executive.html) | SÍ | **1** | Dashboard → módulo "Dashboard Ejecutivo" |
| Sistema de Depósitos de Reservas | SÍ (indirecto) | **2** | Dashboard → Contabilidad → Tab "Depósitos" |
| Mensajes (/messages.html) | SÍ | **1** | Dashboard → módulo "Mensajes" |
| Tareas/Operaciones (/operations.html) | SÍ | **1** | Dashboard → módulo "Tareas" |
| Condiciones Marinas (/marine-conditions.html) | SÍ | **1** | Dashboard → módulo "Condiciones Marinas" |
| Mantenimiento de Barcos (/boat-maintenance.html) | SÍ | **1** | Dashboard → módulo "Mantenimiento" |
| Gastos Programados de mantenimiento | SÍ (indirecto) | **2** | Dashboard → Mantenimiento → Tab "Gastos Programados" |
| Órdenes de Trabajo | SÍ (indirecto) | **2** | Dashboard → Mantenimiento → Tab "Órdenes de Trabajo" |
| Inventario de Partes | SÍ (indirecto) | **2** | Dashboard → Mantenimiento → Tab "Inventario" |
| Combustible (/fuel-tracker.html) | SÍ | **1** | Dashboard → módulo "Combustible" |
| Activos (/assets.html) | SÍ | **1** | Dashboard → módulo "Activos" |
| Tripulación (/crew.html) | SÍ | **1** | Dashboard → módulo "Tripulación" |
| Pagos a Capitanes | SÍ (indirecto) | **2** | Dashboard → Tripulación → Tab "Capitanes" |
| Pagos a Stewarts | SÍ (indirecto) | **2** | Dashboard → Tripulación → Tab "Stewarts" |
| Comisiones (/commissions.html) | SÍ | **1** | Dashboard → módulo "Comisiones" |
| Precios base (/pricing.html) | SÍ | **1** | Dashboard → módulo "Precios" |
| Precios Dinámicos / ML (/dynamic-pricing.html) | SÍ | **1** | Dashboard → módulo "Precios Dinámicos" |
| Documentos (/documents.html) | SÍ | **1** | Dashboard → módulo "Documentos" |
| App del Capitán (/captain.html) | **NO** | ∞ | **HUÉRFANA** — no enlazada desde ningún lugar |
| Sincronización de Plataformas | **NO** | ∞ | `sync.html` enlazado en navbar pero **el archivo no existe** → 404 |
| Módulo de Conciliación Bancaria avanzada | SÍ (indirecto) | **2** | Dashboard → Contabilidad → Tab "Importación" o "Conciliación" |
| Reglas de Categorización | SÍ (indirecto) | **2** | Dashboard → Contabilidad → Tab "Reglas" |

**Resumen de accesibilidad:**
- ✅ Accesibles en 1 click: **18 features**
- ⚠️ Accesibles en 2 clicks (sub-tab): **10 features**
- 🔴 Inaccesibles: **2** (captain.html huérfana + sync.html roto)

---

## SECCIÓN 5 — Recomendación de reorganización

### Diagnóstico previo

**Problema 1 — Navbar global rota e inconsistente.**
No existe una barra de navegación global única. Cada página tiene su propio header/navbar con links distintos. Algunos tienen 5 items, otros 2, otros 3. El ítem "Sincronización" aparece en 2 navbars pero lleva a un 404.

**Problema 2 — Tres "Dashboards Ejecutivos" compitiendo.**
- `dashboard.html` tiene un "Centro de Control" tipo dashboard con KPIs
- `executive.html` es un segundo dashboard ejecutivo financiero
- `reports.html` sección F1 es un tercer "Executive Dashboard"
El usuario no sabe cuándo usar cuál.

**Problema 3 — El FOC está enterrado pero es el feature más importante del día a día.**
Fleet Operations Center (el calendario de operaciones) requiere ir a Flotilla y luego hacer click en la segunda tab. Para el operador diario, debería ser 1 click o incluso ser la vista por defecto.

**Problema 4 — `captain.html` existe pero nadie la puede encontrar.**
Es la interfaz para que los capitanes usen en campo. Sin enlace, es inútil.

---

### Propuesta de nueva arquitectura de información

#### Principios
1. **≤ 2 clicks** desde cualquier pantalla a cualquier feature
2. **Agrupación por rol de usuario**: operador diario · gerente financiero · dueño
3. **Un solo Dashboard** de entrada, con navegación lateral persistente

#### Propuesta de menú lateral global (sidebar único para todo el sistema)

```
NADAKI EXCURSIONS
─────────────────────────────
📊  Dashboard          [/dashboard.html]    — vista de hoy: reservas, alertas, KPIs

OPERACIONES  (uso diario)
🗓️  Fleet Ops Center   [/fleet.html → tab FOC]  ← ¡debe ser 1 click directo!
📋  Calendario         [/schedule.html]
💬  Mensajes           [/messages.html]
🌊  Mar & Clima        [/marine-conditions.html]
✅  Tareas             [/operations.html]

FLOTILLA  (gestión de barcos)
⛵  Barcos              [/fleet.html → tab Gestión de Barcos]
🔧  Mantenimiento       [/boat-maintenance.html]
⛽  Combustible         [/fuel-tracker.html]
📦  Activos             [/assets.html]
👥  Tripulación         [/crew.html]

FINANZAS  (gerente financiero)
🏦  Contabilidad        [/accounting.html]
📊  NBIC Analytics      [/reports.html]
💰  Análisis Ingresos   [/accounting.html#income]
📉  Análisis Gastos     [/accounting.html#expenses]
💸  Comisiones          [/commissions.html]
🧾  Depósitos           [/accounting.html#deposits]

COMERCIAL  (ventas)
💲  Precios             [/pricing.html]
📈  Pricing Dinámico    [/dynamic-pricing.html]
🔄  Sincronización      [PENDIENTE: crear /sync.html o consolidar en pricing]
📁  Documentos          [/documents.html]

CONFIGURACIÓN
─────────────────────────────
⚙️  Capitanes (app)     [/captain.html]   ← conectar aquí
```

#### Decisiones pendientes para ti

| Decisión | Opciones |
|----------|---------|
| ¿Qué hacer con `/executive.html`? | A) Consolidar en `reports.html` (ya tiene sección F1 Executive), B) Mantener separado como "vista rápida del dueño", C) Redirigir a reports.html#f1 |
| ¿Qué hacer con "Sincronización"? | A) Crear `/sync.html` que consolide los endpoints `/api/sync/*`, B) Mover la sección al tab de pricing, C) Crear una sección en el sidebar de Configuración |
| ¿Dónde mostrar el Dashboard Ejecutivo? | A) `reports.html` como home, B) `executive.html` como primera pantalla del rol "Dueño", C) Un solo `dashboard.html` unificado con KPIs financieros incluidos |
| ¿`captain.html` va en el sidebar o es URL separada/protegida? | A) Link en sidebar bajo Configuración, B) URL separada que se comparte con los capitanes como app, C) Sub-tab en `/crew.html` |
| ¿`accounting.html` (236 KB!) se mantiene monolítica? | A) Mantener como está (todas las tabs en 1 archivo), B) Separar tabs muy usadas (Conciliación, Importación) en páginas propias |

#### Agrupación por rol de usuario

**Operador diario** (ve esto al llegar cada mañana):
→ Fleet Ops Center · Calendario de hoy · Mensajes sin responder · Condiciones marinas

**Gerente de finanzas** (1-2 veces por semana):
→ Contabilidad · Importación de extractos · Conciliación · Análisis de ingresos/gastos · Comisiones

**Dueño/CEO** (overview semanal):
→ NBIC Analytics · Dashboard Ejecutivo · P&L · Análisis comparativo de barcos

**Capitán en campo** (app móvil-friendly):
→ captain.html: ver mis reservas del día · check-in · check-out · reporte de viaje

---

## RESUMEN EJECUTIVO PARA TOMAR DECISIONES

| Prioridad | Acción | Impacto |
|-----------|--------|---------|
| 🔴 URGENTE | Crear o redirigir `/sync.html` — actualmente es un 404 activo en el navbar | Cualquier usuario que haga clic obtiene error |
| 🔴 URGENTE | Conectar `/captain.html` desde algún punto de navegación | Feature totalmente inaccesible |
| 🟡 ALTA | Crear navbar global consistente (sidebar o top-nav) que sea igual en todas las páginas | Experiencia fragmentada actualmente |
| 🟡 ALTA | Dar acceso directo a Fleet Ops Center en 1 click (es el feature más importante del día) | Actualmente requiere 2 clicks + saber que existe |
| 🟡 MEDIA | Decidir qué hacer con los 3 "dashboards ejecutivos" (dashboard.html / executive.html / reports.html#f1) | Confusión de propósito |
| 🟢 BAJA | Revisar si `/api/boats` (legacy) puede consolidarse con `/api/fleet/boats` | Deuda técnica menor |
