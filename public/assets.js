// ═══════════════════════════════════════════════════════════════
//  Nadaki Excursions — Assets / Inventory Module
// ═══════════════════════════════════════════════════════════════

let allAssets = [];
let boats = [];
let currentDetailId = null;

const CATEGORY_LABELS = {
  equipo: 'Equipo', inventario: 'Inventario', accesorio: 'Accesorio', marina: 'Marina'
};
const STATUS_LABELS = {
  activo: 'Activo', en_uso: 'En Uso', mantenimiento: 'Mantenimiento',
  dañado: 'Dañado', fuera_de_servicio: 'Fuera de servicio'
};
const MOV_LABELS = {
  asignado: 'Asignado', movido: 'Movido', dañado: 'Dañado',
  reparado: 'Reparado', ajuste_inventario: 'Ajuste inventario', eliminado: 'Dado de baja'
};

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadBoats();
  await loadAssets();

  // Pre-select boat filter from URL param
  const params = new URLSearchParams(location.search);
  if (params.get('boat_id')) {
    document.getElementById('filter-boat').value = params.get('boat_id');
    await loadAssets();
  }
  // Set today as default purchase date
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
});

// ── BOATS ────────────────────────────────────────────────────────────────
async function loadBoats() {
  try {
    const res = await fetch('/api/fleet/boats');
    boats = await res.json();
    populateBoatSelects();
  } catch (e) { console.error('Error loading boats:', e); }
}

function populateBoatSelects() {
  const opts = boats.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  ['filter-boat', 'f-boat', 'mov-boat'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const placeholder = id === 'filter-boat' ? '<option value="">Todos los barcos</option>'
      : '<option value="">Sin asignar</option>';
    el.innerHTML = placeholder + opts;
  });
}

// ── LOAD ASSETS ───────────────────────────────────────────────────────────
async function loadAssets() {
  try {
    const boat = document.getElementById('filter-boat').value;
    const category = document.getElementById('filter-category').value;
    const status = document.getElementById('filter-status').value;
    const params = new URLSearchParams();
    if (boat) params.set('boat_id', boat);
    if (category) params.set('category', category);
    if (status) params.set('status', status);
    const res = await fetch(`/api/assets?${params}`);
    if (!res.ok) throw new Error('Error loading assets');
    allAssets = await res.json();
    updateKPIs();
    renderTable();
  } catch (e) {
    console.error(e);
    document.getElementById('assets-tbody').innerHTML =
      '<tr><td colspan="8" class="empty-state">Error al cargar activos</td></tr>';
  }
}

// ── KPIs ──────────────────────────────────────────────────────────────────
function updateKPIs() {
  const total = allAssets.length;
  const totalValue = allAssets.reduce((s, a) => s + parseFloat(a.purchase_cost || 0), 0);
  const active = allAssets.filter(a => a.status === 'activo' || a.status === 'en_uso').length;
  const attention = allAssets.filter(a => a.status === 'dañado' || a.status === 'mantenimiento').length;
  document.getElementById('kpi-total').textContent = total;
  document.getElementById('kpi-value').textContent = '$' + totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('kpi-active').textContent = active;
  document.getElementById('kpi-attention').textContent = attention;
}

