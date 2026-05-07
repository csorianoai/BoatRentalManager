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
        tab.addEventListener('click', async () => {
            const targetTab = tab.dataset.tab;
            
            // Remove active from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            
            // Add active to clicked tab and corresponding content
            tab.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            // Refresh data when switching to key tabs
            if (targetTab === 'transactions') {
                await loadTransactions();
            } else if (targetTab === 'deposits') {
                await loadDeposits();
                await loadReceivables();
            }
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
        await updateDashboard();
        
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Error al cargar datos');
    }
}

function showFutureDateBanner(show, endDate) {
    let banner = document.getElementById('future-date-banner');
    if (!show) { if (banner) banner.style.display = 'none'; return; }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'future-date-banner';
        banner.style.cssText = [
            'display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:8px',
            'background:#fef9c3;border:1px solid #fde047;color:#854d0e',
            'margin:8px 0 4px;font-size:13px;font-weight:500'
        ].join(';');
        const filtersPanel = document.querySelector('.filters-panel');
        if (filtersPanel && filtersPanel.parentNode) {
            filtersPanel.parentNode.insertBefore(banner, filtersPanel.nextSibling);
        }
    }
    banner.style.display = 'flex';
    banner.textContent = `⚠ La fecha de fin (${endDate}) es futura — no se mostrarán transacciones que aún no han ocurrido.`;
}

