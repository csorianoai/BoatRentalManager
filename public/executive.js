/* ================================================================
   NADAKI EXCURSIONS — DASHBOARD EJECUTIVO
   ================================================================ */

let currentData = null;
let sortField = 'income';
let sortDir = 'desc';

// ── HELPERS ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = (n, dec = 0) => isNaN(n) ? '$0' : '$' + parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtN = (n, dec = 1) => isNaN(n) ? '0' : parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPct = n => isNaN(n) ? '-' : parseFloat(n).toFixed(1) + '%';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es', { month: 'short', day: 'numeric' }) : '-';
const fmtDateFull = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
const esc = s => String(s||'').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

const changeBadge = (val) => {
  if (val === null || val === undefined) return '';
  const v = parseFloat(val);
  if (isNaN(v)) return '';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'neutral';
  const arrow = v > 0 ? '↑' : v < 0 ? '↓' : '→';
  return `<span class="kpi-change ${cls}">${arrow} ${Math.abs(v).toFixed(1)}% vs anterior</span>`;
};

const compBadge = (cur, prev) => {
  if (prev === 0 || prev === null) return `<span class="comp-badge flat">—</span>`;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
  return `<span class="comp-badge ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
};

const marginClass = m => {
  const v = parseFloat(m);
  if (isNaN(v)) return '';
  if (v >= 30) return 'margin-good';
  if (v >= 0) return 'margin-warn';
  return 'margin-bad';
};

const statusBadge = s => {
  const map = { pending: ['badge-yellow','Pendiente'], confirmed: ['badge-blue','Confirmado'], completed: ['badge-green','Completado'], cancelled: ['badge-gray','Cancelado'] };
  const [cls, label] = map[s] || ['badge-gray', s || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
};

const arStatusBadge = s => {
  const map = { pending: ['badge-yellow','Pendiente'], paid: ['badge-green','Cobrado'], cancelled: ['badge-gray','Cancelado'] };
  const [cls, label] = map[s] || ['badge-gray', s || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
};

// ── DATE PRESETS ─────────────────────────────────────────────────
function setPreset(p) {
  const now = new Date();
  let s, e;
  if (p === 'month') {
    s = new Date(now.getFullYear(), now.getMonth(), 1);
    e = now;
  } else if (p === 'lastmonth') {
    s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    e = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (p === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    s = new Date(now.getFullYear(), q * 3, 1);
    e = now;
  } else if (p === 'year') {
    s = new Date(now.getFullYear(), 0, 1);
    e = now;
  } else if (p === 'week') {
    s = new Date(now - 6 * 86400000);
    e = now;
  }
  $('filter-start').value = s.toISOString().split('T')[0];
  $('filter-end').value = e.toISOString().split('T')[0];
  document.querySelectorAll('.pill').forEach(el => el.classList.remove('active'));
  document.querySelector(`[onclick="setPreset('${p}')"]`)?.classList.add('active');
  loadData();
}

// ── INIT ──────────────────────────────────────────────────────────
(async () => {
  // Set default dates (current month)
  const now = new Date();
  $('filter-start').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  $('filter-end').value = now.toISOString().split('T')[0];
  // Load boats for filter
  try {
    const r = await fetch('/api/boats');
    if (r.ok) {
      const boats = await r.json();
      const sel = $('filter-boat');
      boats.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id; opt.textContent = b.name;
        sel.appendChild(opt);
      });
    }
  } catch(_) {}
  // Auto-apply filter on boat change
  $('filter-boat').addEventListener('change', loadData);
  await loadData();
})();

// ── MAIN LOAD ─────────────────────────────────────────────────────
async function loadData() {
  const start  = $('filter-start').value;
  const end    = $('filter-end').value;
  const boat   = $('filter-boat').value;
  const params = new URLSearchParams({ start, end });
  if (boat) params.set('boat_id', boat);

  // Show spinners
  ['kpi-grid','profit-table-container','income-day-container','upcoming-container',
   'expenses-boat-container','crew-container','ar-container','dep-container',
   'alerts-container','ranking-container','comparison-container'].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  });

  try {
    const r = await fetch('/api/executive-dashboard?' + params);
    if (!r.ok) throw new Error('Error ' + r.status);
    currentData = await r.json();
    renderAll(currentData);
    $('last-updated').textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es');
  } catch(err) {
    $('kpi-grid').innerHTML = `<div class="loading" style="grid-column:1/-1;color:#dc2626">Error: ${esc(err.message)}</div>`;
    console.error(err);
  }
}

// ── RENDER ALL ────────────────────────────────────────────────────
function renderAll(d) {
  renderKPIs(d);
  renderProfitTable(d.profitByBoat);
  renderIncomePerDay(d.incomePerDay);
  renderUpcoming(d.upcomingBookings, d.period);
  renderExpensesByBoat(d.expensesByBoat);
  renderCrew(d.profitByBoat);
  renderAR(d.arList);
  renderDeposits(d.pendingDeposits);
  renderAlerts(d.alerts);
  renderRanking(d.profitByBoat);
  renderComparison(d.kpis, d.comparison);
}

// ── KPI GRID ──────────────────────────────────────────────────────
function renderKPIs(d) {
  const k = d.kpis;
  const cmp = d.comparison;
  const kpis = [
    { label:'Ingresos',         value: fmt(k.income,2),           sub: `período`, cls:'green',  change: cmp.incomeChange },
    { label:'Utilidad Neta',    value: fmt(k.netProfit,2),        sub: `ingresos - gastos - crew`, cls: k.netProfit >= 0 ? 'green' : 'red', change: cmp.profitChange },
    { label:'Gastos',           value: fmt(k.expenses,2),         sub: `boat expenses`,    cls:'orange', change: cmp.expensesChange },
    { label:'Crew Cost',        value: fmt(k.crewCost,2),         sub: `capitán + stew`,   cls:'purple' },
    { label:'Bookings',         value: k.totalBookings,           sub: `reservas ledger`,  cls:'blue' },
    { label:'Horas Vendidas',   value: fmtN(k.totalHours,1) + 'h', sub: `prom ${fmtN(k.avgHoursPerBooking,1)}h/booking`, cls:'teal' },
    { label:'Ocupación',        value: fmtPct(k.occupancy),       sub: `bookings / (barcos × días)`, cls:'blue' },
    { label:'AR Pendiente',     value: fmt(k.arPending,2),        sub: `${k.arCount} cuentas`, cls:'orange' },
    { label:'Depósitos Pend.',  value: fmt(k.depositsPending,2),  sub: `${k.depositsCount} sin aplicar`, cls: k.depositsCount > 0 ? 'orange' : 'green' },
  ];
  $('kpi-grid').innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.cls}" data-testid="kpi-${k.label.toLowerCase().replace(/\s+/g,'-')}">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
      ${k.change != null ? changeBadge(k.change) : ''}
    </div>`).join('');
}

