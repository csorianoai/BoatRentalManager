// Marine Conditions Frontend Controller

let marineData = null;
let autoRefreshInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadMarineData();
    startAutoRefresh();
    
    // Setup refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        await loadMarineData();
    });
    
    // Setup theme toggle (if exists)
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            document.body.classList.toggle('light-mode');
        });
    }
});

/**
 * Load complete marine data from API
 */
async function loadMarineData() {
    try {
        showLoading(true);
        
        const response = await fetch('/api/marine/summary');
        if (!response.ok) throw new Error('Failed to fetch marine data');
        
        marineData = await response.json();
        
        renderMarineData();
        showLoading(false);
        
    } catch (error) {
        console.error('Error loading marine data:', error);
        showError('Error al cargar condiciones marítimas. Reintentando...');
        
        // Retry after 5 seconds
        setTimeout(loadMarineData, 5000);
    }
}

/**
 * Render all marine data to the page
 */
function renderMarineData() {
    if (!marineData) return;
    
    // Update header
    document.getElementById('location').textContent = marineData.location;
    document.getElementById('timestamp').textContent = 
        `Última actualización: ${formatTimestamp(marineData.timestamp)}`;
    
    // Render safety rating
    renderSafetyRating(marineData.safetyRating);
    
    // Render current conditions
    renderCurrentConditions(marineData.current);
    
    // Render wave data from buoy
    renderWaveData(marineData.buoy);
    
    // Render forecast
    renderForecast(marineData.forecast);
    
    // Render tides
    renderTides(marineData.tides);
    
    // Render alerts
    renderAlerts(marineData.alerts);
}

/**
 * Render safety rating section
 */
function renderSafetyRating(rating) {
    const container = document.getElementById('safetyRating');
    const scoreEl = document.getElementById('safetyScore');
    const recommendationEl = document.getElementById('safetyRecommendation');
    const conditionsListEl = document.getElementById('conditionsList');
    
    // Set color class
    container.className = `safety-rating ${rating.color}`;
    
    // Set content
    scoreEl.textContent = rating.score;
    recommendationEl.textContent = rating.recommendation;
    
    // Render conditions badges
    conditionsListEl.innerHTML = '';
    if (rating.conditions && rating.conditions.length > 0) {
        rating.conditions.forEach(condition => {
            const badge = document.createElement('div');
            badge.className = 'condition-badge';
            badge.textContent = condition;
            conditionsListEl.appendChild(badge);
        });
    }
}

/**
 * Render current conditions
 */
function renderCurrentConditions(current) {
    document.getElementById('airTemp').textContent = current.temperature.air || '--';
    document.getElementById('waterTemp').textContent = current.temperature.water || '--';
    document.getElementById('visibility').textContent = current.visibility.distance || '--';
    document.getElementById('conditions').textContent = current.conditions.description || '--';
    document.getElementById('windSpeed').textContent = current.wind.speed || '--';
    document.getElementById('windDirection').textContent = current.wind.direction || '--';
    document.getElementById('windGust').textContent = current.wind.gust || '--';
}

/**
 * Render wave data from buoy
 */
function renderWaveData(buoy) {
    if (!buoy || buoy.error) {
        document.getElementById('waveHeight').textContent = '--';
        document.getElementById('wavePeriod').textContent = '--';
        document.getElementById('waveDirection').textContent = '--';
        return;
    }
    
    document.getElementById('waveHeight').textContent = 
        buoy.wave.height ? buoy.wave.height.toFixed(1) : '--';
    document.getElementById('wavePeriod').textContent = 
        buoy.wave.period ? buoy.wave.period.toFixed(1) : '--';
    document.getElementById('waveDirection').textContent = 
        buoy.wave.direction || '--';
}

/**
 * Render forecast periods
 */
function renderForecast(forecast) {
    const container = document.getElementById('forecastGrid');
    container.innerHTML = '';
    
    if (!forecast || !forecast.periods || forecast.periods.length === 0) {
        container.innerHTML = '<div class="no-alerts">Pronóstico no disponible</div>';
        return;
    }
    
    forecast.periods.forEach(period => {
        const periodDiv = document.createElement('div');
        periodDiv.className = 'forecast-period';
        periodDiv.innerHTML = `
            <div class="period-name">${period.name}</div>
            <div class="temp">${period.temperature}°${period.temperatureUnit}</div>
            <div class="description">${period.shortForecast}</div>
            <div class="description" style="margin-top: 0.5rem;">
                💨 ${period.windSpeed} ${period.windDirection}
            </div>
        `;
        container.appendChild(periodDiv);
    });
}

/**
 * Render tides table
 */
function renderTides(tides) {
    const tbody = document.getElementById('tidesTableBody');
    tbody.innerHTML = '';
    
    if (!tides || tides.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay datos de mareas disponibles</td></tr>';
        return;
    }
    
    tides.forEach(tide => {
        const row = document.createElement('tr');
        const timeFormatted = formatTideTime(tide.time);
        const typeClass = tide.type === 'High' ? 'tide-high' : 'tide-low';
        const typeSpanish = tide.type === 'High' ? 'Alta' : 'Baja';
        
        row.innerHTML = `
            <td>${timeFormatted}</td>
            <td class="${typeClass}">${typeSpanish}</td>
            <td>${tide.height.toFixed(2)} ${tide.unit}</td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Render alerts
 */
function renderAlerts(alerts) {
    const container = document.getElementById('alertsContainer');
    container.innerHTML = '';
    
    if (!alerts || !alerts.alerts || alerts.alerts.length === 0) {
        container.innerHTML = '<div class="no-alerts">✅ No hay alertas activas</div>';
        return;
    }
    
    alerts.alerts.forEach(alert => {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert-card';
        alertDiv.innerHTML = `
            <h4>⚠️ ${alert.event}</h4>
            <div class="alert-description">${alert.headline || alert.description}</div>
            ${alert.instruction ? `<div class="alert-description" style="margin-top: 1rem;"><strong>Instrucciones:</strong> ${alert.instruction}</div>` : ''}
        `;
        container.appendChild(alertDiv);
    });
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    return date.toLocaleDateString('es-ES', options);
}

/**
 * Format tide time for display
 */
function formatTideTime(timeStr) {
    const date = new Date(timeStr);
    const options = {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    return date.toLocaleDateString('es-ES', options);
}

/**
 * Show/hide loading spinner
 */
function showLoading(show) {
    document.getElementById('loadingSpinner').style.display = show ? 'block' : 'none';
    document.getElementById('marineContent').style.display = show ? 'none' : 'block';
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.getElementById('marineContent');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    container.insertBefore(errorDiv, container.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

/**
 * Start auto-refresh every 10 minutes
 */
function startAutoRefresh() {
    // Clear existing interval
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    // Refresh every 10 minutes
    autoRefreshInterval = setInterval(async () => {
        console.log('🔄 Auto-refreshing marine conditions...');
        await loadMarineData();
    }, 10 * 60 * 1000); // 10 minutes
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
});
