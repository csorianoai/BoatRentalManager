# ACCOUNTING_AUDIT.md
**Nadaki Excursions — Auditoría Contable Completa**
Fecha: 22 de abril 2026 | Auditoría sobre datos reales de producción

---

## RESUMEN EJECUTIVO

| Indicador | Valor |
|---|---|
| **Hallazgo principal** | El flujo del dinero está completamente roto: 6 reservas, $7,025 en ingresos, 0 registros contables vinculados a ellas |
| **Mayor fuga detectada** | `POST /api/bookings` crea reservas sin generar ningún A/R, depósito ni asiento contable. El botón "Marcar pagado" solo escribe en `bookings.payment_status` — no genera transacción contable |
| **Siguiente paso recomendado** | Integración (no construcción nueva): conectar el flujo booking→ledger→transaction→reconciliación usando tablas que ya existen pero están vacías |

---

## SECCIÓN 1 — INVENTARIO DE ENDPOINTS CONTABLES

### 1A — `/api/accounting/*`

Implementado en `server.js`. Total: **~55 endpoints**.

| Método | Ruta | Propósito | Tabla(s) BD | Auth | UI consume | Archivo frontend | Estado |
|---|---|---|---|---|---|---|---|
| GET | `/api/accounting/accounts` | Lista plan de cuentas | `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js:128` | Conectado, 60 cuentas reales |
| GET | `/api/accounting/accounts/:id` | Detalle de cuenta | `chart_of_accounts` | ✅ sí | ❌ no | — | Backend sin UI |
| POST | `/api/accounting/accounts` | Crear cuenta | `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js` | Conectado |
| PUT | `/api/accounting/accounts/:id` | Editar cuenta | `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js` | Conectado |
| DELETE | `/api/accounting/accounts/:id` | Eliminar cuenta | `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js` | Conectado |
| GET | `/api/accounting/transactions` | Lista transacciones | `transactions` | ✅ sí | ✅ sí | `accounting.js:192` | Conectado — **28 tx, ninguna vinculada a booking** |
| GET | `/api/accounting/transactions/:id` | Detalle tx | `transactions` | ✅ sí | ✅ sí | `accounting.js:1190` | Conectado |
| POST | `/api/accounting/transactions` | Crear tx manual | `transactions` | ✅ sí | ✅ sí | `accounting.js:570` | Conectado — ingreso solo manual |
| PUT | `/api/accounting/transactions/:id` | Editar tx | `transactions` | ✅ sí | ✅ sí | `accounting.js:1293` | Conectado |
| DELETE | `/api/accounting/transactions/:id` | Eliminar tx | `transactions` | ✅ sí | ✅ sí | `accounting.js:982` | Conectado |
| GET | `/api/accounting/bank-statements` | Lista extracto bancario | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — **0 registros en BD** |
| GET | `/api/accounting/bank-statements/unmatched` | Sin conciliar | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — vacío |
| POST | `/api/accounting/bank-statements/upload` | Importar CSV/OFX | `bank_statements` | ✅ sí | ✅ sí | `accounting.js:853` | Conectado — nunca usado |
| POST | `/api/accounting/bank-statements/import` | Importar JSON | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — nunca usado |
| POST | `/api/accounting/bank-statements/auto-match` | Auto-conciliar básico | `bank_statements`, `transactions` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| POST | `/api/accounting/bank-statements/smart-auto-match` | Auto-conciliar IA | `bank_statements`, `transactions` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| GET | `/api/accounting/bank-statements/:id/suggest-matches` | Sugerir coincidencias | `bank_statements`, `transactions` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| POST | `/api/accounting/bank-statements/smart-classify` | Clasificar IA | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| GET | `/api/accounting/bank-statements/classification-stats` | Stats clasificación | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — vacío |
| PATCH | `/api/accounting/bank-statements/:id/classify` | Clasificar línea | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| POST | `/api/accounting/bank-statements/bulk-classify` | Clasificar en lote | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| POST | `/api/accounting/bank-statements/:id/quick-accept` | Aceptar rápido | `bank_statements`, `transactions` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| GET | `/api/accounting/bank-statements/preview-duplicates` | Ver duplicados | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| POST | `/api/accounting/bank-statements/smart-detect` | Detectar duplicados IA | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| POST | `/api/accounting/bank-statements/detect-duplicates` | Detectar duplicados | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| POST/DELETE | varios `/bank-statements/*` (dup mgmt) | Gestión duplicados | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectados — sin datos |
| DELETE | `/api/accounting/bank-statements/:id` | Eliminar línea | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| POST | `/api/accounting/bank-statements/manual` | Añadir línea manual | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — sin datos |
| GET | `/api/accounting/bank-statements/conciliation-summary` | Resumen conciliación | `bank_statements` | ✅ sí | ✅ sí | `accounting.js` | Conectado — vacío |
| GET | `/api/accounting/conciliation/items` | Items conciliación final | `bank_statements`, `transactions`, `booking_deposits`, `booking_receivables` | ✅ sí | ✅ sí | `accounting.js` | Conectado — **vacío por ausencia de datos** |
| POST/GET | `/api/accounting/reconciliations/*` | Sesiones de reconciliación | `reconciliation_sessions`, `transactions`, `bank_statements` | ✅ sí | ✅ sí | `accounting.js:237,728,1012` | Conectado — **0 sesiones en BD** |
| GET | `/api/accounting/expenses/analysis` | Análisis de gastos | `transactions`, `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js:304` | Conectado — datos parciales |
| GET | `/api/accounting/income/analysis` | Análisis de ingresos | `transactions`, `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js:303` | Conectado — datos parciales |
| GET | `/api/accounting/profit-loss` | P&L | `transactions`, `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js:1039` | Conectado — **sin bookings vinculados = cifras incorrectas** |
| GET | `/api/accounting/balance-sheet` | Balance general | `transactions`, `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js:1060` | Conectado — cifras incompletas |
| GET | `/api/accounting/cash-flow` | Flujo de caja | `transactions`, `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js:1087` | Conectado — cifras incompletas |
| GET | `/api/accounting/roi` | ROI por barco | `transactions`, `chart_of_accounts` | ✅ sí | ✅ sí | `accounting.js:1113` | Conectado — sin datos de bookings |
| GET/POST | `/api/accounting/categorization-rules/*` | Reglas auto-categorización | `categorization_rules` | ❌ público | ✅ sí | `accounting.js:263,803` | Conectado |
| POST | `/api/accounting/categorization-rules/apply` | Aplicar reglas | `categorization_rules`, `bank_statements` | ❌ público | ✅ sí | `accounting.js:825` | Conectado — sin statements |
| GET/POST | `/api/accounting/alerts/*` | Alertas financieras | `accounting_alerts`, `alert_configurations` | ❌ público | ✅ sí | `accounting.js` | Conectado |
| GET/PUT | `/api/accounting/alert-configs/*` | Config alertas | `alert_configurations` | ❌ público | ✅ sí | `accounting.js` | Conectado |
| GET/POST | `/api/accounting/tax-configs` | Config impuestos | `tax_configs` | ✅ sí | ❓ no verificado | — | Backend sin UI visible |
| GET/POST | `/api/accounting/financial-periods` | Períodos contables | `financial_periods` | ✅ sí | ❓ no verificado | — | Backend sin UI visible — **0 períodos en BD** |
| POST | `/api/accounting/repair-deposits` | Reparar depósitos huérfanos | `booking_deposits`, `booking_receivables`, `transactions` | ✅ sí | ✅ sí | `accounting.html:1659` | Conectado — botón de emergencia |

