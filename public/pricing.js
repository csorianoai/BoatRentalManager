let currentBoat = null;
let boats = [];
let platforms = [];
let policies = [];
let adjustments = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    loadInitialData();
    setupEventListeners();
});

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
            
            if (tabName === 'sync-jobs') {
                loadSyncJobs();
            }
        });
    });
}

async function loadInitialData() {
    try {
        await Promise.all([
            loadBoats(),
            loadPlatforms(),
            loadPolicies(),
            loadAdjustments()
        ]);
    } catch (error) {
        console.error('Error loading initial data:', error);
    }
}

function setupEventListeners() {
    document.getElementById('boat-select').addEventListener('change', (e) => {
        currentBoat = e.target.value;
        if (currentBoat) {
            loadPolicies();
        }
    });
    
    document.getElementById('add-boat-btn').addEventListener('click', openBoatModal);
    document.getElementById('create-adjustment-btn').addEventListener('click', openAdjustmentModal);
    document.getElementById('refresh-policies-btn').addEventListener('click', loadPolicies);
    document.getElementById('refresh-jobs-btn').addEventListener('click', loadSyncJobs);
    document.getElementById('retry-failed-btn').addEventListener('click', retryFailedJobs);
    document.getElementById('calculate-btn').addEventListener('click', calculatePrice);
    
    document.getElementById('cancel-policy-btn').addEventListener('click', closePolicyModal);
    document.getElementById('cancel-adjustment-btn').addEventListener('click', closeAdjustmentModal);
    document.getElementById('cancel-boat-btn').addEventListener('click', closeBoatModal);
    
    document.getElementById('policy-form').addEventListener('submit', savePolicyForm);
    document.getElementById('adjustment-form').addEventListener('submit', saveAdjustmentForm);
    document.getElementById('boat-form').addEventListener('submit', saveBoatForm);
    
    document.getElementById('adj-scope').addEventListener('change', togglePlatformsSelector);
    document.getElementById('preview-impact-btn').addEventListener('click', previewImpact);
}

async function loadBoats() {
    try {
        const response = await fetch('/api/pricing/boats');
        boats = await response.json();
        
        const select = document.getElementById('boat-select');
        select.innerHTML = '<option value="">Seleccionar barco...</option>';
        
        boats.forEach(boat => {
            const option = document.createElement('option');
            option.value = boat.id;
            option.textContent = `${boat.name} (${boat.capacity} personas)`;
            select.appendChild(option);
        });
        
        const calcBoatSelect = document.getElementById('calc-boat');
        calcBoatSelect.innerHTML = '<option value="">Seleccionar...</option>';
        boats.forEach(boat => {
            const option = document.createElement('option');
            option.value = boat.id;
            option.textContent = boat.name;
            calcBoatSelect.appendChild(option);
        });
        
        if (boats.length > 0 && !currentBoat) {
            currentBoat = boats[0].id;
            select.value = currentBoat;
            loadPolicies();
        }
    } catch (error) {
        console.error('Error loading boats:', error);
    }
}

async function loadPlatforms() {
    try {
        const response = await fetch('/api/pricing/platforms');
        platforms = await response.json();
        
        const calcPlatformSelect = document.getElementById('calc-platform');
        calcPlatformSelect.innerHTML = '<option value="">Seleccionar...</option>';
        platforms.forEach(platform => {
            const option = document.createElement('option');
            option.value = platform;
            option.textContent = platform;
            calcPlatformSelect.appendChild(option);
        });
        
        populatePlatformsCheckboxes();
    } catch (error) {
        console.error('Error loading platforms:', error);
    }
}

function populatePlatformsCheckboxes() {
    const container = document.getElementById('platforms-checkboxes');
    container.innerHTML = '';
    
    platforms.forEach(platform => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = platform;
        checkbox.dataset.testid = `checkbox-platform-${platform.toLowerCase()}`;
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(platform));
        container.appendChild(label);
    });
}

async function loadPolicies() {
    if (!currentBoat) return;
    
    try {
        const response = await fetch(`/api/pricing/policies?boatId=${currentBoat}`);
        policies = await response.json();
        
        renderPricingMatrix();
    } catch (error) {
        console.error('Error loading policies:', error);
    }
}

