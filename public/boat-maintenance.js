// ===========================================================================
// FASE 10: BOAT MAINTENANCE & EXPENSE TRACKING FRONTEND
// ===========================================================================

// Global State
let boats = [];
let mechanics = [];
let expenses = [];
let scheduledExpenses = [];
let maintenanceRecords = [];
let workOrders = [];
let partsInventory = [];
let charts = {};
let editingExpenseId = null;
let editingScheduledExpenseId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await loadBoats();
  await loadMechanics();
  await loadExpenses();
  await loadScheduledExpenses();
  await loadMaintenanceRecords();
  await loadWorkOrders();
  await loadPartsInventory();
  await loadAnalytics();
  setDefaultDates();
});

// ===========================================================================
// TAB MANAGEMENT
// ===========================================================================

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      
      // Remove active class from all tabs and contents
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      document.querySelector(`[data-tab-content="${tabName}"]`).classList.add('active');
      
      // Refresh data for the active tab
      if (tabName === 'analytics') {
        loadAnalytics();
      }
    });
  });
}

// ===========================================================================
// DATA LOADING FUNCTIONS
// ===========================================================================

async function loadBoats() {
  try {
    const response = await fetch('/api/boats');
    boats = await response.json();
    
    // Populate all boat dropdowns
    const boatSelects = [
      'filter-boat-expenses', 'filter-boat-maintenance', 
      'expense-boat', 'maintenance-boat', 'work-order-boat'
    ];
    boatSelects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        // Clear existing options except first (placeholder)
        while (select.options.length > 1) {
          select.remove(1);
        }
        boats.forEach(boat => {
          const option = document.createElement('option');
          option.value = boat.id;
          option.textContent = boat.name;
          select.appendChild(option);
        });
      }
    });
  } catch (error) {
    console.error('Error loading boats:', error);
  }
}

async function loadMechanics() {
  try {
    const response = await fetch('/api/mechanics?status=active');
    mechanics = await response.json();
    
    // Populate mechanic dropdowns
    const mechanicSelects = [
      'expense-mechanic', 'maintenance-mechanic', 'work-order-mechanic'
    ];
    mechanicSelects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        while (select.options.length > 1) {
          select.remove(1);
        }
        mechanics.forEach(mechanic => {
          const option = document.createElement('option');
          option.value = mechanic.id;
          option.textContent = `${mechanic.name} - ${mechanic.specialty}`;
          select.appendChild(option);
        });
      }
    });
    
    // Load mechanics table
    renderMechanicsTable();
  } catch (error) {
    console.error('Error loading mechanics:', error);
  }
}

