'use strict';

async function buildAlerts(pool) {
  const alerts = [];

  // A1: bookings con balance_pending > 0
  try {
    const r = await pool.query(`
      SELECT COUNT(*) cnt, COALESCE(SUM(balance_pending), 0) total
      FROM bookings WHERE balance_pending > 0
    `);
    const cnt = parseInt(r.rows[0].cnt);
    alerts.push({
      id: 'balance_pending',
      severity: cnt > 0 ? 'high' : 'info',
      title: 'Balance pendiente en reservas',
      message: cnt > 0
        ? `${cnt} reserva(s) con cobro pendiente — $${parseFloat(r.rows[0].total).toFixed(0)}`
        : 'No hay reservas con balance pendiente',
      count: cnt,
      amount: parseFloat(r.rows[0].total),
      link: '/schedule.html',
    });
  } catch (e) {
    console.warn('[AlertEngine] A1 error:', e.message);
  }

  // A2: income registrada pero no reconciliada (reconciled=0 es integer)
  try {
    const r = await pool.query(`
      SELECT COUNT(*) cnt, COALESCE(SUM(amount), 0) total
      FROM transactions
      WHERE transaction_type = 'income' AND reconciled = 0
    `);
    const cnt = parseInt(r.rows[0].cnt);
    alerts.push({
      id: 'income_unreconciled',
      severity: cnt > 5 ? 'high' : cnt > 0 ? 'medium' : 'info',
      title: 'Ingresos sin reconciliar',
      message: cnt > 0
        ? `${cnt} ingreso(s) registrado(s) sin reconciliar con banco — $${parseFloat(r.rows[0].total).toFixed(0)}`
        : 'Todos los ingresos están reconciliados',
      count: cnt,
      amount: parseFloat(r.rows[0].total),
      link: '/accounting.html',
    });
  } catch (e) {
    console.warn('[AlertEngine] A2 error:', e.message);
  }

  // A3: bank statements sin match
  try {
    const r = await pool.query(`
      SELECT COUNT(*) cnt, COALESCE(SUM(ABS(amount)), 0) total
      FROM bank_statements
      WHERE matched_transaction_id IS NULL
        AND (reconciliation_status IS NULL
             OR reconciliation_status NOT IN ('matched', 'reviewed'))
    `);
    const cnt = parseInt(r.rows[0].cnt);
    alerts.push({
      id: 'bank_unmatched',
      severity: cnt > 0 ? 'medium' : 'info',
      title: 'Movimientos bancarios sin match',
      message: cnt > 0
        ? `${cnt} movimiento(s) bancario(s) sin reconciliar — $${parseFloat(r.rows[0].total).toFixed(0)}`
        : 'Todos los movimientos bancarios reconciliados',
      count: cnt,
      amount: parseFloat(r.rows[0].total),
      link: '/accounting.html',
    });
  } catch (e) {
    console.warn('[AlertEngine] A3 error:', e.message);
  }

  // A4: pricing recommendations con gap >20% vs base (últimos 7d)
  try {
    const r = await pool.query(`
      SELECT COUNT(*) cnt
      FROM pricing_recommendations
      WHERE ABS((recommended_price - base_price)::float
            / NULLIF(base_price::float, 0)) > 0.20
        AND created_at > NOW() - INTERVAL '7 days'
    `);
    const cnt = parseInt(r.rows[0].cnt);
    if (cnt > 0) {
      alerts.push({
        id: 'pricing_gap',
        severity: 'medium',
        title: 'Precios con ajuste significativo',
        message: `${cnt} recomendación(es) con desviación >20% vs precio base en los últimos 7 días`,
        count: cnt,
        amount: null,
        link: '/dynamic-pricing.html',
      });
    }
  } catch (e) {
    console.warn('[AlertEngine] A4 error:', e.message);
  }

  // A5: conflictos de calendario (preparada — emitida solo si count > 0)
  try {
    const r = await pool.query(`
      SELECT COUNT(*) cnt FROM (
        SELECT a.id FROM bookings a JOIN bookings b
          ON a.boat_id = b.boat_id AND a.id < b.id
             AND a.booking_date::date = b.booking_date::date
        WHERE a.boat_id IS NOT NULL
      ) x
    `);
    const cnt = parseInt(r.rows[0].cnt);
    if (cnt > 0) {
      alerts.push({
        id: 'calendar_conflict',
        severity: 'high',
        title: 'Conflicto en calendario',
        message: `${cnt} par(es) de reservas del mismo barco en el mismo día detectados`,
        count: cnt,
        amount: null,
        link: '/schedule.html',
      });
    }
  } catch (e) {
    console.warn('[AlertEngine] A5 error:', e.message);
  }

  // A6: receivables vencidas (preparada — emitida solo si count > 0)
  try {
    const r = await pool.query(`
      SELECT COUNT(*) cnt FROM booking_receivables
      WHERE due_date < NOW() AND status NOT IN ('paid','cancelled')
    `);
    const cnt = parseInt(r.rows[0].cnt);
    if (cnt > 0) {
      alerts.push({
        id: 'receivable_overdue',
        severity: 'high',
        title: 'Cobros vencidos',
        message: `${cnt} cuenta(s) por cobrar vencida(s)`,
        count: cnt,
        amount: null,
        link: '/accounting.html',
      });
    }
  } catch (e) {
    console.warn('[AlertEngine] A6 error:', e.message);
  }

  return alerts;
}

function registerAlertRoutes(app, pool) {
  app.get('/api/alerts', async (req, res) => {
    try {
      const alerts = await buildAlerts(pool);
      res.json(alerts);
    } catch (err) {
      console.error('[AlertEngine] Error building alerts:', err.message);
      res.status(500).json({ error: 'Error generating alerts', detail: err.message });
    }
  });
}

module.exports = { registerAlertRoutes };
