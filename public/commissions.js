// Commissions Management System
const API_BASE = window.location.origin;

// Helper function for authenticated fetch
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

// State
let currentPayments = [];
let currentRules = [];
let currentCaptains = [];
let platformChart = null;
let captainChart = null;

// DOM Elements
const elements = {
    // Filters
    statusFilter: document.getElementById('statusFilter'),
    captainFilter: document.getElementById('captainFilter'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    
    // Buttons
    calculateBtn: document.getElementById('calculateBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    themeToggle: document.getElementById('themeToggle'),
    
    // KPIs
    totalGross: document.getElementById('totalGross'),
    totalCommission: document.getElementById('totalCommission'),
    totalNet: document.getElementById('totalNet'),
    totalPending: document.getElementById('totalPending'),
    paymentCount: document.getElementById('paymentCount'),
    commissionPercent: document.getElementById('commissionPercent'),
    paidAmount: document.getElementById('paidAmount'),
    
    // Tables
    paymentsTableBody: document.getElementById('paymentsTableBody'),
    paymentsCount: document.getElementById('paymentsCount'),
    rulesTableBody: document.getElementById('rulesTableBody'),
    rulesCount: document.getElementById('rulesCount'),
    
    // Modal
    editRuleModal: document.getElementById('editRuleModal'),
    editRuleForm: document.getElementById('editRuleForm'),
    editPlatform: document.getElementById('editPlatform'),
    editPlatformName: document.getElementById('editPlatformName'),
    editPercentage: document.getElementById('editPercentage'),
    editFixedFee: document.getElementById('editFixedFee'),
    closeModal: document.getElementById('closeModal'),
    cancelEdit: document.getElementById('cancelEdit'),
    
    // Charts
    platformChart: document.getElementById('platformChart'),
    captainChart: document.getElementById('captainChart')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadInitialData();
});

// Event Listeners
function setupEventListeners() {
    if (elements.calculateBtn) elements.calculateBtn.addEventListener('click', calculateCommissions);
    if (elements.refreshBtn) elements.refreshBtn.addEventListener('click', loadInitialData);
    if (elements.themeToggle) elements.themeToggle.addEventListener('click', toggleTheme);
    
    if (elements.statusFilter) elements.statusFilter.addEventListener('change', loadPayments);
    if (elements.captainFilter) elements.captainFilter.addEventListener('change', loadPayments);
    if (elements.startDate) elements.startDate.addEventListener('change', loadPayments);
    if (elements.endDate) elements.endDate.addEventListener('change', loadPayments);
    
    if (elements.closeModal) elements.closeModal.addEventListener('click', closeEditModal);
    if (elements.cancelEdit) elements.cancelEdit.addEventListener('click', closeEditModal);
    if (elements.editRuleForm) elements.editRuleForm.addEventListener('submit', saveRule);
    
    // Close modal on outside click
    if (elements.editRuleModal) {
        elements.editRuleModal.addEventListener('click', (e) => {
            if (e.target === elements.editRuleModal) {
                closeEditModal();
            }
        });
    }
}

// Theme Toggle
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

// Load saved theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
}

// Load Initial Data
async function loadInitialData() {
    showLoading();
    await Promise.all([
        loadCaptains(),
        loadRules(),
        loadPayments(),
        loadReports()
    ]);
}

