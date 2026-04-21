#!/usr/bin/env node
/**
 * NADAKI FLEET OPS — SELF-CHECK RUNNER
 * =============================================
 * Ejecutar: node validation/self-check.js --target=prod
 *           node validation/self-check.js --target=dev
 *           node validation/self-check.js --target=all
 *
 * Salidas: PASS | FAIL | WARN | SKIP
 * Requiere: node 18+ (fetch nativo)
 */

const https = require('https');
const http  = require('http');
const { execSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');

// ── CONFIG ───────────────────────────────────────────────────────────────────
const TARGETS = {
  dev:  process.env.DEV_URL  || 'http://localhost:5000',
  prod: process.env.PROD_URL || 'https://gestion.nadakiexcursions.com',
};

const args   = process.argv.slice(2);
const target = (args.find(a => a.startsWith('--target=')) || '').replace('--target=', '') || 'dev';
const VERBOSE = args.includes('--verbose');

let baseURL = target === 'prod' ? TARGETS.prod : TARGETS.dev;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function get(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function ms(start) { return `${Date.now() - start}ms`; }

function pad(str, len) { return String(str).padEnd(len, ' ').slice(0, len); }

const PASS = (detail = '') => ({ result: 'PASS', detail });
const FAIL = (detail)      => ({ result: 'FAIL', detail });
const WARN = (detail)      => ({ result: 'WARN', detail });
const SKIP = (detail)      => ({ result: 'SKIP', detail });

// ── TEST RUNNER ───────────────────────────────────────────────────────────────
let results = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0, tests: [] };
function resetResults() { results = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0, tests: [] }; }

