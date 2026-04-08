'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  boats: [],
  summary: [],
  totals: {},
  usageRows: [],
  usageTotal: 0,
  usageOffset: 0,
  fuelRows: [],
  fuelTotal: 0,
  fuelOffset: 0,
  filters: { boat_id: '', from: '', to: '' },
  editingUsageId: null,
  PAGE_SIZE: 50,
};

// ─── DOM helpers ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const fmt = (n, dec = 1) => (n == null ? null : Number(n).toFixed(dec));
const fmtMoney = (n) => n == null ? null : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nullCell = () => `<span class="null-val">—</span>`;

function showToast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3500);
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ─── Date preset helpers ──────────────────────────────────────────────────────
function setThisMonth() {
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  $('filter-from').value = `${y}-${m}-01`;
  $('filter-to').value   = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
}

function setThisYear() {
  const y = new Date().getFullYear();
  $('filter-from').value = `${y}-01-01`;
  $('filter-to').value   = `${y}-12-31`;
}

// ─── Load boats dropdown ──────────────────────────────────────────────────────
async function loadBoats() {
  try {
    const boats = await apiFetch('/api/fuel-tracker/boats');
    state.boats = boats;
    const filterSel = $('filter-boat');
    const fuelSel = $('fuel-boat-id');
    filterSel.innerHTML = '<option value="">Todos los barcos</option>';
    fuelSel.innerHTML   = '<option value="">Seleccionar barco...</option>';
    for (const b of boats) {
      const opt1 = new Option(b.boat_name, b.boat_id);
      const opt2 = new Option(b.boat_name, b.boat_id);
      filterSel.appendChild(opt1);
      fuelSel.appendChild(opt2);
    }
  } catch (e) {
    console.warn('Could not load boats:', e.message);
  }
}

// ─── Load Summary ─────────────────────────────────────────────────────────────
async function loadSummary() {
  const { boat_id, from, to } = state.filters;
  const params = new URLSearchParams();
  if (boat_id) params.set('boat_id', boat_id);
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  const data = await apiFetch(`/api/fuel-tracker/summary?${params}`);
  state.summary = data.summary || [];
  state.totals  = data.totals  || {};
  renderKPIs();
  renderSummaryTable();
}

function renderKPIs() {
  const t = state.totals;
  $('kpi-bookings').textContent  = t.booking_count ?? '—';
  $('kpi-reserved').textContent  = t.hours_reserved != null ? `${t.hours_reserved}h` : '—';
  $('kpi-engine').textContent    = t.hours_engine   != null ? `${t.hours_engine}h`   : '—';
  $('kpi-gallons').textContent   = t.gallons        != null ? `${t.gallons} gal`     : '—';
  $('kpi-fuel-cost').textContent = t.fuel_cost      != null ? fmtMoney(t.fuel_cost)  : '—';

  if (t.hours_engine != null && t.hours_reserved) {
    const pct = Math.round((t.hours_engine / t.hours_reserved) * 100);
    $('kpi-efficiency').textContent = `${pct}%`;
  } else {
    $('kpi-efficiency').textContent = '—';
  }
}

function renderSummaryTable() {
  const tbody = $('summary-body');
  if (!state.summary.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-row">Sin datos para el período seleccionado</td></tr>';
    $('pending-badge').style.display = 'none';
    return;
  }

  const totalPending = state.summary.reduce((s, b) => s + (b.pending_engine_count || 0), 0);
  if (totalPending > 0) {
    $('pending-badge').textContent = `${totalPending} reservas sin horas de motor`;
    $('pending-badge').style.display = 'inline';
  } else {
    $('pending-badge').style.display = 'none';
  }

  tbody.innerHTML = state.summary.map(b => {
    const eff = b.efficiency_pct;
    const effClass = eff == null ? '' : eff >= 80 ? 'good' : eff >= 60 ? 'warn' : 'bad';
    const effPct   = eff != null ? eff : 0;
    const effLabel = eff != null ? `${eff}%` : nullCell();

    const insightDots = b.insights.length
      ? `<div class="insights-dots">${b.insights.map(i =>
          `<span class="insight-dot ${i}" title="${i.replace(/_/g,' ')}"></span>`
        ).join('')}</div>`
      : '';

    return `<tr>
      <td><strong>${b.boat_name}</strong></td>
      <td>${b.booking_count}</td>
      <td>${b.hours_reserved != null ? b.hours_reserved + 'h' : nullCell()}</td>
      <td>${b.hours_engine   != null ? b.hours_engine + 'h'   : nullCell()}</td>
      <td>
        <div class="eff-bar-wrap">
          <div class="eff-bar-bg"><div class="eff-bar-fill ${effClass}" style="width:${Math.min(effPct,100)}%"></div></div>
          ${effLabel}
        </div>
      </td>
      <td>${b.gallons != null ? b.gallons + ' gal' : nullCell()}</td>
      <td>${b.fuel_cost ? fmtMoney(b.fuel_cost) : nullCell()}</td>
      <td>${b.engine_consumption_gal_hr != null ? b.engine_consumption_gal_hr + ' gal/hr' : nullCell()}</td>
      <td>${b.cost_per_reserved_hour != null ? fmtMoney(b.cost_per_reserved_hour) + '/hr' : nullCell()}</td>
      <td>${insightDots || '✓'}</td>
    </tr>`;
  }).join('');
}