async function loadExpenses() {
  try {
    const boatId = document.getElementById('filter-boat-expenses').value;
    const category = document.getElementById('filter-category').value;
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    
    let url = '/api/boat-expenses?';
    if (boatId) url += `boat_id=${boatId}&`;
    if (category) url += `category=${category}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    
    const response = await fetch(url);
    expenses = await response.json();
    renderExpenses();
  } catch (error) {
    console.error('Error loading expenses:', error);
  }
}

async function loadMaintenanceRecords() {
  try {
    const boatId = document.getElementById('filter-boat-maintenance').value;
    const serviceType = document.getElementById('filter-service-type').value;
    
    let url = '/api/maintenance-records?';
    if (boatId) url += `boat_id=${boatId}&`;
    if (serviceType) url += `service_type=${serviceType}&`;
    
    const response = await fetch(url);
    maintenanceRecords = await response.json();
    renderMaintenanceRecords();
  } catch (error) {
    console.error('Error loading maintenance records:', error);
  }
}

async function loadWorkOrders() {
  try {
    const status = document.getElementById('filter-work-order-status').value;
    const priority = document.getElementById('filter-work-order-priority').value;
    
    let url = '/api/work-orders?';
    if (status) url += `status=${status}&`;
    if (priority) url += `priority=${priority}&`;
    
    const response = await fetch(url);
    workOrders = await response.json();
    renderWorkOrders();
  } catch (error) {
    console.error('Error loading work orders:', error);
  }
}

async function loadPartsInventory() {
  try {
    const category = document.getElementById('filter-part-category').value;
    const lowStock = document.getElementById('filter-low-stock').checked;
    
    let url = '/api/parts-inventory?';
    if (category) url += `category=${category}&`;
    if (lowStock) url += 'low_stock=true&';
    
    const response = await fetch(url);
    partsInventory = await response.json();
    renderPartsInventory();
    renderLowStockAlerts();
  } catch (error) {
    console.error('Error loading parts inventory:', error);
  }
}

async function loadAnalytics() {
  try {
    // Get current month date range
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const startDate = firstDay.toISOString().split('T')[0];
    const endDate = lastDay.toISOString().split('T')[0];
    
    // Load expense analytics
    const expenseResponse = await fetch(`/api/boat-expenses/analytics?start_date=${startDate}&end_date=${endDate}`);
    const expenseAnalytics = await expenseResponse.json();
    
    // Update stat cards
    document.getElementById('stat-total-expenses').textContent = 
      `$${parseFloat(expenseAnalytics.overall.total_expenses || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    
    document.getElementById('stat-maintenance-count').textContent = 
      maintenanceRecords.length;
    
    document.getElementById('stat-pending-orders').textContent = 
      workOrders.filter(wo => wo.status === 'pending' || wo.status === 'assigned').length;
    
    const lowStockParts = partsInventory.filter(p => p.quantity <= p.min_stock_level);
    document.getElementById('stat-low-stock').textContent = lowStockParts.length;
    
    // Render charts
    renderExpensesByCategoryChart(expenseAnalytics.byCategory);
    renderExpensesTrendChart();
    renderExpensesByBoatChart();
    renderExpensesByCategoryAndBoatChart();
    
    // Render upcoming scheduled expenses summary
    renderUpcomingScheduledSummary();
  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

// ===========================================================================
// RENDERING FUNCTIONS
// ===========================================================================

function renderExpenses() {
  const container = document.getElementById('expenses-container');
  
  if (expenses.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No se encontraron gastos</p>';
    return;
  }
  
  container.innerHTML = expenses.map(expense => `
    <div class="card" data-testid="card-expense-${expense.id}">
      <div class="card-header">
        <div class="card-title">${expense.boat_name || 'Barco Desconocido'}</div>
        <span class="card-badge badge-${expense.category}">${getCategoryLabel(expense.category)}</span>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">Monto:</span>
          <span class="card-value" style="color: #dc3545; font-size: 18px;">$${parseFloat(expense.amount).toFixed(2)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Fecha:</span>
          <span class="card-value">${formatDate(expense.expense_date)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Descripción:</span>
          <span class="card-value">${expense.description}</span>
        </div>
        ${expense.mechanic_name ? `
        <div class="card-row">
          <span class="card-label">Mecánico:</span>
          <span class="card-value">${expense.mechanic_name}</span>
        </div>
        ` : ''}
        ${expense.fuel_gallons ? `
        <div class="card-row">
          <span class="card-label">Combustible:</span>
          <span class="card-value">${expense.fuel_gallons} galones</span>
        </div>
        ` : ''}
        <div class="card-row">
          <span class="card-label">Sincronizado:</span>
          <span class="card-value">${expense.synced_to_accounting ? '✅ Sí' : '⏳ Pendiente'}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" onclick="editExpense('${expense.id}')" data-testid="button-edit-expense-${expense.id}">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteExpense('${expense.id}')" data-testid="button-delete-expense-${expense.id}">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function renderMaintenanceRecords() {
  const container = document.getElementById('maintenance-container');
  
  if (maintenanceRecords.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No se encontraron registros de mantenimiento</p>';
    return;
  }
  
  container.innerHTML = maintenanceRecords.map(record => `
    <div class="card" data-testid="card-maintenance-${record.id}">
      <div class="card-header">
        <div class="card-title">${record.boat_name || 'Barco Desconocido'}</div>
        <span class="card-badge badge-${record.status}">${getStatusLabel(record.status)}</span>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">Servicio:</span>
          <span class="card-value">${getServiceTypeLabel(record.service_type)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Fecha:</span>
          <span class="card-value">${formatDate(record.service_date)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Costo Total:</span>
          <span class="card-value" style="color: #dc3545;">$${parseFloat(record.total_cost).toFixed(2)}</span>
        </div>
        ${record.mechanic_name ? `
        <div class="card-row">
          <span class="card-label">Mecánico:</span>
          <span class="card-value">${record.mechanic_name}</span>
        </div>
        ` : ''}
        <div class="card-row">
          <span class="card-label">Descripción:</span>
          <span class="card-value">${record.description}</span>
        </div>
        ${record.next_service_date ? `
        <div class="card-row">
          <span class="card-label">Próximo:</span>
          <span class="card-value">${formatDate(record.next_service_date)}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function renderWorkOrders() {
  const container = document.getElementById('work-orders-container');
  
  if (workOrders.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No se encontraron órdenes de trabajo</p>';
    return;
  }
  
  container.innerHTML = workOrders.map(order => `
    <div class="card" data-testid="card-work-order-${order.id}">
      <div class="card-header">
        <div class="card-title">${order.title}</div>
        <div>
          <span class="card-badge badge-${order.priority}">${getPriorityLabel(order.priority)}</span>
          <span class="card-badge badge-${order.status}" style="margin-left: 6px;">${getStatusLabel(order.status)}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">Barco:</span>
          <span class="card-value">${order.boat_name || 'Desconocido'}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Descripción:</span>
          <span class="card-value">${order.description}</span>
        </div>
        ${order.mechanic_name ? `
        <div class="card-row">
          <span class="card-label">Asignado a:</span>
          <span class="card-value">${order.mechanic_name}</span>
        </div>
        ` : ''}
        ${order.scheduled_date ? `
        <div class="card-row">
          <span class="card-label">Programado:</span>
          <span class="card-value">${formatDate(order.scheduled_date)}</span>
        </div>
        ` : ''}
        ${order.estimated_cost ? `
        <div class="card-row">
          <span class="card-label">Costo Est.:</span>
          <span class="card-value">$${parseFloat(order.estimated_cost).toFixed(2)}</span>
        </div>
        ` : ''}
      </div>
      <div class="card-actions">
        ${order.status !== 'completed' && order.status !== 'cancelled' ? `
          <button class="btn btn-success btn-sm" onclick="completeWorkOrder('${order.id}')" data-testid="button-complete-${order.id}">Completar</button>
        ` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteWorkOrder('${order.id}')" data-testid="button-delete-work-order-${order.id}">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function renderPartsInventory() {
  const tbody = document.getElementById('parts-table-body');
  
  if (partsInventory.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666; padding: 40px;">No se encontraron partes</td></tr>';
    return;
  }
  
  tbody.innerHTML = partsInventory.map(part => {
    const stockStatus = part.quantity <= part.min_stock_level ? 
      (part.quantity === 0 ? 'stock-critical' : 'stock-low') : 'stock-ok';
    
    return `
      <tr data-testid="row-part-${part.id}">
        <td>
          <span class="stock-indicator ${stockStatus}"></span>
          ${part.part_name}
        </td>
        <td>${part.part_number || 'N/A'}</td>
        <td>${getCategoryLabel(part.category)}</td>
        <td><strong>${part.quantity}</strong> / ${part.min_stock_level}</td>
        <td>$${parseFloat(part.unit_cost).toFixed(2)}</td>
        <td>${part.supplier || 'N/A'}</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="restockPart('${part.id}')" data-testid="button-restock-${part.id}">Reabastecer</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderMechanicsTable() {
  const tbody = document.getElementById('mechanics-table-body');
  
  if (mechanics.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #666; padding: 40px;">No se encontraron mecánicos</td></tr>';
    return;
  }
  
  tbody.innerHTML = mechanics.map(mechanic => {
    const rating = mechanic.rating ? parseFloat(mechanic.rating).toFixed(1) : 'N/A';
    const ratingDisplay = mechanic.rating ? `⭐ ${rating}` : 'N/A';
    
    return `
      <tr data-testid="row-mechanic-${mechanic.id}">
        <td><strong>${mechanic.name}</strong></td>
        <td>${getSpecialtyLabel(mechanic.specialty)}</td>
        <td>${mechanic.phone}</td>
        <td>$${parseFloat(mechanic.hourly_rate).toFixed(2)}/hr</td>
        <td>${ratingDisplay}</td>
        <td>${mechanic.total_jobs || 0}</td>
        <td>
          <span class="card-badge badge-${mechanic.status}">${mechanic.status === 'active' ? 'Activo' : 'Inactivo'}</span>
        </td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="viewMechanicHistory('${mechanic.id}')" data-testid="button-view-history-${mechanic.id}">Historial</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderLowStockAlerts() {
  const container = document.getElementById('low-stock-alerts');
  const lowStockParts = partsInventory.filter(p => p.quantity <= p.min_stock_level);
  
  if (lowStockParts.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = lowStockParts.map(part => `
    <div class="alert ${part.quantity === 0 ? 'alert-danger' : 'alert-warning'}">
      <span class="alert-icon">${part.quantity === 0 ? '🚨' : '⚠️'}</span>
      <div>
        <strong>${part.part_name}</strong> - 
        ${part.quantity === 0 ? 'SIN STOCK' : `Stock bajo: ${part.quantity} unidades (mín: ${part.min_stock_level})`}
      </div>
    </div>
  `).join('');
}

// ===========================================================================
// CHARTS
// ===========================================================================

function renderExpensesByCategoryChart(categoryData) {
  const ctx = document.getElementById('chart-expenses-category');
  
  if (charts.expensesCategory) {
    charts.expensesCategory.destroy();
  }
  
  charts.expensesCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categoryData.map(d => getCategoryLabel(d.category)),
      datasets: [{
        data: categoryData.map(d => parseFloat(d.total)),
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
          '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

function renderExpensesTrendChart() {
  const ctx = document.getElementById('chart-expenses-trend');
  
  // Group expenses by month
  const monthlyData = {};
  expenses.forEach(expense => {
    const month = expense.expense_date.substring(0, 7);
    monthlyData[month] = (monthlyData[month] || 0) + parseFloat(expense.amount);
  });
  
  const sortedMonths = Object.keys(monthlyData).sort();
  const last6Months = sortedMonths.slice(-6);
  
  if (charts.expensesTrend) {
    charts.expensesTrend.destroy();
  }
  
  charts.expensesTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: last6Months.map(m => {
        const [year, month] = m.split('-');
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
      }),
      datasets: [{
        label: 'Gastos Mensuales',
        data: last6Months.map(m => monthlyData[m]),
        borderColor: '#0066cc',
        backgroundColor: 'rgba(0, 102, 204, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => `$${value.toLocaleString()}`
          }
        }
      }
    }
  });
}

function renderExpensesByBoatChart() {
  const ctx = document.getElementById('chart-expenses-by-boat');
  
  // Group expenses by boat
  const boatData = {};
  expenses.forEach(expense => {
    const boatName = expense.boat_name || 'Desconocido';
    boatData[boatName] = (boatData[boatName] || 0) + parseFloat(expense.amount);
  });
  
  const boatNames = Object.keys(boatData);
  const boatTotals = Object.values(boatData);
  
  if (charts.expensesByBoat) {
    charts.expensesByBoat.destroy();
  }
  
  charts.expensesByBoat = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: boatNames,
      datasets: [{
        label: 'Total Gastos',
        data: boatTotals,
        backgroundColor: '#0066cc',
        borderColor: '#004c99',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => `$${value.toLocaleString()}`
          }
        }
      }
    }
  });
}

function renderExpensesByCategoryAndBoatChart() {
  const ctx = document.getElementById('chart-expenses-category-boat');
  
  // Get unique boats and categories
  const boats = [...new Set(expenses.map(e => e.boat_name || 'Desconocido'))];
  const categories = [...new Set(expenses.map(e => e.category))];
  
  // Create datasets for each category
  const datasets = categories.map((category, index) => {
    const categoryExpenses = boats.map(boat => {
      const total = expenses
        .filter(e => (e.boat_name || 'Desconocido') === boat && e.category === category)
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);
      return total;
    });
    
    const colors = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
      '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
    ];
    
    return {
      label: getCategoryLabel(category),
      data: categoryExpenses,
      backgroundColor: colors[index % colors.length],
      borderColor: colors[index % colors.length],
      borderWidth: 1
    };
  });
  
  if (charts.expensesCategoryBoat) {
    charts.expensesCategoryBoat.destroy();
  }
  
  charts.expensesCategoryBoat = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: boats,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: {
              size: 10
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            callback: value => `$${value.toLocaleString()}`
          }
        }
      }
    }
  });
}

// ===========================================================================
// MODAL FUNCTIONS
// ===========================================================================

function openExpenseModal() {
  editingExpenseId = null;
  document.getElementById('modal-expense').classList.add('active');
  document.getElementById('form-expense').reset();
  document.getElementById('expense-date').valueAsDate = new Date();
  document.querySelector('#modal-expense .modal-title').textContent = 'Nuevo Gasto';
}

function closeExpenseModal() {
  editingExpenseId = null;
  document.getElementById('modal-expense').classList.remove('active');
}

function openMaintenanceModal() {
  document.getElementById('modal-maintenance').classList.add('active');
  document.getElementById('form-maintenance').reset();
  document.getElementById('maintenance-service-date').valueAsDate = new Date();
}

function closeMaintenanceModal() {
  document.getElementById('modal-maintenance').classList.remove('active');
}

function openWorkOrderModal() {
  document.getElementById('modal-work-order').classList.add('active');
  document.getElementById('form-work-order').reset();
}

function closeWorkOrderModal() {
  document.getElementById('modal-work-order').classList.remove('active');
}

function openPartModal() {
  document.getElementById('modal-part').classList.add('active');
  document.getElementById('form-part').reset();
}

function closePartModal() {
  document.getElementById('modal-part').classList.remove('active');
}

function openMechanicModal() {
  document.getElementById('modal-mechanic').classList.add('active');
  document.getElementById('form-mechanic').reset();
}

function closeMechanicModal() {
  document.getElementById('modal-mechanic').classList.remove('active');
}

// ===========================================================================
// SAVE FUNCTIONS
// ===========================================================================

async function saveExpense(event) {
  event.preventDefault();
  
  const data = {
    boat_id: document.getElementById('expense-boat').value,
    category: document.getElementById('expense-category').value,
    amount: parseFloat(document.getElementById('expense-amount').value),
    expense_date: document.getElementById('expense-date').value,
    description: document.getElementById('expense-description').value,
    mechanic_id: document.getElementById('expense-mechanic').value || null,
    fuel_gallons: parseFloat(document.getElementById('expense-fuel-gallons').value) || null,
    fuel_station: document.getElementById('expense-fuel-station').value || null
  };
  
  try {
    const isEditing = editingExpenseId !== null;
    const url = isEditing ? `/api/boat-expenses/${editingExpenseId}` : '/api/boat-expenses';
    const method = isEditing ? 'PATCH' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeExpenseModal();
      editingExpenseId = null;
      await loadExpenses();
      await loadAnalytics();
      alert(isEditing ? 'Gasto actualizado exitosamente' : 'Gasto guardado exitosamente y sincronizado con contabilidad');
    } else {
      alert('Error al guardar el gasto');
    }
  } catch (error) {
    console.error('Error saving expense:', error);
    alert('Error al guardar el gasto');
  }
}

