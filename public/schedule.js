// Schedule Manager — Nadaki Excursions
// ─── State ───────────────────────────────────────────
let captains = [];
let boats = [];
let stews = [];
let brokers = [];
let bookings = [];
let availability = [];
let currentBookingId = null;
let currentAvailabilityId = null;
let weekStart = null; // Monday of current week view

// ─── Auth Fetch ───────────────────────────────────────
async function authFetch(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (res.status === 401) { window.location.href = '/api/login'; throw new Error('Unauthorized'); }
    return res;
  } catch (e) {
    if (e.message === 'Unauthorized') throw e;
    throw e;
  }
}

// ─── Toast ────────────────────────────────────────────
function showToast(msg, isError) {
  const t = document.getElementById('sched-toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' toast-error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3200);
}

// ─── Helpers ──────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(d) { return d.toISOString().split('T')[0]; }
function fmtMoney(v) { return '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function addHours(timeStr, hours) {
  if (!timeStr || !hours) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + (m || 0) + hours * 60;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

// ─── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Support ?date=YYYY-MM-DD from dashboard deep links
  const urlDate = new URLSearchParams(window.location.search).get('date');
  if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
    // Navigate the calendar to the week containing this date
    const d = new Date(urlDate + 'T12:00:00');
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    document.getElementById('date-from').value = fmtDate(monday);
    document.getElementById('date-to').value   = fmtDate(sunday);
  } else {
    setDefaultDates();
  }
  initWeekStart();
  await loadCatalogs();
  await loadScheduleData();
  setupEventListeners();
  renderWeekView();
  // CAL2 Fase 1: inicializar shell después de que los datos legacy estén listos
  NadakiCalendar.init();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
});

function setDefaultDates() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  document.getElementById('date-from').value = fmtDate(monday);
  document.getElementById('date-to').value = fmtDate(sunday);
}

function initWeekStart() {
  const dfrom = document.getElementById('date-from').value;
  weekStart = dfrom ? new Date(dfrom + 'T12:00:00') : new Date();
  // Snap to Monday
  const d = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - ((d + 6) % 7));
}

// ─── Load catalogs ────────────────────────────────────
async function loadCatalogs() {
  try {
    const [capRes, boatRes, stewRes, brokerRes] = await Promise.all([
      authFetch('/api/captains').then(r => r.json()).catch(() => []),
      authFetch('/api/fleet/boats').then(r => r.json()).catch(() => []),
      authFetch('/api/stews?status=all').then(r => r.json()).catch(() => []),
      authFetch('/api/brokers').then(r => r.json()).catch(() => []),
    ]);
    captains = Array.isArray(capRes) ? capRes : [];
    boats = Array.isArray(boatRes) ? boatRes : [];
    stews = Array.isArray(stewRes) ? stewRes : [];
    brokers = Array.isArray(brokerRes) ? brokerRes : [];
    populateSelects();
  } catch(e) { console.error('Catalog load error:', e); }
}

function populateSelects() {
  // Captain selects
  ['captain-select', 'check-captain', 'modal-captain', 'bk-captain'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    const isFilter = id === 'captain-select';
    el.innerHTML = isFilter ? '<option value="">Todos</option>' : '<option value="">Sin asignar</option>';
    captains.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name + (c.status === 'inactive' ? ' (inactivo)' : '');
      el.appendChild(o);
    });
    if (val) el.value = val;
  });

  // Stew select
  const stewEl = document.getElementById('bk-stew');
  if (stewEl) {
    stewEl.innerHTML = '<option value="">Sin asignar</option>';
    stews.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name + (s.status === 'inactive' ? ' (inactivo)' : '');
      stewEl.appendChild(o);
    });
  }

  // Broker select
  populateBrokerSelect();

  // Boat select
  const boatEl = document.getElementById('bk-boat');
  if (boatEl) {
    boatEl.innerHTML = '<option value="">Seleccionar barco...</option>';
    boats.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id;
      o.dataset.name = b.name;
      o.textContent = b.name + (b.length ? ` (${b.length}ft)` : '');
      boatEl.appendChild(o);
    });
    // Fallback static boats if fleet is empty
    if (boats.length === 0) {
      ['50FT Sea Ray Sundancer','50FT Cranchi','50FT Viking Princess','40FT SeaRay Express'].forEach(name => {
        const o = document.createElement('option');
        o.value = name;
        o.dataset.name = name;
        o.textContent = name;
        boatEl.appendChild(o);
      });
    }
  }
}

function populateBrokerSelect() {
  const el = document.getElementById('bk-broker');
  if (!el) return;
  const val = el.value;
  el.innerHTML = '<option value="">Directo / Sin broker</option>';
  brokers.forEach(b => {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = b.name + (!b.active ? ' (inactivo)' : '');
    el.appendChild(o);
  });
  el.innerHTML += '<option value="__new__">+ Crear nuevo broker...</option>';
  if (val && val !== '__new__') el.value = val;
}

// ─── Load schedule data ───────────────────────────────
async function loadScheduleData() {
  await Promise.all([loadBookings(), loadAvailability()]);
  renderBookingsTable();
  renderAvailabilityTable();
}

async function loadBookings() {
  try {
    const df = document.getElementById('date-from').value;
    const dt = document.getElementById('date-to').value;
    const cap = document.getElementById('captain-select').value;
    const params = new URLSearchParams();
    if (df) params.set('dateFrom', df);
    if (dt) params.set('dateTo', dt);
    if (cap) params.set('captain', cap);
    const res = await authFetch('/api/bookings?' + params.toString());
    const data = await res.json();
    bookings = Array.isArray(data) ? data.filter(b => b.status !== 'cancelled') : [];
  } catch(e) { bookings = []; }
}

async function loadAvailability() {
  try {
    const df = document.getElementById('date-from').value;
    const dt = document.getElementById('date-to').value;
    const cap = document.getElementById('captain-select').value;
    const params = new URLSearchParams();
    if (cap) params.set('captainId', cap);
    if (df) params.set('startDate', df);
    if (dt) params.set('endDate', dt);
    const res = await authFetch('/api/availability?' + params.toString());
    availability = await res.json();
  } catch(e) { availability = []; }
}