### 1B — `/api/booking-deposits/*`

Implementado en `server.js` líneas 12510–12779.

| Método | Ruta | Propósito | Tabla(s) BD | Auth | UI consume | Estado |
|---|---|---|---|---|---|---|
| GET | `/api/booking-deposits` | Lista depósitos | `booking_deposits`, `boats` | ✅ sí | ✅ sí (`accounting.js:1884`) | Conectado — **0 registros** |
| POST | `/api/booking-deposits` | Crear depósito | `booking_deposits`, `customers`, `brokers`, `bookings_ledger`, `booking_receivables`, `transactions` | ✅ sí | ✅ sí (`accounting.js:675`) | Conectado — flujo multi-tabla, nunca activado |
| PATCH | `/api/booking-deposits/:id` | Editar depósito | `booking_deposits` | ✅ sí | ✅ sí | Conectado — sin datos |
| DELETE | `/api/booking-deposits/:id` | Eliminar depósito | `booking_deposits` | ✅ sí | ✅ sí (`accounting.js:2013`) | Conectado — sin datos |
| POST | `/api/booking-deposits/:id/apply` | Aplicar depósito → booking | `booking_deposits`, `bookings_ledger` | ✅ sí | ✅ sí (`accounting.js:2112`) | Conectado — sin datos |

