// Accounting Dashboard JavaScript

let accountsData = [];
let transactionsData = [];
let reconciliationsData = [];
let rulesData = [];

// Chart instances (to prevent memory leaks and re-creation errors)
let plChartInstance = null;
let typeChartInstance = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Accounting Dashboard initializing...');
    
    // Set default dates (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    document.getElementById('startDate').valueAsDate = thirtyDaysAgo;
    document.getElementById('endDate').valueAsDate = today;
    
    // Set transaction form date to today
    document.getElementById('txDate').valueAsDate = today;
    
    // Set report dates
    document.getElementById('reportStartDate').valueAsDate = thirtyDaysAgo;
    document.getElementById('reportEndDate').valueAsDate = today;
    
    // Set reconciliation dates
    document.getElementById('recStartDate').valueAsDate = thirtyDaysAgo;
    document.getElementById('recEndDate').valueAsDate = today;
    
    // Setup tab navigation
    setupTabs();
    
    // Setup theme toggle
    setupThemeToggle();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load initial data
    await loadData();
});

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Remove active from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            
            // Add active to clicked tab and corresponding content
            tab.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        document.body.classList.toggle('dark-mode');
    });
}

function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', loadData);
    
    // Date filters
    document.getElementById('startDate').addEventListener('change', loadData);
    document.getElementById('endDate').addEventListener('change', loadData);
    
    // Transaction form
    document.getElementById('newTransactionForm').addEventListener('submit', createTransaction);
    
    // Reconciliation form
    document.getElementById('newReconciliationForm').addEventListener('submit', createReconciliation);
    
    // Rule form
    document.getElementById('newRuleForm').addEventListener('submit', createRule);
    
    // File upload
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });
}

async function loadData() {
    try {
        // Load accounts
        const accountsResponse = await fetch('/api/accounting/accounts');
        accountsData = await accountsResponse.json();
        
        // Populate account dropdowns
        const accountSelects = [
            document.getElementById('txAccount'),
            document.getElementById('ruleAccount')
        ];
        accountSelects.forEach(select => {
            select.innerHTML = '<option value="">Seleccionar cuenta...</option>';
            accountsData.forEach(account => {
                if (!account.is_active) return; // Skip inactive accounts
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = `${account.account_code} - ${account.account_name}`;
                select.appendChild(option);
            });
        });
        
        // Load transactions
        await loadTransactions();
        
        // Load reconciliations
        await loadReconciliations();
        
        // Load rules
        await loadRules();
        
        // Update KPIs and charts
        updateDashboard();
        
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Error al cargar datos');
    }
}

