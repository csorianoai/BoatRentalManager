// ========================================
// CAPTAIN APP - MOBILE PWA
// ========================================

const API_BASE = window.location.origin;
let currentCaptain = null;
let currentPosition = null;
let currentTrip = null;
let gpsWatchId = null;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Check if captain is already logged in
    const storedCaptain = localStorage.getItem('captain');
    if (storedCaptain) {
        currentCaptain = JSON.parse(storedCaptain);
        showScreen('main');
        loadAssignments();
        setupEventListeners();
    } else {
        showScreen('login');
    }
    
    // Setup login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Setup logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Setup back button
    document.getElementById('backToMain').addEventListener('click', () => showScreen('main'));
});

// ========================================
// SCREEN MANAGEMENT
// ========================================

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    const screens = {
        'login': 'loginScreen',
        'main': 'mainScreen',
        'trip': 'tripDetailScreen'
    };
    
    document.getElementById(screens[screenName]).classList.add('active');
    
    if (screenName === 'main') {
        document.getElementById('captainName').textContent = currentCaptain?.name || 'Captain';
    }
}

// ========================================
// LOGIN & AUTHENTICATION
// ========================================

async function handleLogin(e) {
    e.preventDefault();
    const captainId = document.getElementById('captainId').value;
    
    if (!captainId) {
        alert('Por favor ingresa tu Captain ID');
        return;
    }
    
    showLoading(true);
    
    try {
        // Fetch captain info from server
        const response = await fetch(`${API_BASE}/api/captains`);
        const captains = await response.json();
        const captain = captains.find(c => c.id === captainId);
        
        if (!captain) {
            alert('Captain ID no encontrado');
            showLoading(false);
            return;
        }
        
        currentCaptain = captain;
        localStorage.setItem('captain', JSON.stringify(captain));
        
        showScreen('main');
        loadAssignments();
        setupEventListeners();
        showLoading(false);
    } catch (error) {
        console.error('Login error:', error);
        alert('Error al iniciar sesión');
        showLoading(false);
    }
}

function quickLogin(captainId) {
    document.getElementById('captainId').value = captainId;
    document.getElementById('loginForm').dispatchEvent(new Event('submit'));
}

function handleLogout() {
    if (confirm('¿Seguro que deseas cerrar sesión?')) {
        currentCaptain = null;
        localStorage.removeItem('captain');
        stopGPSTracking();
        showScreen('login');
    }
}

// ========================================
// EVENT LISTENERS SETUP
// ========================================

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchTab(tabName);
        });
    });
    
    // Refresh buttons
    document.getElementById('refreshAssignments').addEventListener('click', loadAssignments);
    document.getElementById('refreshHistory').addEventListener('click', loadHistory);
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'assignments') {
        document.getElementById('assignmentsTab').classList.add('active');
        loadAssignments();
    } else if (tabName === 'history') {
        document.getElementById('historyTab').classList.add('active');
        loadHistory();
    }
}

// ========================================
// ASSIGNMENTS
// ========================================

async function loadAssignments() {
    if (!currentCaptain) return;
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/captain/${currentCaptain.id}/assignments?status=pending`);
        const assignments = await response.json();
        
        renderAssignments(assignments);
        showLoading(false);
    } catch (error) {
        console.error('Error loading assignments:', error);
        showLoading(false);
    }
}

function renderAssignments(assignments) {
    const container = document.getElementById('assignmentsList');
    
    if (assignments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-text">No hay asignaciones pendientes</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = assignments.map((assignment, index) => `
        <div class="assignment-card" onclick="openTripDetail('${assignment.id}')" data-testid="assignment-card-${index}">
            <div class="card-header">
                <div class="card-title">${assignment.customer_name}</div>
                <span class="status-badge ${assignment.status}">${getStatusText(assignment.status)}</span>
            </div>
            <div class="card-details">
                <div class="detail-row">
                    <strong>📅 Fecha:</strong> ${formatDate(assignment.booking_date)}
                </div>
                <div class="detail-row">
                    <strong>🕐 Hora:</strong> ${assignment.start_time}
                </div>
                <div class="detail-row">
                    <strong>⛵ Tipo:</strong> ${assignment.boat_type}
                </div>
                <div class="detail-row">
                    <strong>📞 Teléfono:</strong> ${assignment.customer_phone}
                </div>
                ${assignment.trip_status ? `
                    <div class="detail-row">
                        <strong>🚢 Estado:</strong> <span class="text-success">${getTripStatusText(assignment.trip_status)}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// ========================================
// HISTORY
// ========================================

async function loadHistory() {
    if (!currentCaptain) return;
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/captain/${currentCaptain.id}/trip-logs?limit=20`);
        const history = await response.json();
        
        renderHistory(history);
        showLoading(false);
    } catch (error) {
        console.error('Error loading history:', error);
        showLoading(false);
    }
}