**Nota crítica:** `POST /api/booking-deposits` crea automáticamente entradas en `customers`, `brokers`, `bookings_ledger`, `booking_receivables` y `transactions`. Es el único endpoint que conecta el flujo completo — pero nunca ha sido llamado.

### 1C — `/api/booking-receivables/*`

Implementado en `server.js` líneas 12779–12976.

| Método | Ruta | Propósito | Tabla(s) BD | Auth | UI consume | Estado |
|---|---|---|---|---|---|---|
| GET | `/api/booking-receivables` | Lista cuentas por cobrar | `booking_receivables`, `boats` | ✅ sí | ✅ sí (`accounting.js:1804`) | Conectado — **0 registros** |
| PATCH | `/api/booking-receivables/:id/mark-paid` | Marcar cobrada | `booking_receivables`, `transactions` | ✅ sí | ✅ sí (`accounting.js:1862`) | Conectado — sin datos |
| PATCH | `/api/booking-receivables/:id/cancel` | Cancelar A/R | `booking_receivables` | ✅ sí | ✅ sí (`accounting.js:1872`) | Conectado — sin datos |

### 1D — `/api/bookings-ledger/*`

Implementado en `server.js` líneas 12482–12510.

| Método | Ruta | Propósito | Tabla(s) BD | Auth | UI consume | Estado |
|---|---|---|---|---|---|---|
| GET | `/api/bookings-ledger` | Lista libro de reservas | `bookings_ledger`, `boats` | ✅ sí | ❌ no encontrado en accounting.js | **Backend sin UI** — **0 registros** |
| PATCH | `/api/bookings-ledger/:id/complete` | Marcar completada | `bookings_ledger`, `booking_deposits` | ✅ sí | ❌ no encontrado | **Backend sin UI** — sin datos |

### 1E — `/api/brokers/*`

Implementado en `server.js` líneas 12416–12455.

| Método | Ruta | Propósito | Tabla(s) BD | Auth | UI consume | Estado |
|---|---|---|---|---|---|---|
| GET | `/api/brokers` | Lista brokers | `brokers` | ✅ sí | ✅ sí (`accounting.js:458`) | Conectado — **1 broker en BD**, ningún booking lo referencia |
| POST | `/api/brokers` | Crear broker | `brokers` | ✅ sí | ✅ sí | Conectado |
| PATCH | `/api/brokers/:id` | Editar broker | `brokers` | ✅ sí | ❓ no verificado | Backend probablemente sin UI de edición |

### 1F — `/api/customers/*`

Implementado en `server.js` líneas 12455–12484.

| Método | Ruta | Propósito | Tabla(s) BD | Auth | UI consume | Estado |
|---|---|---|---|---|---|---|
| GET | `/api/customers` | Lista clientes | `customers` | ✅ sí | ✅ sí (`accounting.js:475`) | Conectado — **1 cliente en BD**, ningún booking lo referencia |
| POST | `/api/customers` | Crear cliente | `customers` | ✅ sí | ✅ sí | Conectado |

**Falta:** No existe `PATCH /api/customers/:id` ni `DELETE`. Módulo incompleto.

### 1G — `/api/commissions/*`

Implementado en `server.js` líneas 4137–4417. Tiene su propia UI en `commissions.html`/`commissions.js`.

| Método | Ruta | Propósito | Tabla(s) BD | Auth | UI consume | Estado |
|---|---|---|---|---|---|---|
| GET | `/api/commissions/rules` | Reglas de comisión | `commission_rules` | ✅ sí | ✅ sí (`commissions.js`) | Conectado — **14 reglas en BD** |
| POST | `/api/commissions/rules` | Crear regla | `commission_rules` | ✅ sí | ✅ sí | Conectado |
| POST | `/api/commissions/calculate` | Calcular comisión | `commission_rules`, `bookings` | ✅ sí | ✅ sí | Conectado — no genera `commission_payments` |
| GET | `/api/commissions/payments` | Lista pagos comisión | `commission_payments`, `bookings`, `captains` | ✅ sí | ✅ sí | Conectado — **0 pagos en BD** |
| POST | `/api/commissions/mark-paid` | Marcar pagada | `commission_payments` | ✅ sí | ✅ sí | Conectado — sin datos |
| GET | `/api/commissions/reports` | Reporte comisiones | `commission_payments`, `bookings` | ✅ sí | ✅ sí | Conectado — sin datos |

### 1H — `/api/scheduled-expenses/*`

Implementado en `server.js` líneas 11283–11443. Sin UI propia encontrada.

