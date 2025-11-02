let boats = [];
let demandForecastChart = null;
let competitorComparisonChart = null;

async function authFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (response.status === 401) {
            window.location.href = '/api/login';
            throw new Error('Unauthorized');
        }
        return response;
    } catch (error) {
        if (error.message === 'Unauthorized') {
            throw error;
        }
        console.error('Fetch error:', error);
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    loadBoats();
    loadMarketInsights();
    loadRecommendations();
    loadOpportunities();
    loadCompetitorData();
    loadMarketEvents();
    setupEventListeners();
    setDefaultDate();
});

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const recDate = document.getElementById('rec-date');
    const compDate = document.getElementById('comp-date');
    const eventStart = document.getElementById('event-start');
    const eventEnd = document.getElementById('event-end');
    
    if (recDate) recDate.value = today;
    if (compDate) compDate.value = today;
    if (eventStart) eventStart.value = today;
    if (eventEnd) eventEnd.value = today;
}

function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

function setupEventListeners() {
    document.getElementById('refresh-all-btn').addEventListener('click', refreshAll);
    document.getElementById('load-insights-btn').addEventListener('click', loadMarketInsights);
    document.getElementById('generate-recommendation-btn').addEventListener('click', showRecommendationForm);
    document.getElementById('cancel-rec-form').addEventListener('click', hideRecommendationForm);
    document.getElementById('recommendation-form').addEventListener('submit', submitRecommendation);
    document.getElementById('load-opportunities-btn').addEventListener('click', loadOpportunities);
    document.getElementById('add-competitor-btn').addEventListener('click', showCompetitorForm);
    document.getElementById('cancel-comp-form').addEventListener('click', hideCompetitorForm);
    document.getElementById('competitor-form').addEventListener('submit', submitCompetitorData);
    document.getElementById('add-event-btn').addEventListener('click', showEventForm);
    document.getElementById('cancel-event-form').addEventListener('click', hideEventForm);
    document.getElementById('event-form').addEventListener('submit', submitMarketEvent);
}

async function refreshAll() {
    await Promise.all([
        loadMarketInsights(),
        loadRecommendations(),
        loadOpportunities(),
        loadCompetitorData(),
        loadMarketEvents()
    ]);
    showNotification('Datos actualizados correctamente', 'success');
}

