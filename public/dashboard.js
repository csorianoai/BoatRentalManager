// Business Intelligence Dashboard for Nadaki Excursions

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

// Global state — idioma gestionado por i18n.js
function getCurrentLang() {
    return (window.i18n && window.i18n.current) ? window.i18n.current() : 'es';
}
function __(key) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
}
let currentTheme = 'light';
let charts = {};
let refreshInterval;
let dashboardData = null;
let lastPlatformsList = [];

// Refresh dynamic content when language changes
document.addEventListener('i18n:applied', function () {
    if (dashboardData) {
        updateKPIs(dashboardData);
        updateCharts(dashboardData);
        updatePlatformLeaderboard(dashboardData);
    }
    if (lastPlatformsList.length) {
        updatePlatformFilter(lastPlatformsList);
    }
});

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
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    document.getElementById('exportPDF')?.addEventListener('click', exportToPDF);
    document.getElementById('exportExcel')?.addEventListener('click', exportToExcel);

    const dateRange = document.getElementById('dateRange');
    const platformFilter = document.getElementById('platformFilter');
    const customRow = document.getElementById('customDateRow');

    dateRange?.addEventListener('change', () => {
        if (customRow) {
            customRow.style.display = dateRange.value === 'custom' ? 'flex' : 'none';
        }
        if (dateRange.value !== 'custom') loadDashboardData();
    });
    platformFilter?.addEventListener('change', loadDashboardData);

    document.getElementById('customDateFrom')?.addEventListener('change', () => {
        if (document.getElementById('dateRange')?.value === 'custom') loadDashboardData();
    });
    document.getElementById('customDateTo')?.addEventListener('change', () => {
        if (document.getElementById('dateRange')?.value === 'custom') loadDashboardData();
    });
}

// ── Build query params from active filters ────────────────────────────────
function getFilterParams() {
    const dateRange   = document.getElementById('dateRange')?.value   || 'all';
    const platform    = document.getElementById('platformFilter')?.value || 'all';
    const customFrom  = document.getElementById('customDateFrom')?.value || '';
    const customTo    = document.getElementById('customDateTo')?.value   || '';
    const params      = new URLSearchParams({ dateRange, platform });
    if (dateRange === 'custom' && customFrom && customTo) {
        params.set('dateFrom', customFrom);
        params.set('dateTo',   customTo);
    }
    return params.toString();
}

// Data Loading
async function loadDashboardData() {
    try {
        showLoadingState();
        
        // ── Fetch dashboard data with active filters ──────────────────────
        const qs = getFilterParams();
        const response = await authFetch(`${API_BASE}/api/dashboard-data?${qs}`);
        dashboardData = await response.json();
        
        // ── Fetch platforms for filter dropdown ───────────────────────────
        const platformsResponse = await authFetch(`${API_BASE}/api/platforms`);
        const platforms = await platformsResponse.json();
        lastPlatformsList = platforms;
        
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
        
        // Update breakdown panels
        updateBoatBreakdown(dashboardData);
        updateBrokerBreakdown(dashboardData);

        // Update upcoming bookings panel
        updateUpcomingBookings(dashboardData);

        // Update period label
        updatePeriodLabel(dashboardData);

        // Update timestamp
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            lastUpdate.textContent = new Date().toLocaleString(getCurrentLang() === 'es' ? 'es-ES' : 'en-US');
        }
        
        hideLoadingState();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showError('Error al cargar los datos. Reintentando...');
        setTimeout(loadDashboardData, 5000);
    }
}

function updatePeriodLabel(data) {
    const el = document.getElementById('periodLabel');
    if (!el) return;
    const dr   = data.filter_date_range || 'all';
    const from = data.period_start || '';
    const to   = data.period_end   || '';
    if (dr === 'all') {
        el.textContent = from && to ? `Todo el historial: ${from} – ${to}` : 'Todo el historial';
        return;
    }
    if (from && to) {
        const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        el.textContent = `${fmt(from)} – ${fmt(to)}`;
    } else {
        el.textContent = '';
    }
}

