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

  // Fase 5: Cargar documentos/contratos para esta reserva
  calDocuments.load(id);
  // Fase 6: Cargar pagos de capitán para esta reserva
  calCaptainPay.load(id);
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

    const saved = await res.json();
    closeBookingModal();
    await loadScheduleData();
    renderWeekView();

    // Show advisory notice if price differs from expected (but booking was saved)
    const integrity = saved?.pricing_integrity_status;
    if (integrity === 'advisory') {
      const expected = saved?.pricing_expected;
      const actual   = parseFloat(saved?.total_amount || 0);
      const delta    = saved?.pricing_delta;
      const note = expected
        ? ` (precio esperado: $${expected}, diferencia: $${Math.abs(delta || 0).toFixed(2)})`
        : '';
      showToast(`Reserva guardada. Precio personalizado registrado${note}.`);
    } else {
      showToast(currentBookingId ? 'Reserva actualizada.' : 'Reserva creada correctamente.');
    }
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
  let _filterBalance     = false;      // Fase 4B: "saldo pendiente" filter toggle

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
    const bal  = parseFloat(b.balance_pending||0);
    const pct  = total>0 ? Math.min(100,(dep/total)*100) : 0;
    const pCol = pct>=100 ? '#16a34a' : (pct>0 ? '#ca8a04' : '#dc2626');
    const tip  = esc(`${b.customer_name||'?'} | ${b.boat_type||'—'} | ${cap||'sin cap.'} | ${st} | ${tlbl}`);
    const click= `onclick="event.stopPropagation();openEditBooking('${esc(b.id)}')"`;
    const tid  = `data-testid="card-booking-${esc(b.id)}"`;
    // Fase 4B: balance due flag
    const hasDue = bal > 0 && b.payment_status !== 'paid';
    const dueAttr= hasDue ? ' data-due="1"' : '';
    const dueBadge= hasDue ? `<span class="cal2-badge-due" data-testid="badge-due-${esc(b.id)}">DEBE ${fmtMoney(bal)}</span>` : '';
    if (compact) {
      return `<div class="cal2-bc-compact" style="background:${col.bg};border-color:${col.bd};color:${col.tx};" title="${tip}" ${click} ${tid}${dueAttr}>
        <span class="cal2-bc-dot" style="background:${col.dot}"></span>
        <span class="cal2-bc-cname">${cn1}</span>
        <span class="cal2-bc-csep">·</span>
        <span class="cal2-bc-cboat">${boat.split(' ').slice(0,2).join(' ')}</span>
      </div>`;
    }
    return `<div class="cal2-bc" style="background:${col.bg};border-left:3px solid ${col.bd};color:${col.tx};" title="${tip}" ${click} ${tid}${dueAttr}>
      <div class="cal2-bc-header">
        <span class="cal2-bc-name">${cn}</span>
        <span class="cal2-bc-time">${tlbl}</span>
      </div>
      <div class="cal2-bc-boat">${boat}</div>
      ${cap ? `<div class="cal2-bc-cap">&#9875; ${cap}</div>` : ''}
      <div class="cal2-bc-footer">
        ${plat ? `<span class="cal2-badge">${plat}</span>` : ''}
        ${b.is_manual ? `<span class="cal2-badge cal2-badge-manual">Manual</span>` : ''}
        ${dueBadge}
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
            title="Ver día ${ds}"
            onclick="NadakiCalendar.setDayView('${ds}')" style="cursor:pointer">
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
        <button class="cal2-dv-back-btn" onclick="NadakiCalendar.switchView('week')" title="Volver a vista semana">&#8592; Semana</button>
        <span class="cal2-dv-dtitle ${isT?'cal2-today-text':''}">${dow.charAt(0).toUpperCase()+dow.slice(1)}</span>
        <span class="cal2-dv-badge">${dayBks.length} reserva${dayBks.length!==1?'s':''}</span>
        <button class="cal2-btn-primary" style="margin-left:auto;padding:4px 12px;font-size:12px" onclick="openBookingModal('${ds}','10:00')" data-testid="dv-btn-nueva-reserva">+ Nueva Reserva</button>
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
              style="min-width:${DAY_W}px;width:${DAY_W}px;cursor:pointer"
              onclick="if(!event.target.closest('.cal2-bc-compact')) NadakiCalendar.setDayView('${ds}')"
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
    if (_view === 'day') {
      const d = _dayDate || df;
      if (d) {
        const dt2 = new Date(d+'T12:00:00');
        lbl.textContent = dt2.toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'long',year:'numeric'});
      } else { lbl.textContent='Hoy'; }
    } else if (_view === 'month') {
      if (df) {
        const fr=new Date(df+'T12:00:00');
        lbl.textContent=fr.toLocaleDateString('es-ES',{month:'long',year:'numeric'}).replace(/^\w/,c=>c.toUpperCase());
      } else { lbl.textContent='Mes actual'; }
    } else {
      if (df&&dt) {
        const fr=new Date(df+'T12:00:00'), to=new Date(dt+'T12:00:00');
        lbl.textContent=fr.toLocaleDateString('es-ES',{day:'numeric',month:'short'})
          +' – '+to.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
      } else { lbl.textContent='Semana actual'; }
    }
  }

  // ── Smart navigation — moves by day/week/month based on active view ──
  function _smartNav(dir) {
    if (_view === 'day') {
      // Move 1 day forward/backward
      const cur = _dayDate || document.getElementById('date-from')?.value || fmtDate(new Date());
      const d = new Date(cur + 'T12:00:00');
      d.setDate(d.getDate() + dir);
      const ds = fmtDate(d);
      _dayDate = ds;
      // Update date range so loadScheduleData fetches the right week
      document.getElementById('date-from').value = ds;
      document.getElementById('date-to').value = ds;
      loadScheduleData().then(()=>{ _render(); renderKPIStrip(); _updateDateLabel(); _renderDateScrubber(); });
    } else if (_view === 'month') {
      // Move 1 month forward/backward
      const df = document.getElementById('date-from')?.value;
      const base = df ? new Date(df+'T12:00:00') : new Date();
      base.setMonth(base.getMonth() + dir, 1);
      document.getElementById('date-from').value = fmtDate(base);
      const last = new Date(base.getFullYear(), base.getMonth()+1, 0);
      document.getElementById('date-to').value = fmtDate(last);
      weekStart = new Date(base);
      loadScheduleData().then(()=>{ _render(); renderKPIStrip(); _updateDateLabel(); _renderDateScrubber(); });
    } else {
      // Week / Timeline: move 7 days
      weekNav(dir);
      _updateDateLabel();
      renderKPIStrip();
      _renderDateScrubber();
    }
    _updateNavButtons();
  }

  // ── Update nav button titles based on view ─────────────────────
  function _updateNavButtons() {
    const prev = document.getElementById('cal2-prev');
    const next = document.getElementById('cal2-next');
    if (!prev || !next) return;
    const labels = { day: ['Día anterior','Día siguiente'], month: ['Mes anterior','Mes siguiente'], week: ['Semana anterior','Semana siguiente'], timeline: ['Semana anterior','Semana siguiente'] };
    const [pt, nt] = labels[_view] || labels.week;
    prev.title = pt; next.title = nt;
  }

  // ── Date Scrubber ─────────────────────────────────────────────
  const DS_CELL_W  = 42;   // px per day cell
  const DS_TOTAL   = 63;   // total days in strip (9 weeks)
  const DS_BACK_WK = 3;    // weeks behind current week to start

  function _initDateScrubber() {
    _renderDateScrubber();
    const bar = document.getElementById('cal2-dbar');
    if (!bar) return;

    // Mouse drag
    let startX = 0, startScroll = 0, isDragging = false, movedPx = 0;
    bar.addEventListener('mousedown', e => {
      isDragging = true; movedPx = 0;
      startX = e.clientX; startScroll = bar.scrollLeft;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      bar.scrollLeft = startScroll - dx;
      movedPx = Math.abs(dx);
    });
    document.addEventListener('mouseup', e => {
      if (!isDragging) return;
      isDragging = false;
      if (movedPx > 10) {
        window._dsClickGuard = true;
        setTimeout(() => { window._dsClickGuard = false; }, 200);
      }
      if (movedPx > 90) {
        const dx = startX - e.clientX;
        if (dx > 90) { _smartNav(1); setTimeout(_renderDateScrubber, 380); }
        else if (dx < -90) { _smartNav(-1); setTimeout(_renderDateScrubber, 380); }
      }
    });

    // Touch swipe
    let tStartX = 0, tScrollStart = 0, tMoved = 0;
    bar.addEventListener('touchstart', e => {
      tStartX = e.touches[0].clientX; tScrollStart = bar.scrollLeft; tMoved = 0;
    }, { passive: true });
    bar.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - tStartX;
      bar.scrollLeft = tScrollStart - dx;
      tMoved = Math.abs(dx);
    }, { passive: true });
    bar.addEventListener('touchend', e => {
      if (tMoved > 10) { window._dsClickGuard = true; setTimeout(() => { window._dsClickGuard = false; }, 200); }
      if (tMoved > 80) {
        const dx = tStartX - e.changedTouches[0].clientX;
        if (dx > 80) { _smartNav(1); setTimeout(_renderDateScrubber, 380); }
        else if (dx < -80) { _smartNav(-1); setTimeout(_renderDateScrubber, 380); }
      }
    }, { passive: true });
  }

  function _renderDateScrubber() {
    const track = document.getElementById('cal2-dbar-track');
    if (!track) return;
    const today = fmtDate(new Date());
    const df = document.getElementById('date-from')?.value || today;
    const dt = document.getElementById('date-to')?.value || today;
    const baseD = new Date(df + 'T12:00:00');
    const mon = new Date(baseD);
    mon.setDate(baseD.getDate() - ((baseD.getDay() + 6) % 7));
    const start = new Date(mon);
    start.setDate(mon.getDate() - DS_BACK_WK * 7);

    let html = '';
    let lastMonth = -1;
    for (let i = 0; i < DS_TOTAL; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = fmtDate(d);
      const isToday = ds === today;
      const isWend  = [0, 6].includes(d.getDay());
      const inRange = ds >= df && ds <= dt;
      const dow = d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 2).toUpperCase();
      if (d.getMonth() !== lastMonth) {
        if (lastMonth !== -1) html += `<div class="cal2-dbar-sep"></div>`;
        const mLabel = d.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase();
        html += `<div class="cal2-dbar-month-label">${mLabel}</div>`;
        lastMonth = d.getMonth();
      }
      const cls = ['cal2-dbar-day', isToday?'cal2-dbar-today':'', isWend?'cal2-dbar-wend':'', inRange?'cal2-dbar-inrange':''].filter(Boolean).join(' ');
      html += `<div class="${cls}" data-date="${ds}" data-testid="dbar-${ds}"
        onclick="if(!window._dsClickGuard) _dsClickDay('${ds}')">
        <span class="cal2-dbar-dow">${dow}</span>
        <span class="cal2-dbar-dn">${d.getDate()}</span>
      </div>`;
    }
    track.innerHTML = html;
    requestAnimationFrame(() => {
      const bar = document.getElementById('cal2-dbar');
      if (!bar) return;
      const cellIdx = DS_BACK_WK * 7;
      const barW = bar.clientWidth;
      bar.scrollLeft = Math.max(0, cellIdx * DS_CELL_W - (barW / 2) + (3.5 * DS_CELL_W));
    });
  }

  // Global click handler for date scrubber cells
  window._dsClickDay = function(ds) {
    if (window._dsClickGuard) return;
    const d = new Date(ds + 'T12:00:00');
    if (_view === 'day') {
      NadakiCalendar.setDayView(ds);
    } else if (_view === 'month') {
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      document.getElementById('date-from').value = fmtDate(first);
      document.getElementById('date-to').value   = fmtDate(last);
      weekStart = new Date(first);
      loadScheduleData().then(() => { _render(); renderKPIStrip(); _updateDateLabel(); _renderDateScrubber(); });
    } else {
      const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const s = new Date(m); s.setDate(m.getDate() + 6);
      document.getElementById('date-from').value = fmtDate(m);
      document.getElementById('date-to').value   = fmtDate(s);
      weekStart = new Date(m);
      loadScheduleData().then(() => { _render(); renderKPIStrip(); _updateDateLabel(); _renderDateScrubber(); });
    }
  };

  // ── Wire toolbar ───────────────────────────────────────────────
  function _wireToolbar() {
    const $=id=>document.getElementById(id);
    $('cal2-prev')?.addEventListener('click',()=>_smartNav(-1));
    $('cal2-next')?.addEventListener('click',()=>_smartNav(1));
    $('cal2-today')?.addEventListener('click',()=>{
      _dayDate=null; setDefaultDates(); initWeekStart();
      _view = _view; // keep current view
      loadScheduleData().then(()=>{_render();renderKPIStrip();_updateDateLabel();_updateNavButtons();_renderDateScrubber();});
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
      e.target.classList.toggle('cal2-filter-active', !!val);
      const icon=e.target.closest('.cal2-filter-wrap')?.querySelector('.cal2-fw-icon');
      if (icon) icon.style.color = val ? '#93c5fd' : '';
      document.querySelectorAll('.cal2-bc,.cal2-bc-compact').forEach(el=>{
        el.style.opacity=(!val||el.title.includes(nm))?'1':'0.2';
      });
    });
    // Fase 3A: KPI CONFLICTOS card toggles ConflictPanel
    document.querySelector('[data-testid="kpi-conflicts"]')
      ?.addEventListener('click', toggleConflicts);
    // Fase 4B: balance filter toggle
    $('cal2-btn-filter-bal')?.addEventListener('click', toggleBalanceFilter);
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
    _initDrawer();          // Fase 3B: activate drawer bridge
    _initDateScrubber();    // Date scrubber strip
    renderKPIStrip();
    _render('week');
    _updateDateLabel();
    _updateNavButtons();
    document.getElementById('cal2-shell').style.display='block';
    requestAnimationFrame(_hideLegacy);
    console.info('[NadakiCalendar] Fase 3B activo — DrawerBridge ON. Rollback: NadakiCalendar.restoreLegacy()');
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
    // When switching to week/timeline view, ensure date range covers a full week
    if (view === 'week' || view === 'timeline') {
      const df = document.getElementById('date-from')?.value;
      if (df) {
        const d = new Date(df+'T12:00:00');
        const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay()+6)%7));
        const sun = new Date(mon); sun.setDate(mon.getDate()+6);
        document.getElementById('date-from').value = fmtDate(mon);
        document.getElementById('date-to').value   = fmtDate(sun);
        weekStart = new Date(mon);
        loadScheduleData().then(()=>{ _render(view); renderKPIStrip(); _updateDateLabel(); _updateNavButtons(); });
        return;
      }
    }
    // When switching to month view, expand the date range to cover the whole month
    if (view === 'month') {
      const df = document.getElementById('date-from')?.value;
      const base = df ? new Date(df+'T12:00:00') : new Date();
      const first = new Date(base.getFullYear(), base.getMonth(), 1);
      const last  = new Date(base.getFullYear(), base.getMonth()+1, 0);
      document.getElementById('date-from').value = fmtDate(first);
      document.getElementById('date-to').value   = fmtDate(last);
      weekStart = new Date(first);
      loadScheduleData().then(()=>{ _render(view); renderKPIStrip(); _updateDateLabel(); _updateNavButtons(); });
      return;
    }
    _render(view);
    _updateDateLabel();
    _updateNavButtons();
  }

  function setDayView(ds) {
    _dayDate=ds;
    // When going to day view, ensure the date range covers that week for data loading
    const d = new Date(ds+'T12:00:00');
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay()+6)%7));
    const sun = new Date(mon); sun.setDate(mon.getDate()+6);
    document.getElementById('date-from').value = fmtDate(mon);
    document.getElementById('date-to').value   = fmtDate(sun);
    weekStart = new Date(mon);
    loadScheduleData().then(()=>{ switchView('day'); });
  }

  function refresh() {
    return loadScheduleData().then(()=>{_render();renderKPIStrip();_updateDateLabel();});
  }

  // ── Fase 4A: QuickOps ─────────────────────────────────────────
  let _qopsMsgTimer = null;

  function _qopsMsg(text, isErr) {
    const el = document.getElementById('cal2-qops-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'visible ' + (isErr ? 'err' : 'ok');
    clearTimeout(_qopsMsgTimer);
    _qopsMsgTimer = setTimeout(() => { el.className = ''; }, 3200);
  }

  // Mark booking as paid — POST /api/bookings/:id/mark-paid (no auth)
  async function _qopsPaid() {
    const id = currentBookingId;
    if (!id) return;
    const btn = document.getElementById('cal2-qops-paid');
    if (btn) btn.disabled = true;
    try {
      const r = await fetch(`/api/bookings/${id}/mark-paid`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) { _qopsMsg(j.error || 'Error al marcar', true); return; }
      // Update local booking
      const bk = bookings.find(b => b.id === id);
      if (bk) { bk.payment_status = 'paid'; bk.balance_pending = 0; }
      _qopsMsg('Pagado registrado');
      _render(); renderKPIStrip();
      // Refresh bk-balance field if visible
      const balEl = document.getElementById('bk-balance');
      if (balEl) balEl.value = '0';
    } catch(e) { _qopsMsg('Error de red', true); }
    finally { if (btn) btn.disabled = false; }
  }

  // Assign captain — POST /api/bookings/:id/assign-captain (no auth)
  async function _qopsCaptain() {
    const id = currentBookingId;
    if (!id) return;
    const sel = document.getElementById('cal2-qops-captain-sel');
    const capId = sel?.value;
    if (!capId) { _qopsMsg('Selecciona un capitán', true); return; }
    const cap = captains.find(c => String(c.id) === capId);
    if (!cap) return;
    const btn = document.getElementById('cal2-qops-cap-btn');
    if (btn) btn.disabled = true;
    try {
      const r = await fetch(`/api/bookings/${id}/assign-captain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captain_name: cap.name, captain_phone: cap.phone || '' }),
      });
      const j = await r.json();
      if (!r.ok) { _qopsMsg(j.error || 'Error al asignar', true); return; }
      // Update local booking
      const bk = bookings.find(b => b.id === id);
      if (bk) {
        bk.assigned_captain_id   = String(cap.id);
        bk.assigned_captain_name = cap.name;
      }
      _qopsMsg(`Cap. "${cap.name}" asignado`);
      // Update captain dropdown in main form if visible
      const capEl = document.getElementById('bk-captain');
      if (capEl) capEl.value = String(cap.id);
      _render(); renderKPIStrip();
    } catch(e) { _qopsMsg('Error de red', true); }
    finally { if (btn) btn.disabled = false; }
  }

  // Populate captain select when drawer opens with a booking
  function _qopsRefresh(isEdit) {
    const sel = document.getElementById('cal2-qops-captain-sel');
    if (!sel) return;
    if (!isEdit) return;
    // Rebuild options
    sel.innerHTML = '<option value="">— capitán —</option>' +
      captains.filter(c=>c.status!=='inactive').map(c =>
        `<option value="${esc(String(c.id))}">${esc(c.name)}</option>`
      ).join('');
    // Pre-select if already assigned
    const bk = bookings.find(b => b.id === currentBookingId);
    if (bk?.assigned_captain_id) sel.value = String(bk.assigned_captain_id);
    // Show/hide paid button based on current state
    const paidBtn = document.getElementById('cal2-qops-paid');
    if (paidBtn) paidBtn.style.display = (bk?.payment_status === 'paid' || bk?.balance_pending == 0) ? 'none' : '';
    // Fase 4B: balance display
    const balEl = document.getElementById('cal2-qops-balance');
    if (balEl && bk) {
      const bal = parseFloat(bk.balance_pending||0);
      const isPaid = bk.payment_status === 'paid' || bal === 0;
      balEl.style.display = '';
      balEl.textContent = isPaid ? 'PAGADO' : `Saldo: ${fmtMoney(bal)}`;
      balEl.className    = isPaid ? 'paid' : '';
    }

    // Fase 4A: finance strip population
    if (bk) {
      const $ = id => document.getElementById(id);
      // Payer type — derived from booking data (no extra fetch)
      const payerLabel = bk.broker_id
        ? `Broker: ${esc(bk.broker_name || bk.broker_id)}`
        : 'Cliente directo';
      if ($('cal2-fin-payer')) $('cal2-fin-payer').textContent = payerLabel;

      // Total & pending
      const total = parseFloat(bk.total_amount || 0);
      const pending = parseFloat(bk.balance_pending || 0);
      const amountText = pending > 0
        ? `${fmtMoney(total)} (${fmtMoney(pending)} pendiente)`
        : fmtMoney(total);
      if ($('cal2-fin-amount')) $('cal2-fin-amount').textContent = amountText;

      // Payment status badge
      const payEl = $('cal2-fin-payment');
      const bkIsPaid = bk.payment_status === 'paid' || pending === 0;
      if (payEl) {
        payEl.textContent = bkIsPaid ? 'Pagado' : `Pendiente ${fmtMoney(pending)}`;
        payEl.className = `cal2-fin-badge ${bkIsPaid ? 'paid' : 'pending'}`;
      }

      // Deposit status — async (guarded by booking ID)
      const snapId = currentBookingId;
      const depEl  = $('cal2-fin-deposit');
      const depBtn = $('cal2-qops-deposit');
      if (depEl) {
        depEl.textContent = '…';
        depEl.className = 'cal2-fin-badge';
        if (depBtn) depBtn.style.display = 'none';
        fetch(`/api/bookings/${snapId}/deposit-status`)
          .then(r => r.json())
          .then(d => {
            if (currentBookingId !== snapId) return; // stale
            const map = {
              deposited:              ['Depositado',           'deposited'],
              received_not_deposited: ['Recibido sin depositar','received'],
              not_paid:               ['Sin pago',             'not_paid'],
              no_transaction:         ['Sin transacción',      'not_paid'],
            };
            const [label, cls] = map[d.deposit_status] || ['—', 'not_paid'];
            depEl.textContent = label;
            depEl.className = `cal2-fin-badge ${cls}`;
            if (depBtn) depBtn.style.display =
              d.deposit_status === 'received_not_deposited' ? '' : 'none';
          })
          .catch(() => { if (depEl && currentBookingId === snapId) depEl.textContent = '—'; });
      }
    }
  }

  // Fase 4A: mark payment as deposited from the drawer
  async function _qopsDeposit() {
    const id = currentBookingId;
    if (!id) return;
    const btn = document.getElementById('cal2-qops-deposit');
    if (btn) btn.disabled = true;
    try {
      const r = await fetch(`/api/bookings/${id}/mark-deposited`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deposit_date: new Date().toISOString().slice(0, 10) }),
      });
      const j = await r.json();
      if (!r.ok) { _qopsMsg(j.error || 'Error al depositar', true); return; }
      _qopsMsg('Depósito bancario registrado');
      _qopsRefresh(true); // refresh strip
    } catch(e) { _qopsMsg('Error de red', true); }
    finally { if (btn) btn.disabled = false; }
  }

  function _initQuickOps() {
    const mc = document.querySelector('#booking-modal .modal-content');
    const mh = mc?.querySelector('.modal-header');
    if (!mc || !mh || mc.querySelector('#cal2-qops-bar')) return; // already injected

    const bar = document.createElement('div');
    bar.id = 'cal2-qops-bar';
    bar.setAttribute('data-testid', 'cal2-qops-bar');
    bar.innerHTML = `
      <button id="cal2-qops-paid" class="cal2-qops-btn cal2-qops-paid"
              data-testid="btn-qops-paid" onclick="NadakiCalendar._qopsPaid()">
        &#10003; Marcar pagado
      </button>
      <select id="cal2-qops-captain-sel" class="cal2-qops-sel"
              data-testid="sel-qops-captain">
        <option value="">— capitán —</option>
      </select>
      <button id="cal2-qops-cap-btn" class="cal2-qops-btn cal2-qops-cap"
              data-testid="btn-qops-assign-cap" onclick="NadakiCalendar._qopsCaptain()">
        Asignar
      </button>
      <span id="cal2-qops-balance" style="display:none;" data-testid="badge-qops-balance"></span>
      <span id="cal2-qops-msg"></span>
    `;
    mh.insertAdjacentElement('afterend', bar);

    // Fase 4A: Finance strip — injected right after the QuickOps bar
    const fin = document.createElement('div');
    fin.id = 'cal2-finance-strip';
    fin.setAttribute('data-testid', 'cal2-finance-strip');
    fin.innerHTML = `
      <div class="cal2-fin-row">
        <span class="cal2-fin-label">Pagador</span>
        <span id="cal2-fin-payer" class="cal2-fin-val" data-testid="fin-payer">—</span>
      </div>
      <div class="cal2-fin-row">
        <span class="cal2-fin-label">Total</span>
        <span id="cal2-fin-amount" class="cal2-fin-val" data-testid="fin-amount">—</span>
      </div>
      <div class="cal2-fin-row">
        <span class="cal2-fin-label">Pago</span>
        <span id="cal2-fin-payment" class="cal2-fin-badge" data-testid="fin-payment">—</span>
      </div>
      <div class="cal2-fin-row">
        <span class="cal2-fin-label">Depósito</span>
        <span id="cal2-fin-deposit" class="cal2-fin-badge" data-testid="fin-deposit">—</span>
        <button id="cal2-qops-deposit" style="display:none;"
                data-testid="btn-qops-deposit"
                onclick="NadakiCalendar._qopsDeposit()">Depositar</button>
      </div>
    `;
    bar.insertAdjacentElement('afterend', fin);

    // MutationObserver: detect modal open/close
    const modal = document.getElementById('booking-modal');
    new MutationObserver(() => {
      const isOpen = modal.classList.contains('show');
      const isEdit = isOpen && !!currentBookingId;
      if (isOpen && isEdit) _qopsRefresh(true);
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  // Fase 4B: toggle balance filter
  function toggleBalanceFilter() {
    _filterBalance = !_filterBalance;
    const btn  = document.getElementById('cal2-btn-filter-bal');
    const grid = document.getElementById('cal2-grid-container');
    if (btn)  btn.classList.toggle('active', _filterBalance);
    if (grid) grid.classList.toggle('cal2-filter-bal-active', _filterBalance);
  }

  function openBooking(id) { if(id) openEditBooking(id); else openBookingModal(); }

  // ── Fase 3B: DrawerBridge ──────────────────────────────────────
  function closeDrawer() {
    closeBookingModal(); // removes .show → CSS transition reverses
  }

  function _initDrawer() {
    // Activate drawer mode: body class drives all CSS overrides
    document.body.classList.add('cal2-drawer-mode');

    // Inject the left-edge close tab into .modal-content (once only)
    const mc = document.querySelector('#booking-modal .modal-content');
    if (mc && !mc.querySelector('#cal2-drawer-close')) {
      const btn = document.createElement('button');
      btn.id = 'cal2-drawer-close';
      btn.setAttribute('aria-label', 'Cerrar panel');
      btn.setAttribute('data-testid', 'btn-drawer-close');
      btn.innerHTML = '&#10005;';
      btn.addEventListener('click', closeDrawer);
      mc.appendChild(btn);
    }

    // Esc key closes the drawer
    document.addEventListener('keydown', _drawerEsc);

    // Fase 4A: inject QuickOps bar
    _initQuickOps();
  }

  function _drawerEsc(e) {
    if (e.key === 'Escape') {
      const m = document.getElementById('booking-modal');
      if (m && m.classList.contains('show')) closeDrawer();
    }
  }

  function restoreLegacy() {
    // Fase 3B: remove drawer bridge
    document.body.classList.remove('cal2-drawer-mode');
    document.removeEventListener('keydown', _drawerEsc);
    const btn = document.getElementById('cal2-drawer-close');
    if (btn) btn.remove();
    // Fase 2: restore legacy grid
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
    toggleConflicts, closeDrawer, _qopsPaid, _qopsCaptain, _qopsDeposit, toggleBalanceFilter,
  };
}());

/* ══════════════════════════════════════════════════════════════════
   calDocuments — Documentos / Contrato en el BookingDrawer
   Calendar-first: usa metadata del contrato, no booking_id,
   para encontrar el booking correcto.
   ══════════════════════════════════════════════════════════════════ */
const calDocuments = (function () {
  'use strict';

  let _bookingId   = null;
  let _bookingData = null;  // full booking object for metadata

  function _esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _fmt(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function _pill(mime) {
    const base = 'display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;';
    if (mime === 'application/pdf') return `<span style="${base}background:#FEE2E2;color:#DC2626">PDF</span>`;
    if (mime && mime.startsWith('image/')) return `<span style="${base}background:#DBEAFE;color:#1D4ED8">IMG</span>`;
    return `<span style="${base}background:#F3F4F6;color:#6B7280">DOC</span>`;
  }

  function _categoryLabel(cat, score) {
    if (cat === 'already_linked') return `<span style="color:#16a34a;font-size:11px;font-weight:700;">&#10003; Vinculado</span>`;
    if (cat === 'auto-link')      return `<span style="background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;border-radius:10px;padding:1px 7px;">Auto-link · ${score}/140</span>`;
    if (cat === 'review')         return `<span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;border-radius:10px;padding:1px 7px;">Revisar · ${score}/140</span>`;
    return `<span style="background:#F3F4F6;color:#6B7280;font-size:10px;font-weight:700;border-radius:10px;padding:1px 7px;">Coincidencia baja · ${score}/140</span>`;
  }

  function _renderDoc(d) {
    const cat = d.category;
    const cm  = d.contract_meta || {};
    const cardBg = cat === 'review' ? '#FFFBEB' : cat === 'already_linked' ? '#F0FDF4' : '#fff';
    const border = cat === 'review' ? '1px solid #FDE68A' : cat === 'already_linked' ? '1px solid #BBF7D0' : '1px solid #E2E8F0';

    const metaLine = (cm.customer_name || cm.boat_name || cm.rental_date || cm.total_amount) ? `
      <div style="font-size:11px;color:#64748b;margin-top:3px;line-height:1.6;">
        ${cm.customer_name ? `<b>Cliente:</b> ${_esc(cm.customer_name)} &nbsp;` : ''}
        ${cm.boat_name     ? `<b>Barco:</b> ${_esc(cm.boat_name)} &nbsp;` : ''}
        ${cm.rental_date   ? `<b>Fecha:</b> ${_esc(cm.rental_date)} &nbsp;` : ''}
        ${cm.start_time_raw && cm.end_time_raw ? `<b>Hora:</b> ${_esc(cm.start_time_raw)}&ndash;${_esc(cm.end_time_raw)} &nbsp;` : cm.start_time_raw ? `<b>Hora:</b> ${_esc(cm.start_time_raw)} &nbsp;` : ''}
        ${cm.total_amount   ? `<b>Total:</b> $${_esc(String(cm.total_amount))} &nbsp;` : ''}
        ${cm.deposit_amount ? `<b>Dep:</b> $${_esc(String(cm.deposit_amount))} &nbsp;` : ''}
      </div>` : '';

    const reasonLine = d.breakdown && d.breakdown.length
      ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${d.breakdown.map(_esc).join(' · ')}</div>` : '';

    const actions = cat === 'already_linked' ? `
      <a href="/api/documents/${_esc(d.id)}/view" target="_blank"
         style="font-size:11px;color:#0066cc;text-decoration:none;font-weight:600;margin-right:10px;">Ver PDF</a>
      <a href="/api/documents/${_esc(d.id)}/download"
         style="font-size:11px;color:#475569;text-decoration:none;margin-right:10px;">Descargar</a>
      <button onclick="calDocuments.unlink('${_esc(d.id)}')"
              style="font-size:11px;border:none;background:none;color:#dc2626;cursor:pointer;padding:0;">Desvincular</button>
    ` : `
      <button onclick="calDocuments.confirm('${_esc(d.id)}')"
              style="font-size:11px;border:1px solid #16a34a;border-radius:5px;background:#fff;color:#16a34a;cursor:pointer;padding:2px 9px;font-weight:600;margin-right:8px;">Confirmar vinculo</button>
      <a href="/api/documents/${_esc(d.id)}/view" target="_blank"
         style="font-size:11px;color:#0066cc;text-decoration:none;font-weight:600;margin-right:10px;">Ver PDF</a>
      <a href="/api/documents/${_esc(d.id)}/download"
         style="font-size:11px;color:#475569;text-decoration:none;">Descargar</a>
    `;

    return `
    <div style="display:flex;gap:10px;padding:10px;border:${border};border-radius:6px;background:${cardBg};margin-bottom:8px;">
      <div style="flex-shrink:0;padding-top:2px;">${_pill(d.mime_type)}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
             title="${_esc(d.original_name)}">${_esc(d.original_name)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap;">
          ${_categoryLabel(cat, d.score)}
          <span style="font-size:11px;color:#94a3b8;">${_fmt(d.file_size)}</span>
        </div>
        ${metaLine}
        ${reasonLine}
        <div style="margin-top:8px;">${actions}</div>
      </div>
    </div>`;
  }

  /* ── Load and render ──────────────────────────────────────── */
  async function load(bookingId) {
    _bookingId   = bookingId;
    _bookingData = (typeof bookings !== 'undefined') ? (bookings.find(b => b.id === bookingId) || null) : null;

    const sec    = document.getElementById('bk-docs-section');
    const body   = document.getElementById('bk-docs-body');
    const badge  = document.getElementById('bk-docs-badge');
    const input  = document.getElementById('bk-doc-upload');
    const status = document.getElementById('bk-docs-upload-status');

    if (!sec || !body) return;
    sec.style.display = 'block';
    body.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:8px 0;">Cargando documentos...</div>';
    if (badge)  badge.style.display  = 'none';
    if (input)  input.value          = '';
    if (status) status.style.display = 'none';

    if (!bookingId) {
      body.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:8px 0;">Guarda la reserva primero para gestionar documentos.</div>';
      return;
    }

    try {
      // PRIMARY: documents directly linked via booking_id (canonical truth)
      const r1 = await fetch(`/api/documents?booking_id=${encodeURIComponent(bookingId)}`);
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const linked = await r1.json();

      // SECONDARY (async, non-blocking): auto-match suggestions for unlinked PDFs
      let suggestions = [];
      try {
        const r2 = await fetch(`/api/contracts/booking-suggestions?booking_id=${encodeURIComponent(bookingId)}`);
        if (r2.ok) {
          const d2 = await r2.json();
          // Filter out docs already directly linked (avoid duplication)
          const linkedIds = new Set(linked.map(d => d.id));
          suggestions = (d2.suggestions || []).filter(s => !linkedIds.has(s.id) && s.category !== 'already_linked');
        }
      } catch(e2) { /* non-fatal */ }

      _render(linked, suggestions, badge);
    } catch (e) {
      body.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:8px 0;">Error al cargar documentos.</div>`;
      console.warn('[calDocuments]', e);
    }
  }

  function _renderLinkedDoc(d) {
    const typeLabel = d.doc_type || 'Doc';
    const size = _fmt(d.file_size);
    const dateStr = d.created_at ? d.created_at.slice(0,10) : '';
    return `
    <div style="display:flex;gap:10px;padding:10px;border:1px solid #bbf7d0;border-radius:6px;background:#f0fdf4;margin-bottom:8px;"
         data-testid="linked-doc-${_esc(d.id)}">
      <div style="flex-shrink:0;padding-top:2px;">${_pill(d.mime_type)}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
             title="${_esc(d.original_name)}">${_esc(d.original_name)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${_esc(typeLabel)}${size ? ' · ' + size : ''}${dateStr ? ' · ' + dateStr : ''}</div>
        <div style="margin-top:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <a href="/api/documents/${_esc(d.id)}/view" target="_blank"
             style="font-size:11px;color:#0066cc;text-decoration:none;font-weight:600;"
             data-testid="view-doc-${_esc(d.id)}">Ver</a>
          <a href="/api/documents/${_esc(d.id)}/download"
             style="font-size:11px;color:#475569;text-decoration:none;"
             data-testid="download-doc-${_esc(d.id)}">Descargar</a>
          <button onclick="calDocuments.unlink('${_esc(d.id)}')"
                  style="font-size:11px;border:none;background:none;color:#dc2626;cursor:pointer;padding:0;"
                  data-testid="unlink-doc-${_esc(d.id)}">Desvincular</button>
        </div>
      </div>
    </div>`;
  }

  function _render(linked, suggestions, badge) {
    const body = document.getElementById('bk-docs-body');
    if (!body) return;

    // Badge: count of review suggestions
    const reviewCount = suggestions.filter(s => s.category === 'review').length;
    if (badge) {
      badge.style.display = reviewCount ? 'inline-block' : 'none';
      badge.textContent   = reviewCount;
    }

    let html = '';

    // ── PRIMARY: directly linked documents ──────────────
    if (linked.length) {
      linked.forEach(d => { html += _renderLinkedDoc(d); });
    } else {
      html += `<div style="color:#94a3b8;font-size:13px;padding:8px 0;">
        Sin documentos vinculados.
        <span style="color:#0369a1;"> Arrastra un PDF arriba o usa el botón.</span>
      </div>`;
    }

    // ── SECONDARY: auto-match candidates (unlinked PDFs) ──
    const autoLink = suggestions.filter(s => s.category === 'auto-link');
    const review   = suggestions.filter(s => s.category === 'review');

    if (autoLink.length || review.length) {
      html += `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed #e2e8f0;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
          Documentos sin vincular — posibles coincidencias
        </div>`;

      autoLink.forEach(d => { html += _renderDoc(d); });
      review.forEach(d   => { html += _renderDoc(d); });
      html += `</div>`;
    }

    body.innerHTML = html;
  }

  /* ── Confirm link ─────────────────────────────────────────── */
  async function confirm(docId) {
    if (!_bookingId) return;
    try {
      const r = await fetch(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: _bookingId }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error || 'Error'); }
      await load(_bookingId);
    } catch (e) {
      alert('Error al vincular: ' + e.message);
    }
  }

  /* ── Unlink ───────────────────────────────────────────────── */
  async function unlink(docId) {
    if (!window.confirm('Desvincular este documento de la reserva?')) return;
    try {
      const r = await fetch(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: null }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error || 'Error'); }
      await load(_bookingId);
    } catch (e) {
      alert('Error al desvincular: ' + e.message);
    }
  }

  /* ── Drag-and-drop handler ────────────────────────────────── */
  async function onDrop(event) {
    event.preventDefault();
    const dz = document.getElementById('bk-docs-dropzone');
    if (dz) dz.classList.remove('bk-dz-over');
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    await _doUpload(files);
  }

  /* ── Upload files (from input) ────────────────────────────── */
  async function uploadFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    await _doUpload(files);
  }

  /* ── Core upload logic ────────────────────────────────────── */
  async function _doUpload(files) {
    if (!_bookingId) { alert('Guarda la reserva primero.'); return; }

    const status = document.getElementById('bk-docs-upload-status');
    if (status) { status.style.display = 'block'; status.textContent = `Subiendo ${files.length} archivo(s)...`; }

    // Compute end_time from booking data
    let endTime = null;
    if (_bookingData && _bookingData.start_time && _bookingData.duration_hours) {
      const [h, m] = _bookingData.start_time.split(':').map(Number);
      const endMin = h * 60 + (m || 0) + parseFloat(_bookingData.duration_hours) * 60;
      endTime = `${String(Math.floor(endMin / 60)).padStart(2,'0')}:${String(endMin % 60).padStart(2,'0')}`;
    }

    let uploaded = 0;
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('booking_id', _bookingId);
      fd.append('doc_type', 'Contrato');
      // Send full booking context for server-side matching
      if (_bookingData) {
        if (_bookingData.customer_name)  fd.append('customer_name',  _bookingData.customer_name);
        if (_bookingData.boat_type)      fd.append('boat_name',       _bookingData.boat_type);
        if (_bookingData.booking_date)   fd.append('booking_date',    _bookingData.booking_date);
        if (_bookingData.start_time)     fd.append('start_time',      _bookingData.start_time);
        if (endTime)                     fd.append('end_time',        endTime);
        if (_bookingData.total_amount)   fd.append('total_amount',    _bookingData.total_amount);
        if (_bookingData.deposit_amount) fd.append('deposit_amount',  _bookingData.deposit_amount);
      }
      try {
        const r = await fetch('/api/documents/upload', { method: 'POST', body: fd });
        if (!r.ok) { const j = await r.json(); throw new Error(j.error || 'Error al subir ' + file.name); }
        uploaded++;
        if (status) status.textContent = `Subido ${uploaded}/${files.length}: ${file.name}`;
      } catch (e) {
        if (status) { status.style.color = '#dc2626'; status.textContent = 'Error: ' + e.message; }
      }
    }

    if (status) {
      status.style.color = '#16a34a';
      status.textContent = `${uploaded}/${files.length} archivo(s) subido(s) y vinculado(s)`;
      setTimeout(() => { if (status) status.style.display = 'none'; }, 3000);
    }
    await load(_bookingId);
  }

  return { load, confirm, unlink, uploadFiles, onDrop };
}());

