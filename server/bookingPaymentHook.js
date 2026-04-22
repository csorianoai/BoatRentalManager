'use strict';

/**
 * bookingPaymentHook.js — Fase 2 contable
 *
 * Dado un bookingId, al recibir un pago realiza:
 *  1. Crea transacción de ingreso en `transactions` (account 4010 Revenue-Tours)
 *  2. Actualiza booking_receivables.status → 'paid'
 *  3. Actualiza bookings_ledger.status → 'completed' + payment_date + payment_method
 *  4. Actualiza bookings: payment_status='paid', balance_pending=0, payment_date
 *
 * El pg client debe estar dentro de BEGIN — todas las ops son atómicas.
 * Guard: si el booking ya está 'paid' retorna { alreadyPaid: true } sin duplicar.
 *
 * Link chain:
 *   bookings.id → bookings_ledger.notes LIKE 'booking:{id}%'
 *   bookings_ledger.id → booking_receivables.booking_id
 *
 * Flags reutilizados de Fase 1:
 *   ACCOUNTING_HOOK_ENABLED   (default: true)
 *   ACCOUNTING_HOOK_SOFT_FAIL (default: false)
 */

const VALID_PAYMENT_METHODS = new Set([
  'cash', 'card', 'transfer', 'online_platform', 'mixed', 'pending', 'unknown',
]);
const REVENUE_ACCOUNT_CODE = '4010'; // Revenue - Tours

function resolvePaymentMethod(raw) {
  if (!raw) return null;
  if (VALID_PAYMENT_METHODS.has(raw)) return raw;
  const v = String(raw).toLowerCase();
  if (['cash', 'efectivo'].includes(v))                                   return 'cash';
  if (['card', 'credit', 'debit', 'credit_card', 'tarjeta'].includes(v)) return 'card';
  if (['transfer', 'bank_transfer', 'wire', 'zelle', 'ach',
       'transferencia'].includes(v))                                       return 'transfer';
  if (['stripe', 'paypal', 'online', 'airbnb', 'getmyboat', 'expedia',
       'viator', 'tripadvisor', 'groupon'].includes(v))                   return 'online_platform';
  if (v === 'mixed')                                                       return 'mixed';
  return 'unknown';
}

/**
 * runBookingPaymentHook
 *
 * @param {object} pgClient
 * @param {object} opts
 * @param {string}  opts.bookingId
 * @param {number}  [opts.paymentAmount] — defaults to AR.amount or booking.balance_pending
 * @param {string}  [opts.paymentMethod]
 * @param {string}  [opts.notes]
 * @returns {{ transactionId, arId, ledgerId, alreadyPaid }}
 */
async function runBookingPaymentHook(pgClient, { bookingId, paymentAmount, paymentMethod, notes }) {
  const { nanoid } = await import('nanoid');

  // ── 1. Load booking ────────────────────────────────────────────────
  const bkRes = await pgClient.query(
    `SELECT id, customer_name, broker_name, boat_id, boat_type,
            booking_date, total_amount, deposit_amount, balance_pending,
            payment_status, payment_method, platform
     FROM bookings WHERE id = $1`,
    [bookingId]
  );
  if (!bkRes.rows.length) throw new Error(`Booking not found: ${bookingId}`);
  const bk = bkRes.rows[0];

  if (bk.payment_status === 'paid') {
    console.log(`[PaymentHook] booking:${bookingId} already paid — skip`);
    return { transactionId: null, arId: null, ledgerId: null, alreadyPaid: true };
  }

  // ── 2. Find ledger (Fase 1 hook wrote notes='booking:{id}...') ──
  const ledRes = await pgClient.query(
    `SELECT * FROM bookings_ledger WHERE notes LIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`booking:${bookingId}%`]
  );
  const ledger = ledRes.rows[0] || null;

  // ── 3. Find pending AR linked to ledger ────────────────────────────
  let ar = null;
  if (ledger) {
    const arRes = await pgClient.query(
      `SELECT * FROM booking_receivables WHERE booking_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [ledger.id]
    );
    ar = arRes.rows[0] || null;
  }

  // ── 4. Determine amount to record ─────────────────────────────────
  const amountToPay = paymentAmount != null
    ? parseFloat(paymentAmount)
    : ar
      ? parseFloat(ar.amount)
      : Math.max(0, parseFloat(bk.balance_pending || 0));

  // ── 5. Revenue account (4010 → Tours, fallback to deposit placeholder) ──
  const accRes = await pgClient.query(
    `SELECT id FROM chart_of_accounts WHERE account_code = $1 LIMIT 1`,
    [REVENUE_ACCOUNT_CODE]
  );
  const accountId = accRes.rows.length ? accRes.rows[0].id : 'acc_booking_deposits_2500';

  // ── 6. Create accounting transaction ──────────────────────────────
  const txId = 'tx_pay_' + nanoid(8);
  const resolvedMethod = resolvePaymentMethod(paymentMethod || bk.payment_method);
  const txDesc = `Pago recibido — ${bk.customer_name || 'Cliente'}`
    + (bk.broker_name ? ` / Broker: ${bk.broker_name}` : '')
    + (bk.boat_type   ? ` / ${bk.boat_type}` : '')
    + ` (booking:${bookingId})`;

  await pgClient.query(
    `INSERT INTO transactions
       (id, transaction_date, transaction_type, account_id, amount,
        description, reference_id, reference_type, boat_id, notes, booking_id, ledger_id)
     VALUES ($1, CURRENT_DATE, 'income', $2, $3, $4, $5, 'booking', $6, $7, $8, $9)`,
    [
      txId, accountId, amountToPay, txDesc,
      bookingId, bk.boat_id || null, notes || null,
      bookingId, ledger ? ledger.id : null,
    ]
  );

  // ── 7. Mark AR as paid ─────────────────────────────────────────────
  if (ar) {
    await pgClient.query(
      `UPDATE booking_receivables SET status='paid', notes=COALESCE($1, notes) WHERE id=$2`,
      [notes || null, ar.id]
    );
  }

  // ── 8. Mark ledger as completed ───────────────────────────────────
  if (ledger) {
    await pgClient.query(
      `UPDATE bookings_ledger
       SET status='completed', payment_date=CURRENT_DATE,
           payment_method=COALESCE($1, payment_method)
       WHERE id=$2 AND status != 'completed'`,
      [resolvedMethod, ledger.id]
    );
  }

  // ── 9. Mark booking as paid (authoritative) ────────────────────────
  await pgClient.query(
    `UPDATE bookings
     SET payment_status='paid', balance_pending=0, payment_date=CURRENT_DATE,
         payment_method=COALESCE($1, payment_method), updated_at=NOW()
     WHERE id=$2`,
    [resolvePaymentMethod(paymentMethod) || null, bookingId]
  );

  console.log(
    `[PaymentHook] OK booking:${bookingId} | tx:${txId}` +
    ` | ar:${ar ? ar.id + '→paid' : 'none'}` +
    ` | ledger:${ledger ? ledger.id + '→completed' : 'none'}` +
    ` | amount:${amountToPay}`
  );

  return {
    transactionId: txId,
    arId:         ar     ? ar.id     : null,
    ledgerId:     ledger ? ledger.id : null,
    alreadyPaid:  false,
  };
}

module.exports = { runBookingPaymentHook };