// ── PROFIT BY BOAT ────────────────────────────────────────────────
function renderProfitTable(rows) {
  if (!rows || rows.length === 0) {
    $('profit-table-container').innerHTML = '<div class="empty-state">Sin datos de rentabilidad en el período</div>';
    $('profit-table-meta').textContent = '';
    return;
  }

  // Sort
  const sorted = [...rows].sort((a, b) => {
    const av = parseFloat(a[sortField] || 0), bv = parseFloat(b[sortField] || 0);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  $('profit-table-meta').textContent = sorted.length + ' barcos';

  const th = (field, label) => {
    const cls = sortField === field ? (sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    return `<th class="${cls}" onclick="toggleSort('${field}')" data-testid="th-${field}">${label}</th>`;
  };

  $('profit-table-container').innerHTML = `
    <div style="overflow-x:auto">
    <table data-testid="table-profit-by-boat">
      <thead><tr>
        <th>Barco</th>
        ${th('bookings','Bookings')}
        ${th('hours','Horas')}
        ${th('income','Ingresos')}
        ${th('expenses','Gastos')}
        ${th('captain','Capitán')}
        ${th('stew','Stew')}
        ${th('crew','Crew Total')}
        ${th('profit','Utilidad')}
        ${th('margin','Margen')}
      </tr></thead>
      <tbody>
        ${sorted.map(b => `
          <tr data-testid="row-profit-${esc(b.id)}">
            <td class="td-bold">${esc(b.name)}</td>
            <td class="td-right">${b.bookings}</td>
            <td class="td-right">${fmtN(b.hours,1)}h</td>
            <td class="td-right td-mono">${fmt(b.income,2)}</td>
            <td class="td-right td-mono">${fmt(b.expenses,2)}</td>
            <td class="td-right td-mono">${fmt(b.captain,2)}</td>
            <td class="td-right td-mono">${fmt(b.stew,2)}</td>
            <td class="td-right td-mono">${fmt(b.crew,2)}</td>
            <td class="td-right td-mono" style="font-weight:700;color:${b.profit>=0?'#059669':'#dc2626'}">${fmt(b.profit,2)}</td>
            <td class="td-right"><span class="${marginClass(b.margin)}">${fmtPct(b.margin)}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

function toggleSort(field) {
  if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortField = field; sortDir = 'desc'; }
  if (currentData) renderProfitTable(currentData.profitByBoat);
}

// ── INCOME PER DAY ────────────────────────────────────────────────
function renderIncomePerDay(rows) {
  if (!rows || rows.length === 0) {
    $('income-day-container').innerHTML = '<div class="empty-state">Sin ingresos reconocidos en el período</div>';
    $('income-day-meta').textContent = '';
    return;
  }
  const maxIncome = Math.max(...rows.map(r => parseFloat(r.income)));
  $('income-day-meta').textContent = rows.length + ' días';

  $('income-day-container').innerHTML = `
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
    <table>
      <thead><tr><th>Fecha</th><th>Ingresos</th><th style="min-width:100px"></th><th class="td-right">Tx</th></tr></thead>
      <tbody>
        ${rows.map(r => {
          const inc = parseFloat(r.income);
          const pct = maxIncome > 0 ? (inc / maxIncome * 100) : 0;
          return `<tr>
            <td class="td-bold" style="white-space:nowrap">${fmtDate(r.date)}</td>
            <td class="td-mono">${fmt(inc,2)}</td>
            <td><div class="income-bar-cell"><div class="income-bar-bg"><div class="income-bar-fill" style="width:${pct.toFixed(1)}%"></div></div></div></td>
            <td class="td-right" style="color:#9ca3af">${r.tx_count}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
}

// ── UPCOMING BOOKINGS ─────────────────────────────────────────────
function renderUpcoming(rows, period) {
  if (!rows || rows.length === 0) {
    $('upcoming-container').innerHTML = '<div class="empty-state">Sin próximos bookings</div>';
    $('upcoming-meta').textContent = '';
    return;
  }
  $('upcoming-meta').textContent = rows.length + ' próximos';

  $('upcoming-container').innerHTML = `
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
    <table>
      <thead><tr><th>Fecha</th><th>Cliente / Broker</th><th>Barco</th><th class="td-right">Total</th><th>Estado</th></tr></thead>
      <tbody>
        ${rows.map(b => {
          const client = b.customer_name || b.broker_name || b.final_customer_name || '—';
          const boat   = b.boat_name_ref || b.boat_id || '—';
          const bal    = b.total_amount - (b.deposit_amount || 0);
          return `<tr>
            <td style="white-space:nowrap">${fmtDate(b.booking_date)}</td>
            <td class="td-bold">${esc(client)}</td>
            <td>${esc(boat)}</td>
            <td class="td-right td-mono">${fmt(b.total_amount,2)}</td>
            <td>${statusBadge(b.status)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
}

// ── EXPENSES BY BOAT ──────────────────────────────────────────────
const CAT_LABELS = {
  fuel: 'Combustible', maintenance_parts: 'Mantenimiento', labor: 'Mano de Obra',
  cleaning: 'Limpieza', marina_fees: 'Marina', insurance: 'Seguro',
  emergency_repairs: 'Reparaciones', operational: 'Operacional'
};

function renderExpensesByBoat(rows) {
  if (!rows || rows.length === 0) {
    $('expenses-boat-container').innerHTML = '<div class="empty-state">Sin gastos en el período</div>';
    return;
  }
  const sorted = [...rows].sort((a, b) => b.total - a.total);

  $('expenses-boat-container').innerHTML = `
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
    <table>
      <thead><tr><th>Barco</th><th>Categoría Mayor</th><th class="td-right">Total</th></tr></thead>
      <tbody>
        ${sorted.map(b => {
          const topCats = Object.entries(b.categories)
            .sort((x, y) => y[1] - x[1]).slice(0, 2)
            .map(([k, v]) => `<span class="badge badge-gray" style="margin-right:3px">${CAT_LABELS[k]||k} ${fmt(v)}</span>`).join('');
          return `<tr>
            <td class="td-bold">${esc(b.boatName)}</td>
            <td>${topCats || '—'}</td>
            <td class="td-right td-mono" style="font-weight:700;color:#d97706">${fmt(b.total,2)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
}

// ── CREW COST ─────────────────────────────────────────────────────
function renderCrew(rows) {
  if (!rows || rows.length === 0) {
    $('crew-container').innerHTML = '<div class="empty-state">Sin pagos de tripulación en el período</div>';
    return;
  }
  const withCrew = rows.filter(b => b.captain > 0 || b.stew > 0).sort((a, b) => b.crew - a.crew);
  if (!withCrew.length) {
    $('crew-container').innerHTML = '<div class="empty-state">Sin pagos de tripulación en el período</div>';
    return;
  }

  $('crew-container').innerHTML = `
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
    <table>
      <thead><tr><th>Barco</th><th class="td-right">Capitán</th><th class="td-right">Stew</th><th class="td-right">Total Crew</th></tr></thead>
      <tbody>
        ${withCrew.map(b => `<tr>
          <td class="td-bold">${esc(b.name)}</td>
          <td class="td-right td-mono">${fmt(b.captain,2)}</td>
          <td class="td-right td-mono">${fmt(b.stew,2)}</td>
          <td class="td-right td-mono" style="font-weight:700;color:#7c3aed">${fmt(b.crew,2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

// ── ACCOUNTS RECEIVABLE ───────────────────────────────────────────
function renderAR(rows) {
  if (!rows || rows.length === 0) {
    $('ar-container').innerHTML = '<div class="empty-state">Sin cuentas por cobrar pendientes</div>';
    $('ar-meta').textContent = '';
    return;
  }
  const now = new Date();
  $('ar-meta').textContent = rows.length + ' cuentas';

  $('ar-container').innerHTML = `
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
    <table>
      <thead><tr><th>Cliente / Parte</th><th>Barco</th><th class="td-right">Monto</th><th>Vence</th><th>Estado</th></tr></thead>
      <tbody>
        ${rows.map(r => {
          const overdue = r.due_date && new Date(r.due_date) < now;
          const client = r.party_name || r.client_name || '—';
          const boat   = r.boat_name_ref || r.boat_id || '—';
          return `<tr>
            <td class="td-bold">${esc(client)}</td>
            <td>${esc(boat)}</td>
            <td class="td-right td-mono">${fmt(r.amount,2)}</td>
            <td style="${overdue?'color:#dc2626;font-weight:600':''}">${fmtDate(r.due_date)}</td>
            <td>${overdue ? '<span class="badge badge-red">Vencida</span>' : arStatusBadge(r.status)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
}

// ── PENDING DEPOSITS ──────────────────────────────────────────────
function renderDeposits(rows) {
  if (!rows || rows.length === 0) {
    $('dep-container').innerHTML = '<div class="empty-state">Sin depósitos pendientes de aplicar</div>';
    $('dep-meta').textContent = '';
    return;
  }
  $('dep-meta').textContent = rows.length + ' depósitos';

  $('dep-container').innerHTML = `
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
    <table>
      <thead><tr><th>Cliente</th><th>Barco</th><th>Fecha Bkg.</th><th class="td-right">Depósito</th><th class="td-right">Total</th></tr></thead>
      <tbody>
        ${rows.map(r => {
          const boat = r.boat_name_ref || r.boat_id || '—';
          return `<tr>
            <td class="td-bold">${esc(r.client_name)}</td>
            <td>${esc(boat)}</td>
            <td>${fmtDate(r.booking_date)}</td>
            <td class="td-right td-mono">${fmt(r.amount,2)}</td>
            <td class="td-right td-mono">${fmt(r.booking_total_amount,2)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
}

// ── ALERTS ────────────────────────────────────────────────────────
function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    $('alerts-container').innerHTML = '<div class="empty-state" style="padding:24px">Sin alertas activas</div>';
    $('alerts-meta').textContent = '0 alertas';
    return;
  }
  $('alerts-meta').textContent = alerts.length + ' activas';
  const sorted = [...alerts].sort((a, b) => {
    const rank = { alta: 0, media: 1, baja: 2 };
    return (rank[a.priority]||2) - (rank[b.priority]||2);
  });

  $('alerts-container').innerHTML = `
    <div class="alert-list">
      ${sorted.map(a => `
        <div class="alert-item ${a.priority}" data-testid="alert-${a.type}">
          <div class="alert-dot"></div>
          <div>
            <strong style="text-transform:capitalize">${a.priority}</strong>: ${esc(a.msg)}
          </div>
        </div>`).join('')}
    </div>`;
}

// ── RANKING ───────────────────────────────────────────────────────
function renderRanking(rows) {
  if (!rows || rows.length === 0) {
    $('ranking-container').innerHTML = '<div class="empty-state">Sin datos</div>';
    return;
  }
  const sorted = [...rows].sort((a, b) => b.income - a.income).slice(0, 8);

  $('ranking-container').innerHTML = sorted.map((b, i) => `
    <div class="rank-item" data-testid="rank-boat-${i}">
      <div class="rank-num ${i < 3 ? 'top' : ''}">${i + 1}</div>
      <div class="rank-name">${esc(b.name)}</div>
      <div style="text-align:right;flex-shrink:0">
        <div class="rank-val">${fmt(b.income,0)}</div>
        <div style="font-size:11px;color:${b.profit>=0?'#059669':'#dc2626'}">${fmt(b.profit,0)}</div>
      </div>
    </div>`).join('');
}

// ── COMPARISON ────────────────────────────────────────────────────
function renderComparison(k, cmp) {
  const rows = [
    { label:'Ingresos',     cur: fmt(k.income,0),    prev: fmt(cmp.prevIncome,0),   chg: cmp.incomeChange },
    { label:'Gastos',       cur: fmt(k.expenses,0),  prev: fmt(cmp.prevExpenses,0), chg: cmp.expensesChange },
    { label:'Crew',         cur: fmt(k.crewCost,0),  prev: fmt(cmp.prevCrew,0),     chg: null },
    { label:'Utilidad',     cur: fmt(k.netProfit,0), prev: fmt(cmp.prevProfit,0),   chg: cmp.profitChange },
    { label:'Horas',        cur: fmtN(k.totalHours,1)+'h', prev: '—',               chg: null },
    { label:'Ocupación',    cur: fmtPct(k.occupancy), prev: '—',                     chg: null },
  ];

  $('comparison-container').innerHTML = rows.map(r => `
    <div class="comp-row">
      <span class="comp-label">${r.label}</span>
      <div class="comp-values">
        <span class="comp-prev">${r.prev}</span>
        <span class="comp-cur">${r.cur}</span>
        ${r.chg != null ? compBadge(parseFloat(r.cur.replace(/[$,]/g,'')), parseFloat(r.prev.replace(/[$,]/g,''))) : '<span class="comp-badge flat">—</span>'}
      </div>
    </div>`).join('');
}