async function saveMaintenanceRecord(event) {
  event.preventDefault();
  
  const data = {
    boat_id: document.getElementById('maintenance-boat').value,
    service_type: document.getElementById('maintenance-service-type').value,
    description: document.getElementById('maintenance-description').value,
    mechanic_id: document.getElementById('maintenance-mechanic').value || null,
    labor_hours: parseFloat(document.getElementById('maintenance-labor-hours').value) || 0,
    parts_cost: parseFloat(document.getElementById('maintenance-parts-cost').value) || 0,
    labor_cost: parseFloat(document.getElementById('maintenance-labor-cost').value) || 0,
    total_cost: parseFloat(document.getElementById('maintenance-total-cost').value),
    service_date: document.getElementById('maintenance-service-date').value,
    next_service_date: document.getElementById('maintenance-next-service').value || null,
    engine_hours_at_service: parseInt(document.getElementById('maintenance-engine-hours').value) || null
  };
  
  try {
    const response = await fetch('/api/maintenance-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeMaintenanceModal();
      await loadMaintenanceRecords();
      await loadAnalytics();
      alert('Registro de mantenimiento guardado exitosamente');
    } else {
      alert('Error al guardar el registro');
    }
  } catch (error) {
    console.error('Error saving maintenance record:', error);
    alert('Error al guardar el registro');
  }
}