| Método | Ruta | Propósito | Tabla(s) BD | Auth | UI consume | Estado |
|---|---|---|---|---|---|---|
| GET | `/api/scheduled-expenses` | Lista gastos prog. | `scheduled_expenses`, `boats` | ❌ público | ❓ no verificado | Backend — **3 registros (1 pending, 2 paid)** |
| POST | `/api/scheduled-expenses` | Crear gasto prog. | `scheduled_expenses` | ❌ público | ❓ no verificado | Backend — sin UI clara |
| PATCH | `/api/scheduled-expenses/:id` | Editar | `scheduled_expenses` | ❌ público | ❓ no verificado | Backend |
| DELETE | `/api/scheduled-expenses/:id` | Eliminar | `scheduled_expenses` | ❌ público | ❓ no verificado | Backend |
| POST | `/api/scheduled-expenses/:id/mark-paid` | Marcar pagado | `scheduled_expenses`, `transactions` | ❌ público | ❓ no verificado | Backend — sin datos confirmados |

**Problema:** Todos sin `isAuthenticated` — acceso público sin control.

---

## SECCIÓN 2 — ESTADO DE DATOS REALES

### A. ¿Cuántos bookings tienen cuenta por cobrar creada?

```
Bookings en BD:           6
Bookings con A/R (booking_receivables): 0
```
**0 de 6 bookings tienen una cuenta por cobrar asociada.** La tabla `booking_receivables` está vacía.

### B. ¿Cuántos pagos de bookings existen?

| Tabla | Registros | Monto total |
|---|---|---|
| `booking_deposits` | **0** | — |
| `booking_receivables` | **0** | — |
| `bookings_ledger` | **0** | — |
| `transactions` | **28** | ~$16,640 (ninguna vinculada a un booking) |
| `commission_payments` | **0** | — |
| `captain_payments` | **0** | — |
| `stew_payments` | **0** | — |

### C. ¿Cuántos bookings tienen balance pendiente?

```sql
SELECT COUNT(*), SUM(balance_pending) FROM bookings WHERE balance_pending > 0;
→ count=0, total_pending=NULL
```

**0 bookings con balance_pending > 0.** Todos los bookings tienen `deposit_amount=0.00`, `balance_pending=0.00`, `payment_status=NULL`.

### D. ¿Cuántas transacciones no están conciliadas?

```sql
SELECT reconciled, COUNT(*) FROM transactions GROUP BY reconciled;
→ reconciled=NULL: 2 registros
→ reconciled=0:   26 registros
→ reconciled=1:   0 registros
```

**28 transacciones, 0 conciliadas, ninguna vinculada a booking** (`booking_id` columna existe pero es NULL en todas).

`bank_statements`: **0 registros** — nunca se ha importado un extracto bancario.

### E. Campos financieros en `bookings`

| Campo | Existe | Dato real |
|---|---|---|
| `payment_status` | ✅ columna `text` | NULL en los 6 bookings |
| `deposit_amount` | ✅ columna `numeric` | `0.00` en todos |
| `balance_pending` | ✅ columna `numeric` | `0.00` en todos |
| `payment_method` | ✅ columna `text` | NULL en todos |
| `payment_date` | ✅ columna `date` | NULL en todos |
| `broker_id` | ✅ columna `text` | NULL en todos |
| `broker_name` | ✅ columna `text` | NULL en todos |
| `payer_type` | ❌ NO EXISTE | No hay columna |
| `amount_due` | ❌ NO EXISTE | No hay columna |
| `balance_due` | ❌ NO EXISTE | No hay columna |
| `customer_id` (FK) | ❌ NO EXISTE | No hay FK a `customers` |

### F. 10 Bookings recientes con información financiera real

| booking_id | fecha | customer | total | deposit | balance_pending | payment_status | broker | receivable |
|---|---|---|---|---|---|---|---|---|
| book_pEjr6ZEabc | 2026-04-25 | Coco Kaminski | $1,521 | $0 | $0 | NULL | NULL | ❌ |
| book_OQV0G0Pabc | 2026-04-17 | Rodhit Chaudhary | $895 | $0 | $0 | NULL | NULL | ❌ |
| book_lkQ9hzabc | 2026-04-03 | Luis Melendez | $1,359 | $0 | $0 | NULL | NULL | ❌ |
| book_2AYVoNbabc | 2026-03-28 | Alexandria Early | $1,250 | $0 | $0 | NULL | NULL | ❌ |
| book_1pBL6m4abc | 2026-03-28 | SERGIO FLORES | $850 | $0 | $0 | NULL | NULL | ❌ |
| book_Gm3fqIjabc | 2026-03-15 | Ciarra | $1,150 | $0 | $0 | NULL | NULL | ❌ |

