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
 *  'valid'    — amount matches expected (within tolerance)
 *  'advisory' — manual booking with price mismatch (logged, not blocked)
 *  'override' — mismatch allowed by explicit override
 *  'blocked'  — mismatch on platform booking without override → reject
 *  'unknown'  — no pricing data available (pass-through allowed)
 *
 * RULE: Manual bookings (is_manual=true or platform='Manual') are NEVER
 * blocked — staff may deliberately enter custom/discounted prices.
 * The mismatch is recorded for audit but the booking proceeds.
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

// Tolerance: allow up to $50 OR 15% of expected price (whichever is larger)
// This prevents false positives on group discounts, broker rates, and rounding
const PRICE_TOLERANCE_FIXED   = 50;      // $50 flat floor
const PRICE_TOLERANCE_PCT     = 0.15;    // 15% of expected

function getTolerance(expected) {
  if (!expected || expected <= 0) return PRICE_TOLERANCE_FIXED;
  return Math.max(PRICE_TOLERANCE_FIXED, expected * PRICE_TOLERANCE_PCT);
}

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
        // Sanity check: rate must be > 0 and < 10000 $/h to be plausible
        if (rate > 0 && rate < 10000) {
          return { expected: Math.round(rate * h * 100) / 100, source: 'hourly_rate_base' };
        }
        // Rate seems implausible (e.g. stored in cents) — pass-through
        console.warn(`[revenueIntegrity] Suspicious hourly_rate_base=${rate} for boat=${boat_id} — skipping`);
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
 *   'valid'    — price matches within tolerance
 *   'advisory' — manual booking, price mismatch logged but not blocked
 *   'override' — mismatch with valid override fields
 *   'blocked'  — mismatch without override on a platform booking
 *   'unknown'  — no pricing data to validate
 *
 * @param {object} pool - pg Pool
 * @param {object} booking - booking payload from request body
 * @param {object} [options]
 * @param {boolean} [options.isManual=false] - true for manually created bookings
 */
async function validateRevenue(pool, booking, options = {}) {
  const {
    boat_id, duration_hours, total_amount,
    pricing_override, override_reason, override_authorized_by,
    platform,
  } = booking;

  // Determine if this is a manual booking (staff-created custom booking)
  const isManual = options.isManual ||
    booking.is_manual === true ||
    platform === 'Manual' ||
    platform === 'manual';

  const actual = parseFloat(total_amount);
  if (isNaN(actual) || actual <= 0) {
    return {
      status: 'invalid', expected: null, actual, delta: null,
      blocked: true, source: 'validation',
      message: 'El monto total debe ser mayor a $0.',
    };
  }

  const { expected, source } = await getExpectedPrice(pool, { boat_id, duration_hours });

  if (expected === null) {
    return {
      status: 'unknown', expected: null, actual, delta: null,
      blocked: false, source,
      message: `Sin datos de precio para barco=${boat_id}, duración=${duration_hours}h — permitido`,
    };
  }

  const delta = actual - expected;
  const tolerance = getTolerance(expected);

  if (Math.abs(delta) <= tolerance) {
    return {
      status: 'valid', expected, actual, delta,
      blocked: false, source,
      message: `Precio OK: $${actual} ≈ esperado $${expected} (tolerancia ±$${tolerance.toFixed(0)})`,
    };
  }

  // Mismatch detected — check for explicit override first
  if (pricing_override && override_reason && override_reason.trim()) {
    return {
      status: 'override', expected, actual, delta,
      blocked: false, source,
      message: `Override autorizado por ${override_authorized_by || 'usuario'}. Razón: ${override_reason}. Delta: $${delta.toFixed(2)}`,
    };
  }

  // MANUAL BOOKINGS: never block — just log advisory
  if (isManual) {
    return {
      status: 'advisory', expected, actual, delta,
      blocked: false, source,
      message: `[Reserva manual] Precio $${actual} difiere del esperado $${expected} (delta $${delta.toFixed(2)}). Registrado para auditoría.`,
    };
  }

  // Platform booking without override → block
  return {
    status: 'blocked', expected, actual, delta,
    blocked: true, source,
    message: `Alerta de integridad: duración=${duration_hours}h, esperado $${expected}, recibido $${actual} (delta $${delta.toFixed(2)}). Envía pricing_override=true con override_reason para forzar.`,
  };
}

/**
 * Run a full audit of all bookings and return mismatches.
 */
async function auditAllBookings(pool) {
  const bks = await pool.query(
    `SELECT id, customer_name, customer_email, booking_date, duration_hours,
            total_amount, balance_pending, payment_status, status, boat_id, boat_type, is_manual
     FROM bookings WHERE status NOT IN ('cancelled','blocked') ORDER BY booking_date DESC`
  );

  const results = [];
  for (const bk of bks.rows) {
    const { expected, source } = await getExpectedPrice(pool, bk);
    if (expected === null) continue;
    const actual = parseFloat(bk.total_amount);
    const delta = actual - expected;
    const tolerance = getTolerance(expected);
    results.push({
      booking_id: bk.id,
      client: bk.customer_name,
      email: bk.customer_email,
      date: bk.booking_date,
      duration: bk.duration_hours + 'h',
      is_manual: bk.is_manual,
      actual_total: actual,
      expected_total: expected,
      delta: parseFloat(delta.toFixed(2)),
      status: bk.status,
      payment_status: bk.payment_status,
      pricing_source: source,
      integrity: Math.abs(delta) <= tolerance ? 'valid' : (delta < 0 ? 'underpaid' : 'overpaid_or_discount'),
      suggested_action: Math.abs(delta) <= tolerance
        ? 'OK'
        : (delta < 0 ? `Corregir total a $${expected}` : `Verificar descuento — $${Math.abs(delta).toFixed(2)} sobre esperado`),
    });
  }
  return results;
}

module.exports = { validateRevenue, getExpectedPrice, auditAllBookings, FALLBACK_PRICING };
