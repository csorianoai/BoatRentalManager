'use strict';

/**
 * bookingAccountingHook.js
 *
 * Conecta POST /api/bookings al sistema contable existente.
 * Crea: bookings_ledger + booking_receivables (si amount_due > 0).
 * NO crea transactions (aún no se recibió dinero al crear el booking).
 *
 * Constraints reales en bookings_ledger:
 *   booking_source CHECK: 'direct' | 'broker'
 *   payment_method CHECK: 'cash'|'card'|'transfer'|'online_platform'|'mixed'|'pending'|'unknown'
 *   broker_id       FK → brokers.id
 *   customer_id     FK → customers.id
 *
 * Flags:
 *   ACCOUNTING_HOOK_ENABLED   (default: true)
 *   ACCOUNTING_HOOK_SOFT_FAIL (default: false — hard-fail dentro de la transacción)
 */

const VALID_PAYER_TYPES = ['client', 'broker', 'split'];
const VALID_PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'online_platform', 'mixed', 'pending', 'unknown']);

/**
 * Lógica de payer_type (ChatGPT):
 * 1. Si payer_type explícito y válido → úsalo
 * 2. Si hay broker_id + ambos montos → 'split'
 * 3. Si hay broker_id → 'broker'
 * 4. Sin broker_id → 'client'
 */
function resolvePayerType({ payer_type, broker_id, deposit_amount, total_amount }) {
  if (payer_type && VALID_PAYER_TYPES.includes(payer_type)) return payer_type;
  if (!broker_id) return 'client';
  const dep = parseFloat(deposit_amount || 0);
  const tot = parseFloat(total_amount || 0);
  const balance = tot - dep;
  if (dep > 0.005 && balance > 0.005) return 'split';
  return 'broker';
}

/** Mapear payment_method a los valores permitidos por el constraint */
function resolvePaymentMethod(raw) {
  if (!raw) return null;
  if (VALID_PAYMENT_METHODS.has(raw)) return raw;
  const v = raw.toLowerCase();
  if (['cash', 'efectivo'].includes(v))                               return 'cash';
  if (['card', 'credit', 'debit', 'credit_card', 'tarjeta'].includes(v)) return 'card';
  if (['transfer', 'bank_transfer', 'wire', 'zelle', 'ach', 'transferencia'].includes(v)) return 'transfer';
  if (['stripe', 'paypal', 'online', 'airbnb', 'getmyboat', 'expedia',
       'viator', 'tripadvisor', 'groupon'].includes(v))              return 'online_platform';
  if (['mixed'].includes(v))                                          return 'mixed';
  return 'unknown';
}

/**
 * runBookingAccountingHook
 *
 * @param {object} pgClient  - pg client ya dentro de BEGIN (pool.connect())
 * @param {object} booking   - fila RETURNING * del INSERT en bookings
 * @returns {{ ledgerId, receivableId, payer_type, amount_due }}
 */
async function runBookingAccountingHook(pgClient, booking) {
  const { nanoid } = await import('nanoid');

  const {
    id: bookingId,
    customer_name,
    customer_phone,
    customer_email,
    broker_id,
    broker_name,
    boat_id,
    boat_type,
    booking_date,
    total_amount,
    deposit_amount,
    platform,
    notes,
    duration_hours,
    payment_method,
    base_price,
    discount_amount,
    discount_pct,
    payment_date,
    sold_by_user_id,
    sold_by_name,
  } = booking;

  const payer_type  = resolvePayerType(booking);
  const isBroker    = payer_type === 'broker' || payer_type === 'split';
  const amountTot   = parseFloat(total_amount   || 0);
  const amountDep   = parseFloat(deposit_amount || 0);
  const amount_due  = Math.max(0, amountTot - amountDep);

  // booking_source: constraint solo permite 'direct' | 'broker'
  const bookingSource = isBroker ? 'broker' : 'direct';

  // payment_method: mapear al enum del constraint (o NULL si inválido)
  const resolvedPaymentMethod = resolvePaymentMethod(payment_method);

  // broker_id: verificar que existe en brokers antes de insertar (FK constraint)
  let resolvedBrokerId = null;
  if (broker_id) {
    const brCheck = await pgClient.query('SELECT id FROM brokers WHERE id=$1', [broker_id]);
    if (brCheck.rows.length) {
      resolvedBrokerId = broker_id;
    } else {
      console.warn(`[AccountingHook] broker_id=${broker_id} no existe en brokers — se usará NULL`);
    }
  }

  const partyType = isBroker ? 'broker' : 'customer';
  const partyName = isBroker
    ? (broker_name || customer_name || 'Broker')
    : (customer_name || 'Cliente');
  const partyId   = isBroker ? resolvedBrokerId : null;

  // ── 1. bookings_ledger ──────────────────────────────────────────────
  const ledgerId = 'bl_' + nanoid(8);
  await pgClient.query(
    `INSERT INTO bookings_ledger
       (id, booking_source, boat_id, booking_date, hours_rented, total_amount, deposit_amount,
        customer_name, customer_phone, customer_email,
        broker_id, broker_name,
        receivable_party_type, receivable_party_id, receivable_party_name,
        service_type, status, notes,
        payment_method, base_price, discount_amount, discount_pct, payment_date,
        sold_by_user_id, sold_by_name)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
    [
      ledgerId,
      bookingSource,
      boat_id || null,
      booking_date,
      duration_hours || null,
      amountTot,
      amountDep,
      isBroker ? null : (customer_name || null),
      customer_phone || null,
      customer_email || null,
      resolvedBrokerId,
      isBroker ? (broker_name || null) : null,
      partyType,
      partyId,
      partyName,
      boat_type || null,
      'pending',
      `booking:${bookingId}${notes ? ' | ' + notes : ''}`,
      resolvedPaymentMethod,
      base_price      || null,
      discount_amount || null,
      discount_pct    || null,
      payment_date    || null,
      sold_by_user_id || null,
      sold_by_name    || null,
    ]
  );

  // ── 2. booking_receivables (solo si amount_due > 0) ─────────────────
  let receivableId = null;
  if (amount_due > 0.005) {
    receivableId = 'ar_' + nanoid(8);
    await pgClient.query(
      `INSERT INTO booking_receivables
         (id, client_name, client_email, client_phone, boat_id, due_date, amount, status, notes,
          party_type, party_id, party_name, booking_id, broker_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13)`,
      [
        receivableId,
        partyName,
        customer_email || null,
        customer_phone || null,
        boat_id        || null,
        booking_date,
        amount_due.toFixed(2),
        `Saldo por cobrar — ${customer_name || partyName} (booking:${bookingId})`,
        partyType,
        partyId,
        partyName,
        ledgerId,
        resolvedBrokerId,
      ]
    );
  }

  console.log(
    `[AccountingHook] OK booking:${bookingId} → ledger:${ledgerId}` +
    ` | payer_type:${payer_type} | amount_due:${amount_due.toFixed(2)}` +
    ` | ar:${receivableId || 'none'}`
  );

  return { ledgerId, receivableId, payer_type, amount_due };
}

module.exports = { runBookingAccountingHook, resolvePayerType };