// ── RENDER TABLE ──────────────────────────────────────────────────────────
function renderTable() {
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  let rows = allAssets;
  if (search) {
    rows = rows.filter(a =>
      (a.name || '').toLowerCase().includes(search) ||
      (a.supplier || '').toLowerCase().includes(search) ||
      (a.description || '').toLowerCase().includes(search) ||
      (a.location || '').toLowerCase().includes(search)
    );
  }
  document.getElementById('table-count').textContent = `${rows.length} activo(s)`;
  const tbody = document.getElementById('assets-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay activos registrados. Usa el botón "Registrar Activo" para comenzar.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(a => `
    <tr>
      <td style="font-weight:500">${escHtml(a.name)}</td>
      <td><span class="badge badge-${a.category}">${CATEGORY_LABELS[a.category] || a.category}</span></td>
      <td>${a.boat_name ? `<span style="color:#0066cc;font-size:13px">${escHtml(a.boat_name)}</span>` : '<span style="color:#9ca3af;font-size:12px">Sin asignar</span>'}</td>
      <td style="text-align:center;font-weight:500">${a.quantity}</td>
      <td style="font-weight:600">$${parseFloat(a.purchase_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td><span class="badge badge-${a.status}">${STATUS_LABELS[a.status] || a.status}</span></td>
      <td style="font-size:13px;color:#6b7280">${a.purchase_date ? fmtDate(a.purchase_date) : '—'}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="openDetail('${a.id}')" data-testid="button-detail-${a.id}">Ver</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${a.id}')" data-testid="button-edit-${a.id}">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteAsset('${a.id}')" data-testid="button-delete-${a.id}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ── CREATE MODAL ──────────────────────────────────────────────────────────
function openCreateModal() {
  document.getElementById('edit-id').value = '';
  document.getElementById('modal-title').textContent = 'Registrar Activo';
  document.getElementById('f-name').value = '';
  document.getElementById('f-category').value = 'equipo';
  document.getElementById('f-cost').value = '';
  document.getElementById('f-payment').value = 'cash';
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('f-supplier').value = '';
  document.getElementById('f-boat').value = '';
  document.getElementById('f-quantity').value = '1';
  document.getElementById('f-location').value = '';
  document.getElementById('f-status').value = 'activo';
  document.getElementById('f-life').value = '';
  document.getElementById('f-residual').value = '0';
  document.getElementById('f-notes').value = '';
  updateAccountingNote();
  document.getElementById('asset-overlay').classList.add('active');
}

function openEditModal(id) {
  const a = allAssets.find(x => x.id === id);
  if (!a) return;
  document.getElementById('edit-id').value = id;
  document.getElementById('modal-title').textContent = 'Editar Activo';
  document.getElementById('f-name').value = a.name || '';
  document.getElementById('f-category').value = a.category || 'equipo';
  document.getElementById('f-cost').value = a.purchase_cost || '';
  document.getElementById('f-payment').value = a.payment_method || 'cash';
  document.getElementById('f-date').value = a.purchase_date ? a.purchase_date.slice(0, 10) : '';
  document.getElementById('f-supplier').value = a.supplier || '';
  document.getElementById('f-boat').value = a.boat_id || '';
  document.getElementById('f-quantity').value = a.quantity || 1;
  document.getElementById('f-location').value = a.location || '';
  document.getElementById('f-status').value = a.status || 'activo';
  document.getElementById('f-life').value = a.useful_life_years || '';
  document.getElementById('f-residual').value = a.residual_value || 0;
  document.getElementById('f-notes').value = a.notes || '';
  updateAccountingNote();
  document.getElementById('asset-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('asset-overlay').classList.remove('active');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('asset-overlay')) closeModal();
}

function updateAccountingNote() {
  const cat = document.getElementById('f-category').value;
  const pay = document.getElementById('f-payment').value;
  const accMap = {
    equipo: '1600 Equipment', inventario: '1630 Inventory Assets',
    accesorio: '1600 Equipment', marina: '1620 Marine Equipment'
  };
  const debit = accMap[cat] || '1600 Equipment';
  const credit = pay === 'credit' ? '2010 Accounts Payable' : '1010 Cash (Banco)';
  document.getElementById('accounting-note').textContent =
    `Asiento contable: Débito ${debit} / Crédito ${credit}`;
}

// ── SAVE ASSET ────────────────────────────────────────────────────────────
async function saveAsset() {
  const id = document.getElementById('edit-id').value;
  const name = document.getElementById('f-name').value.trim();
  const category = document.getElementById('f-category').value;
  if (!name) { alert('El nombre es requerido'); return; }

  const payload = {
    name,
    category,
    description: document.getElementById('f-notes').value.trim(),
    purchase_cost: document.getElementById('f-cost').value,
    purchase_date: document.getElementById('f-date').value || null,
    supplier: document.getElementById('f-supplier').value.trim(),
    boat_id: document.getElementById('f-boat').value || null,
    quantity: document.getElementById('f-quantity').value,
    location: document.getElementById('f-location').value.trim(),
    status: document.getElementById('f-status').value,
    payment_method: document.getElementById('f-payment').value,
    useful_life_years: document.getElementById('f-life').value || null,
    residual_value: document.getElementById('f-residual').value || 0,
    notes: document.getElementById('f-notes').value.trim()
  };

  const btn = document.querySelector('[data-testid="button-save-asset"]');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const url = id ? `/api/assets/${id}` : '/api/assets';
    const method = id ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar');
    }
    closeModal();
    await loadAssets();
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────
async function deleteAsset(id) {
  const a = allAssets.find(x => x.id === id);
  if (!confirm(`¿Eliminar el activo "${a?.name}"?\n\nEsta acción no se puede deshacer.`)) return;
  try {
    const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    await loadAssets();
  } catch (e) { alert('Error: ' + e.message); }
}

// ── DETAIL / MOVEMENTS ────────────────────────────────────────────────────
async function openDetail(id) {
  currentDetailId = id;
  const a = allAssets.find(x => x.id === id);
  if (!a) return;
  document.getElementById('detail-title').textContent = a.name;
  document.getElementById('detail-info').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;background:#f9fafb;border-radius:10px;padding:16px">
      <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Categoría</div><div style="font-weight:500;margin-top:2px"><span class="badge badge-${a.category}">${CATEGORY_LABELS[a.category]}</span></div></div>
      <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Estado</div><div style="font-weight:500;margin-top:2px"><span class="badge badge-${a.status}">${STATUS_LABELS[a.status]}</span></div></div>
      <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Costo</div><div style="font-weight:600;margin-top:2px;color:#059669">$${parseFloat(a.purchase_cost||0).toLocaleString('en-US',{minimumFractionDigits:2})}</div></div>
      <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Cantidad</div><div style="font-weight:500;margin-top:2px">${a.quantity}</div></div>
      <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Barco</div><div style="font-weight:500;margin-top:2px;color:#0066cc">${a.boat_name || '—'}</div></div>
      <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Ubicación</div><div style="font-weight:500;margin-top:2px">${a.location || '—'}</div></div>
      <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Proveedor</div><div style="font-weight:500;margin-top:2px">${a.supplier || '—'}</div></div>
      <div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Fecha Compra</div><div style="font-weight:500;margin-top:2px">${a.purchase_date ? fmtDate(a.purchase_date) : '—'}</div></div>
      ${a.useful_life_years ? `<div><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Vida útil</div><div style="font-weight:500;margin-top:2px">${a.useful_life_years} años</div></div>` : ''}
      ${a.notes ? `<div style="grid-column:1/-1"><div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase">Notas</div><div style="margin-top:2px;color:#374151">${escHtml(a.notes)}</div></div>` : ''}
    </div>
  `;
  // Load movements
  await loadMovements(id);
  document.getElementById('detail-overlay').classList.add('active');
}

async function loadMovements(id) {
  try {
    const res = await fetch(`/api/assets/${id}/movements`);
    const movs = await res.json();
    const el = document.getElementById('movement-list');
    if (!movs.length) {
      el.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px">Sin movimientos registrados</div>';
      return;
    }
    el.innerHTML = movs.map(m => `
      <div class="movement-item">
        <div class="movement-dot"></div>
        <div>
          <div class="movement-text">
            <strong>${MOV_LABELS[m.movement_type] || m.movement_type}</strong>
            ${m.quantity_change && m.quantity_change !== 0 ? ` · Cantidad: ${m.quantity_change > 0 ? '+' : ''}${m.quantity_change}` : ''}
            ${m.to_boat_name ? ` · Barco: ${escHtml(m.to_boat_name)}` : ''}
            ${m.notes ? ` — ${escHtml(m.notes)}` : ''}
          </div>
          <div class="movement-date">${fmtDateTime(m.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('movement-list').innerHTML = '<div style="color:#dc2626;padding:10px">Error al cargar historial</div>';
  }
}

async function logMovement() {
  if (!currentDetailId) return;
  const type = document.getElementById('mov-type').value;
  const boat = document.getElementById('mov-boat').value;
  const qty = parseInt(document.getElementById('mov-qty').value) || 0;
  const notes = document.getElementById('mov-notes').value.trim();
  const btn = document.querySelector('[data-testid="button-log-movement"]');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const res = await fetch(`/api/assets/${currentDetailId}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movement_type: type, to_boat_id: boat || null, quantity_change: qty, notes })
    });
    if (!res.ok) throw new Error('Error al registrar movimiento');
    document.getElementById('mov-notes').value = '';
    document.getElementById('mov-qty').value = '0';
    document.getElementById('mov-boat').value = '';
    await loadMovements(currentDetailId);
    await loadAssets();
  } catch (e) { alert('Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Registrar'; }
}

function closeDetailModal() {
  document.getElementById('detail-overlay').classList.remove('active');
  currentDetailId = null;
}

function handleDetailOverlayClick(e) {
  if (e.target === document.getElementById('detail-overlay')) closeDetailModal();
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('es-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('es-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
