// Business Intelligence Dashboard for Nadaki Excursions
// Multi-language support
const translations = {
    es: {
        'dashboard-title': 'Dashboard de Inteligencia de Negocio',
        'refresh': '🔄 Actualizar',
        'date-range': 'Rango de Fecha:',
        'today': 'Hoy',
        'this-week': 'Esta Semana',
        'this-month': 'Este Mes',
        'quarter': 'Trimestre',
        'custom': 'Personalizado',
        'platform': 'Plataforma:',
        'all-platforms': 'Todas las Plataformas',
        'export-pdf': '📄 Exportar PDF',
        'export-excel': '📊 Exportar Excel',
        'today-bookings': 'Reservas Hoy',
        'today-revenue': 'Ingresos Hoy',
        'active-captains': 'Capitanes Activos',
        'satisfaction': 'Satisfacción',
        'of-total': 'de {count} total',
        'avg-rating': 'Promedio',
        'revenue-by-platform': 'Ingresos por Plataforma',
        'monthly-trends': 'Tendencias Mensuales',
        'booking-distribution': 'Distribución de Reservas',
        'platform-leaderboard': '🏆 Ranking de Plataformas',
        'captain-performance': 'Rendimiento de Capitanes',
        'recent-bookings': 'Reservas Recientes',
        'bookings': 'Reservas',
        'revenue': 'Ingresos',
        'view-all': 'Ver Todas',
        'booking-id': 'ID',
        'customer': 'Cliente',
        'boat': 'Barco',
        'date': 'Fecha',
        'amount': 'Monto',
        'status': 'Estado',
        'last-updated': 'Última actualización:',
        'auto-refresh': 'Actualización automática cada 30s'
    },
    en: {
        'dashboard-title': 'Business Intelligence Dashboard',
        'refresh': '🔄 Refresh',
        'date-range': 'Date Range:',
        'today': 'Today',
        'this-week': 'This Week',
        'this-month': 'This Month',
        'quarter': 'Quarter',
        'custom': 'Custom',
        'platform': 'Platform:',
        'all-platforms': 'All Platforms',
        'export-pdf': '📄 Export PDF',
        'export-excel': '📊 Export Excel',
        'today-bookings': "Today's Bookings",
        'today-revenue': "Today's Revenue",
        'active-captains': 'Active Captains',
        'satisfaction': 'Satisfaction',
        'of-total': 'of {count} total',
        'avg-rating': 'Average',
        'revenue-by-platform': 'Revenue by Platform',
        'monthly-trends': 'Monthly Trends',
        'booking-distribution': 'Booking Distribution',
        'platform-leaderboard': '🏆 Platform Leaderboard',
        'captain-performance': 'Captain Performance',
        'recent-bookings': 'Recent Bookings',
        'bookings': 'Bookings',
        'revenue': 'Revenue',
        'view-all': 'View All',
        'booking-id': 'ID',
        'customer': 'Customer',
        'boat': 'Boat',
        'date': 'Date',
        'amount': 'Amount',
        'status': 'Status',
        'last-updated': 'Last updated:',
        'auto-refresh': 'Auto-refresh every 30s'
    }
};

// Global state
let currentLang = 'es';
let currentTheme = 'light';
let charts = {};
let refreshInterval;
let dashboardData = null;

// API Configuration
const API_BASE = window.location.origin;

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard initializing...');
    console.log('Chart.js available:', typeof Chart !== 'undefined');
    initializeEventListeners();
    loadDashboardData();
    startAutoRefresh();
});

function initializeEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', loadDashboardData);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('langToggle').addEventListener('click', toggleLanguage);
    document.getElementById('dateRange').addEventListener('change', loadDashboardData);
    document.getElementById('platformFilter').addEventListener('change', loadDashboardData);
    document.getElementById('exportPDF').addEventListener('click', exportToPDF);
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
}

