/* ============================================================
   NBIC UI Components — Vanilla JS
   Nadaki Business Intelligence Center v2.0
   ============================================================ */

'use strict';

// ── Theme Manager ───────────────────────────────────────────
const NBICTheme = {
  current: 'dark',
  init() {
    this.current = localStorage.getItem('nbic-theme') || 'dark';
    this.apply(this.current);
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.current = theme;
    localStorage.setItem('nbic-theme', theme);
    const btn = document.getElementById('nbic-theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'dark'
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
    }
  },
  toggle() {
    this.apply(this.current === 'dark' ? 'light' : 'dark');
  }
};

// ── Sidebar Manager ─────────────────────────────────────────
const NBICSidebar = {
  collapsed: false,
  init() {
    this.collapsed = localStorage.getItem('nbic-sidebar') === 'collapsed';
    if (window.innerWidth < 1440) this.collapsed = true;
    this.applyState();
    const toggle = document.getElementById('nbic-sidebar-toggle');
    if (toggle) toggle.addEventListener('click', () => this.toggle());
    document.querySelectorAll('.nbic-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nbic-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const report = item.dataset.report;
        if (report) NBICRouter.navigate(report);
      });
    });
  },
  toggle() {
    this.collapsed = !this.collapsed;
    localStorage.setItem('nbic-sidebar', this.collapsed ? 'collapsed' : 'expanded');
    this.applyState();
  },
  applyState() {
    const sidebar  = document.querySelector('.nbic-sidebar');
    const content  = document.querySelector('.nbic-content');
    const filterbar= document.querySelector('.nbic-filterbar');
    if (!sidebar) return;
    if (this.collapsed) {
      sidebar.classList.add('collapsed');
      content?.classList.add('sidebar-collapsed');
      filterbar?.classList.add('sidebar-collapsed');
    } else {
      sidebar.classList.remove('collapsed');
      content?.classList.remove('sidebar-collapsed');
      filterbar?.classList.remove('sidebar-collapsed');
    }
  }
};

// ── Router ──────────────────────────────────────────────────
const NBICRouter = {
  current: 'f1',
  routes: {
    'f1': { title: 'Executive Dashboard', domain: 'Executive', endpoint: '/api/nbic/executive/kpis' },
    'f2': { title: 'Alertas Activas',     domain: 'Executive', endpoint: '/api/nbic/executive/alerts' },
    'a1': { title: 'Conciliación',        domain: 'Revenue',   endpoint: '/api/nbic/revenue/reconciliation' },
    'a2': { title: 'Aging AR',            domain: 'Revenue',   endpoint: '/api/nbic/revenue/aging' },
    'a3': { title: 'Flujo Pago',          domain: 'Revenue',   endpoint: '/api/nbic/revenue/payment-flow' },
    'a4': { title: 'Depósitos Pendientes',domain: 'Revenue',   endpoint: '/api/nbic/revenue/pending-deposits' },
    'a5': { title: 'Por Dimensión',       domain: 'Revenue',   endpoint: '/api/nbic/revenue/by-dimension' },
    'a6': { title: 'Cash Days',           domain: 'Revenue',   endpoint: '/api/nbic/revenue/cash-days' },
    'b1': { title: 'Precios por Barco',   domain: 'Pricing',   endpoint: '/api/nbic/pricing/variance' },
    'b2': { title: 'Variación Semanal',   domain: 'Pricing',   endpoint: '/api/nbic/pricing/weekly' },
    'b3': { title: 'Outliers Z-Score',    domain: 'Pricing',   endpoint: '/api/nbic/pricing/outliers' },
    'b4': { title: 'Ticket Promedio',     domain: 'Pricing',   endpoint: '/api/nbic/pricing/avg-ticket' },
    'b5': { title: 'Descuentos',          domain: 'Pricing',   endpoint: '/api/nbic/pricing/discount-analysis' },
    'b6': { title: 'Revenue Leakage',     domain: 'Pricing',   endpoint: '/api/nbic/pricing/leakage-waterfall' },
    'c1': { title: 'Gastos por Barco',    domain: 'Gastos',    endpoint: '/api/nbic/expenses/by-boat' },
    'c2': { title: 'Por Categoría',       domain: 'Gastos',    endpoint: '/api/accounting/expenses/analysis' },
    'c3': { title: 'Evolución',           domain: 'Gastos',    endpoint: '/api/nbic/expenses/period' },
    'c4': { title: 'Top Proveedores',     domain: 'Gastos',    endpoint: '/api/nbic/expenses/top-suppliers' },
    'c5': { title: 'Anomalías',           domain: 'Gastos',    endpoint: '/api/nbic/expenses/anomalies' },
    'c6': { title: 'Break-even',          domain: 'Gastos',    endpoint: '/api/nbic/expenses/breakeven' },
    'd1': { title: 'Por Barco',           domain: 'Rentabilidad', endpoint: '/api/nbic/profitability/by-boat' },
    'd2': { title: 'Evolución Margen',    domain: 'Rentabilidad', endpoint: '/api/nbic/profitability/margin-trend' },
    'd3': { title: 'Por Canal',           domain: 'Rentabilidad', endpoint: '/api/nbic/profitability/by-channel' },
    'd4': { title: 'RevPAB y Utilización',domain: 'Rentabilidad', endpoint: '/api/nbic/profitability/revpab' },
    'd5': { title: 'P&L',                 domain: 'Rentabilidad', endpoint: '/api/nbic/profitability/pnl' },
    'e1': { title: 'Barco vs Barco',      domain: 'Compare',   endpoint: '/api/nbic/compare/boats' },
    'e2': { title: 'Período vs Período',  domain: 'Compare',   endpoint: '/api/nbic/compare/periods' },
    'e3': { title: 'Seasonality Heatmap', domain: 'Compare',   endpoint: '/api/nbic/compare/seasonality' },
  },
  navigate(reportId) {
    if (!this.routes[reportId]) return;
    this.current = reportId;
    const route = this.routes[reportId];
    window.location.hash = reportId;
    // Breadcrumb
    const bc = document.getElementById('nbic-breadcrumb');
    if (bc) bc.innerHTML = `<span>${route.domain}</span> <span class="sep">/</span> <span>${route.title}</span>`;
    NBICReports.load(reportId, route);
    // Active nav
    document.querySelectorAll('.nbic-nav-item').forEach(i => {
      i.classList.toggle('active', i.dataset.report === reportId);
    });
  },
  init() {
    const hash = window.location.hash.replace('#', '') || 'f1';
    this.navigate(hash);
    window.addEventListener('hashchange', () => {
      const h = window.location.hash.replace('#', '') || 'f1';
      if (h !== this.current) this.navigate(h);
    });
  }
};