async function loadTransactions() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    const today = new Date().toISOString().slice(0, 10);
    showFutureDateBanner(endDate && endDate > today, endDate);

    const url = `/api/accounting/transactions?start_date=${startDate}&end_date=${endDate}&limit=100`;
    const response = await fetch(url);
    transactionsData = await response.json();
    
    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');
    const searchEl = document.getElementById('txSearch');
    const searchTerm = (searchEl ? searchEl.value : '').toLowerCase().trim();

    let rows = transactionsData;
    if (searchTerm) {
        rows = rows.filter(tx =>
            (tx.description || '').toLowerCase().includes(searchTerm) ||
            (tx.account_name || '').toLowerCase().includes(searchTerm) ||
            (tx.account_code || '').toLowerCase().includes(searchTerm) ||
            (tx.notes || '').toLowerCase().includes(searchTerm) ||
            String(tx.amount).includes(searchTerm)
        );
    }

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${searchTerm ? 'Sin resultados para "' + searchTerm + '"' : 'No hay transacciones en este período'}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = rows.map(tx => `
        <tr>
            <td>${formatDate(tx.transaction_date)}</td>
            <td><span class="badge badge-${tx.transaction_type}">${formatType(tx.transaction_type)}</span></td>
            <td>${tx.account_code} - ${tx.account_name}</td>
            <td>${tx.description || '-'}</td>
            <td>$${parseFloat(tx.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>${tx.reconciled === 1 ? '<span style="color:#16a34a;font-weight:600">✅ Reconciliado</span>' : '<span style="color:#64748b;font-size:12px" title="Esta transacción aún no se ha comparado contra el extracto bancario">Sin reconciliar</span>'}</td>
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

async function updateDashboard() {
    // Unreconciled count uses local transactionsData (raw movement list)
    const unreconciledTransactions = transactionsData.filter(t => t.reconciled === 0);
    const unreconciledAmount = unreconciledTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    document.getElementById('unreconciledCount').textContent = unreconciledTransactions.length;
    document.getElementById('unreconciledAmount').textContent = `$${unreconciledAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    // TRUE income/expense KPIs — use analysis endpoints filtered to current date range
    const startDate = document.getElementById('startDate').value;
    const endDate   = document.getElementById('endDate').value;
    try {
        const [incR, expR] = await Promise.all([
            fetch(`/api/accounting/income/analysis?from=${startDate}&to=${endDate}`),
            fetch(`/api/accounting/expenses/analysis?from=${startDate}&to=${endDate}`)
        ]);
        const incData = incR.ok ? await incR.json() : null;
        const expData = expR.ok ? await expR.json() : null;

        const totalIncome   = incData  ? incData.total_income    : 0;
        const incomeCount   = incData  ? incData.income_count    : 0;
        const totalExpenses = expData  ? expData.total_expenses  : 0;
        const expensesCount = expData  ? expData.expense_count   : 0;
        const netBalance    = totalIncome - totalExpenses;
        const profitMargin  = totalIncome > 0 ? ((netBalance / totalIncome) * 100).toFixed(1) : 0;

        document.getElementById('totalIncome').textContent    = `$${totalIncome.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        document.getElementById('incomeCount').textContent    = `${incomeCount} transacciones`;
        document.getElementById('totalExpenses').textContent  = `$${totalExpenses.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        document.getElementById('expensesCount').textContent  = `${expensesCount} transacciones`;
        document.getElementById('netBalance').textContent     = `$${Math.abs(netBalance).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        document.getElementById('profitMargin').textContent   = `${profitMargin}% margen`;

        updateCharts(totalIncome, totalExpenses);
    } catch(err) {
        console.error('updateDashboard KPI error:', err);
        // Fallback: unfiltered totals from loaded transactions
        const inc = transactionsData.filter(t => t.transaction_type === 'income').reduce((s,t)=>s+parseFloat(t.amount),0);
        const exp = transactionsData.filter(t => t.transaction_type === 'expense').reduce((s,t)=>s+parseFloat(t.amount),0);
        document.getElementById('totalIncome').textContent   = `$${inc.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        document.getElementById('totalExpenses').textContent = `$${exp.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        document.getElementById('netBalance').textContent    = `$${Math.abs(inc-exp).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        updateCharts(inc, exp);
    }
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
let _bdBrokers = [];
let _bdCustomers = [];
let _txAmountBdListener = null; // track so we can remove it later

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
    // Wire/unwire txAmount → balance preview
    const txAmountEl = document.getElementById('txAmount');
    if (txAmountEl) {
        if (_txAmountBdListener) txAmountEl.removeEventListener('input', _txAmountBdListener);
        if (is2500) {
            _txAmountBdListener = updateBdBalance;
            txAmountEl.addEventListener('input', _txAmountBdListener);
        } else {
            _txAmountBdListener = null;
        }
    }
    if (is2500) {
        // Load boats
        const boatSel = document.getElementById('bd-boat-id');
        if (boatSel && boatSel.options.length <= 1) {
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
        // Load brokers
        fetch('/api/brokers?active=true').then(r => r.json()).then(list => {
            _bdBrokers = list;
            const brkSel = document.getElementById('bd-broker-select');
            if (brkSel) {
                brkSel.innerHTML = '<option value="">-- Seleccionar broker --</option>';
                list.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.id;
                    opt.dataset.name = b.name;
                    opt.dataset.phone = b.phone || '';
                    opt.dataset.email = b.email || '';
                    opt.textContent = b.name;
                    brkSel.appendChild(opt);
                });
            }
        }).catch(() => {});
        // Load customers
        fetch('/api/customers').then(r => r.json()).then(list => {
            _bdCustomers = list;
            const custSel = document.getElementById('bd-customer-select');
            if (custSel) {
                custSel.innerHTML = '<option value="">-- Seleccionar o escribir abajo --</option>';
                list.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.dataset.name = c.name;
                    opt.dataset.phone = c.phone || '';
                    opt.dataset.email = c.email || '';
                    opt.textContent = c.name + (c.phone ? ` · ${c.phone}` : '');
                    custSel.appendChild(opt);
                });
            }
        }).catch(() => {});
    }
}

// Toggle between Directo / Broker panels
function setBdSource(source) {
    const isDirect = source === 'direct';
    document.getElementById('bd-panel-direct').style.display = isDirect ? 'block' : 'none';
    document.getElementById('bd-panel-broker').style.display = isDirect ? 'none' : 'block';
    // Update radio buttons
    document.getElementById('bd-source-direct').checked = isDirect;
    document.getElementById('bd-source-broker').checked = !isDirect;
    // Style labels
    const dLabel = document.getElementById('bd-source-direct-label');
    const bLabel = document.getElementById('bd-source-broker-label');
    dLabel.style.borderColor = isDirect ? '#0ea5e9' : '#d1d5db';
    dLabel.style.color = isDirect ? '#0369a1' : '#374151';
    bLabel.style.borderColor = isDirect ? '#d1d5db' : '#7c3aed';
    bLabel.style.color = isDirect ? '#374151' : '#7c3aed';
    // Update AR party label
    const partyLabel = document.getElementById('bd-ar-party-label');
    if (partyLabel) partyLabel.textContent = isDirect ? 'cliente' : 'broker';
    updateBdBalance();
}

function onBdCustomerSelect() {
    const sel = document.getElementById('bd-customer-select');
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return;
    document.getElementById('bd-customer-name').value = opt.dataset.name || '';
    document.getElementById('bd-customer-phone').value = opt.dataset.phone || '';
    document.getElementById('bd-customer-email').value = opt.dataset.email || '';
}

function onBdBrokerSelect() {
    const sel = document.getElementById('bd-broker-select');
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return;
    document.getElementById('bd-broker-name').value = opt.dataset.name || '';
    document.getElementById('bd-broker-phone').value = opt.dataset.phone || '';
    document.getElementById('bd-broker-email').value = opt.dataset.email || '';
}

function updateBdBalance() {
    const total = parseFloat(document.getElementById('bd-total-amount') && document.getElementById('bd-total-amount').value) || 0;
    const deposit = parseFloat(document.getElementById('txAmount') && document.getElementById('txAmount').value) || 0;
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
    // Determine booking source
    const source = document.querySelector('input[name="bd-source"]:checked')?.value || 'direct';
    const isBroker = source === 'broker';

    const bookingDate = document.getElementById('bd-booking-date').value;
    const totalAmount = document.getElementById('bd-total-amount').value;
    const depositAmount = document.getElementById('txAmount').value;
    const depositDate = document.getElementById('txDate').value;
    const boatId = document.getElementById('bd-boat-id').value;
    const hours = document.getElementById('bd-hours').value;
    const serviceType = document.getElementById('bd-service-type').value;
    const notes = document.getElementById('txDescription').value.trim();
    const ref = document.getElementById('bd-ref') ? document.getElementById('bd-ref').value.trim() : '';

    // Collect direct or broker fields
    let customerName = '', customerPhone = '', customerEmail = '', customerId = null;
    let brokerName = '', brokerPhone = '', brokerEmail = '', brokerId = null;
    let finalName = '', finalPhone = '', finalEmail = '';

    if (!isBroker) {
        const custSel = document.getElementById('bd-customer-select');
        customerId = custSel && custSel.value ? custSel.value : null;
        customerName = (document.getElementById('bd-customer-name').value || '').trim();
        customerPhone = (document.getElementById('bd-customer-phone').value || '').trim();
        customerEmail = (document.getElementById('bd-customer-email').value || '').trim();
        if (!customerName && !customerId) {
            alert('❌ El nombre del cliente es obligatorio'); return;
        }
    } else {
        const brkSel = document.getElementById('bd-broker-select');
        brokerId = brkSel && brkSel.value ? brkSel.value : null;
        brokerName = (document.getElementById('bd-broker-name').value || '').trim();
        brokerPhone = (document.getElementById('bd-broker-phone').value || '').trim();
        brokerEmail = (document.getElementById('bd-broker-email').value || '').trim();
        finalName = (document.getElementById('bd-final-name').value || '').trim();
        finalPhone = (document.getElementById('bd-final-phone').value || '').trim();
        finalEmail = (document.getElementById('bd-final-email').value || '').trim();
        if (!brokerName && !brokerId) {
            alert('❌ Selecciona o escribe el nombre del broker'); return;
        }
        if (!finalName) {
            alert('❌ El nombre del cliente final es obligatorio'); return;
        }
    }

    if (!bookingDate) { alert('❌ La fecha del booking es obligatoria'); return; }
    if (!totalAmount || parseFloat(totalAmount) <= 0) { alert('❌ El monto total del booking es obligatorio'); return; }
    if (!boatId) { alert('❌ Selecciona el barco'); return; }

    const displayName = isBroker ? (brokerName || 'Broker') : (customerName || 'Cliente');

    const body = {
        booking_source: source,
        // Direct
        customer_id: customerId,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        // Broker
        broker_id: brokerId,
        broker_name: brokerName || null,
        broker_phone: brokerPhone || null,
        broker_email: brokerEmail || null,
        final_customer_name: finalName || null,
        final_customer_phone: finalPhone || null,
        final_customer_email: finalEmail || null,
        // Common
        boat_id: boatId,
        booking_reference: ref || notes || null,
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
        const arParty = isBroker ? brokerName : (customerName || 'Cliente');
        let msg = `✅ Depósito registrado!\n\n${isBroker ? 'Broker' : 'Cliente'}: ${displayName}\nDepósito: $${parseFloat(depositAmount).toFixed(2)}\nTotal booking: $${parseFloat(totalAmount).toFixed(2)}`;
        if (isBroker && finalName) msg += `\nCliente final: ${finalName}`;
        if (balanceDue > 0) {
            msg += `\n\nSaldo pendiente: $${balanceDue.toFixed(2)}\nCuenta por Cobrar creada → ${arParty}`;
        }
        alert(msg);

        // Reset form
        document.getElementById('newTransactionForm').reset();
        document.getElementById('txDate').valueAsDate = new Date();
        document.getElementById('booking-deposit-section').style.display = 'none';
        document.getElementById('tx-submit-btn').textContent = '✅ Crear Transacción';
        document.getElementById('bd-balance-preview').style.display = 'none';
        // Reset broker/direct panels to default
        setBdSource('direct');
        document.getElementById('bd-customer-select').value = '';
        document.getElementById('bd-broker-select').value = '';

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

    const uploadZone = document.getElementById('uploadZone');
    const preview    = document.getElementById('importPreview');
    const results    = document.getElementById('importResults');

    if (uploadZone) uploadZone.style.opacity = '0.5';
    if (preview)    preview.style.display    = 'block';
    if (results)    results.innerHTML        = '<p style="color:#64748b;padding:12px 0">⏳ Procesando archivo, esto puede tomar unos segundos…</p>';

    try {
        const response = await fetch('/api/accounting/bank-statements/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            results.innerHTML = `
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-top:8px">
                <p style="color:#991b1b;font-weight:700;margin:0 0 8px">❌ ${result.error || 'Error al importar el archivo'}</p>
                ${result.error && result.error.includes('texto') ? `
                  <p style="color:#64748b;font-size:13px;margin:0">
                    Si tu extracto es un PDF escaneado (imagen), descarga la versión digital desde el portal de tu banco 
                    en formato <strong>CSV</strong> o <strong>OFX</strong>.
                  </p>` : ''}
              </div>`;
            return;
        }

        // ── Case 1: PDF with no auto-detected transactions → show raw text for manual review
        if (result.needsReview && result.imported === 0) {
            results.innerHTML = buildManualReviewUI(result);
            return;
        }

        // ── Case 2: PDF with detected transactions → show review table
        if (result.needsReview && result.imported > 0) {
            results.innerHTML = buildImportSuccessWithReview(result);
            await loadData();
            return;
        }

        // ── Case 3: CSV / OFX → standard success
        results.innerHTML = `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-top:8px">
            <p style="color:#065f46;font-weight:700;font-size:15px;margin:0 0 6px">
              ✅ ${result.imported} movimientos importados de <em>${result.fileName}</em>
            </p>
            <p style="color:#64748b;font-size:13px;margin:0">
              Ve a la pestaña <strong>🧠 Clasificación Inteligente</strong> para clasificar y registrar los movimientos.
            </p>
          </div>`;
        await loadData();

    } catch (error) {
        console.error('Error uploading file:', error);
        if (results) results.innerHTML = '<p style="color:#ef4444;font-weight:600;padding:12px 0">❌ Error de conexión. Intenta de nuevo.</p>';
    } finally {
        if (uploadZone) uploadZone.style.opacity = '1';
    }
}

function buildImportSuccessWithReview(result) {
    const rows = (result.statements || []).slice(0, 50).map((s, i) => `
      <tr>
        <td><input type="date" value="${(s.statement_date||'').slice(0,10)}" 
            onchange="pdfRows[${i}].statement_date=this.value"
            style="border:1px solid #e5e7eb;border-radius:4px;padding:3px 6px;font-size:12px;width:120px"></td>
        <td><input type="text" value="${(s.description||'').replace(/"/g,'&quot;')}"
            onchange="pdfRows[${i}].description=this.value"
            style="border:1px solid #e5e7eb;border-radius:4px;padding:3px 6px;font-size:12px;width:100%;min-width:180px"></td>
        <td><input type="number" step="0.01" value="${parseFloat(s.amount||0).toFixed(2)}"
            onchange="pdfRows[${i}].amount=parseFloat(this.value)"
            style="border:1px solid #e5e7eb;border-radius:4px;padding:3px 6px;font-size:12px;width:90px;text-align:right"></td>
        <td style="text-align:center">
          <button onclick="removePdfRow(${i})" style="background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:2px 8px;color:#991b1b;cursor:pointer;font-size:11px">✕</button>
        </td>
      </tr>`).join('');

    window.pdfRows = (result.statements || []).slice(0, 50).map(s => ({...s}));

    return `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-top:8px">
        <p style="color:#1e40af;font-weight:700;font-size:14px;margin:0 0 4px">
          🧠 ${result.imported} transacciones detectadas en ${result.fileName}
        </p>
        <p style="color:#64748b;font-size:12px;margin:0">
          Revisa y corrige las filas si es necesario, luego ve a <strong>🧠 Clasificación Inteligente</strong> para procesarlas.
        </p>
      </div>
      <div style="overflow-x:auto;margin-top:12px;max-height:360px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="position:sticky;top:0;background:#f8fafc">
            <tr>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;color:#64748b">Fecha</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;color:#64748b">Descripción</th>
              <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e5e7eb;color:#64748b">Monto</th>
              <th style="padding:6px 8px;border-bottom:2px solid #e5e7eb"></th>
            </tr>
          </thead>
          <tbody id="pdfReviewBody">${rows}</tbody>
        </table>
      </div>`;
}

function removePdfRow(i) {
    if (window.pdfRows) window.pdfRows.splice(i, 1);
    const tbody = document.getElementById('pdfReviewBody');
    if (tbody) { const row = tbody.querySelectorAll('tr')[i]; if (row) row.remove(); }
}

function buildManualReviewUI(result) {
    const escaped = (result.rawText || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-top:8px">
        <p style="color:#92400e;font-weight:700;font-size:14px;margin:0 0 6px">
          ⚠️ No se detectaron transacciones automáticamente en ${result.fileName}
        </p>
        <p style="color:#64748b;font-size:12px;margin:0 0 10px">
          El PDF fue leído correctamente pero el formato no pudo ser interpretado automáticamente.
          Descarga el extracto en formato <strong>CSV</strong> desde el portal de tu banco para mejor resultado,
          o revisa el texto extraído abajo para copiar los datos manualmente.
        </p>
        <details style="margin-top:8px">
          <summary style="cursor:pointer;color:#1e40af;font-size:12px;font-weight:600">
            📋 Ver texto extraído del PDF (para diagnóstico)
          </summary>
          <pre style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:12px;
                      font-size:11px;overflow-x:auto;max-height:300px;overflow-y:auto;
                      margin-top:8px;white-space:pre-wrap;word-break:break-word;color:#1a1a2e">${escaped.slice(0,3000)}</pre>
        </details>
      </div>`;
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

// ═══════════════════════════════════════════════════════════════
// CUADRE POR BOOKING — Booking Reconciliation Panel
// ═══════════════════════════════════════════════════════════════
async function loadBookingReconciliation() {
    const q = (document.getElementById('bkrec-search')?.value || '').trim();
    const bookingId = (document.getElementById('bkrec-booking-id')?.value || '').trim();
    if (!q && !bookingId) {
        document.getElementById('bkrec-results').innerHTML =
            '<p style="color:#94a3b8;text-align:center;padding:30px;">Ingresa el nombre del cliente o el ID del booking para buscar.</p>';
        return;
    }
    const panel = document.getElementById('bkrec-results');
    panel.innerHTML = '<p style="color:#64748b;text-align:center;padding:30px;">Cargando...</p>';

    const params = new URLSearchParams();
    if (bookingId) params.set('booking_id', bookingId);
    else params.set('q', q);

    try {
        const res = await fetch('/api/accounting/booking-reconciliation?' + params.toString());
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cargar');
        renderBookingReconciliation(data);
    } catch (err) {
        panel.innerHTML = `<p style="color:#dc2626;text-align:center;padding:20px;">Error: ${err.message}</p>`;
    }
}

function renderBookingReconciliation(data) {
    const panel = document.getElementById('bkrec-results');
    const { booking, journal_lines, summary, alerts } = data;

    if (!journal_lines || journal_lines.length === 0) {
        panel.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px;">No se encontraron transacciones para este criterio de búsqueda.</p>';
        return;
    }

    const fmt = (n) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' }) : '—';
    const netColor = summary.net >= 0 ? '#16a34a' : '#dc2626';

    // Booking header
    let bookingHtml = '';
    if (booking) {
        bookingHtml = `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;">
            <div>
                <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#64748b;letter-spacing:.5px;">Cliente</div>
                <div style="font-size:16px;font-weight:800;color:#1a1a2e;">${booking.customer_name || '—'}</div>
            </div>
            <div>
                <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#64748b;letter-spacing:.5px;">Fecha</div>
                <div style="font-size:14px;font-weight:600;color:#1a1a2e;">${fmtDate(booking.booking_date)}</div>
            </div>
            <div>
                <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#64748b;letter-spacing:.5px;">Total Reserva</div>
                <div style="font-size:14px;font-weight:700;color:#059669;">${fmt(booking.total_amount || 0)}</div>
            </div>
            <div>
                <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#64748b;letter-spacing:.5px;">Plataforma</div>
                <div style="font-size:13px;color:#475569;">${booking.platform || booking.boat_type || '—'}</div>
            </div>
            <div>
                <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#64748b;letter-spacing:.5px;">Estado</div>
                <div style="font-size:13px;color:#475569;">${booking.status || '—'}</div>
            </div>
            <div>
                <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#64748b;letter-spacing:.5px;">ID</div>
                <div style="font-size:11px;color:#94a3b8;font-family:monospace;">${booking.id}</div>
            </div>
        </div>`;
    }

    // P&L summary
    const summaryHtml = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;">
        <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:14px 16px;text-align:center;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Ingresos</div>
            <div style="font-size:24px;font-weight:900;color:#16a34a;">${fmt(summary.revenue)}</div>
        </div>
        <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:10px;padding:14px 16px;text-align:center;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Gastos</div>
            <div style="font-size:24px;font-weight:900;color:#dc2626;">${fmt(summary.expenses)}</div>
        </div>
        <div style="background:#f8fafc;border:2px solid #cbd5e1;border-radius:10px;padding:14px 16px;text-align:center;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Resultado Neto</div>
            <div style="font-size:24px;font-weight:900;color:${netColor};">${fmt(summary.net)}</div>
        </div>
    </div>`;

    // Alerts
    let alertsHtml = '';
    if (alerts && alerts.length > 0) {
        alertsHtml = `
        <div style="background:#fffbeb;border:1px solid #fde047;border-radius:10px;padding:12px 16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:700;color:#854d0e;margin-bottom:8px;">Alertas Contables</div>
            ${alerts.map(a => `
            <div style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-top:1px solid #fef08a;">
                <span style="font-size:16px;">${a.alert_type === 'unusual_spending' ? '⚠️' : 'ℹ️'}</span>
                <div style="flex:1;">
                    <div style="font-size:13px;font-weight:700;color:#92400e;">${a.title || a.alert_type}</div>
                    <div style="font-size:12px;color:#78350f;margin-top:3px;line-height:1.5;">${a.message || ''}</div>
                    <div style="font-size:11px;color:#64748b;margin-top:4px;">
                        Umbral: ${fmt(a.threshold_value || 0)} · Real: ${fmt(a.actual_value || 0)} · Estado: ${a.is_resolved ? 'Resuelto' : 'Pendiente'}
                    </div>
                </div>
            </div>`).join('')}
        </div>`;
    }

    // Role colors and labels
    const roleStyle = {
        revenue:  { bg: '#f0fdf4', border: '#86efac', label: 'Ingreso', color: '#16a34a' },
        expense:  { bg: '#fef2f2', border: '#fca5a5', label: 'Gasto',   color: '#dc2626' },
        debit:    { bg: '#f0f9ff', border: '#7dd3fc', label: 'Dr',      color: '#0284c7' },
        credit:   { bg: '#faf5ff', border: '#d8b4fe', label: 'Cr',      color: '#7c3aed' },
    };

    // Journal lines table
    const journalHtml = `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:13px;font-weight:700;color:#1a1a2e;">Asientos Contables (${summary.line_count} líneas)</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid #e5e7eb;">
                    <th style="padding:9px 12px;text-align:left;color:#64748b;font-weight:600;">Fecha</th>
                    <th style="padding:9px 12px;text-align:left;color:#64748b;font-weight:600;">Cuenta</th>
                    <th style="padding:9px 12px;text-align:left;color:#64748b;font-weight:600;">Descripción</th>
                    <th style="padding:9px 12px;text-align:center;color:#64748b;font-weight:600;">Rol P&L</th>
                    <th style="padding:9px 12px;text-align:right;color:#64748b;font-weight:600;">Monto</th>
                    <th style="padding:9px 12px;text-align:center;color:#64748b;font-weight:600;">Reconciliado</th>
                </tr>
            </thead>
            <tbody>
                ${journal_lines.map((line, i) => {
                    const rs = roleStyle[line.pl_role] || { bg: '#fff', border: '#e5e7eb', label: '—', color: '#64748b' };
                    const amtSign = line.amount < 0 ? '-' : '';
                    return `<tr style="border-bottom:1px solid #f1f5f9;background:${i % 2 === 0 ? '#fff' : '#fafafa'};">
                        <td style="padding:8px 12px;color:#475569;white-space:nowrap;">${fmtDate(line.transaction_date)}</td>
                        <td style="padding:8px 12px;">
                            <span style="font-family:monospace;font-size:11px;color:#64748b;">${line.account_code}</span>
                            <span style="color:#1e293b;margin-left:4px;">${line.account_name}</span>
                        </td>
                        <td style="padding:8px 12px;color:#475569;max-width:280px;">${line.description || '—'}</td>
                        <td style="padding:8px 12px;text-align:center;">
                            <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;
                                         background:${rs.bg};border:1px solid ${rs.border};color:${rs.color};">
                                ${rs.label}
                            </span>
                        </td>
                        <td style="padding:8px 12px;text-align:right;font-weight:600;color:${line.amount < 0 ? '#7c3aed' : '#0284c7'};">
                            ${amtSign}${fmt(line.amount)}
                        </td>
                        <td style="padding:8px 12px;text-align:center;">
                            ${line.reconciled ? '<span style="color:#16a34a;font-size:13px;">✅</span>' : '<span style="color:#94a3b8;font-size:11px;">Pendiente</span>'}
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>`;

    panel.innerHTML = bookingHtml + summaryHtml + alertsHtml + journalHtml;
}

// Init cuadre-booking tab
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab[data-tab="cuadre-booking"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = document.getElementById('bkrec-results');
            if (panel && panel.innerHTML.trim() === '') {
                panel.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px;">Ingresa el nombre del cliente o el ID del booking para buscar.</p>';
            }
        });
    });
});