function renderPricingMatrix() {
    const container = document.getElementById('pricing-matrix');
    
    if (policies.length === 0) {
        container.innerHTML = `
            <p class="loading">
                No hay políticas de precios configuradas para este barco. 
                Haga clic en "Editar" para configurar precios por plataforma.
            </p>
        `;
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Plataforma</th>
                    <th>Precio Medio Día (4 hrs)</th>
                    <th>Precio Día Completo (8 hrs)</th>
                    <th>Moneda</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    platforms.forEach(platform => {
        const policy = policies.find(p => p.platform === platform);
        
        if (policy) {
            html += `
                <tr>
                    <td><strong>${platform}</strong></td>
                    <td class="price-cell">$${policy.base_price_half_day}</td>
                    <td class="price-cell">$${policy.base_price_full_day}</td>
                    <td>${policy.currency}</td>
                    <td>
                        <button class="edit-btn" onclick="editPolicy('${platform}')" data-testid="button-edit-${platform.toLowerCase()}">
                            ✏️ Editar
                        </button>
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr>
                    <td><strong>${platform}</strong></td>
                    <td colspan="3" style="color: #999;">Sin configurar</td>
                    <td>
                        <button class="edit-btn" onclick="editPolicy('${platform}')" data-testid="button-edit-${platform.toLowerCase()}">
                            ➕ Configurar
                        </button>
                    </td>
                </tr>
            `;
        }
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function editPolicy(platform) {
    const policy = policies.find(p => p.platform === platform);
    
    document.getElementById('policy-platform').value = platform;
    document.getElementById('policy-half-day').value = policy ? policy.base_price_half_day : '';
    document.getElementById('policy-full-day').value = policy ? policy.base_price_full_day : '';
    
    document.getElementById('policy-modal').classList.add('show');
}

function closePolicyModal() {
    document.getElementById('policy-modal').classList.remove('show');
}

async function savePolicyForm(e) {
    e.preventDefault();
    
    const policyData = {
        platform: document.getElementById('policy-platform').value,
        boatId: currentBoat,
        basePriceHalfDay: parseInt(document.getElementById('policy-half-day').value),
        basePriceFullDay: parseInt(document.getElementById('policy-full-day').value)
    };
    
    try {
        const response = await fetch('/api/pricing/policies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(policyData)
        });
        
        if (response.ok) {
            closePolicyModal();
            loadPolicies();
            alert('✅ Política guardada correctamente');
        } else {
            alert('❌ Error al guardar política');
        }
    } catch (error) {
        console.error('Error saving policy:', error);
        alert('❌ Error al guardar política');
    }
}

async function loadAdjustments() {
    try {
        const response = await fetch('/api/pricing/adjustments');
        adjustments = await response.json();
        
        renderAdjustments();
    } catch (error) {
        console.error('Error loading adjustments:', error);
    }
}

function renderAdjustments() {
    const container = document.getElementById('adjustments-list');
    
    if (adjustments.length === 0) {
        container.innerHTML = '<p class="loading">No hay ajustes configurados.</p>';
        return;
    }
    
    let html = '';
    
    adjustments.forEach(adj => {
        const isActive = adj.is_active === 1;
        const typeLabel = adj.adjustment_type === 'percentage' ? '%' : '$';
        const valueDisplay = adj.adjustment_value > 0 
            ? `+${adj.adjustment_value}${typeLabel}` 
            : `${adj.adjustment_value}${typeLabel}`;
        
        html += `
            <div class="adjustment-card">
                <div class="adjustment-header">
                    <div class="adjustment-title">${adj.name}</div>
                    <span class="adjustment-badge ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? 'Activo' : 'Inactivo'}
                    </span>
                </div>
                
                <div class="adjustment-details">
                    <div><strong>Valor:</strong> ${valueDisplay}</div>
                    <div><strong>Alcance:</strong> ${formatScope(adj.scope)}</div>
                    <div><strong>Desde:</strong> ${formatDate(adj.valid_from) || 'Sin límite'}</div>
                    <div><strong>Hasta:</strong> ${formatDate(adj.valid_until) || 'Sin límite'}</div>
                </div>
                
                ${adj.description ? `<p style="margin-top: 10px; color: #666;">${adj.description}</p>` : ''}
                
                <div class="adjustment-actions">
                    <button class="toggle-btn ${isActive ? 'deactivate' : 'activate'}" 
                            onclick="toggleAdjustment('${adj.id}', ${isActive})"
                            data-testid="button-toggle-${adj.id}">
                        ${isActive ? '⏸️ Desactivar' : '▶️ Activar'}
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function formatScope(scope) {
    if (scope === 'all_platforms') return 'Todas las Plataformas';
    if (scope === 'specific_platforms') return 'Plataformas Específicas';
    return scope;
}

function formatDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES');
}

function openAdjustmentModal() {
    document.getElementById('adjustment-form').reset();
    document.getElementById('platforms-selector').style.display = 'none';
    document.getElementById('impact-preview').style.display = 'none';
    document.getElementById('adjustment-modal').classList.add('show');
}

function closeAdjustmentModal() {
    document.getElementById('adjustment-modal').classList.remove('show');
}

function togglePlatformsSelector() {
    const scope = document.getElementById('adj-scope').value;
    const selector = document.getElementById('platforms-selector');
    selector.style.display = scope === 'specific_platforms' ? 'block' : 'none';
}

async function previewImpact() {
    const adjustmentData = getAdjustmentFormData();
    
    try {
        const response = await fetch('/api/pricing/preview-impact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adjustmentData)
        });
        
        const impact = await response.json();
        
        const container = document.getElementById('impact-preview');
        container.style.display = 'block';
        
        let html = '<h4>📊 Vista Previa del Impacto</h4>';
        html += '<table><thead><tr><th>Plataforma</th><th>Barco</th><th>Actual</th><th>Proyectado</th><th>Diferencia</th></tr></thead><tbody>';
        
        impact.forEach(item => {
            const diffClass = item.difference >= 0 ? 'positive' : 'negative';
            const diffSymbol = item.difference >= 0 ? '+' : '';
            
            html += `
                <tr>
                    <td>${item.platform}</td>
                    <td>${item.boat}</td>
                    <td>$${item.currentPrice}</td>
                    <td>$${item.projectedPrice}</td>
                    <td class="${diffClass}">${diffSymbol}$${item.difference}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Error previewing impact:', error);
        alert('❌ Error al generar vista previa');
    }
}

function getAdjustmentFormData() {
    const scope = document.getElementById('adj-scope').value;
    
    let targetPlatforms = null;
    if (scope === 'specific_platforms') {
        const checkboxes = document.querySelectorAll('#platforms-checkboxes input:checked');
        targetPlatforms = Array.from(checkboxes).map(cb => cb.value);
    }
    
    return {
        name: document.getElementById('adj-name').value,
        description: document.getElementById('adj-description').value,
        adjustmentType: document.getElementById('adj-type').value,
        adjustmentValue: parseInt(document.getElementById('adj-value').value),
        scope: scope,
        targetPlatforms: targetPlatforms,
        validFrom: document.getElementById('adj-valid-from').value || null,
        validUntil: document.getElementById('adj-valid-until').value || null
    };
}

async function saveAdjustmentForm(e) {
    e.preventDefault();
    
    const adjustmentData = getAdjustmentFormData();
    
    try {
        const response = await fetch('/api/pricing/adjustments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adjustmentData)
        });
        
        if (response.ok) {
            closeAdjustmentModal();
            loadAdjustments();
            alert('✅ Ajuste creado correctamente');
        } else {
            alert('❌ Error al crear ajuste');
        }
    } catch (error) {
        console.error('Error saving adjustment:', error);
        alert('❌ Error al crear ajuste');
    }
}

async function toggleAdjustment(id, isActive) {
    try {
        const response = await fetch(`/api/pricing/adjustments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: isActive ? 0 : 1 })
        });
        
        if (response.ok) {
            loadAdjustments();
            alert(`✅ Ajuste ${isActive ? 'desactivado' : 'activado'} correctamente`);
        } else {
            alert('❌ Error al modificar ajuste');
        }
    } catch (error) {
        console.error('Error toggling adjustment:', error);
        alert('❌ Error al modificar ajuste');
    }
}

async function calculatePrice() {
    const platform = document.getElementById('calc-platform').value;
    const boatId = document.getElementById('calc-boat').value;
    const duration = parseInt(document.getElementById('calc-duration').value);
    
    if (!platform || !boatId) {
        alert('⚠️ Por favor seleccione plataforma y barco');
        return;
    }
    
    try {
        const response = await fetch('/api/pricing/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform, boatId, duration })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            renderCalculationResult(result);
        } else {
            alert(`❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error calculating price:', error);
        alert('❌ Error al calcular precio');
    }
}

function renderCalculationResult(result) {
    const container = document.getElementById('calculation-result');
    container.style.display = 'block';
    
    let html = '<h3>💰 Resultado del Cálculo</h3>';
    html += '<div class="price-breakdown">';
    
    html += `
        <div class="price-row">
            <span>Precio Base:</span>
            <span>$${result.basePrice} ${result.currency}</span>
        </div>
    `;
    
    if (result.appliedAdjustments && result.appliedAdjustments.length > 0) {
        result.appliedAdjustments.forEach(adj => {
            const sign = adj.appliedAmount >= 0 ? '+' : '';
            html += `
                <div class="price-row">
                    <span>${adj.name} (${adj.type === 'percentage' ? adj.value + '%' : '$' + adj.value}):</span>
                    <span>${sign}$${adj.appliedAmount}</span>
                </div>
            `;
        });
    }
    
    html += `
        <div class="price-row total">
            <span>Precio Total:</span>
            <span>$${result.effectivePrice} ${result.currency}</span>
        </div>
    `;
    
    html += '</div>';
    container.innerHTML = html;
}

async function loadSyncJobs() {
    try {
        const [jobsResponse, statsResponse] = await Promise.all([
            fetch('/api/sync/jobs?limit=50'),
            fetch('/api/sync/jobs/stats')
        ]);
        
        const jobs = await jobsResponse.json();
        const stats = await statsResponse.json();
        
        renderJobStats(stats);
        renderJobsList(jobs);
    } catch (error) {
        console.error('Error loading sync jobs:', error);
    }
}

function renderJobStats(stats) {
    document.getElementById('stat-pending').textContent = stats.pending || 0;
    document.getElementById('stat-processing').textContent = stats.processing || 0;
    document.getElementById('stat-completed').textContent = stats.completed || 0;
    document.getElementById('stat-failed').textContent = stats.failed || 0;
}

function renderJobsList(jobs) {
    const container = document.getElementById('jobs-list');
    
    if (jobs.length === 0) {
        container.innerHTML = '<p class="loading">No hay trabajos en la cola.</p>';
        return;
    }
    
    let html = '';
    
    jobs.forEach(job => {
        const createdDate = new Date(job.created_at).toLocaleString('es-ES');
        
        html += `
            <div class="job-item">
                <span class="job-status ${job.status}" data-testid="status-job-${job.id}">${job.status}</span>
                <div>
                    <div><strong>${job.job_type}</strong> → ${job.target_platform}</div>
                    <div style="font-size: 12px; color: #666;">${createdDate}</div>
                </div>
                <div style="font-size: 12px;">Intentos: ${job.attempts}/${job.max_attempts}</div>
                ${job.error_message ? `<div style="color: #e74c3c; font-size: 12px;">${job.error_message}</div>` : '<div></div>'}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function retryFailedJobs() {
    if (!confirm('¿Reintentar todos los trabajos fallidos?')) return;
    
    try {
        const response = await fetch('/api/sync/jobs/retry-failed', { method: 'POST' });
        const result = await response.json();
        
        if (response.ok) {
            alert(`✅ ${result.retriedCount} trabajos reintentados`);
            loadSyncJobs();
        } else {
            alert('❌ Error al reintentar trabajos');
        }
    } catch (error) {
        console.error('Error retrying jobs:', error);
        alert('❌ Error al reintentar trabajos');
    }
}

function openBoatModal() {
    document.getElementById('boat-form').reset();
    document.getElementById('boat-modal').classList.add('show');
}

function closeBoatModal() {
    document.getElementById('boat-modal').classList.remove('show');
}

async function saveBoatForm(e) {
    e.preventDefault();
    
    const boatData = {
        name: document.getElementById('boat-name').value,
        capacity: parseInt(document.getElementById('boat-capacity').value),
        boatType: document.getElementById('boat-type').value,
        status: 'active'
    };
    
    try {
        const response = await fetch('/api/pricing/boats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(boatData)
        });
        
        if (response.ok) {
            closeBoatModal();
            loadBoats();
            alert('✅ Barco creado correctamente');
        } else {
            alert('❌ Error al crear barco');
        }
    } catch (error) {
        console.error('Error creating boat:', error);
        alert('❌ Error al crear barco');
    }
}