**Total en sistema:** $7,025. **Trazabilidad contable:** $0.

---

## SECCIÓN 3 — FLUJO REAL DEL DINERO HOY

### 1. Cuando se crea un booking

**Tablas tocadas automáticamente:**
- `bookings` — registro creado ✅
- `boat_usage_log` — registro creado ✅

**¿Se crea A/R automáticamente?**
❌ **NO.** El código de `POST /api/bookings` (líneas 3018–3141) no toca `booking_receivables`, `booking_deposits`, `bookings_ledger` ni `transactions`.

**El booking nace sin trazabilidad financiera.**

### 2. Cuando se recibe un depósito

**¿Dónde se guarda?**
Solo a través de `POST /api/booking-deposits` (desde `accounting.html` tab "Depósitos"). Este endpoint SÍ crea entradas en `booking_deposits`, `bookings_ledger`, `booking_receivables` y `transactions` en cascada.

**¿Cómo se vincula al booking?**
A través del campo `booking_ledger_id` en `booking_deposits`. Sin embargo, `bookings_ledger` no tiene FK directa a `bookings.id` — el link entre `bookings_ledger` y la tabla `bookings` es débil (solo por `booking_source`/`booking_date`/`customer_name`, sin un ID común).

**Fuga real:** Los bookings creados en `bookings` nunca generan una entrada en `bookings_ledger`. Flujos desconectados.

### 3. Cuando se paga el balance

**Opción A — QuickOps en Calendar (`POST /api/bookings/:id/mark-paid`):**
- Marca `bookings.payment_status='paid'`, `balance_pending=0`
- ❌ **NO genera transacción contable** en `transactions`
- ❌ **NO actualiza** `booking_receivables`
- El dinero queda invisible para contabilidad

**Opción B — Tab Receivables en accounting.html (`PATCH /api/booking-receivables/:id/mark-paid`):**
- Genera transacción contable ✅
- Marca `booking_receivables.status='paid'` ✅
- Actualiza `transactions` con el cobro ✅
- ❌ **Pero no hay A/Rs creadas** — el tab aparece vacío

**Método de pago:** El campo `payment_method` existe en `bookings` pero no se vincula a ninguna transacción contable.

### 4. Cuando se recibe cash o Zelle fuera del sistema

- `POST /api/accounting/transactions` permite registrarlo manualmente con `transaction_type`, `account_id`, `amount`
- ❌ **No existe campo "pendiente de depositar"** en la transacción
- ❌ No hay flujo de reconciliación cash→banco diferenciado

### 5. Cuando el dinero llega al banco

- `POST /api/accounting/bank-statements/upload` permite importar CSV/OFX ✅
- `POST /api/accounting/bank-statements/smart-auto-match` concilia con `transactions` ✅
- ❌ **Nunca se ha importado un extracto** — `bank_statements`: 0 registros
- ❌ La conciliación es imposible mientras `transactions` no tenga bookings vinculados

### 6. Si hay broker

- Campo `broker_id` existe en `bookings` — NULL en todos los registros actuales
- Campo `broker_name` existe en `bookings` — NULL en todos
- `booking_receivables.party_type` / `party_id` permite distinguir "cliente vs. broker" como deudor
- `booking_deposits.broker_id` vincula el depósito al broker
- ❌ **La UI de creación de booking no captura broker** de forma visible
- ❌ **Ningún booking actual tiene broker asignado** a pesar de existir 1 broker en BD

**Resumen del flujo:**

```
Booking creado
    ↓
    ❌ Sin A/R, sin depósito, sin ledger entry
    
    [Si se usa mark-paid en Calendar]
    ↓
    bookings.payment_status='paid' — sin asiento contable
    
    [Si se usa accounting.html → Depósitos (nunca ocurrido)]
    ↓
    booking_deposits → bookings_ledger → booking_receivables → transactions ✅
    ↓
    [Si se importa extracto bancario (nunca ocurrido)]
    ↓
    bank_statements → smart-auto-match → reconciliation_sessions ✅
```

**El flujo del dinero se rompe inmediatamente después de la creación del booking.**

---

## SECCIÓN 4 — CONEXIÓN BACKEND ↔ UI