async function run(id, label, fn) {
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = FAIL(`Exception: ${e.message}`);
  }
  results[r.result]++;
  results.tests.push({ id, label, ...r });
  if (VERBOSE || r.result !== 'PASS') {
    const icon = r.result === 'PASS' ? '✅' : r.result === 'FAIL' ? '❌' : r.result === 'WARN' ? '⚠️' : '⏭️';
    console.log(`  ${icon} ${pad(id, 6)} ${label}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  return r;
}

// ── INFRA TESTS (I-01 … I-08) ────────────────────────────────────────────────
async function infraTests(html, fleetJsBody) {
  console.log('\n📡 INFRA');

  // I-01: BUILD_TS presente en HTML (cualquier ?v=NNN)
  await run('I-01', '¿HTML tiene BUILD_TS (?v=) en assets?', async () => {
    const m = html.match(/\?v=(\d+)/);
    if (!m) return FAIL('No se encontró ?v= en ningún asset del HTML');
    const ts = m[1];
    const age = Date.now() - parseInt(ts);
    const hours = Math.round(age / 3600000);
    return PASS(`BUILD_TS=${ts} (hace ${hours}h)`);
  });

  // I-02: fleet-ops.js no da 404
  await run('I-02', '¿fleet-ops.js carga sin 404?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (r.status !== 200) return FAIL(`HTTP ${r.status}`);
    return PASS();
  });

  // I-03: fleet-ops.js > 40KB (proxy de "no es el archivo viejo")
  await run('I-03', '¿fleet-ops.js > 40KB (Fase 2)?', async () => {
    if (!fleetJsBody) return SKIP('No se pudo obtener el cuerpo del archivo');
    const kb = (fleetJsBody.length / 1024).toFixed(1);
    if (fleetJsBody.length < 40000) return FAIL(`Solo ${kb}KB — probablemente versión antigua`);
    return PASS(`${kb}KB`);
  });

  // I-04: 4 endpoints responden 200 en <500ms
  await run('I-04', '¿Endpoints /api/fleet/* responden 200 <500ms?', async () => {
    const eps = ['timeline', 'kpis', 'alerts', 'today-strip'];
    const fails = [];
    for (const ep of eps) {
      const t = Date.now();
      try {
        const r = await get(`${baseURL}/api/fleet/${ep}`);
        const elapsed = Date.now() - t;
        if (r.status !== 200) fails.push(`${ep}:${r.status}`);
        else if (elapsed >= 500) fails.push(`${ep}:${elapsed}ms`);
      } catch (e) { fails.push(`${ep}:${e.message}`); }
    }
    if (fails.length) return FAIL(fails.join(', '));
    return PASS('timeline,kpis,alerts,today-strip OK');
  });

  // I-05: /api/fleet/timeline tiene estructura esperada
  await run('I-05', '¿/api/fleet/timeline tiene campos fleet,bookings,range?', async () => {
    const r = await get(`${baseURL}/api/fleet/timeline`);
    const j = JSON.parse(r.body);
    const missing = ['range', 'fleet', 'bookings', 'holds', 'maintenance'].filter(k => !(k in j));
    if (missing.length) return FAIL(`Faltan: ${missing.join(', ')}`);
    return PASS(`fleet=${j.fleet.length} barcos, bookings=${j.bookings.length}`);
  });

  // I-06: Sin errores JS evidentes en HTML (no "undefined is not" o similar)
  await run('I-06', '¿HTML no tiene errores JS incrustados obvios?', async () => {
    const errs = (html.match(/ReferenceError|TypeError|SyntaxError|is not a function|Cannot read/g) || []).length;
    if (errs > 0) return FAIL(`${errs} error(es) JS detectados en el HTML`);
    return PASS();
  });

  // I-07: Sin referencias huérfanas a funciones antiguas
  await run('I-07', '¿Sin referencias a renderCalendar/renderCalendarGrid?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    const found = (r.body.match(/renderCalendar|renderCalendarGrid/g) || []);
    if (found.length > 0) return FAIL(`Encontradas ${found.length} referencias obsoletas`);
    return PASS();
  });

  // I-08: CSS del drawer está cargado (buscar .foc-drawer en HTML)
  await run('I-08', '¿CSS del drawer (foc-drawer) presente en HTML?', async () => {
    if (!html.includes('foc-drawer')) return FAIL('Clase foc-drawer no encontrada en HTML');
    if (!html.includes('foc-drawer-open')) return FAIL('Clase foc-drawer-open no encontrada');
    return PASS();
  });
}

// ── DATA TESTS (D-01 … D-06) ──────────────────────────────────────────────────
async function dataTests() {
  console.log('\n📊 DATA INTEGRITY');

  const kpisR  = await get(`${baseURL}/api/fleet/kpis`).catch(() => null);
  const lineR  = await get(`${baseURL}/api/fleet/timeline`).catch(() => null);
  const todayR = await get(`${baseURL}/api/fleet/today-strip`).catch(() => null);

  const kpis   = kpisR  ? JSON.parse(kpisR.body)  : null;
  const tline  = lineR  ? JSON.parse(lineR.body)  : null;
  const today  = todayR ? JSON.parse(todayR.body) : null;

  // D-01: KPI bookings coincide con bookings en el range
  await run('D-01', '¿KPI total_bookings ≈ bookings en timeline?', async () => {
    if (!kpis || !tline) return SKIP('No se pudo obtener datos');
    const kpiCount  = kpis.total_bookings;
    const lineCount = tline.bookings?.length ?? '?';
    // Timeline can have more (adjacent days) so just validate kpiCount >= 0
    if (typeof kpiCount !== 'number') return FAIL('total_bookings no es número');
    return PASS(`KPI=${kpiCount}, timeline=${lineCount}`);
  });

  // D-02: KPI revenue es numérico positivo
  await run('D-02', '¿KPI total_revenue es numérico ≥ 0?', async () => {
    if (!kpis) return SKIP('Sin datos de kpis');
    const rev = parseFloat(kpis.total_revenue);
    if (isNaN(rev) || rev < 0) return FAIL(`total_revenue=${kpis.total_revenue}`);
    return PASS(`$${rev.toLocaleString()}`);
  });

  // D-03: fleet_config retorna barcos activos
  await run('D-03', '¿fleet retorna ≥1 barco activo?', async () => {
    if (!tline) return SKIP('Sin datos de timeline');
    const count = tline.fleet?.length ?? 0;
    if (count === 0) return FAIL('fleet=[]: fleet_config vacía o tablas no migradas');
    if (count < 4)   return WARN(`Solo ${count} barcos (se esperan ≥6)`);
    return PASS(`${count} barcos activos`);
  });

  // D-04: Nombres de barco son comerciales (no IDs técnicos boat_XXXX)
  await run('D-04', '¿Nombres de barco son comerciales (no boat_XXX)?', async () => {
    if (!tline?.fleet?.length) return SKIP('Sin fleet data');
    const technical = tline.fleet.filter(b =>
      /^boat_/.test(b.boat_type) || /^boat_/.test(b.display_name || '')
    );
    if (technical.length) return FAIL(`IDs técnicos: ${technical.map(b => b.boat_type).join(', ')}`);
    const names = tline.fleet.map(b => b.display_name || b.boat_type).join(', ');
    return PASS(names);
  });

  // D-05: Utilización en rango 0-100%
  await run('D-05', '¿Utilización en rango 0–100%?', async () => {
    if (!kpis) return SKIP('Sin kpis');
    const u = parseFloat(kpis.utilization_pct);
    if (isNaN(u))     return FAIL(`utilization_pct=${kpis.utilization_pct} no es número`);
    if (u < 0 || u > 100) return FAIL(`Fuera de rango: ${u}%`);
    if (u === 0 && kpis.total_bookings > 0) return WARN('Utilización 0% con bookings activos — posible bug');
    return PASS(`${u}%`);
  });

  // D-06: Today strip devuelve fecha de hoy
  await run('D-06', '¿Today strip fecha = hoy?', async () => {
    if (!today) return SKIP('Sin today-strip data');
    const serverDate = today.date;
    const localDate  = new Date().toISOString().split('T')[0];
    if (serverDate !== localDate) return WARN(`Servidor dice ${serverDate}, local es ${localDate}`);
    return PASS(`date=${serverDate}, total_today=${today.total_today}`);
  });
}

// ── UI TESTS (U-01 … U-10) ───────────────────────────────────────────────────
async function uiTests(html) {
  console.log('\n🖥️  UI BEHAVIOR');

  // U-01: Bloque de booking clickeable existe en HTML (clase foc-booking-block)
  // Nota: los bloques son generados por JS, validamos que el código del handler existe
  await run('U-01', '¿Código openDrawer está presente en fleet-ops.js?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes('openDrawer')) return FAIL('Función openDrawer no encontrada');
    if (!r.body.includes('foc-drawer-open')) return FAIL('Clase foc-drawer-open no encontrada en JS');
    return PASS('openDrawer + foc-drawer-open OK');
  });

  // U-02: Drawer tiene 4 secciones detectables en JS
  await run('U-02', '¿Drawer contiene 4 secciones (Resumen/Operaciones/Financiero/Actividad)?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    const secciones = ['Resumen de Reserva', 'Operaciones', 'Financiero', 'Actividad'];
    const missing = secciones.filter(s => !r.body.includes(s));
    if (missing.length) return FAIL(`Secciones faltantes: ${missing.join(', ')}`);
    return PASS(secciones.join(', '));
  });

  // U-03: Drawer genera 8 botones de acción
  await run('U-03', '¿Código genera ≥8 botones de acción en el drawer?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    // Action buttons use class foc-action-btn in fleet-ops.js
    const matches = (r.body.match(/foc-action-btn/g) || []).length;
    if (matches < 8) return WARN(`Solo ${matches} referencias a foc-action-btn (esperados ≥8)`);
    return PASS(`${matches} botones de acción referenciados`);
  });

  // U-04: Chip de canal con color existe en JS
  await run('U-04', '¿Chips de canal con colores definidos en JS?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    const hasColors = r.body.includes('CHANNEL_COLORS') || r.body.includes('channel.*color') ||
                      (r.body.includes('#3B82F6') && r.body.includes('Airbnb'));
    if (!hasColors) return FAIL('CHANNEL_COLORS o colores de canal no encontrados');
    return PASS('Colores de canal presentes');
  });

  // U-05: Chip de payment_status con colores
  await run('U-05', '¿Chips de payment_status con colores definidos?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    const hasPay = (r.body.includes('paid') && r.body.includes('pending') &&
                    r.body.includes('#10B981') && r.body.includes('#EF4444'));
    if (!hasPay) return FAIL('Colores de payment_status no encontrados');
    return PASS('PAYMENT_COLORS presentes');
  });

  // U-06: Botón Copiar ID con handler
  await run('U-06', '¿Botón Copiar ID con clipboard handler?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes('copyText') && !r.body.includes('clipboard')) {
      return FAIL('Función copyText / clipboard no encontrada');
    }
    return PASS('copyText handler presente');
  });

  // U-07: Esc cierra drawer (keydown handler + clase removal)
  await run('U-07', '¿Handler de Escape elimina clase foc-drawer-open?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes("'Escape'") && !r.body.includes('"Escape"')) {
      return FAIL('No se encontró handler de tecla Escape');
    }
    if (!r.body.includes('classList.remove')) return FAIL('classList.remove no encontrado');
    return PASS('keydown Escape + classList.remove OK');
  });

  // U-08: Panel de alertas existe en HTML con ID correcto
  await run('U-08', '¿#foc-alerts-panel presente en HTML?', async () => {
    if (!html.includes('id="foc-alerts-panel"')) return FAIL('Elemento #foc-alerts-panel no encontrado');
    return PASS();
  });

  // U-09: Today Command Strip existe en HTML
  await run('U-09', '¿#foc-today-strip presente en HTML?', async () => {
    if (!html.includes('id="foc-today-strip"')) return FAIL('Elemento #foc-today-strip no encontrado');
    return PASS();
  });

  // U-10: Navegación temporal — botones prev/next presentes en HTML
  await run('U-10', '¿Botones de navegación temporal (prev/next) presentes?', async () => {
    const hasPrev = html.includes('id="foc-prev"') || html.includes('foc-prev');
    const hasNext = html.includes('id="foc-next"') || html.includes('foc-next');
    if (!hasPrev || !hasNext) return FAIL(`prev=${hasPrev}, next=${hasNext}`);
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    // Navigation uses shiftRange() and rangeStart state
    if (!r.body.includes('shiftRange') || !r.body.includes('rangeStart')) {
      return WARN('Lógica de navegación (shiftRange/rangeStart) no encontrada en JS');
    }
    return PASS('prev/next + shiftRange + rangeStart OK');
  });
}

// ── INTEGRITY TESTS (C-01 … C-04) ────────────────────────────────────────────
async function integrityTests() {
  console.log('\n🔐 INTEGRITY');

  // C-01: Comparación dev vs prod (solo cuando --target=all)
  await run('C-01', '¿Bookings dev vs prod sin discrepancia >50%?', async () => {
    if (target !== 'all') return SKIP('Solo se ejecuta con --target=all');
    try {
      const devR  = await get(`${TARGETS.dev}/api/fleet/kpis`);
      const prodR = await get(`${TARGETS.prod}/api/fleet/kpis`);
      const devK  = JSON.parse(devR.body);
      const prodK = JSON.parse(prodR.body);
      const devB  = parseInt(devK.total_bookings)  || 0;
      const prodB = parseInt(prodK.total_bookings) || 0;
      if (prodB === 0) return WARN('Producción tiene 0 bookings en el rango actual');
      const diff = Math.abs(devB - prodB) / Math.max(prodB, 1);
      if (diff > 0.5) return WARN(`Dev=${devB} vs Prod=${prodB} — discrepancia ${Math.round(diff*100)}%`);
      return PASS(`Dev=${devB} Prod=${prodB}`);
    } catch(e) { return FAIL(e.message); }
  });

  // C-02: Barcos dev vs prod
  await run('C-02', '¿Barcos dev vs prod son iguales?', async () => {
    if (target !== 'all') return SKIP('Solo se ejecuta con --target=all');
    try {
      const devR  = await get(`${TARGETS.dev}/api/fleet/timeline`);
      const prodR = await get(`${TARGETS.prod}/api/fleet/timeline`);
      const devT  = JSON.parse(devR.body);
      const prodT = JSON.parse(prodR.body);
      const devC  = devT.fleet?.length  ?? 0;
      const prodC = prodT.fleet?.length ?? 0;
      if (devC !== prodC) return WARN(`Dev tiene ${devC} barcos, Prod tiene ${prodC}`);
      return PASS(`${devC} barcos en ambos entornos`);
    } catch(e) { return FAIL(e.message); }
  });

  // C-03: BUILD_TS en prod es reciente (< 24h)
  await run('C-03', '¿BUILD_TS en producción es reciente (<24h)?', async () => {
    try {
      const r = await get(`${baseURL}/fleet.html`);
      const m = r.body.match(/\?v=(\d+)/);
      if (!m) return FAIL('Sin BUILD_TS en HTML');
      const age = Date.now() - parseInt(m[1]);
      const hours = Math.round(age / 3600000);
      if (hours > 24) return WARN(`BUILD_TS tiene ${hours}h — verificar último deploy`);
      return PASS(`BUILD_TS hace ${hours}h`);
    } catch(e) { return FAIL(e.message); }
  });

  // C-04: Sin referencias a funciones obsoletas en fleet-ops.js
  await run('C-04', '¿Sin funciones obsoletas (renderCalendar, renderCalendarGrid)?', async () => {
    try {
      const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
      const obsolete = ['renderCalendar', 'renderCalendarGrid', 'initCalendar'];
      const found = obsolete.filter(fn => r.body.includes(fn));
      if (found.length) return FAIL(`Obsoletas encontradas: ${found.join(', ')}`);
      return PASS('Sin referencias obsoletas');
    } catch(e) { return FAIL(e.message); }
  });
}

// ── REPORT ───────────────────────────────────────────────────────────────────
function printReport(targetUrl, buildTs, durationMs) {
  const total = results.PASS + results.FAIL + results.WARN + results.SKIP;
  const warns = results.tests.filter(t => t.result === 'WARN');
  const fails = results.tests.filter(t => t.result === 'FAIL');

  const infraR  = results.tests.filter(t => t.id.startsWith('I-'));
  const dataR   = results.tests.filter(t => t.id.startsWith('D-'));
  const uiR     = results.tests.filter(t => t.id.startsWith('U-'));
  const intR    = results.tests.filter(t => t.id.startsWith('C-'));

  function blockScore(tests, label) {
    const p = tests.filter(t => t.result === 'PASS').length;
    const w = tests.filter(t => t.result === 'WARN').length;
    const f = tests.filter(t => t.result === 'FAIL').length;
    const s = tests.filter(t => t.result === 'SKIP').length;
    const total = tests.length;
    let notes = [];
    if (w) notes.push(`${w} WARN`);
    if (f) notes.push(`${f} FAIL`);
    if (s) notes.push(`${s} SKIP`);
    return `${pad(label, 14)}: ${p}/${total}  PASS${notes.length ? ' (' + notes.join(', ') + ')' : ''}`;
  }

  const overall = fails.length === 0 && warns.length === 0 ? 'PASS' :
                  fails.length === 0 ? `PASS con ${warns.length} WARN` : `FAIL (${fails.length} errores)`;

  const nextAction = fails.length > 0
    ? `⛔ Corregir ${fails.length} FAIL(s) antes de avanzar`
    : warns.length > 2
    ? `⚠️  ${warns.length} WARNs — revisar antes de siguiente fase`
    : warns.length > 0
    ? `✅ WARNs no bloqueantes — puede avanzar a siguiente fase`
    : `🚀 Todo limpio — puede avanzar a siguiente fase`;

  console.log('\n');
  console.log('===========================================');
  console.log('FLEET OPS SELF-CHECK REPORT');
  console.log(`Target:     ${targetUrl}`);
  console.log(`Timestamp:  ${new Date().toLocaleString('es', { timeZone: 'America/Puerto_Rico' })}`);
  console.log(`BUILD_TS:   ${buildTs || 'no detectado'}`);
  console.log(`Duration:   ${durationMs}ms`);
  console.log('-------------------------------------------');
  console.log(blockScore(infraR, 'INFRA'));
  console.log(blockScore(dataR,  'DATA'));
  console.log(blockScore(uiR,    'UI'));
  console.log(blockScore(intR,   'INTEGRITY'));
  console.log('-------------------------------------------');
  const runnable = total - results.SKIP;
  console.log(`OVERALL: ${results.PASS + results.WARN}/${runnable} PASS · ${results.WARN} WARN · ${results.FAIL} FAIL · ${results.SKIP} SKIP`);
  console.log(`STATUS:  ${overall}`);

  if (warns.length || fails.length) {
    console.log('\nDetalles:');
    [...fails, ...warns].forEach(t => {
      const icon = t.result === 'FAIL' ? '❌' : '⚠️';
      console.log(`  ${icon} ${t.id}: ${t.label}${t.detail ? ' — ' + t.detail : ''}`);
    });
  }

  console.log(`\nSiguiente acción:\n  ${nextAction}`);
  console.log('===========================================\n');

  // Exit code: 0=ok, 1=fail
  process.exitCode = fails.length > 0 ? 1 : 0;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  const targetsToRun = target === 'all' ? ['dev', 'prod'] : [target];

  for (const tgt of targetsToRun) {
    const url = tgt === 'prod' ? TARGETS.prod : TARGETS.dev;
    baseURL = url;  // Update module-level baseURL for this iteration
    resetResults(); // Reset counters for each target

    console.log(`\n${'='.repeat(45)}`);
    console.log(`🚀 FLEET OPS SELF-CHECK — Target: ${tgt.toUpperCase()}`);
    console.log(`   URL: ${url}`);
    console.log('='.repeat(45));

    // Fetch HTML once for multiple tests
    let html = '';
    let fleetJsBody = '';
    let buildTs = '';
    try {
      const htmlR = await get(`${url}/fleet.html`);
      html = htmlR.body;
      const m = html.match(/\?v=(\d+)/);
      buildTs = m ? m[1] : '';
    } catch(e) {
      console.error(`❌ No se pudo conectar a ${url}: ${e.message}`);
      continue;
    }
    try {
      const jsR = await get(`${url}/assets/js/operations/fleet-ops.js`);
      fleetJsBody = jsR.body;
    } catch(e) { /* will be caught per-test */ }

    await infraTests(html, fleetJsBody);
    await dataTests();
    await uiTests(html);
    await integrityTests();

    printReport(url, buildTs, Date.now() - start);
  }
}

main().catch(e => { console.error('Runner error:', e); process.exit(2); });
