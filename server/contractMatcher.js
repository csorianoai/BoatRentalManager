'use strict';

/**
 * contractMatcher.js — Calendar-first Contract Matching Service
 *
 * Function names aligned with spec. Delegates heavy lifting to
 * contractEngine.js (PDF parser, scoring, batch pipeline).
 *
 * Exports: parseContractText, parseContractPdf, normalizeBoatName,
 *          normalizeTime, normalizeMoney, normalizeName,
 *          scoreContractAgainstBooking, findBestBookingForContract,
 *          matchAuditAll, batchAutoLink
 */

const engine = require('./contractEngine');

/* ═══════════════════════════════════════════════════════════════
   NORMALIZERS (spec-aligned aliases)
   ═══════════════════════════════════════════════════════════════ */

/** "SEA RAY 500" | "Searay 50ft" | "Cranchi 50" → canonical key */
function normalizeBoatName(raw) {
  return engine.normalizeBoat(raw);
}

/** "4PM" | "4:30pm" | "16:00" → minutes since midnight (null if unparseable) */
function normalizeTime(raw) {
  return engine.parseTimeToMinutes(raw);
}

/** "$1,100.00" | "1100" | "$714.42" → float (null if unparseable) */
function normalizeMoney(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

/** "Rohit Chaudhary" → lowercase trimmed for comparison */
function normalizeName(raw) {
  return raw ? String(raw).toLowerCase().trim() : '';
}

/* ═══════════════════════════════════════════════════════════════
   PARSER
   ═══════════════════════════════════════════════════════════════ */

/**
 * Extract contract metadata from raw text.
 * Supports formats: "3PM 9PM", "4pm to 7:30pm", "4:15PM 7:15PM",
 * "$1100", "$714.42", "Searay 50", "Cranchi 50", "Viking 50".
 */
function parseContractText(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text;

  // ── Rental date ──────────────────────────────────────────
  let rental_date = null;
  // YYYY-MM-DD
  let dm = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dm) rental_date = dm[1];
  // MM/DD/YYYY
  if (!rental_date) {
    dm = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (dm) rental_date = `${dm[3]}-${String(dm[1]).padStart(2,'0')}-${String(dm[2]).padStart(2,'0')}`;
  }
  // Month DD, YYYY
  if (!rental_date) {
    const MONTHS = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
    dm = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})[,\s]+(\d{4})\b/i);
    if (dm) rental_date = `${dm[3]}-${MONTHS[dm[1].toLowerCase()]}-${String(dm[2]).padStart(2,'0')}`;
  }

  // ── Times: "3PM to 9PM" | "4:30pm" | "4:15PM 7:15PM" ────
  const timeRx = /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)(?:\.m\.)?)\b/gi;
  const times = [...t.matchAll(timeRx)].map(m => m[1].trim());
  const start_time_raw = times[0] || null;
  const end_time_raw   = times[1] || null;
  const start_minutes  = normalizeTime(start_time_raw);
  const end_minutes    = normalizeTime(end_time_raw);

  // ── Boat name (label-first, then inline) ──────────────────
  let boat_name = null;
  // Label: "Vessel: Searay 50"
  const boatLblRx = /(?:vessel|yacht|boat|embarcaci[oó]n)\s*:\s*([^\n,;]{3,40})/i;
  const boatLbl = t.match(boatLblRx);
  if (boatLbl) {
    boat_name = boatLbl[1].trim();
  } else {
    // Inline: "Searay 50", "Sea Ray 500", "Cranchi 50", "Viking Princess", "Viking 50"
    const inlineBoatRx = /\b(sea\s*ray|searay|cranchi|viking\s*(?:princess)?|viking|catamaran)\b(?:\s+(?:\d+['ft]?|luxury\s*yacht|yacht))?/i;
    const ib = t.match(inlineBoatRx);
    if (ib) boat_name = ib[0].trim().replace(/\s+/g, ' ');
  }

  // ── Customer name (label-first, then stop at newline) ─────
  let customer_name = null;
  const nameLblRx = /(?:customer|client|renter|charterer)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i;
  const nm = t.match(nameLblRx);
  if (nm) customer_name = nm[1].trim();

  // ── Amounts ───────────────────────────────────────────────
  // Total: "Total Amount: $1100" | "Total: $714.42" | "Charter Price: $1200"
  const totalRx = /(?:total\s*(?:amount|price|fee)?|charter\s*(?:price|fee)|amount\s*due|rental\s*(?:fee|price))\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i;
  const totalM  = t.match(totalRx);
  const total_amount = totalM ? normalizeMoney(totalM[1]) : null;

  // Deposit: "Deposit: $200" | "Retainer: $250" | "Down Payment: $120"
  const depRx  = /(?:deposit|retainer|down\s*payment|security)\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i;
  const depM   = t.match(depRx);
  const deposit_amount = depM ? normalizeMoney(depM[1]) : null;

  // ── Email ─────────────────────────────────────────────────
  const emailM = t.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);

  // ── Phone (labeled, 10+ digits, NOT dates) ────────────────
  let phone = null;
  const phoneLblRx = /(?:phone|tel|cell|mobile|ph)\s*:?\s*([\d\s\-().+]{10,20})/i;
  const phoneLbl = t.match(phoneLblRx);
  if (phoneLbl) phone = phoneLbl[1].replace(/\D/g,'').slice(-10);

  // ── Document ref ─────────────────────────────────────────
  const refRx = /(?:contract|agreement|ref(?:erence)?)\s*#\s*([A-Z0-9\-]{3,20})/i;
  const refM  = t.match(refRx);

  const confidence = [rental_date, start_time_raw, boat_name, customer_name, total_amount].filter(Boolean).length;

  return {
    rental_date,
    customer_name,
    boat_name,
    boat_key:     normalizeBoatName(boat_name),
    start_time_raw,
    end_time_raw,
    start_minutes,
    end_minutes,
    total_amount,
    deposit_amount,
    email:         emailM ? emailM[0] : null,
    phone,
    document_ref:  refM   ? refM[1]  : null,
    parse_confidence: confidence,
  };
}

/**
 * Parse a PDF file buffer (Buffer) or document row {file_data, contract_meta}
 * and return extracted metadata. Prefers cached contract_meta if available.
 */
async function parseContractPdf(docRow) {
  // If already parsed, return cached
  if (docRow.contract_meta && docRow.contract_meta.rental_date) {
    return docRow.contract_meta;
  }
  if (!docRow.file_data) return null;
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(docRow.file_data);
    return parseContractText(data.text);
  } catch (e) {
    console.warn('[contractMatcher] parseContractPdf failed:', e.message);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   SCORING
   ═══════════════════════════════════════════════════════════════ */

/**
 * Score a parsed contract against a booking row.
 * Returns { score, breakdown, category }
 * Thresholds: >=85 auto-link, 65-84 review, <65 unmatched
 */
function scoreContractAgainstBooking(contract, booking) {
  let score = 0;
  const reasons = [];

  if (!contract || !booking) return { score: 0, breakdown: ['invalid_input'], category: 'unmatched' };

  // Fecha exacta (+40)
  if (contract.rental_date && booking.booking_date &&
      contract.rental_date === booking.booking_date) {
    score += 40; reasons.push('fecha_exacta:+40');
  } else if (contract.rental_date && booking.booking_date) {
    reasons.push('fecha_no_match');
  }

  // Barco compatible (+25)
  const contractBoat  = normalizeBoatName(contract.boat_name);
  const bookingBoat   = normalizeBoatName(booking.boat_type || booking.boat_id || '');
  if (contractBoat && bookingBoat && contractBoat === bookingBoat) {
    score += 25; reasons.push('barco_exacto:+25');
  } else if (contractBoat && bookingBoat) {
    reasons.push(`barco_no_match(${contractBoat} vs ${bookingBoat})`);
  }

  // Hora inicio ±30 min (+20)
  const bookStart = normalizeTime(booking.start_time);
  if (contract.start_minutes !== null && bookStart !== null) {
    const diff = Math.abs(contract.start_minutes - bookStart);
    if (diff <= 30) { score += 20; reasons.push(`hora_inicio:+20(diff=${diff}min)`); }
    else reasons.push(`hora_inicio_no_match(diff=${diff}min)`);
  }

  // Hora fin ±30 min (+15)
  const bookEnd = booking.duration_hours
    ? (bookStart !== null ? bookStart + parseFloat(booking.duration_hours) * 60 : null) : null;
  if (contract.end_minutes !== null && bookEnd !== null) {
    const diff = Math.abs(contract.end_minutes - bookEnd);
    if (diff <= 30) { score += 15; reasons.push(`hora_fin:+15(diff=${diff}min)`); }
    else reasons.push(`hora_fin_no_match(diff=${diff}min)`);
  }

  // Cliente similar (+20)
  const simScore = engine.matchContractToBooking
    ? 0  // use internal nameSimilarity via engine
    : 0;
  // Inline name similarity
  const nameA = normalizeName(contract.customer_name);
  const nameB = normalizeName(booking.customer_name || booking.final_customer_name || '');
  if (nameA && nameB) {
    const tokA = nameA.split(/\s+/).filter(Boolean);
    const tokB = nameB.split(/\s+/).filter(Boolean);
    let matches = 0;
    for (const t of tokA) {
      if (tokB.some(x => x === t || (t.length >= 3 && x.startsWith(t)) || (x.length >= 3 && t.startsWith(x)))) matches++;
    }
    const sim = matches / Math.max(tokA.length, tokB.length);
    if (sim >= 0.8)      { score += 20; reasons.push(`cliente_exacto:+20`); }
    else if (sim >= 0.5) { score += 12; reasons.push(`cliente_parcial:+12(sim=${sim.toFixed(2)})`); }
    else if (sim >= 0.3) { score += 6;  reasons.push(`cliente_bajo:+6(sim=${sim.toFixed(2)})`); }
    else reasons.push(`cliente_no_match(sim=${sim.toFixed(2)})`);
  }

  // Total similar ±5% (+10)
  const bookTotal = parseFloat(booking.total_amount || 0);
  if (contract.total_amount !== null && bookTotal > 0) {
    const pct = Math.abs(contract.total_amount - bookTotal) / bookTotal;
    if (pct <= 0.05) { score += 10; reasons.push(`total:+10(${contract.total_amount} vs ${bookTotal})`); }
    else reasons.push(`total_no_match(${contract.total_amount} vs ${bookTotal} = ${(pct*100).toFixed(0)}%)`);
  }

  // Depósito similar ±5 (+5)
  const bookDep = parseFloat(booking.deposit_amount || 0);
  if (contract.deposit_amount !== null && bookDep > 0) {
    if (Math.abs(contract.deposit_amount - bookDep) <= 5) {
      score += 5; reasons.push(`deposito:+5`);
    }
  }

  // Email exacto (+30)
  if (contract.email && booking.customer_email &&
      contract.email.toLowerCase() === booking.customer_email.toLowerCase()) {
    score += 30; reasons.push('email_exacto:+30');
  }

  // Teléfono exacto (+25)
  if (contract.phone && booking.customer_phone) {
    const ph1 = String(contract.phone).replace(/\D/g,'').slice(-10);
    const ph2 = String(booking.customer_phone).replace(/\D/g,'').slice(-10);
    if (ph1 && ph2 && ph1 === ph2) { score += 25; reasons.push('phone_exacto:+25'); }
  }

  // Category thresholds
  const category = score >= 85 ? 'auto-link' : score >= 65 ? 'review' : 'unmatched';

  return { score, breakdown: reasons, category };
}

/* ═══════════════════════════════════════════════════════════════
   FIND BEST BOOKING (DB query)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Given extracted contract metadata, find the best matching booking.
 * First narrows by date (if available), then scores all candidates.
 * @param {object} contract — output of parseContractText/parseContractPdf
 * @param {object} pool     — pg Pool
 * @returns {{ best, score, breakdown, category }}
 */
async function findBestBookingForContract(contract, pool) {
  if (!contract) return { best: null, score: 0, breakdown: ['no_metadata'], category: 'unmatched' };

  let rows;
  if (contract.rental_date) {
    // Stage A: filter by date first
    const r = await pool.query('SELECT * FROM bookings WHERE booking_date = $1', [contract.rental_date]);
    rows = r.rows;
  } else {
    // No date — scan recent bookings (last 2 years)
    const r = await pool.query("SELECT * FROM bookings WHERE booking_date >= NOW() - INTERVAL '2 years' ORDER BY booking_date DESC LIMIT 200");
    rows = r.rows;
  }

  if (!rows.length) return { best: null, score: 0, breakdown: ['no_bookings_for_date'], category: 'unmatched' };

  let best = null, bestScore = -1, bestBreakdown = [], bestCategory = 'unmatched';
  for (const booking of rows) {
    const { score, breakdown, category } = scoreContractAgainstBooking(contract, booking);
    if (score > bestScore) { best = booking; bestScore = score; bestBreakdown = breakdown; bestCategory = category; }
  }

  return { best, score: bestScore, breakdown: bestBreakdown, category: bestCategory };
}

/* ═══════════════════════════════════════════════════════════════
   AUDIT ALL UNLINKED PDFs
   ═══════════════════════════════════════════════════════════════ */

/**
 * Audit all unlinked PDF documents and return match report.
 * @param {object} pool — pg Pool
 * @returns {object} summary + detail arrays
 */
async function matchAuditAll(pool) {
  // All unlinked PDFs with file_data
  const docsRes = await pool.query(`
    SELECT id, original_name, mime_type, file_size, booking_id, contract_meta, file_data, created_at
    FROM documents
    WHERE mime_type = 'application/pdf'
      AND (booking_id IS NULL)
      AND file_data IS NOT NULL
    ORDER BY created_at DESC
  `);

  const summary = { total: docsRes.rows.length, already_linked: 0, auto_link_candidates: 0, review_required: 0, unmatched: 0, errors: 0 };
  const already_linked = [], auto_link_candidates = [], review_required = [], unmatched = [];

  for (const doc of docsRes.rows) {
    try {
      // Parse or use cached metadata
      let meta = doc.contract_meta;
      if (!meta || !meta.rental_date) {
        meta = await parseContractPdf(doc);
        // Cache it
        if (meta) {
          await pool.query('UPDATE documents SET contract_meta=$1 WHERE id=$2', [meta, doc.id]).catch(() => {});
        }
      }
      if (!meta) { summary.unmatched++; unmatched.push({ document_id: doc.id, filename: doc.original_name, reason: 'parse_failed' }); continue; }

      const { best, score, breakdown, category } = await findBestBookingForContract(meta, pool);
      const item = {
        document_id: doc.id,
        filename:    doc.original_name,
        metadata:    { rental_date: meta.rental_date, customer_name: meta.customer_name, boat_name: meta.boat_name, start_time: meta.start_time_raw, end_time: meta.end_time_raw, total_amount: meta.total_amount, deposit_amount: meta.deposit_amount },
        candidate_booking: best ? { id: best.id, customer_name: best.customer_name, booking_date: best.booking_date, boat_type: best.boat_type } : null,
        score,
        reasons: breakdown,
        status: category,
      };

      if (category === 'auto-link')  { summary.auto_link_candidates++; auto_link_candidates.push(item); }
      else if (category === 'review'){ summary.review_required++;       review_required.push(item); }
      else                           { summary.unmatched++;             unmatched.push(item); }
    } catch (e) {
      summary.errors++;
      unmatched.push({ document_id: doc.id, filename: doc.original_name, reason: 'error: ' + e.message });
    }
  }

  return { summary, already_linked, auto_link_candidates, review_required, unmatched };
}

/* ═══════════════════════════════════════════════════════════════
   BATCH AUTO-LINK
   ═══════════════════════════════════════════════════════════════ */

/**
 * Apply auto-link for candidates above minScore.
 * @param {object} pool
 * @param {'dry-run'|'apply'} mode
 * @param {number} minScore — default 85
 * @param {boolean} force   — overwrite existing booking_id
 */
async function batchAutoLink(pool, mode = 'dry-run', minScore = 85, force = false) {
  const audit = await matchAuditAll(pool);
  const results = [];

  const candidates = [
    ...audit.auto_link_candidates,
    ...audit.review_required,
  ].filter(c => c.score >= minScore && c.candidate_booking);

  for (const c of candidates) {
    if (mode === 'apply') {
      await pool.query(
        'UPDATE documents SET booking_id=$1 WHERE id=$2' + (force ? '' : ' AND booking_id IS NULL'),
        [c.candidate_booking.id, c.document_id]
      );
    }
    results.push({ document_id: c.document_id, filename: c.filename, booking_id: c.candidate_booking.id, score: c.score, mode });
  }

  return {
    summary: { mode, minScore, force, processed: candidates.length, linked: mode === 'apply' ? results.length : 0 },
    results,
  };
}

/* ═══════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════ */
module.exports = {
  parseContractText,
  parseContractPdf,
  normalizeBoatName,
  normalizeTime,
  normalizeMoney,
  normalizeName,
  scoreContractAgainstBooking,
  findBestBookingForContract,
  matchAuditAll,
  batchAutoLink,
};
