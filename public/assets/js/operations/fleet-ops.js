/**
 * NADAKI FLEET OPERATIONS CENTER — FASE 1
 * Fleet Timeline: per-boat rows × time axis
 */
(function () {
  'use strict';

  /* ─── CONSTANTS ─────────────────────────────────────── */
  const OP_START  = 6;    // 06:00
  const OP_END    = 22;   // 22:00
  const OP_HOURS  = OP_END - OP_START; // 16

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

  const SEVERITY_COLORS = { critical: '#EF4444', warning: '#F59E0B', info: '#6B7280' };

  /* ─── STATE ──────────────────────────────────────────── */
  let S = {
    zoom: 7,           // days in view
    rangeStart: null,  // Date (start of visible range)
    data: null,        // timeline API payload
    kpis: null,
    alerts: null,
    todayStrip: null,
    alertsOpen: true,
    nowLineInterval: null,
  };

  /* ─── UTILS ──────────────────────────────────────────── */
  function addDays(date, n) {
    const d = new Date(date); d.setDate(d.getDate() + n); return d;
  }
  function toISO(d) {
    return d.toISOString().split('T')[0];
  }
  function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function dayName(date) {
    return date.toLocaleDateString('es', { weekday: 'short' }).replace('.', '').toUpperCase();
  }
  function monthLabel(from, to) {
    const f = from.toLocaleDateString('es', { month: 'short', day: 'numeric' });
    const t = to.toLocaleDateString('es', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${f} – ${t}`;
  }
  function fmtCurrency(v) {
    const n = parseFloat(v) || 0;
    return '$' + n.toLocaleString('en', { minimumFractionDigits: 0 });
  }
  function fmtMono(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
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
  function statusColor(status) {
    return STATUS_COLORS[status] || '#71717A';
  }
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
    // Snap to start of week (Monday)
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    S.rangeStart = monday;
  }

  function shiftRange(dir) {
    S.rangeStart = addDays(S.rangeStart, dir * S.zoom);
    loadAll();
  }

  function goToday() {
    initRange();
    loadAll();
  }

  function setZoom(z) {
    S.zoom = z;
    loadAll();
  }

  /* ─── RENDER PIPELINE ────────────────────────────────── */
  function render() {
    renderTodayStrip();
    renderKPIBar();
    renderNavBar();
    renderTimeline();
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
    }

    if (ts.unassigned_crew > 0) {
      items.push(`<span class="foc-strip-item foc-strip-warn"><span class="foc-strip-icon">⚠</span><strong>${ts.unassigned_crew}</strong> sin capitán asignado</span>`);
    }
    if (ts.payment_pending > 0) {
      items.push(`<span class="foc-strip-item foc-strip-warn"><span class="foc-strip-icon">💳</span><strong>${ts.payment_pending}</strong> pago pendiente</span>`);
    }
    if (ts.free_boats && ts.free_boats.length > 0) {
      const names = ts.free_boats.map(b => b.display_name || b.boat_type).join(' · ');
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
        <div class="foc-kpi-label">Huecos</div>
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
      </div>
    `;
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
      if (btn) {
        btn.classList.toggle('foc-zoom-active', parseInt(z) === S.zoom);
      }
    });
  }

  /* ─── MAIN TIMELINE ──────────────────────────────────── */
  function renderTimeline() {
    const container = el('foc-timeline');
    if (!container || !S.data) return;

    const { fleet, bookings, holds, maintenance } = S.data;
    const today = toISO(new Date());

    // Build date range array
    const days = [];
    for (let i = 0; i < S.zoom; i++) {
      days.push(addDays(S.rangeStart, i));
    }

    // Build booking map: boat_type → date → [bookings]
    const bMap = {};
    (bookings || []).forEach(b => {
      if (!bMap[b.boat_type]) bMap[b.boat_type] = {};
      if (!bMap[b.boat_type][b.booking_date]) bMap[b.boat_type][b.booking_date] = [];
      bMap[b.boat_type][b.booking_date].push(b);
    });

    // Build maintenance map
    const mMap = {};
    (maintenance || []).forEach(m => {
      if (!mMap[m.boat_type]) mMap[m.boat_type] = [];
      mMap[m.boat_type].push(m);
    });

    // Build holds map
    const hMap = {};
    (holds || []).forEach(h => {
      if (!hMap[h.boat_type]) hMap[h.boat_type] = [];
      hMap[h.boat_type].push(h);
    });

    // All boats from fleet_config + any extras from bookings
    const allBoatTypes = new Set((fleet || []).map(f => f.boat_type));
    (bookings || []).forEach(b => allBoatTypes.add(b.boat_type));
    const allBoats = [...allBoatTypes].map(bt => {
      return (fleet || []).find(f => f.boat_type === bt) || { boat_type: bt, display_name: bt, display_color: boatColor(bt, fleet), short_label: bt.slice(0,3).toUpperCase(), buffer_minutes: 60 };
    });

    // Day col width
    const COL_W = Math.max(120, Math.floor(Math.min(200, (window.innerWidth - 180) / S.zoom)));
    const ROW_H = 110; // px per boat row

    // --- Build day headers ---
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

    // --- Build boat rows ---
    let rowsHtml = '';
    allBoats.forEach(boat => {
      const color = boat.display_color || boatColor(boat.boat_type, fleet);
      const boatBookings = bMap[boat.boat_type] || {};
      const boatMaint    = mMap[boat.boat_type] || [];

      // Compute per-boat stats for left rail
      const allBkings = Object.values(boatBookings).flat();
      const rangeRevenue = allBkings.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0);
      const boatDaysBooked = Object.keys(boatBookings).length;
      const utilPct = S.zoom > 0 ? Math.round((boatDaysBooked / S.zoom) * 100) : 0;

      // Find next upcoming booking for this boat
      const todayLocal = toISO(new Date());
      const upcoming = allBkings.filter(b => b.booking_date >= todayLocal).sort((a,b) => a.booking_date.localeCompare(b.booking_date));
      const nextBk   = upcoming[0];
      let nextLabel  = 'Sin reservas próximas';
      if (nextBk) {
        const d = parseLocalDate(nextBk.booking_date);
        const isToday_ = nextBk.booking_date === todayLocal;
        nextLabel = `${isToday_ ? 'Hoy' : d.toLocaleDateString('es', {month:'short',day:'numeric'})} ${nextBk.start_time || ''}`;
      }

      // Boat status
      const isMaintNow = boatMaint.some(m => {
        const s = new Date(m.start_datetime), e = new Date(m.end_datetime), now = new Date();
        return s <= now && e >= now;
      });
      const isBookedNow = allBkings.some(b => {
        if (b.booking_date !== todayLocal) return false;
        const sh = b.start_time ? parseInt(b.start_time.split(':')[0]) : 10;
        const eh = sh + (b.duration_hours || 4);
        const nh = new Date().getHours() + new Date().getMinutes()/60;
        return nh >= sh && nh < eh;
      });
      let boatStatus = 'available', statusLabel = 'Disponible', statusDot = '#10B981';
      if (isMaintNow) { boatStatus = 'maintenance'; statusLabel = 'Mantenimiento'; statusDot = '#EF4444'; }
      else if (isBookedNow) { boatStatus = 'booked'; statusLabel = 'En Servicio'; statusDot = '#3B82F6'; }

      // Has any booking in range?
      const hasBookingsInRange = allBkings.length > 0;

      // Left rail HTML
      const railHtml = `
        <div class="foc-rail" style="border-left: 3px solid ${color}">
          <div class="foc-rail-top">
            <span class="foc-status-dot" style="background:${statusDot}"></span>
            <span class="foc-rail-name">${escHtml(boat.display_name || boat.boat_type)}</span>
          </div>
          <div class="foc-rail-stat">${utilPct}% utilización</div>
          <div class="foc-rail-stat foc-rail-rev">${fmtCurrency(rangeRevenue)}</div>
          <div class="foc-rail-next">${escHtml(nextLabel)}</div>
          <div class="foc-rail-status" style="color:${statusDot}">${statusLabel}</div>
        </div>`;

      // Day cells
      let cellsHtml = '';
      days.forEach(day => {
        const iso = toISO(day);
        const isToday_ = iso === today;
        const dayBkings = boatBookings[iso] || [];
        const dayMaint  = boatMaint.filter(m => {
          const ms = toISO(new Date(m.start_datetime));
          const me = toISO(new Date(m.end_datetime));
          return iso >= ms && iso <= me;
        });

        let cellContent = '';

        // Maintenance overlay
        dayMaint.forEach(m => {
          cellContent += `
            <div class="foc-maint-overlay" title="${escHtml(m.maintenance_type || 'Mantenimiento')}">
              <span class="foc-maint-icon">🔧</span>
              <span class="foc-maint-label">${escHtml(m.maintenance_type || 'Mantenimiento')}</span>
            </div>`;
        });

        // Booking blocks
        dayBkings.forEach(b => {
          cellContent += renderBookingBlock(b, COL_W, color, ROW_H);
        });

        // Empty day with no booking in range — "Available" hint
        if (!hasBookingsInRange && days.indexOf(day) === 0) {
          cellContent += `<div class="foc-empty-row-hint">Disponible · Sin reservas en este rango <a class="foc-create-link" href="/commissions.html">+ Crear reserva</a></div>`;
        }

        // Now line (only today column)
        const nowFrac = timeToFraction(new Date().toTimeString().slice(0,5));
        const nowPx   = Math.round(nowFrac * ROW_H);
        const nowLine = isToday_ ? `<div class="foc-now-line" id="foc-now-${boat.boat_type.replace(/\s+/g,'_')}" style="top:${nowPx}px"></div>` : '';

        cellsHtml += `<div class="foc-day-cell ${isToday_ ? 'foc-cell-today' : ''}" style="width:${COL_W}px;min-width:${COL_W}px;height:${ROW_H}px" data-date="${iso}" data-boat="${escHtml(boat.boat_type)}">${cellContent}${nowLine}</div>`;
      });

      rowsHtml += `
        <div class="foc-row" style="height:${ROW_H}px">
          ${railHtml}
          <div class="foc-row-cells">${cellsHtml}</div>
        </div>`;
    });

    // Time axis (left side of cells)
    const timeAxisHtml = buildTimeAxis(ROW_H, days.length, COL_W);

    container.innerHTML = `
      <div class="foc-timeline-inner">
        <div class="foc-day-headers">${dayHeadersHtml}</div>
        <div class="foc-rows-area">
          <div class="foc-time-axis">${timeAxisHtml}</div>
          <div class="foc-rows">${rowsHtml}</div>
        </div>
      </div>`;

    // Start now-line updater
    if (S.nowLineInterval) clearInterval(S.nowLineInterval);
    S.nowLineInterval = setInterval(updateNowLine, 60000);
  }

  function buildTimeAxis(rowH, numBoats, colW) {
    const hours = [6, 9, 12, 15, 18, 21];
    let html = '';
    hours.forEach(h => {
      const frac = (h - OP_START) / OP_HOURS;
      html += `<div class="foc-time-tick" style="top:${Math.round(frac * rowH)}px">${String(h).padStart(2,'0')}:00</div>`;
    });
    return html;
  }

  /* BOOKING BLOCK — L/M/S COMPRESSION */
  function renderBookingBlock(b, colW, boatColorHex, rowH) {
    const frac    = timeToFraction(b.start_time || '10:00');
    const durFrac = Math.min(1 - frac, (b.duration_hours || 4) / OP_HOURS);
    const topPx   = Math.round(frac * rowH);
    const hPx     = Math.max(28, Math.round(durFrac * rowH));
    const sColor  = statusColor(b.status || 'confirmed');
    const captain = b.assigned_captain_name || '';
    const endH    = (parseInt((b.start_time||'10:00').split(':')[0]) + (b.duration_hours||4));
    const endStr  = `${String(Math.floor(endH)).padStart(2,'0')}:00`;
    const timeStr = `${b.start_time||'10:00'}–${endStr}`;
    const isEstTime = b.start_time_source === 'default_backfill';
    const isEstDur  = b.duration_source   === 'default_backfill';

    // Badge for captain warning
    const hasNoCaptain = !captain;
    const badgeHtml = hasNoCaptain ? `<span class="foc-blk-badge foc-blk-badge-warn">!</span>` : '';

    // Estimate badge
    const estHtml = (isEstTime || isEstDur) ? `<span class="foc-blk-est">~</span>` : '';

    let content = '';
    if (colW > 180 && hPx > 60) {
      // SIZE L
      content = `
        <div class="foc-blk-header">
          <span class="foc-blk-short">${escHtml(b.boat_type?.slice(0,4).toUpperCase()||'?')}</span>
          ${badgeHtml}
        </div>
        <div class="foc-blk-name">${escHtml(b.customer_name||'—')}</div>
        <div class="foc-blk-meta">${timeStr}${estHtml}${captain ? ' · ' + escHtml(captain.split(' ')[0]) : ''} · ${fmtCurrency(b.total_amount)}</div>`;
    } else if (colW >= 100 || hPx >= 44) {
      // SIZE M
      content = `
        <div class="foc-blk-header">
          <span class="foc-blk-short">${escHtml((b.customer_name||'?').slice(0,6))}</span>
          ${badgeHtml}
        </div>
        <div class="foc-blk-meta">${b.customer_name?.split(' ')[0]||'?'} · ${b.start_time||'10:00'}${estHtml}</div>`;
    } else {
      // SIZE S
      content = `
        <div class="foc-blk-header">
          <span class="foc-blk-short">${initials(b.customer_name)}</span>
          ${badgeHtml}
        </div>`;
    }

    return `
      <div class="foc-booking-block"
           style="top:${topPx}px;height:${hPx}px;border-left-color:${boatColorHex};background:${sColor}18"
           data-id="${b.id}"
           data-testid="booking-block-${b.id}"
           title="${escHtml(b.customer_name)} · ${timeStr} · ${b.boat_type}"
           onclick="FleetOpsCenter.openDrawer('${b.id}')">
        ${content}
      </div>`;
  }

  /* ALERTS PANEL */
  function renderAlertsPanel() {
    const panel = el('foc-alerts-panel');
    if (!panel || !S.alerts) return;
    const { alerts = [], critical = 0 } = S.alerts;

    const toggleHtml = `
      <div class="foc-alerts-header" onclick="FleetOpsCenter.toggleAlerts()">
        <span class="foc-alerts-title">
          Alertas Operativas
          ${critical > 0 ? `<span class="foc-alerts-badge foc-alerts-badge-crit">${critical} críticas</span>` : ''}
          ${alerts.length > critical ? `<span class="foc-alerts-badge">${alerts.length - critical} avisos</span>` : ''}
        </span>
        <span class="foc-alerts-toggle">${S.alertsOpen ? '▲' : '▼'}</span>
      </div>`;

    if (!S.alertsOpen || alerts.length === 0) {
      panel.innerHTML = toggleHtml + (S.alertsOpen ? '<div class="foc-alerts-empty">Sin alertas activas en el rango visible</div>' : '');
      return;
    }

    const alertsHtml = alerts.slice(0, 10).map(a => {
      const sev = SEVERITY_COLORS[a.severity] || '#6B7280';
      return `
        <div class="foc-alert-row" data-testid="alert-${a.id}">
          <span class="foc-alert-dot" style="background:${sev}"></span>
          <div class="foc-alert-body">
            <div class="foc-alert-msg">${escHtml(a.message)}</div>
            <div class="foc-alert-date">${escHtml(a.booking_date||'')}</div>
          </div>
          ${a.action ? `<button class="foc-alert-action" onclick="FleetOpsCenter.handleAlertAction('${a.id}')">${escHtml(a.action)}</button>` : ''}
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
    document.querySelectorAll('[id^="foc-now-"]').forEach(el => {
      el.style.top = px + 'px';
    });
  }

  /* DETAIL DRAWER */
  function openDrawer(bookingId) {
    if (!S.data) return;
    const b = S.data.bookings.find(x => x.id === bookingId);
    if (!b) return;

    const drawer = el('foc-drawer');
    if (!drawer) return;

    const color = boatColor(b.boat_type, S.data.fleet);
    const captain = b.assigned_captain_name || '';
    const endH = (parseInt((b.start_time||'10:00').split(':')[0]) + (b.duration_hours||4));
    const endStr = `${String(Math.floor(endH)).padStart(2,'0')}:00`;
    const isEstTime = b.start_time_source === 'default_backfill';
    const isEstDur  = b.duration_source   === 'default_backfill';

    drawer.innerHTML = `
      <div class="foc-drawer-overlay" onclick="FleetOpsCenter.closeDrawer()"></div>
      <div class="foc-drawer-panel">
        <div class="foc-drawer-header" style="border-left: 4px solid ${color}">
          <div>
            <div class="foc-drawer-title">${escHtml(b.customer_name||'—')}</div>
            <div class="foc-drawer-sub">${escHtml(b.boat_type)} · ${escHtml(b.booking_date)}</div>
          </div>
          <button class="foc-drawer-close" onclick="FleetOpsCenter.closeDrawer()" data-testid="button-close-drawer">✕</button>
        </div>
        <div class="foc-drawer-body">

          <div class="foc-drawer-section">
            <div class="foc-drawer-section-title">Resumen de Reserva</div>
            <div class="foc-drawer-row"><span class="foc-dr-label">ID</span><span class="foc-dr-val foc-mono">${escHtml(b.id)}</span></div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Canal</span><span class="foc-dr-val">${escHtml(b.platform||'—')}</span></div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Pasajeros</span><span class="foc-dr-val">${b.num_guests||'—'}</span></div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Estado</span><span class="foc-dr-val"><span class="foc-status-chip" style="background:${statusColor(b.status)}22;color:${statusColor(b.status)}">${escHtml(b.status||'—')}</span></span></div>
            ${b.pickup_location ? `<div class="foc-drawer-row"><span class="foc-dr-label">Pickup</span><span class="foc-dr-val">${escHtml(b.pickup_location)}</span></div>` : ''}
          </div>

          <div class="foc-drawer-section">
            <div class="foc-drawer-section-title">Operaciones</div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Capitán</span><span class="foc-dr-val ${!captain ? 'foc-dr-missing' : ''}">${captain || '⚠ Sin asignar'}</span></div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Stew</span><span class="foc-dr-val">${escHtml(b.stew_name||'—')}</span></div>
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Hora salida</span>
              <span class="foc-dr-val">${escHtml(b.start_time||'10:00')} ${isEstTime ? '<span class="foc-est-badge">Hora estimada · Editar</span>' : ''}</span>
            </div>
            <div class="foc-drawer-row">
              <span class="foc-dr-label">Duración</span>
              <span class="foc-dr-val">${b.duration_hours||4}h ${isEstDur ? '<span class="foc-est-badge">Duración estimada · Editar</span>' : ''}</span>
            </div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Regreso ETA</span><span class="foc-dr-val">${endStr}</span></div>
          </div>

          <div class="foc-drawer-section">
            <div class="foc-drawer-section-title">Financiero</div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Total</span><span class="foc-dr-val foc-dr-rev">${fmtCurrency(b.total_amount)}</span></div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Depósito</span><span class="foc-dr-val">${fmtCurrency(b.deposit_amount)}</span></div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Balance pendiente</span><span class="foc-dr-val ${parseFloat(b.balance_pending||0) > 0 ? 'foc-dr-danger' : ''}">${fmtCurrency(b.balance_pending)}</span></div>
            <div class="foc-drawer-row"><span class="foc-dr-label">Método de pago</span><span class="foc-dr-val">${escHtml(b.payment_method||'—')}</span></div>
          </div>

          ${b.notes ? `<div class="foc-drawer-section"><div class="foc-drawer-section-title">Notas</div><div class="foc-dr-notes">${escHtml(b.notes)}</div></div>` : ''}

        </div>
        <div class="foc-drawer-footer">
          <a href="/commissions.html" class="foc-action-btn foc-action-edit" data-testid="button-drawer-edit">Editar reserva</a>
          <button class="foc-action-btn foc-action-copy" data-testid="button-drawer-copy" onclick="navigator.clipboard.writeText('${escHtml(b.id)}');this.textContent='Copiado!'">Copiar ID</button>
        </div>
      </div>`;

    drawer.classList.add('foc-drawer-open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    const drawer = el('foc-drawer');
    if (drawer) {
      drawer.classList.remove('foc-drawer-open');
      drawer.innerHTML = '';
    }
    document.body.style.overflow = '';
  }

  function toggleAlerts() {
    S.alertsOpen = !S.alertsOpen;
    renderAlertsPanel();
  }

  function handleAlertAction(alertId) {
    console.log('Alert action:', alertId);
  }

  /* ─── INIT ───────────────────────────────────────────── */
  function init() {
    if (!el('foc-timeline')) return;
    initRange();
    loadAll();
    bindEvents();
  }

  function bindEvents() {
    const prevBtn = el('foc-prev');
    const nextBtn = el('foc-next');
    const todayBtn = el('foc-goto-today');
    if (prevBtn)  prevBtn.addEventListener('click', () => shiftRange(-1));
    if (nextBtn)  nextBtn.addEventListener('click', () => shiftRange(1));
    if (todayBtn) todayBtn.addEventListener('click', goToday);
    ['3','7','14','30'].forEach(z => {
      const btn = el(`foc-zoom-${z}`);
      if (btn) btn.addEventListener('click', () => setZoom(parseInt(z)));
    });
  }

  /* ─── PUBLIC API ─────────────────────────────────────── */
  window.FleetOpsCenter = { init, refresh: loadAll, openDrawer, closeDrawer, toggleAlerts, handleAlertAction };

})();