async function loadTransactions() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    const url = `/api/accounting/transactions?start_date=${startDate}&end_date=${endDate}&limit=100`;
    const response = await fetch(url);
    transactionsData = await response.json();
    
    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');
    
    if (transactionsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay transacciones en este período</td></tr>';
        return;
    }
    
    tbody.innerHTML = transactionsData.map(tx => `
        <tr>
            <td>${formatDate(tx.transaction_date)}</td>
            <td><span class="badge badge-${tx.transaction_type}">${formatType(tx.transaction_type)}</span></td>
            <td>${tx.account_code} - ${tx.account_name}</td>
            <td>${tx.description || '-'}</td>
            <td>$${parseFloat(tx.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>${tx.reconciled === 1 ? '✅ Reconciliado' : '⏳ Pendiente'}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editTransaction('${tx.id}')" data-testid="button-edit-tx-${tx.id}">✏️</button>
                <button class="action-btn btn-delete" onclick="deleteTransaction('${tx.id}')" data-testid="button-delete-tx-${tx.id}">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function loadReconciliations() {
    const response = await fetch('/api/accounting/reconciliations');
    reconciliationsData = await response.json();
    
    const tbody = document.getElementById('reconciliationsTable');
    
    if (reconciliationsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay sesiones de reconciliación</td></tr>';
        return;
    }
    
    tbody.innerHTML = reconciliationsData.map(rec => `
        <tr>
            <td>${formatDate(rec.period_start)} - ${formatDate(rec.period_end)}</td>
            <td>$${parseFloat(rec.opening_balance).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td>$${parseFloat(rec.closing_balance).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td>$${parseFloat(rec.variance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td><span class="badge badge-${rec.status}">${rec.status}</span></td>
            <td>
                <button class="action-btn btn-match" onclick="viewVarianceAnalysis('${rec.id}')" data-testid="button-analyze-${rec.id}">📊 Analizar</button>
                ${rec.status === 'in_progress' ? `<button class="action-btn btn-edit" onclick="completeReconciliation('${rec.id}')" data-testid="button-complete-${rec.id}">✅ Completar</button>` : ''}
            </td>
        </tr>
    `).join('');
}

async function loadRules() {
    const response = await fetch('/api/accounting/categorization-rules');
    rulesData = await response.json();
    
    const tbody = document.getElementById('rulesTable');
    
    if (rulesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay reglas configuradas</td></tr>';
        return;
    }
    
    tbody.innerHTML = rulesData.map(rule => `
        <tr>
            <td>${rule.rule_name}</td>
            <td>${rule.priority}</td>
            <td>${formatField(rule.match_field)}</td>
            <td>${formatOperator(rule.match_operator)}</td>
            <td>${rule.match_value}</td>
            <td>${rule.account_code} - ${rule.account_name}</td>
            <td>${rule.apply_count || 0}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editRule('${rule.id}')" data-testid="button-edit-rule-${rule.id}">✏️</button>
                <button class="action-btn btn-delete" onclick="deleteRule('${rule.id}')" data-testid="button-delete-rule-${rule.id}">🗑️</button>
                <button class="action-btn btn-match" onclick="applyRule('${rule.id}')" data-testid="button-apply-rule-${rule.id}">▶️ Aplicar</button>
            </td>
        </tr>
    `).join('');
}

function updateDashboard() {
    // Calculate KPIs
    const incomeTransactions = transactionsData.filter(t => t.transaction_type === 'income');
    const expenseTransactions = transactionsData.filter(t => t.transaction_type === 'expense');
    const unreconciledTransactions = transactionsData.filter(t => t.reconciled === 0);
    
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const netBalance = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? ((netBalance / totalIncome) * 100).toFixed(1) : 0;
    const unreconciledAmount = unreconciledTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    // Update KPI values
    document.getElementById('totalIncome').textContent = `$${totalIncome.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('incomeCount').textContent = `${incomeTransactions.length} transacciones`;
    
    document.getElementById('totalExpenses').textContent = `$${totalExpenses.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('expensesCount').textContent = `${expenseTransactions.length} transacciones`;
    
    document.getElementById('netBalance').textContent = `$${netBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('profitMargin').textContent = `${profitMargin}% margen`;
    
    document.getElementById('unreconciledCount').textContent = unreconciledTransactions.length;
    document.getElementById('unreconciledAmount').textContent = `$${unreconciledAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    
    // Update charts
    updateCharts(totalIncome, totalExpenses);
}

function updateCharts(totalIncome, totalExpenses) {
    // P&L Chart
    const plCtx = document.getElementById('plChart');
    if (plCtx) {
        // Destroy previous instance if exists
        if (plChartInstance) {
            plChartInstance.destroy();
        }
        
        plChartInstance = new Chart(plCtx, {
            type: 'bar',
            data: {
                labels: ['Ingresos', 'Gastos', 'Balance Neto'],
                datasets: [{
                    label: 'Monto ($)',
                    data: [totalIncome, totalExpenses, totalIncome - totalExpenses],
                    backgroundColor: [
                        'rgba(40, 167, 69, 0.6)',
                        'rgba(220, 53, 69, 0.6)',
                        'rgba(0, 123, 255, 0.6)'
                    ],
                    borderColor: [
                        'rgba(40, 167, 69, 1)',
                        'rgba(220, 53, 69, 1)',
                        'rgba(0, 123, 255, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    // Transaction Type Chart
    const typeCtx = document.getElementById('transactionTypeChart');
    if (typeCtx) {
        const typeCounts = {
            income: transactionsData.filter(t => t.transaction_type === 'income').length,
            expense: transactionsData.filter(t => t.transaction_type === 'expense').length,
            transfer: transactionsData.filter(t => t.transaction_type === 'transfer').length,
            adjustment: transactionsData.filter(t => t.transaction_type === 'adjustment').length
        };
        
        // Destroy previous instance if exists
        if (typeChartInstance) {
            typeChartInstance.destroy();
        }
        
        typeChartInstance = new Chart(typeCtx, {
            type: 'doughnut',
            data: {
                labels: ['Ingresos', 'Gastos', 'Transferencias', 'Ajustes'],
                datasets: [{
                    data: [typeCounts.income, typeCounts.expense, typeCounts.transfer, typeCounts.adjustment],
                    backgroundColor: [
                        'rgba(40, 167, 69, 0.8)',
                        'rgba(220, 53, 69, 0.8)',
                        'rgba(23, 162, 184, 0.8)',
                        'rgba(255, 193, 7, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true
            }
        });
    }
}

// ── Account 2500 Booking Deposit detection ─────────────────
function onTxAccountChange() {
    const sel = document.getElementById('txAccount');
    const selectedOption = sel.options[sel.selectedIndex];
    const is2500 = selectedOption && selectedOption.textContent.includes('2500');
    const bookingSection = document.getElementById('booking-deposit-section');
    const submitBtn = document.getElementById('tx-submit-btn');
    if (bookingSection) {
        bookingSection.style.display = is2500 ? 'block' : 'none';
    }
    if (submitBtn) {
        submitBtn.textContent = is2500 ? '🔐 Registrar Depósito + Cuenta por Cobrar' : '✅ Crear Transacción';
    }
    // Populate boat selector inside booking section
    if (is2500 && document.getElementById('bd-boat-id')) {
        const boatSel = document.getElementById('bd-boat-id');
        if (boatSel.options.length <= 1) {
            fetch('/api/boats').then(r => r.json()).then(boats => {
                boatSel.innerHTML = '<option value="">-- Seleccionar barco --</option>';
                boats.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.id;
                    opt.textContent = b.name;
                    boatSel.appendChild(opt);
                });
            }).catch(() => {});
        }
    }
}

function updateBdBalance() {
    const total = parseFloat(document.getElementById('bd-total-amount').value) || 0;
    const deposit = parseFloat(document.getElementById('txAmount').value) || 0;
    const balance = Math.max(0, total - deposit);
    const preview = document.getElementById('bd-balance-preview');
    const amtEl  = document.getElementById('bd-balance-amount');
    if (preview && amtEl) {
        if (total > 0 && balance > 0.005) {
            preview.style.display = 'block';
            amtEl.textContent = '$' + balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            preview.style.display = 'none';
        }
    }
}

async function createTransaction(e) {
    e.preventDefault();

    // Check if account 2500 (Deferred Booking Deposits) is selected
    const txAccountSel = document.getElementById('txAccount');
    const selectedOption = txAccountSel.options[txAccountSel.selectedIndex];
    const is2500 = selectedOption && selectedOption.textContent.includes('2500');

    if (is2500) {
        return await createBookingDepositFromForm();
    }
    
    const data = {
        transaction_date: document.getElementById('txDate').value,
        transaction_type: document.getElementById('txType').value,
        account_id: document.getElementById('txAccount').value,
        amount: parseFloat(document.getElementById('txAmount').value),
        description: document.getElementById('txDescription').value || null
    };
    
    try {
        const response = await fetch('/api/accounting/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Failed to create transaction');
        
        alert('✅ Transacción creada exitosamente');
        document.getElementById('newTransactionForm').reset();
        document.getElementById('txDate').valueAsDate = new Date();
        document.getElementById('booking-deposit-section').style.display = 'none';
        document.getElementById('tx-submit-btn').textContent = '✅ Crear Transacción';
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al crear transacción');
    }
}

async function createBookingDepositFromForm() {
    const clientName = document.getElementById('bd-client-name').value.trim();
    const bookingDate = document.getElementById('bd-booking-date').value;
    const totalAmount = document.getElementById('bd-total-amount').value;
    const depositAmount = document.getElementById('txAmount').value;
    const depositDate = document.getElementById('txDate').value;
    const boatId = document.getElementById('bd-boat-id').value;
    const hours = document.getElementById('bd-hours').value;
    const serviceType = document.getElementById('bd-service-type').value;
    const phone = document.getElementById('bd-phone').value.trim();
    const email = document.getElementById('bd-email').value.trim();
    const notes = document.getElementById('txDescription').value.trim();

    if (!clientName) { alert('❌ El nombre del cliente es obligatorio'); return; }
    if (!bookingDate) { alert('❌ La fecha del booking es obligatoria'); return; }
    if (!totalAmount || parseFloat(totalAmount) <= 0) { alert('❌ El monto total del booking es obligatorio'); return; }
    if (!boatId) { alert('❌ Selecciona el barco'); return; }

    const body = {
        client_name: clientName,
        client_email: email || null,
        client_phone: phone || null,
        boat_id: boatId,
        booking_reference: notes || null,
        amount: parseFloat(depositAmount),
        deposit_date: depositDate,
        status: 'pending',
        notes: notes || null,
        booking_date: bookingDate,
        booking_total_amount: parseFloat(totalAmount),
        hours_rented: hours ? parseFloat(hours) : null,
        service_type: serviceType || null
    };

    try {
        const btn = document.getElementById('tx-submit-btn');
        btn.disabled = true;
        btn.textContent = '⏳ Guardando...';

        const response = await fetch('/api/booking-deposits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al crear depósito');
        }
        const result = await response.json();
        const balanceDue = result.receivable ? parseFloat(result.receivable.amount) : 0;
        let msg = `✅ Depósito registrado exitosamente!\n\nCliente: ${clientName}\nDepósito: $${parseFloat(depositAmount).toFixed(2)}`;
        if (balanceDue > 0) {
            msg += `\n\nSaldo pendiente: $${balanceDue.toFixed(2)}\n📋 Cuenta por Cobrar creada automáticamente`;
        }
        alert(msg);

        // Reset form
        document.getElementById('newTransactionForm').reset();
        document.getElementById('txDate').valueAsDate = new Date();
        document.getElementById('booking-deposit-section').style.display = 'none';
        document.getElementById('tx-submit-btn').textContent = '✅ Crear Transacción';
        document.getElementById('bd-balance-preview').style.display = 'none';

        // Refresh deposits tab if visible
        if (typeof renderDeposits === 'function') renderDeposits();
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        alert('❌ ' + error.message);
    } finally {
        const btn = document.getElementById('tx-submit-btn');
        if (btn) { btn.disabled = false; btn.textContent = '🔐 Registrar Depósito + Cuenta por Cobrar'; }
    }
}

async function createReconciliation(e) {
    e.preventDefault();
    
    const data = {
        period_start: document.getElementById('recStartDate').value,
        period_end: document.getElementById('recEndDate').value,
        opening_balance: parseFloat(document.getElementById('recOpeningBalance').value),
        closing_balance: parseFloat(document.getElementById('recClosingBalance').value)
    };
    
    try {
        const response = await fetch('/api/accounting/reconciliations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Failed to create reconciliation');
        
        const result = await response.json();
        alert('✅ Sesión de reconciliación creada exitosamente');
        document.getElementById('newReconciliationForm').reset();
        await loadReconciliations();
        
        // Automatically view variance analysis
        viewVarianceAnalysis(result.id);
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al crear sesión de reconciliación');
    }
}

async function viewVarianceAnalysis(reconciliationId) {
    try {
        const response = await fetch(`/api/accounting/reconciliations/${reconciliationId}/variance-analysis`);
        const data = await response.json();
        
        // Show variance analysis panel
        const panel = document.getElementById('varianceAnalysis');
        panel.style.display = 'block';
        
        // Display metrics
        const metricsDiv = document.getElementById('varianceMetrics');
        metricsDiv.innerHTML = `
            <p><strong>Varianza:</strong> $${data.variance.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p><strong>Health Score:</strong> ${data.health_score}/100</p>
            <p><strong>Transacciones:</strong> ${data.statistics.transaction_count}</p>
            <p><strong>No reconciliadas:</strong> ${data.statistics.unreconciled_transactions}</p>
            <p><strong>Extractos no emparejados:</strong> ${data.statistics.unmatched_statements}</p>
        `;
        
        // Display suggestions
        const suggestionsDiv = document.getElementById('varianceSuggestions');
        if (data.suggestions.length === 0) {
            suggestionsDiv.innerHTML = '<p class="empty-state">✅ No hay sugerencias. Todo parece estar en orden.</p>';
        } else {
            suggestionsDiv.innerHTML = data.suggestions.map(s => `
                <div class="variance-item ${s.severity}">
                    <strong>${s.title}</strong>
                    <p>${s.description}</p>
                    <small>Impacto: $${s.impact.toLocaleString('en-US', {minimumFractionDigits: 2})}</small>
                </div>
            `).join('');
        }
        
        // Scroll to analysis
        panel.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al cargar análisis de varianza');
    }
}

async function createRule(e) {
    e.preventDefault();
    
    const data = {
        rule_name: document.getElementById('ruleName').value,
        priority: parseInt(document.getElementById('rulePriority').value),
        match_field: document.getElementById('ruleField').value,
        match_operator: document.getElementById('ruleOperator').value,
        match_value: document.getElementById('ruleValue').value,
        target_account_id: document.getElementById('ruleAccount').value
    };
    
    try {
        const response = await fetch('/api/accounting/categorization-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Failed to create rule');
        
        alert('✅ Regla creada exitosamente');
        document.getElementById('newRuleForm').reset();
        document.getElementById('rulePriority').value = 100;
        await loadRules();
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al crear regla');
    }
}

async function applyRule(ruleId) {
    if (!confirm('¿Aplicar esta regla a todas las transacciones no categorizadas?')) return;
    
    try {
        const response = await fetch('/api/accounting/categorization-rules/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rule_id: ruleId })
        });
        
        const result = await response.json();
        alert(`✅ Regla aplicada: ${result.categorized} transacciones categorizadas`);
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al aplicar regla');
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/accounting/bank-statements/import', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const result = await response.json();
        
        // Show preview
        const preview = document.getElementById('importPreview');
        const results = document.getElementById('importResults');
        preview.style.display = 'block';
        
        results.innerHTML = `
            <p class="badge badge-income">✅ ${result.imported_count} extractos importados</p>
            <p class="badge badge-suggested">🔍 ${result.auto_matched} emparejados automáticamente</p>
            <p>Total: ${result.total_rows} filas procesadas</p>
        `;
        
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al importar archivo');
    }
}

async function deleteTransaction(id) {
    if (!confirm('¿Eliminar esta transacción?')) return;
    
    try {
        const response = await fetch(`/api/accounting/transactions/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        
        alert('✅ Transacción eliminada');
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al eliminar transacción');
    }
}

async function deleteRule(id) {
    if (!confirm('¿Eliminar esta regla?')) return;
    
    try {
        const response = await fetch(`/api/accounting/categorization-rules/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        
        alert('✅ Regla eliminada');
        await loadRules();
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al eliminar regla');
    }
}

async function completeReconciliation(id) {
    if (!confirm('¿Completar esta reconciliación?')) return;
    
    try {
        const response = await fetch(`/api/accounting/reconciliations/${id}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reconciled_by: 'admin' })
        });
        
        if (!response.ok) throw new Error('Complete failed');
        
        alert('✅ Reconciliación completada');
        await loadReconciliations();
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al completar reconciliación');
    }
}

// Report generation functions
async function generatePLReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    if (!startDate || !endDate) {
        alert('Por favor seleccione fechas de inicio y fin');
        return;
    }
    
    try {
        const response = await fetch(`/api/accounting/profit-loss?start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json();
        
        displayReport('📊 Reporte P&L', `
            <h3>Período: ${formatDate(startDate)} - ${formatDate(endDate)}</h3>
            <h4>Resumen</h4>
            <p>Total Ingresos: $${data.summary.total_revenue.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p>Total Gastos: $${data.summary.total_expenses.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p><strong>Ingreso Neto: $${data.summary.net_income.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></p>
            <p>Margen de Ganancia: ${data.summary.profit_margin.toFixed(2)}%</p>
        `);
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al generar reporte');
    }
}

async function generateBalanceSheet() {
    const asOfDate = document.getElementById('reportEndDate').value || new Date().toISOString().split('T')[0];
    
    try {
        const response = await fetch(`/api/accounting/balance-sheet?as_of_date=${asOfDate}`);
        const data = await response.json();
        
        displayReport('📋 Balance Sheet', `
            <h3>Al: ${formatDate(asOfDate)}</h3>
            <h4>Resumen</h4>
            <p>Total Activos: $${data.summary.total_assets.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p>Total Pasivos: $${data.summary.total_liabilities.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p>Total Capital: $${data.summary.total_equity.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p><strong>Balance Check: $${data.summary.balance_check.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></p>
        `);
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al generar reporte');
    }
}

async function generateCashFlow() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    if (!startDate || !endDate) {
        alert('Por favor seleccione fechas de inicio y fin');
        return;
    }
    
    try {
        const response = await fetch(`/api/accounting/cash-flow?start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json();
        
        displayReport('💵 Cash Flow', `
            <h3>Período: ${formatDate(startDate)} - ${formatDate(endDate)}</h3>
            <h4>Actividades Operativas</h4>
            <p>Ingresos en Efectivo: $${data.operating_activities.cash_from_revenue.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p>Gastos en Efectivo: $${data.operating_activities.cash_for_expenses.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p><strong>Flujo de Efectivo Neto: $${data.summary.net_cash_flow.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></p>
        `);
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al generar reporte');
    }
}

async function generateROI() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    if (!startDate || !endDate) {
        alert('Por favor seleccione fechas de inicio y fin');
        return;
    }
    
    try {
        const response = await fetch(`/api/accounting/roi?start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json();
        
        displayReport('💰 ROI Analysis', `
            <h3>Período: ${formatDate(startDate)} - ${formatDate(endDate)}</h3>
            <h4>Resumen</h4>
            <p>Total Ingresos: $${data.summary.total_revenue.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p>Total Gastos: $${data.summary.total_expenses.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p>Ganancia Neta: $${data.summary.net_profit.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            <p><strong>ROI: ${data.summary.roi_percentage.toFixed(2)}%</strong></p>
        `);
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al generar reporte');
    }
}

function displayReport(title, content) {
    const reportResults = document.getElementById('reportResults');
    const reportTitle = document.getElementById('reportTitle');
    const reportContent = document.getElementById('reportContent');
    
    reportTitle.textContent = title;
    reportContent.innerHTML = content;
    reportResults.style.display = 'block';
    reportResults.scrollIntoView({ behavior: 'smooth' });
}

// Utility functions
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatType(type) {
    const types = {
        income: 'Ingreso',
        expense: 'Gasto',
        transfer: 'Transferencia',
        adjustment: 'Ajuste'
    };
    return types[type] || type;
}

function formatField(field) {
    const fields = {
        description: 'Descripción',
        amount: 'Monto',
        reference_type: 'Tipo Ref',
        platform: 'Plataforma',
        combined: 'Combinado'
    };
    return fields[field] || field;
}

function formatOperator(op) {
    const operators = {
        contains: 'Contiene',
        equals: 'Igual',
        starts_with: 'Comienza',
        ends_with: 'Termina',
        greater_than: 'Mayor',
        less_than: 'Menor',
        between: 'Entre'
    };
    return operators[op] || op;
}

// ── EDIT TRANSACTION ────────────────────────────────────────────
let _editTxBoatsLoaded = false;

async function editTransaction(id) {
    const tx = transactionsData.find(t => t.id === id);
    if (!tx) {
        // Fall back to fetching from API if not in local cache
        try {
            const r = await fetch(`/api/accounting/transactions/${id}`);
            if (!r.ok) { showEditTxToast('Transacción no encontrada', false); return; }
            openEditTxModal(await r.json());
        } catch(e) { showEditTxToast('Error al cargar transacción', false); }
        return;
    }
    openEditTxModal(tx);
}

async function openEditTxModal(tx) {
    // Populate account select from accountsData
    const accSel = document.getElementById('edit-tx-account');
    accSel.innerHTML = '<option value="">Seleccionar cuenta...</option>';
    accountsData.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.account_code} - ${a.account_name}`;
        accSel.appendChild(opt);
    });

    // Populate boat select (load once)
    if (!_editTxBoatsLoaded) {
        try {
            const br = await fetch('/api/fleet/boats');
            if (br.ok) {
                const boats = await br.json();
                const boatSel = document.getElementById('edit-tx-boat');
                boatSel.innerHTML = '<option value="">Sin asignar</option>';
                boats.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.id;
                    opt.textContent = b.name;
                    boatSel.appendChild(opt);
                });
                _editTxBoatsLoaded = true;
            }
        } catch(e) { /* non-fatal */ }
    }

    // Pre-fill fields
    document.getElementById('edit-tx-id').value          = tx.id;
    document.getElementById('edit-tx-date').value        = tx.transaction_date ? tx.transaction_date.split('T')[0] : '';
    document.getElementById('edit-tx-type').value        = tx.transaction_type || 'expense';
    document.getElementById('edit-tx-account').value     = tx.account_id || '';
    document.getElementById('edit-tx-description').value = tx.description || '';
    document.getElementById('edit-tx-amount').value      = parseFloat(tx.amount || 0).toFixed(2);
    document.getElementById('edit-tx-ref-type').value    = tx.reference_type || '';
    document.getElementById('edit-tx-boat').value        = tx.boat_id || '';
    document.getElementById('edit-tx-refid').value       = tx.reference_id || '';
    document.getElementById('edit-tx-notes').value       = tx.notes || '';

    document.getElementById('edit-tx-title').textContent =
        tx.transaction_type === 'income' ? 'Editar Ingreso' : 'Editar Gasto';
    document.getElementById('edit-tx-error').style.display = 'none';

    toggleEditTxFields();
    document.getElementById('edit-tx-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeEditTxModal() {
    document.getElementById('edit-tx-overlay').style.display = 'none';
    document.body.style.overflow = '';
}

function toggleEditTxFields() {
    const type = document.getElementById('edit-tx-type').value;
    const refIdGroup = document.getElementById('edit-tx-refid-group');
    refIdGroup.style.display = (type === 'income') ? 'block' : 'none';
}

async function saveEditedTransaction(event) {
    event.preventDefault();
    const errEl = document.getElementById('edit-tx-error');
    errEl.style.display = 'none';

    const id     = document.getElementById('edit-tx-id').value;
    const amount = parseFloat(document.getElementById('edit-tx-amount').value);

    if (!amount || amount <= 0) {
        errEl.textContent = 'El monto debe ser mayor que 0.';
        errEl.style.display = 'block';
        return;
    }

    const payload = {
        transaction_date : document.getElementById('edit-tx-date').value,
        transaction_type : document.getElementById('edit-tx-type').value,
        account_id       : document.getElementById('edit-tx-account').value,
        description      : document.getElementById('edit-tx-description').value.trim(),
        amount,
        reference_type   : document.getElementById('edit-tx-ref-type').value || null,
        boat_id          : document.getElementById('edit-tx-boat').value     || null,
        reference_id     : document.getElementById('edit-tx-refid').value    || null,
        notes            : document.getElementById('edit-tx-notes').value    || null,
        currency         : 'USD'
    };

    const saveBtn = document.getElementById('edit-tx-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
        const res = await fetch(`/api/accounting/transactions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            errEl.textContent = err.error || 'Error al guardar. Verifica los datos.';
            errEl.style.display = 'block';
            return;
        }

        closeEditTxModal();
        showEditTxToast('Transacción actualizada correctamente', true);
        await loadTransactions(); // refresh table
    } catch(e) {
        errEl.textContent = 'Error de conexión al guardar.';
        errEl.style.display = 'block';
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar cambios';
    }
}

let _editTxToastTimer;
function showEditTxToast(msg, ok) {
    const t = document.getElementById('edit-tx-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = ok ? '#16a34a' : '#dc2626';
    t.style.transform  = 'translateY(0)';
    t.style.opacity    = '1';
    clearTimeout(_editTxToastTimer);
    _editTxToastTimer = setTimeout(() => {
        t.style.transform = 'translateY(80px)';
        t.style.opacity   = '0';
    }, 3500);
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('edit-tx-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeEditTxModal();
        });
    }
});

function editRule(id) {
    alert('Función de edición próximamente');
}
