/**
 * NADAKI FLEET OPERATIONS CENTER — FASE 3
 * List View · View Mode Selector · Filters · Sort · Keyboard Shortcuts
 */
(function () {
  'use strict';

  /* ─── CONSTANTS ─────────────────────────────────────── */
  const OP_START  = 6;
  const OP_END    = 22;
  const OP_HOURS  = OP_END - OP_START;

  const BOAT_COLORS = {
    'CRANCHI':                  '#3B82F6',
    'SILVER LINNING':           '#F59E0B',
    'SEA RAY NAUTI NABOURS 40': '#EC4899',
    'SEARAY 500':               '#10B981',
    'SeaRay 31':                '#6B7280',
    'SeaRay 36':                '#8B5CF6',
  };

  const STATUS_COLORS = {
    confirmed:      '#10B981',
    pending:        '#F97316',
    inquiry:        '#71717A',
    'crew-assigned':'#06B6D4',
    'checked-in':   '#3B82F6',
    'in-progress':  '#8B5CF6',
    completed:      '#71717A',
    cancelled:      '#6B7280',
    'no-show':      '#EF4444',
    hold:           '#F59E0B',
  };

  const CHANNEL_COLORS = {
    airbnb:      { bg:'#FF385C22', text:'#CC1D3D', label:'Airbnb' },
    getmyboat:   { bg:'#00A87822', text:'#007A5A', label:'GetMyBoat' },
    boatsetter:  { bg:'#0066CC22', text:'#004A99', label:'BoatSetter' },
    viator:      { bg:'#32a85222', text:'#1A7A35', label:'Viator' },
    expedia:     { bg:'#F6C00022', text:'#A07D00', label:'Expedia' },
    tripadvisor: { bg:'#34E0A122', text:'#00A680', label:'TripAdvisor' },
    manual:      { bg:'#6B728022', text:'#374151', label:'Manual' },
    wordpress:   { bg:'#21759B22', text:'#0F5A7C', label:'WordPress' },
    fareharbor:  { bg:'#FF640022', text:'#CC4800', label:'FareHarbor' },
    bokun:       { bg:'#5B21B622', text:'#3B0F80', label:'Bokun' },
  };

  const PAYMENT_STATUS_COLORS = {
    paid:      { bg:'#D1FAE522', text:'#065F46', label:'Pagado' },
    partial:   { bg:'#FEF3C722', text:'#92400E', label:'Parcial' },
    pending:   { bg:'#FEE2E222', text:'#991B1B', label:'Pendiente' },
    refunded:  { bg:'#EDE9FE22', text:'#5B21B6', label:'Reembolsado' },
  };

  const SEVERITY_COLORS = { critical: '#EF4444', warning: '#F59E0B', info: '#6B7280' };

  /* ─── STATE ──────────────────────────────────────────── */
  let S = {
    zoom: 7,
    rangeStart: null,
    data: null,
    kpis: null,
    alerts: null,
    todayStrip: null,
    alertsOpen: true,
    nowLineInterval: null,
    activeBookingId: null,
    captains: [],
    // Fase 3A: view mode + list view state
    viewMode: 'timeline',           // 'timeline' | 'weekly' | 'monthly' | 'list'
    listSort: { col: 'booking_date', asc: true },
    listFilters: { boat: '', status: '', search: '' },
    listDensity: localStorage.getItem('foc-list-density') || 'medium',
    bulkSelected: new Set(),
  };

  /* ─── UTILS ──────────────────────────────────────────── */
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function toISO(d) { return d.toISOString().split('T')[0]; }
  function parseLocalDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
  function dayName(date) { return date.toLocaleDateString('es', { weekday: 'short' }).replace('.', '').toUpperCase(); }
  function monthLabel(from, to) {
    const f = from.toLocaleDateString('es', { month: 'short', day: 'numeric' });
    const t = to.toLocaleDateString('es', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${f} – ${t}`;
  }
  function fmtCurrency(v) {
    const n = parseFloat(v) || 0;
    return '$' + n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtMono(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function timeToFraction(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return Math.max(0, Math.min(1, (h + m / 60 - OP_START) / OP_HOURS));
  }
  function boatColor(boatType, fleet) {
    if (BOAT_COLORS[boatType]) return BOAT_COLORS[boatType];
    const fc = fleet && fleet.find(f => f.boat_type === boatType);
    return fc?.display_color || '#6B7280';
  }
  function statusColor(status) { return STATUS_COLORS[status] || '#71717A'; }
  function deltaBadge(curr, prev) {
    if (!prev || prev === 0) return '';
    const pct = ((curr - prev) / prev * 100).toFixed(0);
    const sign = pct >= 0 ? '+' : '';
    const cls  = pct >= 0 ? 'foc-delta-up' : 'foc-delta-dn';
    return `<span class="foc-delta ${cls}">${sign}${pct}%</span>`;
  }
  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatDateLong(iso) {
    if (!iso) return '—';
    const d = parseLocalDate(iso);
    return d.toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function timeAgo(dt) {
    if (!dt) return '';
    const diff = (Date.now() - new Date(dt).getTime()) / 1000;
    if (diff < 60) return 'hace un momento';
    if (diff < 3600) return `hace ${Math.floor(diff/60)}m`;
    if (diff < 86400) return `hace ${Math.floor(diff/3600)}h`;
    return `hace ${Math.floor(diff/86400)} días`;
  }
  function calcEndTime(startTime, durationHours) {
    const parts = (startTime || '10:00').split(':');
    const sh = parseInt(parts[0]) + (parseInt(parts[1] || 0) / 60);
    const eh = sh + (durationHours || 4);
    return `${String(Math.floor(eh)).padStart(2,'0')}:${String(Math.round((eh % 1) * 60)).padStart(2,'0')}`;
  }

  /* ─── CHANNEL + STATUS CHIPS ─────────────────────────── */
  function channelChip(platform) {
    if (!platform) return '';
    const key = platform.toLowerCase().replace(/[\s-]/g,'');
    const cfg = CHANNEL_COLORS[key] || { bg:'#6B728022', text:'#374151', label: platform };
    return `<span class="foc-chan-chip" style="background:${cfg.bg};color:${cfg.text}">${escHtml(cfg.label)}</span>`;
  }
  function paymentStatusChip(status) {
    const cfg = PAYMENT_STATUS_COLORS[status] || { bg:'#6B728022', text:'#374151', label: status || '—' };
    return `<span class="foc-pay-chip" style="background:${cfg.bg};color:${cfg.text}">${escHtml(cfg.label)}</span>`;
  }

  /* ─── ACTIVITY LOG ───────────────────────────────────── */
  function buildActivityItems(b) {
    const items = [];
    if (b.created_at) {
      items.push({ icon:'➕', label:'Reserva creada', time: timeAgo(b.created_at), detail: b.sold_by_name ? `por ${b.sold_by_name}` : '' });
    }
    if (b.status && b.status !== 'pending' && b.status !== 'inquiry') {
      items.push({ icon:'✓', label: `Estado: ${b.status}`, time: '', detail: '' });
    }
    if (b.assigned_captain_name) {
      items.push({ icon:'⚓', label:`Capitán asignado: ${b.assigned_captain_name}`, time: '', detail: '' });
    }
    if (b.payment_status === 'paid' && b.payment_date) {
      items.push({ icon:'💰', label:`Pago recibido`, time: formatDateLong(b.payment_date), detail: fmtCurrency(b.total_amount) });
    }
    if (b.updated_at && b.created_at && b.updated_at !== b.created_at) {
      items.push({ icon:'✏', label:'Última actualización', time: timeAgo(b.updated_at), detail: '' });
    }
    if (items.length === 0) {
      return '<div class="foc-activity-empty">Sin historial registrado</div>';
    }
    return items.map(i => `
      <div class="foc-activity-item">
        <span class="foc-activity-icon">${i.icon}</span>
        <div class="foc-activity-body">
          <span class="foc-activity-label">${escHtml(i.label)}</span>
          ${i.detail ? `<span class="foc-activity-detail">${escHtml(i.detail)}</span>` : ''}
        </div>
        ${i.time ? `<span class="foc-activity-time">${escHtml(i.time)}</span>` : ''}
      </div>`).join('');
  }

  /* ─── DOM HELPERS ────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  /* ─── DATA FETCHING ──────────────────────────────────── */
  async function fetchTimeline() {
    const from = toISO(S.rangeStart);
    const to   = toISO(addDays(S.rangeStart, S.zoom - 1));
    const resp = await fetch(`/api/fleet/timeline?from=${from}&to=${to}`);
    S.data = await resp.json();
  }
  async function fetchKPIs() {
    const from = toISO(S.rangeStart);
    const to   = toISO(addDays(S.rangeStart, S.zoom - 1));
    const resp = await fetch(`/api/fleet/kpis?from=${from}&to=${to}`);
    S.kpis = await resp.json();
  }
  async function fetchAlerts() {
    const resp = await fetch('/api/fleet/alerts');
    S.alerts = await resp.json();
  }
  async function fetchTodayStrip() {
    const resp = await fetch('/api/fleet/today-strip');
    S.todayStrip = await resp.json();
  }
  async function fetchCaptains() {
    try {
      const resp = await fetch('/api/fleet/captains');
      const d = await resp.json();
      S.captains = d.captains || [];
    } catch(e) { S.captains = []; }
  }

  async function loadAll() {
    showLoading(true);
    try {
      await Promise.all([fetchTimeline(), fetchKPIs(), fetchAlerts(), fetchTodayStrip()]);
      render();
    } catch (e) {
      console.error('Fleet Ops load error:', e);
    } finally {
      showLoading(false);
    }
  }

  function showLoading(on) {
    const ld = el('foc-loading');
    const bd = el('foc-body');
    if (ld) ld.style.display = on ? 'flex' : 'none';
    if (bd) bd.style.opacity = on ? '0.4' : '1';
  }

  /* ─── RANGE MANAGEMENT ───────────────────────────────── */
  function initRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    S.rangeStart = monday;
  }
  function shiftRange(dir) { S.rangeStart = addDays(S.rangeStart, dir * S.zoom); loadAll(); }
  function goToday() { initRange(); loadAll(); }
  function setZoom(z) { S.zoom = z; loadAll(); }

  /* ─── RENDER PIPELINE ────────────────────────────────── */
  function render() {
    renderTodayStrip();
    renderKPIBar();
    renderNavBar();
    updateViewModeUI();
    if (S.viewMode === 'list') {
      renderListView();
    } else {
      renderTimeline();
    }
    renderAlertsPanel();
    updateNowLine();
  }

  /* TODAY STRIP */
  function renderTodayStrip() {
    const wrap = el('foc-today-strip');
    if (!wrap || !S.todayStrip) return;
    const ts = S.todayStrip;
    const items = [];

    if (ts.next_departure) {
      const nd = ts.next_departure;
      const m = nd.minutes_away;
      const label = m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
      items.push(`<span class="foc-strip-item"><span class="foc-strip-icon">⏱</span>Próxima salida en <strong>${label}</strong> — ${escHtml(nd.customer_name)}</span>`);
    } else if (ts.total_today === 0) {
      items.push(`<span class="foc-strip-item"><span class="foc-strip-icon">📅</span>Sin salidas hoy</span>`);
    } else {
      items.push(`<span class="foc-strip-item foc-strip-ok"><span class="foc-strip-icon">✓</span><strong>${ts.total_today}</strong> salida${ts.total_today > 1 ? 's' : ''} programada${ts.total_today > 1 ? 's' : ''} hoy</span>`);
    }
    if (ts.unassigned_crew > 0) {
      items.push(`<span class="foc-strip-item foc-strip-warn"><span class="foc-strip-icon">⚠</span><strong>${ts.unassigned_crew}</strong> sin capitán asignado</span>`);
    }
    if (ts.payment_pending > 0) {
      items.push(`<span class="foc-strip-item foc-strip-warn"><span class="foc-strip-icon">💳</span><strong>${ts.payment_pending}</strong> pago pendiente</span>`);
    }
    if (ts.first_gap) {
      const fg = ts.first_gap;
      items.push(`<span class="foc-strip-item foc-strip-ok"><span class="foc-strip-icon">🕐</span>Hueco libre: <strong>${escHtml(fg.display_name)}</strong> ${escHtml(fg.label)} (${fg.duration_h.toFixed(1)}h)</span>`);
    } else if (ts.free_boats && ts.free_boats.length > 0) {
      const names = ts.free_boats.slice(0,3).map(b => b.display_name || b.boat_type).join(' · ');
      items.push(`<span class="foc-strip-item foc-strip-ok"><span class="foc-strip-icon">🛥</span>Libre hoy: ${escHtml(names)}</span>`);
    }

    wrap.innerHTML = items.join('<span class="foc-strip-sep">·</span>');
  }

  /* KPI BAR */
  function renderKPIBar() {
    const bar = el('foc-kpi-bar');
    if (!bar || !S.kpis) return;
    const k = S.kpis;
    bar.innerHTML = `
      <div class="foc-kpi">
        <div class="foc-kpi-label">Reservas</div>
        <div class="foc-kpi-value">${fmtMono(k.total_bookings)}${deltaBadge(k.total_bookings, k.prev?.total_bookings)}</div>
      </div>
      <div class="foc-kpi-divider"></div>
      <div class="foc-kpi">
        <div class="foc-kpi-label">Revenue</div>
        <div class="foc-kpi-value">${fmtCurrency(k.total_revenue)}${deltaBadge(k.total_revenue, k.prev?.total_revenue)}</div>
      </div>
      <div class="foc-kpi-divider"></div>
      <div class="foc-kpi">
        <div class="foc-kpi-label">Utilización</div>
        <div class="foc-kpi-value">${k.utilization_pct}<span class="foc-kpi-unit">%</span></div>
      </div>
      <div class="foc-kpi-divider"></div>
      <div class="foc-kpi">
        <div class="foc-kpi-label">Huecos ≥2h</div>
        <div class="foc-kpi-value foc-kpi-neutral">${fmtMono(k.open_gaps)}</div>
      </div>
      <div class="foc-kpi-divider"></div>
      <div class="foc-kpi">
        <div class="foc-kpi-label">Críticos</div>
        <div class="foc-kpi-value ${k.critical_alerts > 0 ? 'foc-kpi-danger' : 'foc-kpi-ok'}">${fmtMono(k.critical_alerts)}</div>
      </div>
      <div class="foc-kpi-divider"></div>
      <div class="foc-kpi">
        <div class="foc-kpi-label">Mantenimiento</div>
        <div class="foc-kpi-value ${k.in_maintenance > 0 ? 'foc-kpi-warn' : 'foc-kpi-ok'}">${fmtMono(k.in_maintenance)}</div>
      </div>`;
  }

  /* NAV BAR */
  function renderNavBar() {
    const nav = el('foc-nav-label');
    if (!nav) return;
    const from = S.rangeStart;
    const to   = addDays(from, S.zoom - 1);
    nav.textContent = monthLabel(from, to);
    ['3','7','14','30'].forEach(z => {
      const btn = el(`foc-zoom-${z}`);
      if (btn) btn.classList.toggle('foc-zoom-active', parseInt(z) === S.zoom);
    });
  }

  /* ─── MAIN TIMELINE ──────────────────────────────────── */
  function renderTimeline() {
    const container = el('foc-timeline');
    if (!container || !S.data) return;

    const { fleet, bookings, holds, maintenance } = S.data;
    const today = toISO(new Date());
    const days = [];
    for (let i = 0; i < S.zoom; i++) days.push(addDays(S.rangeStart, i));

    const bMap = {};
    (bookings || []).forEach(b => {
      if (!bMap[b.boat_type]) bMap[b.boat_type] = {};
      if (!bMap[b.boat_type][b.booking_date]) bMap[b.boat_type][b.booking_date] = [];
      bMap[b.boat_type][b.booking_date].push(b);
    });
    const mMap = {};
    (maintenance || []).forEach(m => {
      if (!mMap[m.boat_type]) mMap[m.boat_type] = [];
      mMap[m.boat_type].push(m);
    });

    const allBoatTypes = new Set((fleet || []).map(f => f.boat_type));
    (bookings || []).forEach(b => allBoatTypes.add(b.boat_type));
    const allBoats = [...allBoatTypes].map(bt => {
      return (fleet || []).find(f => f.boat_type === bt) || { boat_type: bt, display_name: bt, display_color: boatColor(bt, fleet), short_label: bt.slice(0,3).toUpperCase(), buffer_minutes: 60 };
    });

    const COL_W = Math.max(120, Math.floor(Math.min(200, (window.innerWidth - 180) / S.zoom)));
    const ROW_H = 110;

    let dayHeadersHtml = `<div class="foc-rail-header"></div>`;
    days.forEach(d => {
      const iso = toISO(d);
      const isToday = iso === today;
      dayHeadersHtml += `
        <div class="foc-day-header ${isToday ? 'foc-day-today' : ''}" style="width:${COL_W}px;min-width:${COL_W}px">
          <span class="foc-day-name">${dayName(d)}</span>
          <span class="foc-day-num ${isToday ? 'foc-day-num-today' : ''}">${d.getDate()}</span>
          ${isToday ? '<span class="foc-today-badge">HOY</span>' : ''}
        </div>`;
    });

    let rowsHtml = '';
    allBoats.forEach(boat => {
      const color = boat.display_color || boatColor(boat.boat_type, fleet);
      const boatBookings = bMap[boat.boat_type] || {};
      const boatMaint    = mMap[boat.boat_type] || [];
      const allBkings    = Object.values(boatBookings).flat();
      const rangeRevenue = allBkings.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0);
      const boatDaysBooked = Object.keys(boatBookings).length;
      const utilPct = S.zoom > 0 ? Math.round((boatDaysBooked / S.zoom) * 100) : 0;
      const todayLocal = toISO(new Date());
      const upcoming = allBkings.filter(b => b.booking_date >= todayLocal).sort((a,b) => a.booking_date.localeCompare(b.booking_date));
      const nextBk = upcoming[0];
      let nextLabel = 'Sin reservas próximas';
      if (nextBk) {
        const isToday_ = nextBk.booking_date === todayLocal;
        nextLabel = `${isToday_ ? 'Hoy' : parseLocalDate(nextBk.booking_date).toLocaleDateString('es',{month:'short',day:'numeric'})} ${nextBk.start_time||''}`;
      }
      const isMaintNow = boatMaint.some(m => { const s = new Date(m.start_datetime), e = new Date(m.end_datetime), now = new Date(); return s <= now && e >= now; });
      const isBookedNow = allBkings.some(b => {
        if (b.booking_date !== todayLocal) return false;
        const sh = b.start_time ? parseInt(b.start_time.split(':')[0]) : 10;
        const eh = sh + (b.duration_hours || 4);
        const nh = new Date().getHours() + new Date().getMinutes()/60;
        return nh >= sh && nh < eh;
      });
      let statusLabel = 'Disponible', statusDot = '#10B981';
      if (isMaintNow) { statusLabel = 'Mantenimiento'; statusDot = '#EF4444'; }
      else if (isBookedNow) { statusLabel = 'En Servicio'; statusDot = '#3B82F6'; }

      const hasBookingsInRange = allBkings.length > 0;
      const railHtml = `
        <div class="foc-rail" style="border-left: 3px solid ${color}">
          <div class="foc-rail-top">
            <span class="foc-status-dot" style="background:${statusDot}"></span>
            <span class="foc-rail-name">${escHtml(boat.display_name || boat.boat_type)}</span>
          </div>
          <div class="foc-rail-stat">${utilPct}% util.</div>
          <div class="foc-rail-stat foc-rail-rev">${fmtCurrency(rangeRevenue)}</div>
          <div class="foc-rail-next">${escHtml(nextLabel)}</div>
          <div class="foc-rail-status" style="color:${statusDot}">${statusLabel}</div>
        </div>`;

      let cellsHtml = '';
      days.forEach(day => {
        const iso = toISO(day);
        const isToday_ = iso === today;
        const dayBkings = boatBookings[iso] || [];
        const dayMaint = boatMaint.filter(m => {
          const ms = toISO(new Date(m.start_datetime));
          const me = toISO(new Date(m.end_datetime));
          return iso >= ms && iso <= me;
        });
        let cellContent = '';
        dayMaint.forEach(m => {
          cellContent += `<div class="foc-maint-overlay" title="${escHtml(m.maintenance_type||'Mantenimiento')}"><span class="foc-maint-icon">🔧</span><span class="foc-maint-label">${escHtml(m.maintenance_type||'Mantenimiento')}</span></div>`;
        });
        dayBkings.forEach(b => { cellContent += renderBookingBlock(b, COL_W, color, ROW_H); });
        if (!hasBookingsInRange && days.indexOf(day) === 0) {
          cellContent += `<div class="foc-empty-row-hint">Disponible · Sin reservas <a class="foc-create-link" href="/commissions.html">+ Crear</a></div>`;
        }
        const nowFrac = timeToFraction(new Date().toTimeString().slice(0,5));
        const nowPx = Math.round(nowFrac * ROW_H);
        const nowLine = isToday_ ? `<div class="foc-now-line" id="foc-now-${boat.boat_type.replace(/\s+/g,'_')}" style="top:${nowPx}px"></div>` : '';
        cellsHtml += `<div class="foc-day-cell ${isToday_ ? 'foc-cell-today' : ''}" style="width:${COL_W}px;min-width:${COL_W}px;height:${ROW_H}px" data-date="${iso}" data-boat="${escHtml(boat.boat_type)}">${cellContent}${nowLine}</div>`;
      });

      rowsHtml += `<div class="foc-row" style="height:${ROW_H}px">${railHtml}<div class="foc-row-cells">${cellsHtml}</div></div>`;
    });

    const timeAxisHtml = buildTimeAxis(ROW_H, days.length, COL_W);
    container.innerHTML = `
      <div class="foc-timeline-inner">
        <div class="foc-day-headers">${dayHeadersHtml}</div>
        <div class="foc-rows-area">
          <div class="foc-time-axis">${timeAxisHtml}</div>
          <div class="foc-rows">${rowsHtml}</div>
        </div>
      </div>`;

    if (S.nowLineInterval) clearInterval(S.nowLineInterval);
    S.nowLineInterval = setInterval(updateNowLine, 60000);
  }

  function buildTimeAxis(rowH) {
    const hours = [6, 9, 12, 15, 18, 21];
    let html = '';
    hours.forEach(h => {
      const frac = (h - OP_START) / OP_HOURS;
      html += `<div class="foc-time-tick" style="top:${Math.round(frac * rowH)}px">${String(h).padStart(2,'0')}:00</div>`;
    });
    return html;
  }

  /* BOOKING BLOCK */
  function renderBookingBlock(b, colW, boatColorHex, rowH) {
    const frac    = timeToFraction(b.start_time || '10:00');
    const durFrac = Math.min(1 - frac, (b.duration_hours || 4) / OP_HOURS);
    const topPx   = Math.round(frac * rowH);
    const hPx     = Math.max(28, Math.round(durFrac * rowH));
    const sColor  = statusColor(b.status || 'confirmed');
    const captain = b.assigned_captain_name || '';
    const endStr  = calcEndTime(b.start_time, b.duration_hours);
    const timeStr = `${b.start_time||'10:00'}–${endStr}`;
    const isEstTime = b.start_time_source === 'default_backfill';
    const isEstDur  = b.duration_source   === 'default_backfill';
    const badgeHtml = !captain ? `<span class="foc-blk-badge foc-blk-badge-warn">!</span>` : '';
    const estHtml = (isEstTime || isEstDur) ? `<span class="foc-blk-est">~</span>` : '';
    let content = '';
    if (colW > 180 && hPx > 60) {
      content = `<div class="foc-blk-header"><span class="foc-blk-short">${escHtml(b.boat_type?.slice(0,4).toUpperCase()||'?')}</span>${badgeHtml}</div><div class="foc-blk-name">${escHtml(b.customer_name||'—')}</div><div class="foc-blk-meta">${timeStr}${estHtml}${captain ? ' · ' + escHtml(captain.split(' ')[0]) : ''} · ${fmtCurrency(b.total_amount)}</div>`;
    } else if (colW >= 100 || hPx >= 44) {
      content = `<div class="foc-blk-header"><span class="foc-blk-short">${escHtml((b.customer_name||'?').slice(0,6))}</span>${badgeHtml}</div><div class="foc-blk-meta">${b.customer_name?.split(' ')[0]||'?'} · ${b.start_time||'10:00'}${estHtml}</div>`;
    } else {
      content = `<div class="foc-blk-header"><span class="foc-blk-short">${initials(b.customer_name)}</span>${badgeHtml}</div>`;
    }
    return `<div class="foc-booking-block" style="top:${topPx}px;height:${hPx}px;border-left-color:${boatColorHex};background:${sColor}18" data-id="${b.id}" data-testid="booking-block-${b.id}" title="${escHtml(b.customer_name)} · ${timeStr} · ${b.boat_type}" onclick="FleetOpsCenter.openDrawer('${b.id}')">${content}</div>`;
  }

  /* ─── LIST VIEW ─────────────────────────────────────── */
  function renderListView() {
    const container = el('foc-timeline');
    if (!container || !S.data) return;

    const { fleet, bookings } = S.data;
    const allBookings = bookings || [];

    // Build full set from fleet_config for boat selector
    const boatKeys = [...new Set([
      ...(fleet || []).map(f => f.boat_type),
      ...allBookings.map(b => b.boat_type),
    ])].sort();

    // Apply filters
    let rows = allBookings.filter(b => {
      if (S.listFilters.boat   && b.boat_type !== S.listFilters.boat)   return false;
      if (S.listFilters.status && b.status    !== S.listFilters.status) return false;
      if (S.listFilters.search) {
        const q = S.listFilters.search.toLowerCase();
        const hay = `${b.customer_name||''} ${b.booking_id||''} ${b.id||''} ${b.boat_type||''} ${b.assigned_captain_name||''} ${b.platform||''} ${b.customer_phone||''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Sort
    const { col, asc } = S.listSort;
    rows.sort((a, bk) => {
      let av = a[col], bv = bk[col];
      if (['total_amount','duration_hours','num_guests'].includes(col)) { av = parseFloat(av)||0; bv = parseFloat(bv)||0; }
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });

    const density  = S.listDensity; // compact | medium | comfortable
    const rowH     = density === 'compact' ? '32px' : density === 'comfortable' ? '56px' : '40px';
    const fontSize = density === 'compact' ? '12px' : '13px';
    const cellPad  = density === 'compact' ? '4px 10px' : density === 'comfortable' ? '12px 12px' : '8px 12px';

    const COLS = [
      { key: 'booking_date',          label: 'Fecha',    sortable: true  },
      { key: 'start_time',            label: 'Hora',     sortable: true  },
      { key: 'duration_hours',        label: 'Dur.',     sortable: true  },
      { key: 'id',                    label: 'ID',       sortable: false },
      { key: 'customer_name',         label: 'Cliente',  sortable: true  },
      { key: 'boat_type',             label: 'Barco',    sortable: true  },
      { key: 'package_type',          label: 'Paquete',  sortable: true  },
      { key: 'num_guests',            label: 'Pax',      sortable: true  },
      { key: 'assigned_captain_name', label: 'Capitán',  sortable: true  },
      { key: 'stew_name',             label: 'Stew',     sortable: true  },
      { key: 'platform',              label: 'Canal',    sortable: true  },
      { key: 'payment_status',        label: 'Estado',   sortable: true  },
      { key: 'total_amount',          label: 'Total',    sortable: true  },
    ];

    const thHtml = [
      `<th class="foc-lt foc-lt-cb"><input type="checkbox" id="foc-select-all" onchange="FleetOpsCenter.toggleSelectAll()" data-testid="checkbox-select-all" title="Seleccionar todos"></th>`,
      ...COLS.map(c => {
        const sorted = S.listSort.col === c.key;
        const arrow  = sorted ? (S.listSort.asc ? ' ↑' : ' ↓') : '';
        const cls    = `foc-lt${sorted?' foc-lt-sort':''}${c.sortable?' foc-lt-sortable':''}`;
        const onclick = c.sortable ? `onclick="FleetOpsCenter.listSortBy('${c.key}')"` : '';
        return `<th class="${cls}" ${onclick} data-testid="th-list-${c.key}">${escHtml(c.label)}${arrow ? `<span class="foc-sort-arrow">${arrow}</span>` : ''}</th>`;
      }),
      `<th class="foc-lt" style="width:40px"></th>`,
    ].join('');

    const PAYMENT_STATUS_LABEL = { paid:'Pagado', partial:'Parcial', pending:'Pendiente', refunded:'Reembolsado', unpaid:'Sin pagar' };

    const rowsHtml = rows.map(b => {
      const color   = boatColor(b.boat_type, fleet);
      const sColor  = statusColor(b.status || 'confirmed');
      const psColor = (PAYMENT_STATUS_COLORS[b.payment_status] || {}).text || '#6B7280';
      const psBg    = (PAYMENT_STATUS_COLORS[b.payment_status] || {}).bg   || '#6B728022';
      const psLabel = PAYMENT_STATUS_LABEL[b.payment_status] || (b.payment_status||'—');
      const endStr  = calcEndTime(b.start_time, b.duration_hours);
      const noTime  = !b.start_time || b.start_time_source === 'default_backfill';
      const timeStr = noTime ? '' : `${b.start_time}–${endStr}`;
      const noCap   = !b.assigned_captain_name;
      const isSelected = S.bulkSelected.has(b.id);
      const shortId = (b.booking_id || b.id || '').slice(-8).toUpperCase();

      const cells = [
        `<td class="foc-lt foc-lt-cb" onclick="event.stopPropagation()"><input type="checkbox" class="foc-row-cb" ${isSelected?'checked':''} onchange="FleetOpsCenter.toggleBulkSelect('${escHtml(b.id)}')" data-testid="checkbox-row-${b.id}"></td>`,
        `<td class="foc-lt">${formatDateLong(b.booking_date)}</td>`,
        `<td class="foc-lt">${noTime ? '<span class="foc-lt-warn" data-testid="badge-no-time">Sin hora</span>' : escHtml(b.start_time)}</td>`,
        `<td class="foc-lt">${b.duration_hours||4}h</td>`,
        `<td class="foc-lt foc-lt-mono"><span title="${escHtml(b.id||'')}">…${shortId}</span></td>`,
        `<td class="foc-lt foc-lt-primary" title="${escHtml(b.customer_phone||'')}">${escHtml(b.customer_name||'—')}${b.customer_phone?'<span class="foc-lt-phone"> '+escHtml(b.customer_phone)+'</span>':''}</td>`,
        `<td class="foc-lt"><span class="foc-boat-dot" style="background:${color}"></span>${escHtml(b.boat_type||'—')}</td>`,
        `<td class="foc-lt foc-lt-sec">${escHtml(b.package_type||'—')}</td>`,
        `<td class="foc-lt foc-lt-sec">${b.num_guests||'—'}</td>`,
        `<td class="foc-lt">${noCap ? '<span class="foc-lt-warn">⚠ Sin asignar</span>' : escHtml(b.assigned_captain_name)}</td>`,
        `<td class="foc-lt foc-lt-sec">${escHtml(b.stew_name||'—')}</td>`,
        `<td class="foc-lt">${channelChip(b.platform)}</td>`,
        `<td class="foc-lt"><span class="foc-status-pill" style="background:${psBg};color:${psColor}" data-testid="status-payment-${b.id}">${escHtml(psLabel)}</span></td>`,
        `<td class="foc-lt foc-lt-money">${fmtCurrency(b.total_amount)}</td>`,
        `<td class="foc-lt foc-lt-actions" onclick="event.stopPropagation()">
           <div class="foc-action-wrap">
             <button class="foc-action-btn" onclick="FleetOpsCenter.toggleRowMenu('${escHtml(b.id)}')" data-testid="button-row-menu-${b.id}" title="Acciones">⋯</button>
             <div class="foc-row-menu" id="foc-menu-${escHtml(b.id)}" style="display:none">
               <button onclick="FleetOpsCenter.openDrawer('${escHtml(b.id)}');FleetOpsCenter.closeRowMenus()" data-testid="menu-view-${b.id}">Ver detalle</button>
               <button onclick="FleetOpsCenter.openCaptainModal('${escHtml(b.id)}');FleetOpsCenter.closeRowMenus()" data-testid="menu-assign-captain-${b.id}">Asignar capitán</button>
               <button onclick="FleetOpsCenter.markPaid('${escHtml(b.id)}');FleetOpsCenter.closeRowMenus()" data-testid="menu-mark-paid-${b.id}">Marcar pagado</button>
               <button onclick="FleetOpsCenter.markConfirmed('${escHtml(b.id)}');FleetOpsCenter.closeRowMenus()" data-testid="menu-confirm-${b.id}">Confirmar</button>
             </div>
           </div>
         </td>`,
      ].join('');
      return `<tr class="foc-list-row ${isSelected?'foc-row-selected':''}" onclick="FleetOpsCenter.openDrawer('${escHtml(b.id)}')" data-testid="list-row-${b.id}" style="height:${rowH};font-size:${fontSize}">${cells}</tr>`;
    }).join('');

    const emptyHtml = rows.length === 0
      ? `<tr><td colspan="15" class="foc-lt-empty">Sin reservas que coincidan · <a href="#" onclick="FleetOpsCenter.listClear();return false">Limpiar filtros</a></td></tr>`
      : '';

    const boatOptHtml = boatKeys.map(k => `<option value="${escHtml(k)}" ${S.listFilters.boat===k?'selected':''}>${escHtml(k)}</option>`).join('');
    const statusOpts  = ['confirmed','pending','inquiry','crew-assigned','checked-in','in-progress','completed','cancelled'].map(s =>
      `<option value="${s}" ${S.listFilters.status===s?'selected':''}>${escHtml(s)}</option>`).join('');

    const totalAmt = rows.reduce((s, b) => s + (parseFloat(b.total_amount)||0), 0);
    const summary  = rows.length > 0 ? `${rows.length} reserva${rows.length!==1?'s':''} · ${fmtCurrency(totalAmt)}` : 'Sin resultados';

    const bulkCount = S.bulkSelected.size;
    const bulkBar   = bulkCount > 0 ? `
      <div class="foc-bulk-bar" data-testid="section-bulk-bar">
        <span class="foc-bulk-count">${bulkCount} seleccionada${bulkCount!==1?'s':''}</span>
        <button class="foc-bulk-btn" onclick="FleetOpsCenter.bulkAction('assign_captain')" data-testid="button-bulk-captain">Asignar capitán</button>
        <button class="foc-bulk-btn" onclick="FleetOpsCenter.bulkAction('mark_paid')" data-testid="button-bulk-paid">Marcar pagado</button>
        <button class="foc-bulk-btn" onclick="FleetOpsCenter.bulkAction('confirm')" data-testid="button-bulk-confirm">Confirmar</button>
        <button class="foc-bulk-btn foc-bulk-export" onclick="FleetOpsCenter.exportListCSV()" data-testid="button-bulk-export-csv">Exportar CSV</button>
        <button class="foc-bulk-btn foc-bulk-cancel" onclick="FleetOpsCenter.bulkAction('cancel')" data-testid="button-bulk-cancel">Cancelar</button>
        <button class="foc-bulk-clear" onclick="FleetOpsCenter.clearBulkSelection()" title="Deseleccionar todo">✕</button>
      </div>` : '';

    container.innerHTML = `
      <div class="foc-list-wrap">
        <div class="foc-list-toolbar" data-testid="section-list-toolbar">
          <div class="foc-density-group" data-testid="section-density-toggle">
            <span class="foc-density-label">Densidad:</span>
            <button class="foc-density-btn ${density==='compact'?'foc-density-active':''}"  onclick="FleetOpsCenter.setListDensity('compact')"    data-testid="button-density-compact">Compacto</button>
            <button class="foc-density-btn ${density==='medium'?'foc-density-active':''}"   onclick="FleetOpsCenter.setListDensity('medium')"     data-testid="button-density-medium">Medio</button>
            <button class="foc-density-btn ${density==='comfortable'?'foc-density-active':''}" onclick="FleetOpsCenter.setListDensity('comfortable')" data-testid="button-density-comfortable">Cómodo</button>
          </div>
          <div class="foc-export-group">
            <button class="foc-export-btn" onclick="FleetOpsCenter.exportListCSV()" data-testid="button-export-csv" title="Exportar CSV">CSV</button>
            <button class="foc-export-btn" onclick="FleetOpsCenter.exportListPDF()" data-testid="button-export-pdf" title="Exportar PDF">PDF</button>
          </div>
        </div>
        <div class="foc-list-filters" id="foc-list-filters" data-testid="section-list-filters">
          <input id="foc-list-search" class="foc-list-input" type="search"
            placeholder="Buscar cliente, ID, barco, capitán..."
            value="${escHtml(S.listFilters.search)}"
            oninput="FleetOpsCenter.listFilter('search', this.value)"
            data-testid="input-list-search">
          <select class="foc-list-select" onchange="FleetOpsCenter.listFilter('boat', this.value)" data-testid="select-list-boat">
            <option value="">Todos los barcos</option>
            ${boatOptHtml}
          </select>
          <select class="foc-list-select" onchange="FleetOpsCenter.listFilter('status', this.value)" data-testid="select-list-status">
            <option value="">Todos los estados</option>
            ${statusOpts}
          </select>
          <span class="foc-list-count" data-testid="text-list-count">${summary}</span>
        </div>
        <div class="foc-list-table-wrap">
          <table class="foc-list-table" data-testid="table-list" style="--cell-pad:${cellPad}">
            <thead><tr>${thHtml}</tr></thead>
            <tbody>${rowsHtml}${emptyHtml}</tbody>
          </table>
        </div>
        ${bulkBar}
      </div>`;

    // Restore scroll position on density change
    const savedScroll = S._listScrollTop || 0;
    const wrap = container.querySelector('.foc-list-table-wrap');
    if (wrap && savedScroll) wrap.scrollTop = savedScroll;
    if (wrap) wrap.addEventListener('scroll', () => { S._listScrollTop = wrap.scrollTop; }, { passive: true });
  }

  /* ─── VIEW MODE HELPERS ──────────────────────────────── */
  function updateViewModeUI() {
    ['timeline','weekly','monthly','list'].forEach(mode => {
      const btn = el(`foc-view-${mode}`);
      if (btn) btn.classList.toggle('foc-view-active', S.viewMode === mode);
    });
    const zg = el('foc-zoom-group');
    if (zg) zg.style.visibility = S.viewMode === 'list' ? 'hidden' : 'visible';
  }

  function setViewMode(mode) {
    if (['weekly','monthly'].includes(mode)) {
      S.viewMode = mode;
      updateViewModeUI();
      renderComingSoon(mode === 'weekly' ? 'Semanal' : 'Mensual', mode === 'weekly' ? 'W' : 'M');
      return;
    }
    if (S.viewMode === mode) return;
    S.viewMode = mode;
    if (mode === 'list' && S.zoom < 30)  { S.zoom = 30; loadAll(); return; }
    if (mode === 'timeline' && S.zoom === 30) { S.zoom = 7; loadAll(); return; }
    if (S.data) render(); else loadAll();
  }

  function renderComingSoon(name, shortcut) {
    const container = el('foc-timeline');
    if (!container) return;
    container.innerHTML = `
      <div class="foc-coming-soon" data-testid="section-coming-soon">
        <div class="foc-coming-icon">⬜</div>
        <h3>Vista ${escHtml(name)}</h3>
        <p>Esta vista estará disponible próximamente.</p>
        <p class="foc-coming-hint">Atajo: <kbd>${escHtml(shortcut)}</kbd> · Usa <kbd>T</kbd> para volver al Timeline</p>
      </div>`;
  }

  function listSortBy(col) {
    if (S.listSort.col === col) S.listSort.asc = !S.listSort.asc;
    else { S.listSort.col = col; S.listSort.asc = true; }
    if (S.data) render();
  }

  function listFilter(key, value) {
    S.listFilters[key] = value;
    if (S.data) render();
  }

  function listClear() {
    S.listFilters = { boat: '', status: '', search: '' };
    if (S.data) render();
  }

  /* ─── BULK SELECTION ─────────────────────────────────── */
  function toggleBulkSelect(id) {
    if (S.bulkSelected.has(id)) S.bulkSelected.delete(id);
    else S.bulkSelected.add(id);
    if (S.data) render();
  }

  function toggleSelectAll() {
    const allIds = (S.data?.bookings || []).map(b => b.id);
    const allSelected = allIds.every(id => S.bulkSelected.has(id));
    if (allSelected) { S.bulkSelected.clear(); }
    else { allIds.forEach(id => S.bulkSelected.add(id)); }
    if (S.data) render();
  }

  function clearBulkSelection() {
    S.bulkSelected.clear();
    if (S.data) render();
  }

  function bulkAction(action) {
    const ids = [...S.bulkSelected];
    if (ids.length === 0) return;
    const n = ids.length;
    if (action === 'mark_paid') {
      if (!confirm(`¿Marcar ${n} reserva${n!==1?'s':''} como pagada${n!==1?'s':''}?`)) return;
      Promise.all(ids.map(id => fetch(`/api/bookings/${id}/payment-status`, {
        method: 'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ payment_status: 'paid' })
      }))).then(() => { S.bulkSelected.clear(); loadAll(); showToast(`${n} reserva${n!==1?'s':''} marcada${n!==1?'s':''} como pagada${n!==1?'s':''}`); });
    } else if (action === 'confirm') {
      if (!confirm(`¿Confirmar ${n} reserva${n!==1?'s':''}?`)) return;
      Promise.all(ids.map(id => fetch(`/api/bookings/${id}`, {
        method: 'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status: 'confirmed' })
      }))).then(() => { S.bulkSelected.clear(); loadAll(); showToast(`${n} reserva${n!==1?'s':''} confirmada${n!==1?'s':''}`); });
    } else if (action === 'cancel') {
      const reason = prompt(`Razón de cancelación para ${n} reserva${n!==1?'s':''}:`);
      if (!reason) return;
      Promise.all(ids.map(id => fetch(`/api/bookings/${id}`, {
        method: 'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status: 'cancelled', cancellation_reason: reason })
      }))).then(() => { S.bulkSelected.clear(); loadAll(); showToast(`${n} reserva${n!==1?'s':''} cancelada${n!==1?'s':''}`); });
    } else if (action === 'assign_captain') {
      showToast('Usa el menú individual de cada reserva para asignar capitán');
    } else {
      exportListCSV();
    }
  }

  /* ─── DENSITY ────────────────────────────────────────── */
  function setListDensity(density) {
    S.listDensity = density;
    localStorage.setItem('foc-list-density', density);
    if (S.data && S.viewMode === 'list') render();
  }

  /* ─── ROW MENU ───────────────────────────────────────── */
  function toggleRowMenu(id) {
    closeRowMenus();
    const menu = document.getElementById(`foc-menu-${id}`);
    if (menu) { menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; }
  }

  function closeRowMenus() {
    document.querySelectorAll('.foc-row-menu').forEach(m => { m.style.display = 'none'; });
  }

  /* ─── EXPORT CSV ─────────────────────────────────────── */
  function exportListCSV() {
    if (!S.data) return;
    const bookings = S.data.bookings || [];
    const rows = S.bulkSelected.size > 0
      ? bookings.filter(b => S.bulkSelected.has(b.id))
      : bookings;
    const headers = ['booking_id','customer_name','customer_phone','customer_email','booking_date','start_time','duration_hours','boat_type','package_type','num_guests','assigned_captain_name','stew_name','platform','status','payment_status','total_amount','notes','service_date'];
    const csvRows = [headers.join(',')];
    rows.forEach(b => {
      const row = headers.map(h => {
        const v = b[h] || '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
      });
      csvRows.push(row.join(','));
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `nadaki-bookings-${toISO(new Date())}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    showToast(`CSV exportado (${rows.length} reservas)`);
  }

  /* ─── EXPORT PDF ─────────────────────────────────────── */
  function exportListPDF() {
    if (!S.data) return;
    const bookings = S.data.bookings || [];
    const rows = S.bulkSelected.size > 0
      ? bookings.filter(b => S.bulkSelected.has(b.id))
      : bookings;
    const from = toISO(S.rangeStart);
    const to   = toISO(addDays(S.rangeStart, S.zoom - 1));
    const totalAmt = rows.reduce((s, b) => s + (parseFloat(b.total_amount)||0), 0);
    const rowsHtml = rows.map(b => `
      <tr>
        <td>${escHtml(formatDateLong(b.booking_date))}</td>
        <td>${escHtml(b.customer_name||'—')}</td>
        <td>${escHtml(b.boat_type||'—')}</td>
        <td>${escHtml(b.assigned_captain_name||'—')}</td>
        <td>${escHtml(b.platform||'—')}</td>
        <td>${escHtml(b.status||'—')}</td>
        <td style="text-align:right">${fmtCurrency(b.total_amount)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nadaki Bookings ${from} — ${to}</title>
    <style>body{font-family:system-ui,sans-serif;font-size:12px;padding:20px}h1{font-size:16px;margin-bottom:4px}p{color:#666;margin:0 0 12px}
    table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #eee}
    th{background:#f9f9f9;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    tfoot td{font-weight:700;border-top:2px solid #333}</style></head>
    <body><h1>Nadaki Excursions — Reservas</h1><p>${from} → ${to} · ${rows.length} reservas · Total: ${fmtCurrency(totalAmt)}</p>
    <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Barco</th><th>Capitán</th><th>Canal</th><th>Estado</th><th>Total</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td colspan="6">Total</td><td style="text-align:right">${fmtCurrency(totalAmt)}</td></tr></tfoot>
    </table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
    showToast(`PDF listo para imprimir (${rows.length} reservas)`);
  }

  /* ─── SHORTCUTS CHEAT SHEET ──────────────────────────── */
  function showShortcutsModal() {
    let modal = document.getElementById('foc-shortcuts-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'foc-shortcuts-modal';
      modal.className = 'foc-shortcuts-modal';
      modal.setAttribute('data-testid', 'modal-shortcuts');
      modal.innerHTML = `
        <div class="foc-shortcuts-overlay" onclick="FleetOpsCenter.closeShortcutsModal()"></div>
        <div class="foc-shortcuts-box">
          <div class="foc-shortcuts-header">
            <h3>Atajos de teclado</h3>
            <button onclick="FleetOpsCenter.closeShortcutsModal()" class="foc-shortcuts-close" data-testid="button-close-shortcuts">✕</button>
          </div>
          <div class="foc-shortcuts-grid">
            <div class="foc-sc-group"><h4>Vistas</h4>
              <div class="foc-sc-row"><kbd>T</kbd><span>Vista Timeline</span></div>
              <div class="foc-sc-row"><kbd>L</kbd><span>Vista Lista</span></div>
              <div class="foc-sc-row"><kbd>W</kbd><span>Vista Semanal (próx.)</span></div>
              <div class="foc-sc-row"><kbd>M</kbd><span>Vista Mensual (próx.)</span></div>
            </div>
            <div class="foc-sc-group"><h4>Navegación</h4>
              <div class="foc-sc-row"><kbd>←</kbd> <kbd>[</kbd><span>Rango anterior</span></div>
              <div class="foc-sc-row"><kbd>→</kbd> <kbd>]</kbd><span>Rango siguiente</span></div>
              <div class="foc-sc-row"><kbd>H</kbd><span>Ir a Hoy</span></div>
            </div>
            <div class="foc-sc-group"><h4>Acciones</h4>
              <div class="foc-sc-row"><kbd>N</kbd><span>Nueva reserva</span></div>
              <div class="foc-sc-row"><kbd>/</kbd><span>Buscar (Lista)</span></div>
              <div class="foc-sc-row"><kbd>Esc</kbd><span>Cerrar drawer / modal</span></div>
              <div class="foc-sc-row"><kbd>?</kbd><span>Esta ayuda</span></div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
  }

  function closeShortcutsModal() {
    const modal = document.getElementById('foc-shortcuts-modal');
    if (modal) modal.style.display = 'none';
  }

  /* ─── ALERTS PANEL ───────────────────────────────────── */
  function renderAlertsPanel() {
    const panel = el('foc-alerts-panel');
    if (!panel || !S.alerts) return;
    const { alerts = [], critical = 0, total = 0 } = S.alerts;
    const warnings = alerts.filter(a => a.severity === 'warning').length;

    const toggleHtml = `
      <div class="foc-alerts-header" onclick="FleetOpsCenter.toggleAlerts()">
        <span class="foc-alerts-title">
          Alertas Operativas
          ${critical > 0 ? `<span class="foc-alerts-badge foc-alerts-badge-crit">${critical} crítica${critical > 1 ? 's' : ''}</span>` : ''}
          ${warnings > 0 ? `<span class="foc-alerts-badge">${warnings} aviso${warnings > 1 ? 's' : ''}</span>` : ''}
          ${total === 0 ? `<span class="foc-alerts-badge foc-alerts-badge-ok">Sin alertas</span>` : ''}
        </span>
        <span class="foc-alerts-toggle">${S.alertsOpen ? '▲' : '▼'}</span>
      </div>`;

    if (!S.alertsOpen) { panel.innerHTML = toggleHtml; return; }
    if (alerts.length === 0) {
      panel.innerHTML = toggleHtml + '<div class="foc-alerts-empty">Sin alertas activas</div>';
      return;
    }

    const alertsHtml = alerts.slice(0, 15).map(a => {
      const sev = SEVERITY_COLORS[a.severity] || '#6B7280';
      const sevBg = a.severity === 'critical' ? '#FEF2F2' : a.severity === 'warning' ? '#FFFBEB' : '#F9FAFB';
      return `
        <div class="foc-alert-row" data-testid="alert-${a.id}" style="background:${sevBg}" onclick="FleetOpsCenter.openDrawer('${a.booking_id||''}')">
          <span class="foc-alert-dot" style="background:${sev}"></span>
          <div class="foc-alert-body">
            <div class="foc-alert-msg">${escHtml(a.message)}</div>
            <div class="foc-alert-date">${escHtml(a.booking_date||'')} · ${escHtml(a.type)}</div>
          </div>
          ${a.action && a.booking_id ? `<button class="foc-alert-action" onclick="event.stopPropagation();FleetOpsCenter.handleAlertAction('${a.id}','${a.type}','${a.booking_id||''}')" data-testid="alert-action-${a.id}">${escHtml(a.action)}</button>` : ''}
        </div>`;
    }).join('');

    panel.innerHTML = toggleHtml + `<div class="foc-alerts-list">${alertsHtml}</div>`;
  }

  /* NOW LINE */
  function updateNowLine() {
    if (!S.data) return;
    const rowH = 110;
    const frac = timeToFraction(new Date().toTimeString().slice(0,5));
    const px   = Math.round(frac * rowH);
    document.querySelectorAll('[id^="foc-now-"]').forEach(el => { el.style.top = px + 'px'; });
  }

  /* ─── DETAIL DRAWER — FASE 2 COMPLETO ───────────────── */
  function openDrawer(bookingId) {
    if (!bookingId || !S.data) return;
    const b = S.data.bookings.find(x => x.id === bookingId);
    if (!b) return;
    S.activeBookingId = bookingId;

    const drawer = el('foc-drawer');
    if (!drawer) return;
    const color = boatColor(b.boat_type, S.data.fleet);
    const captain = b.assigned_captain_name || '';
    const stew    = b.stew_name || '';
    const endStr  = calcEndTime(b.start_time, b.duration_hours);
    const isEstTime = b.start_time_source === 'default_backfill';
    const isEstDur  = b.duration_source   === 'default_backfill';
    const balanceDue = parseFloat(b.balance_pending || 0);
    const chanChip = channelChip(b.platform);
    const psChip   = paymentStatusChip(b.payment_status);
    const actItems = buildActivityItems(b);

    drawer.innerHTML = `
      <div class="foc-drawer-overlay" onclick="FleetOpsCenter.closeDrawer()"></div>
      <div class="foc-drawer-panel">

        <div class="foc-drawer-header" style="border-left:4px solid ${color}">
          <div style="flex:1;min-width:0">
            <div class="foc-drawer-title">${escHtml(b.customer_name||'—')}</div>
            <div class="foc-drawer-sub">${escHtml(b.boat_type)} · ${formatDateLong(b.booking_date)}</div>
          </div>
          <button class="foc-drawer-close" onclick="FleetOpsCenter.closeDrawer()" data-testid="button-close-drawer">✕</button>
        </div>

        <div class="foc-drawer-body">

          <!-- ── Sección 1: Resumen de Reserva ─────────── -->
          <div class="foc-drawer-section">
            <div class="foc-drawer-section-title">Resumen de Reserva</div>

            <div class="foc-drawer-row">
              <span class="foc-dr-label">ID</span>
              <span class="foc-dr-val foc-mono" style="font-size:11px;letter-spacing:.03em">${escHtml(b.id)}</span>
              <button class="foc-copy-btn" onclick="FleetOpsCenter.copyText('${escHtml(b.id)}',this)" title="Copiar ID" data-testid="button-copy-id">⎘</button>
            </div>

            ${b.customer_phone ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Teléfono</span>
              <a href="tel:${escHtml(b.customer_phone)}" class="foc-dr-link" data-testid="link-phone">${escHtml(b.customer_phone)}</a>
            </div>` : ''}

            ${b.customer_email ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Email</span>
              <a href="mailto:${escHtml(b.customer_email)}" class="foc-dr-link" data-testid="link-email">${escHtml(b.customer_email)}</a>
            </div>` : ''}

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Canal</span>
              <span class="foc-dr-val">${chanChip || escHtml(b.platform || '—')}</span>
            </div>

            ${b.num_guests ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Pasajeros</span>
              <span class="foc-dr-val">${b.num_guests} pax</span>
            </div>` : ''}

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Estado</span>
              <span class="foc-dr-val">
                <span class="foc-status-chip" style="background:${statusColor(b.status)}22;color:${statusColor(b.status)}">${escHtml(b.status||'—')}</span>
              </span>
            </div>

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Pago</span>
              <span class="foc-dr-val">${psChip}</span>
            </div>

            ${b.pickup_location ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Pickup</span>
              <span class="foc-dr-val">${escHtml(b.pickup_location)}</span>
            </div>` : ''}

            ${b.notes ? `
            <div class="foc-drawer-row" style="align-items:flex-start">
              <span class="foc-dr-label" style="margin-top:2px">Notas</span>
              <span class="foc-dr-val foc-dr-notes">${escHtml(b.notes)}</span>
            </div>` : ''}
          </div>

          <!-- ── Sección 2: Operaciones ─────────────────── -->
          <div class="foc-drawer-section">
            <div class="foc-drawer-section-title">Operaciones</div>

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Capitán</span>
              <span class="foc-dr-val">
                ${captain
                  ? `<span class="foc-crew-chip">${escHtml(captain)}</span>`
                  : `<span class="foc-missing-chip foc-missing-red">⚠ Sin asignar</span>`}
              </span>
            </div>

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Stew</span>
              <span class="foc-dr-val">
                ${stew
                  ? `<span class="foc-crew-chip foc-crew-stew">${escHtml(stew)}</span>`
                  : `<span class="foc-missing-chip foc-missing-amber">Sin asignar</span>`}
              </span>
            </div>

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Hora salida</span>
              <span class="foc-dr-val">
                <span class="foc-mono">${escHtml(b.start_time||'10:00')}</span>
                ${isEstTime ? `<span class="foc-est-badge">Hora estimada · <button class="foc-est-edit" onclick="FleetOpsCenter.editField('${b.id}','start_time')" data-testid="button-edit-starttime">Editar</button></span>` : ''}
              </span>
            </div>

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Duración</span>
              <span class="foc-dr-val">
                <span class="foc-mono">${b.duration_hours||4}h</span>
                ${isEstDur ? `<span class="foc-est-badge">Estimada · <button class="foc-est-edit" onclick="FleetOpsCenter.editField('${b.id}','duration_hours')" data-testid="button-edit-duration">Editar</button></span>` : ''}
              </span>
            </div>

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Regreso ETA</span>
              <span class="foc-dr-val foc-mono">${endStr}</span>
            </div>
          </div>

          <!-- ── Sección 3: Financiero ──────────────────── -->
          <div class="foc-drawer-section">
            <div class="foc-drawer-section-title">Financiero</div>

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Total</span>
              <span class="foc-dr-val foc-dr-rev foc-mono" style="font-size:16px;font-weight:700">${fmtCurrency(b.total_amount)}</span>
            </div>

            ${parseFloat(b.base_price||0) > 0 && parseFloat(b.discount_amount||0) > 0 ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Precio base</span>
              <span class="foc-dr-val foc-mono">${fmtCurrency(b.base_price)}</span>
            </div>
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Descuento</span>
              <span class="foc-dr-val foc-dr-ok foc-mono">-${fmtCurrency(b.discount_amount)} (${parseFloat(b.discount_pct||0).toFixed(1)}%)</span>
            </div>` : ''}

            ${parseFloat(b.deposit_amount||0) > 0 ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Depósito</span>
              <span class="foc-dr-val foc-mono">${fmtCurrency(b.deposit_amount)}</span>
            </div>` : ''}

            <div class="foc-drawer-row">
              <span class="foc-dr-label">Balance due</span>
              <span class="foc-dr-val foc-mono ${balanceDue > 0 ? 'foc-dr-danger' : 'foc-dr-ok'}" data-testid="text-balance-due">${fmtCurrency(balanceDue)}</span>
            </div>

            ${b.payment_method ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Método</span>
              <span class="foc-dr-val">${escHtml(b.payment_method)}</span>
            </div>` : ''}

            ${b.broker_name ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Broker</span>
              <span class="foc-dr-val">${escHtml(b.broker_name)}</span>
            </div>` : ''}

            ${b.sold_by_name ? `
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Vendido por</span>
              <span class="foc-dr-val">${escHtml(b.sold_by_name)}</span>
            </div>` : ''}
          </div>

          <!-- ── Sección 4: Actividad ───────────────────── -->
          <div class="foc-drawer-section">
            <div class="foc-drawer-section-title">Actividad</div>
            <div class="foc-activity-log">${actItems}</div>
          </div>

          <!-- ── Sección 5: Documentos (cargado async) ── -->
          <div id="foc-doc-section">
            <div class="foc-doc-section-hd">Documentos del Booking</div>
            <div class="foc-doc-loading">Buscando documentos...</div>
          </div>

        </div>

        <!-- ── Footer: 8 acciones en 2 filas ─────────── -->
        <div class="foc-drawer-footer foc-footer-grid">
          <a href="/commissions.html" class="foc-action-btn foc-btn-primary" data-testid="button-drawer-edit">Editar</a>
          <button class="foc-action-btn foc-btn-captain" onclick="FleetOpsCenter.openCaptainModal('${b.id}')" data-testid="button-drawer-assign-captain">Asignar capitán</button>
          <button class="foc-action-btn foc-btn-confirm" onclick="FleetOpsCenter.markConfirmed('${b.id}')" data-testid="button-drawer-confirm">Confirmar</button>
          <button class="foc-action-btn foc-btn-checkin" onclick="FleetOpsCenter.markCheckedIn('${b.id}')" data-testid="button-drawer-checkin">Check-in</button>
          <button class="foc-action-btn foc-btn-secondary" onclick="navigator.clipboard&&navigator.clipboard.writeText(window.location.origin+'/commissions.html?booking='+encodeURIComponent('${b.id}'))" data-testid="button-drawer-duplicate" title="Duplicar: navega a reservas con ID pre-llenado">Duplicar</button>
          <button class="foc-action-btn foc-btn-secondary" onclick="FleetOpsCenter.showToast('Mover reserva disponible en Fase 3')" data-testid="button-drawer-move">Mover</button>
          <button class="foc-action-btn foc-btn-cancel" onclick="FleetOpsCenter.cancelBooking('${b.id}')" data-testid="button-drawer-cancel">Cancelar</button>
          <button class="foc-action-btn foc-btn-secondary" onclick="FleetOpsCenter.exportBooking('${b.id}')" data-testid="button-drawer-export">Export</button>
        </div>

      </div>`;

    drawer.classList.add('foc-drawer-open');
    document.body.style.overflow = 'hidden';

    // Cargar documentos relacionados al booking de forma async (no bloquea el drawer)
    if (window.focDocuments) focDocuments.load(b);
  }

  function closeDrawer() {
    const drawer = el('foc-drawer');
    if (drawer) {
      drawer.classList.remove('foc-drawer-open');
      drawer.innerHTML = '';
    }
    document.body.style.overflow = '';
    S.activeBookingId = null;
  }

  /* ─── ACTION HANDLERS ────────────────────────────────── */

  function copyText(text, btn) {
    navigator.clipboard?.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓';
      btn.style.color = '#10B981';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
    });
  }

  function showToast(msg) {
    let toast = el('foc-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'foc-toast';
      toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1F2937;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);transition:opacity .3s';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  async function markConfirmed(bookingId) {
    try {
      const resp = await fetch(`/api/bookings/${bookingId}/mark-confirmed`, { method:'POST', headers:{'Content-Type':'application/json'} });
      const d = await resp.json();
      if (d.ok) { showToast('Reserva confirmada'); closeDrawer(); loadAll(); }
      else showToast('Error: ' + (d.error || 'unknown'));
    } catch(e) { showToast('Error al confirmar'); }
  }

  async function markCheckedIn(bookingId) {
    try {
      const resp = await fetch(`/api/bookings/${bookingId}/mark-checked-in`, { method:'POST', headers:{'Content-Type':'application/json'} });
      const d = await resp.json();
      if (d.ok) { showToast('Check-in registrado'); closeDrawer(); loadAll(); }
      else showToast('Error: ' + (d.error || 'unknown'));
    } catch(e) { showToast('Error al hacer check-in'); }
  }

  async function markPaid(bookingId) {
    if (!confirm('¿Marcar esta reserva como pagada completa?')) return;
    try {
      const resp = await fetch(`/api/bookings/${bookingId}/mark-paid`, { method:'POST', headers:{'Content-Type':'application/json'} });
      const d = await resp.json();
      if (d.ok) { showToast('Pago registrado'); closeDrawer(); loadAll(); }
      else showToast('Error: ' + (d.error || 'unknown'));
    } catch(e) { showToast('Error al marcar pago'); }
  }

  async function cancelBooking(bookingId) {
    const b = S.data?.bookings.find(x => x.id === bookingId);
    const name = b?.customer_name || bookingId;
    if (!confirm(`¿Cancelar la reserva de ${name}? Esta acción no se puede deshacer fácilmente.`)) return;
    try {
      const resp = await fetch(`/api/bookings/${bookingId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: 'cancelled' }) });
      if (resp.ok) { showToast('Reserva cancelada'); closeDrawer(); loadAll(); }
      else showToast('Error al cancelar');
    } catch(e) { showToast('Error al cancelar'); }
  }

  function exportBooking(bookingId) {
    const b = S.data?.bookings.find(x => x.id === bookingId);
    if (!b) return;
    const lines = [
      `Reserva: ${b.id}`,
      `Cliente: ${b.customer_name||'—'}`,
      `Teléfono: ${b.customer_phone||'—'}`,
      `Email: ${b.customer_email||'—'}`,
      `Barco: ${b.boat_type||'—'}`,
      `Fecha: ${formatDateLong(b.booking_date)}`,
      `Hora: ${b.start_time||'—'} (${b.duration_hours||4}h) → ${calcEndTime(b.start_time, b.duration_hours)}`,
      `Capitán: ${b.assigned_captain_name||'Sin asignar'}`,
      `Stew: ${b.stew_name||'Sin asignar'}`,
      `Total: ${fmtCurrency(b.total_amount)}`,
      `Pago: ${b.payment_status||'—'}`,
      `Balance: ${fmtCurrency(b.balance_pending)}`,
      `Canal: ${b.platform||'Manual'}`,
      `Pasajeros: ${b.num_guests||'—'}`,
      `Notas: ${b.notes||'—'}`,
    ];
    const blob = new Blob([lines.join('\n')], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `booking_${b.id}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Reserva exportada');
  }

  function editField(bookingId, field) {
    const label = field === 'start_time' ? 'Hora de salida (HH:MM)' : 'Duración (horas)';
    const b = S.data?.bookings.find(x => x.id === bookingId);
    const current = field === 'start_time' ? (b?.start_time||'10:00') : String(b?.duration_hours||4);
    const val = prompt(label, current);
    if (!val || val === current) return;
    const body = { [field]: field === 'duration_hours' ? parseFloat(val) : val, [`${field}_source`]: 'manual' };
    fetch(`/api/bookings/${bookingId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(r => r.json())
      .then(() => { showToast(`${field === 'start_time' ? 'Hora' : 'Duración'} actualizada`); closeDrawer(); loadAll(); })
      .catch(() => showToast('Error al guardar'));
  }

  /* CAPTAIN MODAL */
  async function openCaptainModal(bookingId) {
    if (S.captains.length === 0) await fetchCaptains();
    let modal = el('foc-captain-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'foc-captain-modal';
      document.body.appendChild(modal);
    }
    const captainOpts = S.captains.length > 0
      ? S.captains.map(c => `<button class="foc-cap-opt" onclick="FleetOpsCenter.assignCaptain('${bookingId}','${escHtml(c.name)}','${escHtml(c.phone||'')}',this)">${escHtml(c.name)}${c.phone ? ` <span style="color:#9CA3AF;font-size:11px">${c.phone}</span>` : ''}</button>`).join('')
      : `<div style="padding:12px;color:#9CA3AF;font-size:13px">No hay capitanes registrados en el sistema</div>
         <div style="padding:8px 12px"><input id="foc-cap-manual" placeholder="Escribir nombre del capitán..." style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px"></div>
         <button class="foc-cap-opt" onclick="FleetOpsCenter.assignCaptainManual('${bookingId}')">Asignar</button>`;

    modal.innerHTML = `
      <div class="foc-modal-overlay" onclick="FleetOpsCenter.closeCaptainModal()"></div>
      <div class="foc-modal-panel" data-testid="modal-captain">
        <div class="foc-modal-header">
          <span class="foc-modal-title">Asignar Capitán</span>
          <button class="foc-drawer-close" onclick="FleetOpsCenter.closeCaptainModal()">✕</button>
        </div>
        <div class="foc-modal-body">
          <p style="font-size:12px;color:#6B7280;margin-bottom:10px">Selecciona un capitán para esta reserva:</p>
          ${captainOpts}
          <div style="margin-top:12px;border-top:1px solid #F3F4F6;padding-top:12px">
            <input id="foc-cap-custom" placeholder="O escribe un nombre personalizado..." style="width:100%;padding:8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px">
            <button class="foc-action-btn foc-btn-primary" style="margin-top:8px;width:100%" onclick="FleetOpsCenter.assignCaptainCustom('${bookingId}')">Asignar nombre personalizado</button>
          </div>
        </div>
      </div>`;

    modal.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center';
  }

  async function assignCaptain(bookingId, captainName, captainPhone, btn) {
    try {
      if (btn) { btn.style.background='#EFF6FF'; btn.textContent = 'Asignando...'; }
      const resp = await fetch(`/api/bookings/${bookingId}/assign-captain`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ captain_name: captainName, captain_phone: captainPhone })
      });
      const d = await resp.json();
      if (d.ok) { showToast(`Capitán ${captainName} asignado`); closeCaptainModal(); closeDrawer(); loadAll(); }
      else showToast('Error: ' + (d.error || 'unknown'));
    } catch(e) { showToast('Error al asignar capitán'); }
  }

  async function assignCaptainCustom(bookingId) {
    const input = el('foc-cap-custom');
    const name = input?.value?.trim();
    if (!name) { showToast('Escribe un nombre primero'); return; }
    await assignCaptain(bookingId, name, '');
  }

  function closeCaptainModal() {
    const m = el('foc-captain-modal');
    if (m) m.remove();
  }

  /* ALERT ACTION HANDLER */
  function handleAlertAction(alertId, alertType, bookingId) {
    switch(alertType) {
      case 'no_captain':
        if (bookingId) openCaptainModal(bookingId);
        break;
      case 'payment_pending':
        if (bookingId) markPaid(bookingId);
        break;
      case 'overlap':
      case 'crew_double':
      case 'maintenance_conflict':
        if (bookingId) openDrawer(bookingId);
        break;
      default:
        if (bookingId) openDrawer(bookingId);
    }
    // Optionally auto-resolve info alerts
    if (alertType === 'info') {
      fetch(`/api/alerts/${alertId}/resolve`, { method:'POST' }).catch(() => {});
    }
  }

  function toggleAlerts() { S.alertsOpen = !S.alertsOpen; renderAlertsPanel(); }

  /* ─── INIT ───────────────────────────────────────────── */
  function init() {
    if (!el('foc-timeline')) return;
    initRange();
    loadAll();
    bindEvents();
    // Refresh today-strip every 60 seconds
    setInterval(() => { fetchTodayStrip().then(() => renderTodayStrip()); }, 60000);
    // Refresh alerts every 5 minutes
    setInterval(() => { fetchAlerts().then(() => renderAlertsPanel()); }, 300000);
  }

  function bindEvents() {
    const prevBtn  = el('foc-prev');
    const nextBtn  = el('foc-next');
    const todayBtn = el('foc-goto-today');
    if (prevBtn)  prevBtn.addEventListener('click', () => shiftRange(-1));
    if (nextBtn)  nextBtn.addEventListener('click', () => shiftRange(1));
    if (todayBtn) todayBtn.addEventListener('click', goToday);
    ['3','7','14','30'].forEach(z => {
      const btn = el(`foc-zoom-${z}`);
      if (btn) btn.addEventListener('click', () => setZoom(parseInt(z)));
    });
    // Keyboard shortcuts — Fase 3A
    document.addEventListener('keydown', e => {
      const tag = (e.target || document.activeElement)?.tagName || '';
      const inInput = ['INPUT','TEXTAREA','SELECT'].includes(tag);
      if (e.key === 'Escape') { closeDrawer(); closeCaptainModal(); closeShortcutsModal(); closeRowMenus(); }
      if (!inInput) {
        if (e.key === 't' || e.key === 'T') setViewMode('timeline');
        if (e.key === 'l' || e.key === 'L') setViewMode('list');
        if (e.key === 'w' || e.key === 'W') setViewMode('weekly');
        if (e.key === 'm' || e.key === 'M') setViewMode('monthly');
        if (e.key === 'h' || e.key === 'H') goToday();
        if (e.key === 'n' || e.key === 'N') { /* future: open new booking modal */ showToast('Nueva reserva: próximamente'); }
        if (e.key === '?') { e.preventDefault(); showShortcutsModal(); }
        if (e.key === 'ArrowLeft'  || e.key === '[') { e.preventDefault(); shiftRange(-1); }
        if (e.key === 'ArrowRight' || e.key === ']') { e.preventDefault(); shiftRange(1); }
      }
      if (e.key === '/' && S.viewMode === 'list') {
        e.preventDefault();
        const search = document.getElementById('foc-list-search');
        if (search) { search.focus(); search.select(); }
      }
    });
    // Close row menus on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.foc-action-wrap')) closeRowMenus();
    });
  }

  /* ─── PUBLIC API ─────────────────────────────────────── */
  window.FleetOpsCenter = {
    init, refresh: loadAll,
    openDrawer, closeDrawer, toggleAlerts, handleAlertAction,
    markConfirmed, markCheckedIn, markPaid, cancelBooking, exportBooking,
    openCaptainModal, closeCaptainModal, assignCaptain, assignCaptainCustom,
    copyText, showToast, editField,
    // Fase 3A
    setViewMode, listSortBy, listFilter, listClear,
    toggleBulkSelect, toggleSelectAll, clearBulkSelection, bulkAction,
    setListDensity, toggleRowMenu, closeRowMenus,
    exportListCSV, exportListPDF,
    showShortcutsModal, closeShortcutsModal,
  };

})();

/* ═══════════════════════════════════════════════════════════════════
   focDocuments — Módulo de documentos del BookingDrawer (FOC FASE 5)
   Independiente del IIFE principal; define su propio helper esc().
   ═══════════════════════════════════════════════════════════════════ */
window.focDocuments = (function () {
  'use strict';

  /* ── Estado interno ─────────────────────────────────────────────── */
  let _booking = null;

  /* ── Helpers ────────────────────────────────────────────────────── */
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmt(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function docIcon(mime) {
    const s = 'display:inline-block;width:22px;height:22px;border-radius:4px;font-size:10px;font-weight:700;text-align:center;line-height:22px;flex-shrink:0;';
    if (!mime) return `<span style="${s}background:#E5E7EB;color:#6B7280">DOC</span>`;
    if (mime.startsWith('image/'))                              return `<span style="${s}background:#DBEAFE;color:#1D4ED8">IMG</span>`;
    if (mime === 'application/pdf')                             return `<span style="${s}background:#FEE2E2;color:#DC2626">PDF</span>`;
    if (mime.includes('word'))                                  return `<span style="${s}background:#EDE9FE;color:#7C3AED">DOC</span>`;
    if (mime.includes('excel') || mime.includes('spreadsheet')) return `<span style="${s}background:#D1FAE5;color:#065F46">XLS</span>`;
    if (mime.includes('zip') || mime.includes('compressed'))    return `<span style="${s}background:#FEF3C7;color:#92400E">ZIP</span>`;
    return `<span style="${s}background:#E5E7EB;color:#6B7280">DOC</span>`;
  }

  /* ── Scoring de auto-match ──────────────────────────────────────── */
  function matchScore(doc, booking) {
    let score = 0;
    const name = (doc.original_name || '').toLowerCase();
    const bDate = booking.booking_date ? booking.booking_date.substring(0, 10) : '';
    const bDateCompact = bDate.replace(/-/g, '');

    // Mismo barco
    if (doc.boat_id && booking.boat_id && doc.boat_id === booking.boat_id) score += 3;
    // Fecha en nombre de archivo
    if (bDate && name.includes(bDate)) score += 2;
    if (bDateCompact && name.includes(bDateCompact)) score += 2;
    // Año + mes
    if (bDate && name.includes(bDate.substring(0, 7).replace('-', ''))) score += 1;
    // Nombre cliente en archivo
    const cname = (booking.customer_name || '').toLowerCase().split(' ');
    cname.forEach(n => { if (n.length > 2 && name.includes(n)) score += 1; });
    // Tipo contrato/factura
    if (/contrato|contract|charter|factura|invoice/.test(name)) score += 1;

    return score;
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  function renderSection(linked, reviewDocs, suggestions, booking) {
    const sec = document.getElementById('foc-doc-section');
    if (!sec) return;

    const bookingId = booking.id;
    const boatId    = booking.boat_id || '';

    /* ── Documentos ya vinculados ─────────────────────────────────── */
    let html = `<div class="foc-doc-section-hd">Documentos del Booking</div>`;

    if (linked.length === 0) {
      html += `<div class="foc-doc-empty">Sin documentos vinculados.</div>`;
    } else {
      linked.forEach(d => {
        const cm = d.contract_meta;
        const cmInfo = cm ? `<span class="foc-doc-meta" style="display:block">Contrato: ${esc(cm.customer_name || '')} · ${esc(cm.rental_date || '')} · ${cm.total_amount ? '$' + cm.total_amount : ''}</span>` : '';
        html += `
        <div class="foc-doc-card" data-doc-id="${esc(d.id)}">
          <div class="foc-doc-icon">${docIcon(d.mime_type)}</div>
          <div class="foc-doc-info">
            <div class="foc-doc-name" title="${esc(d.original_name)}">${esc(d.original_name)}</div>
            <div class="foc-doc-meta">${esc(d.doc_type || 'Sin tipo')} &middot; ${fmt(d.file_size)}</div>
            ${cmInfo}
            <span class="foc-doc-linked">&#10003; Vinculado</span>
            <div class="foc-doc-actions">
              <button class="foc-doc-btn foc-doc-btn-primary" onclick="focDocuments.viewDoc('${esc(d.id)}')">Ver</button>
              <button class="foc-doc-btn foc-doc-btn-primary" onclick="focDocuments.downloadDoc('${esc(d.id)}')">Descargar</button>
              <button class="foc-doc-btn" onclick="focDocuments.unlinkDoc('${esc(d.id)}', '${esc(bookingId)}')">Desvincular</button>
            </div>
          </div>
        </div>`;
      });
    }

    /* ── Contratos que requieren revisión (score 60–79) ───────────── */
    if (reviewDocs.length > 0) {
      html += `<div class="foc-doc-section-hd" style="border-top:1px solid #FEF3C7;padding-top:12px;color:#92400E;background:#FFFBEB;">Requiere Revisión</div>`;
      html += `<div class="foc-doc-sublabel">El sistema detectó estos contratos como posibles candidatos (score 60–79)</div>`;
      reviewDocs.forEach(d => {
        const cm = d.contract_meta || {};
        const score = cm.match_score || 0;
        html += `
        <div class="foc-doc-card" data-doc-id="${esc(d.id)}" style="background:#FFFBEB;border-left:3px solid #F59E0B;padding-left:17px;">
          <div class="foc-doc-icon">${docIcon(d.mime_type)}</div>
          <div class="foc-doc-info">
            <div class="foc-doc-name" title="${esc(d.original_name)}">${esc(d.original_name)}</div>
            <div class="foc-doc-meta">${esc(d.doc_type || 'Sin tipo')} &middot; ${fmt(d.file_size)}</div>
            <div class="foc-doc-meta" style="margin-top:3px;">
              ${cm.customer_name ? `<b>Cliente:</b> ${esc(cm.customer_name)} &nbsp;` : ''}
              ${cm.boat_name     ? `<b>Barco:</b> ${esc(cm.boat_name)} &nbsp;` : ''}
              ${cm.rental_date   ? `<b>Fecha:</b> ${esc(cm.rental_date)} &nbsp;` : ''}
              ${cm.start_time_raw ? `<b>Hora:</b> ${esc(cm.start_time_raw)}${cm.end_time_raw ? '&ndash;' + esc(cm.end_time_raw) : ''} &nbsp;` : ''}
              ${cm.total_amount   ? `<b>Total:</b> $${esc(String(cm.total_amount))} &nbsp;` : ''}
            </div>
            <span class="foc-doc-score foc-doc-score-medium">Score ${score}/140</span>
            <div class="foc-doc-actions">
              <button class="foc-doc-btn foc-doc-btn-primary" onclick="focDocuments.linkDoc('${esc(d.id)}', '${esc(bookingId)}')">Confirmar vínculo</button>
              <button class="foc-doc-btn" onclick="focDocuments.viewDoc('${esc(d.id)}')">Ver PDF</button>
              <button class="foc-doc-btn" onclick="focDocuments.downloadDoc('${esc(d.id)}')">Descargar</button>
            </div>
          </div>
        </div>`;
      });
    }

    /* ── Sugerencias por barco (auto-match básico) ────────────────── */
    if (suggestions.length > 0) {
      html += `<div class="foc-doc-section-hd" style="border-top:1px solid #F3F4F6;padding-top:12px;">Sugerencias</div>`;
      html += `<div class="foc-doc-sublabel">Documentos relacionados con este barco</div>`;
      suggestions.forEach(d => {
        const level = d._score >= 4 ? 'high' : d._score >= 2 ? 'medium' : 'low';
        const label = d._score >= 4 ? 'Alta coincidencia' : d._score >= 2 ? 'Posible' : 'Relacionado';
        html += `
        <div class="foc-doc-card" data-doc-id="${esc(d.id)}">
          <div class="foc-doc-icon">${docIcon(d.mime_type)}</div>
          <div class="foc-doc-info">
            <div class="foc-doc-name" title="${esc(d.original_name)}">${esc(d.original_name)}</div>
            <div class="foc-doc-meta">${esc(d.doc_type || 'Sin tipo')} &middot; ${fmt(d.file_size)}</div>
            <span class="foc-doc-score foc-doc-score-${level}">${label}</span>
            <div class="foc-doc-actions">
              <button class="foc-doc-btn foc-doc-btn-primary" onclick="focDocuments.linkDoc('${esc(d.id)}', '${esc(bookingId)}')">Vincular</button>
              <button class="foc-doc-btn" onclick="focDocuments.viewDoc('${esc(d.id)}')">Ver</button>
            </div>
          </div>
        </div>`;
      });
    }

    /* ── Dropzone para subir nuevo documento ──────────────────────── */
    const dzId  = 'foc-dz-input';
    html += `
    <div class="foc-doc-section-hd" style="border-top:1px solid #F3F4F6;padding-top:12px;">Subir documento</div>
    <div class="foc-doc-dropzone" id="foc-doc-dropzone"
         onclick="document.getElementById('${dzId}').click()"
         ondragover="event.preventDefault();this.classList.add('dz-over')"
         ondragleave="this.classList.remove('dz-over')"
         ondrop="focDocuments._onDrop(event,'${esc(bookingId)}','${esc(boatId)}')">
      <input type="file" id="${dzId}" multiple accept="*/*" style="display:none"
             onchange="focDocuments._onFileInput(event,'${esc(bookingId)}','${esc(boatId)}')">
      <div class="foc-doc-dz-text">
        <strong>Haz clic o arrastra archivos aqui</strong><br>
        Los PDFs de contratos se vinculan automaticamente si el match es de alta confianza.
      </div>
    </div>
    <div class="foc-doc-footer">
      <a class="foc-doc-deeplink" href="/documents.html" target="_blank">
        Ver todos los documentos &#8599;
      </a>
    </div>`;

    sec.innerHTML = html;
  }

  /* ── API principal ──────────────────────────────────────────────── */

  async function load(booking) {
    _booking = booking;  // guardar para re-uso en linkDoc / unlinkDoc
    const sec = document.getElementById('foc-doc-section');
    if (!sec) return;
    sec.innerHTML = `<div class="foc-doc-section-hd">Documentos del Booking</div>
                     <div class="foc-doc-loading">Buscando documentos...</div>`;

    try {
      // Paralelo: (1) docs vinculados, (2) candidatos review, (3) docs del barco para sugerencias
      const [linkedRes, reviewRes, boatRes] = await Promise.all([
        fetch(`/api/documents?booking_id=${encodeURIComponent(booking.id)}`),
        fetch(`/api/documents?review_booking_id=${encodeURIComponent(booking.id)}`),
        booking.boat_id ? fetch(`/api/documents?boat_id=${encodeURIComponent(booking.boat_id)}`) : Promise.resolve(null),
      ]);

      if (!linkedRes.ok) throw new Error('Error cargando documentos');
      const linked = await linkedRes.json();
      const reviewDocs = (reviewRes && reviewRes.ok) ? await reviewRes.json() : [];

      let suggestions = [];
      if (boatRes && boatRes.ok) {
        const boatDocs = await boatRes.json();
        const linkedIds = new Set(linked.map(d => d.id));
        const reviewIds = new Set(reviewDocs.map(d => d.id));
        suggestions = boatDocs
          .filter(d => !linkedIds.has(d.id) && !reviewIds.has(d.id) && !d.booking_id)
          .map(d => ({ ...d, _score: matchScore(d, booking) }))
          .filter(d => d._score > 0)
          .sort((a, b) => b._score - a._score)
          .slice(0, 5);
      }

      renderSection(linked, reviewDocs, suggestions, booking);
    } catch (e) {
      if (sec) sec.innerHTML = `<div class="foc-doc-section-hd">Documentos del Booking</div>
                                 <div class="foc-doc-empty">Error al cargar documentos.</div>`;
      console.warn('[focDocuments] load error:', e);
    }
  }

  async function linkDoc(docId, bookingId) {
    try {
      const r = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      if (!r.ok) throw new Error(await r.text());
      // Refrescar sección — buscar el booking en el drawer abierto
      const booking = _currentBooking();
      if (booking) load(booking);
    } catch (e) {
      alert('Error al vincular documento: ' + e.message);
    }
  }

  async function unlinkDoc(docId, bookingId) {
    if (!confirm('¿Desvincular este documento de la reserva?')) return;
    try {
      const r = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: null }),
      });
      if (!r.ok) throw new Error(await r.text());
      const booking = _currentBooking();
      if (booking) load(booking);
    } catch (e) {
      alert('Error al desvincular: ' + e.message);
    }
  }

  function viewDoc(docId) {
    window.open(`/api/documents/${encodeURIComponent(docId)}/view`, '_blank');
  }

  function downloadDoc(docId) {
    window.open(`/api/documents/${encodeURIComponent(docId)}/download`, '_blank');
  }

  /* ── Upload helpers ─────────────────────────────────────────────── */

  async function _uploadFiles(files, bookingId, boatId) {
    const dz = document.getElementById('foc-doc-dropzone');
    if (dz) dz.innerHTML = `<div class="foc-doc-uploading">Subiendo ${files.length} archivo(s)...</div>`;

    let ok = 0, fail = 0;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('doc_type', 'otro');
        fd.append('booking_id', bookingId);
        if (boatId) fd.append('boat_id', boatId);
        fd.append('entity_type', 'booking');
        fd.append('entity_id', bookingId);

        const r = await fetch('/api/documents/upload', { method: 'POST', body: fd });
        if (!r.ok) throw new Error(await r.text());
        ok++;
      } catch (e) {
        fail++;
        console.warn('[focDocuments] upload fail:', e);
      }
    }

    // Resetear input para permitir re-subir mismos archivos
    const inp = document.getElementById('foc-dz-input');
    if (inp) inp.value = '';

    // Refrescar sección
    const booking = _currentBooking();
    if (booking) load(booking);

    if (fail > 0) alert(`${ok} subido(s), ${fail} con error.`);
  }

  function _onDrop(e, bookingId, boatId) {
    e.preventDefault();
    const dz = document.getElementById('foc-doc-dropzone');
    if (dz) dz.classList.remove('dz-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) _uploadFiles(files, bookingId, boatId);
  }

  function _onFileInput(e, bookingId, boatId) {
    const files = Array.from(e.target.files);
    if (files.length > 0) _uploadFiles(files, bookingId, boatId);
  }

  /* ── Helper: recuperar booking del drawer abierto ───────────────── */
  function _currentBooking() {
    return _booking;
  }

  return { load, linkDoc, unlinkDoc, viewDoc, downloadDoc, _onDrop, _onFileInput };

})();