// ── Upcoming Bookings List ────────────────────────────────────────────────────
function updateUpcomingBookings(data) {
    const el = document.getElementById('upcomingBookingsList');
    if (!el) return;
    const bookings = data.upcoming_bookings || [];
    const section  = document.getElementById('upcomingSection');

    if (bookings.length === 0) {
        el.innerHTML = `
            <div style="text-align:center;padding:32px;color:var(--text-secondary);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <p style="font-weight:600;margin:0 0 4px;">Sin reservas próximas</p>
                <p style="font-size:13px;margin:0;">No hay reservas programadas para los próximos 30 días</p>
            </div>`;
        return;
    }

    const today = new Date().toISOString().slice(0, 10);
    el.innerHTML = '';
    bookings.forEach(b => {
        const div = document.createElement('div');
        div.className = 'upcoming-item';
        const amount = parseFloat(b.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const boat   = esc(b.boat_type || b.boat_id || 'Sin asignar');
        const plat   = esc(b.platform  || '—');
        const cap    = esc(b.assigned_captain_name || '—');
        const guests = b.num_guests ? `${b.num_guests} pax` : '';
        const isToday  = b.booking_date === today;
        const isManual = b.is_manual;
        const dateFmt  = new Date(b.booking_date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

        div.innerHTML = `
            <div class="upcoming-date ${isToday ? 'upcoming-today' : ''}">
                <span class="upcoming-date-text">${dateFmt}</span>
                ${isToday ? '<span class="upcoming-today-badge">HOY</span>' : ''}
            </div>
            <div class="upcoming-info">
                <div class="upcoming-customer">${esc(b.customer_name || 'Sin nombre')}</div>
                <div class="upcoming-meta">
                    <span class="upcoming-platform-badge">${plat}</span>
                    <span>${boat}</span>
                    ${b.start_time ? `<span>${esc(b.start_time)}</span>` : ''}
                    ${guests ? `<span>${guests}</span>` : ''}
                    ${cap !== '—' ? `<span>Cap: ${cap}</span>` : ''}
                    ${isManual ? '<span class="badge-manual">Manual</span>' : ''}
                </div>
            </div>
            <div class="upcoming-amount">$${amount}</div>
            <div class="upcoming-status">
                <span class="status-badge ${esc(b.status || 'confirmed')}">${esc(b.status || 'confirmed')}</span>
            </div>
        `;
        div.style.cursor = 'pointer';
        div.title = 'Ver en calendario';
        div.addEventListener('click', () => {
            const url = b.booking_date
                ? `/schedule.html?date=${b.booking_date}`
                : '/schedule.html';
            window.location.href = url;
        });
        el.appendChild(div);
    });
}

function updatePlatformFilter(platforms) {
    const select = document.getElementById('platformFilter');
    if (!select) return;
    
    const currentValue = select.value;
    
    // Keep "All" option and add platforms
    select.innerHTML = `<option value="all">${__('all-platforms')}</option>`;
    platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform;
        option.textContent = platform;
        select.appendChild(option);
    });
    
    select.value = currentValue;
}

function updateKPIs(data) {
    const fmtMoney = v => '$' + Math.round(v || 0).toLocaleString('en-US');
    const fmtPct   = pct => {
        if (pct === null || pct === undefined) return '—';
        const sign = pct >= 0 ? '+' : '';
        return `${sign}${pct}%`;
    };
    const setPct = (id, pct) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = fmtPct(pct);
        el.className = 'kpi-change-badge ' + (pct === null ? 'neutral' : pct >= 0 ? 'positive' : 'negative');
    };
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    // Period KPIs
    set('periodBookings', data.period_bookings ?? 0);
    set('periodRevenue',  fmtMoney(data.period_revenue));
    set('avgTicket',      fmtMoney(data.avg_ticket));
    setPct('bookingChange', data.booking_change_pct);
    setPct('revenueChange', data.revenue_change_pct);

    // All-time
    set('totalBookingsCount', data.total_bookings ?? 0);
    set('totalRevenueBadge',  fmtMoney(data.total_revenue) + ' revenue total');
    if (document.getElementById('totalRevenueBadge2'))
        document.getElementById('totalRevenueBadge2').textContent = fmtMoney(data.total_revenue);

    // Today
    set('todayBookings', data.today_bookings ?? 0);
    set('todayRevenue',  fmtMoney(data.today_revenue) + ' hoy');

    // Past/historical
    set('pastBookings', data.past_bookings ?? 0);
    set('pastRevenue',  fmtMoney(data.past_revenue) + ' en revenue pasado');

    // Upcoming
    set('upcoming7d', data.upcoming_7d ?? 0);

    // Crew
    set('activeCaptains', data.active_captains ?? 0);
    set('totalCaptains',  data.total_captains ?? 0);
    set('activeStews',    data.active_stews ?? 0);
    set('totalStews',     data.total_stews ?? 0);

    // Booking count in table header
    set('bookingsTableCount', `${data.period_bookings ?? 0} reservas encontradas`);
}

function updateCharts(data) {
    console.log('Updating charts with data:', data);
    console.log('Chart.js status:', typeof Chart);
    updateRevenueByPlatformChart(data);
    updateMonthlyTrendsChart(data);
    updateBookingDistributionChart(data);
}

// ── Chart empty-state helper ──────────────────────────────────────────────────
function showEmptyChart(canvas, message) {
    if (!canvas) return;
    if (canvas._emptyMsg) return; // already shown
    const wrap = canvas.parentElement;
    canvas.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'chart-empty-state';
    div.innerHTML = `
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;display:block;margin:0 auto 10px"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <p style="margin:0;font-size:13px;color:var(--text-secondary);">${message}</p>`;
    wrap.appendChild(div);
    canvas._emptyMsg = div;
}