// ─── Week View ────────────────────────────────────────
function renderWeekView() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }

  // Label
  const label = days[0].toLocaleDateString('es-ES', { day:'numeric', month:'short' })
    + ' – ' + days[6].toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' });
  document.getElementById('week-label').textContent = label;

  const today = fmtDate(new Date());

  // Header
  const thead = document.getElementById('week-thead');
  thead.innerHTML = '<tr><th class="time-col">Hora</th>' +
    days.map(d => {
      const ds = fmtDate(d);
      const isToday = ds === today;
      const dow = d.toLocaleDateString('es-ES', { weekday:'short' });
      const dayN = d.getDate();
      return `<th class="${isToday ? 'today-col' : ''}">${dow} ${dayN}</th>`;
    }).join('') + '</tr>';

  // Body
  const tbody = document.getElementById('week-tbody');
  tbody.innerHTML = '';
  const hours = [7,8,9,10,11,12,13,14,15,16,17,18,19];
  hours.forEach(hour => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="time-col">${String(hour).padStart(2,'0')}:00</td>`;
    days.forEach(day => {
      const ds = fmtDate(day);
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      const isToday = ds === today;
      const td = document.createElement('td');
      td.className = 'day-cell' + (isWeekend ? ' weekend-col' : '') + (isToday ? ' today-col' : '');
      td.title = `Crear reserva para ${ds} ${String(hour).padStart(2,'0')}:00`;
      td.addEventListener('click', (e) => {
        if (e.target.classList.contains('booking-chip')) return;
        openBookingModal(ds, String(hour).padStart(2,'0') + ':00');
      });

      let html = '';

      // Availability blocks
      availability.filter(a => a.date === ds && a.is_available === 0).forEach(avail => {
        html += `<span class="unavailable-chip" title="${esc(avail.reason||'Bloqueado')}">&#128683; ${esc(avail.reason||'Bloqueado')}</span>`;
      });

      // Bookings overlapping this hour
      bookings.filter(b => b.booking_date === ds).forEach(b => {
        const startH = parseInt((b.start_time || '0').split(':')[0]);
        const dur = b.duration_hours || 4;
        if (startH <= hour && hour < startH + dur) {
          const boatLabel = b.boat_type || b.boat_id || 'Barco';
          const capLabel = b.assigned_captain_name || '';
          const isManual = b.is_manual ? ' manual-chip' : '';
          const stClass = `status-${b.status || 'confirmed'}`;
          html += `<span class="booking-chip ${stClass}${isManual}" 
            title="${esc(b.customer_name)} | ${esc(boatLabel)} | ${esc(capLabel)}"
            onclick="event.stopPropagation(); openEditBooking('${esc(b.id)}')"
            data-testid="chip-booking-${esc(b.id)}"
          >${esc(b.customer_name ? b.customer_name.split(' ')[0] : '?')} · ${esc(boatLabel.split(' ').slice(0,2).join(' '))}</span>`;
        }
      });

      td.innerHTML = html;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// ─── Bookings Table ───────────────────────────────────
function renderBookingsTable() {
  const tbody = document.getElementById('bookings-table-body');
  document.getElementById('bookings-count').textContent = bookings.length;

  if (bookings.length === 0) {
    tbody.innerHTML = '<tr class="loading-row"><td colspan="11">No hay reservas en este período.</td></tr>';
    return;
  }

  tbody.innerHTML = bookings.map(b => {
    const boatLabel = b.boat_type || b.boat_id || '—';
    const capLabel = b.assigned_captain_name || '—';
    const stewLabel = b.stew_name || '—';
    const brokerLabel = b.broker_name || b.platform || '—';
    const manualBadge = b.is_manual ? '<span class="badge-manual">Manual</span>' : '';
    return `<tr data-testid="row-booking-${esc(b.id)}">
      <td>${esc(b.booking_date)}</td>
      <td>${esc(b.start_time||'—')}</td>
      <td>${esc(String(b.duration_hours||'?'))}h</td>
      <td>${esc(b.customer_name)}${manualBadge}</td>
      <td>${esc(boatLabel)}</td>
      <td>${esc(capLabel)}</td>
      <td>${esc(stewLabel)}</td>
      <td>${esc(brokerLabel)}</td>
      <td>${fmtMoney(b.total_amount)}</td>
      <td><span class="status-badge status-${esc(b.status||'confirmed')}">${esc(b.status||'confirmed')}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn-sm btn-edit" onclick="openEditBooking('${esc(b.id)}')" data-testid="button-edit-${esc(b.id)}">Editar</button>
          <button class="btn-sm btn-del" onclick="deleteBooking('${esc(b.id)}','${esc(b.customer_name)}')" data-testid="button-delete-${esc(b.id)}">Cancelar</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── Availability Table ───────────────────────────────
function renderAvailabilityTable() {
  const tbody = document.getElementById('availability-table-body');
  document.getElementById('availability-count').textContent = availability.length;

  if (availability.length === 0) {
    tbody.innerHTML = '<tr class="loading-row"><td colspan="6">No hay bloques de disponibilidad.</td></tr>';
    return;
  }

  tbody.innerHTML = availability.map(a => {
    const cap = captains.find(c => c.id === a.captain_id);
    const capName = cap ? cap.name : (a.captain_id || '—');
    return `<tr data-testid="row-avail-${esc(a.id)}">
      <td>${esc(capName)}</td>
      <td>${esc(a.date)}</td>
      <td>${esc(a.start_time||'—')} – ${esc(a.end_time||'—')}</td>
      <td><span class="status-badge ${a.is_available===1?'status-confirmed':'status-cancelled'}">${a.is_available===1?'Sí':'No'}</span></td>
      <td>${esc(a.reason||'—')}</td>
      <td><button class="btn-sm btn-del" onclick="deleteAvailability('${esc(a.id)}')" data-testid="button-del-avail-${esc(a.id)}">Eliminar</button></td>
    </tr>`;
  }).join('');
}

// ─── Booking Modal ────────────────────────────────────
function openBookingModal(prefillDate, prefillTime) {
  currentBookingId = null;
  document.getElementById('booking-modal-title').textContent = 'Nueva Reserva Manual';
  document.getElementById('booking-form').reset();
  document.getElementById('bk-status').value = 'confirmed';
  document.getElementById('bk-platform').value = 'Manual';
  document.getElementById('end-time-display').textContent = '';
  document.getElementById('booking-conflict-warning').classList.remove('show');
  document.getElementById('broker-new-row').style.display = 'none';

  if (prefillDate) document.getElementById('bk-date').value = prefillDate;
  if (prefillTime) document.getElementById('bk-start-time').value = prefillTime;

  populateSelects();
  document.getElementById('booking-modal').classList.add('show');
  setTimeout(() => document.getElementById('bk-date').focus(), 100);
}

function openEditBooking(id) {
  const b = bookings.find(x => x.id === id);
  if (!b) { showToast('Reserva no encontrada', true); return; }

  currentBookingId = id;
  document.getElementById('booking-modal-title').textContent = 'Editar Reserva';
  document.getElementById('broker-new-row').style.display = 'none';
  document.getElementById('booking-conflict-warning').classList.remove('show');

  populateSelects();

  document.getElementById('bk-date').value = b.booking_date || '';
  document.getElementById('bk-start-time').value = b.start_time || '';
  document.getElementById('bk-duration').value = b.duration_hours || '';
  document.getElementById('bk-customer-name').value = b.customer_name || '';
  document.getElementById('bk-customer-phone').value = b.customer_phone || '';
  document.getElementById('bk-customer-email').value = b.customer_email || '';
  document.getElementById('bk-pickup').value = b.pickup_location || '';
  document.getElementById('bk-guests').value = b.num_guests || '';
  document.getElementById('bk-price').value = b.total_amount || '';
  document.getElementById('bk-deposit').value = b.deposit_amount || '';
  document.getElementById('bk-balance').value = b.balance_pending || '';
  document.getElementById('bk-status').value = b.status || 'confirmed';
  document.getElementById('bk-platform').value = b.platform || 'Manual';
  document.getElementById('bk-notes').value = b.notes || '';
  document.getElementById('bk-internal-notes').value = b.internal_notes || '';
  document.getElementById('bk-captain').value = b.assigned_captain_id || '';
  document.getElementById('bk-stew').value = b.stew_id || '';
  document.getElementById('bk-broker').value = b.broker_id || '';

  // Boat
  const boatEl = document.getElementById('bk-boat');
  if (b.boat_id) boatEl.value = b.boat_id;
  else if (b.boat_type) {
    // Try to match by name
    const opt = [...boatEl.options].find(o => o.dataset.name === b.boat_type || o.value === b.boat_type);
    if (opt) boatEl.value = opt.value;
  }

  updateEndTime();
  document.getElementById('booking-modal').classList.add('show');
}

function closeBookingModal() {
  document.getElementById('booking-modal').classList.remove('show');
  currentBookingId = null;
}

// ─── Booking Form Submit ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveBooking();
  });
});

async function saveBooking() {
  const btn = document.getElementById('btn-save-booking');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const boatEl = document.getElementById('bk-boat');
    const boatId = boatEl.value;
    const boatType = boatEl.options[boatEl.selectedIndex]?.dataset?.name || boatEl.value || '';

    const capEl = document.getElementById('bk-captain');
    const capId = capEl.value;
    const capName = capId ? (captains.find(c=>c.id===capId)?.name || '') : '';

    const stewEl = document.getElementById('bk-stew');
    const stewId = stewEl.value;
    const stewName = stewId ? (stews.find(s=>s.id===stewId)?.name || '') : '';

    const brokerEl = document.getElementById('bk-broker');
    const brokerId = (brokerEl.value && brokerEl.value !== '__new__') ? brokerEl.value : '';
    const brokerName = brokerId ? (brokers.find(b=>b.id===brokerId)?.name || '') : '';

    const payload = {
      booking_date: document.getElementById('bk-date').value,
      start_time: document.getElementById('bk-start-time').value,
      duration_hours: parseInt(document.getElementById('bk-duration').value),
      customer_name: document.getElementById('bk-customer-name').value.trim(),
      customer_phone: document.getElementById('bk-customer-phone').value.trim(),
      customer_email: document.getElementById('bk-customer-email').value.trim(),
      boat_id: boatId || null,
      boat_type: boatType,
      assigned_captain_id: capId || null,
      assigned_captain_name: capName,
      stew_id: stewId || null,
      stew_name: stewName,
      broker_id: brokerId || null,
      broker_name: brokerName,
      platform: document.getElementById('bk-platform').value,
      total_amount: parseFloat(document.getElementById('bk-price').value),
      deposit_amount: parseFloat(document.getElementById('bk-deposit').value || 0),
      balance_pending: parseFloat(document.getElementById('bk-balance').value || 0),
      status: document.getElementById('bk-status').value,
      pickup_location: document.getElementById('bk-pickup').value.trim() || null,
      num_guests: parseInt(document.getElementById('bk-guests').value || 0),
      notes: document.getElementById('bk-notes').value.trim() || null,
      internal_notes: document.getElementById('bk-internal-notes').value.trim() || null,
    };

    const method = currentBookingId ? 'PATCH' : 'POST';
    const url = currentBookingId ? `/api/bookings/${currentBookingId}` : '/api/bookings';

    const res = await authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Error al guardar');
    }

    closeBookingModal();
    await loadScheduleData();
    renderWeekView();
    showToast(currentBookingId ? 'Reserva actualizada.' : 'Reserva creada correctamente.');
  } catch(err) {
    showToast(err.message || 'Error al guardar', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Reserva';
  }
}

// ─── Delete Booking ───────────────────────────────────
async function deleteBooking(id, name) {
  if (!confirm(`¿Cancelar/eliminar la reserva de "${name}"?`)) return;
  try {
    const res = await authFetch(`/api/bookings/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error||'Error'); }
    await loadScheduleData();
    renderWeekView();
    showToast('Reserva eliminada.');
  } catch(e) { showToast(e.message, true); }
}

