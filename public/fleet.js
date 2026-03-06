// Fleet Management JavaScript

let boats = [];
let currentBoat = null;
let currentMonth = new Date();
let isViewMode = false;

const PLATFORMS = [
  { id: 'boatsetter', name: 'BoatSetter' },
  { id: 'getmyboat', name: 'GetMyBoat' },
  { id: 'airbnb', name: 'Airbnb Experiences' },
  { id: 'viator', name: 'Viator' },
  { id: 'expedia', name: 'Expedia' },
  { id: 'tripadvisor', name: 'TripAdvisor' },
  { id: 'groupon', name: 'Groupon' },
  { id: 'bookingcom', name: 'Booking.com' },
  { id: 'fareharbor', name: 'FareHarbor' },
  { id: 'bokun', name: 'Bokun' },
  { id: 'rezdy', name: 'Rezdy' },
  { id: 'peek', name: 'Peek' },
  { id: 'xola', name: 'Xola' }
];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadBoats();
  setupEventListeners();
  setTodayDate();
  initPhotoUpload();
});

// Authentication helper
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

async function authFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include'
  });
  
  if (response.status === 401) {
    window.location.href = '/';
    throw new Error('Unauthorized');
  }
  
  return response;
}

// Tab Navigation
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');

      if (tabName === 'calendar') {
        renderCalendar();
      } else if (tabName === 'platforms') {
        loadPlatformBoatSelect();
      }
    });
  });
}

// Event Listeners
function setupEventListeners() {
  const addBtn = document.getElementById('add-boat-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      isViewMode = false;
      currentBoat = null;
      openBoatModal();
    });
  }

  const closeBtn = document.getElementById('close-modal-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeBoatModal);
  
  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeBoatModal);

  const form = document.getElementById('boat-form');
  if (form) form.addEventListener('submit', saveBoat);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Calendar navigation
  document.getElementById('prev-month-btn').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('next-month-btn').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById('calendar-boat-filter').addEventListener('change', renderCalendar);

  // Platform linking
  document.getElementById('platform-boat-select').addEventListener('change', loadPlatformIds);
  document.getElementById('save-platform-ids-btn').addEventListener('click', savePlatformIds);

  // Quick search
  document.getElementById('search-btn').addEventListener('click', performQuickSearch);
}

function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('search-date').value = today;
}

// Load Boats
async function loadBoats() {
  try {
    const response = await authFetch('/api/fleet/boats');
    boats = await response.json();
    renderBoatsGrid();
    populateBoatSelects();
  } catch (error) {
    console.error('Error loading boats:', error);
    document.getElementById('fleet-grid').innerHTML = '<p class="error">❌ Error al cargar la flotilla</p>';
  }
}