async function saveWorkOrder(event) {
  event.preventDefault();
  
  const data = {
    boat_id: document.getElementById('work-order-boat').value,
    title: document.getElementById('work-order-title').value,
    description: document.getElementById('work-order-description').value,
    priority: document.getElementById('work-order-priority').value,
    mechanic_id: document.getElementById('work-order-mechanic').value || null,
    scheduled_date: document.getElementById('work-order-scheduled-date').value || null,
    estimated_cost: parseFloat(document.getElementById('work-order-estimated-cost').value) || null,
    estimated_hours: parseFloat(document.getElementById('work-order-estimated-hours').value) || null
  };
  
  try {
    const response = await fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeWorkOrderModal();
      await loadWorkOrders();
      await loadAnalytics();
      alert('Orden de trabajo creada exitosamente');
    } else {
      alert('Error al crear la orden');
    }
  } catch (error) {
    console.error('Error saving work order:', error);
    alert('Error al crear la orden');
  }
}

async function savePart(event) {
  event.preventDefault();
  
  const data = {
    part_name: document.getElementById('part-name').value,
    part_number: document.getElementById('part-number').value || null,
    category: document.getElementById('part-category').value,
    quantity: parseInt(document.getElementById('part-quantity').value),
    unit_cost: parseFloat(document.getElementById('part-unit-cost').value),
    min_stock_level: parseInt(document.getElementById('part-min-stock').value),
    supplier: document.getElementById('part-supplier').value || null,
    supplier_phone: document.getElementById('part-supplier-phone').value || null
  };
  
  try {
    const response = await fetch('/api/parts-inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closePartModal();
      await loadPartsInventory();
      await loadAnalytics();
      alert('Parte agregada exitosamente');
    } else {
      alert('Error al agregar la parte');
    }
  } catch (error) {
    console.error('Error saving part:', error);
    alert('Error al agregar la parte');
  }
}