// ─── End time calculator ──────────────────────────────
function updateEndTime() {
  const time = document.getElementById('bk-start-time').value;
  const dur = parseInt(document.getElementById('bk-duration').value);
  const display = document.getElementById('end-time-display');
  if (time && dur) {
    const end = addHours(time, dur);
    display.textContent = `Hora de finalización: ${end}`;
  } else {
    display.textContent = '';
  }
}

// ─── Captain change ───────────────────────────────────
function onCaptainChange() {
  // Could pre-check conflict here in the future
}

// ─── Broker inline create ─────────────────────────────
function onBrokerChange() {
  const val = document.getElementById('bk-broker').value;
  document.getElementById('broker-new-row').style.display = val === '__new__' ? 'flex' : 'none';
}

async function createBrokerInline() {
  const name = document.getElementById('broker-new-name').value.trim();
  if (!name) { showToast('Escribe el nombre del broker', true); return; }
  try {
    const res = await authFetch('/api/brokers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error||'Error'); }
    const newBroker = await res.json();
    brokers.push(newBroker);
    populateBrokerSelect();
    document.getElementById('bk-broker').value = newBroker.id;
    document.getElementById('broker-new-row').style.display = 'none';
    document.getElementById('broker-new-name').value = '';
    showToast(`Broker "${name}" creado.`);
  } catch(e) { showToast(e.message, true); }
}

// ─── Availability Modal ───────────────────────────────
function openAvailabilityModal() {
  currentAvailabilityId = null;
  document.getElementById('avail-modal-title').textContent = 'Bloquear Disponibilidad';
  document.getElementById('availability-form').reset();
  document.getElementById('availability-modal').classList.add('show');
}

function closeAvailabilityModal() {
  document.getElementById('availability-modal').classList.remove('show');
}

async function saveAvailability() {
  try {
    const captainId = document.getElementById('modal-captain').value;
    const date = document.getElementById('modal-date').value;
    const reason = document.getElementById('modal-reason').value;
    if (!captainId || !date) { showToast('Capitán y fecha son obligatorios', true); return; }
    const res = await authFetch('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captainId, date, startTime: '00:00', endTime: '23:59', isAvailable: 0, reason }),
    });
    if (!res.ok) throw new Error('Error al guardar');
    closeAvailabilityModal();
    await loadScheduleData();
    renderWeekView();
    showToast('Bloqueo de disponibilidad guardado.');
  } catch(e) { showToast(e.message, true); }
}