function clearEmptyChart(canvas) {
    if (!canvas) return;
    if (canvas._emptyMsg) { canvas._emptyMsg.remove(); canvas._emptyMsg = null; }
    canvas.style.display = '';
}

function updateRevenueByPlatformChart(data) {
    const canvas = document.getElementById('revenueByPlatform');
    if (!canvas || typeof Chart === 'undefined') return;

    if (charts.revenueByPlatform) { charts.revenueByPlatform.destroy(); charts.revenueByPlatform = null; }

    const platforms = Object.keys(data.revenue_by_platform || {});
    const revenues  = Object.values(data.revenue_by_platform || {});

    if (platforms.length === 0) {
        showEmptyChart(canvas, 'Sin datos de revenue para este período');
        return;
    }
    clearEmptyChart(canvas);

    charts.revenueByPlatform = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: platforms,
            datasets: [{
                label: __('revenue'),
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
            plugins: { legend: { display: false },
                tooltip: { callbacks: { label: ctx => `Revenue: $${ctx.parsed.y.toLocaleString()}` } }
            },
            scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } } }
        }
    });
}

function updateMonthlyTrendsChart(data) {
    const canvas = document.getElementById('monthlyTrends');
    if (!canvas || typeof Chart === 'undefined') return;

    if (charts.monthlyTrends) { charts.monthlyTrends.destroy(); charts.monthlyTrends = null; }

    const trend = (data.monthly_trend || []);
    // Only include months that have at least 1 booking OR revenue
    const nonEmpty = trend.filter(t => t.bookings > 0 || t.revenue > 0);

    if (nonEmpty.length === 0) {
        showEmptyChart(canvas, 'Sin datos de tendencia para este período');
        return;
    }
    clearEmptyChart(canvas);

    // Use all trend months for context (zeros show as flat baseline)
    charts.monthlyTrends = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: trend.map(t => t.label),
            datasets: [
                {
                    label: __('bookings'),
                    data: trend.map(t => t.bookings),
                    borderColor: 'rgba(0, 119, 190, 1)',
                    backgroundColor: 'rgba(0, 119, 190, 0.1)',
                    tension: 0.4, fill: true, yAxisID: 'y'
                },
                {
                    label: __('revenue'),
                    data: trend.map(t => t.revenue),
                    borderColor: 'rgba(46, 196, 182, 1)',
                    backgroundColor: 'rgba(46, 196, 182, 0.1)',
                    tension: 0.4, fill: true, yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                y:  { type: 'linear', position: 'left',  beginAtZero: true },
                y1: { type: 'linear', position: 'right', beginAtZero: true,
                      grid: { drawOnChartArea: false },
                      ticks: { callback: v => '$' + v.toLocaleString() } }
            }
        }
    });
}

function updateBookingDistributionChart(data) {
    const canvas = document.getElementById('bookingDistribution');
    if (!canvas || typeof Chart === 'undefined') return;

    if (charts.bookingDistribution) { charts.bookingDistribution.destroy(); charts.bookingDistribution = null; }

    const platforms = Object.keys(data.bookings_by_platform || {});
    const bookings  = Object.values(data.bookings_by_platform || {});

    if (platforms.length === 0) {
        showEmptyChart(canvas, 'Sin reservas para mostrar distribución');
        return;
    }
    clearEmptyChart(canvas);

    const colors = ['#0077BE','#56CCF2','#2EC4B6','#06D6A0','#FFB800','#FF6B6B','#003D5C','#4A90E2','#7B68EE','#20B2AA','#FF7F50','#9370DB','#EA580C'];

    charts.bookingDistribution = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: platforms,
            datasets: [{ data: bookings, backgroundColor: colors.slice(0, platforms.length), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { padding: 15, font: { size: 12 } } },
                tooltip: { callbacks: { label: ctx => {
                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    return `${ctx.label}: ${ctx.parsed} (${((ctx.parsed/total)*100).toFixed(1)}%)`;
                }}}
            }
        }
    });
}

