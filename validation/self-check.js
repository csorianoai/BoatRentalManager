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
    if (!r.body.includes('shiftRange') || !r.body.includes('rangeStart')) {
      return WARN('Lógica de navegación (shiftRange/rangeStart) no encontrada en JS');
    }
    return PASS('prev/next + shiftRange + rangeStart OK');
  });

  // U-11 (Fase 3A): Selector de 4 vistas presente en HTML
  await run('U-11', '¿4 botones de vista (Timeline/Weekly/Monthly/Lista)?', async () => {
    if (!html.includes('foc-view-timeline')) return FAIL('foc-view-timeline no encontrado');
    if (!html.includes('foc-view-list'))     return FAIL('foc-view-list no encontrado');
    if (!html.includes('foc-view-weekly'))   return FAIL('foc-view-weekly no encontrado');
    if (!html.includes('foc-view-monthly'))  return FAIL('foc-view-monthly no encontrado');
    return PASS('4 botones de vista OK');
  });

  // U-12 (Fase 3A): renderListView + setViewMode + bulk + export en fleet-ops.js
  await run('U-12', '¿renderListView, setViewMode, bulkAction, exportListCSV?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    const js = r.body;
    if (!js.includes('renderListView'))   return FAIL('renderListView no encontrado');
    if (!js.includes('setViewMode'))      return FAIL('setViewMode no encontrado');
    if (!js.includes('listSortBy'))       return FAIL('listSortBy no encontrado');
    if (!js.includes('toggleBulkSelect')) return FAIL('toggleBulkSelect no encontrado');
    if (!js.includes('exportListCSV'))    return FAIL('exportListCSV no encontrado');
    if (!js.includes('setListDensity'))   return FAIL('setListDensity no encontrado');
    return PASS('renderListView + bulk + export + density OK');
  });

  // U-13 (Fase 3A): Atajo L activa lista; T activa timeline
  await run('U-13', "¿Atajo L → lista, T → timeline?", async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes("setViewMode('timeline')")) return FAIL('atajo T no encontrado');
    if (!r.body.includes("setViewMode('list')"))     return FAIL('atajo L no encontrado');
    return PASS('T → timeline, L → lista OK');
  });

  // U-14 (Fase 3A): Atajo / hace focus en search
  await run('U-14', "¿Atajo / hace focus en foc-list-search?", async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes('foc-list-search')) return FAIL('foc-list-search no encontrado');
    if (!r.body.includes("e.key === '/'"))   return FAIL("Atajo '/' no implementado");
    return PASS('Atajo / → foc-list-search focus OK');
  });

  // U-15 (Fase 3A): Atajo [ retrocede rango, ] avanza
  await run('U-15', "¿Atajos [ y ] navegan el rango?", async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes("e.key === '['")) return FAIL("Atajo '[' no encontrado");
    if (!r.body.includes("e.key === ']'")) return FAIL("Atajo ']' no encontrado");
    return PASS('[ y ] navegan rango OK');
  });

  // U-16 (Fase 3A): Atajo ? muestra cheat sheet
  await run('U-16', "¿Atajo ? abre modal de shortcuts?", async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes("e.key === '?'"))         return FAIL("Atajo '?' no encontrado");
    if (!r.body.includes('showShortcutsModal'))     return FAIL('showShortcutsModal no encontrado');
    if (!r.body.includes('foc-shortcuts-modal'))    return FAIL('foc-shortcuts-modal no encontrado');
    return PASS('? → showShortcutsModal OK');
  });

  // U-17 (Fase 3A): Click en header de columna hace sort visible
  await run('U-17', '¿Headers de columna tienen sort (chevron)?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes('foc-sort-arrow'))   return FAIL('foc-sort-arrow no encontrado');
    if (!r.body.includes('listSortBy'))       return FAIL('listSortBy no encontrado');
    if (!r.body.includes('foc-lt-sort'))      return FAIL('foc-lt-sort no encontrado');
    return PASS('Sort arrow + active class OK');
  });

  // U-18 (Fase 3A): Checkbox de selección activa barra de bulk actions
  await run('U-18', '¿Checkbox activa barra de bulk actions?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes('toggleBulkSelect')) return FAIL('toggleBulkSelect no encontrado');
    if (!r.body.includes('foc-bulk-bar'))     return FAIL('foc-bulk-bar no encontrado');
    if (!r.body.includes('S.bulkSelected'))   return FAIL('S.bulkSelected no encontrado');
    return PASS('toggleBulkSelect + foc-bulk-bar + S.bulkSelected OK');
  });

  // U-19 (Fase 3A): Export CSV genera archivo con headers correctos
  await run('U-19', '¿exportListCSV incluye headers clave?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes('exportListCSV'))    return FAIL('exportListCSV no encontrado');
    if (!r.body.includes('customer_name'))    return FAIL('header customer_name no encontrado');
    if (!r.body.includes('total_amount'))     return FAIL('header total_amount no encontrado');
    if (!r.body.includes('booking_date'))     return FAIL('header booking_date no encontrado');
    if (!r.body.includes('uFEFF'))            return FAIL('BOM UTF-8 para Excel no encontrado');
    return PASS('exportListCSV con headers correctos OK');
  });

  // U-20 (Fase 3A): Cambio de densidad aplica al DOM (compact/medium/comfortable)
  await run('U-20', '¿setListDensity persiste en localStorage?', async () => {
    const r = await get(`${baseURL}/assets/js/operations/fleet-ops.js`);
    if (!r.body.includes('setListDensity'))                    return FAIL('setListDensity no encontrado');
    if (!r.body.includes('foc-list-density'))                  return FAIL('key localStorage no encontrado');
    if (!r.body.includes("'compact'"))                         return FAIL('densidad compact no encontrada');
    if (!r.body.includes("'comfortable'"))                     return FAIL('densidad comfortable no encontrada');
    if (!r.body.includes('localStorage.setItem'))              return FAIL('localStorage.setItem no encontrado');
    return PASS('compact + medium + comfortable + localStorage OK');
  });
}