// Data Loading
async function loadDashboardData() {
    try {
        showLoadingState();
        
        // Fetch dashboard data
        const response = await fetch(`${API_BASE}/api/dashboard-data`);
        dashboardData = await response.json();
        
        // Fetch platforms
        const platformsResponse = await fetch(`${API_BASE}/api/platforms`);
        const platforms = await platformsResponse.json();
        
        // Update platform filter
        updatePlatformFilter(platforms);
        
        // Update KPIs
        updateKPIs(dashboardData);
        
        // Initialize/Update Charts
        updateCharts(dashboardData);
        
        // Update leaderboard
        updatePlatformLeaderboard(dashboardData);
        
        // Update captain performance
        updateCaptainPerformance(dashboardData);
        
        // Update bookings table
        updateBookingsTable(dashboardData.recent_bookings);
        
        // Update timestamp
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            lastUpdate.textContent = new Date().toLocaleString(currentLang === 'es' ? 'es-ES' : 'en-US');
        }
        
        hideLoadingState();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showError('Error al cargar los datos. Reintentando...');
        setTimeout(loadDashboardData, 5000);
    }
}

function updatePlatformFilter(platforms) {
    const select = document.getElementById('platformFilter');
    if (!select) return;
    
    const currentValue = select.value;
    
    // Keep "All" option and add platforms
    select.innerHTML = `<option value="all">${translate('all-platforms')}</option>`;
    platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform;
        option.textContent = platform;
        select.appendChild(option);
    });
    
    select.value = currentValue;
}

function updateKPIs(data) {
    const todayBookings = document.getElementById('todayBookings');
    const todayRevenue = document.getElementById('todayRevenue');
    const activeCaptains = document.getElementById('activeCaptains');
    const totalCaptains = document.getElementById('totalCaptains');
    const bookingChange = document.getElementById('bookingChange');
    const revenueChange = document.getElementById('revenueChange');
    const totalRevenueBadge = document.getElementById('totalRevenueBadge');
    
    if (todayBookings) todayBookings.textContent = data.today_bookings || 0;
    if (todayRevenue) todayRevenue.textContent = `$${(data.today_revenue || 0).toLocaleString()}`;
    if (activeCaptains) activeCaptains.textContent = data.active_captains || 0;
    if (totalCaptains) totalCaptains.textContent = translate('of-total').replace('{count}', data.total_captains || 0);
    
    // Calculate changes (simulated for now)
    const bookingChangeText = data.today_bookings > 0 ? '+15%' : '0%';
    const revenueChangeText = data.today_revenue > 0 ? '+23%' : '0%';
    
    if (bookingChange) bookingChange.textContent = bookingChangeText;
    if (revenueChange) revenueChange.textContent = revenueChangeText;
    
    // Total revenue badge
    if (totalRevenueBadge) totalRevenueBadge.textContent = `$${(data.total_revenue || 0).toLocaleString()}`;
}

function updateCharts(data) {
    console.log('Updating charts with data:', data);
    console.log('Chart.js status:', typeof Chart);
    updateRevenueByPlatformChart(data);
    updateMonthlyTrendsChart(data);
    updateBookingDistributionChart(data);
}