function renderBoatsGrid() {
  const grid = document.getElementById('fleet-grid');
  
  if (boats.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666;">No hay barcos registrados. Agrega tu primer barco.</p>';
    return;
  }

  grid.innerHTML = boats.map(boat => {
    const mainPhoto = boat.photos && boat.photos.length > 0 ? boat.photos[0] : '';
    
    const statusClass = boat.status === 'active' ? 'status-active' : 
                        boat.status === 'maintenance' ? 'status-maintenance' : 'status-retired';
    const statusText = boat.status === 'active' ? 'Activo' : 
                       boat.status === 'maintenance' ? 'Mantenimiento' : 'Retirado';
    
    const photoHTML = mainPhoto ? 
      `<img src="${mainPhoto}" class="boat-photo" alt="${boat.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="boat-photo-placeholder" style="display:none;">
         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
         </svg>
         <span>Sin foto disponible</span>
       </div>` :
      `<div class="boat-photo-placeholder">
         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
         </svg>
         <span>Sin foto disponible</span>
       </div>`;
    
    return `
      <div class="boat-card" data-testid="card-boat-${boat.id}">
        ${photoHTML}
        
        <div class="boat-card-content">
          <div class="boat-header">
            <div>
              <div class="boat-type">${boat.boatType}</div>
              <div class="boat-name">${boat.name}</div>
            </div>
            <span class="boat-status-badge ${statusClass}">${statusText}</span>
          </div>
          
          <div class="boat-info">
            <div class="boat-info-row">
              <span class="boat-info-label">Capacidad</span>
              <span class="boat-info-value">${boat.capacity} personas</span>
            </div>
            ${boat.make || boat.model ? `
              <div class="boat-info-row">
                <span class="boat-info-label">Modelo</span>
                <span class="boat-info-value">${[boat.make, boat.model].filter(Boolean).join(' ')}</span>
              </div>
            ` : ''}
            ${boat.year ? `
              <div class="boat-info-row">
                <span class="boat-info-label">Año</span>
                <span class="boat-info-value">${boat.year}</span>
              </div>
            ` : ''}
            ${boat.location ? `
              <div class="boat-info-row">
                <span class="boat-info-label">Ubicación</span>
                <span class="boat-info-value">${boat.location}</span>
              </div>
            ` : ''}
            ${boat.hourlyRateBase ? `
              <div class="boat-info-row">
                <span class="boat-info-label">Tarifa por hora</span>
                <span class="boat-info-value">$${(boat.hourlyRateBase / 100).toFixed(2)}</span>
              </div>
            ` : ''}
            ${boat.dailyRateBase ? `
              <div class="boat-info-row">
                <span class="boat-info-label">Tarifa por día</span>
                <span class="boat-info-value">$${(boat.dailyRateBase / 100).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>
          
          <div class="boat-actions">
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" data-testid="button-view-boat-${boat.id}" onclick="viewBoat('${boat.id}')" style="flex: 1;">Ver</button>
              <button class="btn btn-secondary" data-testid="button-edit-boat-${boat.id}" onclick="editBoat('${boat.id}')" style="flex: 1;">Editar</button>
            </div>
            <button class="btn btn-danger" data-testid="button-delete-boat-${boat.id}" onclick="deleteBoat('${boat.id}')" style="flex: 1;">Eliminar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function populateBoatSelects() {
  const selects = [
    document.getElementById('calendar-boat-filter'),
    document.getElementById('platform-boat-select')
  ];

  selects.forEach(select => {
    const currentValue = select.value;
    const hasAllOption = select.querySelector('option[value=""]');
    
    select.innerHTML = hasAllOption ? '<option value="">Todos los barcos</option>' : '<option value="">Seleccionar...</option>';
    
    boats.forEach(boat => {
      const option = document.createElement('option');
      option.value = boat.id;
      option.textContent = `${boat.name} (${boat.boatType})`;
      select.appendChild(option);
    });
    
    if (currentValue) select.value = currentValue;
  });
}

// Boat Modal Functions
async function openBoatModal() {
  const modalEl = document.getElementById('boat-modal');
  if (!modalEl) return;
  
  if (currentBoat) {
    // Cargar fotos desde la tabla dedicada para asegurar persistencia
    try {
      const photosResponse = await fetch(`/api/fleet/boats/${currentBoat.id}/photos`);
      if (photosResponse.ok) {
        const photos = await photosResponse.json();
        currentBoat.photos = photos;
      }
    } catch (error) {
      console.error('Error loading boat photos:', error);
    }
  }

  // Llenar campos
  document.getElementById('boat-name').value = currentBoat?.name || '';
  document.getElementById('boat-capacity').value = currentBoat?.capacity || '';
  document.getElementById('boat-type').value = currentBoat?.boatType || '';
  document.getElementById('boat-status').value = currentBoat?.status || 'active';
  document.getElementById('boat-make').value = currentBoat?.make || '';
  document.getElementById('boat-model').value = currentBoat?.model || '';
  document.getElementById('boat-year').value = currentBoat?.year || '';
  document.getElementById('boat-length').value = currentBoat?.length || '';
  document.getElementById('boat-location').value = currentBoat?.location || '';
  document.getElementById('boat-description').value = currentBoat?.description || '';
  document.getElementById('boat-full-description').value = currentBoat?.fullDescription || '';
  document.getElementById('boat-hourly-rate').value = currentBoat?.hourlyRateBase ? (currentBoat.hourlyRateBase / 100).toFixed(2) : '';
  document.getElementById('boat-daily-rate').value = currentBoat?.dailyRateBase ? (currentBoat.dailyRateBase / 100).toFixed(2) : '';
  document.getElementById('boat-features').value = currentBoat?.features ? currentBoat.features.join(', ') : '';
  document.getElementById('boat-amenities').value = currentBoat?.amenities ? currentBoat.amenities.join(', ') : '';
  
  const urlPhotos = (currentBoat?.photos || []).filter(p => !p.startsWith('/uploads/'));
  const photosInput = document.getElementById('boat-photos');
  if (photosInput) photosInput.value = urlPhotos.join('\n');
  
  // Renderizar galería
  renderPhotoGallery(currentBoat?.photos || []);
  
  // MODO VER (Read-only)
  const modalTitle = document.getElementById('modal-title');
  const inputs = modalEl.querySelectorAll('input, select, textarea');
  const uploadZone = document.getElementById('photo-drop-zone');
  const saveBtn = document.getElementById('save-boat-btn');
  const formActions = document.getElementById('form-actions');
  
  if (isViewMode) {
    if (modalTitle) modalTitle.textContent = 'Ver Barco';
    if (saveBtn) saveBtn.style.display = 'none';
    if (formActions) formActions.style.display = 'none';
    if (uploadZone) uploadZone.style.display = 'none';
    inputs.forEach(input => input.disabled = true);
  } else {
    if (modalTitle) modalTitle.textContent = currentBoat ? 'Editar Barco' : 'Agregar Barco';
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (formActions) formActions.style.display = 'flex';
    if (uploadZone) uploadZone.style.display = 'block';
    inputs.forEach(input => input.disabled = false);
  }
  
  // Open using CSS class (no Bootstrap — fleet.html uses custom modal)
  modalEl.classList.add('active');
}

function viewBoat(boatId) {
  isViewMode = true;
  currentBoat = boats.find(b => b.id === boatId);
  if (currentBoat) {
    openBoatModal();
  }
}

function editBoat(boatId) {
  isViewMode = false;
  currentBoat = boats.find(b => b.id === boatId);
  if (currentBoat) {
    openBoatModal();
  }
}

function createNewBoat() {
  isViewMode = false;
  currentBoat = null;
  openBoatModal();
}

function closeBoatModal() {
  const modalEl = document.getElementById('boat-modal');
  if (modalEl) modalEl.classList.remove('active');
  currentBoat = null;
  isViewMode = false;
}

async function saveBoat(e) {
  e.preventDefault();
  
  const boatName = document.getElementById('boat-name').value;
  if (!boatName) {
    alert('❌ El nombre del barco es obligatorio');
    return;
  }

  const features = document.getElementById('boat-features').value
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);
    
  const amenities = document.getElementById('boat-amenities').value
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);
    
  const photos = document.getElementById('boat-photos').value
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean);

  const hourlyRate = parseFloat(document.getElementById('boat-hourly-rate').value);
  const dailyRate = parseFloat(document.getElementById('boat-daily-rate').value);

  const boatData = {
    name: boatName,
    capacity: parseInt(document.getElementById('boat-capacity').value) || 0,
    boatType: document.getElementById('boat-type').value,
    status: document.getElementById('boat-status').value || 'active',
    make: document.getElementById('boat-make').value || null,
    model: document.getElementById('boat-model').value || null,
    year: parseInt(document.getElementById('boat-year').value) || null,
    length: parseInt(document.getElementById('boat-length').value) || null,
    location: document.getElementById('boat-location').value || null,
    description: document.getElementById('boat-description').value || null,
    fullDescription: document.getElementById('boat-full-description').value || null,
    hourlyRateBase: hourlyRate ? Math.round(hourlyRate * 100) : null,
    dailyRateBase: dailyRate ? Math.round(dailyRate * 100) : null,
    features: features.length > 0 ? features : null,
    amenities: amenities.length > 0 ? amenities : null,
    photos: photos.length > 0 ? photos : null
  };

  try {
    const url = currentBoat ? `/api/fleet/boats/${currentBoat.id}` : '/api/fleet/boats';
    const method = currentBoat ? 'PUT' : 'POST';
    
    console.log(`Saving boat to ${url} with method ${method}`, boatData);
    
    const response = await authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boatData)
    });

    if (response.ok) {
      const wasEditing = !!currentBoat;
      closeBoatModal();
      await loadBoats();
      alert(`✅ Barco ${wasEditing ? 'actualizado' : 'agregado'} correctamente`);
    } else {
      const error = await response.json();
      alert(`❌ Error: ${error.message || 'Error al guardar el barco'}`);
    }
  } catch (error) {
    console.error('Error saving boat:', error);
    alert('❌ Error al guardar el barco');
  }
}