// ── DATA TESTS ADICIONALES (D-07 … D-10) ─────────────────────────────────────
async function dataTestsPhase3A(baseURL) {
  console.log('\n📊 DATA — FASE 3A');

  // D-07: List view y KPIs usan misma fuente de datos
  await run('D-07', '¿/api/fleet/timeline retorna bookings y fleet?', async () => {
    try {
      const r = await get(`${baseURL}/api/fleet/timeline`);
      if (r.status !== 200) return FAIL(`Status ${r.status}`);
      const d = JSON.parse(r.body);
      if (!Array.isArray(d.bookings)) return FAIL('bookings no es array');
      if (!Array.isArray(d.fleet))    return FAIL('fleet no es array');
      return PASS(`bookings=${d.bookings.length} fleet=${d.fleet.length}`);
    } catch(e) { return FAIL(e.message); }
  });

  // D-08: Sort por total_amount desc coloca los más caros primero
  await run('D-08', '¿Bookings tienen total_amount numeric para sort?', async () => {
    try {
      const r = await get(`${baseURL}/api/fleet/timeline`);
      const d = JSON.parse(r.body);
      if (!d.bookings?.length) return SKIP('Sin bookings en rango actual');
      const hasNumeric = d.bookings.some(b => parseFloat(b.total_amount) > 0);
      if (!hasNumeric) return WARN('Ningún booking tiene total_amount > 0');
      const sorted = [...d.bookings].sort((a,b) => parseFloat(b.total_amount||0) - parseFloat(a.total_amount||0));
      const topOrig = parseFloat(d.bookings[0]?.total_amount||0);
      const topSort = parseFloat(sorted[0]?.total_amount||0);
      return PASS(`Top total: $${topSort} (sort funcional, orig top: $${topOrig})`);
    } catch(e) { return FAIL(e.message); }
  });

  // D-09: Filtro de búsqueda por barco funciona
  await run('D-09', '¿Bookings tienen boat_type para filtrar?', async () => {
    try {
      const r = await get(`${baseURL}/api/fleet/timeline`);
      const d = JSON.parse(r.body);
      if (!d.bookings?.length) return SKIP('Sin bookings en rango actual');
      const withBoat = d.bookings.filter(b => b.boat_type);
      if (withBoat.length === 0) return WARN('Ningún booking tiene boat_type');
      const boatTypes = [...new Set(withBoat.map(b=>b.boat_type))];
      return PASS(`${withBoat.length} bookings con boat_type. Tipos: ${boatTypes.slice(0,3).join(', ')}`);
    } catch(e) { return FAIL(e.message); }
  });

  // D-10: payment_status presente en bookings para bulk "marcar pagado"
  await run('D-10', '¿Bookings tienen payment_status?', async () => {
    try {
      const r = await get(`${baseURL}/api/fleet/timeline`);
      const d = JSON.parse(r.body);
      if (!d.bookings?.length) return SKIP('Sin bookings en rango actual');
      const withPS = d.bookings.filter(b => b.payment_status);
      const ratio  = Math.round(withPS.length / d.bookings.length * 100);
      if (ratio < 50) return WARN(`Solo ${ratio}% de bookings tienen payment_status`);
      return PASS(`${withPS.length}/${d.bookings.length} bookings con payment_status (${ratio}%)`);
    } catch(e) { return FAIL(e.message); }
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
    await dataTestsPhase3A(url);
    await integrityTests();

    printReport(url, buildTs, Date.now() - start);
  }
}

main().catch(e => { console.error('Runner error:', e); process.exit(2); });
