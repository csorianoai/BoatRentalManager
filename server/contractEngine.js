'use strict';

/**
 * contractEngine.js — Contract PDF Parser + Matching Engine
 * Parses contract PDFs, extracts metadata, matches to bookings.
 * ADDITIVE ONLY — reads only, never modifies files or bookings schema.
 */

/* ═══════════════════════════════════════════════════════════════
   SECTION 1: NORMALIZERS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Normalize boat type string to a canonical key for comparison.
 * e.g. "SEA RAY 500", "Searay 50ft", "50' Sea Ray" → "searay"
 */
function normalizeBoat(raw) {
  if (!raw) return '';
  const s = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/sea\s*ray|searay/.test(s)) return 'searay';
  if (/cranchi/.test(s)) return 'cranchi';
  if (/viking/.test(s)) return 'viking';
  if (/catamaran/.test(s)) return 'catamaran';
  if (/sailboat|sail\s*boat/.test(s)) return 'sailboat';
  if (/jet\s*ski/.test(s)) return 'jetski';
  if (/lancha/.test(s)) return 'lancha';
  if (/yacht/.test(s)) return 'yacht';
  // Return first meaningful word
  return s.split(' ')[0] || s;
}

/**
 * Parse time string to total minutes since midnight.
 * Handles: "4PM", "4:30pm", "16:00", "4:00 PM", "4:30p.m."
 */
function parseTimeToMinutes(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  // 24h format: 16:00
  const h24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) return parseInt(h24[1]) * 60 + parseInt(h24[2]);
  // 12h with minutes: 4:30pm
  const h12m = s.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (h12m) {
    let h = parseInt(h12m[1]);
    const m = parseInt(h12m[2]);
    if (h12m[3] === 'pm' && h !== 12) h += 12;
    if (h12m[3] === 'am' && h === 12) h = 0;
    return h * 60 + m;
  }
  // 12h without minutes: 4pm
  const h12 = s.match(/^(\d{1,2})(am|pm)$/);
  if (h12) {
    let h = parseInt(h12[1]);
    if (h12[2] === 'pm' && h !== 12) h += 12;
    if (h12[2] === 'am' && h === 12) h = 0;
    return h * 60;
  }
  return null;
}

/**
 * Parse booking start_time field (stored as "HH:MM") to minutes.
 */
function bookingTimeToMinutes(raw) {
  if (!raw) return null;
  return parseTimeToMinutes(raw);
}

/**
 * Normalize amount: "$1,100.00" / "1100" / "$714.42" → 714.42
 */
function parseAmount(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Simple token similarity between two name strings.
 * Returns 0.0 – 1.0.
 */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const tokA = a.toLowerCase().split(/\s+/).filter(Boolean);
  const tokB = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokA.length || !tokB.length) return 0;
  let matches = 0;
  for (const t of tokA) {
    if (tokB.some(x => x === t || (t.length >= 3 && x.startsWith(t)) || (x.length >= 3 && t.startsWith(x)))) {
      matches++;
    }
  }
  return matches / Math.max(tokA.length, tokB.length);
}

/**
 * Normalize phone: strip all non-digits, compare last 10.
 */
