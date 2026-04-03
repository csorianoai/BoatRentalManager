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