async function saveMechanic(event) {
  event.preventDefault();
  
  const data = {
    name: document.getElementById('mechanic-name').value,
    phone: document.getElementById('mechanic-phone').value,
    email: document.getElementById('mechanic-email').value || null,
    specialty: document.getElementById('mechanic-specialty').value,
    hourly_rate: parseFloat(document.getElementById('mechanic-hourly-rate').value),
    notes: document.getElementById('mechanic-notes').value || null
  };
  
  try {
    const response = await fetch('/api/mechanics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeMechanicModal();
      await loadMechanics();
      alert('Mecánico agregado exitosamente');
    } else {
      alert('Error al agregar el mecánico');
    }
  } catch (error) {
    console.error('Error saving mechanic:', error);
    alert('Error al agregar el mecánico');
  }
}

// ===========================================================================
// ACTION FUNCTIONS
// ===========================================================================

async function deleteExpense(id) {
  if (!confirm('¿Está seguro de eliminar este gasto?')) return;
  
  try {
    const response = await fetch(`/api/boat-expenses/${id}`, { method: 'DELETE' });
    if (response.ok) {
      await loadExpenses();
      await loadAnalytics();
      alert('Gasto eliminado exitosamente');
    } else {
      alert('Error al eliminar el gasto');
    }
  } catch (error) {
    console.error('Error deleting expense:', error);
    alert('Error al eliminar el gasto');
  }
}

async function editExpense(id) {
  // Find the expense in the current expenses array (coerce to string for comparison)
  const expense = expenses.find(e => String(e.id) === String(id));
  if (!expense) {
    alert('Gasto no encontrado');
    return;
  }
  
  // Set editing mode
  editingExpenseId = id;
  
  // Open modal and populate form
  document.getElementById('modal-expense').classList.add('active');
  document.querySelector('#modal-expense .modal-title').textContent = 'Editar Gasto';
  
  // Populate form fields
  document.getElementById('expense-boat').value = expense.boat_id || '';
  document.getElementById('expense-category').value = expense.category || '';
  document.getElementById('expense-amount').value = expense.amount || '';
  document.getElementById('expense-date').value = expense.expense_date || '';
  document.getElementById('expense-description').value = expense.description || '';
  document.getElementById('expense-mechanic').value = expense.mechanic_id || '';
  document.getElementById('expense-fuel-gallons').value = expense.fuel_gallons || '';
  document.getElementById('expense-fuel-station').value = expense.fuel_station || '';
}

async function deleteWorkOrder(id) {
  if (!confirm('¿Está seguro de eliminar esta orden?')) return;
  
  try {
    const response = await fetch(`/api/work-orders/${id}`, { method: 'DELETE' });
    if (response.ok) {
      await loadWorkOrders();
      await loadAnalytics();
      alert('Orden eliminada exitosamente');
    } else {
      alert('Error al eliminar la orden');
    }
  } catch (error) {
    console.error('Error deleting work order:', error);
    alert('Error al eliminar la orden');
  }
}

async function completeWorkOrder(id) {
  const actualCost = prompt('Costo real (opcional):');
  const actualHours = prompt('Horas reales (opcional):');
  
  try {
    const response = await fetch(`/api/work-orders/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_cost: actualCost ? parseFloat(actualCost) : null,
        actual_hours: actualHours ? parseFloat(actualHours) : null
      })
    });
    
    if (response.ok) {
      await loadWorkOrders();
      await loadAnalytics();
      alert('Orden completada exitosamente');
    } else {
      alert('Error al completar la orden');
    }
  } catch (error) {
    console.error('Error completing work order:', error);
    alert('Error al completar la orden');
  }
}

async function restockPart(id) {
  const quantity = prompt('Cantidad a reabastecer:');
  if (!quantity || quantity <= 0) return;
  
  try {
    const response = await fetch(`/api/parts-inventory/${id}/restock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: parseInt(quantity) })
    });
    
    if (response.ok) {
      await loadPartsInventory();
      await loadAnalytics();
      alert('Parte reabastecida exitosamente');
    } else {
      alert('Error al reabastecer');
    }
  } catch (error) {
    console.error('Error restocking part:', error);
    alert('Error al reabastecer');
  }
}