// Calendar Functions
async function renderCalendar() {
  const boatId = document.getElementById('calendar-boat-filter').value;
  const monthElement = document.getElementById('calendar-month');
  const calendarView = document.getElementById('calendar-view');

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  monthElement.textContent = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  try {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    const url = `/api/fleet/availability?year=${year}&month=${month}${boatId ? `&boatId=${boatId}` : ''}`;
    
    const response = await authFetch(url);
    const availability = await response.json();

    renderCalendarGrid(availability, boatId);
  } catch (error) {
    console.error('Error loading calendar:', error);
    calendarView.innerHTML = '<p class="error">❌ Error al cargar el calendario</p>';
  }
}

function renderCalendarGrid(availability, boatId) {
  const calendarView = document.getElementById('calendar-view');
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  let html = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-top: 16px;">';
  
  // Day headers
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  dayNames.forEach(day => {
    html += `<div style="font-weight: 700; text-align: center; padding: 8px; background: #f0f0f0; border-radius: 4px;">${day}</div>`;
  });

  // Empty cells before first day
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += '<div></div>';
  }

  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayAvailability = availability.filter(a => a.date === date);
    
    const isAvailable = dayAvailability.length === 0 || dayAvailability.every(a => a.isAvailable);
    const bgColor = isAvailable ? '#d4edda' : '#f8d7da';
    const textColor = isAvailable ? '#155724' : '#721c24';
    
    html += `
      <div style="
        background: ${bgColor};
        border: 1px solid ${textColor}33;
        border-radius: 6px;
        padding: 12px;
        min-height: 80px;
        cursor: pointer;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        <div style="font-weight: 700; color: ${textColor}; margin-bottom: 4px;">${day}</div>
        <div style="font-size: 12px; color: ${textColor};">
          ${isAvailable ? '✅ Disponible' : '🚫 Bloqueado'}
        </div>
        ${dayAvailability.length > 0 ? `
          <div style="font-size: 11px; color: ${textColor}; margin-top: 4px;">
            ${dayAvailability.map(a => a.blockReason || 'Bloqueado').join(', ')}
          </div>
        ` : ''}
      </div>
    `;
  }

  html += '</div>';
  calendarView.innerHTML = html;
}

