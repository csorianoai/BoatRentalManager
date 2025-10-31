// Schedule Manager - FASE 5
let captains = [];
let bookings = [];
let availability = [];
let selectedCaptain = '';
let dateFrom = '';
let dateTo = '';
let currentAvailabilityId = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  await loadCaptains();
  setDefaultDates();
  await loadScheduleData();
  setupEventListeners();
});

// Set default date range (this week)
function setDefaultDates() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  document.getElementById('date-from').value = formatDate(monday);
  document.getElementById('date-to').value = formatDate(sunday);
  
  dateFrom = formatDate(monday);
  dateTo = formatDate(sunday);
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Load captains
async function loadCaptains() {
  try {
    const response = await fetch('/api/captains');
    captains = await response.json();
    
    populateCaptainSelects();
  } catch (error) {
    console.error('Error loading captains:', error);
  }
}

function populateCaptainSelects() {
  const selects = [
    'captain-select',
    'check-captain',
    'modal-captain'
  ];
  
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    const currentValue = select.value;
    
    select.innerHTML = selectId === 'captain-select' 
      ? '<option value="">Todos los capitanes</option>' 
      : '<option value="">Seleccionar...</option>';
    
    captains.forEach(captain => {
      const option = document.createElement('option');
      option.value = captain.id;
      option.textContent = captain.name;
      select.appendChild(option);
    });
    
    if (currentValue) {
      select.value = currentValue;
    }
  });
}

// Load schedule data
async function loadScheduleData() {
  await Promise.all([
    loadBookings(),
    loadAvailability()
  ]);
  
  renderWeekView();
  renderBookingsTable();
  renderAvailabilityTable();
}

async function loadBookings() {
  try {
    let url = '/api/bookings?';
    
    const params = new URLSearchParams();
    if (selectedCaptain) params.append('captain', selectedCaptain);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    
    const response = await fetch(url + params.toString());
    const data = await response.json();
    bookings = data.filter(b => ['pending', 'confirmed', 'assigned', 'in_progress'].includes(b.status));
  } catch (error) {
    console.error('Error loading bookings:', error);
    bookings = [];
  }
}

async function loadAvailability() {
  try {
    const params = new URLSearchParams();
    if (selectedCaptain) params.append('captainId', selectedCaptain);
    if (dateFrom) params.append('startDate', dateFrom);
    if (dateTo) params.append('endDate', dateTo);
    
    const response = await fetch('/api/availability?' + params.toString());
    availability = await response.json();
  } catch (error) {
    console.error('Error loading availability:', error);
    availability = [];
  }
}

// Render week view
function renderWeekView() {
  const headerDiv = document.getElementById('week-header');
  const gridDiv = document.getElementById('week-grid');
  
  headerDiv.innerHTML = '<div class="week-header-cell">Hora</div>';
  
  // Generate week days
  const startDate = new Date(dateFrom);
  const days = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    days.push(date);
    
    const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
    const dayNum = date.getDate();
    headerDiv.innerHTML += `
      <div class="week-header-cell">
        ${dayName} ${dayNum}
      </div>
    `;
  }
  
  // Generate time slots (8am to 6pm)
  gridDiv.innerHTML = '';
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  
  hours.forEach(hour => {
    const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
    gridDiv.innerHTML += `<div class="time-label">${timeLabel}</div>`;
    
    days.forEach(day => {
      const dateStr = formatDate(day);
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      
      // Find bookings for this day
      const dayBookings = bookings.filter(b => b.booking_date === dateStr);
      const dayAvailability = availability.filter(a => a.date === dateStr && a.is_available === 0);
      
      let cellContent = '';
      
      // Add unavailable blocks
      dayAvailability.forEach(avail => {
        cellContent += `
          <div class="unavailable-block" title="${avail.reason || 'No disponible'}">
            🚫 ${avail.reason || 'Bloqueado'}
          </div>
        `;
      });
      
      // Add bookings that overlap with this hour
      dayBookings.forEach(booking => {
        const bookingHour = parseInt(booking.start_time?.split(':')[0] || '0');
        const duration = booking.duration_hours || 4;
        
        if (bookingHour <= hour && hour < bookingHour + duration) {
          const captainName = booking.assigned_captain_name || 'Sin asignar';
          cellContent += `
            <div class="booking-block" title="${captainName} - ${booking.customer_name}">
              ${captainName.split(' ')[0]}
            </div>
          `;
        }
      });
      
      gridDiv.innerHTML += `
        <div class="day-cell ${isWeekend ? 'weekend' : ''}">
          ${cellContent}
        </div>
      `;
    });
  });
}

// Render bookings table
function renderBookingsTable() {
  const tbody = document.getElementById('bookings-table-body');
  const countSpan = document.getElementById('bookings-count');
  
  if (bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">No hay reservas en este período</td></tr>';
    countSpan.textContent = '0';
    return;
  }
  
  countSpan.textContent = bookings.length;
  
  tbody.innerHTML = bookings.map(booking => `
    <tr data-testid="row-booking-${booking.id}">
      <td data-testid="text-date-${booking.id}">${booking.booking_date}</td>
      <td>${booking.start_time || '-'}</td>
      <td>${booking.duration_hours || 4} hrs</td>
      <td>${booking.assigned_captain_name || 'Sin asignar'}</td>
      <td>${booking.customer_name}</td>
      <td>${booking.platform}</td>
      <td>${booking.boat_type}</td>
      <td><span class="status-badge status-${booking.status}">${booking.status}</span></td>
    </tr>
  `).join('');
}