async function viewMechanicHistory(id) {
  try {
    const response = await fetch(`/api/mechanics/${id}/work-history`);
    const history = await response.json();
    
    if (history.length === 0) {
      alert('Este mecánico no tiene historial de trabajos');
      return;
    }
    
    const historyText = history.map(job => 
      `${formatDate(job.service_date)} - ${job.boat_name}: ${job.service_type} - $${parseFloat(job.total_cost).toFixed(2)}`
    ).join('\n');
    
    alert(`Historial de Trabajos:\n\n${historyText}`);
  } catch (error) {
    console.error('Error fetching mechanic history:', error);
    alert('Error al cargar el historial');
  }
}

// ===========================================================================
// UTILITY FUNCTIONS
// ===========================================================================

function setDefaultDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  document.getElementById('filter-start-date').valueAsDate = firstDay;
  document.getElementById('filter-end-date').valueAsDate = lastDay;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  // Handle both date-only strings and ISO format
  const date = dateString.includes('T') ? new Date(dateString) : new Date(dateString + 'T00:00:00');
  // Check if date is valid
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getCategoryLabel(category) {
  const labels = {
    fuel: 'Combustible',
    maintenance_parts: 'Partes',
    labor: 'Mano de Obra',
    cleaning: 'Limpieza',
    marina_fees: 'Marina',
    insurance: 'Seguro',
    emergency_repairs: 'Emergencia',
    operational: 'Operacional',
    batteries: 'Baterías',
    oils: 'Aceites',
    filters: 'Filtros',
    belts: 'Correas',
    spark_plugs: 'Bujías',
    impellers: 'Impulsores',
    anodes: 'Ánodos',
    electrical: 'Eléctrico',
    safety: 'Seguridad',
    other: 'Otros'
  };
  return labels[category] || category;
}

function getServiceTypeLabel(type) {
  const labels = {
    engine_oil_change: 'Cambio de Aceite',
    engine_service: 'Servicio Motor',
    hull_cleaning: 'Limpieza Casco',
    electrical_repair: 'Reparación Eléctrica',
    propeller_service: 'Servicio Hélice',
    fuel_system: 'Sistema Combustible',
    cooling_system: 'Sistema Enfriamiento',
    safety_inspection: 'Inspección Seguridad',
    general_maintenance: 'Mantenimiento General',
    emergency_repair: 'Reparación Emergencia'
  };
  return labels[type] || type;
}

function getStatusLabel(status) {
  const labels = {
    pending: 'Pendiente',
    assigned: 'Asignado',
    in_progress: 'En Progreso',
    completed: 'Completado',
    cancelled: 'Cancelado',
    scheduled: 'Programado'
  };
  return labels[status] || status;
}

function getPriorityLabel(priority) {
  const labels = {
    low: 'Baja',
    medium: 'Media',
    high: 'Alta',
    critical: 'Crítica'
  };
  return labels[priority] || priority;
}

function getSpecialtyLabel(specialty) {
  const labels = {
    engine_repair: 'Motores',
    electrical: 'Eléctrico',
    hull: 'Casco',
    propulsion: 'Propulsión',
    fiberglass: 'Fibra de Vidrio',
    general: 'General'
  };
  return labels[specialty] || specialty;
}

// ===========================================================================
// SCHEDULED EXPENSES FUNCTIONS
// ===========================================================================

async function loadScheduledExpenses() {
  try {
    const boatFilter = document.getElementById('filter-boat-scheduled')?.value || '';
    const statusFilter = document.getElementById('filter-status-scheduled')?.value || '';
    const recurrenceFilter = document.getElementById('filter-recurrence-type')?.value || '';
    
    let url = '/api/scheduled-expenses?';
    if (boatFilter) url += `boat_id=${boatFilter}&`;
    if (statusFilter) url += `status=${statusFilter}&`;
    if (recurrenceFilter) url += `recurrence_type=${recurrenceFilter}&`;
    
    const response = await fetch(url);
    scheduledExpenses = await response.json();
    renderScheduledExpenses();
    
    // Populate filter dropdowns with boats
    const boatSelect = document.getElementById('filter-boat-scheduled');
    if (boatSelect) {
      boatSelect.innerHTML = '<option value="">Todos los barcos</option>' +
        boats.map(boat => `<option value="${boat.id}">${boat.name}</option>`).join('');
    }
    const modalBoatSelect = document.getElementById('scheduled-expense-boat');
    if (modalBoatSelect) {
      modalBoatSelect.innerHTML = '<option value="">Seleccionar barco</option>' +
        boats.map(boat => `<option value="${boat.id}">${boat.name}</option>`).join('');
    }
  } catch (error) {
    console.error('Error loading scheduled expenses:', error);
  }
}

