// ===========================================================================
// FASE 10: BOAT MAINTENANCE & EXPENSE TRACKING FRONTEND
// ===========================================================================

// Global State
let boats = [];
let mechanics = [];
let expenses = [];
let maintenanceRecords = [];
let workOrders = [];
let partsInventory = [];
let charts = {};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await loadBoats();
  await loadMechanics();
  await loadExpenses();
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
  document.getElementById('modal-expense').classList.add('active');
  document.getElementById('form-expense').reset();
  document.getElementById('expense-date').valueAsDate = new Date();
}

function closeExpenseModal() {
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
    const response = await fetch('/api/boat-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeExpenseModal();
      await loadExpenses();
      await loadAnalytics();
      alert('Gasto guardado exitosamente y sincronizado con contabilidad');
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
