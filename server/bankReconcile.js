/**
 * Fase V2.1 — Reconciliación bancaria mínima
 *
 * Endpoints:
 *   POST /api/bank/import-csv   → importar extracto CSV a bank_statements
 *   POST /api/bank/auto-match   → auto-match determinista contra transactions
 *   GET  /api/bank/unmatched    → listar bank_statements sin match
 *
 * Columnas reales usadas:
 *   bank_statements : id, statement_date, description, amount, transaction_type,
 *                     reference_number, matched_transaction_id, reconciliation_status,
 *                     classification_status, import_batch_id, notes
 *   transactions    : id, transaction_date, amount, description, booking_id,
 *                     reference_id, notes, reconciled
 */

const { parse }  = require('csv-parse/sync');
const multer     = require('multer');
const { nanoid } = require('nanoid');
const express    = require('express');

const textParser = express.text({ type: ['text/*', 'application/csv', 'application/octet-stream'], limit: '5mb' });

// multer: memory storage (sin disco)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza un valor de fecha a string YYYY-MM-DD o null */
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // ISO: 2026-04-23
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // MM/DD/YYYY o DD/MM/YYYY → asumir MM/DD/YYYY (estándar bancario US)
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (c.length === 4) return `${c}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
    if (a.length === 4) return `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`;
  }
  return null;
}

/** Detecta header CSV flexible. Retorna mapa normalizado → índice */
function detectColumns(headers) {
  const norm = h => h.toLowerCase().replace(/[^a-z]/g, '');
  const map = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    if (['date','transactiondate','statementdate','fecha'].includes(n))    map.date = i;
    if (['amount','importe','monto','value'].includes(n))                   map.amount = i;
    if (['description','descripcion','memo','details','concepto'].includes(n)) map.description = i;
    if (['reference','ref','referencenumber','referencia','id'].includes(n))   map.reference = i;
    if (['type','transactiontype','tipo','credit','debit'].includes(n))        map.type = i;
  });
  return map;
}

/** Deriver transaction_type desde amount o columna type */
function deriveType(raw, amount) {
  if (raw) {
    const r = String(raw).toLowerCase();
    if (['credit','cr','ingreso','deposit'].some(x => r.includes(x))) return 'credit';
    if (['debit','dr','gasto','charge','withdrawal'].some(x => r.includes(x))) return 'debit';
  }
  return parseFloat(amount || 0) >= 0 ? 'credit' : 'debit';
}

/** Diferencia en días absoluta entre dos strings YYYY-MM-DD */
function daysDiff(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}

/** Busca booking_id en texto (pattern: booking:XXXXX o book_XXXXX) */
function extractBookingRef(text) {
  if (!text) return null;
  const m = text.match(/booking[:\s]*(book_\S+)/i) || text.match(/(book_\w+)/i);
  return m ? m[1] : null;
}

// ── Registro de rutas ─────────────────────────────────────────────────────────

function registerBankReconcileRoutes(app, pool) {

  // ── POST /api/bank/import-csv ─────────────────────────────────────────────
  // Acepta: multipart (campo "file"), text/plain o JSON { csv: "..." }
  app.post('/api/bank/import-csv',
    // Middleware 1: text parser para text/* y application/csv
    (req, res, next) => {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('multipart')) return next(); // multipart → siguiente middleware
      textParser(req, res, next);                  // texto → req.body = string
    },
    // Middleware 2: multer solo para multipart
    (req, res, next) => {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('multipart')) return upload.single('file')(req, res, next);
      next();
    },
    async (req, res) => {
      try {
        // Obtener texto CSV: multipart file > body string > JSON {csv}
        let csvText;
        if (req.file) {
          csvText = req.file.buffer.toString('utf8');
        } else if (typeof req.body === 'string' && req.body.trim()) {
          csvText = req.body;
        } else if (req.body?.csv) {
          csvText = req.body.csv;
        } else {
          return res.status(400).json({ error: 'CSV requerido: campo "file" (multipart), body texto plano, o JSON { csv: "..." }' });
        }

        // Parsear CSV
        const records = parse(csvText, {
          columns: true, skip_empty_lines: true, trim: true, relax_quotes: true,
        });
        if (!records.length) return res.status(400).json({ error: 'CSV vacío o sin filas válidas' });

        const headers = Object.keys(records[0]);
        const colMap  = detectColumns(headers);

        if (colMap.date === undefined || colMap.amount === undefined) {
          return res.status(400).json({
            error: 'CSV no reconocido: se requieren columnas date y amount',
            headers_detectados: headers,
          });
        }

        const batchId = `batch_${nanoid(10)}`;
        const client  = await pool.connect();
        let inserted = 0, skipped = 0;
        const errors  = [];

        try {
          await client.query('BEGIN');

          for (const row of records) {
            const vals = Object.values(row);
            const rawDate   = colMap.date        !== undefined ? vals[colMap.date]        : null;
            const rawAmt    = colMap.amount       !== undefined ? vals[colMap.amount]      : null;
            const rawDesc   = colMap.description  !== undefined ? vals[colMap.description] : null;
            const rawRef    = colMap.reference    !== undefined ? vals[colMap.reference]   : null;
            const rawType   = colMap.type         !== undefined ? vals[colMap.type]        : null;

            const date   = parseDate(rawDate);
            const amount = parseFloat(String(rawAmt || '').replace(/[,$\s]/g, ''));

            if (!date || isNaN(amount)) {
              skipped++;
              errors.push({ row: rawDate, reason: 'fecha o importe inválido' });
              continue;
            }

            const description   = rawDesc || 'Importado desde CSV';
            const reference     = rawRef  || null;
            const txType        = deriveType(rawType, amount);
            const absAmount     = Math.abs(amount);

            const id = `bs_csv_${nanoid(10)}`;

            await client.query(`
              INSERT INTO bank_statements
                (id, statement_date, description, amount, transaction_type,
                 reference_number, reconciliation_status, classification_status,
                 import_batch_id, notes)
              VALUES ($1,$2,$3,$4,$5,$6,'unmatched','unclassified',$7,$8)
              ON CONFLICT DO NOTHING
            `, [id, date, description, absAmount, txType, reference, batchId,
                `CSV import batch ${batchId}`]);

            inserted++;
          }

          await client.query('COMMIT');
          console.log(`[BankReconcile] import-csv: batch=${batchId} inserted=${inserted} skipped=${skipped}`);
          res.json({ ok: true, batch_id: batchId, inserted, skipped, errors: errors.slice(0, 10) });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        console.error('[BankReconcile] import-csv error:', err.message);
        res.status(500).json({ error: 'Error importando CSV', detail: err.message });
      }
    }
  );

  // ── POST /api/bank/auto-match ─────────────────────────────────────────────
  app.post('/api/bank/auto-match', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Cargar todas las bank_statements unmatched
      const { rows: unmatched } = await client.query(`
        SELECT id, statement_date, amount, description, reference_number
        FROM bank_statements
        WHERE reconciliation_status != 'matched'
        ORDER BY statement_date
      `);

      // Cargar transactions no reconciliadas (reconciled = 0 o NULL)
      const { rows: txns } = await client.query(`
        SELECT id, transaction_date, amount, description, booking_id, reference_id, notes
        FROM transactions
        WHERE (reconciled IS NULL OR reconciled = 0)
        ORDER BY transaction_date
      `);

      let matched = 0, skipped = 0;
      const matchLog = [];

      for (const bs of unmatched) {
        const bsAmt  = parseFloat(bs.amount);
        const bsDate = bs.statement_date; // ya es Date object desde pg
        const bsDateStr = bsDate instanceof Date
          ? bsDate.toISOString().slice(0, 10)
          : String(bsDate).slice(0, 10);

        // Extraer booking ref del extracto bancario (si existe)
        const bsBookingRef = extractBookingRef(bs.description) ||
                             extractBookingRef(bs.reference_number);

        // Candidatos: amount ±1 y fecha ±2 días
        let candidates = txns.filter(tx => {
          const txAmt = parseFloat(tx.amount);
          const txDateStr = tx.transaction_date instanceof Date
            ? tx.transaction_date.toISOString().slice(0, 10)
            : String(tx.transaction_date).slice(0, 10);
          return Math.abs(txAmt - bsAmt) <= 1 && daysDiff(bsDateStr, txDateStr) <= 2;
        });

        // Priorizar por referencia booking si existe
        if (bsBookingRef && candidates.length > 1) {
          const byRef = candidates.filter(tx =>
            (tx.booking_id && tx.booking_id === bsBookingRef) ||
            (tx.reference_id && tx.reference_id === bsBookingRef) ||
            (tx.notes && tx.notes.includes(bsBookingRef))
          );
          if (byRef.length > 0) candidates = byRef;
        }

        if (candidates.length !== 1) {
          skipped++;
          matchLog.push({ bs_id: bs.id, status: candidates.length === 0 ? 'no_match' : 'ambiguous', candidates: candidates.length });
          continue;
        }

        const tx = candidates[0];

        // Actualizar bank_statement
        await client.query(`
          UPDATE bank_statements SET
            matched_transaction_id = $1,
            reconciliation_status  = 'matched',
            classification_status  = 'posted',
            updated_at             = NOW()
          WHERE id = $2
        `, [tx.id, bs.id]);

        // Actualizar transaction
        await client.query(`
          UPDATE transactions SET reconciled = 1, updated_at = NOW()
          WHERE id = $1
        `, [tx.id]);

        // Quitar de la lista para no re-usar el mismo tx en el mismo batch
        txns.splice(txns.indexOf(tx), 1);

        matched++;
        matchLog.push({ bs_id: bs.id, tx_id: tx.id, amount: bsAmt, status: 'matched' });
      }

      await client.query('COMMIT');
      console.log(`[BankReconcile] auto-match: matched=${matched} skipped=${skipped}`);
      res.json({ ok: true, matched, skipped, log: matchLog });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[BankReconcile] auto-match error:', err.message);
      res.status(500).json({ error: 'Error en auto-match', detail: err.message });
    } finally {
      client.release();
    }
  });

  // ── GET /api/bank/unmatched ───────────────────────────────────────────────
  app.get('/api/bank/unmatched', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          id, statement_date, description, amount, transaction_type,
          reference_number, reconciliation_status, classification_status,
          import_batch_id, notes, created_at
        FROM bank_statements
        WHERE reconciliation_status != 'matched'
        ORDER BY statement_date DESC
      `);
      res.json({ ok: true, total: rows.length, items: rows });
    } catch (err) {
      console.error('[BankReconcile] unmatched error:', err.message);
      res.status(500).json({ error: 'Error listando unmatched', detail: err.message });
    }
  });
}

module.exports = { registerBankReconcileRoutes };