// Platform Linking Functions
function loadPlatformBoatSelect() {
  // This is already populated by populateBoatSelects()
}

async function loadPlatformIds() {
  const boatId = document.getElementById('platform-boat-select').value;
  const container = document.getElementById('platform-ids-container');

  if (!boatId) {
    container.innerHTML = '<p class="loading">Selecciona un barco para vincular plataformas...</p>';
    return;
  }

  const boat = boats.find(b => b.id === boatId);
  const platformIds = boat?.platformIds || {};

  let html = '';
  PLATFORMS.forEach(platform => {
    html += `
      <div class="platform-row">
        <div class="platform-name">${platform.name}</div>
        <input 
          type="text" 
          class="platform-id-input" 
          data-platform="${platform.id}" 
          data-testid="input-platform-${platform.id}"
          value="${platformIds[platform.id] || ''}" 
          placeholder="ID del barco en ${platform.name}">
        <button class="btn btn-secondary btn-small" onclick="clearPlatformId('${platform.id}')">🗑️</button>
      </div>
    `;
  });

  container.innerHTML = html;
}

function clearPlatformId(platformId) {
  const input = document.querySelector(`input[data-platform="${platformId}"]`);
  if (input) input.value = '';
}

async function savePlatformIds() {
  const boatId = document.getElementById('platform-boat-select').value;
  
  if (!boatId) {
    alert('❌ Selecciona un barco primero');
    return;
  }

  const platformIds = {};
  PLATFORMS.forEach(platform => {
    const input = document.querySelector(`input[data-platform="${platform.id}"]`);
    if (input && input.value.trim()) {
      platformIds[platform.id] = input.value.trim();
    }
  });

  try {
    const response = await authFetch(`/api/fleet/boats/${boatId}/platform-ids`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformIds })
    });

    if (response.ok) {
      await loadBoats();
      alert('✅ Vinculaciones guardadas correctamente');
    } else {
      alert('❌ Error al guardar las vinculaciones');
    }
  } catch (error) {
    console.error('Error saving platform IDs:', error);
    alert('❌ Error al guardar las vinculaciones');
  }
}