function updatePlatformLeaderboard(data) {
    const leaderboard = document.getElementById('platformLeaderboard');
    if (!leaderboard) return;
    const revenue = data.revenue_by_platform || {};
    const sorted = Object.entries(revenue).sort(([, a], [, b]) => b - a).slice(0, 5);

    if (sorted.length === 0) {
        leaderboard.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:24px;font-size:13px;">Sin reservas registradas</p>';
        return;
    }

    leaderboard.innerHTML = '';
    sorted.forEach(([platform, amount], index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item leaderboard-item-clickable';
        item.title = `Filtrar por ${platform}`;
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <div class="leaderboard-rank">${index + 1}</div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${esc(platform)}</div>
                <div class="leaderboard-stats">${data.bookings_by_platform[platform] || 0} ${__('bookings')}</div>
            </div>
            <div class="leaderboard-value">$${amount.toLocaleString()}</div>
        `;
        item.addEventListener('click', () => {
            const sel = document.getElementById('platformFilter');
            if (sel) {
                sel.value = platform;
                sel.dispatchEvent(new Event('change'));
            }
        });
        leaderboard.appendChild(item);
    });
}

function updateCaptainPerformance(data) {
    const container = document.getElementById('captainPerformance');
    if (!container) return;
    const captains = data.active_captains_list || [];
    if (captains.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:12px;">Sin capitanes activos</p>';
        return;
    }
    container.innerHTML = '';
    captains.slice(0, 6).forEach(captain => {
        const div = document.createElement('div');
        div.className = 'captain-card';
        const initials = (captain.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const bookingCount = (data.bookings_by_captain || {})[captain.name] || 0;
        const specialties = Array.isArray(captain.specialties) ? captain.specialties.join(', ') : (captain.specialties || '');
        div.innerHTML = `
            <div class="captain-avatar" style="background:#0066cc;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-weight:700;">${esc(initials)}</div>
            <div class="captain-name">${esc(captain.name)}</div>
            <div class="captain-stats">
                ${bookingCount > 0 ? `<strong>${bookingCount} reservas</strong><br>` : ''}
                ${esc(specialties)}
            </div>
        `;
        container.appendChild(div);
    });
}

function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateBookingsTable(bookings) {
    const tbody = document.getElementById('bookingsTableBody');
    if (!tbody) return;

    if (!bookings || bookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary);">No hay reservas en este período</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    bookings.forEach(booking => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Ver en calendario';
        tr.addEventListener('click', () => {
            const url = booking.booking_date
                ? `/schedule.html?date=${booking.booking_date}`
                : '/schedule.html';
            window.location.href = url;
        });
        const amount = parseFloat(booking.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const isManual = booking.is_manual ? ' <span style="background:#fef3c7;color:#92400e;border-radius:8px;padding:1px 6px;font-size:10px;font-weight:700;">Manual</span>' : '';
        const dateFmt = booking.booking_date
            ? new Date(booking.booking_date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
            : '—';
        tr.innerHTML = `
            <td><strong>${dateFmt}</strong></td>
            <td>${esc(booking.customer_name || 'N/A')}${isManual}</td>
            <td>${esc(booking.platform || '—')}</td>
            <td>${esc(booking.boat_type || booking.boat_id || 'N/A')}</td>
            <td>${esc(booking.start_time || '—')}</td>
            <td><strong>$${amount}</strong></td>
            <td><span class="status-badge ${esc(booking.status || 'confirmed')}">${esc(booking.status || 'confirmed')}</span></td>
            <td><button onclick="event.stopPropagation();window.open('/booking-wizard.html?booking_id='+encodeURIComponent('${esc(booking.id)}'),'_blank')" data-testid="button-wizard-${esc(booking.id)}" style="padding:3px 10px;background:#7c3aed;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;">Cuadrar</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateBoatBreakdown(data) {
    const el = document.getElementById('boatBreakdown');
    if (!el) return;
    const boats = data.bookings_by_boat || {};
    const rev   = data.revenue_by_boat  || {};
    const sorted = Object.entries(rev).sort(([,a],[,b]) => b-a).slice(0,5);
    if (sorted.length === 0) {
        el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:12px;">Sin datos</p>';
        return;
    }
    el.innerHTML = '';
    sorted.forEach(([boat, revenue], i) => {
        const cnt  = boats[boat] || 0;
        const item = document.createElement('div');
        item.className = 'leaderboard-item leaderboard-item-clickable';
        item.style.cursor = 'pointer';
        item.title = `Ver ${boat} en flotilla`;
        item.innerHTML = `
            <div class="leaderboard-rank">${i+1}</div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${esc(boat)}</div>
                <div class="leaderboard-stats">${cnt} reservas</div>
            </div>
            <div class="leaderboard-value">$${revenue.toLocaleString()}</div>`;
        item.addEventListener('click', () => {
            window.location.href = '/fleet.html';
        });
        el.appendChild(item);
    });
}

function updateBrokerBreakdown(data) {
    const el = document.getElementById('brokerBreakdown');
    if (!el) return;
    const brokers = data.bookings_by_broker || {};
    const rev     = data.revenue_by_broker  || {};
    const sorted  = Object.entries(rev).sort(([,a],[,b]) => b-a).slice(0,5);
    if (sorted.length === 0) {
        el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:12px;">Sin datos</p>';
        return;
    }
    el.innerHTML = sorted.map(([broker, revenue], i) => {
        const cnt = brokers[broker] || 0;
        return `<div class="leaderboard-item">
            <div class="leaderboard-rank">${i+1}</div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${esc(broker)}</div>
                <div class="leaderboard-stats">${cnt} reservas</div>
            </div>
            <div class="leaderboard-value">$${revenue.toLocaleString()}</div>
        </div>`;
    }).join('');
}

function viewBookingDetails(bookingId) {
    window.location.href = '/schedule.html';
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

// ==========================================
// 🤖 AI CHATBOT FUNCTIONALITY
// ==========================================

let chatSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
let chatMessages = [];
let isTyping = false;

// Initialize chat widget
function initChatWidget() {
    const trigger = document.getElementById('chatTrigger');
    const widget = document.getElementById('chatWidget');
    const closeBtn = document.getElementById('chatClose');
    const sendBtn = document.getElementById('chatSend');
    const input = document.getElementById('chatInput');

    if (!trigger || !widget) return;

    // Toggle widget
    trigger.addEventListener('click', async () => {
        widget.classList.toggle('active');
        if (widget.classList.contains('active') && chatMessages.length === 0) {
            // Load conversation history
            await loadConversationHistory();
            
            // If no history, send welcome message
            if (chatMessages.length === 0) {
                addAIMessage('¡Hola! 👋 Soy el asistente virtual de Nadaki Excursions. ¿En qué puedo ayudarte hoy? Puedo ayudarte a reservar un tour, responder preguntas sobre nuestros servicios, o consultar disponibilidad.');
            }
        }
        if (widget.classList.contains('active')) {
            input.focus();
        }
    });

    // Close widget
    closeBtn.addEventListener('click', () => {
        widget.classList.remove('active');
    });

    // Send message on button click
    sendBtn.addEventListener('click', sendChatMessage);

    // Send message on Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message || isTyping) return;

    // Add user message to UI
    addUserMessage(message);
    input.value = '';
    input.style.height = 'auto';

    // Show typing indicator
    showTyping();

    try {
        // Use enhanced AI endpoint
        const response = await fetch(`${API_BASE}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: chatSessionId,
                message: message,
                customerName: '',
                customerPhone: '',
                customerEmail: ''
            })
        });

        const data = await response.json();
        
        // Remove typing indicator
        hideTyping();

        // Add AI response (new endpoint uses 'message' instead of 'response')
        let aiMessage = data.message || data.response;
        
        // Remove the CREAR_RESERVA: part from the message if it exists
        if (aiMessage.includes('CREAR_RESERVA:')) {
            aiMessage = aiMessage.split('CREAR_RESERVA:')[0].trim() || '✅ ¡Perfecto! He creado tu reserva. Recibirás una confirmación pronto.';
        }
        
        // Log enhanced metadata for debugging
        if (data.metadata) {
            console.log('🤖 AI Metadata:', {
                language: data.metadata.detectedLanguage,
                intent: data.metadata.intent,
                confidence: data.metadata.confidence + '%',
                processingTime: data.metadata.processingTime + 'ms'
            });
            
            // Show visual indicators for special features
            if (data.metadata.recommendations && data.metadata.recommendations.length > 0) {
                console.log('🚤 Boat Recommendations:', data.metadata.recommendations);
            }
            if (data.metadata.estimatedPrice) {
                console.log('💰 Estimated Price: $' + data.metadata.estimatedPrice);
            }
            if (data.metadata.availability) {
                console.log('📅 Availability Check:', data.metadata.availability);
            }
        }
        
        addAIMessage(aiMessage);

        // If a booking was created, show success notification
        if (data.bookingId) {
            setTimeout(() => {
                addAIMessage(`✅ Reserva creada exitosamente! ID: ${data.bookingId}\n\nUno de nuestros agentes se pondrá en contacto contigo pronto para confirmar los detalles.`);
            }, 500);
        }

    } catch (error) {
        hideTyping();
        addAIMessage('❌ Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.');
        console.error('Chat error:', error);
    }
}

function addUserMessage(text) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message user';
    
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-bubble">${escapeHtml(text)}</div>
        <div class="message-timestamp">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    chatMessages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
}

function addAIMessage(text) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message ai';
    
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-bubble">${escapeHtml(text)}</div>
        <div class="message-timestamp">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    chatMessages.push({ role: 'assistant', content: text, timestamp: new Date().toISOString() });
}

function showTyping() {
    isTyping = true;
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'chat-message ai';
    typingDiv.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    messagesContainer.appendChild(typingDiv);
    scrollToBottom();
}

function hideTyping() {
    isTyping = false;
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadConversationHistory() {
    try {
        const response = await fetch(`${API_BASE}/api/chat/conversations/${chatSessionId}`);
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.messages && data.messages.length > 0) {
                chatMessages = data.messages;
                
                // Clear messages container
                const messagesContainer = document.getElementById('chatMessages');
                messagesContainer.innerHTML = '';
                
                // Render all messages
                data.messages.forEach(msg => {
                    if (msg.role === 'user') {
                        renderUserMessage(msg.content, msg.timestamp);
                    } else if (msg.role === 'assistant') {
                        renderAIMessage(msg.content, msg.timestamp);
                    }
                });
                
                scrollToBottom();
            }
        }
    } catch (error) {
        console.error('Error loading conversation history:', error);
        // Continue with fresh conversation if loading fails
    }
}

function renderUserMessage(text, timestamp) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message user';
    
    const time = timestamp 
        ? new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-bubble">${escapeHtml(text)}</div>
        <div class="message-timestamp">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
}

function renderAIMessage(text, timestamp) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message ai';
    
    const time = timestamp 
        ? new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-bubble">${escapeHtml(text)}</div>
        <div class="message-timestamp">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
}

// Initialize chat widget when DOM loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatWidget);
} else {
    initChatWidget();
}

// ==========================================
// ⚡ FASE 2: PLATFORM SYNCHRONIZATION
// ==========================================

async function loadSyncStatus() {
    try {
        const response = await authFetch(`${API_BASE}/api/sync/status`);
        const status = await response.json();
        renderSyncStatus(status);
    } catch (error) {
        console.error('Error loading sync status:', error);
    }
}

function renderSyncStatus(platforms) {
    const grid = document.getElementById('syncStatusGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // All platforms that should be shown
    const allPlatforms = [
        'Airbnb', 'GetMyBoat', 'BoatSetter', 'Viator', 'Expedia', 
        'TripAdvisor', 'Groupon', 'Booking.com', 'FareHarbor', 
        'Bokun', 'Rezdy', 'Peek', 'Xola'
    ];
    
    allPlatforms.forEach(platformName => {
        const platform = platforms.find(p => p.platform === platformName) || {
            platform: platformName,
            sync_status: 'never',
            last_sync_at: null,
            bookings_synced: 0,
            conflicts_detected: 0
        };
        
        const card = document.createElement('div');
        card.className = 'sync-card';
        card.dataset.testid = `sync-card-${platformName.toLowerCase().replace(/\./g, '-')}`;
        
        const statusClass = platform.sync_status || 'never';
        const statusText = statusClass === 'never' ? 'No sincronizado' : 
                          statusClass === 'success' ? 'Exitoso' :
                          statusClass === 'error' ? 'Error' : 'En proceso';
        
        const lastSync = platform.last_sync_at 
            ? new Date(platform.last_sync_at).toLocaleString('es-ES')
            : 'Nunca';
        
        card.innerHTML = `
            <div class="sync-card-header">
                <div class="platform-name">${platform.platform}</div>
                <span class="sync-status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="sync-card-details">
                <div class="sync-detail-row">
                    <span class="sync-detail-label">Última sincronización:</span>
                    <span class="sync-detail-value">${lastSync}</span>
                </div>
                <div class="sync-detail-row">
                    <span class="sync-detail-label">Reservas sincronizadas:</span>
                    <span class="sync-detail-value">${platform.bookings_synced || 0}</span>
                </div>
                <div class="sync-detail-row">
                    <span class="sync-detail-label">Conflictos:</span>
                    <span class="sync-detail-value">${platform.conflicts_detected || 0}</span>
                </div>
            </div>
            <div class="sync-actions">
                <button class="btn-sync" onclick="syncSinglePlatform('${platform.platform}')" data-testid="button-sync-${platformName.toLowerCase().replace(/\./g, '-')}">
                    🔄 Sincronizar
                </button>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

async function syncSinglePlatform(platform) {
    try {
        const button = event.target;
        button.disabled = true;
        button.textContent = '⏳ Sincronizando...';
        
        const response = await authFetch(`${API_BASE}/api/sync/trigger/${platform}`, {
            method: 'POST'
        });
        const result = await response.json();
        
        console.log('Sync result for', platform, result);
        
        // Reload sync status
        await loadSyncStatus();
        await loadConflicts();
        await loadDashboardData();
        
        button.disabled = false;
        button.textContent = '🔄 Sincronizar';
    } catch (error) {
        console.error('Error syncing platform:', error);
        alert(`Error al sincronizar ${platform}`);
        event.target.disabled = false;
        event.target.textContent = '🔄 Sincronizar';
    }
}

async function syncAllPlatforms() {
    const button = document.getElementById('syncAllPlatforms');
    if (!button) return;
    
    try {
        button.disabled = true;
        button.textContent = '⏳ Sincronizando...';
        
        const response = await authFetch(`${API_BASE}/api/sync/trigger-all`, {
            method: 'POST'
        });
        const result = await response.json();
        
        console.log('Sync all result:', result);
        
        // Reload everything
        await loadSyncStatus();
        await loadConflicts();
        await loadDashboardData();
        
        button.disabled = false;
        button.textContent = '🔄 Sincronizar Todas';
        
        alert(`Sincronización completada: ${result.summary.totalImported} reservas importadas, ${result.summary.totalConflicts} conflictos detectados`);
    } catch (error) {
        console.error('Error syncing all platforms:', error);
        alert('Error al sincronizar plataformas');
        button.disabled = false;
        button.textContent = '🔄 Sincronizar Todas';
    }
}

async function loadConflicts() {
    try {
        const response = await authFetch(`${API_BASE}/api/sync/conflicts`);
        const conflicts = await response.json();
        renderConflicts(conflicts);
    } catch (error) {
        console.error('Error loading conflicts:', error);
    }
}

function renderConflicts(conflicts) {
    const section = document.getElementById('conflictsSection');
    const list = document.getElementById('conflictsList');
    const count = document.getElementById('conflictCount');
    
    if (!section || !list || !count) return;
    
    if (conflicts.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    count.textContent = conflicts.length;
    list.innerHTML = '';
    
    conflicts.forEach((conflict, index) => {
        const card = document.createElement('div');
        card.className = 'conflict-card';
        card.dataset.testid = `conflict-card-${index}`;
        
        card.innerHTML = `
            <div class="conflict-info">
                <div class="conflict-title">${conflict.message}</div>
                <div class="conflict-details">
                    Fecha: ${conflict.date} a las ${conflict.time}<br>
                    Reserva 1: ${conflict.bookings[0].platform} - ${conflict.bookings[0].customer}<br>
                    Reserva 2: ${conflict.bookings[1].platform} - ${conflict.bookings[1].customer}
                </div>
            </div>
            <div class="conflict-actions">
                <button class="btn-resolve" onclick="resolveConflict('${conflict.bookings[0].id}')" data-testid="button-resolve-${index}-0">
                    Cancelar #1
                </button>
                <button class="btn-resolve" onclick="resolveConflict('${conflict.bookings[1].id}')" data-testid="button-resolve-${index}-1">
                    Cancelar #2
                </button>
            </div>
        `;
        
        list.appendChild(card);
    });
}

async function resolveConflict(bookingIdToCancel) {
    if (!confirm('¿Estás seguro de que deseas cancelar esta reserva?')) {
        return;
    }
    
    try {
        console.log('🔄 Resolving conflict - canceling booking:', bookingIdToCancel);
        
        const response = await authFetch(`${API_BASE}/api/sync/resolve-conflict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bookingIdToCancel,
                reason: 'Conflicto de sincronización resuelto manualmente'
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ Conflict resolution result:', result);
        
        if (result.success) {
            alert('Conflicto resuelto exitosamente');
            
            // Small delay to ensure DB is updated before reloading
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Reload conflicts and dashboard data
            await loadConflicts();
            await loadDashboardData();
            
            console.log('🔄 UI updated after conflict resolution');
        } else {
            console.error('❌ Failed to resolve conflict:', result);
            alert('Error al resolver conflicto: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('❌ Error resolving conflict:', error);
        alert('Error al resolver conflicto: ' + error.message);
    }
}

// Load unread messages count for notifications badge
async function loadUnreadCount() {
    try {
        const response = await fetch('/api/messages/unread-count');
        const data = await response.json();
        const badge = document.getElementById('unread-badge');
        
        if (badge && data.count > 0) {
            badge.textContent = data.count;
            badge.style.display = 'inline';
        } else if (badge) {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading unread count:', error);
    }
}

// Initialize sync panel
function initSyncPanel() {
    loadSyncStatus();
    loadConflicts();
    loadUnreadCount(); // Load unread messages count
    
    // Setup sync all button
    const syncAllBtn = document.getElementById('syncAllPlatforms');
    if (syncAllBtn) {
        syncAllBtn.addEventListener('click', syncAllPlatforms);
    }
    
    // Refresh sync status and unread count every 30 seconds
    setInterval(() => {
        loadSyncStatus();
        loadConflicts();
        loadUnreadCount();
    }, 30000);
}

// Initialize when DOM loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSyncPanel);
} else {
    initSyncPanel();
}

// ─── Global Search ──────────────────────────────────────────────
const SEARCH_MODULES = [
    { label: 'Calendario', url: '/schedule.html', icon: '📅', tags: ['calendario', 'agenda', 'schedule'] },
    { label: 'Comisiones', url: '/commissions.html', icon: '💰', tags: ['comisiones', 'pagos', 'comision'] },
    { label: 'Precios', url: '/pricing.html', icon: '💵', tags: ['precios', 'tarifas', 'pricing'] },
    { label: 'Pricing Dinámico', url: '/dynamic-pricing.html', icon: '🧠', tags: ['pricing', 'dinamico', 'machine learning'] },
    { label: 'Contabilidad', url: '/accounting.html', icon: '📊', tags: ['contabilidad', 'cuentas', 'transacciones', 'banco'] },
    { label: 'Mensajes', url: '/messages.html', icon: '💬', tags: ['mensajes', 'clientes', 'chat', 'inbox'] },
    { label: 'Mantenimiento', url: '/boat-maintenance.html', icon: '🔧', tags: ['mantenimiento', 'barcos', 'mecanicos', 'reparacion'] },
    { label: 'Mecánicos', url: '/boat-maintenance.html#mechanics', icon: '🔧', tags: ['mecanicos', 'tecnicos'] },
    { label: 'Condiciones Marinas', url: '/marine-conditions.html', icon: '🌊', tags: ['clima', 'mar', 'condiciones', 'noaa', 'oleaje'] },
    { label: 'Flotilla', url: '/fleet.html', icon: '🚤', tags: ['flotilla', 'barcos', 'embarcaciones', 'fleet'] },
    { label: 'Operaciones', url: '/operations.html', icon: '📋', tags: ['operaciones', 'reservas', 'bookings'] },
    { label: 'Documentos', url: '/documents.html', icon: '🗂️', tags: ['documentos', 'archivos', 'facturas'] },
    { label: 'Activos', url: '/assets.html', icon: '📦', tags: ['activos', 'inventario', 'equipo'] },
    { label: 'Dashboard Ejecutivo', url: '/reports.html#f1', icon: '📊', tags: ['ejecutivo', 'kpis', 'resumen'] },
    { label: 'Capitanes', url: '/crew.html?tab=captains', icon: '👨‍✈️', tags: ['capitanes', 'capitan', 'tripulacion'] },
    { label: 'Stew', url: '/crew.html?tab=stews', icon: '🧑‍✈️', tags: ['stew', 'azafatas', 'tripulacion'] },
    { label: 'Tripulación / Crew', url: '/crew.html', icon: '👥', tags: ['tripulacion', 'crew', 'equipo', 'personal'] },
];

let _crewSearchCache = null;
let _searchSelected = -1;

function toggleGlobalSearch() {
    const box = document.getElementById('globalSearchBox');
    if (!box) return;
    const visible = box.style.display !== 'none';
    box.style.display = visible ? 'none' : 'block';
    if (!visible) {
        const inp = document.getElementById('globalSearchInput');
        if (inp) { inp.value = ''; inp.focus(); }
        document.getElementById('globalSearchResults').innerHTML = '';
        _searchSelected = -1;
        if (!_crewSearchCache) loadCrewSearchCache();
    }
}

async function loadCrewSearchCache() {
    try {
        const [caps, stews] = await Promise.all([
            fetch('/api/captains').then(r => r.json()).catch(() => []),
            fetch('/api/stews').then(r => r.json()).catch(() => []),
        ]);
        _crewSearchCache = {
            captains: Array.isArray(caps) ? caps : [],
            stews: Array.isArray(stews) ? stews : [],
        };
    } catch(e) { _crewSearchCache = { captains: [], stews: [] }; }
}

function runGlobalSearch(q) {
    _searchSelected = -1;
    const box = document.getElementById('globalSearchResults');
    if (!box) return;
    q = (q || '').trim().toLowerCase();
    if (!q) { box.innerHTML = ''; return; }

    const results = [];

    // Modules
    SEARCH_MODULES.forEach(m => {
        if (m.label.toLowerCase().includes(q) || m.tags.some(t => t.includes(q))) {
            results.push({ icon: m.icon, label: m.label, sub: 'Módulo', url: m.url });
        }
    });

    // Captains from cache
    if (_crewSearchCache) {
        _crewSearchCache.captains.forEach(c => {
            if ((c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q) || (c.email||'').toLowerCase().includes(q)) {
                results.push({ icon: '👨‍✈️', label: c.name, sub: `Capitán · ${c.status||'active'}`, url: `/crew.html?tab=captains&highlight=${c.id}` });
            }
        });
        _crewSearchCache.stews.forEach(s => {
            if ((s.name||'').toLowerCase().includes(q) || (s.phone||'').includes(q) || (s.email||'').toLowerCase().includes(q)) {
                results.push({ icon: '🧑‍✈️', label: s.name, sub: `Stew · ${s.status||'active'}`, url: `/crew.html?tab=stews&highlight=${s.id}` });
            }
        });
    }

    if (results.length === 0) {
        box.innerHTML = '<div class="gs-empty">Sin resultados para "' + q.replace(/</g,'&lt;') + '"</div>';
        return;
    }

    box.innerHTML = results.slice(0, 8).map((r, i) => `
        <a href="${r.url}" class="gs-item" data-idx="${i}" data-testid="search-result-${i}">
            <span class="gs-icon">${r.icon}</span>
            <span class="gs-info"><span class="gs-label">${r.label}</span><span class="gs-sub">${r.sub}</span></span>
        </a>
    `).join('');
}

function searchKeyNav(e) {
    const items = document.querySelectorAll('.gs-item');
    if (e.key === 'ArrowDown') {
        _searchSelected = Math.min(_searchSelected + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
        _searchSelected = Math.max(_searchSelected - 1, -1);
    } else if (e.key === 'Enter' && _searchSelected >= 0 && items[_searchSelected]) {
        items[_searchSelected].click();
        return;
    } else if (e.key === 'Escape') {
        toggleGlobalSearch();
        return;
    }
    items.forEach((el, i) => el.classList.toggle('gs-active', i === _searchSelected));
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('globalSearchWrap');
    if (wrap && !wrap.contains(e.target)) {
        const box = document.getElementById('globalSearchBox');
        if (box) box.style.display = 'none';
    }
});