| Módulo backend | Endpoint | Página UI | Archivo frontend | Status |
|---|---|---|---|---|
| Plan de cuentas | `/api/accounting/accounts` | `accounting.html` | `accounting.js:128` | ✅ Conectado y funcionando |
| Transacciones | `/api/accounting/transactions` | `accounting.html` tab Transacciones | `accounting.js:192` | ✅ Conectado — datos sin bookings |
| Extracto bancario | `/api/accounting/bank-statements/*` | `accounting.html` tab Conciliación | `accounting.js` | ✅ Conectado — **tabla vacía** |
| Conciliación final | `/api/accounting/conciliation/items` | `accounting.html` tab Conciliación Final | `accounting.js` | ✅ Conectado — **vacío** |
| Sesiones reconciliación | `/api/accounting/reconciliations/*` | `accounting.html` tab Reconciliación | `accounting.js:237` | ✅ Conectado — **0 sesiones** |
| P&L / Balance / Flujo caja | `/api/accounting/profit-loss`, etc. | `accounting.html` informes | `accounting.js:1039-1113` | ✅ Conectado — **cifras incorrectas** sin bookings |
| Depósitos | `/api/booking-deposits` | `accounting.html` tab Depósitos | `accounting.js:1884` | ✅ Conectado — **0 depósitos** |
| Cuentas por cobrar | `/api/booking-receivables` | `accounting.html` sub-tabla en Depósitos | `accounting.js:1804` | ✅ Conectado — **0 A/Rs** |
| Libro de reservas | `/api/bookings-ledger` | **NO existe en UI** | — | ❌ Backend sin UI |
| Brokers | `/api/brokers` | `accounting.html` selector en form depósito | `accounting.js:458` | ✅ Conectado — 1 broker, 0 usados |
| Clientes | `/api/customers` | `accounting.html` selector en form depósito | `accounting.js:475` | ✅ Conectado — 1 cliente, 0 usados |
| Comisiones | `/api/commissions/*` | `commissions.html` | `commissions.js` | ✅ Conectado — 14 reglas, **0 pagos** |
| Gastos programados | `/api/scheduled-expenses` | **UI no verificada** | — | ❓ Backend probablemente sin UI activa |
| Reparar depósitos | `/api/accounting/repair-deposits` | `accounting.html` botón "Reparar transacciones" | `accounting.html:1659` | ✅ Conectado — botón de emergencia que repara huérfanos |
| mark-paid (booking) | `/api/bookings/:id/mark-paid` | `schedule.html` QuickOps | `schedule.js` | ✅ Conectado — **no genera transacción contable** |
| Alertas contables | `/api/accounting/alerts` | `accounting.html` | `accounting.js` | ✅ Conectado |
| Reglas categorización | `/api/accounting/categorization-rules` | `accounting.html` | `accounting.js` | ✅ Conectado |
| Períodos financieros | `/api/accounting/financial-periods` | **UI no encontrada** | — | ❌ Backend sin UI — **0 períodos** |
| Config impuestos | `/api/accounting/tax-configs` | **UI no encontrada** | — | ❌ Backend sin UI |
| Pagos capitanes | Commissions module | `commissions.html` | `commissions.js` | ✅ UI existe — **0 pagos** |
| Pagos stewarding | — | — | — | ❌ `stew_payments` en BD, 0 registros, no endpoints visibles |

---

## SECCIÓN 5 — DUPLICADOS Y DEUDA TÉCNICA

### 5.1 Funciones duplicadas

| Duplicado | Elemento A | Elemento B | Problema |
|---|---|---|---|
| **"Marcar pagado"** | `POST /api/bookings/:id/mark-paid` (calendar) | `PATCH /api/booking-receivables/:id/mark-paid` (accounting) | Dos caminos para el mismo acto — uno deja rastro contable, el otro no |
| **Estado de pago del booking** | `bookings.payment_status` | `booking_receivables.status` | Dos estados de pago independientes, no sincronizados |
| **Nombre del cliente** | `bookings.customer_name` | `customers.name` + `booking_deposits.client_name` + `bookings_ledger.customer_name` | 4 lugares distintos para el mismo dato |
| **Nombre del broker** | `bookings.broker_name` | `brokers.name` + `booking_deposits.broker_id` | Duplicación sin FK clara desde bookings a brokers table |
| **Importe de depósito** | `bookings.deposit_amount` | `booking_deposits.amount` | Mismo dato en dos tablas sin sincronización |
| **Balance pendiente** | `bookings.balance_pending` | `booking_receivables.amount` | Mismo concepto, calculado en dos lugares distintos |
| **Datos del barco** | `bookings.boat_type` + `bookings.boat_id` | `booking_deposits.boat_id` + `bookings_ledger.boat_id` | Referencia repetida en 4 tablas |