// Quick Search Functions
async function performQuickSearch() {
  const date = document.getElementById('search-date').value;
  const capacity = parseInt(document.getElementById('search-capacity').value);
  const type = document.getElementById('search-type').value;
  const resultsContainer = document.getElementById('search-results');

  if (!date) {
    alert('❌ Selecciona una fecha');
    return;
  }

  try {
    let url = `/api/fleet/search?date=${date}`;
    if (capacity) url += `&capacity=${capacity}`;
    if (type) url += `&type=${type}`;

    const response = await authFetch(url);
    const results = await response.json();

    if (results.length === 0) {
      resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">No se encontraron barcos disponibles con estos criterios.</p>';
      return;
    }

    resultsContainer.innerHTML = results.map(boat => {
      const statusClass = boat.available ? '' : 'unavailable';
      
      return `
        <div class="result-card ${statusClass}" data-testid="result-${boat.id}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 18px;">${boat.name}</h3>
              <p style="margin: 0; color: #666; font-size: 14px;">${boat.boatType} • ${boat.capacity} personas</p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 24px; font-weight: 700; color: ${boat.available ? '#28a745' : '#dc3545'};">
                ${boat.available ? '✅' : '❌'}
              </div>
              <div style="font-size: 12px; color: #666;">
                ${boat.available ? 'Disponible' : 'No Disponible'}
              </div>
            </div>
          </div>
          
          ${boat.location ? `<p style="margin: 8px 0; font-size: 14px;">📍 ${boat.location}</p>` : ''}
          ${boat.hourlyRateBase ? `<p style="margin: 8px 0; font-size: 14px;">💵 $${(boat.hourlyRateBase / 100).toFixed(2)}/hora</p>` : ''}
          ${boat.dailyRateBase ? `<p style="margin: 8px 0; font-size: 14px;">💰 $${(boat.dailyRateBase / 100).toFixed(2)}/día</p>` : ''}
          ${boat.blockReason ? `<p style="margin: 8px 0; font-size: 13px; color: #721c24;"><strong>Razón:</strong> ${boat.blockReason}</p>` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error performing search:', error);
    resultsContainer.innerHTML = '<p class="error">❌ Error al realizar la búsqueda</p>';
  }
}

// ===== PHOTO UPLOAD SYSTEM =====
let uploadedPhotos = [];

function initPhotoUpload() {
  const dropZone = document.getElementById('photo-drop-zone');
  const fileInput = document.getElementById('photo-file-input');
  if (!dropZone || !fileInput) return;

  fileInput.multiple = true; // Habilitar selección múltiple
  
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      e.target.value = ''; // Reset input value to allow re-uploading same files
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    // Ensure all dropped files are processed
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) handleFiles(files);
  });

  document.addEventListener('paste', (e) => {
    const modal = document.getElementById('boat-modal');
    if (!modal) return;
    const items = Array.from(e.clipboardData.items);
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  });
}

async function handleFiles(files) {
  if (!currentBoat) {
    alert('Primero guarda el barco antes de subir fotos. Completa la informacion basica y guarda.');
    return;
  }

  const validFiles = files.filter(f => {
    if (!f.type.startsWith('image/')) return false;
    if (f.size > 10 * 1024 * 1024) {
      alert(`La imagen "${f.name}" excede 10MB y fue omitida.`);
      return false;
    }
    return true;
  });

  if (validFiles.length === 0) return;

  const progressEl = document.getElementById('photo-upload-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  progressEl.style.display = 'flex';
  progressFill.style.width = '0%';
  progressText.textContent = `Subiendo 0/${validFiles.length}...`;

  const formData = new FormData();
  validFiles.forEach(f => {
    console.log('Appending photo:', f.name);
    formData.append('photos', f);
  });

  try {
    const response = await fetch(`/api/fleet/boats/${currentBoat.id}/photos`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      progressFill.style.width = '100%';
      progressText.textContent = `${validFiles.length} foto(s) subidas`;

      // Actualizar la lista local de barcos
      const boatIndex = boats.findIndex(b => b.id === currentBoat.id);
      if (boatIndex !== -1) {
        boats[boatIndex].photos = [...(boats[boatIndex].photos || []), ...result.urls];
        currentBoat = boats[boatIndex];
      }
      
      // Renderizar galería y actualizar el campo oculto si existe
      renderPhotoGallery(currentBoat.photos || []);
      
      // Opcional: limpiar mensaje después de 3 segundos
      setTimeout(() => {
        progressEl.style.display = 'none';
      }, 3000);
    } else {
      const error = await response.json();
      alert(`❌ Error al subir: ${error.error || 'Error desconocido'}`);
      progressEl.style.display = 'none';
    }
  } catch (error) {
    console.error('Error uploading photos:', error);
    alert('❌ Error de red al subir fotos');
    progressEl.style.display = 'none';
  }
}

function renderPhotoGallery(photos) {
  const gallery = document.getElementById('photo-gallery');
  if (!gallery) return;
  gallery.innerHTML = '';
  if (!photos || photos.length === 0) return;

  photos.forEach((url, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.setAttribute('data-testid', `photo-thumb-${index}`);

    const img = document.createElement('img');
    img.src = url;
    img.alt = `Foto ${index + 1}`;
    img.onerror = function() {
      this.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23EBEBEB" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23999" font-size="12">Error</text></svg>');
    };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'photo-remove';
    removeBtn.setAttribute('data-testid', `button-remove-photo-${index}`);
    removeBtn.type = 'button';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePhoto(url, index);
    });

    const order = document.createElement('span');
    order.className = 'photo-order';
    order.textContent = index + 1;

    thumb.appendChild(img);
    thumb.appendChild(removeBtn);
    thumb.appendChild(order);
    gallery.appendChild(thumb);
  });
}

async function removePhoto(photoUrl, index) {
  if (!currentBoat) return;
  if (!confirm('Eliminar esta foto?')) return;

  try {
    const response = await fetch(`/api/fleet/boats/${currentBoat.id}/photos`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoUrl })
    });

    if (response.ok) {
      const updatedPhotos = (currentBoat.photos || []).filter(p => p !== photoUrl);
      currentBoat.photos = updatedPhotos;
      const idx = boats.findIndex(b => b.id === currentBoat.id);
      if (idx >= 0) boats[idx].photos = updatedPhotos;
      renderPhotoGallery(updatedPhotos);
    } else {
      alert('Error al eliminar la foto');
    }
  } catch (error) {
    console.error('Remove photo error:', error);
    alert('Error de conexion al eliminar foto');
  }
}

// Logout
async function logout() {
  try {
    await authFetch('/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/';
  }
}
