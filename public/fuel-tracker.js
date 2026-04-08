'use strict';

/* ═══════════════════════════════════════════════════════════════════
   Fuel Tracker — Premium Operational Dashboard
   ═══════════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────────────
const S = {
  boats:        [],
  summary:      [],
  totals:       {},
  usageRows:    [],
  usageTotal:   0,
  usageOff:     0,
  fuelRows:     [],
  fuelTotal:    0,
  fuelOff:      0,
  insights:     [],
  trendData:    [],
  filters:      { boat_id: '', from: '', to: '' },
  editingId:    null,
  PAGE:         60,
  charts:       { trend: null, hours: null },
  activePreset: 'month',
};

// ── DOM ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Format helpers ────────────────────────────────────────────────────
const fmtNum  = (n, d = 1)  => n == null ? null : Number(n).toFixed(d);
const fmtMon  = (n)          => n == null ? null : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtHrs  = (n)          => n == null ? null : Number(n).toFixed(1) + 'h';
const fmtGal  = (n)          => n == null ? null : Number(n).toFixed(1) + ' gal';
const nullSpan = ()           => `<span class="null-val">—</span>`;
const valOrNull = (v, suffix = '') => v != null ? `${v}${suffix}` : nullSpan();

// ── Efficiency class ──────────────────────────────────────────────────
const effClass = (pct) => pct == null ? 'na' : pct >= 80 ? 'good' : pct >= 60 ? 'warn' : 'bad';

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3800);
}

// ── API fetch ─────────────────────────────────────────────────────────
async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Date helpers ──────────────────────────────────────────────────────
function setPreset(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() + 1, 0).getDate();

  if (preset === 'month') {
    $('filter-from').value = `${y}-${m}-01`;
    $('filter-to').value   = `${y}-${m}-${String(last).padStart(2, '0')}`;
  } else if (preset === '3m') {
    const from = new Date(now); from.setMonth(from.getMonth() - 2); from.setDate(1);
    $('filter-from').value = from.toISOString().slice(0, 10);
    $('filter-to').value   = `${y}-${m}-${String(last).padStart(2, '0')}`;
  } else if (preset === 'year') {
    $('filter-from').value = `${y}-01-01`;
    $('filter-to').value   = `${y}-12-31`;
  }

  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const presetBtnMap = { month: 'btn-preset-month', '3m': 'btn-preset-3m', year: 'btn-preset-year' };
  if (presetBtnMap[preset]) $(presetBtnMap[preset])?.classList.add('active');
  S.activePreset = preset;
}

function updatePeriodLabel() {
  const from = S.filters.from;
  const to   = S.filters.to;
  const boat = S.filters.boat_id;
  const boatName = boat ? (S.boats.find(b => b.boat_id === boat)?.boat_name || boat) : 'Todos los barcos';
  if (from && to) {
    const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
    $('period-label').textContent = `${fmtDate(from)} — ${fmtDate(to)} · ${boatName}`;
  } else {
    $('period-label').textContent = boatName;
  }
}

// ── Load boats for dropdowns ──────────────────────────────────────────
async function loadBoats() {
  try {
    const boats = await api('/api/fuel-tracker/boats');
    S.boats = boats;
    ['filter-boat', 'fuel-boat-id', 'chart-boat-filter'].forEach(selId => {
      const sel = $(selId);
      if (!sel) return;
      const first = sel.options[0];
      sel.innerHTML = '';
      sel.appendChild(first);
      for (const b of boats) {
        const opt = new Option(b.boat_name, b.boat_id);
        sel.appendChild(opt);
      }
    });
  } catch (e) {
    console.warn('loadBoats:', e.message);
  }
}

// ── Load Summary ──────────────────────────────────────────────────────
async function loadSummary() {
  const { boat_id, from, to } = S.filters;
  const p = new URLSearchParams();
  if (boat_id) p.set('boat_id', boat_id);
  if (from) p.set('from', from);
  if (to)   p.set('to',   to);
  const data = await api(`/api/fuel-tracker/summary?${p}`);
  S.summary = data.summary || [];
  S.totals  = data.totals  || {};
  renderKPIs();
  renderBoatCards();
}

function renderKPIs() {
  const t = S.totals;

  $('kpi-bookings').textContent = t.booking_count ?? '—';
  $('kpi-reserved').textContent = t.hours_reserved != null ? fmtHrs(t.hours_reserved) : '—';
  $('kpi-engine').textContent   = t.hours_engine   != null ? fmtHrs(t.hours_engine)   : '—';
  $('kpi-gallons').textContent  = t.gallons         != null ? fmtGal(t.gallons)        : '—';
  $('kpi-fuel-cost').textContent= t.fuel_cost       != null ? fmtMon(t.fuel_cost)      : '—';

  // Efficiency KPI
  const effCard = $('kpi-eff-card');
  if (t.hours_engine != null && t.hours_reserved) {
    const pct = Math.round((t.hours_engine / t.hours_reserved) * 100);
    $('kpi-efficiency').textContent = `${pct}%`;
    effCard.classList.remove('kpi-warn', 'kpi-bad');
    if (pct < 60) effCard.classList.add('kpi-bad');
    else if (pct < 80) effCard.classList.add('kpi-warn');
  } else {
    $('kpi-efficiency').textContent = '—';
  }

  // Gal/Hr engine
  const totalEngine = parseFloat(t.hours_engine) || 0;
  const totalGallons = parseFloat(t.gallons) || 0;
  if (totalEngine && totalGallons) {
    $('kpi-gal-hr').textContent = `${(totalGallons / totalEngine).toFixed(2)} g/h`;
  } else {
    $('kpi-gal-hr').textContent = '—';
  }

  // Cost/Hr reserved
  const totalReserved = parseFloat(t.hours_reserved) || 0;
  const totalCost = parseFloat(t.fuel_cost) || 0;
  if (totalReserved && totalCost) {
    $('kpi-cost-hr').textContent = `${fmtMon(totalCost / totalReserved)}/hr`;
  } else {
    $('kpi-cost-hr').textContent = '—';
  }
}

// ── Boat Performance Cards ─────────────────────────────────────────────
function renderBoatCards() {
  const grid = $('boat-cards-grid');

  if (!S.summary.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-3);">
        <svg style="width:48px;height:48px;margin-bottom:0.75rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 22V8l9-6 9 6v14H3z"/><path d="M10 22V12h4v10"/></svg>
        <p>No hay datos de embarcaciones para el período seleccionado</p>
        <p style="font-size:0.8rem;margin-top:0.5rem">Importa reservas históricas o crea nuevas reservas para comenzar</p>
      </div>`;

    const badge = $('pending-badge');
    badge.style.display = 'none';
    return;
  }

  // Determine best/worst efficiency
  const withEff = S.summary.filter(b => b.efficiency_pct != null);
  const bestEff  = withEff.length ? Math.max(...withEff.map(b => b.efficiency_pct)) : null;
  const worstEff = withEff.length ? Math.min(...withEff.map(b => b.efficiency_pct)) : null;
  const totalPending = S.summary.reduce((s, b) => s + (b.pending_engine_count || 0), 0);

  if (totalPending > 0) {
    $('pending-badge').textContent = `${totalPending} ${totalPending === 1 ? 'reserva pendiente' : 'reservas pendientes'} sin horas de motor`;
    $('pending-badge').style.display = '';
    $('tab-pending-count').textContent = totalPending;
    $('tab-pending-count').style.display = '';
  } else {
    $('pending-badge').style.display = 'none';
    $('tab-pending-count').style.display = 'none';
  }

  grid.innerHTML = S.summary.map(b => {
    const isBest  = bestEff  != null && b.efficiency_pct === bestEff  && S.summary.length > 1;
    const isWorst = worstEff != null && b.efficiency_pct === worstEff && S.summary.length > 1;
    const hasAlert = b.insights.length > 0;

    const effPct   = b.efficiency_pct;
    const effCls   = effClass(effPct);
    const ringPct  = effPct != null ? Math.min(effPct, 100) : 0;
    const CIRC     = 201;
    const offset   = CIRC - (ringPct / 100) * CIRC;

    let rankHtml = '';
    if (isBest)  rankHtml = `<span class="boat-card-rank rank-best">Mejor eficiencia</span>`;
    if (isWorst) rankHtml = `<span class="boat-card-rank rank-worst">Menor eficiencia</span>`;
    else if (hasAlert && !isBest) rankHtml = `<span class="boat-card-rank rank-warn">Con alertas</span>`;

    const cardClass = isBest ? 'best-eff' : isWorst ? 'worst-eff' : hasAlert ? 'has-alerts' : '';

    const pctLabel = effPct != null
      ? `<span class="ring-pct ${effCls}">${effPct}%</span><span class="ring-sub">Efic.</span>`
      : `<span class="ring-pct na">N/A</span><span class="ring-sub">Sin datos</span>`;

    const pendingHtml = b.pending_engine_count
      ? `<div class="pending-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${b.pending_engine_count} pendiente${b.pending_engine_count > 1 ? 's' : ''}</div>`
      : `<span class="boat-no-data" style="font-size:0.73rem;color:var(--text-3)">✓ Motor completo</span>`;

    return `<div class="boat-perf-card ${cardClass}">
      <div class="boat-card-header">
        <div class="boat-card-name-wrap">
          <div class="boat-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l4-8 5 3 5-6 4 11H3z"/><path d="M3 21h18"/></svg>
          </div>
          <span class="boat-card-name">${esc(b.boat_name)}</span>
        </div>
        ${rankHtml}
      </div>
      <div class="boat-card-body">
        <div class="ring-wrap">
          <svg class="ring-svg" viewBox="0 0 80 80">
            <circle class="ring-bg"   cx="40" cy="40" r="32"/>
            <circle class="ring-fill ${effCls}" cx="40" cy="40" r="32"
              style="stroke-dashoffset:${offset}"/>
          </svg>
          <div class="ring-label">${pctLabel}</div>
        </div>
        <div class="boat-metrics">
          <div class="bm-item">
            <span class="bm-val">${b.booking_count}</span>
            <span class="bm-lbl">Reservas</span>
          </div>
          <div class="bm-item">
            <span class="bm-val">${b.gallons ? fmtGal(b.gallons) : '<span class="bm-null">—</span>'}</span>
            <span class="bm-lbl">Galones</span>
          </div>
          <div class="bm-item">
            <span class="bm-val">${b.hours_reserved != null ? fmtHrs(b.hours_reserved) : '<span class="bm-null">—</span>'}</span>
            <span class="bm-lbl">Hrs Reservadas</span>
          </div>
          <div class="bm-item">
            <span class="bm-val">${b.fuel_cost ? fmtMon(b.fuel_cost) : '<span class="bm-null">—</span>'}</span>
            <span class="bm-lbl">Costo Fuel</span>
          </div>
          <div class="bm-item">
            <span class="bm-val">${b.hours_engine != null ? fmtHrs(b.hours_engine) : '<span class="bm-null">—</span>'}</span>
            <span class="bm-lbl">Hrs Motor</span>
          </div>
          <div class="bm-item">
            <span class="bm-val">${b.engine_consumption_gal_hr != null ? b.engine_consumption_gal_hr + ' g/h' : '<span class="bm-null">—</span>'}</span>
            <span class="bm-lbl">Gal/Hr Motor</span>
          </div>
        </div>
      </div>
      <div class="boat-card-footer">
        ${pendingHtml}
        ${b.cost_per_reserved_hour != null
          ? `<span style="font-size:0.73rem;color:var(--text-2)">${fmtMon(b.cost_per_reserved_hour)}/hr reserva</span>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Alerts / Insights ─────────────────────────────────────────────────
async function loadInsights() {
  const { from, to } = S.filters;
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  try {
    const data = await api(`/api/fuel-tracker/insights?${p}`);
    S.insights = data.insights || [];
    renderAlerts();
  } catch (e) {
    $('alerts-section').style.display = 'none';
  }
}

function renderAlerts() {
  const section = $('alerts-section');
  const grid    = $('alerts-grid');
  const badge   = $('alert-count-badge');

  if (!S.insights.length) { section.style.display = 'none'; return; }

  section.style.display = '';
  badge.textContent = S.insights.length;

  const sevIcon = {
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    alert:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  grid.innerHTML = S.insights.map(ins => `
    <div class="alert-item sev-${ins.severity}">
      <div class="alert-icon">${sevIcon[ins.severity] || sevIcon.info}</div>
      <div class="alert-body">
        <div class="alert-boat">${esc(ins.boat_name)}</div>
        <div class="alert-msg">${esc(ins.message)}</div>
      </div>
    </div>`).join('');
}

// ── Charts ─────────────────────────────────────────────────────────────
async function loadTrend() {
  const boatId = $('chart-boat-filter')?.value || S.filters.boat_id;
  const months = $('chart-months')?.value || 6;
  const p = new URLSearchParams({ months });
  if (boatId) p.set('boat_id', boatId);
  try {
    const data = await api(`/api/fuel-tracker/trend?${p}`);
    S.trendData = data.trend || [];
    renderCharts();
  } catch (e) {
    console.warn('loadTrend:', e.message);
  }
}

function renderCharts() {
  const trend = S.trendData;
  const labels = trend.map(r => r.label || r.month);

  const hasFuel  = trend.some(r => r.gallons > 0 || r.cost > 0);
  const hasHours = trend.some(r => r.reserved > 0 || r.engine > 0);

  // Trend chart (fuel)
  const trendEmpty = $('chart-trend-empty');
  const trendCanvas = document.getElementById('chart-trend');
  if (!hasFuel) {
    trendCanvas.style.display = 'none';
    trendEmpty.style.display = 'flex';
  } else {
    trendCanvas.style.display = '';
    trendEmpty.style.display = 'none';
    if (S.charts.trend) S.charts.trend.destroy();
    S.charts.trend = new Chart(trendCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Galones',
            data: trend.map(r => r.gallons),
            backgroundColor: 'rgba(245,158,11,0.7)',
            borderColor: 'rgba(245,158,11,1)',
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: 'y',
            order: 2,
          },
          {
            label: 'Costo ($)',
            data: trend.map(r => r.cost),
            type: 'line',
            borderColor: 'rgba(244,63,94,0.9)',
            backgroundColor: 'rgba(244,63,94,0.1)',
            pointBackgroundColor: 'rgba(244,63,94,1)',
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            yAxisID: 'y2',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) return ` ${ctx.raw?.toFixed(1)} gal`;
                return ` $${ctx.raw?.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: getComputedStyle(document.body).getPropertyValue('--text-3') || '#94a3b8' },
          },
          y: {
            position: 'left',
            grid: { color: 'rgba(148,163,184,0.15)' },
            ticks: { font: { size: 11 }, color: '#f59e0b', callback: (v) => v + ' gal' },
          },
          y2: {
            position: 'right',
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#f43f5e', callback: (v) => '$' + v.toFixed(0) },
          },
        },
      },
    });
  }

  // Hours chart
  const hoursEmpty  = $('chart-hours-empty');
  const hoursCanvas = document.getElementById('chart-hours');
  if (!hasHours) {
    hoursCanvas.style.display = 'none';
    hoursEmpty.style.display = 'flex';
  } else {
    hoursCanvas.style.display = '';
    hoursEmpty.style.display = 'none';
    if (S.charts.hours) S.charts.hours.destroy();
    S.charts.hours = new Chart(hoursCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Hrs Reservadas',
            data: trend.map(r => r.reserved),
            backgroundColor: 'rgba(99,102,241,0.65)',
            borderColor: 'rgba(99,102,241,1)',
            borderWidth: 1.5,
            borderRadius: 4,
          },
          {
            label: 'Hrs Motor',
            data: trend.map(r => r.engine),
            backgroundColor: 'rgba(139,92,246,0.65)',
            borderColor: 'rgba(139,92,246,1)',
            borderWidth: 1.5,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.raw?.toFixed(1)}h`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#94a3b8' },
          },
          y: {
            grid: { color: 'rgba(148,163,184,0.15)' },
            ticks: { font: { size: 11 }, color: '#94a3b8', callback: (v) => v + 'h' },
          },
        },
      },
    });
  }
}

// ── Engine Usage Table ─────────────────────────────────────────────────
async function loadUsage(reset = true) {
  if (reset) { S.usageOff = 0; S.usageRows = []; }
  const { boat_id, from, to } = S.filters;
  const statusVal = $('engine-status-filter')?.value || '';
  const p = new URLSearchParams({ limit: S.PAGE, offset: S.usageOff });
  if (boat_id)   p.set('boat_id', boat_id);
  if (from)      p.set('from', from);
  if (to)        p.set('to', to);
  if (statusVal) p.set('status', statusVal);
  const data = await api(`/api/fuel-tracker/usage?${p}`);
  S.usageRows  = reset ? data.rows : [...S.usageRows, ...data.rows];
  S.usageTotal = data.total;
  renderEngineTable();
}

function renderEngineTable() {
  const tbody   = $('engine-body');
  const moreBtn = $('btn-load-more-engine');

  if (!S.usageRows.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <p>Sin registros de motor para los filtros seleccionados</p>
    </td></tr>`;
    moreBtn.style.display = 'none';
    return;
  }

  tbody.innerHTML = S.usageRows.map(row => {
    const date     = row.booking_date ? row.booking_date.slice(0, 10) : '—';
    const effPct   = row.hours_engine && row.hours_reserved
      ? Math.round((row.hours_engine / row.hours_reserved) * 100) : null;
    const eCls     = effClass(effPct);
    const fillW    = effPct != null ? Math.min(effPct, 100) : 0;

    const statusHtml = row.status === 'complete'
      ? `<span class="status-pill status-complete"><span class="status-dot"></span>Completo</span>`
      : `<span class="status-pill status-pending"><span class="status-dot"></span>Pendiente</span>`;

    const effHtml = effPct != null
      ? `<div class="eff-cell" style="justify-content:flex-end">
           <div class="eff-mini-bar"><div class="eff-mini-fill ${eCls}" style="width:${fillW}%"></div></div>
           <span style="min-width:32px;text-align:right">${effPct}%</span>
         </div>`
      : nullSpan();

    return `<tr>
      <td>${date}</td>
      <td><strong>${esc(row.boat_name || row.boat_id || '—')}</strong></td>
      <td style="color:var(--text-2)">${esc(row.customer_name || '—')}</td>
      <td style="color:var(--text-3);font-size:0.8rem">${esc(row.platform || '—')}</td>
      <td class="td-num">${fmtHrs(row.hours_reserved)}</td>
      <td class="td-num">${row.hours_engine != null ? `<strong>${fmtHrs(row.hours_engine)}</strong>` : nullSpan()}</td>
      <td class="td-num">${effHtml}</td>
      <td>${statusHtml}</td>
      <td style="color:var(--text-3);font-size:0.8rem">${row.notes ? `<span title="${esc(row.notes)}">📝 ${esc(row.notes.slice(0,30))}${row.notes.length > 30 ? '…' : ''}</span>` : ''}</td>
      <td>
        <button class="row-action-btn btn-edit-engine" data-id="${row.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>
      </td>
    </tr>`;
  }).join('');

  const remaining = S.usageTotal - S.usageRows.length;
  moreBtn.style.display = remaining > 0 ? '' : 'none';
  if (remaining > 0) moreBtn.textContent = `Cargar más (${remaining} restantes)`;

  document.querySelectorAll('.btn-edit-engine').forEach(btn => {
    btn.addEventListener('click', () => openEngineModal(btn.dataset.id));
  });
}

// ── Engine Modal ──────────────────────────────────────────────────────
function openEngineModal(id) {
  const row = S.usageRows.find(r => r.id === id);
  if (!row) return;
  S.editingId = id;
  const date = row.booking_date ? row.booking_date.slice(0, 10) : '—';
  $('modal-booking-info').innerHTML = `
    <strong>${date}</strong> &nbsp;·&nbsp;
    <strong>${esc(row.boat_name || row.boat_id || '—')}</strong> &nbsp;·&nbsp;
    ${esc(row.customer_name || '—')} &nbsp;·&nbsp;
    Reservado: <strong>${fmtHrs(row.hours_reserved)}</strong>`;
  $('modal-engine-hours').value = row.hours_engine != null ? row.hours_engine : '';
  $('modal-notes').value        = row.notes || '';
  $('modal-status').value       = row.status || 'pending';
  $('engine-modal').style.display = 'flex';
  setTimeout(() => $('modal-engine-hours').focus(), 80);
}

function closeEngineModal() {
  $('engine-modal').style.display = 'none';
  S.editingId = null;
}

async function saveEngineHours() {
  const id  = S.editingId;
  if (!id) return;
  const hrs    = $('modal-engine-hours').value;
  const notes  = $('modal-notes').value.trim();
  const status = $('modal-status').value;
  const body = { status };
  if (hrs !== '') body.hours_engine = parseFloat(hrs);
  if (notes) body.notes = notes;
  try {
    await api(`/api/fuel-tracker/usage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast('Horas de motor actualizadas correctamente', 'success');
    closeEngineModal();
    loadAll();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ── Fuel Table ────────────────────────────────────────────────────────
async function loadFuel(reset = true) {
  if (reset) { S.fuelOff = 0; S.fuelRows = []; }
  const { boat_id, from, to } = S.filters;
  const p = new URLSearchParams({ limit: S.PAGE, offset: S.fuelOff });
  if (boat_id) p.set('boat_id', boat_id);
  if (from)    p.set('from', from);
  if (to)      p.set('to', to);
  const data = await api(`/api/fuel-tracker/fuel?${p}`);
  S.fuelRows  = reset ? data.rows : [...S.fuelRows, ...data.rows];
  S.fuelTotal = data.total;
  renderFuelTable();
  updateLastEntryTip();
}

function renderFuelTable() {
  const tbody   = $('fuel-body');
  const moreBtn = $('btn-load-more-fuel');

  if (!S.fuelRows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      <p>Sin entradas de combustible — usa "Registrar Carga" para comenzar</p>
    </td></tr>`;
    moreBtn.style.display = 'none';
    return;
  }

  tbody.innerHTML = S.fuelRows.map(row => {
    const date = row.log_date ? row.log_date.slice(0, 10) : '—';
    return `<tr>
      <td>${date}</td>
      <td><strong>${esc(row.boat_name || row.boat_id || '—')}</strong></td>
      <td class="td-num"><strong>${row.gallons} gal</strong></td>
      <td class="td-num">${row.cost_per_gallon ? fmtMon(row.cost_per_gallon) : nullSpan()}</td>
      <td class="td-num">${row.total_cost ? `<strong style="color:var(--rose)">${fmtMon(row.total_cost)}</strong>` : nullSpan()}</td>
      <td class="td-num">${row.odometer_hours != null ? row.odometer_hours + 'h' : nullSpan()}</td>
      <td style="color:var(--text-2)">${esc(row.station || '')}</td>
      <td style="color:var(--text-3);font-size:0.8rem">${esc(row.notes || '')}</td>
      <td>
        <button class="row-action-btn danger btn-del-fuel" data-id="${row.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Eliminar
        </button>
      </td>
    </tr>`;
  }).join('');

  const remaining = S.fuelTotal - S.fuelRows.length;
  moreBtn.style.display = remaining > 0 ? '' : 'none';
  if (remaining > 0) moreBtn.textContent = `Cargar más (${remaining} restantes)`;

  document.querySelectorAll('.btn-del-fuel').forEach(btn => {
    btn.addEventListener('click', () => deleteFuel(btn.dataset.id));
  });
}

async function deleteFuel(id) {
  if (!confirm('¿Eliminar esta entrada de combustible?')) return;
  try {
    await api(`/api/fuel-tracker/fuel/${id}`, { method: 'DELETE' });
    toast('Entrada eliminada', 'success');
    await Promise.all([loadFuel(), loadSummary(), loadTrend()]);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function updateLastEntryTip() {
  const tip = $('tip-last-entry');
  if (!S.fuelRows.length) {
    tip.textContent = 'Sin entradas de combustible registradas aún';
    return;
  }
  const last = S.fuelRows[0];
  const date = last.log_date ? last.log_date.slice(0, 10) : '—';
  tip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Última carga: <strong>${esc(last.boat_name || last.boat_id || '—')}</strong> — ${date} · ${last.gallons} gal`;
}

// ── Add Fuel Form ──────────────────────────────────────────────────────
function setupFuelForm() {
  const calcTotal = () => {
    const gal = parseFloat($('fuel-gallons').value) || 0;
    const cpg = parseFloat($('fuel-cpg').value)     || 0;
    if (gal && cpg) $('fuel-total').value = (gal * cpg).toFixed(2);
  };
  $('fuel-gallons').addEventListener('input', calcTotal);
  $('fuel-cpg').addEventListener('input', calcTotal);
  $('fuel-date').value = new Date().toISOString().slice(0, 10);

  $('fuel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const boat_id = $('fuel-boat-id').value;
    if (!boat_id) return toast('Selecciona una embarcación', 'error');
    const boat = S.boats.find(b => b.boat_id === boat_id);
    const body = {
      boat_id,
      boat_name:       boat?.boat_name || boat_id,
      log_date:        $('fuel-date').value,
      gallons:     parseFloat($('fuel-gallons').value),
      cost_per_gallon: $('fuel-cpg').value ? parseFloat($('fuel-cpg').value) : null,
      total_cost:      $('fuel-total').value ? parseFloat($('fuel-total').value) : null,
      odometer_hours:  $('fuel-odometer').value ? parseFloat($('fuel-odometer').value) : null,
      station:         $('fuel-station').value.trim() || null,
      notes:           $('fuel-notes').value.trim()   || null,
    };
    try {
      await api('/api/fuel-tracker/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast('Carga de combustible guardada correctamente', 'success');
      e.target.reset();
      $('fuel-date').value = new Date().toISOString().slice(0, 10);
      await Promise.all([loadFuel(), loadSummary(), loadTrend()]);
      // Switch to fuel tab to see the new entry
      switchDetailTab('fuel');
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  });
}

// ── Backfill ──────────────────────────────────────────────────────────
async function doBackfill() {
  const btn = $('btn-confirm-backfill');
  btn.disabled = true;
  btn.textContent = 'Importando...';
  try {
    const res = await api('/api/fuel-tracker/usage/backfill', { method: 'POST' });
    toast(`Importadas ${res.created} de ${res.total_bookings} reservas encontradas`, 'success');
    $('backfill-modal').style.display = 'none';
    await loadAll();
    await loadBoats();
  } catch (e) {
    toast('Error en importación: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Importación';
  }
}

// ── Tab switching ──────────────────────────────────────────────────────
function switchDetailTab(tab) {
  document.querySelectorAll('.detail-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.detail-tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.detail-tab[data-tab="${tab}"]`)?.classList.add('active');
  $(`tab-panel-${tab}`)?.classList.add('active');
}

function setupDetailTabs() {
  document.querySelectorAll('.detail-tab').forEach(btn => {
    btn.addEventListener('click', () => switchDetailTab(btn.dataset.tab));
  });
}

// ── Dark mode ─────────────────────────────────────────────────────────
function setupDarkMode() {
  const iconDark  = $('icon-dark');
  const iconLight = $('icon-light');

  const apply = (dark) => {
    document.body.classList.toggle('dark-mode', dark);
    iconDark.style.display  = dark ? 'none' : '';
    iconLight.style.display = dark ? '' : 'none';
    // Re-render charts for dark-mode colors
    if (S.trendData.length) setTimeout(renderCharts, 50);
  };

  if (localStorage.getItem('dark-mode') === 'true') apply(true);

  $('btn-dark-mode').addEventListener('click', () => {
    const isDark = !document.body.classList.contains('dark-mode');
    localStorage.setItem('dark-mode', isDark);
    apply(isDark);
  });
}

// ── Load all ─────────────────────────────────────────────────────────
async function loadAll() {
  updatePeriodLabel();
  try {
    await Promise.all([
      loadSummary(),
      loadUsage(true),
      loadFuel(true),
      loadInsights(),
      loadTrend(),
    ]);
  } catch (e) {
    toast('Error cargando datos: ' + e.message, 'error');
  }
}

// ── Init ──────────────────────────────────────────────────────────────
function init() {
  setupDarkMode();
  setupDetailTabs();
  setupFuelForm();
  setupQuickFuelModal();

  // Default: this month
  setPreset('month');
  S.filters.from = $('filter-from').value;
  S.filters.to   = $('filter-to').value;

  // Filter apply
  $('btn-apply-filters').addEventListener('click', () => {
    S.filters.boat_id = $('filter-boat').value;
    S.filters.from    = $('filter-from').value;
    S.filters.to      = $('filter-to').value;
    loadAll();
  });

  // Preset buttons
  ['month', '3m', 'year'].forEach(p => {
    const id = { month: 'btn-preset-month', '3m': 'btn-preset-3m', year: 'btn-preset-year' }[p];
    $(id)?.addEventListener('click', () => {
      setPreset(p);
      S.filters.from = $('filter-from').value;
      S.filters.to   = $('filter-to').value;
      loadAll();
    });
  });

  // Engine status filter
  $('engine-status-filter')?.addEventListener('change', () => loadUsage(true));

  // Load more
  $('btn-load-more-engine')?.addEventListener('click', () => { S.usageOff += S.PAGE; loadUsage(false); });
  $('btn-load-more-fuel')?.addEventListener('click',   () => { S.fuelOff  += S.PAGE; loadFuel(false); });

  // Chart controls
  $('chart-boat-filter')?.addEventListener('change', loadTrend);
  $('chart-months')?.addEventListener('change', loadTrend);

  // Engine modal
  $('btn-close-engine-modal')?.addEventListener('click', closeEngineModal);
  $('btn-cancel-engine-modal')?.addEventListener('click', closeEngineModal);
  $('btn-save-engine')?.addEventListener('click', saveEngineHours);
  $('engine-modal')?.addEventListener('click', (e) => { if (e.target === $('engine-modal')) closeEngineModal(); });
  $('modal-engine-hours')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveEngineHours(); });

  // Backfill modal
  $('btn-backfill')?.addEventListener('click', () => { $('backfill-modal').style.display = 'flex'; });
  $('btn-close-backfill-modal')?.addEventListener('click', () => { $('backfill-modal').style.display = 'none'; });
  $('btn-cancel-backfill')?.addEventListener('click', () => { $('backfill-modal').style.display = 'none'; });
  $('btn-confirm-backfill')?.addEventListener('click', doBackfill);

  // Alerts dismiss
  $('btn-dismiss-alerts')?.addEventListener('click', () => { $('alerts-section').style.display = 'none'; });

  // Load
  loadBoats().then(() => loadAll());
}

// ── Quick Fuel Modal ──────────────────────────────────────────────────
function openQuickFuelModal(boatId = '') {
  // Populate boats if not done yet
  const sel = $('qf-boat');
  if (sel && S.boats.length) {
    sel.innerHTML = '<option value="">Seleccionar barco...</option>';
    for (const b of S.boats) {
      const opt = new Option(b.boat_name, b.boat_id);
      if (b.boat_id === boatId) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  // Default date to today
  $('qf-date').value = new Date().toISOString().slice(0, 10);
  // Clear fields
  ['qf-gallons','qf-cpg','qf-total','qf-odometer','qf-station','qf-notes'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });
  $('qf-preview').style.display = 'none';
  $('quick-fuel-modal').style.display = 'flex';
  setTimeout(() => $('qf-boat').focus(), 80);
}

function closeQuickFuelModal() {
  $('quick-fuel-modal').style.display = 'none';
}

function updateQuickFuelPreview() {
  const gals = parseFloat($('qf-gallons').value) || 0;
  const cpg  = parseFloat($('qf-cpg').value) || 0;
  const total = parseFloat($('qf-total').value) || (gals * cpg);
  const boatSel = $('qf-boat');
  const boatName = boatSel.options[boatSel.selectedIndex]?.text || '—';
  const station  = $('qf-station').value.trim() || '—';

  // Auto-calculate total
  if (gals && cpg) {
    $('qf-total').value = (gals * cpg).toFixed(2);
  }

  const preview = $('qf-preview');
  if (gals) {
    preview.style.display = 'grid';
    $('qf-prev-boat').textContent    = boatName !== 'Seleccionar barco...' ? boatName : '—';
    $('qf-prev-station').textContent = station;
    $('qf-prev-gallons').textContent = gals.toFixed(1) + ' gal';
    $('qf-prev-total').textContent   = total ? '$' + total.toFixed(2) : '—';
  } else {
    preview.style.display = 'none';
  }
}

async function submitQuickFuel(keepOpen = false) {
  const boat_id = $('qf-boat').value;
  if (!boat_id) { toast('Selecciona una embarcación', 'error'); $('qf-boat').focus(); return; }
  const gallons = parseFloat($('qf-gallons').value);
  if (!gallons || gallons <= 0) { toast('Ingresa la cantidad de galones', 'error'); $('qf-gallons').focus(); return; }

  const btn = $('btn-save-quick-fuel');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-color:#fff;border-top-color:rgba(255,255,255,0.4)"></span> Guardando...`;

  const boat     = S.boats.find(b => b.boat_id === boat_id);
  const cpg      = $('qf-cpg').value   ? parseFloat($('qf-cpg').value)      : null;
  const total_c  = $('qf-total').value ? parseFloat($('qf-total').value)     : (cpg ? gallons * cpg : null);
  const odometer = $('qf-odometer').value ? parseFloat($('qf-odometer').value) : null;

  const body = {
    boat_id,
    boat_name:       boat?.boat_name || boat_id,
    log_date:        $('qf-date').value,
    gallons,
    cost_per_gallon: cpg,
    total_cost:      total_c,
    odometer_hours:  odometer,
    station:         $('qf-station').value.trim() || null,
    notes:           $('qf-notes').value.trim()   || null,
  };

  try {
    await api('/api/fuel-tracker/fuel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const boatName = boat?.boat_name || boat_id;
    toast(`✓ Carga registrada — ${boatName} · ${gallons.toFixed(1)} gal${total_c ? ` · $${total_c.toFixed(2)}` : ''}`, 'success');

    if (keepOpen) {
      // Reset form but keep boat, date, station selected
      const savedBoat    = boat_id;
      const savedDate    = $('qf-date').value;
      const savedStation = $('qf-station').value;
      ['qf-gallons','qf-cpg','qf-total','qf-odometer','qf-notes'].forEach(id => {
        const el = $(id); if (el) el.value = '';
      });
      $('qf-boat').value    = savedBoat;
      $('qf-date').value    = savedDate;
      $('qf-station').value = savedStation;
      $('qf-preview').style.display = 'none';
      setTimeout(() => $('qf-gallons').focus(), 60);
    } else {
      closeQuickFuelModal();
    }

    // Refresh data in background
    await Promise.all([loadFuel(), loadSummary(), loadTrend()]);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Guardar Carga`;
  }
}

function setupQuickFuelModal() {
  // Open triggers
  $('btn-quick-fuel')?.addEventListener('click', () => openQuickFuelModal());
  $('fab-fuel')?.addEventListener('click',       () => openQuickFuelModal());

  // Close
  $('btn-close-quick-fuel')?.addEventListener('click',  closeQuickFuelModal);
  $('btn-cancel-quick-fuel')?.addEventListener('click', closeQuickFuelModal);
  $('quick-fuel-modal')?.addEventListener('click', (e) => {
    if (e.target === $('quick-fuel-modal')) closeQuickFuelModal();
  });

  // Save & close
  $('quick-fuel-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitQuickFuel(false);
  });

  // Save & keep open (register another)
  $('btn-save-fuel-another')?.addEventListener('click', () => submitQuickFuel(true));

  // Live preview on any input change
  ['qf-boat','qf-gallons','qf-cpg','qf-total','qf-station'].forEach(id => {
    $(id)?.addEventListener('input', updateQuickFuelPreview);
    $(id)?.addEventListener('change', updateQuickFuelPreview);
  });

  // Keyboard shortcut: Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('quick-fuel-modal').style.display !== 'none') {
      closeQuickFuelModal();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