// ── Filters ─────────────────────────────────────────────────
const NBICFilters = {
  current: {
    date_from: '',
    date_to:   '',
    preset:    'this_month',
    boat_ids:  [],
    channel_ids: [],
    payment_methods: [],
  },
  presets: [
    { key: 'today',        label: 'Hoy' },
    { key: 'yesterday',    label: 'Ayer' },
    { key: 'last_7d',      label: 'Últimos 7 días' },
    { key: 'this_week',    label: 'Esta semana' },
    { key: 'last_week',    label: 'Semana pasada' },
    { key: 'last_30d',     label: 'Últimos 30 días' },
    { key: 'this_month',   label: 'Este mes' },
    { key: 'last_month',   label: 'Mes pasado' },
    { key: 'this_quarter', label: 'Este trimestre' },
    { key: 'this_year',    label: 'Este año' },
    { key: 'custom',       label: 'Personalizado' },
  ],
  applyPreset(key) {
    const now   = new Date();
    const pad   = n => String(n).padStart(2, '0');
    const fmt   = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const today = fmt(now);
    let from = today, to = today;
    switch(key) {
      case 'yesterday':    { const y = new Date(now); y.setDate(y.getDate()-1); from=to=fmt(y); break; }
      case 'last_7d':      { const f = new Date(now); f.setDate(f.getDate()-6); from=fmt(f); to=today; break; }
      case 'this_week':    { const f = new Date(now); f.setDate(f.getDate()-f.getDay()+1); from=fmt(f); to=today; break; }
      case 'last_week':    { const f = new Date(now); f.setDate(f.getDate()-f.getDay()-6); const t2=new Date(f); t2.setDate(t2.getDate()+6); from=fmt(f);to=fmt(t2); break; }
      case 'last_30d':     { const f = new Date(now); f.setDate(f.getDate()-29); from=fmt(f); to=today; break; }
      case 'this_month':   { from=`${now.getFullYear()}-${pad(now.getMonth()+1)}-01`; to=today; break; }
      case 'last_month':   { const lm=new Date(now.getFullYear(),now.getMonth()-1,1); const lme=new Date(now.getFullYear(),now.getMonth(),0); from=fmt(lm);to=fmt(lme); break; }
      case 'this_quarter': { const q=Math.floor(now.getMonth()/3); from=`${now.getFullYear()}-${pad(q*3+1)}-01`; to=today; break; }
      case 'this_year':    { from=`${now.getFullYear()}-01-01`; to=today; break; }
    }
    this.current.date_from = from;
    this.current.date_to   = to;
    this.current.preset    = key;
    this.updateUI();
    this.onChange();
  },
  updateUI() {
    const preset = this.presets.find(p => p.key === this.current.preset);
    const lbl = document.getElementById('nbic-date-label');
    if (lbl) lbl.textContent = preset ? preset.label : `${this.current.date_from} → ${this.current.date_to}`;
    document.querySelectorAll('.nbic-dropdown__item[data-preset]').forEach(el => {
      el.classList.toggle('selected', el.dataset.preset === this.current.preset);
    });
  },
  getParams() {
    const p = new URLSearchParams();
    if (this.current.date_from) p.set('date_from', this.current.date_from);
    if (this.current.date_to)   p.set('date_to', this.current.date_to);
    this.current.boat_ids.forEach(id => p.append('boat_ids[]', id));
    return p;
  },
  onChange() {
    NBICReports.reload();
  },
  init() {
    this.applyPreset('this_month');
    // Date dropdown toggle
    const dateBtn = document.getElementById('nbic-date-chip');
    const dateDd  = document.getElementById('nbic-date-dropdown');
    if (dateBtn && dateDd) {
      dateBtn.addEventListener('click', e => {
        e.stopPropagation();
        dateDd.style.display = dateDd.style.display === 'block' ? 'none' : 'block';
      });
      dateDd.querySelectorAll('[data-preset]').forEach(item => {
        item.addEventListener('click', () => {
          this.applyPreset(item.dataset.preset);
          dateDd.style.display = 'none';
        });
      });
      document.addEventListener('click', () => { dateDd.style.display = 'none'; });
    }
  }
};