function renderScheduledExpenses() {
  const container = document.getElementById('scheduled-expenses-container');
  
  if (scheduledExpenses.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No se encontraron gastos programados</p>';
    return;
  }
  
  container.innerHTML = scheduledExpenses.map(expense => {
    const urgency = getUrgencyInfo(expense.scheduled_date, expense.status);
    const recurrenceLabel = getRecurrenceLabel(expense.recurrence_type, expense.recurrence_interval);
    
    return `
    <div class="card" data-testid="card-scheduled-expense-${expense.id}" style="border-left: 4px solid ${urgency.color};">
      <div class="card-header">
        <div class="card-title">${expense.boat_name || 'Barco Desconocido'}</div>
        <span class="card-badge badge-${expense.category}">${getCategoryLabel(expense.category)}</span>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">Monto:</span>
          <span class="card-value" style="color: #dc3545; font-size: 18px;">$${parseFloat(expense.amount).toFixed(2)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Fecha Programada:</span>
          <span class="card-value" style="font-weight: 600; color: ${urgency.color};">
            ${formatDate(expense.scheduled_date)} ${urgency.label}
          </span>
        </div>
        <div class="card-row">
          <span class="card-label">Descripción:</span>
          <span class="card-value">${expense.description}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Recurrencia:</span>
          <span class="card-value">${recurrenceLabel}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Estado:</span>
          <span class="card-value" style="font-weight: 600; color: ${getStatusColor(expense.status)};">
            ${getScheduledStatusLabel(expense.status)}
          </span>
        </div>
        ${expense.notes ? `
        <div class="card-row">
          <span class="card-label">Notas:</span>
          <span class="card-value">${expense.notes}</span>
        </div>
        ` : ''}
      </div>
      <div class="card-actions">
        ${expense.status === 'pending' ? `
          <button class="btn btn-success btn-sm" onclick="markScheduledExpenseAsPaid('${expense.id}')" data-testid="button-mark-paid-${expense.id}">
            ✓ Marcar como Pagado
          </button>
        ` : ''}
        <button class="btn btn-primary btn-sm" onclick="editScheduledExpense('${expense.id}')" data-testid="button-edit-scheduled-${expense.id}">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteScheduledExpense('${expense.id}')" data-testid="button-delete-scheduled-${expense.id}">Eliminar</button>
      </div>
    </div>
  `}).join('');
}

function getDaysUntilDue(scheduledDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(scheduledDate);
  dueDate.setHours(0, 0, 0, 0);
  const diffTime = dueDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getUrgencyInfo(scheduledDate, status) {
  if (status !== 'pending') {
    return { color: '#666', label: '', days: 0 };
  }
  
  const daysUntil = getDaysUntilDue(scheduledDate);
  
  if (daysUntil < 0) {
    return { color: '#dc3545', label: `(Vencido hace ${Math.abs(daysUntil)} días)`, days: daysUntil };
  } else if (daysUntil === 0) {
    return { color: '#dc3545', label: '(Vence HOY)', days: daysUntil };
  } else if (daysUntil <= 3) {
    return { color: '#dc3545', label: `(${daysUntil} días)`, days: daysUntil };
  } else if (daysUntil <= 7) {
    return { color: '#ffc107', label: `(${daysUntil} días)`, days: daysUntil };
  } else {
    return { color: '#28a745', label: `(${daysUntil} días)`, days: daysUntil };
  }
}

function getRecurrenceLabel(type, interval) {
  const typeLabels = {
    once: 'Único',
    weekly: 'Semanal',
    monthly: 'Mensual',
    yearly: 'Anual'
  };
  
  const baseLabel = typeLabels[type] || type;
  if (type === 'once') return baseLabel;
  if (interval > 1) return `${baseLabel} (cada ${interval})`;
  return baseLabel;
}

function getScheduledStatusLabel(status) {
  const labels = {
    pending: 'Pendiente',
    paid: 'Pagado',
    cancelled: 'Cancelado'
  };
  return labels[status] || status;
}

function getStatusColor(status) {
  const colors = {
    pending: '#ffc107',
    paid: '#28a745',
    cancelled: '#666'
  };
  return colors[status] || '#666';
}

function openScheduledExpenseModal() {
  editingScheduledExpenseId = null;
  document.getElementById('modal-scheduled-expense').classList.add('active');
  document.getElementById('form-scheduled-expense').reset();
  document.getElementById('scheduled-expense-interval').value = 1;
  document.getElementById('scheduled-expense-auto-convert').checked = true;
  document.querySelector('#modal-scheduled-expense .modal-title').textContent = 'Nuevo Gasto Programado';
}

function closeScheduledExpenseModal() {
  editingScheduledExpenseId = null;
  document.getElementById('modal-scheduled-expense').classList.remove('active');
}

async function saveScheduledExpense(event) {
  event.preventDefault();
  
  const data = {
    boat_id: document.getElementById('scheduled-expense-boat').value,
    category: document.getElementById('scheduled-expense-category').value,
    amount: parseFloat(document.getElementById('scheduled-expense-amount').value),
    scheduled_date: document.getElementById('scheduled-expense-date').value,
    description: document.getElementById('scheduled-expense-description').value,
    recurrence_type: document.getElementById('scheduled-expense-recurrence-type').value,
    recurrence_interval: parseInt(document.getElementById('scheduled-expense-interval').value) || 1,
    auto_convert: document.getElementById('scheduled-expense-auto-convert').checked ? 1 : 0,
    notes: document.getElementById('scheduled-expense-notes').value || null
  };
  
  try {
    const isEditing = editingScheduledExpenseId !== null;
    const url = isEditing ? `/api/scheduled-expenses/${editingScheduledExpenseId}` : '/api/scheduled-expenses';
    const method = isEditing ? 'PATCH' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeScheduledExpenseModal();
      editingScheduledExpenseId = null;
      await loadScheduledExpenses();
      alert(isEditing ? 'Gasto programado actualizado exitosamente' : 'Gasto programado creado exitosamente');
    } else {
      alert('Error al guardar el gasto programado');
    }
  } catch (error) {
    console.error('Error saving scheduled expense:', error);
    alert('Error al guardar el gasto programado');
  }
}