### 5.2 Tablas que representan conceptos similares

| Tabla A | Tabla B | Solapamiento |
|---|---|---|
| `bookings` | `bookings_ledger` | Ambas representan una reserva. `bookings_ledger` parece ser la versión "contable" de `bookings`, pero no hay FK entre ellas |
| `transactions` | `booking_receivables` | Ambas representan un derecho de cobro pendiente en diferentes niveles |
| `customers` | `bookings.customer_name` / `booking_deposits.client_name` | Tabla customers existe pero no está referenciada con FK desde bookings |
| `bank_statements` | `transactions` | En teoría ambas representan movimientos de dinero real — la conciliación las conecta, pero sin datos en bank_statements la tabla transactions está "suelta" |

### 5.3 Endpoints con funciones similares

| Ruta A | Ruta B | Duplicación |
|---|---|---|
| `POST /api/accounting/bank-statements/auto-match` | `POST /api/accounting/bank-statements/smart-auto-match` | Dos endpoints de auto-matching, uno básico y uno IA |
| `POST /api/accounting/bank-statements/detect-duplicates` | `POST /api/accounting/bank-statements/smart-detect` | Dos endpoints de detección de duplicados |
| `POST /api/accounting/categorization-rules/apply` | `POST /api/accounting/bank-statements/smart-classify` | Dos rutas de clasificación automática |

### 5.4 UI que consume rutas deprecadas o inconsistentes

| Archivo | Llamada | Problema |
|---|---|---|
| `accounting.js:447` | `fetch('/api/boats')` | Endpoint `/api/boats` no está en el inventario principal — el correcto es `/api/fleet/boats` |
| `accounting.js:128` | `fetch('/api/accounting/accounts')` (sin auth header) | Funciona porque auth es httpOnly cookie, pero el endpoint requiere `isAuthenticated` — vulnerable si sesión expira silenciosamente |

### 5.5 Campos financieros redundantes en bookings

Los siguientes campos en `bookings` duplican datos que deberían vivir exclusivamente en tablas contables:

```
bookings.deposit_amount     → duplica booking_deposits.amount
bookings.balance_pending    → duplica booking_receivables.amount
bookings.payment_status     → duplica booking_receivables.status
bookings.payment_method     → debería estar en transactions
bookings.payment_date       → debería estar en transactions
bookings.broker_name        → debería ser FK a brokers.id
```

---

## SECCIÓN 6 — GAP ANALYSIS

### A) INTEGRACIÓN — Ya construido, solo necesita conectarse

| Item | Descripción | Impacto | Prioridad | Esfuerzo estimado | Riesgo |
|---|---|---|---|---|---|
| **A1** | `POST /api/bookings` debe crear entrada en `bookings_ledger` automáticamente | Crítico — sin esto ningún flujo contable arranca | Alta | 0.5 días | Bajo — agregar INSERT en endpoint existente |
| **A2** | `POST /api/bookings/:id/mark-paid` debe crear un registro en `transactions` al marcar pagado | Alto — hoy el pago queda invisible en contabilidad | Alta | 0.5 días | Bajo — agregar INSERT después del UPDATE |
| **A3** | Formulario de nueva reserva en schedule.html debe capturar `broker_id` y `deposit_amount` real | Alto — hoy los campos existen en BD pero nunca se llenan | Media | 1 día | Bajo — campo adicional en form |
| **A4** | `booking_receivables` se deben generar automáticamente al crear booking | Alto — el módulo de cobros existe pero está vacío | Alta | 0.5 días | Bajo — el endpoint de POST /api/booking-deposits ya hace esto en cascada |
| **A5** | Conectar `bookings.customer_name` a la tabla `customers` (buscar/crear) | Medio — permite historial de cliente | Media | 1 día | Bajo |
| **A6** | `bookings_ledger` necesita UI en accounting.html (tab faltante) | Medio — el backend existe pero sin UI | Media | 1 día | Bajo |
| **A7** | Importar primer extracto bancario real (CSV/OFX) | Alto — sin esto la conciliación no puede operar | Alta | 0 días de código — operacional | Nulo |

### B) CONSTRUCCIÓN FOCUSED — Falta construir

