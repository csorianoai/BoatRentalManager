'use strict';
/* =====================================================================
   Gastos / Expenses — Unified Expense Manager
   FASE 19 — Nadaki Excursions
   ===================================================================== */

const API = {
  boats:     '/api/boats',
  expenses:  '/api/expenses',
  summary:   '/api/expenses/summary',
  bookings:  '/api/bookings',
};

const TYPE_LABELS = {
  fuel:        { label: 'Combustible',   color: '#f59e0b', bg: '#FEF3C7' },
  maintenance: { label: 'Mantenimiento', color: '#8b5cf6', bg: '#EDE9FE' },
  crew:        { label: 'Crew / Capitán', color: '#0066cc', bg: '#DBEAFE' },
  recurring:   { label: 'Recurrente',    color: '#10b981', bg: '#D1FAE5' },
  other:       { label: 'Otro',          color: '#6b7280', bg: '#F3F4F6' },
};

const PAYMENT_METHODS = ['cash','card','transfer','check','other'];
const ROLES = ['captain','stew','crew','other'];

let expenses    = [];
let boats       = [];
let summaryData = {};
let filters     = { expense_type: '', boat_id: '', start_date: '', end_date: '', status: '', payment_method: '' };
let editingId   = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadBoats(), loadExpenses(), loadSummary()]);
  setupFilters();
  setupForm();
  renderSummary();
  renderTable();
});

async function apiFetch(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include',
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return r.json();
}

// ── Data loaders ──────────────────────────────────────────────────────────────
async function loadBoats() {
  try {
    const data = await apiFetch(API.boats);
    boats = Array.isArray(data) ? data : (data.boats || []);
    populateBoatSelects();
  } catch (e) { console.error('loadBoats:', e); }
}

async function loadExpenses() {
  try {
    const params = new URLSearchParams();
    if (filters.expense_type)   params.set('expense_type',   filters.expense_type);
    if (filters.boat_id)        params.set('boat_id',        filters.boat_id);
    if (filters.start_date)     params.set('start_date',     filters.start_date);
    if (filters.end_date)       params.set('end_date',       filters.end_date);
    if (filters.status)         params.set('status',         filters.status);
    if (filters.payment_method) params.set('payment_method', filters.payment_method);
    expenses = await apiFetch(`${API.expenses}?${params}`);
    renderTable();
  } catch (e) {
    console.error('loadExpenses:', e);
    showError('No se pudieron cargar los gastos.');
  }
}

async function loadSummary() {
  try {
    summaryData = await apiFetch(API.summary);
    renderSummary();
  } catch (e) { console.error('loadSummary:', e); }
}

// ── Populate selects ──────────────────────────────────────────────────────────
function populateBoatSelects() {
  const selects = document.querySelectorAll('.boat-select');
  selects.forEach(sel => {
    const val = sel.value;
    sel.innerHTML = '<option value="">Todos los barcos</option>';
    boats.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.name;
      sel.appendChild(o);
    });
    sel.value = val;
  });
}

// ── Filters ───────────────────────────────────────────────────────────────────
function setupFilters() {
  document.getElementById('filter-type').addEventListener('change', e => {
    filters.expense_type = e.target.value;
    loadExpenses();
    loadSummary();
  });
  document.getElementById('filter-boat').addEventListener('change', e => {
    filters.boat_id = e.target.value;
    loadExpenses();
    loadSummary();
  });
  document.getElementById('filter-start').addEventListener('change', e => {
    filters.start_date = e.target.value;
    loadExpenses();
  });
  document.getElementById('filter-end').addEventListener('change', e => {
    filters.end_date = e.target.value;
    loadExpenses();
  });
  const filterStatus = document.getElementById('filter-status');
  if (filterStatus) filterStatus.addEventListener('change', e => {
    filters.status = e.target.value;
    loadExpenses();
  });
  const filterPayment = document.getElementById('filter-payment');
  if (filterPayment) filterPayment.addEventListener('change', e => {
    filters.payment_method = e.target.value;
    loadExpenses();
  });
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    filters = { expense_type: '', boat_id: '', start_date: '', end_date: '', status: '', payment_method: '' };
    document.getElementById('filter-type').value  = '';
    document.getElementById('filter-boat').value  = '';
    document.getElementById('filter-start').value = '';
    document.getElementById('filter-end').value   = '';
    if (filterStatus)  filterStatus.value  = '';
    if (filterPayment) filterPayment.value = '';
    loadExpenses();
    loadSummary();
  });
}