// Render availability table
function renderAvailabilityTable() {
  const tbody = document.getElementById('availability-table-body');
  const countSpan = document.getElementById('availability-count');
  
  if (availability.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">No hay bloques de disponibilidad</td></tr>';
    countSpan.textContent = '0';
    return;
  }
  
  countSpan.textContent = availability.length;
  
  tbody.innerHTML = availability.map(avail => {
    const captain = captains.find(c => c.id === avail.captain_id);
    const captainName = captain ? captain.name : avail.captain_id;
    
    return `
      <tr data-testid="row-availability-${avail.id}">
        <td>${captainName}</td>
        <td>${avail.date}</td>
        <td>${avail.start_time} - ${avail.end_time}</td>
        <td><span class="status-badge ${avail.is_available === 1 ? 'available-yes' : 'available-no'}">
          ${avail.is_available === 1 ? 'Sí' : 'No'}
        </span></td>
        <td>${avail.reason || '-'}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteAvailability('${avail.id}')" data-testid="button-delete-${avail.id}">
            🗑️ Eliminar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(tab + '-tab').classList.add('active');
    });
  });
  
  // Filters
  document.getElementById('captain-select').addEventListener('change', (e) => {
    selectedCaptain = e.target.value;
  });
  
  document.getElementById('date-from').addEventListener('change', (e) => {
    dateFrom = e.target.value;
  });
  
  document.getElementById('date-to').addEventListener('change', (e) => {
    dateTo = e.target.value;
  });
  
  document.getElementById('btn-refresh').addEventListener('click', loadScheduleData);
  
  // Add block button
  document.getElementById('btn-add-block').addEventListener('click', () => {
    currentAvailabilityId = null;
    document.getElementById('modal-title').textContent = 'Bloquear Disponibilidad';
    document.getElementById('availability-form').reset();
    document.getElementById('availability-modal').classList.add('show');
  });
  
  // Modal close
  document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('availability-modal').classList.remove('show');
  });
  
  document.getElementById('btn-cancel').addEventListener('click', () => {
    document.getElementById('availability-modal').classList.remove('show');
  });
  
  // Availability form submit
  document.getElementById('availability-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveAvailability();
  });
  
  // Conflict checker
  document.getElementById('btn-check-conflict').addEventListener('click', checkConflict);
}

// Save availability
async function saveAvailability() {
  try {
    const captainId = document.getElementById('modal-captain').value;
    const date = document.getElementById('modal-date').value;
    const reason = document.getElementById('modal-reason').value;
    
    if (!captainId || !date) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }
    
    const data = {
      captainId,
      date,
      startTime: '00:00',
      endTime: '23:59',
      isAvailable: 0,
      reason
    };
    
    const response = await fetch('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      document.getElementById('availability-modal').classList.remove('show');
      await loadScheduleData();
    } else {
      alert('Error al guardar disponibilidad');
    }
  } catch (error) {
    console.error('Error saving availability:', error);
    alert('Error al guardar disponibilidad');
  }
}

// Delete availability
async function deleteAvailability(id) {
  if (!confirm('¿Estás seguro de eliminar este bloque de disponibilidad?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/availability/${id}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadScheduleData();
    } else {
      alert('Error al eliminar disponibilidad');
    }
  } catch (error) {
    console.error('Error deleting availability:', error);
    alert('Error al eliminar disponibilidad');
  }
}

// Check conflict
async function checkConflict() {
  try {
    const captainId = document.getElementById('check-captain').value;
    const date = document.getElementById('check-date').value;
    const time = document.getElementById('check-time').value;
    const duration = parseInt(document.getElementById('check-duration').value);
    
    if (!captainId || !date || !time) {
      alert('Por favor completa todos los campos');
      return;
    }
    
    const response = await fetch('/api/availability/check-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        captainId,
        date,
        startTime: time,
        durationHours: duration
      })
    });
    
    const result = await response.json();
    const resultDiv = document.getElementById('conflict-result');
    
    if (result.hasConflict) {
      let message = '⚠️ HAY CONFLICTO: ';
      
      if (result.reason === 'unavailable') {
        message += `El capitán no está disponible. Razón: ${result.details.reason || 'Día bloqueado'}`;
      } else if (result.reason === 'booking_conflict') {
        message += `El capitán ya tiene una reserva a esa hora (${result.conflictingBooking.customer_name})`;
      }
      
      resultDiv.className = 'conflict-result show has-conflict';
      resultDiv.textContent = message;
    } else {
      resultDiv.className = 'conflict-result show no-conflict';
      resultDiv.textContent = '✅ NO HAY CONFLICTO: El capitán está disponible para esta fecha y hora';
    }
  } catch (error) {
    console.error('Error checking conflict:', error);
    alert('Error al verificar conflictos');
  }
}