/* ══════════════════════════════════════════════════════════════════
   calCaptainPay — Pago de Capitán vinculado a Booking (Fase 6)
   ══════════════════════════════════════════════════════════════════ */
const calCaptainPay = (function () {
  'use strict';

  let _bookingId = null;

  function _esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const METHOD_LABELS = {
    cash: 'Efectivo', bank_transfer: 'Transferencia', zelle: 'Zelle',
    check: 'Cheque', other: 'Otro'
  };

  function _statusBadge(status) {
    const base = 'display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;';
    if (status === 'paid')    return `<span style="${base}background:#D1FAE5;color:#065F46;">Pagado</span>`;
    if (status === 'pending') return `<span style="${base}background:#FEF3C7;color:#92400E;">Pendiente</span>`;
    return `<span style="${base}background:#F3F4F6;color:#6B7280;">${_esc(status)}</span>`;
  }

  function _renderPayment(p) {
    const method = METHOD_LABELS[p.payment_method] || p.payment_method || '';
    const dateStr = p.work_date ? String(p.work_date).slice(0, 10) : '';
    const txBadge = p.transaction_id
      ? `<span style="font-size:10px;color:#0369a1;font-weight:600;">&#10003; Transacción registrada</span>`
      : '';
    return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;
                padding:10px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;margin-bottom:8px;"
         data-testid="cap-pay-row-${_esc(p.id)}">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${_esc(p.captain_name)}</div>
        <div style="font-size:12px;color:#475569;margin-top:2px;">
          $${parseFloat(p.amount).toFixed(2)}
          ${method ? ' · ' + _esc(method) : ''}
          ${dateStr ? ' · ' + dateStr : ''}
        </div>
        ${p.description ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${_esc(p.description)}</div>` : ''}
        <div style="margin-top:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${_statusBadge(p.status)}
          ${txBadge}
        </div>
      </div>
      <button onclick="calCaptainPay.del('${_esc(p.id)}')"
              style="flex-shrink:0;border:none;background:none;color:#dc2626;cursor:pointer;font-size:11px;padding:2px 0;"
              data-testid="btn-cap-pay-del-${_esc(p.id)}">Eliminar</button>
    </div>`;
  }

  /* ── Load and render ── */
  async function load(bookingId) {
    _bookingId = bookingId;

    const sec  = document.getElementById('bk-cap-pay-section');
    const body = document.getElementById('bk-cap-pay-body');
    const form = document.getElementById('bk-cap-pay-form');

    if (!sec || !body) return;
    sec.style.display = 'block';
    body.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:6px 0;">Cargando pagos...</div>';
    if (form) form.style.display = 'none';

    _populateCaptainSelect();

    if (!bookingId) {
      body.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:6px 0;">Guarda la reserva primero.</div>';
      return;
    }

    try {
      const r = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/captain-payments`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const payments = await r.json();
      _render(payments);
    } catch (e) {
      body.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:6px 0;">Error al cargar pagos.</div>`;
      console.warn('[calCaptainPay]', e);
    }
  }

  function _render(payments) {
    const body = document.getElementById('bk-cap-pay-body');
    if (!body) return;
    if (!payments.length) {
      body.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:6px 0;">Sin pagos registrados para este booking.</div>';
    } else {
      const total = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      const paidTotal = payments.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      body.innerHTML =
        `<div style="font-size:11px;color:#475569;margin-bottom:8px;padding:6px 10px;background:#f1f5f9;border-radius:6px;">
           Total: <strong>$${total.toFixed(2)}</strong>
           ${paidTotal < total ? ` &nbsp;·&nbsp; Pagado: <strong style="color:#16a34a;">$${paidTotal.toFixed(2)}</strong>` : ''}
         </div>` +
        payments.map(_renderPayment).join('');
    }
  }

  function _populateCaptainSelect() {
    const sel = document.getElementById('bk-cpf-captain');
    if (!sel) return;
    const list = (typeof captains !== 'undefined') ? captains : [];
    sel.innerHTML = list.map(c =>
      `<option value="${_esc(c.id)}">${_esc(c.name)}</option>`
    ).join('');
    if (!sel.innerHTML) sel.innerHTML = '<option value="">Sin capitanes cargados</option>';
  }

  /* ── Form controls ── */
  function showForm() {
    const form = document.getElementById('bk-cap-pay-form');
    const btn  = document.getElementById('bk-cap-pay-add-btn');
    if (form) form.style.display = 'block';
    if (btn)  btn.style.display  = 'none';
    // Default date = today
    const dateEl = document.getElementById('bk-cpf-date');
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toISOString().slice(0, 10);
    }
    // Pre-fill captain from booking
    const capEl = document.getElementById('bk-cpf-captain');
    const bkCap = document.getElementById('bk-captain');
    if (capEl && bkCap && bkCap.value) capEl.value = bkCap.value;
  }

  function hideForm() {
    const form = document.getElementById('bk-cap-pay-form');
    const btn  = document.getElementById('bk-cap-pay-add-btn');
    if (form) form.style.display = 'none';
    if (btn)  btn.style.display  = '';
    _clearMsg();
  }

  function _msg(text, isErr) {
    const el = document.getElementById('bk-cpf-msg');
    if (!el) return;
    el.style.display = 'block';
    el.style.color   = isErr ? '#dc2626' : '#16a34a';
    el.textContent   = text;
  }

  function _clearMsg() {
    const el = document.getElementById('bk-cpf-msg');
    if (el) el.style.display = 'none';
  }

  /* ── Submit ── */
  async function submit() {
    if (!_bookingId) { _msg('Guarda la reserva primero.', true); return; }

    const capSel   = document.getElementById('bk-cpf-captain');
    const amtEl    = document.getElementById('bk-cpf-amount');
    const methodEl = document.getElementById('bk-cpf-method');
    const dateEl   = document.getElementById('bk-cpf-date');
    const statusEl = document.getElementById('bk-cpf-status');
    const descEl   = document.getElementById('bk-cpf-desc');
    const btn      = document.getElementById('button-cpf-submit') ||
                     document.querySelector('[data-testid="button-cpf-submit"]');

    const capId   = capSel?.value || '';
    const capName = capSel?.options[capSel.selectedIndex]?.text || capId;
    const amount  = parseFloat(amtEl?.value || '0');
    const method  = methodEl?.value || 'cash';
    const date    = dateEl?.value || '';
    const status  = statusEl?.value || 'paid';
    const desc    = descEl?.value?.trim() || '';

    if (!capName || capName === 'Sin capitanes cargados') { _msg('Selecciona un capitán.', true); return; }
    if (!amount || amount <= 0) { _msg('Ingresa un monto válido.', true); return; }
    if (!date) { _msg('La fecha es obligatoria.', true); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
      const r = await fetch(`/api/bookings/${encodeURIComponent(_bookingId)}/captain-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captain_id: capId, captain_name: capName,
          amount, payment_method: method,
          work_date: date, status, description: desc
        })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al registrar');

      const txNote = data.transaction ? ' — transacción contable creada' : '';
      _msg(`Pago registrado${ txNote}`, false);

      // Reset form fields
      if (amtEl) amtEl.value = '';
      if (descEl) descEl.value = '';

      setTimeout(() => hideForm(), 1200);
      await load(_bookingId);
    } catch (e) {
      _msg(e.message || 'Error al registrar el pago.', true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Registrar pago'; }
    }
  }

  /* ── Delete ── */
  async function del(paymentId) {
    if (!confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;
    try {
      const r = await fetch(`/api/captain-payments/${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      await load(_bookingId);
    } catch (e) {
      console.warn('[calCaptainPay] delete error', e);
    }
  }

  return { load, showForm, hideForm, submit, del };
}());