async function editScheduledExpense(id) {
  const expense = scheduledExpenses.find(e => String(e.id) === String(id));
  if (!expense) {
    alert('Gasto programado no encontrado');
    return;
  }
  
  editingScheduledExpenseId = id;
  
  document.getElementById('modal-scheduled-expense').classList.add('active');
  document.querySelector('#modal-scheduled-expense .modal-title').textContent = 'Editar Gasto Programado';
  
  document.getElementById('scheduled-expense-boat').value = expense.boat_id || '';
  document.getElementById('scheduled-expense-category').value = expense.category || '';
  document.getElementById('scheduled-expense-amount').value = expense.amount || '';
  document.getElementById('scheduled-expense-date').value = expense.scheduled_date || '';
  document.getElementById('scheduled-expense-description').value = expense.description || '';
  document.getElementById('scheduled-expense-recurrence-type').value = expense.recurrence_type || 'once';
  document.getElementById('scheduled-expense-interval').value = expense.recurrence_interval || 1;
  document.getElementById('scheduled-expense-auto-convert').checked = expense.auto_convert === 1;
  document.getElementById('scheduled-expense-notes').value = expense.notes || '';
}

async function deleteScheduledExpense(id) {
  if (!confirm('¿Está seguro de eliminar este gasto programado?')) return;
  
  try {
    const response = await fetch(`/api/scheduled-expenses/${id}`, { method: 'DELETE' });
    if (response.ok) {
      await loadScheduledExpenses();
      alert('Gasto programado eliminado exitosamente');
    } else {
      alert('Error al eliminar el gasto programado');
    }
  } catch (error) {
    console.error('Error deleting scheduled expense:', error);
    alert('Error al eliminar el gasto programado');
  }
}

async function markScheduledExpenseAsPaid(id) {
  if (!confirm('¿Marcar este gasto como pagado? Esto creará un gasto real y, si es recurrente, programará el próximo.')) return;
  
  try {
    const response = await fetch(`/api/scheduled-expenses/${id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (response.ok) {
      const result = await response.json();
      await loadScheduledExpenses();
      await loadExpenses();
      
      let message = 'Gasto marcado como pagado y creado en gastos reales.';
      if (result.next_scheduled) {
        message += ` Próximo gasto programado para ${formatDate(result.next_scheduled.scheduled_date)}.`;
      }
      alert(message);
    } else {
      alert('Error al marcar como pagado');
    }
  } catch (error) {
    console.error('Error marking as paid:', error);
    alert('Error al marcar como pagado');
  }
}

function renderUpcomingScheduledSummary() {
  const container = document.getElementById('upcoming-scheduled-summary');
  if (!container) return;
  
  // Filter for pending expenses in the next 30 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  const upcomingExpenses = scheduledExpenses
    .filter(expense => {
      if (expense.status !== 'pending') return false;
      const scheduledDate = new Date(expense.scheduled_date);
      scheduledDate.setHours(0, 0, 0, 0);
      return scheduledDate >= today && scheduledDate <= thirtyDaysFromNow;
    })
    .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
  
  if (upcomingExpenses.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No hay gastos programados en los próximos 30 días</p>';
    return;
  }
  
  const totalEstimated = upcomingExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
  
  container.innerHTML = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Total Estimado (30 días)</div>
      <div style="font-size: 32px; font-weight: 700;">$${totalEstimated.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      <div style="font-size: 14px; opacity: 0.9; margin-top: 8px;">${upcomingExpenses.length} gasto${upcomingExpenses.length !== 1 ? 's' : ''} programado${upcomingExpenses.length !== 1 ? 's' : ''}</div>
    </div>
    
    <div style="display: grid; gap: 12px;">
      ${upcomingExpenses.map(expense => {
        const urgency = getUrgencyInfo(expense.scheduled_date, expense.status);
        const recurrenceLabel = getRecurrenceLabel(expense.recurrence_type, expense.recurrence_interval);
        
        return `
          <div style="border-left: 4px solid ${urgency.color}; padding: 12px; background: #f8f9fa; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <div>
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${expense.boat_name || 'Barco Desconocido'}</div>
                <div style="color: #666; font-size: 14px;">${expense.description}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 700; font-size: 18px; color: #dc3545;">$${parseFloat(expense.amount).toFixed(2)}</div>
                <span style="background: ${urgency.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                  ${getCategoryLabel(expense.category)}
                </span>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #666;">
              <div>
                <span style="font-weight: 600; color: ${urgency.color};">
                  ${formatDate(expense.scheduled_date)} ${urgency.label}
                </span>
              </div>
              <div>${recurrenceLabel}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