function updateRevenueByPlatformChart(data) {
    console.log('Creating revenue by platform chart...');
    const canvas = document.getElementById('revenueByPlatform');
    if (!canvas) {
        console.error('Canvas element revenueByPlatform not found!');
        return;
    }
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded!');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const platforms = Object.keys(data.revenue_by_platform || {});
    const revenues = Object.values(data.revenue_by_platform || {});
    
    if (charts.revenueByPlatform) {
        charts.revenueByPlatform.destroy();
    }
    
    charts.revenueByPlatform = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: platforms,
            datasets: [{
                label: translate('revenue'),
                data: revenues,
                backgroundColor: 'rgba(0, 119, 190, 0.7)',
                borderColor: 'rgba(0, 119, 190, 1)',
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${translate('revenue')}: $${context.parsed.y.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateMonthlyTrendsChart(data) {
    const ctx = document.getElementById('monthlyTrends').getContext('2d');
    
    // Generate last 6 months
    const months = [];
    const bookingsData = [];
    const revenueData = [];
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        months.push(date.toLocaleDateString(currentLang === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: 'numeric' }));
        
        // Simulated data - in real app, fetch from API
        bookingsData.push(Math.floor(Math.random() * 50) + 20);
        revenueData.push(Math.floor(Math.random() * 5000) + 2000);
    }
    
    if (charts.monthlyTrends) {
        charts.monthlyTrends.destroy();
    }
    
    charts.monthlyTrends = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: translate('bookings'),
                    data: bookingsData,
                    borderColor: 'rgba(0, 119, 190, 1)',
                    backgroundColor: 'rgba(0, 119, 190, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: translate('revenue'),
                    data: revenueData,
                    borderColor: 'rgba(46, 196, 182, 1)',
                    backgroundColor: 'rgba(46, 196, 182, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateBookingDistributionChart(data) {
    const ctx = document.getElementById('bookingDistribution').getContext('2d');
    
    const platforms = Object.keys(data.bookings_by_platform || {});
    const bookings = Object.values(data.bookings_by_platform || {});
    
    // Marine color palette
    const colors = [
        '#0077BE', '#56CCF2', '#2EC4B6', '#06D6A0', 
        '#FFB800', '#FF6B6B', '#003D5C', '#F4F1DE',
        '#4A90E2', '#7B68EE', '#20B2AA', '#FF7F50', '#9370DB'
    ];
    
    if (charts.bookingDistribution) {
        charts.bookingDistribution.destroy();
    }
    
    charts.bookingDistribution = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: platforms,
            datasets: [{
                data: bookings,
                backgroundColor: colors.slice(0, platforms.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updatePlatformLeaderboard(data) {
    const leaderboard = document.getElementById('platformLeaderboard');
    const revenue = data.revenue_by_platform || {};
    
    // Sort platforms by revenue
    const sorted = Object.entries(revenue)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
    
    leaderboard.innerHTML = sorted.map(([platform, amount], index) => `
        <div class="leaderboard-item">
            <div class="leaderboard-rank">${index + 1}</div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${platform}</div>
                <div class="leaderboard-stats">${data.bookings_by_platform[platform] || 0} ${translate('bookings')}</div>
            </div>
            <div class="leaderboard-value">$${amount.toLocaleString()}</div>
        </div>
    `).join('');
}

function updateCaptainPerformance(data) {
    const container = document.getElementById('captainPerformance');
    const captains = data.active_captains_list || [];
    
    container.innerHTML = captains.map(captain => `
        <div class="captain-card">
            <div class="captain-avatar">👨‍✈️</div>
            <div class="captain-name">${captain.name}</div>
            <div class="captain-stats">
                ${captain.specialties.join(', ')}<br>
                <strong>📞 ${captain.phone}</strong>
            </div>
        </div>
    `).join('');
}

function updateBookingsTable(bookings) {
    const tbody = document.getElementById('bookingsTableBody');
    
    if (!bookings || bookings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    No hay reservas recientes
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = bookings.map(booking => `
        <tr onclick="viewBookingDetails('${booking.id}')">
            <td><strong>${booking.id.substring(0, 12)}...</strong></td>
            <td>${booking.customer_name || 'N/A'}</td>
            <td>${booking.platform}</td>
            <td>${booking.boat_type || 'N/A'}</td>
            <td>${booking.booking_date}</td>
            <td><strong>$${booking.total_amount}</strong></td>
            <td><span class="status-badge ${booking.status}">${booking.status}</span></td>
        </tr>
    `).join('');
}

function viewBookingDetails(bookingId) {
    alert(`Ver detalles de reserva: ${bookingId}\n(Funcionalidad de drill-down)`);
}

// Theme Toggle
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.className = `${currentTheme}-mode`;
    
    // Recreate charts with new theme
    if (dashboardData) {
        updateCharts(dashboardData);
    }
}

// Language Toggle
function toggleLanguage() {
    currentLang = currentLang === 'es' ? 'en' : 'es';
    document.getElementById('currentLang').textContent = currentLang.toUpperCase();
    
    // Update all translatable elements
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = translate(key);
    });
    
    // Reload data to update charts
    if (dashboardData) {
        updateCharts(dashboardData);
        updateKPIs(dashboardData);
        updatePlatformLeaderboard(dashboardData);
    }
}

function translate(key) {
    return translations[currentLang][key] || key;
}

// Export Functions
function exportToPDF() {
    if (!dashboardData) return;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(0, 51, 102);
    doc.text('Nadaki Excursions', 20, 20);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Business Intelligence Dashboard', 20, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 35);
    
    // KPIs Section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Key Metrics', 20, 50);
    
    doc.setFontSize(10);
    const kpis = [
        ['Today Bookings:', dashboardData.today_bookings],
        ['Today Revenue:', `$${dashboardData.today_revenue.toLocaleString()}`],
        ['Week Bookings:', dashboardData.week_bookings],
        ['Week Revenue:', `$${dashboardData.week_revenue.toLocaleString()}`],
        ['Active Captains:', `${dashboardData.active_captains}/${dashboardData.total_captains}`]
    ];
    
    let yPos = 60;
    kpis.forEach(([label, value]) => {
        doc.text(label, 25, yPos);
        doc.setFont(undefined, 'bold');
        doc.text(String(value), 80, yPos);
        doc.setFont(undefined, 'normal');
        yPos += 7;
    });
    
    // Revenue by Platform
    doc.setFontSize(14);
    yPos += 10;
    doc.text('Revenue by Platform', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    Object.entries(dashboardData.revenue_by_platform || {}).forEach(([platform, revenue]) => {
        const bookings = dashboardData.bookings_by_platform[platform] || 0;
        doc.text(`${platform}:`, 25, yPos);
        doc.setFont(undefined, 'bold');
        doc.text(`$${revenue.toLocaleString()} (${bookings} bookings)`, 80, yPos);
        doc.setFont(undefined, 'normal');
        yPos += 7;
    });
    
    // Recent Bookings
    if (dashboardData.recent_bookings && dashboardData.recent_bookings.length > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.text('Recent Bookings', 20, 20);
        
        yPos = 30;
        doc.setFontSize(9);
        dashboardData.recent_bookings.slice(0, 15).forEach(booking => {
            doc.text(`${booking.customer_name} - ${booking.platform}`, 20, yPos);
            doc.text(`${booking.boat_type} | ${booking.booking_date}`, 20, yPos + 5);
            doc.setFont(undefined, 'bold');
            doc.text(`$${booking.total_amount}`, 150, yPos);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(150);
            doc.text(booking.status, 150, yPos + 5);
            doc.setTextColor(0);
            yPos += 15;
            
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
        });
    }
    
    doc.save(`Nadaki_Dashboard_${new Date().toISOString().split('T')[0]}.pdf`);
}

function exportToExcel() {
    if (!dashboardData) return;
    
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Summary
    const summaryData = [
        ['Nadaki Excursions - Dashboard Report'],
        ['Generated:', new Date().toLocaleString()],
        [],
        ['Metric', 'Value'],
        ['Today Bookings', dashboardData.today_bookings],
        ['Today Revenue', dashboardData.today_revenue],
        ['Week Bookings', dashboardData.week_bookings],
        ['Week Revenue', dashboardData.week_revenue],
        ['Active Captains', dashboardData.active_captains],
        ['Total Captains', dashboardData.total_captains]
    ];
    
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
    
    // Sheet 2: Revenue by Platform
    const revenueData = [
        ['Platform', 'Revenue', 'Bookings']
    ];
    Object.keys(dashboardData.revenue_by_platform || {}).forEach(platform => {
        revenueData.push([
            platform,
            dashboardData.revenue_by_platform[platform],
            dashboardData.bookings_by_platform[platform] || 0
        ]);
    });
    
    const ws2 = XLSX.utils.aoa_to_sheet(revenueData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Revenue by Platform');
    
    // Sheet 3: Recent Bookings
    if (dashboardData.recent_bookings && dashboardData.recent_bookings.length > 0) {
        const bookingsData = [
            ['ID', 'Customer', 'Platform', 'Boat', 'Date', 'Amount', 'Status']
        ];
        dashboardData.recent_bookings.forEach(booking => {
            bookingsData.push([
                booking.id,
                booking.customer_name,
                booking.platform,
                booking.boat_type,
                booking.booking_date,
                booking.total_amount,
                booking.status
            ]);
        });
        
        const ws3 = XLSX.utils.aoa_to_sheet(bookingsData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Recent Bookings');
    }
    
    // Download
    XLSX.writeFile(wb, `Nadaki_Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Auto Refresh
function startAutoRefresh() {
    refreshInterval = setInterval(loadDashboardData, 30000); // 30 seconds
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

// Loading States
function showLoadingState() {
    // Could add loading spinners to cards
}

function hideLoadingState() {
    // Remove loading spinners
}

function showError(message) {
    console.error(message);
    // Could show toast notification
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
