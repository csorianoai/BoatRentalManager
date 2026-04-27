'use strict';

/**
 * Revenue Integrity Module — Fase 6 (Nadaki Excursions)
 *
 * Validates that the booking total_amount matches the expected price
 * for the given boat and duration. Prevents silent price mismatches.
 *
 * Pricing sources (priority order):
 *  1. boat.hourly_rate_base  × duration_hours
 *  2. FALLBACK_TABLE (Sea Ray 40' / standard charter rates)
 *
 * Status values:
 *  'valid'   — amount matches expected
 *  'override'— mismatch allowed by explicit override
 *  'blocked' — mismatch without override → reject booking
 *  'unknown' — no pricing data available (pass-through allowed)
 */

// Fallback pricing for standard Sea Ray / nadaki charters
// Source: website pricing page (documented fallback, not from DB)
const FALLBACK_PRICING = {
  2: 300,
  3: 420,
  4: 560,
  5: 700,
  6: 840,
  7: 980,
  8: 1120,
};

// Boats that use the fallback pricing table
const FALLBACK_BOAT_IDS = ['boat_searay36', 'boat_searay31'];

// Tolerance: allow up to $5 rounding difference without flagging
const PRICE_TOLERANCE = 5;

/**
 * Calculate expected price for a booking.
 * Returns { expected, source } or { expected: null, source: 'unknown' }.
 */
async function getExpectedPrice(pool, { boat_id, duration_hours }) {
  const h = parseFloat(duration_hours);
  if (!h || h <= 0) return { expected: null, source: 'invalid_duration' };

  if (boat_id) {
    // Source 1: fallback charter package pricing for known boats
    // (takes priority — hourly_rate_base in boats table is operational rate, not charter sale price)
    if (FALLBACK_BOAT_IDS.includes(boat_id)) {
      const price = FALLBACK_PRICING[h] || null;
      if (price) return { expected: price, source: 'fallback_table_nadaki' };
    }

    // Source 2: boats table hourly_rate_base for boats NOT in fallback list
    try {
      const r = await pool.query('SELECT hourly_rate_base FROM boats WHERE id=$1', [boat_id]);
      if (r.rows.length && r.rows[0].hourly_rate_base) {
        const rate = parseFloat(r.rows[0].hourly_rate_base);
        return { expected: Math.round(rate * h * 100) / 100, source: 'hourly_rate_base' };
      }
    } catch (_) {}
  }

  return { expected: null, source: 'unknown' };
}

/**
 * Validate a booking's revenue integrity.
 *
 * Returns:
 *  { status, expected, actual, delta, blocked, message, source }
 *
 * status:
 *   'valid'   — price matches
 *   'override'— mismatch with valid override fields
 *   'blocked' — mismatch without override (reject)
 *   'unknown' — no pricing data to validate
 */
async function validateRevenue(pool, booking) {
  const {
    boat_id, duration_hours, total_amount,
    pricing_override, override_reason, override_authorized_by,
  } = booking;

  const actual = parseFloat(total_amount);
  const { expected, source } = await getExpectedPrice(pool, { boat_id, duration_hours });

  if (expected === null) {
    return {
      status: 'unknown', expected: null, actual, delta: null,
      blocked: false, source,
      message: `No pricing data for boat=${boat_id}, duration=${duration_hours}h — pass-through allowed`,
    };
  }

  const delta = actual - expected;

  if (Math.abs(delta) <= PRICE_TOLERANCE) {
    return {
      status: 'valid', expected, actual, delta,
      blocked: false, source,
      message: `Price OK: $${actual} ≈ expected $${expected}`,
    };
  }

  // Mismatch detected
  if (pricing_override && override_reason && override_reason.trim()) {
    return {
      status: 'override', expected, actual, delta,
      blocked: false, source,
      message: `Price override authorized by ${override_authorized_by || 'user'}. Reason: ${override_reason}. Delta: $${delta.toFixed(2)}`,
    };
  }

  // No override → block
  return {
    status: 'blocked', expected, actual, delta,
    blocked: true, source,
    message: `Revenue integrity violation: duration=${duration_hours}h, expected $${expected}, got $${actual} (delta $${delta.toFixed(2)}). To override, set pricing_override=true with override_reason.`,
  };
}

/**
 * Run a full audit of all bookings and return mismatches.
 */
async function auditAllBookings(pool) {
  const bks = await pool.query(
    `SELECT id, customer_name, customer_email, booking_date, duration_hours,
            total_amount, balance_pending, payment_status, status, boat_id, boat_type
     FROM bookings WHERE status NOT IN ('cancelled','blocked') ORDER BY booking_date DESC`
  );

  const results = [];
  for (const bk of bks.rows) {
    const { expected, source } = await getExpectedPrice(pool, bk);
    if (expected === null) continue;
    const actual = parseFloat(bk.total_amount);
    const delta = actual - expected;
    results.push({
      booking_id: bk.id,
      client: bk.customer_name,
      email: bk.customer_email,
      date: bk.booking_date,
      duration: bk.duration_hours + 'h',
      actual_total: actual,
      expected_total: expected,
      delta: parseFloat(delta.toFixed(2)),
      status: bk.status,
      payment_status: bk.payment_status,
      pricing_source: source,
      integrity: Math.abs(delta) <= PRICE_TOLERANCE ? 'valid' : (delta < 0 ? 'underpaid' : 'overpaid_or_discount'),
      suggested_action: Math.abs(delta) <= PRICE_TOLERANCE
        ? 'OK'
        : (delta < 0 ? `Correct total to $${expected}` : `Verify discount — $${Math.abs(delta).toFixed(2)} over expected`),
    });
  }
  return results;
}

module.exports = { validateRevenue, getExpectedPrice, auditAllBookings, FALLBACK_PRICING };