// ─── Load Insights ────────────────────────────────────────────────────────────
async function loadInsights() {
  const { from, to } = state.filters;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  try {
    const data = await apiFetch(`/api/fuel-tracker/insights?${params}`);
    if (data.insights && data.insights.length) {
      renderInsights(data.insights);
      $('insights-panel').style.display = 'block';
    } else {
      $('insights-panel').style.display = 'none';
    }
  } catch (e) {
    $('insights-panel').style.display = 'none';
  }
}

function renderInsights(insights) {
  const list = $('insights-list');
  list.innerHTML = insights.map(ins => `
    <div class="insight-item">
      <span class="insight-badge ${ins.severity}">${ins.severity === 'alert' ? 'Alerta' : ins.severity === 'warning' ? 'Aviso' : 'Info'}</span>
      <strong>${ins.boat_name}:</strong> ${ins.message}
    </div>
  `).join('');
}

// ─── Load Engine / Usage Log ──────────────────────────────────────────────────
async function loadUsage(reset = true) {
  if (reset) { state.usageOffset = 0; state.usageRows = []; }

  const { boat_id, from, to } = state.filters;
  const statusFilter = $('engine-status-filter').value;
  const params = new URLSearchParams();
  if (boat_id)     params.set('boat_id', boat_id);
  if (from)        params.set('from', from);
  if (to)          params.set('to', to);
  if (statusFilter) params.set('status', statusFilter);
  params.set('limit',  state.PAGE_SIZE);
  params.set('offset', state.usageOffset);

  const data = await apiFetch(`/api/fuel-tracker/usage?${params}`);
  state.usageRows  = reset ? data.rows : [...state.usageRows, ...data.rows];
  state.usageTotal = data.total;
  renderEngineTable();
}

function renderEngineTable() {
  const tbody = $('engine-body');
  const moreBtn = $('btn-load-more-engine');

  if (!state.usageRows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Sin registros de motor para los filtros seleccionados</td></tr>';
    moreBtn.style.display = 'none';
    return;
  }

  tbody.innerHTML = state.usageRows.map(row => {
    const dateStr = row.booking_date ? row.booking_date.slice(0, 10) : '—';
    const status = row.status === 'complete' ? 'Completado' : 'Pendiente';
    const statusClass = row.status === 'complete' ? 'status-complete' : 'status-pending';
    const engineHrs = row.hours_engine != null ? `${row.hours_engine}h` : `<span class="null-val">Sin registrar</span>`;

    return `<tr data-id="${row.id}">
      <td>${dateStr}</td>
      <td>${row.boat_name || row.boat_id || '—'}</td>
      <td>${row.customer_name || '—'}</td>
      <td>${row.platform || '—'}</td>
      <td>${row.hours_reserved}h</td>
      <td>${engineHrs}</td>
      <td><span class="status-badge ${statusClass}">${status}</span></td>
      <td>${row.notes ? `<span title="${escHtml(row.notes)}" style="cursor:help">📝</span>` : ''}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-edit-engine" data-id="${row.id}">Editar</button>
      </td>
    </tr>`;
  }).join('');

  const remaining = state.usageTotal - state.usageRows.length;
  if (remaining > 0) {
    moreBtn.style.display = 'inline-flex';
    moreBtn.textContent = `Cargar más (${remaining} restantes)`;
  } else {
    moreBtn.style.display = 'none';
  }

  // Bind edit buttons
  document.querySelectorAll('.btn-edit-engine').forEach(btn => {
    btn.addEventListener('click', () => openEngineModal(btn.dataset.id));
  });
}

