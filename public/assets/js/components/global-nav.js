/* ============================================================
   Global Navigation Component — Nadaki Excursions Portal
   v1.0 | 2026-04-21
   Self-injecting — include before </body> in every page
   ============================================================ */

(function () {
  'use strict';

  /* ── Navigation config ── */
  const NAV_CONFIG = [
    {
      id: 'operaciones',
      label: 'Operaciones',
      pages: ['/schedule.html', '/fleet.html', '/messages.html', '/operations.html', '/marine-conditions.html'],
      items: [
        { label: 'Fleet Operations Center', href: '/fleet.html#foc',            icon: '🗓️', testid: 'nav-foc' },
        { label: 'Calendario Semanal',       href: '/schedule.html',             icon: '📋', testid: 'nav-schedule' },
        { label: 'Mensajes',                 href: '/messages.html',             icon: '💬', testid: 'nav-messages' },
        { label: 'Tareas',                   href: '/operations.html',           icon: '✅', testid: 'nav-operations' },
        { label: 'Condiciones Marinas',      href: '/marine-conditions.html',    icon: '🌊', testid: 'nav-marine' },
      ]
    },
    {
      id: 'flota',
      label: 'Flota',
      pages: ['/fleet.html', '/boat-maintenance.html', '/fuel-tracker.html', '/crew.html', '/assets.html'],
      items: [
        { label: 'Gestión de Barcos',  href: '/fleet.html#barcos',          icon: '⛵', testid: 'nav-boats' },
        { label: 'Mantenimiento',      href: '/boat-maintenance.html',      icon: '🔧', testid: 'nav-maintenance' },
        { label: 'Combustible',        href: '/fuel-tracker.html',          icon: '⛽', testid: 'nav-fuel' },
        { label: 'Tripulación',        href: '/crew.html',                  icon: '👥', testid: 'nav-crew' },
        { label: 'Activos',            href: '/assets.html',                icon: '📦', testid: 'nav-assets' },
      ]
    },
    {
      id: 'finanzas',
      label: 'Finanzas',
      pages: ['/reports.html', '/accounting.html', '/commissions.html', '/executive.html'],
      items: [
        { label: 'NBIC Analytics',        href: '/reports.html',                        icon: '📊', testid: 'nav-nbic' },
        { label: 'Contabilidad',          href: '/accounting.html',                     icon: '🏦', testid: 'nav-accounting' },
        { label: 'Conciliación Bancaria', href: '/accounting.html#reconciliation',      icon: '🔀', testid: 'nav-conciliacion' },
        { label: 'Análisis Ingresos',     href: '/accounting.html#ingresos-analisis',   icon: '📈', testid: 'nav-ingresos' },
        { label: 'Análisis Gastos',       href: '/accounting.html#gastos-analisis',     icon: '📉', testid: 'nav-gastos' },
        { label: 'Comisiones',            href: '/commissions.html',                    icon: '💸', testid: 'nav-commissions' },
        { label: 'Gastos Recurrentes',    href: '/fleet.html#gastos-recurrentes',       icon: '🔁', testid: 'nav-recurrentes' },
        { label: 'Depósitos',             href: '/accounting.html#deposits',            icon: '🧾', testid: 'nav-depositos' },
      ]
    },
    {
      id: 'comercial',
      label: 'Comercial',
      pages: ['/pricing.html', '/dynamic-pricing.html', '/sync.html', '/documents.html'],
      items: [
        { label: 'Precios',                      href: '/pricing.html',         icon: '💲', testid: 'nav-pricing' },
        { label: 'Pricing Dinámico',             href: '/dynamic-pricing.html', icon: '📈', testid: 'nav-dynamic-pricing' },
        { label: 'Sincronización Plataformas',   href: '/sync.html',            icon: '🔄', testid: 'nav-sync' },
        { label: 'Documentos',                   href: '/documents.html',       icon: '📁', testid: 'nav-documents' },
      ]
    },
  ];

  /* ── Detect active section ── */
  function getActiveSection () {
    const path = window.location.pathname;
    for (const group of NAV_CONFIG) {
      if (group.pages.some(p => path.endsWith(p.replace(/^\//, '')))) {
        return group.id;
      }
    }
    return null;
  }

  function isDashboard () {
    const p = window.location.pathname;
    return p === '/' || p.endsWith('/dashboard.html') || p.endsWith('/index.html');
  }

  /* ── Icon SVGs ── */
  const ICONS = {
    caret: `<svg class="gnav-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`,
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    bell: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    gear: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    logout: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    captain: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    home: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    logo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l3-7 6 4 6-8 3 11H3z"/><path d="M3 21h18"/></svg>`,
  };

  /* ── Build dropdown HTML ── */
  function buildDropdown(group, activeSection) {
    const items = group.items.map(item => {
      const isActive = window.location.pathname.endsWith(item.href.split('#')[0].replace(/^\//, '')) &&
                       (!item.href.includes('#') || window.location.hash === '#' + item.href.split('#')[1]);
      return `<a href="${item.href}"
                 class="gnav-dd-item${isActive ? ' gnav-dd-item--active' : ''}"
                 data-testid="${item.testid}"
                 role="menuitem">
                <span class="gnav-dd-icon" aria-hidden="true">${item.icon}</span>
                ${item.label}
              </a>`;
    }).join('');
    return `<div class="gnav-dropdown" role="menu" id="gnav-dd-${group.id}">${items}</div>`;
  }

  /* ── Build config dropdown ── */
  function buildConfigDropdown() {
    return `<div class="gnav-dropdown gnav-dropdown--right" role="menu" id="gnav-dd-config">
      <div class="gnav-dd-section">Sistema</div>
      <a href="/captain.html" class="gnav-dd-item" data-testid="nav-captain-portal" role="menuitem">
        <span class="gnav-dd-icon" aria-hidden="true">${ICONS.captain}</span>
        Portal del Capitán
      </a>
      <div class="gnav-dd-sep"></div>
      <div class="gnav-dd-section">Sesión</div>
      <a href="/api/logout" class="gnav-dd-item gnav-dd-item--danger" data-testid="nav-logout" role="menuitem">
        <span class="gnav-dd-icon" aria-hidden="true">${ICONS.logout}</span>
        Cerrar Sesión
      </a>
    </div>`;
  }

  /* ── Build full navbar HTML ── */
  function buildNav() {
    const activeSection = getActiveSection();
    const dashActive = isDashboard();

    // Logo
    const logo = `<a href="/dashboard.html" class="gnav-logo" data-testid="nav-logo" aria-label="Nadaki Excursions — Inicio">
      <div class="gnav-logo__icon" aria-hidden="true">${ICONS.logo}</div>
      <div class="gnav-logo__text">
        <span class="gnav-logo__name">Nadaki</span>
        <span class="gnav-logo__sub">Excursions</span>
      </div>
    </a>`;

    // Divider
    const divider = `<div class="gnav-divider" aria-hidden="true"></div>`;

    // Dashboard item
    const dashBtn = `<div class="gnav-item gnav-item--dashboard">
      <a href="/dashboard.html"
         class="gnav-btn${dashActive ? ' gnav-btn--active' : ''}"
         data-testid="nav-dashboard"
         aria-current="${dashActive ? 'page' : 'false'}">
        Dashboard
      </a>
    </div>`;

    // Dropdown items
    const dropdowns = NAV_CONFIG.map(group => {
      const isActive = activeSection === group.id;
      return `<div class="gnav-item" role="none" id="gnav-item-${group.id}">
        <button class="gnav-btn${isActive ? ' gnav-btn--active' : ''}"
                data-testid="nav-btn-${group.id}"
                aria-haspopup="true"
                aria-expanded="false"
                aria-controls="gnav-dd-${group.id}">
          ${group.label}
          ${ICONS.caret}
        </button>
        ${buildDropdown(group, activeSection)}
      </div>`;
    }).join('');

    // Right zone
    const right = `<div class="gnav-right" role="none">
      <!-- ⌘K Search -->
      <button class="gnav-search-btn" id="gnav-cmdpal-trigger" data-testid="nav-search" aria-label="Búsqueda global (⌘K)" title="Búsqueda global">
        ${ICONS.search}
        <span>Buscar</span>
        <kbd>⌘K</kbd>
      </button>

      <!-- Alerts -->
      <button class="gnav-icon-btn" id="gnav-alerts-btn" data-testid="nav-alerts" aria-label="Alertas" title="Alertas">
        ${ICONS.bell}
        <span class="gnav-badge" id="gnav-alerts-badge" style="display:none">0</span>
      </button>

      <!-- Config dropdown -->
      <div class="gnav-item" role="none" id="gnav-item-config">
        <button class="gnav-icon-btn" data-testid="nav-config" aria-haspopup="true" aria-expanded="false" aria-controls="gnav-dd-config" aria-label="Configuración" title="Configuración">
          ${ICONS.gear}
        </button>
        ${buildConfigDropdown()}
      </div>
    </div>`;

    return `<nav id="global-nav" role="navigation" aria-label="Navegación principal" data-testid="global-nav">
      ${logo}
      ${divider}
      <div class="gnav-items" role="menubar">
        ${dashBtn}
        ${dropdowns}
      </div>
      ${right}
    </nav>`;
  }

  /* ── Command palette ── */
  function buildCmdPal() {
    const pages = [
      { label: 'Dashboard',                  href: '/dashboard.html',            icon: '📊', cat: 'Páginas' },
      { label: 'Fleet Operations Center',    href: '/fleet.html#foc',            icon: '🗓️', cat: 'Operaciones' },
      { label: 'Calendario Semanal',         href: '/schedule.html',             icon: '📋', cat: 'Operaciones' },
      { label: 'Mensajes',                   href: '/messages.html',             icon: '💬', cat: 'Operaciones' },
      { label: 'Tareas',                     href: '/operations.html',           icon: '✅', cat: 'Operaciones' },
      { label: 'Condiciones Marinas',        href: '/marine-conditions.html',    icon: '🌊', cat: 'Operaciones' },
      { label: 'Gestión de Barcos',          href: '/fleet.html#barcos',         icon: '⛵', cat: 'Flota' },
      { label: 'Mantenimiento',              href: '/boat-maintenance.html',     icon: '🔧', cat: 'Flota' },
      { label: 'Combustible',               href: '/fuel-tracker.html',          icon: '⛽', cat: 'Flota' },
      { label: 'Tripulación',               href: '/crew.html',                  icon: '👥', cat: 'Flota' },
      { label: 'Activos',                   href: '/assets.html',                icon: '📦', cat: 'Flota' },
      { label: 'NBIC Analytics',            href: '/reports.html',               icon: '📊', cat: 'Finanzas' },
      { label: 'Contabilidad',              href: '/accounting.html',            icon: '🏦', cat: 'Finanzas' },
      { label: 'Conciliación Bancaria',     href: '/accounting.html#reconciliation', icon: '🔀', cat: 'Finanzas' },
      { label: 'Análisis Ingresos',         href: '/accounting.html#ingresos-analisis', icon: '📈', cat: 'Finanzas' },
      { label: 'Análisis Gastos',           href: '/accounting.html#gastos-analisis', icon: '📉', cat: 'Finanzas' },
      { label: 'Comisiones',                href: '/commissions.html',           icon: '💸', cat: 'Finanzas' },
      { label: 'Precios',                   href: '/pricing.html',               icon: '💲', cat: 'Comercial' },
      { label: 'Pricing Dinámico',          href: '/dynamic-pricing.html',       icon: '📈', cat: 'Comercial' },
      { label: 'Sincronización Plataformas', href: '/sync.html',                 icon: '🔄', cat: 'Comercial' },
      { label: 'Documentos',               href: '/documents.html',             icon: '📁', cat: 'Comercial' },
    ];

    window.__gnavCmdPages = pages;

    return `<div class="gnav-cmdpal-overlay" id="gnav-cmdpal-overlay" role="dialog" aria-modal="true" aria-label="Búsqueda global">
      <div class="gnav-cmdpal">
        <div class="gnav-cmdpal-input-wrap">
          ${ICONS.search}
          <input id="gnav-cmdpal-input"
                 class="gnav-cmdpal-input"
                 type="text"
                 placeholder="Buscar página, reserva, barco..."
                 autocomplete="off"
                 aria-label="Buscar en el sistema"
                 data-testid="input-cmdpal">
        </div>
        <div class="gnav-cmdpal-results" id="gnav-cmdpal-results" role="listbox"></div>
        <div class="gnav-cmdpal-footer">
          <span><kbd>↑↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>`;
  }

  /* ── Render cmd palette results ── */
  function renderCmdResults(query) {
    const pages = window.__gnavCmdPages || [];
    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? pages.filter(p =>
          p.label.toLowerCase().includes(q) ||
          p.cat.toLowerCase().includes(q) ||
          p.href.toLowerCase().includes(q)
        )
      : pages;

    if (!filtered.length) {
      return `<div style="padding:24px 16px;text-align:center;color:rgba(255,255,255,0.30);font-size:13px;">Sin resultados para "${q}"</div>`;
    }

    // Group by category
    const bycat = {};
    filtered.forEach(p => {
      if (!bycat[p.cat]) bycat[p.cat] = [];
      bycat[p.cat].push(p);
    });

    let html = '';
    for (const [cat, items] of Object.entries(bycat)) {
      if (!q) html += `<div class="gnav-cmdpal-section">${cat}</div>`;
      html += items.map((item, i) =>
        `<div class="gnav-cmdpal-item"
              data-href="${item.href}"
              role="option"
              tabindex="-1"
              data-testid="cmdpal-item-${item.href.replace(/[^a-z0-9]/gi,'-')}">
          <div class="gnav-cmdpal-item__icon">${item.icon}</div>
          <span class="gnav-cmdpal-item__label">${item.label}</span>
          <span class="gnav-cmdpal-item__cat">${item.cat}</span>
        </div>`
      ).join('');
    }
    return html;
  }

  /* ── Dropdown logic ── */
  function closeAllDropdowns() {
    document.querySelectorAll('.gnav-item--open').forEach(el => {
      el.classList.remove('gnav-item--open');
      const btn = el.querySelector('.gnav-btn, .gnav-icon-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleDropdown(itemEl) {
    const wasOpen = itemEl.classList.contains('gnav-item--open');
    closeAllDropdowns();
    if (!wasOpen) {
      itemEl.classList.add('gnav-item--open');
      const btn = itemEl.querySelector('.gnav-btn, .gnav-icon-btn');
      if (btn) {
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('gnav-btn--open');
      }
    }
  }

  /* ── Command palette logic ── */
  let cmdFocusIdx = -1;

  function openCmdPal() {
    const overlay = document.getElementById('gnav-cmdpal-overlay');
    if (!overlay) return;
    overlay.classList.add('gnav-cmdpal--open');
    const input = document.getElementById('gnav-cmdpal-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    cmdFocusIdx = -1;
    const results = document.getElementById('gnav-cmdpal-results');
    if (results) results.innerHTML = renderCmdResults('');
  }

  function closeCmdPal() {
    const overlay = document.getElementById('gnav-cmdpal-overlay');
    if (overlay) overlay.classList.remove('gnav-cmdpal--open');
    cmdFocusIdx = -1;
  }

  function cmdNavItems() {
    return document.querySelectorAll('#gnav-cmdpal-results .gnav-cmdpal-item');
  }

  function cmdSetFocus(idx) {
    const items = cmdNavItems();
    items.forEach(el => el.classList.remove('gnav-cmdpal-item--focused'));
    if (idx < 0 || idx >= items.length) { cmdFocusIdx = -1; return; }
    cmdFocusIdx = idx;
    items[idx].classList.add('gnav-cmdpal-item--focused');
    items[idx].scrollIntoView({ block: 'nearest' });
  }

  function cmdActivateFocused() {
    const items = cmdNavItems();
    if (cmdFocusIdx >= 0 && items[cmdFocusIdx]) {
      const href = items[cmdFocusIdx].dataset.href;
      if (href) window.location.href = href;
    }
  }

  /* ── Inject into DOM ── */
  function inject() {
    // CSS link
    if (!document.getElementById('global-nav-css')) {
      const link = document.createElement('link');
      link.id = 'global-nav-css';
      link.rel = 'stylesheet';
      link.href = '/assets/css/global-nav.css';
      document.head.appendChild(link);
    }

    // Nav element
    if (!document.getElementById('global-nav')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildNav();
      document.body.insertBefore(wrap.firstElementChild, document.body.firstChild);
    }

    // Command palette
    if (!document.getElementById('gnav-cmdpal-overlay')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildCmdPal();
      document.body.appendChild(wrap.firstElementChild);
    }

    /* ── Event listeners ── */

    // Dropdown buttons
    document.querySelectorAll('#global-nav .gnav-item').forEach(itemEl => {
      const btn = itemEl.querySelector('.gnav-btn[aria-haspopup], .gnav-icon-btn[aria-haspopup]');
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(itemEl);
      });
      // Keyboard: Enter / Space open dropdown
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleDropdown(itemEl);
        }
        if (e.key === 'Escape') closeAllDropdowns();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const first = itemEl.querySelector('.gnav-dd-item');
          if (first) first.focus();
        }
      });
    });

    // Keyboard nav inside dropdowns
    document.querySelectorAll('#global-nav .gnav-dropdown').forEach(dd => {
      dd.addEventListener('keydown', (e) => {
        const items = [...dd.querySelectorAll('.gnav-dd-item')];
        const cur = document.activeElement;
        const idx = items.indexOf(cur);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = items[idx + 1] || items[0];
          if (next) next.focus();
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = items[idx - 1] || items[items.length - 1];
          if (prev) prev.focus();
        }
        if (e.key === 'Escape') {
          closeAllDropdowns();
          const parentBtn = dd.previousElementSibling;
          if (parentBtn) parentBtn.focus();
        }
        if (e.key === 'Tab') closeAllDropdowns();
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#global-nav')) closeAllDropdowns();
    });

    // Escape closes all
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllDropdowns();
    });

    // ⌘K trigger
    document.getElementById('gnav-cmdpal-trigger')?.addEventListener('click', openCmdPal);

    // ⌘K / Ctrl+K anywhere
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('gnav-cmdpal-overlay');
        if (overlay?.classList.contains('gnav-cmdpal--open')) {
          closeCmdPal();
        } else {
          openCmdPal();
        }
      }
    });

    // Command palette interaction
    document.getElementById('gnav-cmdpal-input')?.addEventListener('input', (e) => {
      const results = document.getElementById('gnav-cmdpal-results');
      if (results) results.innerHTML = renderCmdResults(e.target.value);
      cmdFocusIdx = -1;
    });

    document.getElementById('gnav-cmdpal-input')?.addEventListener('keydown', (e) => {
      const items = cmdNavItems();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        cmdSetFocus(Math.min(cmdFocusIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cmdSetFocus(Math.max(cmdFocusIdx - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (cmdFocusIdx >= 0) {
          cmdActivateFocused();
        } else if (items.length) {
          const href = items[0].dataset.href;
          if (href) window.location.href = href;
        }
      } else if (e.key === 'Escape') {
        closeCmdPal();
      }
    });

    document.getElementById('gnav-cmdpal-results')?.addEventListener('click', (e) => {
      const item = e.target.closest('.gnav-cmdpal-item');
      if (item?.dataset.href) window.location.href = item.dataset.href;
    });

    // Close palette on overlay click
    document.getElementById('gnav-cmdpal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeCmdPal();
    });

    // Load alert count
    loadAlertCount();
  }

  /* ── Alert count from API ── */
  async function loadAlertCount() {
    try {
      const r = await fetch('/api/fleet/alerts');
      if (!r.ok) return;
      const data = await r.json();
      const count = Array.isArray(data) ? data.filter(a => a.severity === 'critical' || a.severity === 'high').length : 0;
      const badge = document.getElementById('gnav-alerts-badge');
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 9 ? '9+' : count;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (_) { /* silently ignore */ }
  }

  /* ── Hash-based tab activation (for fleet.html) ── */
  function handleHashNavigation() {
    const hash = window.location.hash;
    if (!hash) return;
    const tabMap = {
      '#foc':               'calendar',
      '#barcos':            'boats',
      '#gastos-recurrentes':'recurring-expenses',
    };
    const tabId = tabMap[hash];
    if (!tabId) return;
    // Small delay to let the page initialize
    setTimeout(() => {
      const btn = document.querySelector(`[data-tab="${tabId}"]`);
      if (btn && typeof btn.click === 'function') btn.click();
    }, 120);
  }

  /* ── Handle /accounting.html hash tab switching ── */
  function handleAccountingHash() {
    const hash = window.location.hash.replace('#', '');
    if (!hash || !window.location.pathname.endsWith('accounting.html')) return;
    const tabMap = {
      'reconciliation':     'reconciliation',
      'ingresos-analisis':  'ingresos-analisis',
      'gastos-analisis':    'gastos-analisis',
      'deposits':           'deposits',
    };
    const tabId = tabMap[hash];
    if (!tabId) return;
    setTimeout(() => {
      const btn = document.querySelector(`[data-tab="${tabId}"]`);
      if (btn && typeof btn.click === 'function') btn.click();
    }, 150);
  }

  /* ── Init ── */
  function init() {
    inject();
    handleHashNavigation();
    handleAccountingHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API for external use
  window.GlobalNav = {
    openSearch: openCmdPal,
    closeSearch: closeCmdPal,
    refreshAlerts: loadAlertCount,
  };

})();