function normalizePhone(raw) {
  if (!raw) return '';
  return raw.replace(/\D/g, '').slice(-10);
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 2: PDF CONTRACT PARSER
   ═══════════════════════════════════════════════════════════════ */

/**
 * Extract contract metadata from PDF text content.
 * Supports multiple PDF template styles used by Nadaki Excursions.
 *
 * @param {Buffer} fileBuffer - Raw PDF bytes
 * @returns {Promise<object>} Extracted metadata or { error }
 */
async function parseContractPdf(fileBuffer) {
  let pdfParse;
  try { pdfParse = require('pdf-parse'); } catch { return { error: 'pdf-parse not available' }; }

  let text = '';
  try {
    const data = await pdfParse(fileBuffer, { max: 0 });
    text = data.text || '';
  } catch (e) {
    return { error: 'pdf-parse failed: ' + e.message };
  }

  const meta = { raw_text_length: text.length };

  // ── CUSTOMER NAME ──────────────────────────────────────────────
  const namePats = [
    /(?:customer|client|renter|lessee|guest|nombre[^:]*?)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
    /(?:name|nombre)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/m,
  ];
  for (const pat of namePats) {
    const m = text.match(pat);
    if (m && m[1] && m[1].length >= 4) { meta.customer_name = m[1].trim(); break; }
  }

  // ── BOAT / VESSEL NAME ────────────────────────────────────────
  const boatPats = [
    /(?:vessel|boat|yacht|embarcaci[oó]n|charter)[^:]*?:\s*([^\n\r,]{3,50})/i,
    /(?:sea\s*ray|cranchi|viking|catamaran|searay)[^,\n\r]{0,30}/i,
    /(?:m\/v|mv|s\/v|sv|f\/v)\s+([^\n\r,]{3,40})/i,
  ];
  for (const pat of boatPats) {
    const m = text.match(pat);
    if (m) { meta.boat_name = (m[1] || m[0]).trim().substring(0, 60); break; }
  }

  // ── DATE ──────────────────────────────────────────────────────
  const datePats = [
    /(?:date|fecha)[^:]*?:\s*(\d{4}-\d{2}-\d{2})/i,
    /(?:date|fecha)[^:]*?:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /(?:date|fecha)[^:]*?:\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4})/i,
  ];
  for (const pat of datePats) {
    const m = text.match(pat);
    if (m) {
      meta.rental_date = normalizeDate(m[1] || m[0]);
      if (meta.rental_date) break;
    }
  }

  // ── TIME RANGE ────────────────────────────────────────────────
  // Try to find "from X to Y" or "X–Y" or "X-Y" time patterns
  const timeRangePat = /(?:from|de)\s*([\d:]+\s*(?:am|pm)?)\s+(?:to|a|–|-)\s*([\d:]+\s*(?:am|pm)?)/i;
  const timeRange2   = /([\d:]+\s*(?:am|pm))\s*(?:–|-|to)\s*([\d:]+\s*(?:am|pm))/i;
  const timeSinglePat = /(?:start|check.?in|departure|begin)[^:]*?:\s*([\d:]+\s*(?:am|pm))/i;

  let trm = text.match(timeRangePat) || text.match(timeRange2);
  if (trm) {
    meta.start_time_raw = trm[1].trim();
    meta.end_time_raw   = trm[2].trim();
    meta.start_minutes  = parseTimeToMinutes(meta.start_time_raw);
    meta.end_minutes    = parseTimeToMinutes(meta.end_time_raw);
  } else {
    const sm = text.match(timeSinglePat);
    if (sm) {
      meta.start_time_raw = sm[1].trim();
      meta.start_minutes  = parseTimeToMinutes(meta.start_time_raw);
    }
  }

  // ── AMOUNTS ───────────────────────────────────────────────────
  const totalPats = [
    /(?:total|charter\s+price|amount\s+due|precio\s+total)[^:$\d]*?[\$:]\s*([\d,]+(?:\.\d{2})?)/i,
    /(?:total)[^\n\r$\d]{0,10}[\$]?\s*([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const pat of totalPats) {
    const m = text.match(pat);
    if (m) { meta.total_amount = parseAmount(m[1]); if (meta.total_amount > 0) break; }
  }

  const depositPats = [
    /(?:deposit|dep[oó]sito|retainer)[^:$\d]*?[\$:]\s*([\d,]+(?:\.\d{2})?)/i,
    /(?:down\s*payment|pago\s*inicial)[^:$\d]*?[\$:]\s*([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const pat of depositPats) {
    const m = text.match(pat);
    if (m) { meta.deposit_amount = parseAmount(m[1]); if (meta.deposit_amount !== null) break; }
  }

  // ── EMAIL ─────────────────────────────────────────────────────
  const emailM = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (emailM) meta.email = emailM[1].toLowerCase();

  // ── PHONE ─────────────────────────────────────────────────────
  const phonePat = /(?:phone|tel|cel[é]?fono|mobile|whatsapp)[^:\d]*[:\s]+([\+\d\s\-().]{7,20})/i;
  const phoneM = text.match(phonePat) || text.match(/(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  if (phoneM) meta.phone = (phoneM[1] || phoneM[0]).trim().substring(0, 25);

  // ── DOCUMENT REF / CONTRACT NUMBER ───────────────────────────
  const refM = text.match(/(?:contract|agreement|ref|#|no\.?)[^:\d]*[:\s]*([\w\-]{4,20})/i);
  if (refM) meta.document_ref = refM[1];

  // ── SIGNED AT ─────────────────────────────────────────────────
  const signedPats = [
    /(?:signed|firma(?:do)?)[^:]*?:\s*(\d{4}-\d{2}-\d{2})/i,
    /(?:signed|firma(?:do)?)[^:]*?:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];
  for (const pat of signedPats) {
    const m = text.match(pat);
    if (m) { meta.signed_at = normalizeDate(m[1]); break; }
  }

  // ── CONFIDENCE ────────────────────────────────────────────────
  const foundFields = ['customer_name','boat_name','rental_date','start_minutes','total_amount']
    .filter(k => meta[k] != null).length;
  meta.parse_confidence = foundFields; // 0-5

  return meta;
}

/**
 * Normalize various date formats to YYYY-MM-DD.
 */
function normalizeDate(raw) {
  if (!raw) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // Month name
  const months = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
    july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',
    jan:'01',feb:'02',mar:'03',apr:'04',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  const mnm = raw.toLowerCase().match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (mnm && months[mnm[1]]) {
    return `${mnm[3]}-${months[mnm[1]]}-${mnm[2].padStart(2,'0')}`;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 3: MATCHING ENGINE
   ═══════════════════════════════════════════════════════════════ */

/**
 * Score a contract metadata object against one booking.
 * Returns { score, breakdown }
 */
function scoreContractVsBooking(meta, booking) {
  const breakdown = [];
  let score = 0;

  // DATE MATCH (+35)
  const metaDate = meta.rental_date;
  const bDate    = booking.booking_date ? String(booking.booking_date).substring(0, 10) : null;
  if (metaDate && bDate) {
    if (metaDate === bDate) { score += 35; breakdown.push('fecha_exacta:+35'); }
    else { breakdown.push(`fecha_no_match(${metaDate} vs ${bDate}):+0`); }
  }

  // BOAT MATCH (+25)
  const metaBoat = normalizeBoat(meta.boat_name);
  const bBoat    = normalizeBoat(booking.boat_type);
  if (metaBoat && bBoat) {
    if (metaBoat === bBoat) { score += 25; breakdown.push('barco_exacto:+25'); }
    else if (metaBoat && bBoat && (metaBoat.includes(bBoat) || bBoat.includes(metaBoat))) {
      score += 15; breakdown.push('barco_parcial:+15');
    } else { breakdown.push(`barco_no_match(${metaBoat} vs ${bBoat}):+0`); }
  }

  // START TIME (+15)
  const metaStart = meta.start_minutes;
  const bStart    = bookingTimeToMinutes(booking.start_time);
  if (metaStart != null && bStart != null) {
    const diff = Math.abs(metaStart - bStart);
    if (diff === 0)  { score += 15; breakdown.push('hora_exacta:+15'); }
    else if (diff <= 30) { score += 10; breakdown.push('hora_cercana_30min:+10'); }
    else if (diff <= 60) { score += 5;  breakdown.push('hora_cercana_1h:+5'); }
    else { breakdown.push(`hora_no_match(diff=${diff}min):+0`); }
  }

  // END TIME (+10) — computed from duration_hours
  if (meta.end_minutes != null && bStart != null && booking.duration_hours) {
    const bEnd = bStart + (parseInt(booking.duration_hours) * 60);
    const diff = Math.abs(meta.end_minutes - bEnd);
    if (diff <= 30) { score += 10; breakdown.push('hora_fin_compatible:+10'); }
    else { breakdown.push(`hora_fin_no_match(diff=${diff}min):+0`); }
  }

  // CUSTOMER NAME (+20)
  const nameSim = nameSimilarity(meta.customer_name, booking.customer_name);
  if (nameSim >= 0.8)      { score += 20; breakdown.push(`nombre_alto(${nameSim.toFixed(2)}):+20`); }
  else if (nameSim >= 0.5) { score += 12; breakdown.push(`nombre_medio(${nameSim.toFixed(2)}):+12`); }
  else if (nameSim >= 0.3) { score += 5;  breakdown.push(`nombre_bajo(${nameSim.toFixed(2)}):+5`); }
  else { breakdown.push(`nombre_no_match(${nameSim.toFixed(2)}):+0`); }

  // TOTAL AMOUNT (+10)
  const metaTotal = meta.total_amount;
  const bTotal    = parseFloat(booking.total_amount || 0);
  if (metaTotal != null && bTotal > 0) {
    const pct = Math.abs(metaTotal - bTotal) / bTotal;
    if (pct <= 0.02)      { score += 10; breakdown.push('monto_exacto:+10'); }
    else if (pct <= 0.05) { score += 7;  breakdown.push('monto_cercano_5pct:+7'); }
    else if (pct <= 0.10) { score += 3;  breakdown.push('monto_cercano_10pct:+3'); }
    else { breakdown.push(`monto_lejos(${pct.toFixed(0)}pct):+0`); }
  }

  // DEPOSIT AMOUNT (+5)
  const metaDep = meta.deposit_amount;
  const bDep    = parseFloat(booking.deposit_amount || 0);
  if (metaDep != null && bDep > 0) {
    const pct = Math.abs(metaDep - bDep) / bDep;
    if (pct <= 0.05) { score += 5; breakdown.push('deposito_match:+5'); }
  }

  // EMAIL EXACT (+25)
  if (meta.email && booking.customer_email) {
    if (meta.email.toLowerCase() === booking.customer_email.toLowerCase()) {
      score += 25; breakdown.push('email_exacto:+25');
    }
  }

  // PHONE EXACT (+20)
  if (meta.phone && booking.customer_phone) {
    const mp = normalizePhone(meta.phone);
    const bp = normalizePhone(booking.customer_phone);
    if (mp && bp && mp === bp) { score += 20; breakdown.push('phone_exacto:+20'); }
  }

  return { score, breakdown };
}

/**
 * Find the best matching booking for a contract's metadata.
 *
 * @param {object} meta - From parseContractPdf()
 * @param {Array}  bookings - All bookings from DB
 * @returns {{ best, score, breakdown, category }}
 *   category: 'auto-link' | 'review' | 'no-match'
 */
function matchContractToBooking(meta, bookings) {
  if (!bookings || !bookings.length) return { best: null, score: 0, category: 'no-match', breakdown: [] };

  let best = null, bestScore = 0, bestBreakdown = [];

  for (const booking of bookings) {
    const { score, breakdown } = scoreContractVsBooking(meta, booking);
    if (score > bestScore) {
      bestScore = score;
      best = booking;
      bestBreakdown = breakdown;
    }
  }

  let category = 'no-match';
  if (bestScore >= 80)      category = 'auto-link';
  else if (bestScore >= 60) category = 'review';

  return { best, score: bestScore, breakdown: bestBreakdown, category };
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 4: AUTO-LINK PIPELINE
   ═══════════════════════════════════════════════════════════════ */

/**
 * Full auto-link pipeline for a single document.
 * Reads file_data from DB, parses, matches, optionally links.
 *
 * @param {string}  docId     - documents.id
 * @param {object}  pool      - pg Pool
 * @param {string}  mode      - 'dry-run' | 'apply'
 * @param {number}  minScore  - Minimum score for linking (default 80)
 * @param {boolean} force     - Overwrite existing booking_id (default false)
 * @returns {Promise<object>} Result object
 */
async function autoLinkContract(docId, pool, mode = 'dry-run', minScore = 80, force = false) {
  const result = { docId, mode, action: 'none', score: 0, category: 'no-match', breakdown: [], meta: {} };

  try {
    // 1. Load document
    const docRes = await pool.query(
      'SELECT id, original_name, doc_type, mime_type, file_data, booking_id, contract_meta FROM documents WHERE id=$1',
      [docId]
    );
    if (!docRes.rows.length) return { ...result, error: 'doc_not_found' };
    const doc = docRes.rows[0];

    // Skip if not a PDF
    if (doc.mime_type !== 'application/pdf' && !doc.original_name.toLowerCase().endsWith('.pdf')) {
      return { ...result, action: 'skipped', reason: 'not_pdf' };
    }

    // Skip if already linked (unless force)
    if (doc.booking_id && !force) {
      return { ...result, action: 'skipped', reason: 'already_linked', existing_booking_id: doc.booking_id };
    }

    // 2. Get file buffer (BYTEA from DB)
    if (!doc.file_data) return { ...result, action: 'skipped', reason: 'no_file_data' };
    const fileBuffer = Buffer.isBuffer(doc.file_data) ? doc.file_data : Buffer.from(doc.file_data);

    // 3. Parse PDF
    const meta = await parseContractPdf(fileBuffer);
    result.meta = meta;
    if (meta.error) return { ...result, action: 'error', reason: meta.error };

    // 4. Load all bookings
    const bookRes = await pool.query(
      `SELECT id, customer_name, customer_email, customer_phone, boat_type, boat_id,
              booking_date, start_time, duration_hours, total_amount, deposit_amount
       FROM bookings ORDER BY booking_date DESC`
    );
    const bookings = bookRes.rows;

    // 5. Match
    const { best, score, breakdown, category } = matchContractToBooking(meta, bookings);
    result.score = score;
    result.breakdown = breakdown;
    result.category = category;
    if (best) { result.booking_id = best.id; result.booking_customer = best.customer_name; }

    // 6. Action
    if (category === 'no-match' || score < minScore) {
      result.action = 'no-match';
      // Save meta to contract_meta for future use (dry-run also saves meta)
      if (mode === 'apply') {
        await pool.query(
          `UPDATE documents SET contract_meta = $1 WHERE id = $2`,
          [JSON.stringify({ ...meta, match_score: score, match_category: category }), docId]
        );
      }
      return result;
    }

    if (category === 'review') {
      result.action = 'review-flagged';
      if (mode === 'apply' && best) {
        await pool.query(
          `UPDATE documents SET contract_meta = $1 WHERE id = $2`,
          [JSON.stringify({
            ...meta,
            match_score: score,
            match_category: 'review',
            review_booking_id: best.id,
            review_breakdown: breakdown,
          }), docId]
        );
      }
      return result;
    }

    // category === 'auto-link' && score >= minScore
    result.action = mode === 'apply' ? 'linked' : 'would-link';
    if (mode === 'apply' && best) {
      await pool.query(
        `UPDATE documents SET booking_id = $1, contract_meta = $2 WHERE id = $3`,
        [best.id, JSON.stringify({ ...meta, match_score: score, match_category: 'auto-link', breakdown }), docId]
      );
      console.log(`[ContractAutoLink] linked doc=${docId} booking=${best.id} score=${score}`);
    }

    return result;
  } catch (err) {
    console.error('[ContractAutoLink] error:', err.message);
    return { ...result, action: 'error', reason: err.message };
  }
}

/**
 * Batch audit: run autoLinkContract in dry-run mode on all unlinked PDFs.
 */
async function batchAudit(pool, minScore = 60) {
  const docs = await pool.query(
    `SELECT id FROM documents
     WHERE (mime_type = 'application/pdf' OR original_name ILIKE '%.pdf')
     AND booking_id IS NULL
     AND file_data IS NOT NULL
     ORDER BY created_at DESC`
  );

  const results = [];
  for (const row of docs.rows) {
    const r = await autoLinkContract(row.id, pool, 'dry-run', minScore, false);
    results.push(r);
  }
  return results;
}

module.exports = { parseContractPdf, matchContractToBooking, autoLinkContract, batchAudit, normalizeBoat, parseTimeToMinutes };