function renderHistory(history) {
    const container = document.getElementById('historyList');
    
    if (history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📂</div>
                <div class="empty-state-text">No hay historial de viajes</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = history.map((trip, index) => `
        <div class="history-card" data-testid="history-card-${index}">
            <div class="card-header">
                <div class="card-title">${trip.customer_name}</div>
                <span class="status-badge completed">Completado</span>
            </div>
            <div class="card-details">
                <div class="detail-row">
                    <strong>📅 Fecha:</strong> ${formatDate(trip.booking_date)}
                </div>
                <div class="detail-row">
                    <strong>🕐 Check-in:</strong> ${formatDateTime(trip.check_in_time)}
                </div>
                <div class="detail-row">
                    <strong>🕐 Check-out:</strong> ${formatDateTime(trip.check_out_time)}
                </div>
                ${trip.customer_satisfaction ? `
                    <div class="detail-row">
                        <strong>⭐ Satisfacción:</strong> ${trip.customer_satisfaction}/5
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// ========================================
// TRIP DETAIL
// ========================================

async function openTripDetail(bookingId) {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/captain/${currentCaptain.id}/assignments`);
        const assignments = await response.json();
        const trip = assignments.find(a => a.id === bookingId);
        
        if (!trip) {
            alert('Viaje no encontrado');
            showLoading(false);
            return;
        }
        
        currentTrip = trip;
        renderTripDetail(trip);
        showScreen('trip');
        showLoading(false);
        
        // Start GPS tracking when viewing trip detail
        startGPSTracking();
    } catch (error) {
        console.error('Error loading trip detail:', error);
        showLoading(false);
    }
}

function renderTripDetail(trip) {
    const tripInfo = document.getElementById('tripInfo');
    const tripActions = document.getElementById('tripActions');
    
    // Render trip info
    tripInfo.innerHTML = `
        <h3>Información del Viaje</h3>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Cliente:</span>
                <span class="info-value">${trip.customer_name}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Teléfono:</span>
                <span class="info-value">${trip.customer_phone}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Email:</span>
                <span class="info-value">${trip.customer_email || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Fecha:</span>
                <span class="info-value">${formatDate(trip.booking_date)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Hora de inicio:</span>
                <span class="info-value">${trip.start_time}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Duración:</span>
                <span class="info-value">${trip.duration_hours} horas</span>
            </div>
            <div class="info-item">
                <span class="info-label">Tipo de tour:</span>
                <span class="info-value">${trip.boat_type}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Monto:</span>
                <span class="info-value">$${trip.total_amount}</span>
            </div>
        </div>
    `;
    
    // Render trip actions based on status
    const hasCheckedIn = trip.check_in_time;
    const hasCheckedOut = trip.check_out_time;
    
    if (!hasCheckedIn) {
        tripActions.innerHTML = `
            <div class="action-card">
                <h4>📍 Check-In</h4>
                <p>Presiona el botón cuando llegues al punto de encuentro</p>
                <div id="checkinLocation" class="location-info">
                    GPS: Obteniendo ubicación...
                </div>
                <button class="btn btn-success mt-2" onclick="handleCheckIn()" data-testid="button-check-in">
                    ✓ Hacer Check-In
                </button>
            </div>
        `;
    } else if (!hasCheckedOut) {
        tripActions.innerHTML = `
            <div class="action-card">
                <h4>✅ Check-In Completado</h4>
                <p>Hora: ${formatDateTime(trip.check_in_time)}</p>
                <h4 class="mt-2">📍 Check-Out</h4>
                <p>Presiona el botón cuando finalices el tour</p>
                <div id="checkoutLocation" class="location-info">
                    GPS: Obteniendo ubicación...
                </div>
                <button class="btn btn-warning mt-2" onclick="handleCheckOut()" data-testid="button-check-out">
                    🏁 Hacer Check-Out
                </button>
            </div>
        `;
    } else {
        tripActions.innerHTML = `
            <div class="action-card">
                <h4>✅ Viaje Completado</h4>
                <p>Check-In: ${formatDateTime(trip.check_in_time)}</p>
                <p>Check-Out: ${formatDateTime(trip.check_out_time)}</p>
                <button class="btn btn-primary mt-2" onclick="showTripReportForm()" data-testid="button-create-report">
                    📝 Crear Reporte
                </button>
            </div>
        `;
    }
}

// ========================================
// GPS TRACKING
// ========================================

function startGPSTracking() {
    if (!navigator.geolocation) {
        console.log('GPS no disponible');
        return;
    }
    
    // Show GPS status
    document.getElementById('gpsStatus').style.display = 'block';
    
    gpsWatchId = navigator.geolocation.watchPosition(
        (position) => {
            currentPosition = {
                latitude: position.coords.latitude.toFixed(6),
                longitude: position.coords.longitude.toFixed(6),
                accuracy: position.coords.accuracy.toFixed(1)
            };
            
            // Update GPS status
            document.getElementById('gpsAccuracy').textContent = `±${currentPosition.accuracy}m`;
            
            // Update location displays
            const checkinLoc = document.getElementById('checkinLocation');
            const checkoutLoc = document.getElementById('checkoutLocation');
            
            if (checkinLoc) {
                checkinLoc.innerHTML = `
                    GPS: ${currentPosition.latitude}, ${currentPosition.longitude}<br>
                    Precisión: ±${currentPosition.accuracy}m
                `;
            }
            
            if (checkoutLoc) {
                checkoutLoc.innerHTML = `
                    GPS: ${currentPosition.latitude}, ${currentPosition.longitude}<br>
                    Precisión: ±${currentPosition.accuracy}m
                `;
            }
        },
        (error) => {
            console.error('GPS error:', error);
            document.getElementById('gpsAccuracy').textContent = 'Error';
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

function stopGPSTracking() {
    if (gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        document.getElementById('gpsStatus').style.display = 'none';
    }
}

// ========================================
// CHECK-IN / CHECK-OUT
// ========================================

async function handleCheckIn() {
    if (!currentPosition) {
        alert('Esperando señal GPS. Por favor intenta nuevamente.');
        return;
    }
    
    if (!confirm('¿Confirmar Check-In?')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/captain/check-in`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bookingId: currentTrip.id,
                captainId: currentCaptain.id,
                latitude: currentPosition.latitude,
                longitude: currentPosition.longitude
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('✅ Check-In exitoso');
            openTripDetail(currentTrip.id); // Refresh trip detail
        } else {
            alert('Error al hacer check-in: ' + result.error);
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Check-in error:', error);
        alert('Error al hacer check-in');
        showLoading(false);
    }
}

async function handleCheckOut() {
    if (!currentPosition) {
        alert('Esperando señal GPS. Por favor intenta nuevamente.');
        return;
    }
    
    if (!confirm('¿Confirmar Check-Out?')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/captain/check-out`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bookingId: currentTrip.id,
                latitude: currentPosition.latitude,
                longitude: currentPosition.longitude
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('✅ Check-Out exitoso');
            openTripDetail(currentTrip.id); // Refresh trip detail
        } else {
            alert('Error al hacer check-out: ' + result.error);
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Check-out error:', error);
        alert('Error al hacer check-out');
        showLoading(false);
    }
}

// ========================================
// TRIP REPORT
// ========================================

function showTripReportForm() {
    const reportSection = document.getElementById('tripReport');
    reportSection.style.display = 'block';
    
    reportSection.innerHTML = `
        <h3>📝 Reporte de Viaje</h3>
        <form id="reportForm" class="report-form">
            <div class="form-group">
                <label>🌤️ Condiciones Climáticas</label>
                <select id="weatherConditions" required>
                    <option value="">Seleccionar...</option>
                    <option value="Soleado">☀️ Soleado</option>
                    <option value="Parcialmente nublado">⛅ Parcialmente nublado</option>
                    <option value="Nublado">☁️ Nublado</option>
                    <option value="Lluvioso">🌧️ Lluvioso</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>🌊 Condiciones del Mar</label>
                <select id="seaConditions" required>
                    <option value="">Seleccionar...</option>
                    <option value="Calmado">😌 Calmado</option>
                    <option value="Moderado">🌊 Moderado</option>
                    <option value="Agitado">⚠️ Agitado</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>⛽ Combustible Usado (litros)</label>
                <input type="number" id="fuelUsed" min="0" step="0.1" placeholder="0" data-testid="input-fuel-used">
            </div>
            
            <div class="form-group">
                <label>👥 Pasajeros (cantidad real)</label>
                <input type="number" id="passengersActual" min="1" required data-testid="input-passengers">
            </div>
            
            <div class="form-group">
                <label>⭐ Satisfacción del Cliente</label>
                <div class="rating-stars" id="ratingStars">
                    ${[1, 2, 3, 4, 5].map(rating => `
                        <span class="star empty" data-rating="${rating}" onclick="setRating(${rating})">★</span>
                    `).join('')}
                </div>
                <input type="hidden" id="customerSatisfaction" required>
            </div>
            
            <div class="form-group">
                <label>⚠️ Problemas Reportados</label>
                <textarea id="issuesReported" placeholder="Ninguno" data-testid="textarea-issues"></textarea>
            </div>
            
            <div class="form-group">
                <label>📝 Notas Adicionales</label>
                <textarea id="notes" placeholder="Comentarios opcionales..." data-testid="textarea-notes"></textarea>
            </div>
            
            <button type="submit" class="btn btn-primary" data-testid="button-submit-report">
                ✅ Enviar Reporte
            </button>
        </form>
    `;
    
    document.getElementById('reportForm').addEventListener('submit', handleSubmitReport);
    
    // Scroll to form
    reportSection.scrollIntoView({ behavior: 'smooth' });
}

function setRating(rating) {
    document.getElementById('customerSatisfaction').value = rating;
    
    document.querySelectorAll('.star').forEach((star, index) => {
        if (index < rating) {
            star.classList.remove('empty');
            star.classList.add('filled');
        } else {
            star.classList.remove('filled');
            star.classList.add('empty');
        }
    });
}

async function handleSubmitReport(e) {
    e.preventDefault();
    
    const satisfaction = document.getElementById('customerSatisfaction').value;
    if (!satisfaction) {
        alert('Por favor califica la satisfacción del cliente');
        return;
    }
    
    showLoading(true);
    
    const reportData = {
        bookingId: currentTrip.id,
        captainId: currentCaptain.id,
        tripLogId: currentTrip.trip_log_id,
        weatherConditions: document.getElementById('weatherConditions').value,
        seaConditions: document.getElementById('seaConditions').value,
        fuelUsed: parseInt(document.getElementById('fuelUsed').value) || 0,
        passengersActual: parseInt(document.getElementById('passengersActual').value),
        issuesReported: document.getElementById('issuesReported').value,
        customerSatisfaction: parseInt(satisfaction),
        notes: document.getElementById('notes').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/captain/trip-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reportData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('✅ Reporte enviado exitosamente');
            showScreen('main');
            loadAssignments();
        } else {
            alert('Error al enviar reporte: ' + result.error);
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Report submission error:', error);
        alert('Error al enviar reporte');
        showLoading(false);
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'N/A';
    const date = new Date(dateTimeString);
    return date.toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'confirmed': 'Confirmado',
        'in_progress': 'En Progreso',
        'completed': 'Completado',
        'cancelled': 'Cancelado'
    };
    return statusMap[status] || status;
}

function getTripStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'in_progress': 'En Progreso',
        'completed': 'Completado'
    };
    return statusMap[status] || status;
}

// Make functions available globally
window.quickLogin = quickLogin;
window.openTripDetail = openTripDetail;
window.handleCheckIn = handleCheckIn;
window.handleCheckOut = handleCheckOut;
window.showTripReportForm = showTripReportForm;
window.setRating = setRating;