async function loadBoats() {
    try {
        const response = await authFetch('/api/pricing/boats');
        boats = await response.json();
        
        const recBoatSelect = document.getElementById('rec-boat');
        recBoatSelect.innerHTML = '<option value="">Seleccionar...</option>';
        boats.forEach(boat => {
            const option = document.createElement('option');
            option.value = boat.id;
            option.textContent = `${boat.name} (${boat.capacity} personas)`;
            recBoatSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading boats:', error);
    }
}

async function loadMarketInsights() {
    try {
        const region = document.getElementById('insights-region').value;
        const response = await authFetch(`/api/pricing/market-insights?region=${region}`);
        const insights = await response.json();
        
        document.getElementById('demand-level').textContent = insights.currentDemandLevel;
        document.getElementById('avg-demand-score').textContent = insights.avgDemandScore;
        document.getElementById('regional-multiplier').textContent = `${insights.regionalMultiplier}x`;
        document.getElementById('active-events-count').textContent = insights.activeEvents;
        document.getElementById('competitors-count').textContent = insights.competitorAnalysis.totalCompetitors;
        document.getElementById('avg-competitor-price').textContent = Math.round(insights.competitorAnalysis.avgPriceHalfDay);
        
        const demandLevelEl = document.getElementById('demand-level');
        demandLevelEl.className = 'insight-value';
        if (insights.currentDemandLevel === 'High') {
            demandLevelEl.style.color = '#27ae60';
        } else if (insights.currentDemandLevel === 'Medium') {
            demandLevelEl.style.color = '#f39c12';
        } else {
            demandLevelEl.style.color = '#e74c3c';
        }
        
        await loadDemandForecastChart(region);
        await loadCompetitorComparisonChart(region);
        
    } catch (error) {
        console.error('Error loading market insights:', error);
        showNotification('Error al cargar insights de mercado', 'error');
    }
}

async function loadDemandForecastChart(region) {
    try {
        const forecasts = [];
        const today = new Date();
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            const response = await authFetch(`/api/pricing/demand-forecast?region=${region}&boatType=yacht&date=${dateStr}`);
            const forecast = await response.json();
            forecasts.push({
                date: dateStr,
                score: forecast.demandScore
            });
        }
        
        const ctx = document.getElementById('demand-forecast-chart').getContext('2d');
        
        if (demandForecastChart) {
            demandForecastChart.destroy();
        }
        
        demandForecastChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: forecasts.map(f => {
                    const d = new Date(f.date);
                    return d.toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' });
                }),
                datasets: [{
                    label: 'Score de Demanda',
                    data: forecasts.map(f => f.score),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Score (0-100)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading demand forecast chart:', error);
    }
}

async function loadCompetitorComparisonChart(region) {
    try {
        const response = await authFetch(`/api/pricing/competitor-data?region=${region}`);
        const competitorData = await response.json();
        
        if (competitorData.length === 0) {
            return;
        }
        
        const ctx = document.getElementById('competitor-comparison-chart').getContext('2d');
        
        if (competitorComparisonChart) {
            competitorComparisonChart.destroy();
        }
        
        const labels = competitorData.slice(0, 10).map(c => c.competitor_name);
        const halfDayPrices = competitorData.slice(0, 10).map(c => parseFloat(c.price_half_day) || 0);
        const fullDayPrices = competitorData.slice(0, 10).map(c => parseFloat(c.price_full_day) || 0);
        
        competitorComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Precio Medio Día',
                        data: halfDayPrices,
                        backgroundColor: 'rgba(102, 126, 234, 0.7)',
                    },
                    {
                        label: 'Precio Día Completo',
                        data: fullDayPrices,
                        backgroundColor: 'rgba(118, 75, 162, 0.7)',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Precio ($)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading competitor comparison chart:', error);
    }
}

function showRecommendationForm() {
    document.getElementById('recommendation-form-container').style.display = 'block';
    document.getElementById('generate-recommendation-btn').style.display = 'none';
}

function hideRecommendationForm() {
    document.getElementById('recommendation-form-container').style.display = 'none';
    document.getElementById('generate-recommendation-btn').style.display = 'inline-block';
    document.getElementById('recommendation-form').reset();
    setDefaultDate();
}

async function submitRecommendation(e) {
    e.preventDefault();
    
    const data = {
        boatId: document.getElementById('rec-boat').value,
        date: document.getElementById('rec-date').value,
        durationHours: parseInt(document.getElementById('rec-duration').value),
        region: document.getElementById('rec-region').value
    };
    
    try {
        const response = await authFetch('/api/pricing/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        hideRecommendationForm();
        await loadRecommendations();
        showNotification('Recomendación generada exitosamente', 'success');
        
    } catch (error) {
        console.error('Error generating recommendation:', error);
        showNotification('Error al generar recomendación', 'error');
    }
}

async function loadRecommendations() {
    try {
        const response = await authFetch('/api/pricing/recommendations?limit=20');
        const recommendations = await response.json();
        
        const container = document.getElementById('recommendations-list');
        
        if (recommendations.length === 0) {
            container.innerHTML = '<p class="loading">No hay recomendaciones disponibles. Genera una nueva recomendación.</p>';
            return;
        }
        
        container.innerHTML = recommendations.map(rec => {
            const factors = typeof rec.factors === 'string' ? JSON.parse(rec.factors) : rec.factors;
            const priceChange = rec.recommended_price - rec.base_price;
            const priceChangePercent = ((priceChange / rec.base_price) * 100).toFixed(1);
            
            return `
                <div class="adjustment-card">
                    <div class="adjustment-header">
                        <div>
                            <div class="adjustment-title">${rec.boat_name || 'Barco'} - ${rec.recommended_date}</div>
                            <p style="color: #666; margin-top: 5px;">
                                ${rec.duration_hours} horas | Confianza: ${(factors.confidence * 100).toFixed(0)}%
                            </p>
                        </div>
                        <div>
                            <span class="adjustment-badge ${priceChange > 0 ? 'active' : 'inactive'}">
                                ${priceChange > 0 ? '+' : ''}$${priceChange.toFixed(0)} (${priceChangePercent > 0 ? '+' : ''}${priceChangePercent}%)
                            </span>
                        </div>
                    </div>
                    <div class="adjustment-details">
                        <div>
                            <strong>Precio Base:</strong> $${rec.base_price}
                        </div>
                        <div>
                            <strong>Precio Recomendado:</strong> <span style="color: #27ae60; font-size: 1.2em;">$${rec.recommended_price}</span>
                        </div>
                        <div>
                            <strong>Demanda:</strong> ${factors.demandScore}/100
                        </div>
                        <div>
                            <strong>Mult. Regional:</strong> ${factors.regionalMultiplier}x
                        </div>
                        <div>
                            <strong>Factor Clima:</strong> ${factors.weatherFactor}x
                        </div>
                        <div>
                            <strong>Factor Competencia:</strong> ${factors.competitiveFactor}x
                        </div>
                    </div>
                    <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                        <small>
                            Generado: ${new Date(rec.created_at).toLocaleString('es-ES')}
                        </small>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading recommendations:', error);
        const container = document.getElementById('recommendations-list');
        container.innerHTML = '<p class="loading">Error al cargar recomendaciones.</p>';
    }
}

async function loadOpportunities() {
    try {
        const region = document.getElementById('opp-region').value;
        const response = await authFetch(`/api/pricing/opportunities?region=${region}`);
        const opportunities = await response.json();
        
        const container = document.getElementById('opportunities-list');
        
        if (opportunities.length === 0) {
            container.innerHTML = '<p class="loading">No se encontraron oportunidades en este momento.</p>';
            return;
        }
        
        container.innerHTML = opportunities.map(opp => {
            const priorityColors = {
                critical: '#e74c3c',
                high: '#f39c12',
                medium: '#3498db',
                low: '#95a5a6'
            };
            
            const typeIcons = {
                high_demand: '📈',
                low_demand: '📉',
                event_opportunity: '🎉',
                underpriced: '💰',
                overpriced: '⚠️'
            };
            
            return `
                <div class="adjustment-card" style="border-left: 4px solid ${priorityColors[opp.priority]}">
                    <div class="adjustment-header">
                        <div>
                            <div class="adjustment-title">
                                ${typeIcons[opp.type] || '🎯'} 
                                ${opp.type.replace(/_/g, ' ').toUpperCase()}
                            </div>
                            <p style="color: #666; margin-top: 5px;">
                                ${opp.date || opp.boatName || ''}
                                ${opp.eventName ? ' - ' + opp.eventName : ''}
                            </p>
                        </div>
                        <span class="adjustment-badge" style="background: ${priorityColors[opp.priority]}; color: white;">
                            ${opp.priority.toUpperCase()}
                        </span>
                    </div>
                    <div class="adjustment-details">
                        ${opp.demandScore !== undefined ? `
                            <div><strong>Demanda:</strong> ${opp.demandScore}/100</div>
                        ` : ''}
                        ${opp.ourPrice !== undefined ? `
                            <div><strong>Nuestro Precio:</strong> $${opp.ourPrice}</div>
                            <div><strong>Promedio Competencia:</strong> $${opp.competitorAvg}</div>
                        ` : ''}
                        <div><strong>Revenue Esperado:</strong> ${opp.expectedRevenue}</div>
                    </div>
                    <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                        <strong>Acción Recomendada:</strong>
                        <p style="margin: 5px 0 0 0;">${opp.recommendedAction}</p>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading opportunities:', error);
        const container = document.getElementById('opportunities-list');
        container.innerHTML = '<p class="loading">Error al cargar oportunidades.</p>';
    }
}

function showCompetitorForm() {
    document.getElementById('competitor-form-container').style.display = 'block';
    document.getElementById('add-competitor-btn').style.display = 'none';
}

function hideCompetitorForm() {
    document.getElementById('competitor-form-container').style.display = 'none';
    document.getElementById('add-competitor-btn').style.display = 'inline-block';
    document.getElementById('competitor-form').reset();
    setDefaultDate();
}

async function submitCompetitorData(e) {
    e.preventDefault();
    
    const data = {
        competitorName: document.getElementById('comp-name').value,
        region: document.getElementById('comp-region').value,
        boatType: document.getElementById('comp-boat-type').value || null,
        capacity: document.getElementById('comp-capacity').value ? parseInt(document.getElementById('comp-capacity').value) : null,
        priceHalfDay: document.getElementById('comp-price-half').value ? parseFloat(document.getElementById('comp-price-half').value) : null,
        priceFullDay: document.getElementById('comp-price-full').value ? parseFloat(document.getElementById('comp-price-full').value) : null,
        recordedDate: document.getElementById('comp-date').value,
        source: document.getElementById('comp-source').value || 'manual',
        notes: document.getElementById('comp-notes').value || null
    };
    
    try {
        const response = await authFetch('/api/pricing/competitor-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        await response.json();
        
        hideCompetitorForm();
        await loadCompetitorData();
        showNotification('Datos de competidor agregados exitosamente', 'success');
        
    } catch (error) {
        console.error('Error adding competitor data:', error);
        showNotification('Error al agregar datos de competidor', 'error');
    }
}

async function loadCompetitorData() {
    try {
        const response = await authFetch('/api/pricing/competitor-data');
        const data = await response.json();
        
        const container = document.getElementById('competitor-data-table');
        
        if (data.length === 0) {
            container.innerHTML = '<p class="loading">No hay datos de competidores. Agrega datos para comenzar.</p>';
            return;
        }
        
        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #667eea; color: white;">
                        <th style="padding: 15px; text-align: left;">Competidor</th>
                        <th style="padding: 15px; text-align: left;">Región</th>
                        <th style="padding: 15px; text-align: left;">Tipo Barco</th>
                        <th style="padding: 15px; text-align: right;">Capacidad</th>
                        <th style="padding: 15px; text-align: right;">Medio Día</th>
                        <th style="padding: 15px; text-align: right;">Día Completo</th>
                        <th style="padding: 15px; text-align: left;">Fecha</th>
                        <th style="padding: 15px; text-align: left;">Fuente</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(comp => `
                        <tr style="border-bottom: 1px solid #e0e0e0;">
                            <td style="padding: 15px;">${comp.competitor_name}</td>
                            <td style="padding: 15px;">${comp.region || '-'}</td>
                            <td style="padding: 15px;">${comp.boat_type || '-'}</td>
                            <td style="padding: 15px; text-align: right;">${comp.capacity || '-'}</td>
                            <td style="padding: 15px; text-align: right; color: #27ae60;">
                                ${comp.price_half_day ? '$' + parseFloat(comp.price_half_day).toFixed(0) : '-'}
                            </td>
                            <td style="padding: 15px; text-align: right; color: #27ae60;">
                                ${comp.price_full_day ? '$' + parseFloat(comp.price_full_day).toFixed(0) : '-'}
                            </td>
                            <td style="padding: 15px;">
                                ${comp.recorded_date ? new Date(comp.recorded_date).toLocaleDateString('es-ES') : '-'}
                            </td>
                            <td style="padding: 15px;">${comp.source || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading competitor data:', error);
        const container = document.getElementById('competitor-data-table');
        container.innerHTML = '<p class="loading">Error al cargar datos de competidores.</p>';
    }
}

function showEventForm() {
    document.getElementById('event-form-container').style.display = 'block';
    document.getElementById('add-event-btn').style.display = 'none';
}

function hideEventForm() {
    document.getElementById('event-form-container').style.display = 'none';
    document.getElementById('add-event-btn').style.display = 'inline-block';
    document.getElementById('event-form').reset();
    setDefaultDate();
}

async function submitMarketEvent(e) {
    e.preventDefault();
    
    const data = {
        eventName: document.getElementById('event-name').value,
        region: document.getElementById('event-region').value,
        startDate: document.getElementById('event-start').value,
        endDate: document.getElementById('event-end').value,
        priceMultiplier: parseFloat(document.getElementById('event-multiplier').value),
        eventType: document.getElementById('event-type').value,
        impactLevel: document.getElementById('event-impact').value
    };
    
    try {
        const response = await authFetch('/api/pricing/market-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        await response.json();
        
        hideEventForm();
        await loadMarketEvents();
        showNotification('Evento de mercado agregado exitosamente', 'success');
        
    } catch (error) {
        console.error('Error adding market event:', error);
        showNotification('Error al agregar evento de mercado', 'error');
    }
}

async function loadMarketEvents() {
    try {
        const response = await authFetch('/api/pricing/market-events');
        const events = await response.json();
        
        const container = document.getElementById('events-list');
        
        if (events.length === 0) {
            container.innerHTML = '<p class="loading">No hay eventos de mercado activos. Agrega eventos para planificar precios.</p>';
            return;
        }
        
        container.innerHTML = events.map(event => {
            const impactColors = {
                low: '#95a5a6',
                medium: '#3498db',
                high: '#e74c3c'
            };
            
            const multiplierPercent = ((parseFloat(event.price_multiplier) - 1) * 100).toFixed(0);
            
            return `
                <div class="adjustment-card" style="border-left: 4px solid ${impactColors[event.impact_level]}">
                    <div class="adjustment-header">
                        <div>
                            <div class="adjustment-title">🎉 ${event.event_name}</div>
                            <p style="color: #666; margin-top: 5px;">
                                ${event.region || 'Todas las regiones'} | ${event.event_type}
                            </p>
                        </div>
                        <span class="adjustment-badge" style="background: ${impactColors[event.impact_level]}; color: white;">
                            ${event.impact_level.toUpperCase()}
                        </span>
                    </div>
                    <div class="adjustment-details">
                        <div>
                            <strong>Inicio:</strong> ${new Date(event.start_date).toLocaleDateString('es-ES')}
                        </div>
                        <div>
                            <strong>Fin:</strong> ${new Date(event.end_date).toLocaleDateString('es-ES')}
                        </div>
                        <div>
                            <strong>Multiplicador:</strong> ${event.price_multiplier}x
                        </div>
                        <div>
                            <strong>Impacto en Precio:</strong> <span style="color: #27ae60;">+${multiplierPercent}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading market events:', error);
        const container = document.getElementById('events-list');
        container.innerHTML = '<p class="loading">Error al cargar eventos de mercado.</p>';
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#27ae60' : '#e74c3c'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .form-container {
        background: #f8f9fa;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 30px;
    }
    .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
        margin-bottom: 15px;
    }
    .form-group {
        display: flex;
        flex-direction: column;
    }
    .form-group label {
        font-weight: 500;
        margin-bottom: 5px;
        color: #333;
    }
    .form-group input,
    .form-group select,
    .form-group textarea {
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
    }
    .form-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
    }
    .insights-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
    }
    .insight-card {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 10px;
        padding: 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    .insight-card h3 {
        font-size: 14px;
        color: #666;
        margin-bottom: 10px;
        text-transform: uppercase;
    }
    .insight-value {
        font-size: 32px;
        font-weight: bold;
        color: #667eea;
        margin-bottom: 5px;
    }
    .insight-label {
        font-size: 14px;
        color: #999;
    }
    .chart-container {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 30px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    .chart-container h3 {
        margin-bottom: 20px;
        color: #333;
    }
    .recommendations-list,
    .opportunities-list,
    .events-list {
        display: grid;
        gap: 20px;
    }
`;
document.head.appendChild(style);
