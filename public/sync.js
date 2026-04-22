/* ============================================================
   sync.js — Sincronización de Plataformas
   Nadaki Excursions Portal
   ============================================================ */

(function () {
  'use strict';

  /* ── Utils ── */
  function fmt(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('es', {
      timeZone: 'America/Puerto_Rico',
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function fmtRelative(ts) {
    if (!ts) return '—';
    const diff = Math.round((Date.now() - new Date(ts)) / 1000);
    if (diff < 60)  return 'hace ' + diff + 's';
    if (diff < 3600) return 'hace ' + Math.round(diff / 60) + 'min';
    if (diff < 86400) return 'hace ' + Math.round(diff / 3600) + 'h';
    return 'hace ' + Math.round(diff / 86400) + 'd';
  }

  function toast(msg, type = 'info') {
    const existing = document.querySelector('.sync-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = `sync-toast sync-toast--${type}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('data-testid', 'sync-toast');
    el.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 7000);
  }

  function statusBadge(status) {
    const map = {
      success:    { cls: 'success',  label: 'OK' },
      error:      { cls: 'error',    label: 'Error' },
      pending:    { cls: 'pending',  label: 'Pendiente' },
      processing: { cls: 'running',  label: 'Procesando' },
      running:    { cls: 'running',  label: 'Ejecutando' },
      failed:     { cls: 'error',    label: 'Fallido' },
      completed:  { cls: 'success',  label: 'Completado' },
    };
    const s = map[status] || { cls: 'pending', label: status || 'Desconocido' };
    return `<span class="badge badge--${s.cls}"><span class="badge-dot"></span>${s.label}</span>`;
  }

  function jobTypeLbl(t) {
    const m = { block_date: 'Bloquear fecha', unblock_date: 'Desbloquear fecha', update_price: 'Actualizar precio' };
    return m[t] || t;
  }

  /* ── State ── */
  let _syncStatus = [];
  let _conflicts  = [];
  let _jobStats   = { pending: 0, processing: 0, completed: 0, failed: 0 };
  let _jobs       = [];
  let _loading    = true;

  /* ── Fetch API helpers ── */
  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function loadAll() {
    _loading = true;
    renderLoadingState();
    try {
      const [status, conflicts, jobs, stats] = await Promise.all([
        api('GET', '/api/sync/status'),
        api('GET', '/api/sync/conflicts'),
        api('GET', '/api/sync/jobs?limit=30'),
        api('GET', '/api/sync/jobs/stats'),
      ]);
      _syncStatus = status || [];
      _conflicts  = conflicts || [];
      _jobs       = jobs || [];
      _jobStats   = stats || { pending: 0, processing: 0, completed: 0, failed: 0 };
      _loading    = false;
      render();
    } catch (err) {
      _loading = false;
      renderError(err.message);
    }
  }

  /* ── Actions ── */
  async function syncAll() {
    const btn = document.getElementById('btn-sync-all');
    if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }
    try {
      const r = await api('POST', '/api/sync/trigger-all');
      const s = r.summary || {};
      await loadAll();
      const msg = `Sync completo: ${s.success || 0} OK, ${s.errors || 0} errores`;
      // Persistent status label (for accessibility + testability)
      const statusLabel = document.getElementById('sync-status-label');
      if (statusLabel) {
        statusLabel.textContent = msg;
        statusLabel.dataset.syncResult = s.errors ? 'error' : 'success';
        statusLabel.style.display = 'inline-flex';
      }
      toast(msg, s.errors ? 'error' : 'success');
    } catch (e) {
      toast('Error al sincronizar: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar Todo'; }
    }
  }

  async function syncPlatform(platform, btnEl) {
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }
    try {
      await api('POST', `/api/sync/trigger/${encodeURIComponent(platform)}`);
      toast(`${platform} sincronizado`, 'success');
      await loadAll();
    } catch (e) {
      toast(`Error: ${e.message}`, 'error');
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Sync Ahora'; }
    }
  }

  async function retryFailed() {
    const btn = document.getElementById('btn-retry-failed');
    if (btn) { btn.disabled = true; btn.textContent = 'Reintentando...'; }
    try {
      const r = await api('POST', '/api/sync/jobs/retry-failed');
      toast(`${r.retriedCount || 0} jobs encolados para reintento`, 'info');
      await loadAll();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Reintentar Fallidos'; }
    }
  }

  async function processQueue() {
    const btn = document.getElementById('btn-process-queue');
    if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }
    try {
      await api('POST', '/api/sync/jobs/process');
      toast('Cola procesada', 'success');
      setTimeout(loadAll, 1200);
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Procesar Cola'; }
    }
  }

  async function resolveConflict(bookingId, btnEl) {
    if (!confirm(`¿Cancelar la reserva ${bookingId}? Esta acción no se puede deshacer.`)) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Cancelando...'; }
    try {
      await api('POST', '/api/sync/resolve-conflict', { bookingIdToCancel: bookingId, reason: 'Conflicto de sincronización resuelto manualmente' });
      toast('Conflicto resuelto — reserva cancelada', 'success');
      await loadAll();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Cancelar'; }
    }
  }

  /* ── Render: Loading ── */
  function renderLoadingState() {
    const grid = document.getElementById('platform-grid');
    if (grid) grid.innerHTML = `<div class="spinner-wrap" style="grid-column:1/-1"><div class="spinner"></div> Cargando plataformas...</div>`;
    const conf = document.getElementById('conflicts-list');
    if (conf) conf.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div> Cargando...</div>`;
    const jobs = document.getElementById('jobs-table');
    if (jobs) jobs.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div> Cargando...</div>`;
  }

  /* ── Render: Error ── */
  function renderError(msg) {
    const grid = document.getElementById('platform-grid');
    if (grid) grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;color:var(--red)">Error al cargar datos: ${msg}</div>`;
  }

  /* ── Render: Main ── */
  function render() {
    renderStats();
    renderPlatformGrid();
    renderConflicts();
    renderJobsSection();
  }

  /* ── KPI stats ── */
  function renderStats() {
    const ok       = _syncStatus.filter(p => p.sync_status === 'success').length;
    const total    = _syncStatus.length;
    const synced   = _syncStatus.reduce((a, p) => a + (p.bookings_synced || 0), 0);
    const confN    = _conflicts.length;
    const queue    = (_jobStats.pending || 0) + (_jobStats.processing || 0);

    const el = document.getElementById('sync-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-card stat-card--green">
        <div class="stat-card__label">Plataformas OK</div>
        <div class="stat-card__value">${ok}<span style="font-size:16px;color:var(--text-3)">/${total}</span></div>
        <div class="stat-card__sub">Todas las plataformas activas</div>
      </div>
      <div class="stat-card stat-card--blue">
        <div class="stat-card__label">Reservas Sincronizadas</div>
        <div class="stat-card__value">${synced}</div>
        <div class="stat-card__sub">Total acumulado</div>
      </div>
      <div class="stat-card stat-card--red">
        <div class="stat-card__label">Conflictos Activos</div>
        <div class="stat-card__value">${confN}</div>
        <div class="stat-card__sub">${confN === 0 ? 'Sin conflictos detectados' : 'Requieren atención manual'}</div>
      </div>
      <div class="stat-card stat-card--orange">
        <div class="stat-card__label">Jobs en Cola</div>
        <div class="stat-card__value">${queue}</div>
        <div class="stat-card__sub">${_jobStats.completed || 0} completados / ${_jobStats.failed || 0} fallidos</div>
      </div>
    `;
  }

  /* ── Platform Grid ── */
  function renderPlatformGrid() {
    const el = document.getElementById('platform-grid');
    if (!el) return;

    if (_syncStatus.length === 0) {
      el.innerHTML = `<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--text-3)">Sin datos de plataformas. Ejecuta una sincronización para comenzar.</div>`;
      return;
    }

    el.innerHTML = _syncStatus.map(p => `
      <div class="platform-card" data-platform="${p.platform}">
        <div class="platform-card__top">
          <span class="platform-card__name">${p.platform}</span>
          ${statusBadge(p.sync_status)}
        </div>
        <div class="platform-card__meta">
          <div class="platform-meta-item">
            <span class="platform-meta-item__label">Última sync</span>
            <span class="platform-meta-item__value" title="${fmt(p.last_sync_at)}">${fmtRelative(p.last_sync_at)}</span>
          </div>
          <div class="platform-meta-item">
            <span class="platform-meta-item__label">Próxima sync</span>
            <span class="platform-meta-item__value">${fmt(p.next_sync_at)}</span>
          </div>
        </div>
        <div class="platform-card__footer">
          <div class="platform-card__counts">
            <span class="count-item"><span class="count-item__n">${p.bookings_synced || 0}</span>&nbsp;reservas</span>
            ${(p.conflicts_detected || 0) > 0
              ? `<span class="count-item count-item--conflict"><span class="count-item__n">${p.conflicts_detected}</span>&nbsp;conflictos</span>`
              : ''}
          </div>
          <button class="btn-sync-now" data-platform="${p.platform}">Sync Ahora</button>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.btn-sync-now').forEach(btn => {
      btn.addEventListener('click', () => syncPlatform(btn.dataset.platform, btn));
    });
  }

  /* ── Conflicts ── */
  function renderConflicts() {
    const badgeEl = document.getElementById('conflicts-badge');
    if (badgeEl) {
      badgeEl.textContent = _conflicts.length > 0 ? _conflicts.length : '';
      badgeEl.className   = _conflicts.length > 0 ? 'badge badge--count' : '';
    }

    const el = document.getElementById('conflicts-list');
    if (!el) return;

    if (_conflicts.length === 0) {
      el.innerHTML = `
        <div class="conflicts-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p style="font-size:14px;font-weight:600;margin-bottom:4px">Sin conflictos</p>
          <p>No hay solapamientos de reservas detectados en el sistema</p>
        </div>
      `;
      return;
    }

    el.innerHTML = _conflicts.map((c, i) => {
      const [b1, b2] = c.bookings || [];
      return `
        <div class="conflict-card">
          <div class="conflict-card__header">
            <span class="conflict-card__title">Conflicto de horario — Severidad: Alta</span>
            <span class="badge badge--error">Pendiente</span>
          </div>
          <div class="conflict-card__detail">
            ${c.message} — ${c.date ? 'Fecha: ' + c.date : ''} ${c.time ? 'a las ' + c.time : ''}
          </div>
          <div class="conflict-bookings">
            ${b1 ? `
              <div class="conflict-booking-item">
                <div class="conflict-booking-item__platform">${b1.platform || 'Desconocida'}</div>
                <div class="conflict-booking-item__customer">${b1.customer || '—'}</div>
                <div class="conflict-booking-item__id">${b1.id}</div>
              </div>` : ''}
            ${b2 ? `
              <div class="conflict-booking-item">
                <div class="conflict-booking-item__platform">${b2.platform || 'Desconocida'}</div>
                <div class="conflict-booking-item__customer">${b2.customer || '—'}</div>
                <div class="conflict-booking-item__id">${b2.id}</div>
              </div>` : ''}
          </div>
          <div class="conflict-actions">
            ${b1 ? `<button class="btn btn-sm btn-danger btn-cancel-conflict" data-booking="${b1.id}">Cancelar reserva de ${b1.platform || b1.id}</button>` : ''}
            ${b2 ? `<button class="btn btn-sm btn-danger btn-cancel-conflict" data-booking="${b2.id}">Cancelar reserva de ${b2.platform || b2.id}</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.btn-cancel-conflict').forEach(btn => {
      btn.addEventListener('click', () => resolveConflict(btn.dataset.booking, btn));
    });
  }

  /* ── Jobs section ── */
  function renderJobsSection() {
    const statsEl = document.getElementById('jobs-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="jobs-stats-row">
          <div class="job-stat-pill"><span class="job-stat-pill__n job-stat-pill__n--green">${_jobStats.completed || 0}</span><span class="job-stat-pill__label">Completados</span></div>
          <div class="job-stat-pill"><span class="job-stat-pill__n job-stat-pill__n--yellow">${_jobStats.pending || 0}</span><span class="job-stat-pill__label">Pendientes</span></div>
          <div class="job-stat-pill"><span class="job-stat-pill__n job-stat-pill__n--blue">${_jobStats.processing || 0}</span><span class="job-stat-pill__label">Procesando</span></div>
          <div class="job-stat-pill"><span class="job-stat-pill__n job-stat-pill__n--red">${_jobStats.failed || 0}</span><span class="job-stat-pill__label">Fallidos</span></div>
        </div>
      `;
    }

    const tableEl = document.getElementById('jobs-table');
    if (!tableEl) return;

    if (_jobs.length === 0) {
      tableEl.innerHTML = `<div class="jobs-empty">Sin jobs en el historial.</div>`;
      return;
    }

    tableEl.innerHTML = `
      <table class="jobs-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Plataforma</th>
            <th>Estado</th>
            <th class="td-attempts">Intentos</th>
            <th>Creado</th>
            <th>Completado</th>
          </tr>
        </thead>
        <tbody>
          ${_jobs.map(j => `
            <tr>
              <td class="td-type">${jobTypeLbl(j.job_type)}</td>
              <td class="td-platform">${j.target_platform}</td>
              <td>${statusBadge(j.status)}</td>
              <td class="td-attempts">${j.attempts}/${j.max_attempts}</td>
              <td class="td-ts">${fmtRelative(j.created_at)}</td>
              <td class="td-ts">${j.completed_at ? fmtRelative(j.completed_at) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /* ── Init ── */
  function init() {
    const btnSyncAll   = document.getElementById('btn-sync-all');
    const btnRetry     = document.getElementById('btn-retry-failed');
    const btnRefresh   = document.getElementById('btn-refresh');
    const btnProcess   = document.getElementById('btn-process-queue');

    if (btnSyncAll)  btnSyncAll.addEventListener('click', syncAll);
    if (btnRetry)    btnRetry.addEventListener('click', retryFailed);
    if (btnRefresh)  btnRefresh.addEventListener('click', () => { toast('Actualizando...', 'info'); loadAll(); });
    if (btnProcess)  btnProcess.addEventListener('click', processQueue);

    loadAll();

    setInterval(loadAll, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