// ── Render summary KPI cards ──────────────────────────────────────────────────
function renderSummary() {
  const d = summaryData;
  if (!d || !d.total) return;
  const fmt = v => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('kpi-total').textContent     = fmt(d.total);
  document.getElementById('kpi-fuel').textContent      = fmt(d.fuel);
  document.getElementById('kpi-maintenance').textContent = fmt(d.maintenance);
  document.getElementById('kpi-crew').textContent      = fmt(d.crew);
  document.getElementById('kpi-other').textContent     = fmt(parseFloat(d.recurring||0) + parseFloat(d.other||0));
  document.getElementById('kpi-count').textContent     = d.count || 0;
}

const STATUS_STYLES = {
  pending:  { label: 'Pendiente', bg: '#FEF3C7', color: '#92400E' },
  paid:     { label: 'Pagado',    bg: '#D1FAE5', color: '#065F46' },
  approved: { label: 'Aprobado', bg: '#DBEAFE', color: '#1E40AF' },
  archived: { label: 'Archivado', bg: '#F3F4F6', color: '#6B7280' },
};

// ── Render table ──────────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('expenses-tbody');
  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#999;padding:32px;">Sin gastos registrados. Haz clic en "Nuevo Gasto" para comenzar.</td></tr>`;
    return;
  }
  tbody.innerHTML = expenses.map(e => {
    const t    = TYPE_LABELS[e.expense_type] || TYPE_LABELS.other;
    const st   = STATUS_STYLES[e.status] || STATUS_STYLES.pending;
    const date = formatDate(e.expense_date);
    const amt  = '$' + parseFloat(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const boat = esc(e.boat_name || e.boat_id || '—');
    const desc = esc(e.description || '');
    const badge     = `<span style="background:${t.bg};color:${t.color};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${t.label}</span>`;
    const statusBadge = `<span style="background:${st.bg};color:${st.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${st.label}</span>`;
    const crew  = e.crew_name ? `<div style="font-size:11px;color:#666;">${esc(e.crew_name)} (${e.role || ''})</div>` : '';
    const pm    = e.payment_method ? `<span style="font-size:11px;color:#888;">${esc(e.payment_method)}</span>` : '—';
    return `<tr data-testid="row-expense-${e.id}">
      <td>${date}</td>
      <td>${badge}</td>
      <td>${desc}${crew}</td>
      <td>${boat}</td>
      <td style="font-weight:700;color:#333;">${amt}</td>
      <td>${statusBadge}</td>
      <td>${pm}</td>
      <td>${e.booking_id ? `<code style="font-size:11px;">${esc(e.booking_id)}</code>` : '—'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openEdit('${e.id}')" data-testid="btn-edit-expense-${e.id}" style="margin-right:4px;">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="deleteExpense('${e.id}')" data-testid="btn-delete-expense-${e.id}">Archivar</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Form setup ────────────────────────────────────────────────────────────────
function setupForm() {
  // Dynamic fields based on expense_type
  document.getElementById('form-expense-type').addEventListener('change', e => {
    showDynamicFields(e.target.value);
  });

  document.getElementById('btn-new-expense').addEventListener('click', () => openModal());
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('expense-form').addEventListener('submit', handleSubmit);

  // Close modal on backdrop click
  document.getElementById('expense-modal').addEventListener('click', e => {
    if (e.target.id === 'expense-modal') closeModal();
  });
}

function showDynamicFields(type) {
  document.querySelectorAll('.dynamic-fields').forEach(el => el.style.display = 'none');
  if (type === 'fuel')        document.getElementById('fields-fuel').style.display        = 'block';
  if (type === 'maintenance') document.getElementById('fields-maintenance').style.display = 'block';
  if (type === 'crew')        document.getElementById('fields-crew').style.display        = 'block';

  // role is required for crew
  document.getElementById('form-role').required = (type === 'crew');
}

function openModal(expense = null) {
  editingId = expense ? expense.id : null;
  const form = document.getElementById('expense-form');
  form.reset();

  document.querySelectorAll('.dynamic-fields').forEach(el => el.style.display = 'none');
  document.getElementById('modal-title').textContent = expense ? 'Editar Gasto' : 'Nuevo Gasto';

  if (expense) {
    document.getElementById('form-expense-type').value = expense.expense_type || 'other';
    document.getElementById('form-boat').value          = expense.boat_id || '';
    document.getElementById('form-amount').value        = expense.amount || '';
    document.getElementById('form-date').value          = (expense.expense_date || '').slice(0, 10);
    document.getElementById('form-description').value   = expense.description || '';
    document.getElementById('form-payment-method').value = expense.payment_method || '';
    document.getElementById('form-status').value         = expense.status || 'pending';
    document.getElementById('form-vendor').value        = expense.vendor || '';
    document.getElementById('form-notes').value         = expense.notes || '';
    document.getElementById('form-booking-id').value    = expense.booking_id || '';
    document.getElementById('form-subcategory').value   = expense.subcategory || '';
    // dynamic fields
    document.getElementById('form-crew-name').value     = expense.crew_name || '';
    document.getElementById('form-role').value          = expense.role || '';
    document.getElementById('form-fuel-gallons').value  = expense.fuel_gallons || '';
    document.getElementById('form-fuel-station').value  = expense.fuel_station || '';
    document.getElementById('form-invoice').value       = expense.invoice_number || '';
    showDynamicFields(expense.expense_type || 'other');
  } else {
    // Default date to today
    document.getElementById('form-date').value = new Date().toISOString().slice(0, 10);
  }

  document.getElementById('expense-modal').style.display = 'flex';
  document.getElementById('form-expense-type').focus();
}

function closeModal() {
  document.getElementById('expense-modal').style.display = 'none';
  editingId = null;
  clearFormError();
}

async function handleSubmit(e) {
  e.preventDefault();
  clearFormError();
  const btn = document.getElementById('btn-save-expense');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const payload = {
    expense_type:   document.getElementById('form-expense-type').value,
    boat_id:        document.getElementById('form-boat').value,
    amount:         document.getElementById('form-amount').value,
    expense_date:   document.getElementById('form-date').value,
    description:    document.getElementById('form-description').value,
    payment_method: document.getElementById('form-payment-method').value || undefined,
    vendor:         document.getElementById('form-vendor').value || undefined,
    notes:          document.getElementById('form-notes').value || undefined,
    booking_id:     document.getElementById('form-booking-id').value || undefined,
    subcategory:    document.getElementById('form-subcategory').value || undefined,
    crew_name:      document.getElementById('form-crew-name').value || undefined,
    role:           document.getElementById('form-role').value || undefined,
    fuel_gallons:   document.getElementById('form-fuel-gallons').value || undefined,
    fuel_station:   document.getElementById('form-fuel-station').value || undefined,
    invoice_number: document.getElementById('form-invoice').value || undefined,
  };

  try {
    if (editingId) {
      await apiFetch(`${API.expenses}/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await apiFetch(API.expenses, { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal();
    await Promise.all([loadExpenses(), loadSummary()]);
    showToast(editingId ? 'Gasto actualizado.' : 'Gasto registrado correctamente.');
  } catch (err) {
    showFormError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Gasto';
  }
}

// ── Edit / Delete ─────────────────────────────────────────────────────────────
function openEdit(id) {
  const exp = expenses.find(e => e.id === id);
  if (exp) openModal(exp);
}

async function deleteExpense(id) {
  if (!confirm('¿Archivar este gasto? No se eliminará la data, solo se ocultará.')) return;
  try {
    await apiFetch(`${API.expenses}/${id}`, { method: 'DELETE' });
    await Promise.all([loadExpenses(), loadSummary()]);
    showToast('Gasto archivado.');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const safe = (typeof dateStr === 'string' && dateStr.length === 10) ? dateStr + 'T12:00:00' : dateStr;
  return new Date(safe).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.style.opacity = '1';
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => { t.style.display = 'none'; }, 400);
  }, 3000);
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function clearFormError() {
  const el = document.getElementById('form-error');
  el.textContent = '';
  el.style.display = 'none';
}

function showError(msg) {
  const tbody = document.getElementById('expenses-tbody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#dc3545;padding:24px;">${esc(msg)}</td></tr>`;
}