async function loadCaptains() {
    try {
        const response = await authFetch(`${API_BASE}/api/captains`);
        currentCaptains = await response.json();
        
        // Populate captain filter
        elements.captainFilter.innerHTML = '<option value="all">Todos los Capitanes</option>';
        currentCaptains.forEach(captain => {
            const option = document.createElement('option');
            option.value = captain.id;
            option.textContent = captain.name;
            elements.captainFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading captains:', error);
    }
}

async function loadRules() {
    try {
        const response = await authFetch(`${API_BASE}/api/commissions/rules`);
        currentRules = await response.json();
        renderRulesTable();
    } catch (error) {
        console.error('Error loading rules:', error);
        elements.rulesTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Error cargando reglas</td></tr>';
    }
}

async function loadPayments() {
    try {
        const status = elements.statusFilter.value;
        const captainId = elements.captainFilter.value;
        const startDate = elements.startDate.value;
        const endDate = elements.endDate.value;
        
        let url = `${API_BASE}/api/commissions/payments?`;
        if (status !== 'all') url += `status=${status}&`;
        if (captainId !== 'all') url += `captainId=${captainId}&`;
        if (startDate) url += `startDate=${startDate}&`;
        if (endDate) url += `endDate=${endDate}&`;
        
        const response = await authFetch(url);
        currentPayments = await response.json();
        renderPaymentsTable();
    } catch (error) {
        console.error('Error loading payments:', error);
        elements.paymentsTableBody.innerHTML = '<tr><td colspan="9" class="text-center">Error cargando pagos</td></tr>';
    }
}

async function loadReports() {
    try {
        const startDate = elements.startDate.value;
        const endDate = elements.endDate.value;
        
        let url = `${API_BASE}/api/commissions/reports?`;
        if (startDate) url += `startDate=${startDate}&`;
        if (endDate) url += `endDate=${endDate}&`;
        
        const response = await authFetch(url);
        const data = await response.json();
        
        updateKPIs(data.summary);
        updateCharts(data.byPlatform, data.byCaptain);
    } catch (error) {
        console.error('Error loading reports:', error);
    }
}

// Update KPIs
function updateKPIs(summary) {
    elements.totalGross.textContent = formatCurrency(summary.total_gross || 0);
    elements.totalCommission.textContent = formatCurrency(summary.total_commission || 0);
    elements.totalNet.textContent = formatCurrency(summary.total_net || 0);
    elements.totalPending.textContent = formatCurrency(summary.total_pending || 0);
    elements.paidAmount.textContent = `$${formatCurrency(summary.total_paid || 0)} pagado`;
    elements.paymentCount.textContent = `${summary.total_payments || 0} pagos`;
    
    const avgPercent = summary.total_gross > 0 
        ? ((summary.total_commission / summary.total_gross) * 100).toFixed(1)
        : 0;
    elements.commissionPercent.textContent = `${avgPercent}% avg`;
}

// Update Charts
function updateCharts(platformData, captainData) {
    // Platform Chart
    if (platformChart) {
        platformChart.destroy();
    }
    
    const platformLabels = platformData.map(p => p.platform.toUpperCase());
    const platformCommissions = platformData.map(p => p.total_commission / 100);
    
    platformChart = new Chart(elements.platformChart, {
        type: 'bar',
        data: {
            labels: platformLabels,
            datasets: [{
                label: 'Comisiones ($)',
                data: platformCommissions,
                backgroundColor: 'rgba(0, 119, 182, 0.7)',
                borderColor: 'rgba(0, 119, 182, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
    
    // Captain Chart
    if (captainChart) {
        captainChart.destroy();
    }
    
    const captainLabels = captainData.slice(0, 10).map(c => c.captain_name);
    const captainNet = captainData.slice(0, 10).map(c => c.total_net / 100);
    
    captainChart = new Chart(elements.captainChart, {
        type: 'bar',
        data: {
            labels: captainLabels,
            datasets: [{
                label: 'Pagos Netos ($)',
                data: captainNet,
                backgroundColor: 'rgba(0, 180, 216, 0.7)',
                borderColor: 'rgba(0, 180, 216, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

// Render Payments Table
function renderPaymentsTable() {
    if (currentPayments.length === 0) {
        elements.paymentsTableBody.innerHTML = '<tr><td colspan="9" class="text-center">No hay pagos disponibles</td></tr>';
        elements.paymentsCount.textContent = '0 pagos';
        return;
    }
    
    elements.paymentsCount.textContent = `${currentPayments.length} pagos`;
    
    elements.paymentsTableBody.innerHTML = currentPayments.map(payment => {
        const statusClass = payment.payment_status === 'paid' ? 'status-paid' : 
                           payment.payment_status === 'pending' ? 'status-pending' : 'status-failed';
        const statusText = payment.payment_status === 'paid' ? 'Pagado' :
                          payment.payment_status === 'pending' ? 'Pendiente' : 'Fallido';
        
        return `
            <tr data-testid="row-payment-${payment.id}">
                <td>${payment.booking_date}</td>
                <td><span class="platform-badge">${payment.platform.toUpperCase()}</span></td>
                <td>${payment.customer_name}</td>
                <td>${payment.captain_name}</td>
                <td>$${formatCurrency(payment.gross_amount)}</td>
                <td>$${formatCurrency(payment.commission_amount)}</td>
                <td><strong>$${formatCurrency(payment.net_amount)}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    ${payment.payment_status === 'pending' ? 
                        `<button class="btn-success" onclick="markAsPaid('${payment.id}')" data-testid="button-mark-paid-${payment.id}">✓ Marcar Pagado</button>` :
                        payment.paid_at ? `<small>${formatDate(payment.paid_at)}</small>` : '-'
                    }
                </td>
            </tr>
        `;
    }).join('');
}

// Render Rules Table
function renderRulesTable() {
    if (currentRules.length === 0) {
        elements.rulesTableBody.innerHTML = '<tr><td colspan="4" class="text-center">No hay reglas disponibles</td></tr>';
        elements.rulesCount.textContent = '0 reglas';
        return;
    }
    
    elements.rulesCount.textContent = `${currentRules.length} reglas`;
    
    elements.rulesTableBody.innerHTML = currentRules.map(rule => `
        <tr data-testid="row-rule-${rule.platform}">
            <td><span class="platform-badge">${rule.platform.toUpperCase()}</span></td>
            <td><strong>${rule.commission_percentage}%</strong></td>
            <td>$${formatCurrency(rule.fixed_fee)}</td>
            <td>
                <button class="btn-primary" onclick="editRule('${rule.platform}')" data-testid="button-edit-rule-${rule.platform}">
                    ✏️ Editar
                </button>
            </td>
        </tr>
    `).join('');
}

// Edit Rule
function editRule(platform) {
    const rule = currentRules.find(r => r.platform === platform);
    if (!rule) return;
    
    elements.editPlatform.value = rule.platform;
    elements.editPlatformName.textContent = rule.platform.toUpperCase();
    elements.editPercentage.value = rule.commission_percentage;
    elements.editFixedFee.value = rule.fixed_fee / 100;
    
    elements.editRuleModal.classList.add('active');
}

function closeEditModal() {
    elements.editRuleModal.classList.remove('active');
}

async function saveRule(e) {
    e.preventDefault();
    
    const platform = elements.editPlatform.value;
    const percentage = parseInt(elements.editPercentage.value);
    const fixedFee = Math.floor(parseFloat(elements.editFixedFee.value) * 100);
    
    try {
        const response = await authFetch(`${API_BASE}/api/commissions/rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platform,
                commissionPercentage: percentage,
                fixedFee
            })
        });
        
        if (response.ok) {
            alert('Regla actualizada exitosamente');
            closeEditModal();
            await loadRules();
            await loadReports();
        } else {
            alert('Error actualizando regla');
        }
    } catch (error) {
        console.error('Error saving rule:', error);
        alert('Error actualizando regla');
    }
}

// Mark as Paid
async function markAsPaid(paymentId) {
    if (!confirm('¿Marcar este pago como pagado?')) return;
    
    try {
        const response = await authFetch(`${API_BASE}/api/commissions/mark-paid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId })
        });
        
        if (response.ok) {
            alert('Pago marcado como pagado');
            await loadPayments();
            await loadReports();
        } else {
            alert('Error marcando pago');
        }
    } catch (error) {
        console.error('Error marking payment:', error);
        alert('Error marcando pago');
    }
}

// Calculate Commissions
async function calculateCommissions() {
    if (!confirm('¿Calcular comisiones para todas las reservas completadas?')) return;
    
    showLoading();
    
    try {
        const response = await authFetch(`${API_BASE}/api/commissions/calculate`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(data.message);
            await loadInitialData();
        } else {
            alert('Error calculando comisiones');
        }
    } catch (error) {
        console.error('Error calculating commissions:', error);
        alert('Error calculando comisiones');
    }
}

// Utility Functions
function formatCurrency(amount) {
    return (amount / 100).toFixed(2);
}

function formatDate(dateString) {
    if (!dateString) return '—';
    const safe = (typeof dateString === 'string' && dateString.length === 10) ? dateString + 'T12:00:00' : dateString;
    const date = new Date(safe);
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showLoading() {
    elements.paymentsTableBody.innerHTML = '<tr><td colspan="9" class="text-center">Cargando...</td></tr>';
    elements.rulesTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando...</td></tr>';
}

// Make functions available globally for onclick handlers
window.editRule = editRule;
window.markAsPaid = markAsPaid;