async function deleteAvailability(id) {
  if (!confirm('¿Eliminar este bloque de disponibilidad?')) return;
  try {
    const res = await authFetch(`/api/availability/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    await loadScheduleData();
    renderWeekView();
    showToast('Bloque eliminado.');
  } catch(e) { showToast(e.message, true); }
}

// ─── Conflict Checker ─────────────────────────────────
async function checkConflict() {
  try {
    const captainId = document.getElementById('check-captain').value;
    const date = document.getElementById('check-date').value;
    const time = document.getElementById('check-time').value;
    const duration = parseInt(document.getElementById('check-duration').value);
    if (!captainId || !date || !time) { showToast('Completa todos los campos', true); return; }
    const res = await authFetch('/api/availability/check-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captainId, date, startTime: time, durationHours: duration }),
    });
    const result = await res.json();
    const div = document.getElementById('conflict-result');
    if (result.hasConflict) {
      let msg = '⚠️ HAY CONFLICTO: ';
      if (result.reason === 'unavailable') msg += `Capitán no disponible. Razón: ${result.details?.reason || 'Día bloqueado'}`;
      else if (result.reason === 'booking_conflict') msg += `Ya tiene reserva a esa hora (${result.conflictingBooking?.customer_name || ''})`;
      div.className = 'conflict-result show has-conflict';
      div.textContent = msg;
    } else {
      div.className = 'conflict-result show no-conflict';
      div.textContent = '✅ Sin conflictos: el capitán está disponible para esa fecha y hora.';
    }
  } catch(e) { showToast('Error al verificar conflicto', true); }
}

// ─── Week navigation ──────────────────────────────────
function weekNav(dir) {
  weekStart = new Date(weekStart);
  weekStart.setDate(weekStart.getDate() + dir * 7);
  const df = new Date(weekStart);
  const dt = new Date(weekStart);
  dt.setDate(weekStart.getDate() + 6);
  document.getElementById('date-from').value = fmtDate(df);
  document.getElementById('date-to').value = fmtDate(dt);
  loadScheduleData().then(renderWeekView);
}

// ─── Event Listeners ──────────────────────────────────
function setupEventListeners() {
  // Week nav
  document.getElementById('btn-week-prev').addEventListener('click', () => weekNav(-1));
  document.getElementById('btn-week-next').addEventListener('click', () => weekNav(1));

  // Filters
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    initWeekStart();
    await loadScheduleData();
    renderWeekView();
  });
  document.getElementById('date-from').addEventListener('change', e => {
    weekStart = e.target.value ? new Date(e.target.value + 'T12:00:00') : new Date();
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
    });
  });

  // Booking modal
  document.getElementById('btn-nueva-reserva').addEventListener('click', () => openBookingModal());
  document.getElementById('btn-close-booking').addEventListener('click', closeBookingModal);
  document.getElementById('btn-cancel-booking').addEventListener('click', closeBookingModal);
  document.getElementById('booking-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeBookingModal(); });

  // Availability modal
  document.getElementById('btn-add-block').addEventListener('click', openAvailabilityModal);
  document.getElementById('btn-close-avail').addEventListener('click', closeAvailabilityModal);
  document.getElementById('btn-cancel-avail').addEventListener('click', closeAvailabilityModal);
  document.getElementById('availability-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeAvailabilityModal(); });
  document.getElementById('availability-form').addEventListener('submit', e => { e.preventDefault(); saveAvailability(); });

  // Conflict checker
  document.getElementById('btn-check-conflict').addEventListener('click', checkConflict);

  // Keyboard Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeBookingModal(); closeAvailabilityModal(); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// NADAKI CALENDAR 2.0 — Namespace Global
// Fase 2: Grid Engine — BookingCard · Week · Day · Timeline · Month
// Rollback: NadakiCalendar.restoreLegacy() desde consola
// ═══════════════════════════════════════════════════════════════════
window.NadakiCalendar = (function () {
  'use strict';

  // ── Internal state ────────────────────────────────────────────
  let _view              = 'week';
  let _initiated         = false;
  let _dayDate           = null;       // active date for DayView
  let _origRenderWeek    = null;       // reference to legacy renderWeekView

  // ── Constants ─────────────────────────────────────────────────
  const H_START = 7, H_END = 20;
  const HOURS   = Array.from({ length: H_END - H_START }, (_, i) => H_START + i);
  const SLOT_H  = 54; // px per hour slot
  const STATUS_COL = {
    confirmed:   { bg:'#dcfce7', bd:'#16a34a', tx:'#15803d', dot:'#16a34a' },
    pending:     { bg:'#fef9c3', bd:'#ca8a04', tx:'#92400e', dot:'#ca8a04' },
    in_progress: { bg:'#dbeafe', bd:'#1d4ed8', tx:'#1e40af', dot:'#1d4ed8' },
    completed:   { bg:'#f3f4f6', bd:'#9ca3af', tx:'#4b5563', dot:'#9ca3af' },
    cancelled:   { bg:'#fee2e2', bd:'#ef4444', tx:'#b91c1c', dot:'#ef4444' },
  };

  // ── Helpers ────────────────────────────────────────────────────
  function _hm(t) {
    const [h, m] = (t || '07:00').split(':').map(Number);
    return { h: h || 0, m: m || 0 };
  }
  function _getDays() {
    const df = document.getElementById('date-from')?.value;
    const dt = document.getElementById('date-to')?.value;
    if (!df || !dt) return [];
    const out = [], cur = new Date(df + 'T12:00:00'), end = new Date(dt + 'T12:00:00');
    while (cur <= end) { out.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return out;
  }
  function _activeDay() {
    if (_dayDate) return _dayDate;
    const today = fmtDate(new Date());
    const days  = _getDays();
    return days.find(d => fmtDate(d) === today) ? today
      : (document.getElementById('date-from')?.value || today);
  }

  // ── Conflict detection (count-only, used internally) ──────────
  function _detectConflicts(bks) { return _buildConflicts(bks).filter(c=>c.type!=='no_captain').length; }

  // ── Fase 3A: conflict helpers ──────────────────────────────────
  function _tRange(b) {
    const {h:sH,m:sM} = _hm(b.start_time);
    const dur = b.duration_hours||4;
    return `${String(sH).padStart(2,'0')}:${String(sM).padStart(2,'0')} – ${String(sH+dur).padStart(2,'0')}:${String(sM).padStart(2,'0')}`;
  }

  // Returns full conflict objects (3 types)
  function _buildConflicts(bks) {
    const out  = [];
    const SKIP = ['cancelled','completed'];

    // Types 1 & 2: pairwise overlap checks
    for (let i = 0; i < bks.length; i++) {
      for (let j = i+1; j < bks.length; j++) {
        const a = bks[i], b = bks[j];
        if (a.booking_date !== b.booking_date) continue;
        if (SKIP.includes(a.status) || SKIP.includes(b.status)) continue;
        // Time overlap?
        const {h:aH,m:aM} = _hm(a.start_time), {h:bH,m:bM} = _hm(b.start_time);
        const aS=aH*60+aM, bS=bH*60+bM;
        const aE=aS+(a.duration_hours||4)*60, bE=bS+(b.duration_hours||4)*60;
        if (!(aS<bE && bS<aE)) continue;

        // Type 1: same boat, overlapping
        const sameBoat = (a.boat_id && a.boat_id===b.boat_id) ||
          (!a.boat_id && !b.boat_id && a.boat_type && a.boat_type===b.boat_type);
        if (sameBoat) {
          const boatN = a.boat_type||a.boat_id||'—';
          out.push({
            id:`bo_${a.id}_${b.id}`, type:'boat_overlap', severity:'high',
            label:'Solapamiento de barco',
            boat: boatN,
            date: a.booking_date,
            timeRange: _tRange(a),
            desc:`"${boatN}" asignado a 2 reservas simultáneas (${a.customer_name||a.id} y ${b.customer_name||b.id})`,
            action:'Reasignar barco o modificar horario de una de las reservas',
            bookingIds:[a.id, b.id],
          });
        }

        // Type 2: same captain, different boat, overlapping
        const sameCap = !!(a.assigned_captain_id && a.assigned_captain_id===b.assigned_captain_id);
        if (sameCap && !sameBoat) {
          const capN = a.assigned_captain_name||a.assigned_captain_id||'—';
          out.push({
            id:`cd_${a.id}_${b.id}`, type:'captain_dup', severity:'high',
            label:'Capitán duplicado',
            boat:`${a.boat_type||a.boat_id||'—'} / ${b.boat_type||b.boat_id||'—'}`,
            date: a.booking_date,
            timeRange: _tRange(a),
            desc:`Cap. "${capN}" asignado simultáneamente a 2 servicios`,
            action:'Reasignar uno de los servicios a otro capitán disponible',
            bookingIds:[a.id, b.id],
          });
        }
      }
    }

    // Type 3: no captain assigned (active bookings only)
    bks.forEach(b => {
      if (SKIP.includes(b.status)) return;
      if (!b.assigned_captain_id) {
        out.push({
          id:`nc_${b.id}`, type:'no_captain', severity:'medium',
          label:'Sin capitán asignado',
          boat: b.boat_type||b.boat_id||'—',
          date: b.booking_date,
          timeRange: _tRange(b),
          desc:`"${b.customer_name||b.id}" (${b.booking_date}) sin capitán asignado`,
          action:'Asignar un capitán disponible para este servicio',
          bookingIds:[b.id],
        });
      }
    });

    return out;
  }

  // Render/update the ConflictPanel
  function _renderConflictPanel() {
    const panel    = document.getElementById('cal2-conflict-panel');
    const body     = document.getElementById('cal2-cp-body');
    const titleEl  = document.getElementById('cal2-cp-title');
    const iconEl   = document.getElementById('cal2-cp-icon');
    const headEl   = document.getElementById('cal2-cp-head');
    const kpiEl    = document.getElementById('cal2-kpi-conflicts');
    const kpiCard  = document.querySelector('[data-testid="kpi-conflicts"]');
    if (!panel || !body) return;

    const conflicts = _buildConflicts(bookings);
    const n         = conflicts.length;
    const highN     = conflicts.filter(c=>c.severity==='high').length;

    // Update KPI counter
    if (kpiEl) kpiEl.textContent = n;
    if (kpiCard) kpiCard.classList.toggle('has-conflicts', highN > 0);

    // Show panel
    panel.style.display = 'block';

    // Head: color + text + icon by status
    if (n === 0) {
      if (titleEl) titleEl.textContent = 'Sin conflictos detectados en el período';
      if (iconEl)  iconEl.textContent  = '✓';
      if (headEl)  headEl.style.color  = '#16a34a';
    } else {
      if (titleEl) titleEl.textContent = `${n} conflicto${n!==1?'s':''} detectado${n!==1?'s':''} — ${highN} de alta severidad`;
      if (iconEl)  iconEl.innerHTML    = '&#9888;';
      if (headEl)  headEl.style.color  = highN > 0 ? '#dc2626' : '#d97706';
    }

    // Build body items
    const SEV_LBL  = {high:'ALTO', medium:'MEDIO', low:'BAJO'};
    const TYPE_ICO = {boat_overlap:'&#9875;', captain_dup:'&#128100;', no_captain:'&#9888;'};

    if (n === 0) {
      body.innerHTML = `<div class="cal2-cp-ok">&#10003;&ensp;No se detectaron solapamientos ni reservas sin capitán en el período actual.</div>`;
      return;
    }
    body.innerHTML = `<div class="cal2-cp-body-inner">
      ${conflicts.map(c => {
        const firstId = c.bookingIds[0];
        return `<div class="cal2-ci cal2-ci-${c.severity}" data-testid="ci-${esc(c.id)}">
          <div class="cal2-ci-meta">
            <div class="cal2-ci-label">
              <span class="cal2-ci-sev">${SEV_LBL[c.severity]||c.severity}</span>
              ${TYPE_ICO[c.type]||''} ${esc(c.label)}
            </div>
            <div class="cal2-ci-detail">${esc(c.boat)} &middot; ${esc(c.date)} &middot; ${esc(c.timeRange)}</div>
            <div class="cal2-ci-detail">${esc(c.desc)}</div>
            <div class="cal2-ci-action">&#8594; ${esc(c.action)}</div>
          </div>
          <button class="cal2-ci-resolve"
            onclick="openEditBooking('${esc(firstId)}')"
            data-testid="btn-resolve-${esc(c.id)}">
            Resolver
          </button>
        </div>`;
      }).join('')}
    </div>`;
  }

  // Toggle ConflictPanel open/closed
  function toggleConflicts() {
    const panel = document.getElementById('cal2-conflict-panel');
    if (!panel) return;
    const isOpen = panel.dataset.open === 'true';
    panel.dataset.open = isOpen ? 'false' : 'true';
  }

  // ── KPI Strip ─────────────────────────────────────────────────
  function renderKPIStrip() {
    const today     = fmtDate(new Date());
    const todayBks  = bookings.filter(b => b.booking_date === today);
    const allBks    = bookings;
    const todayRev  = todayBks.reduce((s,b) => s+parseFloat(b.total_amount||0), 0);
    const pendBal   = allBks.reduce((s,b) => s+parseFloat(b.balance_pending||0), 0);
    const busy      = new Set(todayBks.map(b => b.boat_id||b.boat_type).filter(Boolean)).size;
    const blks      = availability.filter(a => a.is_available===0).length;
    const df        = document.getElementById('date-from')?.value||'';
    const dt        = document.getElementById('date-to')?.value||'';
    const pLabel    = df&&dt ? df.slice(5)+' → '+dt.slice(5) : 'semana actual';
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    set('cal2-kpi-today-bookings',  todayBks.length);
    set('cal2-kpi-today-sub',       `${allBks.length} en el período`);
    set('cal2-kpi-today-revenue',   fmtMoney(todayRev));
    set('cal2-kpi-revenue-sub',     todayBks.length ? `${todayBks.length} reservas` : 'ninguna hoy');
    set('cal2-kpi-balance',         pendBal>0 ? fmtMoney(pendBal) : '$0');
    set('cal2-kpi-period-bookings', allBks.length);
    set('cal2-kpi-period-sub',      pLabel);
    set('cal2-kpi-boats-busy',      `${busy}/${boats.length||'?'}`);
    set('cal2-kpi-blocks',          blks);
    // Fase 3A: update conflict panel on every KPI refresh
    _renderConflictPanel();
  }

  // ── BookingCard ────────────────────────────────────────────────
  function _card(b, compact) {
    const st   = b.status||'confirmed';
    const col  = STATUS_COL[st]||STATUS_COL.confirmed;
    const {h:sH,m:sM} = _hm(b.start_time);
    const dur  = b.duration_hours||4;
    const tlbl = `${String(sH).padStart(2,'0')}:${String(sM).padStart(2,'0')} – ${String(sH+dur).padStart(2,'0')}:${String(sM).padStart(2,'0')}`;
    const boat = esc(b.boat_type||b.boat_id||'—');
    const cap  = b.assigned_captain_name ? esc(b.assigned_captain_name) : '';
    const plat = b.platform ? esc(b.platform) : '';
    const cn   = esc(b.customer_name||'?');
    const cn1  = esc((b.customer_name||'?').split(' ')[0]);
    const total= parseFloat(b.total_amount||0);
    const dep  = parseFloat(b.deposit_amount||0);
    const pct  = total>0 ? Math.min(100,(dep/total)*100) : 0;
    const pCol = pct>=100 ? '#16a34a' : (pct>0 ? '#ca8a04' : '#dc2626');
    const tip  = esc(`${b.customer_name||'?'} | ${b.boat_type||'—'} | ${cap||'sin cap.'} | ${st} | ${tlbl}`);
    const click= `onclick="event.stopPropagation();openEditBooking('${esc(b.id)}')"`;
    const tid  = `data-testid="card-booking-${esc(b.id)}"`;
    if (compact) {
      return `<div class="cal2-bc-compact" style="background:${col.bg};border-color:${col.bd};color:${col.tx};" title="${tip}" ${click} ${tid}>
        <span class="cal2-bc-dot" style="background:${col.dot}"></span>
        <span class="cal2-bc-cname">${cn1}</span>
        <span class="cal2-bc-csep">·</span>
        <span class="cal2-bc-cboat">${boat.split(' ').slice(0,2).join(' ')}</span>
      </div>`;
    }
    return `<div class="cal2-bc" style="background:${col.bg};border-left:3px solid ${col.bd};color:${col.tx};" title="${tip}" ${click} ${tid}>
      <div class="cal2-bc-header">
        <span class="cal2-bc-name">${cn}</span>
        <span class="cal2-bc-time">${tlbl}</span>
      </div>
      <div class="cal2-bc-boat">${boat}</div>
      ${cap ? `<div class="cal2-bc-cap">&#9875; ${cap}</div>` : ''}
      <div class="cal2-bc-footer">
        ${plat ? `<span class="cal2-badge">${plat}</span>` : ''}
        ${b.is_manual ? `<span class="cal2-badge cal2-badge-manual">Manual</span>` : ''}
      </div>
      <div class="cal2-bc-paybar"><div class="cal2-bc-payfill" style="width:${pct.toFixed(0)}%;background:${pCol}"></div></div>
    </div>`;
  }

  // ══ WEEK VIEW 2 ═══════════════════════════════════════════════
  function renderWeekView2() {
    const cont = document.getElementById('cal2-grid-week');
    if (!cont) return;
    const days  = _getDays().slice(0, 7);
    if (!days.length) return;
    const today = fmtDate(new Date());

    let html = `<div class="cal2-wv">
      <div class="cal2-wv-head">
        <div class="cal2-wv-gutter"></div>
        ${days.map(d => {
          const ds=fmtDate(d), isT=ds===today, isW=[0,6].includes(d.getDay());
          const dow=d.toLocaleDateString('es-ES',{weekday:'short'}).toUpperCase();
          return `<div class="cal2-wv-dh ${isT?'cal2-istoday':''} ${isW?'cal2-isweekend':''}"
            data-date="${ds}" data-testid="col-header-${ds}"
            onclick="openBookingModal('${ds}','10:00')">
            <span class="cal2-wv-dow">${dow}</span>
            <span class="cal2-wv-dn ${isT?'cal2-today-pill':''}">${d.getDate()}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="cal2-wv-scroll">
        <div class="cal2-wv-body">
          <div class="cal2-wv-gutter-col">
            ${HOURS.map(h=>`<div class="cal2-wv-ts" style="height:${SLOT_H}px">${String(h).padStart(2,'0')}:00</div>`).join('')}
          </div>
          ${days.map(d => {
            const ds=fmtDate(d), isT=ds===today, isW=[0,6].includes(d.getDay());
            const dBks  = bookings.filter(b => b.booking_date===ds);
            const dBlks = availability.filter(a => a.date===ds && a.is_available===0);
            return `<div class="cal2-wv-col ${isT?'cal2-istoday':''} ${isW?'cal2-isweekend':''}"
              style="height:${HOURS.length*SLOT_H}px" data-date="${ds}" data-testid="day-col-${ds}">
              ${HOURS.map(h=>`<div class="cal2-wv-hr"
                style="top:${(h-H_START)*SLOT_H}px;height:${SLOT_H}px"
                onclick="if(event.target===this) openBookingModal('${ds}','${String(h).padStart(2,'0')}:00')"
                data-testid="slot-${ds}-${h}"></div>`).join('')}
              ${dBlks.map(a=>`<div class="cal2-avail-block"
                style="top:0;height:${HOURS.length*SLOT_H}px"
                title="${esc(a.reason||'Bloqueado')}">&#128683; ${esc(a.reason||'Bloqueado')}</div>`).join('')}
              ${dBks.map(b => {
                const {h:sH,m:sM}=_hm(b.start_time);
                const top=Math.max(0,((sH-H_START)+sM/60)*SLOT_H);
                const ht =Math.max(28,(b.duration_hours||4)*SLOT_H-4);
                return `<div class="cal2-wv-ev"
                  style="top:${top}px;height:${ht}px"
                  data-id="${b.id}" data-testid="event-${b.id}">
                  ${_card(b,false)}
                </div>`;
              }).join('')}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
    cont.innerHTML = html;
    cont.style.overflow = '';
  }

  // ══ DAY VIEW ══════════════════════════════════════════════════
  function renderDayView() {
    const cont = document.getElementById('cal2-grid-week');
    if (!cont) return;
    const ds    = _activeDay();
    const d     = new Date(ds+'T12:00:00');
    const today = fmtDate(new Date());
    const isT   = ds===today;
    const dow   = d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const dayBks  = bookings.filter(b => b.booking_date===ds);
    const dayBlks = availability.filter(a => a.date===ds && a.is_available===0);

    // Columns: one per distinct boat in fleet; fall back to bookings set
    const boatMap = new Map();
    boats.forEach(b => boatMap.set(b.id||b.name, b.name));
    dayBks.forEach(b => {
      const k = b.boat_id||b.boat_type||'sin-barco';
      if (!boatMap.has(k)) boatMap.set(k, b.boat_type||b.boat_id||'Sin barco');
    });
    if (!boatMap.size) boatMap.set('general','Reservas del día');
    const cols = [...boatMap.entries()];

    let html = `<div class="cal2-dv">
      <div class="cal2-dv-daybar">
        <span class="cal2-dv-dtitle ${isT?'cal2-today-text':''}">${dow.charAt(0).toUpperCase()+dow.slice(1)}</span>
        <span class="cal2-dv-badge">${dayBks.length} reserva${dayBks.length!==1?'s':''}</span>
      </div>
      <div class="cal2-dv-scroll">
        <div class="cal2-dv-inner">
          <div class="cal2-dv-gutter">
            <div class="cal2-dv-gh"></div>
            ${HOURS.map(h=>`<div class="cal2-dv-ts" style="height:${SLOT_H}px">${String(h).padStart(2,'0')}:00</div>`).join('')}
          </div>
          ${cols.map(([k,label]) => {
            const colBks = dayBks.filter(b => (b.boat_id||b.boat_type||'sin-barco')===k || k==='general');
            return `<div class="cal2-dv-boat-col">
              <div class="cal2-dv-bh">${esc(label)}</div>
              <div class="cal2-dv-body"
                style="height:${HOURS.length*SLOT_H}px"
                data-testid="dv-col-${k}"
                onclick="if(event.target===this||event.target.classList.contains('cal2-dv-body')) openBookingModal('${ds}','10:00')">
                ${HOURS.map(h=>`<div class="cal2-wv-hr"
                  style="top:${(h-H_START)*SLOT_H}px;height:${SLOT_H}px"
                  onclick="if(event.target===this) openBookingModal('${ds}','${String(h).padStart(2,'0')}:00')"
                  data-testid="dvslot-${ds}-${h}"></div>`).join('')}
                ${dayBlks.map(a=>`<div class="cal2-avail-block"
                  style="top:0;height:${HOURS.length*SLOT_H}px"
                  title="${esc(a.reason||'Bloqueado')}">&#128683; ${esc(a.reason||'Bloqueado')}</div>`).join('')}
                ${colBks.map(b => {
                  const {h:sH,m:sM}=_hm(b.start_time);
                  const top=Math.max(0,((sH-H_START)+sM/60)*SLOT_H);
                  const ht =Math.max(36,(b.duration_hours||4)*SLOT_H-4);
                  return `<div class="cal2-wv-ev"
                    style="top:${top}px;height:${ht}px"
                    data-testid="event-${b.id}">
                    ${_card(b,false)}
                  </div>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
    cont.innerHTML = html;
    cont.style.overflow = '';
  }

  // ══ TIMELINE VIEW ════════════════════════════════════════════
  function renderTimelineView() {
    const cont = document.getElementById('cal2-grid-week');
    if (!cont) return;
    const days  = _getDays();
    const today = fmtDate(new Date());
    const DAY_W = 110;

    const boatMap = new Map();
    boats.forEach(b => boatMap.set(b.id||b.name, b.name));
    bookings.forEach(b => {
      const k = b.boat_id||b.boat_type||'sin-barco';
      if (!boatMap.has(k)) boatMap.set(k, b.boat_type||b.boat_id||'Sin barco');
    });
    if (!boatMap.size) boatMap.set('todas','Todas las reservas');
    const rows = [...boatMap.entries()];
    const minW = 140+days.length*DAY_W;

    let html = `<div class="cal2-tl" style="overflow-x:auto">
      <div class="cal2-tl-head" style="min-width:${minW}px">
        <div class="cal2-tl-lcol">Embarcación</div>
        ${days.map(d => {
          const ds=fmtDate(d), isT=ds===today, isW=[0,6].includes(d.getDay());
          const dow=d.toLocaleDateString('es-ES',{weekday:'short'}).toUpperCase();
          return `<div class="cal2-tl-dh ${isT?'cal2-tl-today-h':''} ${isW?'cal2-tl-wend-h':''}"
            style="min-width:${DAY_W}px;width:${DAY_W}px" data-testid="tl-header-${ds}">
            <span>${dow}</span>
            <span class="cal2-tl-dn ${isT?'cal2-today-pill':''}">${d.getDate()}</span>
          </div>`;
        }).join('')}
      </div>
      ${rows.map(([k,name]) => {
        const rowBks = bookings.filter(b => (b.boat_id||b.boat_type||'sin-barco')===k || k==='todas');
        return `<div class="cal2-tl-row" style="min-width:${minW}px" data-testid="tl-row-${k}">
          <div class="cal2-tl-lcol cal2-tl-bl">${esc(name)}</div>
          ${days.map(d => {
            const ds=fmtDate(d), isT=ds===today, isW=[0,6].includes(d.getDay());
            const dayBks=rowBks.filter(b=>b.booking_date===ds);
            return `<div class="cal2-tl-cell ${isT?'cal2-tl-today-c':''} ${isW?'cal2-tl-wend-c':''}"
              style="min-width:${DAY_W}px;width:${DAY_W}px"
              onclick="if(!event.target.closest('.cal2-bc-compact')) openBookingModal('${ds}','10:00')"
              data-testid="tl-cell-${k}-${ds}">
              ${dayBks.map(b=>_card(b,true)).join('')}
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>`;
    cont.innerHTML = html;
    cont.style.overflow = 'auto';
  }

  // ══ MONTH VIEW ═══════════════════════════════════════════════
  function renderMonthView() {
    const cont = document.getElementById('cal2-grid-week');
    if (!cont) return;
    const df   = document.getElementById('date-from')?.value;
    const base = df ? new Date(df+'T12:00:00') : new Date();
    const yr   = base.getFullYear(), mo = base.getMonth();
    const today= fmtDate(new Date());
    const first= new Date(yr,mo,1), last=new Date(yr,mo+1,0);
    const sDow = (first.getDay()+6)%7;
    const cells=[];
    for (let i=0;i<sDow;i++){const d=new Date(first);d.setDate(d.getDate()-(sDow-i));cells.push({date:d,curr:false});}
    for (let i=1;i<=last.getDate();i++) cells.push({date:new Date(yr,mo,i),curr:true});
    while(cells.length%7!==0){const l=cells[cells.length-1].date,nx=new Date(l);nx.setDate(nx.getDate()+1);cells.push({date:nx,curr:false});}
    const mLabel=first.toLocaleDateString('es-ES',{month:'long',year:'numeric'});

    let html = `<div class="cal2-mv">
      <div class="cal2-mv-mh">${mLabel.charAt(0).toUpperCase()+mLabel.slice(1)}</div>
      <div class="cal2-mv-grid">
        ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`<div class="cal2-mv-dow">${d}</div>`).join('')}
        ${cells.map(c => {
          const ds=fmtDate(c.date), isT=ds===today, isW=[0,6].includes(c.date.getDay());
          const dayBks=bookings.filter(b=>b.booking_date===ds);
          const show=dayBks.slice(0,3), more=dayBks.length-show.length;
          return `<div class="cal2-mv-cell ${!c.curr?'cal2-mv-other':''} ${isT?'cal2-mv-today':''} ${isW?'cal2-mv-wend':''}"
            data-date="${ds}" data-testid="mv-cell-${ds}"
            onclick="if(!event.target.closest('.cal2-bc-compact')) NadakiCalendar.setDayView('${ds}')">
            <div class="cal2-mv-dn ${isT?'cal2-today-pill cal2-today-pill-sm':''}">${c.date.getDate()}</div>
            ${show.map(b=>_card(b,true)).join('')}
            ${more>0?`<div class="cal2-mv-more">+${more} más</div>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
    cont.innerHTML = html;
    cont.style.overflow = '';
  }

  // ── Master render dispatcher ───────────────────────────────────
  function _render(v) {
    switch (v||_view) {
      case 'week':     renderWeekView2();    break;
      case 'day':      renderDayView();      break;
      case 'timeline': renderTimelineView(); break;
      case 'month':    renderMonthView();    break;
    }
  }

  // ── Populate toolbar filters ───────────────────────────────────
  function _populateFilters() {
    const cSel=document.getElementById('cal2-captain-filter');
    const bSel=document.getElementById('cal2-boat-filter');
    if (cSel) captains.forEach(c=>{
      const o=document.createElement('option');
      o.value=c.id; o.textContent=c.name+(c.status==='inactive'?' (inactivo)':'');
      cSel.appendChild(o);
    });
    if (bSel) boats.forEach(b=>{
      const o=document.createElement('option');
      o.value=b.id||b.name; o.dataset.name=b.name; o.textContent=b.name;
      bSel.appendChild(o);
    });
  }

  // ── Date label sync ────────────────────────────────────────────
  function _updateDateLabel() {
    const lbl=document.getElementById('cal2-date-label');
    if (!lbl) return;
    const df=document.getElementById('date-from')?.value;
    const dt=document.getElementById('date-to')?.value;
    if (df&&dt) {
      const fr=new Date(df+'T12:00:00'), to=new Date(dt+'T12:00:00');
      lbl.textContent=fr.toLocaleDateString('es-ES',{day:'numeric',month:'short'})
        +' – '+to.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
    } else { lbl.textContent='Semana actual'; }
  }

  // ── Wire toolbar ───────────────────────────────────────────────
  function _wireToolbar() {
    const $=id=>document.getElementById(id);
    $('cal2-prev')?.addEventListener('click',()=>{weekNav(-1);_updateDateLabel();renderKPIStrip();});
    $('cal2-next')?.addEventListener('click',()=>{weekNav(1);_updateDateLabel();renderKPIStrip();});
    $('cal2-today')?.addEventListener('click',()=>{
      _dayDate=null; setDefaultDates(); initWeekStart();
      loadScheduleData().then(()=>{_render();renderKPIStrip();_updateDateLabel();});
    });
    $('cal2-btn-nueva-reserva')?.addEventListener('click',()=>openBookingModal());
    $('cal2-btn-add-block')?.addEventListener('click',()=>openAvailabilityModal());
    $('cal2-captain-filter')?.addEventListener('change',e=>{
      const l=document.getElementById('captain-select'); if(l) l.value=e.target.value;
      loadScheduleData().then(()=>{_render();renderKPIStrip();});
    });
    $('cal2-boat-filter')?.addEventListener('change',e=>{
      const val=e.target.value;
      const nm=e.target.options[e.target.selectedIndex]?.dataset?.name||'';
      document.querySelectorAll('.cal2-bc,.cal2-bc-compact').forEach(el=>{
        el.style.opacity=(!val||el.title.includes(nm))?'1':'0.2';
      });
    });
    // Fase 3A: KPI CONFLICTOS card toggles ConflictPanel
    document.querySelector('[data-testid="kpi-conflicts"]')
      ?.addEventListener('click', toggleConflicts);
  }

  // ── Wire ViewSwitcher ──────────────────────────────────────────
  function _wireViewSwitcher() {
    document.querySelectorAll('.cal2-view-btn').forEach(btn=>{
      btn.addEventListener('click',()=>switchView(btn.dataset.view));
    });
  }

  // ── Intercept legacy renderWeekView ───────────────────────────
  function _interceptLegacyRender() {
    _origRenderWeek = window.renderWeekView;
    window.renderWeekView = function() {
      if (_initiated) _render();
      else if (_origRenderWeek) _origRenderWeek();
    };
  }

  // ── Hide legacy sections (reversible) ─────────────────────────
  function _hideLegacy() {
    ['.page-header','.controls-bar','.week-section','.conflict-section'].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        el.dataset.cal2LegacyDisplay=el.style.display||'';
        el.dataset.cal2Legacy='1';
        el.style.display='none';
      });
    });
  }

  // ═════════════════════════════════════════
  // PUBLIC API
  // ═════════════════════════════════════════

  function init() {
    if (_initiated) return;
    _initiated = true;
    _populateFilters();
    _wireToolbar();
    _wireViewSwitcher();
    _interceptLegacyRender();
    renderKPIStrip();
    _render('week');
    _updateDateLabel();
    document.getElementById('cal2-shell').style.display='block';
    requestAnimationFrame(_hideLegacy);
    console.info('[NadakiCalendar] Fase 2 activo — Week/Day/Timeline/Month. Rollback: NadakiCalendar.restoreLegacy()');
  }

  function switchView(view) {
    _view=view;
    document.querySelectorAll('.cal2-view-btn').forEach(b=>{
      b.classList.toggle('cal2-view-active',b.dataset.view===view);
    });
    const ph=document.getElementById('cal2-view-placeholder');
    if (ph) ph.style.display='none';
    const gw=document.getElementById('cal2-grid-week');
    if (gw) gw.style.display='block';
    _render(view);
  }

  function setDayView(ds) {
    _dayDate=ds;
    switchView('day');
  }

  function refresh() {
    return loadScheduleData().then(()=>{_render();renderKPIStrip();_updateDateLabel();});
  }

  function openBooking(id) { if(id) openEditBooking(id); else openBookingModal(); }

  function restoreLegacy() {
    document.querySelectorAll('[data-cal2-legacy]').forEach(el=>{
      el.style.display=el.dataset.cal2LegacyDisplay||'';
      delete el.dataset.cal2Legacy;
      delete el.dataset.cal2LegacyDisplay;
    });
    const sh=document.getElementById('cal2-shell');
    if (sh) sh.style.display='none';
    _initiated=false;
    console.info('[NadakiCalendar] Legacy mode restored. Recarga la página para el grid legacy completo.');
  }

  // Stubs Fase 3+
  function createBlock()    { openAvailabilityModal(); }
  function updateBooking()  { console.warn('[NC] updateBooking — Fase 3'); }
  function resolveConflict(){ console.warn('[NC] resolveConflict — Fase 3'); }

  return {
    init, switchView, setDayView, refresh, renderKPIStrip, openBooking,
    createBlock, updateBooking, resolveConflict, restoreLegacy,
    renderWeekView2, renderDayView, renderTimelineView, renderMonthView,
    toggleConflicts,
  };
}());
