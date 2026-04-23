/**
 * Fase 4B — Backfill histórico contable (audit + dry-run + reparación mínima)
 *
 * Estrategia:
 *   - Bookings sin ledger      → AUDIT ONLY (riesgo alto, payment_status ambiguo)
 *   - Ledger sin AR            → SAFE REPAIR  (determinista, 1 row)
 *   - Ledger sin transaction   → SKIP (normal para bookings no pagados)
 *   - Pagados sin transaction  → NO HAY (0 detectados)
 *
 * Endpoints:
 *   GET  /api/accounting/backfill-audit        → dry-run completo (0 escrituras)
 *   POST /api/accounting/backfill-repair-ar    → repara solo AR faltante (seguro)
 */

const { nanoid } = require('nanoid');

function registerBackfillRoutes(app, pool) {
  // ── GET /api/accounting/backfill-audit ─────────────────────────────────────
  app.get('/api/accounting/backfill-audit', async (req, res) => {
    try {
      const report = await buildAuditReport(pool);
      res.json({ ok: true, generated_at: new Date().toISOString(), ...report });
    } catch (err) {
      console.error('[BackfillAudit] Error en audit:', err.message);
      res.status(500).json({ error: 'Error generando audit report', detail: err.message });
    }
  });

  // ── POST /api/accounting/backfill-repair-ar ────────────────────────────────
  // Repara bookings que tienen ledger pero les falta booking_receivable.
  // DRY-RUN por defecto; pasar { confirm: true } en body para ejecutar escritura.
  app.post('/api/accounting/backfill-repair-ar', async (req, res) => {
    const dryRun = req.body?.confirm !== true;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const gaps = await client.query(`
        SELECT
          b.id            AS booking_id,
          b.payment_status,
          b.total_amount,
          b.balance_pending,
          b.platform,
          b.booking_date,
          bl.id           AS ledger_id,
          bl.status       AS ledger_status,
          bl.customer_name,
          bl.customer_email,
          bl.customer_phone,
          bl.boat_id,
          bl.broker_id
        FROM bookings b
        JOIN bookings_ledger bl ON bl.notes LIKE 'booking:' || b.id || '%'
        WHERE NOT EXISTS (
          SELECT 1 FROM booking_receivables ar WHERE ar.booking_id = bl.id
        )
      `);

      if (gaps.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.json({ ok: true, dry_run: dryRun, repaired: 0, message: 'Ningún gap AR detectado' });
      }

      const results = [];

      for (const row of gaps.rows) {
        const arId = `ar_bf_${nanoid(10)}`;
        const amount = parseFloat(row.total_amount || 0);
        const dueDate = row.booking_date || new Date().toISOString().slice(0, 10);

        const arPayload = {
          id:           arId,
          booking_id:   row.ledger_id,           // schema quirk: AR.booking_id stores ledger id
          amount:       amount,
          due_date:     dueDate,
          status:       'pending',
          client_name:  row.customer_name  || 'Cliente histórico',
          client_email: row.customer_email || null,
          client_phone: row.customer_phone || null,
          boat_id:      row.boat_id        || null,
          broker_id:    row.broker_id      || null,
          party_type:   row.broker_id ? 'broker' : 'customer',
          party_id:     row.broker_id || null,
          party_name:   row.customer_name || null,
          notes:        `Backfill Fase 4B — ${new Date().toISOString()}`,
        };

        if (!dryRun) {
          await client.query(`
            INSERT INTO booking_receivables
              (id, booking_id, amount, due_date, status,
               client_name, client_email, client_phone,
               boat_id, broker_id, party_type, party_id, party_name, notes)
            VALUES
              ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (id) DO NOTHING
          `, [
            arPayload.id, arPayload.booking_id, arPayload.amount, arPayload.due_date,
            arPayload.status, arPayload.client_name, arPayload.client_email,
            arPayload.client_phone, arPayload.boat_id, arPayload.broker_id,
            arPayload.party_type, arPayload.party_id, arPayload.party_name, arPayload.notes,
          ]);
        }

        results.push({
          booking_id: row.booking_id,
          ledger_id:  row.ledger_id,
          ar_id:      dryRun ? `[dry-run: ${arId}]` : arId,
          amount:     amount,
          action:     dryRun ? 'would_create_ar' : 'created_ar',
        });
      }

      if (!dryRun) {
        await client.query('COMMIT');
        console.log(`[BackfillAudit] AR repair: ${results.length} filas creadas`);
      } else {
        await client.query('ROLLBACK');
      }

      res.json({
        ok:       true,
        dry_run:  dryRun,
        repaired: dryRun ? 0 : results.length,
        would_repair: dryRun ? results.length : 0,
        results,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[BackfillAudit] Error en repair-ar:', err.message);
      res.status(500).json({ error: 'Error en reparación AR', detail: err.message });
    } finally {
      client.release();
    }
  });

  // ── GET /api/accounting/manual-review ──────────────────────────────────────
  // Fase 5A: Lista enriquecida de bookings AUDIT_ONLY para revisión manual.
  // 0 escrituras. Acepta ?format=html para salida legible en browser.
  app.get('/api/accounting/manual-review', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          b.id,
          b.booking_date,
          b.platform,
          b.total_amount,
          b.balance_pending,
          b.payment_status,
          b.created_at::date AS created_date,
          b.customer_name,
          b.customer_email,
          b.boat_id
        FROM bookings b
        WHERE NOT EXISTS (
          SELECT 1 FROM bookings_ledger bl
          WHERE bl.notes LIKE 'booking:' || b.id || '%'
        )
        ORDER BY b.booking_date DESC NULLS LAST
      `);

      const reviewed = rows.map(r => enrichAuditOnly(r));

      if (req.query.format === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(renderHtmlReport(reviewed));
      }

      res.json({
        ok:           true,
        generated_at: new Date().toISOString(),
        total:        reviewed.length,
        bookings:     reviewed,
      });
    } catch (err) {
      console.error('[BackfillAudit] Error en manual-review:', err.message);
      res.status(500).json({ error: 'Error generando manual review', detail: err.message });
    }
  });
}

// ── Enriquecimiento de cada booking AUDIT_ONLY ───────────────────────────────
function enrichAuditOnly(b) {
  const reasons = [];
  const actions = [];

  // Motivo 1: payment_status ausente
  if (!b.payment_status || b.payment_status.trim() === '') {
    reasons.push('payment_status NULL o vacío — estado de pago desconocido');
    actions.push('Verificar en plataforma origen si el pago fue recibido');
  }

  // Motivo 2: balance_pending = 0 pero sin payment_status='paid'
  const bal = parseFloat(b.balance_pending || 0);
  const total = parseFloat(b.total_amount || 0);
  if (bal === 0 && total > 0 && b.payment_status !== 'paid') {
    reasons.push('balance_pending=0 pero payment_status≠"paid" — posible pago no registrado');
    actions.push('Confirmar si booking fue cobrado; si sí, marcar como "paid" y luego ejecutar backfill');
  }

  // Motivo 3: ID sugiere dato pre-migración (sufijo 'abc' o similar)
  if (/abc$/.test(b.id)) {
    reasons.push('ID con sufijo "abc" — probable dato de seed o migración inicial');
    actions.push('Confirmar si es reserva real o dato de prueba; eliminar si es seed');
  }

  // Motivo 4: fecha de reserva en el pasado sin registro contable
  const bkDate = b.booking_date ? new Date(b.booking_date) : null;
  if (bkDate && bkDate < new Date('2026-01-01')) {
    reasons.push('Fecha de reserva anterior a 2026 — fuera del período de activación Fase 1');
    actions.push('Evaluar si corresponde incluir en contabilidad histórica del período anterior');
  }

  return {
    booking_id:      b.id,
    booking_date:    b.booking_date || null,
    platform:        b.platform || null,
    total_amount:    parseFloat(b.total_amount || 0),
    balance_pending: parseFloat(b.balance_pending || 0),
    payment_status:  b.payment_status || '(vacío)',
    customer_name:   b.customer_name || null,
    created_date:    b.created_date || null,
    exclusion_reasons: reasons,
    suggested_actions: actions,
    risk_level: reasons.length >= 2 ? 'ALTO' : 'MEDIO',
  };
}

// ── Renderizado HTML (trivial, sin dependencias frontend) ────────────────────
function renderHtmlReport(bookings) {
  const rows = bookings.map(b => `
    <tr>
      <td><code>${b.booking_id}</code></td>
      <td>${b.booking_date || '—'}</td>
      <td>${b.platform || '—'}</td>
      <td style="text-align:right">$${b.total_amount.toFixed(2)}</td>
      <td>${b.payment_status}</td>
      <td style="color:#b45309">${b.exclusion_reasons.join('<br>')}</td>
      <td>${b.suggested_actions.map(a => `• ${a}`).join('<br>')}</td>
      <td style="font-weight:bold;color:${b.risk_level==='ALTO'?'#dc2626':'#d97706'}">${b.risk_level}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Nadaki — Revisión Manual Contable (Fase 5A)</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:2rem;background:#0f172a;color:#e2e8f0}
    h1{color:#38bdf8;margin-bottom:.25rem}
    p.meta{color:#94a3b8;font-size:.85rem;margin-bottom:1.5rem}
    table{width:100%;border-collapse:collapse;font-size:.85rem}
    th{background:#1e293b;color:#94a3b8;padding:.6rem .75rem;text-align:left;border-bottom:1px solid #334155}
    td{padding:.55rem .75rem;border-bottom:1px solid #1e293b;vertical-align:top}
    tr:hover td{background:#1e293b}
    code{background:#1e293b;padding:.1rem .35rem;border-radius:4px;font-size:.8rem;color:#7dd3fc}
    .badge{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:600}
    .alto{background:#7f1d1d;color:#fca5a5}
    .medio{background:#78350f;color:#fcd34d}
  </style>
</head>
<body>
  <h1>Revisión Manual Contable — Fase 5A</h1>
  <p class="meta">Bookings históricos excluidos del backfill automático · Generado: ${new Date().toISOString()} · Total: ${bookings.length} reservas</p>
  <table>
    <thead>
      <tr>
        <th>Booking ID</th><th>Fecha</th><th>Plataforma</th>
        <th>Importe</th><th>Estado pago</th>
        <th>Motivo exclusión</th><th>Acción sugerida</th><th>Riesgo</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#4ade80;padding:2rem">Sin bookings pendientes de revisión</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

// ── Lógica de audit compartida (también usada por el GET) ───────────────────
async function buildAuditReport(pool) {
  const q = sql => pool.query(sql);

  // 1. Sin ledger
  const { rows: noLedger } = await q(`
    SELECT b.id, b.payment_status, b.total_amount, b.balance_pending,
           b.booking_date, b.platform, b.created_at::date AS created_date
    FROM bookings b
    WHERE NOT EXISTS (
      SELECT 1 FROM bookings_ledger bl WHERE bl.notes LIKE 'booking:' || b.id || '%'
    )
    ORDER BY b.created_at
  `);

  // 2. Ledger sin AR
  const { rows: ledgerNoAR } = await q(`
    SELECT b.id AS booking_id, b.payment_status, b.total_amount,
           bl.id AS ledger_id, bl.status AS ledger_status
    FROM bookings b
    JOIN bookings_ledger bl ON bl.notes LIKE 'booking:' || b.id || '%'
    WHERE NOT EXISTS (
      SELECT 1 FROM booking_receivables ar WHERE ar.booking_id = bl.id
    )
  `);

  // 3. Ledger sin ninguna transaction (solo informativos — estado normal si no pagados)
  const { rows: ledgerNoTx } = await q(`
    SELECT b.id AS booking_id, b.payment_status, b.total_amount, bl.id AS ledger_id
    FROM bookings b
    JOIN bookings_ledger bl ON bl.notes LIKE 'booking:' || b.id || '%'
    WHERE NOT EXISTS (
      SELECT 1 FROM transactions tx WHERE tx.booking_id = b.id
    )
  `);

  // 4. Pagados sin income transaction
  const { rows: paidNoTx } = await q(`
    SELECT b.id, b.payment_status, b.total_amount
    FROM bookings b
    WHERE b.payment_status = 'paid'
    AND NOT EXISTS (
      SELECT 1 FROM transactions tx
      WHERE tx.booking_id = b.id AND tx.transaction_type = 'income'
    )
  `);

  // 5. Totales globales
  const { rows: [totals] } = await q(`
    SELECT
      COUNT(*)                                                           AS total_bookings,
      COUNT(*) FILTER (WHERE payment_status = 'paid')                    AS total_paid,
      COUNT(*) FILTER (WHERE payment_status IS NULL OR payment_status = '') AS total_unpaid
    FROM bookings
  `);

  return {
    summary: {
      total_bookings:             parseInt(totals.total_bookings),
      total_paid:                 parseInt(totals.total_paid),
      total_unpaid:               parseInt(totals.total_unpaid),
      no_ledger:                  noLedger.length,
      ledger_no_ar:               ledgerNoAR.length,
      ledger_no_transaction:      ledgerNoTx.length,
      paid_no_income_transaction: paidNoTx.length,
    },
    recommendations: {
      no_ledger:      noLedger.length > 0
        ? 'AUDIT_ONLY — payment_status ambiguo; requiere revisión manual antes de backfill'
        : 'OK',
      ledger_no_ar:   ledgerNoAR.length > 0
        ? 'SAFE_REPAIR — usar POST /api/accounting/backfill-repair-ar con { confirm: true }'
        : 'OK',
      ledger_no_tx:   ledgerNoTx.length > 0
        ? 'NO_ACTION — estado normal para bookings pendientes de pago'
        : 'OK',
      paid_no_tx:     paidNoTx.length > 0
        ? 'ALERT — requiere revisión urgente'
        : 'OK',
    },
    detail: {
      no_ledger:             noLedger,
      ledger_no_ar:          ledgerNoAR,
      ledger_no_transaction: ledgerNoTx,
      paid_no_income_tx:     paidNoTx,
    },
  };
}

module.exports = { registerBackfillRoutes };