// ── Number formatting ───────────────────────────────────────
const NBICFmt = {
  currency(val) {
    if (val == null || isNaN(val)) return '—';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },
  pct(val) {
    if (val == null || isNaN(val)) return '—';
    return Number(val).toFixed(1) + '%';
  },
  num(val) {
    if (val == null || isNaN(val)) return '—';
    return Number(val).toLocaleString('en-US');
  },
  date(val) {
    if (!val) return '—';
    try {
      const d = new Date(val);
      return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    } catch { return val; }
  },
  delta(val) {
    if (val == null || isNaN(val)) return '';
    const sign = val >= 0 ? '+' : '';
    const cls  = val > 0 ? 'up' : val < 0 ? 'down' : 'flat';
    const arrow= val > 0
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 15l7-7 7 7"/></svg>'
      : val < 0
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 9l-7 7-7-7"/></svg>'
        : '';
    return `<span class="nbic-delta nbic-delta--${cls}">${arrow}${sign}${val.toFixed(1)}%</span>`;
  }
};

// ── Reports Renderer ────────────────────────────────────────
const NBICReports = {
  cache: {},
  async load(reportId, route) {
    const container = document.getElementById('nbic-content-area');
    if (!container) return;
    // Show skeleton
    container.innerHTML = this.renderSkeleton();
    try {
      const params = NBICFilters.getParams();
      const url = `${route.endpoint}?${params}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.cache[reportId] = data;
      // Render based on report type
      if (reportId === 'f1') this.renderExecutive(data, container);
      else if (reportId === 'f2') this.renderAlerts(data, container);
      else if (reportId === 'c2') this.renderExpensesByCategory(data, container);
      else this.renderGeneric(data, container, route);
    } catch(err) {
      container.innerHTML = this.renderError(err.message);
    }
  },
  reload() {
    const route = NBICRouter.routes[NBICRouter.current];
    if (route) this.load(NBICRouter.current, route);
  },

  renderSkeleton() {
    return `
      <div class="nbic-kpi-grid nbic-kpi-grid--4" style="margin-bottom:16px">
        ${Array(4).fill(0).map(() => `
          <div class="nbic-kpi-card" style="pointer-events:none">
            <div class="nbic-skeleton nbic-skeleton--text" style="width:60%;margin-bottom:12px"></div>
            <div class="nbic-skeleton nbic-skeleton--value" style="width:80%"></div>
          </div>`).join('')}
      </div>
      <div class="nbic-grid-8-4">
        <div class="nbic-card"><div class="nbic-card__body"><div class="nbic-skeleton nbic-skeleton--chart"></div></div></div>
        <div class="nbic-card"><div class="nbic-card__body">${Array(5).fill(0).map(()=>`<div class="nbic-skeleton nbic-skeleton--row" style="margin-bottom:8px"></div>`).join('')}</div></div>
      </div>`;
  },

  renderError(msg) {
    return `
      <div class="nbic-card" style="margin-top:24px">
        <div class="nbic-card__body">
          <div class="nbic-empty">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            <p class="nbic-empty__title">Error al cargar</p>
            <p class="nbic-empty__sub">${msg}</p>
            <button class="nbic-btn nbic-btn--outline" style="margin-top:16px" onclick="NBICReports.reload()">Reintentar</button>
          </div>
        </div>
      </div>`;
  },

  // ── Executive Dashboard F1 ──────────────────────────────
  renderExecutive(data, container) {
    const kpis = data.kpis || [];
    const kv = {};
    kpis.forEach(k => { kv[k.code] = k; });

    const heroKpis = ['gross_revenue','net_revenue','total_bookings','margin_pct'];
    const secKpis  = ['avg_ticket','cash_days_outstanding','revenue_leakage','active_alerts','horas_operadas','collection_rate'];

    container.innerHTML = `
      <!-- Hero KPIs -->
      <div class="nbic-row">
        <div class="nbic-kpi-grid nbic-kpi-grid--4">
          ${heroKpis.map(code => this.renderKPICard(kv[code], 'hero')).join('')}
        </div>
      </div>

      <!-- Secondary KPIs -->
      <div class="nbic-row">
        <div class="nbic-kpi-grid nbic-kpi-grid--6">
          ${secKpis.map(code => this.renderKPICard(kv[code])).join('')}
        </div>
      </div>

      <!-- Chart + Side Panel -->
      <div class="nbic-row nbic-grid-8-4">
        <div class="nbic-card">
          <div class="nbic-card__header">
            <div>
              <div class="nbic-card__title">Tendencia de Ingresos</div>
            </div>
            <span class="nbic-label">Últimos 30 días</span>
          </div>
          <div class="nbic-card__body">
            <canvas id="nbic-revenue-chart" height="200"></canvas>
          </div>
        </div>
        <div class="nbic-card">
          <div class="nbic-card__header">
            <div class="nbic-card__title">Top Canales</div>
          </div>
          <div class="nbic-card__body--no-pad" id="nbic-top-channels-body">
            ${this.renderChannelList(data.series)}
          </div>
        </div>
      </div>

      <!-- Alert Feed -->
      <div class="nbic-row">
        <div class="nbic-card">
          <div class="nbic-card__header">
            <div class="nbic-card__title">Alertas Recientes</div>
            <a href="#f2" class="nbic-btn nbic-btn--ghost nbic-btn--sm" onclick="NBICRouter.navigate('f2')">Ver todas</a>
          </div>
          <div class="nbic-alert-feed" id="nbic-exec-alerts">
            ${this.renderAlertItems(data.alerts || [])}
          </div>
        </div>
      </div>

      <!-- Recent Bookings -->
      <div class="nbic-row">
        <div class="nbic-card">
          <div class="nbic-card__header">
            <div class="nbic-card__title">Bookings Recientes</div>
            ${this.renderCompleteness(data.meta)}
          </div>
          <div class="nbic-card__body--no-pad">
            ${this.renderBookingsTable(data.table)}
          </div>
        </div>
      </div>`;

    // Draw chart after DOM ready
    setTimeout(() => this.drawRevenueChart(data.series), 50);
  },

  renderKPICard(kpi, size = '') {
    if (!kpi) return `
      <div class="nbic-kpi-card">
        <div class="nbic-kpi-card__header">
          <span class="nbic-kpi-card__label">—</span>
        </div>
        <div class="nbic-kpi-card__value empty nbic-mono">—</div>
      </div>`;

    const val = kpi.unit === 'USD' ? NBICFmt.currency(kpi.value)
              : kpi.unit === '%'   ? NBICFmt.pct(kpi.value)
              : kpi.unit === 'days'? `${Number(kpi.value||0).toFixed(1)} días`
              : NBICFmt.num(kpi.value);

    const delta = NBICFmt.delta(kpi.delta_wow_pct);
    const momD  = NBICFmt.delta(kpi.delta_mom_pct);

    return `
      <div class="nbic-kpi-card" onclick="NBICDrilldown.open('${kpi.code}','kpi','${kpi.code}')">
        <div class="nbic-kpi-card__header">
          <span class="nbic-kpi-card__label">${kpi.label || kpi.code}</span>
          <button class="nbic-kpi-card__info-btn" title="${kpi.formula||kpi.code}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </button>
        </div>
        <div class="nbic-kpi-card__value ${size} nbic-mono">${val === '—' ? '<span style="color:var(--nbic-text-disabled)">—</span>' : val}</div>
        <div class="nbic-kpi-card__footer">
          <div class="nbic-kpi-card__meta">${delta ? `WoW ${delta}` : '<span style="color:var(--nbic-text-disabled);font-size:11px">Sin historia</span>'}</div>
          ${momD ? `<div class="nbic-kpi-card__meta">MoM ${momD}</div>` : ''}
        </div>
      </div>`;
  },

  renderCompleteness(meta) {
    if (!meta) return '';
    const score = meta.completeness_score || 0;
    const cls   = score >= 0.95 ? 'full' : score >= 0.5 ? 'partial' : 'blocked';
    const lbl   = score >= 0.95 ? 'Completo' : score >= 0.5 ? `Parcial · ${Math.round(score*100)}%` : 'Bloqueado';
    return `<div class="nbic-completeness nbic-completeness--${cls}">
      <div class="nbic-completeness__dot"></div><span>${lbl}</span></div>`;
  },

  renderChannelList(series) {
    if (!series || !series.length) {
      return `<div class="nbic-empty" style="padding:24px">
        <p class="nbic-empty__title">Sin datos de canales</p></div>`;
    }
    const channelSeries = series.find(s => s.label === 'by_channel');
    if (!channelSeries || !channelSeries.data) return `<div class="nbic-empty" style="padding:24px"><p class="nbic-empty__title">Sin datos de canales</p></div>`;
    const total = channelSeries.data.reduce((a,d) => a+d.y, 0);
    return channelSeries.data.slice(0,5).map(d => {
      const pct = total > 0 ? (d.y/total*100).toFixed(0) : 0;
      return `<div style="padding:10px 16px;border-bottom:1px solid var(--nbic-border-subtle);display:flex;align-items:center;gap:12px">
        <div style="flex:1;font-size:13px;color:var(--nbic-text-secondary)">${d.x}</div>
        <div style="font-family:var(--nbic-font-mono);font-size:13px;color:var(--nbic-text-primary)">${NBICFmt.currency(d.y)}</div>
        <div style="width:60px;height:4px;background:var(--nbic-border-subtle);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--nbic-accent);border-radius:2px"></div>
        </div>
      </div>`;
    }).join('');
  },

  renderAlertItems(alerts) {
    if (!alerts.length) return `
      <div class="nbic-empty" style="padding:24px">
        <p class="nbic-empty__title">Sin alertas activas</p>
        <p class="nbic-empty__sub">El sistema no detectó anomalías en el período.</p>
      </div>`;
    return alerts.slice(0,6).map(a => {
      const barCls = a.severity === 'critical' ? 'critical' : a.severity === 'warn' ? 'warn' : 'info';
      const ts = a.created_at ? NBICFmt.date(a.created_at) : '';
      return `<div class="nbic-alert-item" onclick="NBICDrilldown.open('${a.alert_code||''}','alert','${a.entity_id||''}')">
        <div class="nbic-alert-item__bar nbic-alert-item__bar--${barCls}"></div>
        <div class="nbic-alert-item__content">
          <div class="nbic-alert-item__title">${a.name || a.alert_code}</div>
          <div class="nbic-alert-item__desc">${a.entity_name || a.description || ''}</div>
        </div>
        <div class="nbic-alert-item__meta">${ts}</div>
      </div>`;
    }).join('');
  },

  renderBookingsTable(table) {
    if (!table || !table.rows || !table.rows.length) {
      return `<div class="nbic-empty" style="padding:32px">
        <p class="nbic-empty__title">Sin bookings en el período</p>
        <p class="nbic-empty__sub">Prueba expandiendo el rango de fechas.</p>
      </div>`;
    }
    const cols = table.columns || [];
    return `
      <div class="nbic-table-wrap">
        <table class="nbic-table">
          <thead><tr>${cols.map(c => `<th class="${c.type==='currency'||c.type==='pct'?'num':''}">${c.label}</th>`).join('')}</tr></thead>
          <tbody>${table.rows.map(row => `
            <tr onclick="NBICDrilldown.open('booking','booking','${row.booking_id||''}')">
              ${cols.map(c => {
                const val = row[c.key];
                if (c.type === 'currency') return `<td class="num">${NBICFmt.currency(val)}</td>`;
                if (c.type === 'date')     return `<td class="date">${NBICFmt.date(val)}</td>`;
                if (c.type === 'badge')    return `<td><span class="nbic-badge nbic-badge--neutral">${val||'—'}</span></td>`;
                if (c.key === 'alerta' || c.key === 'status') {
                  const badge = val === 'ok' || val === 'completed' ? 'success' : val === 'pending' ? 'warning' : 'danger';
                  return `<td><span class="nbic-badge nbic-badge--${badge}">${val||'—'}</span></td>`;
                }
                return `<td class="${c.key==='booking_id'?'date':''}">${val||'—'}</td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="nbic-table-pagination">
          <span>${table.rows.length} registros</span>
        </div>
      </div>`;
  },

  drawRevenueChart(series) {
    const canvas = document.getElementById('nbic-revenue-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const revSeries = series && series.find(s => s.label === 'revenue_daily');
    const labels = revSeries ? revSeries.data.map(d => d.x) : [];
    const values = revSeries ? revSeries.data.map(d => d.y) : [];

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#6B7280' : '#71717A';
    const gridColor = isDark ? 'rgba(34,38,45,0.6)' : 'rgba(229,231,235,0.6)';

    if (canvas._chart) canvas._chart.destroy();
    canvas._chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ingresos',
          data: values,
          backgroundColor: 'rgba(59,130,246,0.5)',
          borderColor: 'rgba(59,130,246,0.8)',
          borderWidth: 1,
          borderRadius: 2,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#111316' : '#fff',
            borderColor: isDark ? '#2D323A' : '#D1D5DB',
            borderWidth: 1,
            titleColor: textColor,
            bodyColor: isDark ? '#E8EAED' : '#09090B',
            bodyFont: { family: "'JetBrains Mono', monospace", size: 13 },
            callbacks: { label: ctx => `$${ctx.parsed.y.toLocaleString()}` }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 }, maxTicksLimit: 8 },
            border: { color: isDark ? '#22262D' : '#E5E7EB' }
          },
          y: {
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: textColor, font: { size: 11 },
              callback: v => '$' + (v>=1000 ? (v/1000).toFixed(0)+'k' : v)
            },
            border: { display: false }
          }
        }
      }
    });
  },

  // ── Alerts F2 ───────────────────────────────────────────
  renderAlerts(data, container) {
    const alerts = data.table?.rows || data.alerts || [];
    container.innerHTML = `
      <div class="nbic-section-header">
        <div>
          <div class="nbic-section-title">Panel de Alertas</div>
          <div class="nbic-section-subtitle">${alerts.length} alertas activas</div>
        </div>
        <div class="nbic-section-actions">
          ${this.renderCompleteness(data.meta)}
        </div>
      </div>
      <div class="nbic-card">
        <div class="nbic-alert-feed">
          ${this.renderAlertItems(alerts.length ? alerts : (data.alerts||[]))}
        </div>
      </div>`;
  },

  // ── Expenses by Category C2 ─────────────────────────────
  renderExpensesByCategory(data, container) {
    const rows = data.by_category || [];
    const total = rows.reduce((a,r) => a + (parseFloat(r.total)||0), 0);
    container.innerHTML = `
      <div class="nbic-section-header">
        <div>
          <div class="nbic-section-title">Gastos por Categoría</div>
          <div class="nbic-section-subtitle">RPT-C2 · ${rows.length} categorías</div>
        </div>
        <div class="nbic-section-actions">
          <span class="nbic-completeness nbic-completeness--full">
            <div class="nbic-completeness__dot"></div>Buildable
          </span>
        </div>
      </div>

      <!-- KPIs -->
      <div class="nbic-kpi-grid nbic-kpi-grid--3" style="margin-bottom:16px">
        <div class="nbic-kpi-card">
          <div class="nbic-kpi-card__header"><span class="nbic-kpi-card__label">Total Gastos</span></div>
          <div class="nbic-kpi-card__value nbic-mono">${NBICFmt.currency(total)}</div>
        </div>
        <div class="nbic-kpi-card">
          <div class="nbic-kpi-card__header"><span class="nbic-kpi-card__label">Categorías</span></div>
          <div class="nbic-kpi-card__value nbic-mono">${rows.length}</div>
        </div>
        <div class="nbic-kpi-card">
          <div class="nbic-kpi-card__header"><span class="nbic-kpi-card__label">Mayor Categoría</span></div>
          <div class="nbic-kpi-card__value nbic-mono">${rows[0] ? NBICFmt.currency(rows[0].total) : '—'}</div>
        </div>
      </div>

      <div class="nbic-grid-8-4">
        <div class="nbic-card">
          <div class="nbic-card__header"><div class="nbic-card__title">Distribución de Gastos</div></div>
          <div class="nbic-card__body">
            <canvas id="nbic-expense-chart" height="280"></canvas>
          </div>
        </div>
        <div class="nbic-card">
          <div class="nbic-card__header"><div class="nbic-card__title">Por Categoría</div></div>
          <div class="nbic-card__body--no-pad">
            ${rows.map(r => {
              const pct = total > 0 ? (parseFloat(r.total)/total*100).toFixed(1) : 0;
              return `<div style="padding:10px 16px;border-bottom:1px solid var(--nbic-border-subtle);display:flex;align-items:center;gap:12px;cursor:pointer"
                onclick="NBICDrilldown.open('expenses','category','${r.category_key}')">
                <div style="flex:1;font-size:13px;color:var(--nbic-text-primary)">${r.name||r.category_key}</div>
                <div style="font-family:var(--nbic-font-mono);font-size:13px">${NBICFmt.currency(r.total)}</div>
                <div style="font-family:var(--nbic-font-mono);font-size:11px;color:var(--nbic-text-tertiary)">${pct}%</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
    setTimeout(() => this.drawExpenseChart(rows, total), 50);
  },

  drawExpenseChart(rows, total) {
    const canvas = document.getElementById('nbic-expense-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const colors = ['rgba(59,130,246,0.8)','rgba(16,185,129,0.8)','rgba(245,158,11,0.8)','rgba(239,68,68,0.8)','rgba(139,92,246,0.8)','rgba(236,72,153,0.8)'];
    const textColor = isDark ? '#6B7280' : '#71717A';
    const gridColor = isDark ? 'rgba(34,38,45,0.6)' : 'rgba(229,231,235,0.6)';
    if (canvas._chart) canvas._chart.destroy();
    canvas._chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.name || r.category_key),
        datasets: [{
          data: rows.map(r => parseFloat(r.total)||0),
          backgroundColor: rows.map((_, i) => colors[i % colors.length]),
          borderRadius: 2, borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#111316' : '#fff',
            borderColor: isDark ? '#2D323A' : '#D1D5DB',
            borderWidth: 1,
            titleColor: textColor,
            bodyColor: isDark ? '#E8EAED' : '#09090B',
            bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
            callbacks: { label: ctx => `$${Number(ctx.parsed.x).toLocaleString()} · ${total > 0 ? (ctx.parsed.x/total*100).toFixed(1) : 0}%` }
          }
        },
        scales: {
          y: { grid: { display: false }, ticks: { color: textColor, font: { size: 12 } }, border: { display: false } },
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 }, callback: v => '$' + (v>=1000?(v/1000).toFixed(0)+'k':v) },
            border: { display: false }
          }
        }
      }
    });
  },

  // ── Generic Report Renderer ─────────────────────────────
  renderGeneric(data, container, route) {
    const meta     = data.meta     || {};
    const kpis     = data.kpis     || [];
    const table    = data.table    || { columns: [], rows: [] };
    const warnings = meta.warnings || [];
    const score    = meta.completeness_score || 0;

    if (score < 0.10 && table.rows && table.rows.length === 0) {
      container.innerHTML = `
        <div class="nbic-section-header">
          <div>
            <div class="nbic-section-title">${route.title}</div>
            <div class="nbic-section-subtitle">RPT-${NBICRouter.current.toUpperCase()}</div>
          </div>
          ${this.renderCompleteness(meta)}
        </div>
        <div class="nbic-blocked">
          <div class="nbic-blocked__title">Reporte bloqueado</div>
          <p style="font-size:13px;color:var(--nbic-text-secondary)">Este reporte requiere datos que aún no están disponibles:</p>
          <ul class="nbic-blocked__list">
            ${warnings.map(w => `<li>${w}</li>`).join('')}
            ${!warnings.length ? '<li>Completar el flujo operativo (booking_id, payment_method, bank_statements)</li>' : ''}
          </ul>
          <a href="/fleet.html" class="nbic-btn nbic-btn--outline" style="width:fit-content">Ir a Gestión de Flota</a>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="nbic-section-header">
        <div>
          <div class="nbic-section-title">${route.title}</div>
          <div class="nbic-section-subtitle">${meta.row_count || 0} registros · actualizado ${meta.data_freshness ? NBICFmt.date(meta.data_freshness) : 'ahora'}</div>
        </div>
        ${this.renderCompleteness(meta)}
      </div>

      ${warnings.length ? `
        <div style="background:var(--nbic-warning-bg);border:1px solid var(--nbic-warning);border-radius:var(--nbic-r-md);padding:var(--nbic-sp3) var(--nbic-sp4);margin-bottom:16px;font-size:13px;color:var(--nbic-warning)">
          ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length-1} más)` : ''}
        </div>` : ''}

      ${kpis.length ? `
        <div class="nbic-kpi-grid nbic-kpi-grid--4" style="margin-bottom:16px">
          ${kpis.slice(0,4).map(k => this.renderKPICard(k)).join('')}
        </div>` : ''}

      <div class="nbic-card">
        <div class="nbic-card__body--no-pad">
          ${this.renderBookingsTable(table)}
        </div>
      </div>`;
  },
};

// ── Drilldown Panel ─────────────────────────────────────────
const NBICDrilldown = {
  open(reportCode, entityType, entityId) {
    const backdrop = document.getElementById('nbic-drilldown-backdrop');
    const panel    = document.getElementById('nbic-drilldown-panel');
    const title    = document.getElementById('nbic-drilldown-title');
    const body     = document.getElementById('nbic-drilldown-body');
    if (!backdrop || !panel) return;

    title.textContent = `${entityType.charAt(0).toUpperCase()+entityType.slice(1)} · ${entityId}`;
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
      ${Array(3).fill(0).map(()=>`<div class="nbic-skeleton nbic-skeleton--row"></div>`).join('')}
    </div>`;

    backdrop.classList.add('open');
    panel.style.display = 'flex';

    // Fetch detail
    this.loadDetail(reportCode, entityType, entityId, body);
  },
  async loadDetail(reportCode, entityType, entityId, body) {
    try {
      let url = '';
      if (entityType === 'booking' && entityId)
        url = `/api/bookings/${entityId}`;
      else if (entityType === 'category')
        url = `/api/accounting/expenses/drilldown?category_key=${entityId}&${NBICFilters.getParams()}`;
      else if (entityType === 'kpi')
        url = `/api/nbic/executive/kpis?${NBICFilters.getParams()}`;

      if (!url) {
        body.innerHTML = `<div class="nbic-empty"><p class="nbic-empty__title">Sin detalle disponible para este elemento.</p></div>`;
        return;
      }

      const res  = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      body.innerHTML = this.renderDetail(entityType, data);
    } catch(err) {
      body.innerHTML = `<div class="nbic-empty"><p class="nbic-empty__title">Error cargando detalle</p><p class="nbic-empty__sub">${err.message}</p></div>`;
    }
  },
  renderDetail(entityType, data) {
    if (entityType === 'booking') {
      const b = data.booking || data;
      if (!b || !b.id) return `<div class="nbic-empty"><p class="nbic-empty__title">Booking no encontrado</p></div>`;
      const fields = [
        ['ID', b.id], ['Cliente', b.customer_name], ['Plataforma', b.platform],
        ['Fecha', NBICFmt.date(b.booking_date)], ['Monto', NBICFmt.currency(b.total_amount)],
        ['Status', b.status], ['Barco', b.boat_id||'Sin asignar'], ['Duración', b.duration_hours ? `${b.duration_hours}h` : '—'],
        ['Método de Pago', b.payment_method||'—'], ['Vendedor', b.sold_by_name||'—'],
      ];
      return `<div style="display:grid;gap:1px;background:var(--nbic-border-subtle);border:1px solid var(--nbic-border-subtle);border-radius:var(--nbic-r-md);overflow:hidden">
        ${fields.map(([k,v]) => `
          <div style="display:flex;justify-content:space-between;padding:10px 16px;background:var(--nbic-bg-card)">
            <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.07em;color:var(--nbic-text-tertiary)">${k}</span>
            <span style="font-size:13px;font-family:var(--nbic-font-mono);color:var(--nbic-text-primary)">${v||'—'}</span>
          </div>`).join('')}
      </div>`;
    }
    if (entityType === 'category') {
      const rows = data.transactions || data.rows || [];
      return `<div class="nbic-table-wrap"><table class="nbic-table">
        <thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Monto</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td class="date">${NBICFmt.date(r.transaction_date)}</td>
          <td>${r.description||'—'}</td>
          <td class="num">${NBICFmt.currency(r.amount)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
    return `<pre style="font-size:11px;font-family:var(--nbic-font-mono);color:var(--nbic-text-tertiary);overflow:auto">${JSON.stringify(data,null,2)}</pre>`;
  },
  close() {
    document.getElementById('nbic-drilldown-backdrop')?.classList.remove('open');
    const panel = document.getElementById('nbic-drilldown-panel');
    if (panel) panel.style.display = 'none';
  },
  init() {
    document.getElementById('nbic-drilldown-backdrop')?.addEventListener('click', () => this.close());
    document.getElementById('nbic-drilldown-close')?.addEventListener('click', () => this.close());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
  }
};

// ── Command Palette ─────────────────────────────────────────
const NBICCommandPalette = {
  isOpen: false,
  focusIdx: 0,
  items: [],
  fuse: null,

  buildItems() {
    this.items = [
      ...Object.entries(NBICRouter.routes).map(([id, r]) => ({
        type: 'report', id, label: `${id.toUpperCase()} · ${r.title}`, category: r.domain,
        action: () => NBICRouter.navigate(id)
      })),
      { type: 'action', id: 'theme', label: 'Cambiar tema', category: 'Acción', action: () => NBICTheme.toggle() },
      { type: 'action', id: 'refresh', label: 'Refrescar datos', category: 'Acción', action: () => NBICReports.reload() },
      { type: 'action', id: 'fleet', label: 'Ir a Gestión de Flota', category: 'Navegación', action: () => window.location='/fleet.html' },
      { type: 'action', id: 'accounting', label: 'Ir a Contabilidad', category: 'Navegación', action: () => window.location='/accounting.html' },
      { type: 'action', id: 'dashboard', label: 'Ir al Dashboard', category: 'Navegación', action: () => window.location='/dashboard.html' },
    ];
    if (typeof Fuse !== 'undefined') {
      this.fuse = new Fuse(this.items, { keys: ['label','category'], threshold: 0.4 });
    }
  },

  open() {
    document.getElementById('nbic-cmd-backdrop')?.classList.add('open');
    document.getElementById('nbic-cmd-input')?.focus();
    this.render('');
    this.isOpen = true;
  },
  close() {
    document.getElementById('nbic-cmd-backdrop')?.classList.remove('open');
    this.isOpen = false;
    this.focusIdx = 0;
  },
  render(query) {
    const results = document.getElementById('nbic-cmd-results');
    if (!results) return;
    let items;
    if (!query) {
      items = this.items.slice(0, 10);
    } else if (this.fuse) {
      items = this.fuse.search(query).slice(0,10).map(r => r.item);
    } else {
      const q = query.toLowerCase();
      items = this.items.filter(i => i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)).slice(0,10);
    }
    this.focusIdx = 0;
    results.innerHTML = items.length ? items.map((item, i) => `
      <div class="nbic-cmd-item ${i===0?'focused':''}" data-idx="${i}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          ${item.type==='report'
            ? '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h4"/>'
            : '<path d="M5 12h14M12 5l7 7-7 7"/>'}
        </svg>
        <span class="nbic-cmd-item__label">${item.label}</span>
        <span class="nbic-cmd-item__category">${item.category}</span>
      </div>`).join('') : `<div class="nbic-empty" style="padding:32px"><p class="nbic-empty__title">Sin resultados</p></div>`;

    results.querySelectorAll('.nbic-cmd-item').forEach((el, i) => {
      el.addEventListener('click', () => { items[i].action(); this.close(); });
      el.addEventListener('mouseenter', () => {
        results.querySelectorAll('.nbic-cmd-item').forEach(e => e.classList.remove('focused'));
        el.classList.add('focused');
        this.focusIdx = i;
      });
    });
    this._items = items;
  },
  moveFocus(dir) {
    const items = document.querySelectorAll('.nbic-cmd-item');
    if (!items.length) return;
    items[this.focusIdx]?.classList.remove('focused');
    this.focusIdx = (this.focusIdx + dir + items.length) % items.length;
    items[this.focusIdx]?.classList.add('focused');
    items[this.focusIdx]?.scrollIntoView({ block: 'nearest' });
  },
  selectFocused() {
    if (this._items && this._items[this.focusIdx]) {
      this._items[this.focusIdx].action();
      this.close();
    }
  },
  init() {
    this.buildItems();
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); this.isOpen ? this.close() : this.open(); return; }
      if (!this.isOpen) return;
      if (e.key === 'Escape')    { this.close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.moveFocus(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this.moveFocus(-1); return; }
      if (e.key === 'Enter')     { e.preventDefault(); this.selectFocused(); return; }
    });
    document.getElementById('nbic-cmd-backdrop')?.addEventListener('click', e => {
      if (e.target === document.getElementById('nbic-cmd-backdrop')) this.close();
    });
    document.getElementById('nbic-cmd-input')?.addEventListener('input', e => {
      this.render(e.target.value);
    });
    document.getElementById('nbic-cmd-trigger')?.addEventListener('click', () => this.open());
    // Shortcuts: ⌘1–⌘8
    const shortcuts = { '1':'f1','2':'a1','3':'b1','4':'c1','5':'d1','6':'e1','7':'f2','8':'f3' };
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && shortcuts[e.key]) {
        e.preventDefault();
        NBICRouter.navigate(shortcuts[e.key]);
      }
    });
  }
};

// ── Toast ───────────────────────────────────────────────────
const NBICToast = {
  show(msg, type = 'default', label = '') {
    const container = document.getElementById('nbic-toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `nbic-toast ${type === 'error' ? 'nbic-toast--error' : type === 'success' ? 'nbic-toast--success' : ''}`;
    t.style.borderLeftColor = type === 'error' ? 'var(--nbic-danger)' : type === 'success' ? 'var(--nbic-success)' : 'var(--nbic-accent)';
    t.innerHTML = `
      ${label ? `<div class="nbic-toast__label">${label}</div>` : ''}
      <div class="nbic-toast__msg">${msg}</div>`;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 300ms'; setTimeout(() => t.remove(), 300); }, type === 'error' ? 8000 : 4000);
  }
};

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  NBICTheme.init();
  NBICSidebar.init();
  NBICFilters.init();
  NBICCommandPalette.init();
  NBICDrilldown.init();
  NBICRouter.init();
  // Desktop warning
  if (window.innerWidth < 1024) {
    const warn = document.getElementById('nbic-desktop-warning');
    if (warn) warn.style.display = 'flex';
  }
});