// ─── Engine Modal ─────────────────────────────────────────────────────────────
function openEngineModal(id) {
  const row = state.usageRows.find(r => r.id === id);
  if (!row) return;
  state.editingUsageId = id;

  const dateStr = row.booking_date ? row.booking_date.slice(0, 10) : '—';
  $('modal-booking-info').innerHTML = `
    <strong>Fecha:</strong> ${dateStr} &nbsp;|&nbsp;
    <strong>Barco:</strong> ${row.boat_name || row.boat_id || '—'} &nbsp;|&nbsp;
    <strong>Cliente:</strong> ${row.customer_name || '—'} &nbsp;|&nbsp;
    <strong>Hrs Reservadas:</strong> ${row.hours_reserved}h
  `;

  $('modal-engine-hours').value = row.hours_engine != null ? row.hours_engine : '';
  $('modal-notes').value        = row.notes || '';
  $('modal-status').value       = row.status || 'pending';
  $('engine-modal').style.display = 'flex';
  $('modal-engine-hours').focus();
}

function closeEngineModal() {
  $('engine-modal').style.display = 'none';
  state.editingUsageId = null;
}

async function saveEngineHours() {
  const id  = state.editingUsageId;
  const hrs = $('modal-engine-hours').value;
  const notes  = $('modal-notes').value.trim();
  const status = $('modal-status').value;

  if (!id) return;

  const body = { status };
  if (hrs !== '') body.hours_engine = parseFloat(hrs);
  if (notes)      body.notes = notes;

  try {
    await apiFetch(`/api/fuel-tracker/usage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showToast('Horas de motor actualizadas', 'success');
    closeEngineModal();
    loadAll();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ─── Load Fuel Log ────────────────────────────────────────────────────────────
async function loadFuel(reset = true) {
  if (reset) { state.fuelOffset = 0; state.fuelRows = []; }

  const { boat_id, from, to } = state.filters;
  const params = new URLSearchParams();
  if (boat_id) params.set('boat_id', boat_id);
  if (from)    params.set('from', from);
  if (to)      params.set('to', to);
  params.set('limit',  state.PAGE_SIZE);
  params.set('offset', state.fuelOffset);

  const data = await apiFetch(`/api/fuel-tracker/fuel?${params}`);
  state.fuelRows  = reset ? data.rows : [...state.fuelRows, ...data.rows];
  state.fuelTotal = data.total;
  renderFuelTable();
}

function renderFuelTable() {
  const tbody = $('fuel-body');
  const moreBtn = $('btn-load-more-fuel');

  if (!state.fuelRows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Sin entradas de combustible</td></tr>';
    moreBtn.style.display = 'none';
    return;
  }

  tbody.innerHTML = state.fuelRows.map(row => {
    const dateStr = row.log_date ? row.log_date.slice(0, 10) : '—';
    return `<tr>
      <td>${dateStr}</td>
      <td>${row.boat_name || row.boat_id || '—'}</td>
      <td>${row.gallons} gal</td>
      <td>${row.cost_per_gallon ? fmtMoney(row.cost_per_gallon) : nullCell()}</td>
      <td>${row.total_cost ? fmtMoney(row.total_cost) : nullCell()}</td>
      <td>${row.odometer_hours != null ? row.odometer_hours + 'h' : nullCell()}</td>
      <td>${row.station || nullCell()}</td>
      <td>${row.notes || ''}</td>
      <td>
        <button class="btn btn-danger btn-sm btn-delete-fuel" data-id="${row.id}">Eliminar</button>
      </td>
    </tr>`;
  }).join('');

  const remaining = state.fuelTotal - state.fuelRows.length;
  if (remaining > 0) {
    moreBtn.style.display = 'inline-flex';
    moreBtn.textContent = `Cargar más (${remaining} restantes)`;
  } else {
    moreBtn.style.display = 'none';
  }

  document.querySelectorAll('.btn-delete-fuel').forEach(btn => {
    btn.addEventListener('click', () => deleteFuel(btn.dataset.id));
  });
}

async function deleteFuel(id) {
  if (!confirm('¿Eliminar esta entrada de combustible?')) return;
  try {
    await apiFetch(`/api/fuel-tracker/fuel/${id}`, { method: 'DELETE' });
    showToast('Entrada eliminada', 'success');
    loadFuel();
    loadSummary();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ─── Add Fuel Form ────────────────────────────────────────────────────────────
function setupFuelForm() {
  // Auto-calculate total when gallons or price changes
  const calcTotal = () => {
    const gal = parseFloat($('fuel-gallons').value) || 0;
    const cpg = parseFloat($('fuel-cpg').value) || 0;
    if (gal && cpg) {
      $('fuel-total').value = (gal * cpg).toFixed(2);
    }
  };
  $('fuel-gallons').addEventListener('input', calcTotal);
  $('fuel-cpg').addEventListener('input', calcTotal);

  // Set today as default date
  const today = new Date().toISOString().slice(0, 10);
  $('fuel-date').value = today;

  $('fuel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const boat_id = $('fuel-boat-id').value;
    if (!boat_id) return showToast('Selecciona un barco', 'error');

    const boat = state.boats.find(b => b.boat_id === boat_id);
    const body = {
      boat_id,
      boat_name: boat ? boat.boat_name : boat_id,
      log_date:         $('fuel-date').value,
      gallons:      parseFloat($('fuel-gallons').value),
      cost_per_gallon: $('fuel-cpg').value ? parseFloat($('fuel-cpg').value) : null,
      total_cost:      $('fuel-total').value ? parseFloat($('fuel-total').value) : null,
      odometer_hours:  $('fuel-odometer').value ? parseFloat($('fuel-odometer').value) : null,
      station: $('fuel-station').value.trim() || null,
      notes:   $('fuel-notes').value.trim()   || null,
    };

    try {
      await apiFetch('/api/fuel-tracker/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      showToast('Carga de combustible guardada', 'success');
      e.target.reset();
      $('fuel-date').value = today;
      loadFuel();
      loadSummary();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ─── Backfill ─────────────────────────────────────────────────────────────────
async function doBackfill() {
  const btn = $('btn-confirm-backfill');
  btn.disabled = true;
  btn.textContent = 'Importando...';
  try {
    const res = await apiFetch('/api/fuel-tracker/usage/backfill', { method: 'POST' });
    showToast(`Importadas ${res.created} reservas de ${res.total_bookings} encontradas`, 'success');
    $('backfill-modal').style.display = 'none';
    loadAll();
    loadBoats();
  } catch (e) {
    showToast('Error en importación: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Importación';
  }
}

// ─── Load all tabs ────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    await Promise.all([
      loadSummary(),
      loadUsage(true),
      loadFuel(true),
      loadInsights(),
    ]);
  } catch (e) {
    showToast('Error cargando datos: ' + e.message, 'error');
  }
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ─── Dark mode ────────────────────────────────────────────────────────────────
function setupDarkMode() {
  const btn = $('btn-dark-mode');
  if (localStorage.getItem('dark-mode') === 'true') {
    document.body.classList.add('dark-mode');
    btn.textContent = '☀️ Modo Claro';
  }
  btn.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('dark-mode', isDark);
    btn.textContent = isDark ? '☀️ Modo Claro' : '🌙 Modo Oscuro';
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  // Default date range: this month
  setThisMonth();
  state.filters.from = $('filter-from').value;
  state.filters.to   = $('filter-to').value;

  setupDarkMode();
  setupTabs();
  setupFuelForm();

  // Filter events
  $('btn-apply-filters').addEventListener('click', () => {
    state.filters.boat_id = $('filter-boat').value;
    state.filters.from    = $('filter-from').value;
    state.filters.to      = $('filter-to').value;
    loadAll();
  });

  $('btn-preset-month').addEventListener('click', () => {
    setThisMonth();
    $('btn-apply-filters').click();
  });

  $('btn-preset-year').addEventListener('click', () => {
    setThisYear();
    $('btn-apply-filters').click();
  });

  // Engine status filter
  $('engine-status-filter').addEventListener('change', () => loadUsage(true));

  // Engine load more
  $('btn-load-more-engine').addEventListener('click', () => {
    state.usageOffset += state.PAGE_SIZE;
    loadUsage(false);
  });

  // Fuel load more
  $('btn-load-more-fuel').addEventListener('click', () => {
    state.fuelOffset += state.PAGE_SIZE;
    loadFuel(false);
  });

  // Engine modal
  $('btn-close-engine-modal').addEventListener('click', closeEngineModal);
  $('btn-cancel-engine-modal').addEventListener('click', closeEngineModal);
  $('btn-save-engine').addEventListener('click', saveEngineHours);
  $('engine-modal').addEventListener('click', (e) => { if (e.target === $('engine-modal')) closeEngineModal(); });

  // Backfill
  $('btn-backfill').addEventListener('click', () => { $('backfill-modal').style.display = 'flex'; });
  $('btn-close-backfill-modal').addEventListener('click', () => { $('backfill-modal').style.display = 'none'; });
  $('btn-cancel-backfill').addEventListener('click', () => { $('backfill-modal').style.display = 'none'; });
  $('btn-confirm-backfill').addEventListener('click', doBackfill);

  // Insights dismiss
  $('btn-dismiss-insights').addEventListener('click', () => { $('insights-panel').style.display = 'none'; });

  // Load data
  loadBoats().then(() => loadAll());
}

document.addEventListener('DOMContentLoaded', init);