| Item | Descripción | Impacto | Prioridad | Esfuerzo estimado | Riesgo |
|---|---|---|---|---|---|
| **B1** | Sync bidireccional `bookings.payment_status` ↔ `booking_receivables.status` | Alto — hoy son independientes | Alta | 1 día | Medio — requiere lógica de sincronización cuidadosa |
| **B2** | Campo "pendiente de depositar" en transacciones (cash/Zelle no depositado) | Medio | Media | 0.5 días | Bajo |
| **B3** | UI de Gastos Programados (`scheduled_expenses`) — actualmente sin interfaz clara | Medio — 3 registros en BD sin UI | Media | 1 día | Bajo |
| **B4** | Sincronizar `bookings.deposit_amount` con `booking_deposits.amount` cuando se crea un depósito | Alto — datos inconsistentes | Alta | 0.5 días | Bajo |
| **B5** | Endpoint y UI para Pagos de Capitanes (`captain_payments`) — 0 registros, 0 pagos | Medio | Media | 1-2 días | Bajo |
| **B6** | Endpoint y UI para Pagos de Stewards (`stew_payments`) — tabla existe, 0 registros, sin endpoints | Bajo-Medio | Baja | 1 día | Bajo |

### C) REDISEÑO / MIGRACIÓN — Mal diseñado, requiere reestructura

| Item | Descripción | Impacto | Prioridad | Esfuerzo estimado | Riesgo |
|---|---|---|---|---|---|
| **C1** | Eliminar campos financieros redundantes de `bookings` (`deposit_amount`, `balance_pending`, `payment_status`, `payment_method`, `payment_date`) y reemplazar con vistas calculadas desde tablas contables | Alto — limpia duplicación, única fuente de verdad | Media (post-integración) | 2-3 días | Alto — requiere migración de datos y actualización de todos los consumidores |
| **C2** | Crear FK explícita `bookings_ledger.booking_id → bookings.id` | Medio — hoy el link es por nombre/fecha, frágil | Media | 1 día | Medio — requiere migración de BD |
| **C3** | Consolidar `bookings.customer_name` con FK a `customers.id` | Medio — actualmente datos de cliente duplicados en 4 lugares | Baja | 2 días | Medio |
| **C4** | Unificar los dos flujos de "marcar pagado" en un solo endpoint con lógica contable | Alto — hoy el camino del calendar no deja rastro | Alta | 1 día | Bajo |

---

## SECCIÓN 7 — RECOMENDACIÓN FINAL

### 1. ¿Problema de integración o ausencia de sistema?

**Problema de integración en el 80% de los casos.**

La infraestructura contable está construida y es sólida:
- 55+ endpoints implementados
- 60 cuentas contables configuradas
- UI de accounting.html funcional (3,918 líneas)
- Flujo completo de depósitos→ledger→receivables→transactions existe y funciona si se activa

El problema es que el **punto de entrada** — la creación de una reserva — no activa ningún paso de ese flujo. Todo lo contable es un sistema paralelo que requiere entrada manual separada.

### 2. ¿Qué porcentaje del sistema contable ya existe?

| Capa | % construido | % funcional |
|---|---|---|
| Backend (endpoints) | **95%** | **90%** |
| UI de accounting | **85%** | **85%** |
| Datos reales / integración con bookings | **5%** | **0%** |
| Conciliación bancaria | **95%** | **0%** (sin extractos) |
| **TOTAL** | **~80% construido** | **~15% operativo** |

### 3. Ruta correcta

**Integración rápida: 3–5 días**

No se necesita construcción mayor. Se necesita conectar lo que ya existe.

### 4. Orden exacto de trabajo

| Paso | Acción | Archivo | Tiempo |
|---|---|---|---|
| 1 | Modificar `POST /api/bookings` para crear entrada en `bookings_ledger` y `booking_receivables` automáticamente | `server.js` | 0.5 días |
| 2 | Modificar `POST /api/bookings/:id/mark-paid` para crear transacción contable | `server.js` | 0.5 días |
| 3 | Sincronizar `bookings.deposit_amount` y `balance_pending` desde las tablas contables | `server.js` | 0.5 días |
| 4 | Agregar tab `bookings_ledger` en `accounting.html` | `accounting.html`/`accounting.js` | 1 día |
| 5 | Importar primer extracto bancario real | Operacional | 0 días código |
| 6 | Ejecutar `smart-auto-match` para conciliar transacciones existentes (28) con extracto | Operacional | 0 días código |
| 7 | Unificar los dos caminos de "marcar pagado" | `server.js`, `schedule.js` | 0.5 días |
| 8 | (Opcional) Agregar captura de `broker_id` en formulario de booking | `schedule.html` | 1 día |

**No empezar hasta recibir aprobación explícita.**

---

*Auditoría generada sin modificaciones de código. Todos los datos son reales obtenidos de la base de datos de producción y análisis directo de código fuente.*
