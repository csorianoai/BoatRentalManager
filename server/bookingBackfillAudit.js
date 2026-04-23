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
