// =====================================================================
// NADAKI EXCURSIONS — OPERATIONS MODULE (FASE 12)
// =====================================================================

// ---- STATE ----
let tasks = [];
let categories = [];
let assignees = [];
let editingTaskId = null;
let editingCatId = null;
let editingAssigneeId = null;
let tlCurrentDate = new Date();
let searchDebounce = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
});

async function loadAll() {
  await Promise.all([loadCategories(), loadAssignees()]);
  populateFilterDropdowns();
  populateFormDropdowns();
  loadStats();
  loadTasks();
}

// =====================================================================
// TABS
// =====================================================================
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  document.querySelector(`[onclick="switchTab('${name}')"]`).classList.add('active');

  if (name === 'resumen') { loadStats(); }
  if (name === 'tareas') { loadTasks(); }
  if (name === 'timeline') { renderTimeline(); }
  if (name === 'categorias') { renderCategories(); }
  if (name === 'responsables') { renderAssignees(); }

  if (window.i18n) window.i18n.apply();
}

// =====================================================================
// STATS / RESUMEN
// =====================================================================
async function loadStats() {
  try {
    const data = await apiFetch('/api/operations/stats');
    const s = data.summary;
    setText('stat-pendiente', s.pendiente || 0);
    setText('stat-en_progreso', s.en_progreso || 0);
    setText('stat-completada', s.completada || 0);
    setText('stat-vencidas', s.vencidas || 0);
    setText('stat-total', s.total || 0);

    // Upcoming
    const ul = document.getElementById('upcoming-list');
    if (!data.upcoming || data.upcoming.length === 0) {
      ul.innerHTML = '<div class="empty-state" style="padding:30px"><p>Sin tareas con fechas próximas</p></div>';
    } else {
      ul.innerHTML = data.upcoming.map(t => {
        const days = daysUntil(t.due_date);
        const urgent = days !== null && days <= 2;
        return `<div class="upcoming-item">
          <div class="upcoming-dot" style="background:${urgent ? '#dc3545' : '#0066cc'}"></div>
          <div class="upcoming-info">
            <div class="upcoming-title">${esc(t.title)}</div>
            <div class="upcoming-meta">${t.assignee_name ? esc(t.assignee_name) + ' · ' : ''}${formatDate(t.due_date)}${days !== null ? ` (${days < 0 ? 'Vencida' : days === 0 ? 'Hoy' : `en ${days} días`})` : ''}</div>
          </div>
          <span class="priority-badge priority-${t.priority}">${t.priority}</span>
        </div>`;
      }).join('');
    }

    // By Category
    const cl = document.getElementById('by-category-list');
    if (!data.byCategory || data.byCategory.length === 0) {
      cl.innerHTML = '<p style="color:#aaa;text-align:center;">Sin categorías</p>';
    } else {
      const max = Math.max(...data.byCategory.map(c => parseInt(c.total) || 0), 1);
      cl.innerHTML = data.byCategory.map(c => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div class="color-dot" style="background:${c.color}"></div>
          <span style="flex:1;font-size:13px;">${esc(c.name)}</span>
          <div style="flex:2;background:#f0f0f0;border-radius:4px;height:8px;">
            <div style="width:${Math.round((parseInt(c.total)||0)/max*100)}%;background:${c.color};height:100%;border-radius:4px;"></div>
          </div>
          <span style="font-size:13px;font-weight:700;min-width:20px;text-align:right;">${c.total}</span>
        </div>
      `).join('');
    }

    // By Assignee
    const al = document.getElementById('by-assignee-list');
    if (!data.byAssignee || data.byAssignee.length === 0) {
      al.innerHTML = '<p style="color:#aaa;text-align:center;">Sin responsables</p>';
    } else {
      al.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
        ${data.byAssignee.map(a => `
          <div class="card" style="padding:14px;">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px;">${esc(a.name)}</div>
            <div style="font-size:12px;color:#888;">Pendientes: <strong style="color:#0066cc;">${a.pendiente}</strong></div>
            <div style="font-size:12px;color:#888;">En progreso: <strong style="color:#fd7e14;">${a.en_progreso}</strong></div>
            <div style="font-size:12px;color:#888;margin-top:4px;">Total: <strong>${a.total}</strong></div>
          </div>
        `).join('')}
      </div>`;
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// =====================================================================
// TASKS
// =====================================================================
async function loadTasks() {
  const params = new URLSearchParams();
  const status = document.getElementById('filter-status')?.value;
  const priority = document.getElementById('filter-priority')?.value;
  const category = document.getElementById('filter-category')?.value;
  const assignee = document.getElementById('filter-assignee')?.value;
  const search = document.getElementById('filter-search')?.value?.trim();

  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (category) params.set('category_id', category);
  if (assignee) params.set('assignee_id', assignee);
  if (search) params.set('search', search);

  try {
    tasks = await apiFetch(`/api/operations/tasks?${params}`);
    renderTasksTable();
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

function debouncedLoadTasks() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadTasks, 350);
}

function clearFilters() {
  ['filter-status','filter-priority','filter-category','filter-assignee'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const s = document.getElementById('filter-search');
  if (s) s.value = '';
  loadTasks();
}

function renderTasksTable() {
  const tbody = document.getElementById('tasks-tbody');
  const count = document.getElementById('task-count');
  if (count) count.textContent = `${tasks.length} tarea${tasks.length !== 1 ? 's' : ''}`;

  if (tasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:50px;color:#aaa;">
      <div style="font-size:36px;margin-bottom:8px;">📋</div>
      <div>No hay tareas. Crea la primera.</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map(t => {
    const overdue = t.due_date && new Date(t.due_date) < new Date() && !['completada','cancelada'].includes(t.status);
    const dueDateStr = t.due_date ? `<span style="${overdue ? 'color:#dc3545;font-weight:700;' : ''}">${formatDate(t.due_date)}${overdue ? ' ⚠️' : ''}</span>` : '<span style="color:#ccc;">—</span>';
    const catBadge = t.category_name ? `<span style="background:${t.category_color}22;color:${t.category_color};font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;">${esc(t.category_name)}</span>` : '<span style="color:#ccc;">—</span>';
    
    return `<tr data-testid="row-task-${t.id}">
      <td>
        <div class="task-title" title="${esc(t.title)}">${esc(t.title.length > 60 ? t.title.slice(0,57) + '...' : t.title)}</div>
        ${t.description ? `<div class="task-desc">${esc(t.description.slice(0,80))}</div>` : ''}
        ${t.location_name ? `<div style="font-size:11px;color:#888;margin-top:2px;">📍 ${esc(t.location_name)}</div>` : ''}
      </td>
      <td>${catBadge}</td>
      <td><span class="priority-badge priority-${t.priority}">${t.priority}</span></td>
      <td><span class="status-badge status-${t.status}">${statusLabel(t.status)}</span></td>
      <td style="font-size:13px;">${t.assignee_name ? esc(t.assignee_name) : '<span style="color:#ccc;">—</span>'}</td>
      <td>${dueDateStr}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:nowrap;">
          <button class="btn-icon" onclick="openTaskDetail('${t.id}')" title="Ver detalle" data-testid="button-detail-${t.id}">👁</button>
          <button class="btn-icon" onclick="editTask('${t.id}')" title="Editar" data-testid="button-edit-${t.id}">✏️</button>
          <button class="btn-icon" onclick="duplicateTask('${t.id}')" title="Duplicar" data-testid="button-dup-${t.id}">📋</button>
          <button class="btn-icon" onclick="deleteTask('${t.id}')" title="Eliminar" data-testid="button-del-${t.id}" style="color:#dc3545;">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ---- TASK DETAIL ----
function openTaskDetail(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  document.getElementById('detail-title').textContent = t.title;

  const overdue = t.due_date && new Date(t.due_date) < new Date() && !['completada','cancelada'].includes(t.status);
  const mapsUrl = t.maps_url || (t.location_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location_address)}` : null);
  const calLink = generateCalendarLink(t);

  let body = `
    <div class="detail-cols">
      <div>
        <div class="detail-label">Estado</div>
        <div class="detail-value"><span class="status-badge status-${t.status}">${statusLabel(t.status)}</span></div>
        <div class="detail-label">Prioridad</div>
        <div class="detail-value"><span class="priority-badge priority-${t.priority}">${t.priority}</span></div>
        <div class="detail-label">Categoría</div>
        <div class="detail-value">${t.category_name ? `<span style="background:${t.category_color}22;color:${t.category_color};padding:2px 10px;border-radius:10px;font-size:13px;font-weight:600;">${esc(t.category_name)}</span>` : '—'}</div>
        <div class="detail-label">Responsable</div>
        <div class="detail-value">${t.assignee_name ? `${esc(t.assignee_name)}${t.assignee_role ? ` <span style="color:#888;font-size:12px;">(${esc(t.assignee_role)})</span>` : ''}` : '—'}</div>
      </div>
      <div>
        <div class="detail-label">Fecha de Inicio</div>
        <div class="detail-value">${formatDate(t.start_date) || '—'}</div>
        <div class="detail-label">Fecha Límite</div>
        <div class="detail-value" style="${overdue ? 'color:#dc3545;font-weight:700;' : ''}">${formatDate(t.due_date) || '—'}${overdue ? ' (Vencida)' : ''}</div>
        <div class="detail-label">Horas Estimadas</div>
        <div class="detail-value">${t.estimated_hours || '—'}</div>
        <div class="detail-label">Monto</div>
        <div class="detail-value">${t.amount ? `$${parseFloat(t.amount).toLocaleString('es-US', {minimumFractionDigits:2})}` : '—'}</div>
      </div>
    </div>
    ${t.description ? `<div class="detail-label">Descripción</div><div class="detail-value" style="white-space:pre-wrap;">${esc(t.description)}</div>` : ''}
    ${t.comments ? `<div class="detail-label">Comentarios Internos</div><div class="detail-value" style="background:#f8f9fa;padding:10px;border-radius:6px;white-space:pre-wrap;font-size:13px;">${esc(t.comments)}</div>` : ''}
    ${t.tags ? `<div class="detail-label">Etiquetas</div><div class="detail-value">${t.tags.split(',').map(tag => `<span style="background:#e9ecef;padding:2px 10px;border-radius:10px;font-size:12px;margin-right:4px;">${esc(tag.trim())}</span>`).join('')}</div>` : ''}
    ${t.location_name || t.location_address ? `
      <div class="detail-label">Ubicación</div>
      <div class="detail-value">
        ${t.location_name ? `<strong>${esc(t.location_name)}</strong><br>` : ''}
        ${t.location_address ? `<span style="color:#666;">${esc(t.location_address)}</span><br>` : ''}
        ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" class="maps-link" style="margin-top:4px;display:inline-flex;">📍 Ver en Google Maps</a>` : ''}
      </div>
    ` : ''}
    ${t.related_entity_type ? `<div class="detail-label">Entidad Relacionada</div><div class="detail-value">${esc(t.related_entity_type)}${t.related_entity_id ? ` — ID: <code style="background:#f0f0f0;padding:1px 6px;border-radius:4px;">${esc(t.related_entity_id)}</code>` : ''}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
      ${calLink ? `<a href="${calLink}" target="_blank" class="gcal-link">📅 Agregar a Google Calendar</a>` : ''}
      ${t.sync_expenses ? `<span style="background:#fde8ea;color:#dc3545;font-size:12px;padding:4px 10px;border-radius:20px;">Vinculado a Gastos</span>` : ''}
      ${t.sync_income ? `<span style="background:#d1e7dd;color:#0f5132;font-size:12px;padding:4px 10px;border-radius:20px;">Vinculado a Ingresos</span>` : ''}
    </div>
  `;

  document.getElementById('detail-body').innerHTML = body;
  document.getElementById('detail-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeDetailModal()">Cerrar</button>
    <button class="btn btn-outline" onclick="closeDetailModal();editTask('${t.id}')">Editar</button>
    ${t.sync_expenses || !t.amount ? '' : `<button class="btn btn-success" onclick="sendToExpenses('${t.id}')">Enviar a Gastos</button>`}
  `;

  document.getElementById('detail-modal').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('open');
}

// ---- TASK MODAL ----
function openTaskModal(prefill = {}) {
  editingTaskId = null;
  const titleEl = document.getElementById('task-modal-title');
  if (titleEl) {
    titleEl.setAttribute('data-i18n', 'ops.modal.new_task');
    titleEl.textContent = window.i18n ? window.i18n.t('ops.modal.new_task') : 'Nueva Tarea';
  }
  clearTaskForm();
  if (Object.keys(prefill).length) setTaskForm(prefill);
  document.getElementById('task-modal').classList.add('open');
  if (window.i18n) window.i18n.translateDynamicContent(document.getElementById('task-modal'));
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('open');
  editingTaskId = null;
}

function editTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  editingTaskId = id;
  const titleEl = document.getElementById('task-modal-title');
  if (titleEl) {
    titleEl.setAttribute('data-i18n', 'ops.modal.edit_task');
    titleEl.textContent = window.i18n ? window.i18n.t('ops.modal.edit_task') : 'Editar Tarea';
  }
  setTaskForm(t);
  document.getElementById('task-modal').classList.add('open');
  if (window.i18n) window.i18n.translateDynamicContent(document.getElementById('task-modal'));
}

function clearTaskForm() {
  const ids = ['task-title','task-description','task-comments','task-tags',
    'task-entity-id','task-location-name','task-location-address','task-estimated-hours','task-amount'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  setVal('task-category','');
  setVal('task-assignee','');
  setVal('task-priority','media');
  setVal('task-status','pendiente');
  setVal('task-entity-type','');
  setChecked('task-sync-calendar', false);
  setChecked('task-sync-expenses', false);
  setChecked('task-sync-income', false);
  const today = new Date().toISOString().split('T')[0];
  setVal('task-start-date', today);
  setVal('task-due-date','');
}

function setTaskForm(t) {
  setVal('task-title', t.title || '');
  setVal('task-description', t.description || '');
  setVal('task-comments', t.comments || '');
  setVal('task-tags', t.tags || '');
  setVal('task-category', t.category_id || '');
  setVal('task-assignee', t.assignee_id || '');
  setVal('task-priority', t.priority || 'media');
  setVal('task-status', t.status || 'pendiente');
  setVal('task-entity-type', t.related_entity_type || '');
  setVal('task-entity-id', t.related_entity_id || '');
  setVal('task-location-name', t.location_name || '');
  setVal('task-location-address', t.location_address || '');
  setVal('task-estimated-hours', t.estimated_hours || '');
  setVal('task-amount', t.amount || '');
  setVal('task-start-date', t.start_date ? t.start_date.slice(0,10) : '');
  setVal('task-due-date', t.due_date ? t.due_date.slice(0,10) : '');
  setChecked('task-sync-calendar', !!t.sync_calendar);
  setChecked('task-sync-expenses', !!t.sync_expenses);
  setChecked('task-sync-income', !!t.sync_income);
}

function getTaskFormData() {
  return {
    title: getVal('task-title').trim(),
    description: getVal('task-description').trim() || null,
    comments: getVal('task-comments').trim() || null,
    tags: getVal('task-tags').trim() || null,
    category_id: getVal('task-category') || null,
    assignee_id: getVal('task-assignee') || null,
    priority: getVal('task-priority') || 'media',
    status: getVal('task-status') || 'pendiente',
    related_entity_type: getVal('task-entity-type') || null,
    related_entity_id: getVal('task-entity-id').trim() || null,
    location_name: getVal('task-location-name').trim() || null,
    location_address: getVal('task-location-address').trim() || null,
    maps_url: buildMapsUrl(getVal('task-location-address').trim()),
    estimated_hours: parseFloatOrNull(getVal('task-estimated-hours')),
    amount: parseFloatOrNull(getVal('task-amount')),
    start_date: getVal('task-start-date') || null,
    due_date: getVal('task-due-date') || null,
    sync_calendar: document.getElementById('task-sync-calendar').checked,
    sync_expenses: document.getElementById('task-sync-expenses').checked,
    sync_income: document.getElementById('task-sync-income').checked,
  };
}

async function saveTask() {
  const data = getTaskFormData();
  if (!data.title) { alert('El título es obligatorio.'); return; }

  try {
    if (editingTaskId) {
      await apiFetch(`/api/operations/tasks/${editingTaskId}`, { method: 'PATCH', body: data });
      showToast('Tarea actualizada');
    } else {
      await apiFetch('/api/operations/tasks', { method: 'POST', body: data });
      showToast('Tarea creada');
    }
    closeTaskModal();
    await loadTasks();
    await loadStats();
  } catch (err) {
    alert('Error al guardar: ' + err.message);
  }
}

async function deleteTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`¿Eliminar tarea "${t.title}"?`)) return;
  try {
    await apiFetch(`/api/operations/tasks/${id}`, { method: 'DELETE' });
    showToast('Tarea eliminada');
    await loadTasks();
    await loadStats();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function duplicateTask(id) {
  try {
    await apiFetch(`/api/operations/tasks/${id}/duplicate`, { method: 'POST' });
    showToast('Tarea duplicada');
    await loadTasks();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function sendToExpenses(id) {
  const t = tasks.find(x => x.id === id);
  if (!confirm(`¿Enviar la tarea "${t?.title}" al módulo de Gastos?`)) return;
  try {
    await apiFetch(`/api/operations/tasks/${id}/send-to-expenses`, { method: 'POST', body: {} });
    showToast('Tarea enviada a Gastos');
    closeDetailModal();
    await loadTasks();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// =====================================================================
// TIMELINE
// =====================================================================
function timelineNav(dir) {
  const view = document.getElementById('tl-view').value;
  if (view === 'week') {
    tlCurrentDate.setDate(tlCurrentDate.getDate() + dir * 7);
  } else {
    tlCurrentDate.setMonth(tlCurrentDate.getMonth() + dir);
  }
  renderTimeline();
}

async function renderTimeline() {
  const view = document.getElementById('tl-view')?.value || 'week';
  const container = document.getElementById('timeline-container');
  if (!container) return;

  // Load tasks for range
  let start, end;
  const now = new Date(tlCurrentDate);

  if (view === 'week') {
    // Get Monday of current week
    const day = now.getDay() || 7;
    start = new Date(now);
    start.setDate(now.getDate() - day + 1);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  const params = new URLSearchParams({ start: startStr, end: endStr });

  let tls = [];
  try {
    tls = await apiFetch(`/api/operations/tasks?${params}`);
    // Also include tasks with start_date in range (server filters by due_date, supplement here)
    const allTasks = tasks.length ? tasks : await apiFetch('/api/operations/tasks');
    const extra = allTasks.filter(t => {
      if (!t.start_date) return false;
      const sd = t.start_date.slice(0,10);
      return sd >= startStr && sd <= endStr && !tls.find(x => x.id === t.id);
    });
    tls = [...tls, ...extra];
  } catch (e) {
    tls = tasks;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  if (view === 'week') {
    // Label
    const days = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    document.getElementById('tl-period-label').textContent =
      `${start.getDate()} ${months[start.getMonth()]} — ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;

    const headerRow = `<div class="tl-week-row">
      <div class="tl-day-header"></div>
      ${days.map((d, i) => {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const isToday = date.toISOString().split('T')[0] === todayStr;
        return `<div class="tl-day-header" style="${isToday ? 'color:#0066cc;' : ''}">${d}<br><span style="font-size:14px;font-weight:700;">${date.getDate()}</span></div>`;
      }).join('')}
    </div>`;

    // Group tasks by day
    const dayTaskMap = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dayTaskMap[date.toISOString().split('T')[0]] = [];
    }

    tls.forEach(t => {
      const dateKey = (t.due_date || t.start_date || '').slice(0,10);
      if (dayTaskMap[dateKey]) dayTaskMap[dateKey].push(t);
    });

    const cellRow = `<div class="tl-week-row">
      <div class="tl-day-label" style="font-size:11px;color:#aaa;">Tareas</div>
      ${Array.from({length: 7}, (_, i) => {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const dk = date.toISOString().split('T')[0];
        const isToday = dk === todayStr;
        const dayTasks = dayTaskMap[dk] || [];
        return `<div class="tl-day-cell${isToday ? ' today' : ''}">
          ${dayTasks.slice(0, 4).map(t => {
            const color = getCatColor(t.category_id) || '#0066cc';
            return `<div class="tl-task-bar" style="background:${color};" onclick="openTaskDetail('${t.id}')" title="${esc(t.title)}">${esc(t.title)}</div>`;
          }).join('')}
          ${dayTasks.length > 4 ? `<div style="font-size:10px;color:#888;text-align:center;">+${dayTasks.length - 4} más</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;

    container.innerHTML = `<div class="timeline-grid">${headerRow}${cellRow}</div>`;

  } else {
    // Monthly view
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('tl-period-label').textContent = `${months[start.getMonth()]} ${start.getFullYear()}`;

    const days = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const header = days.map(d => `<div class="tl-day-header">${d}</div>`).join('');

    // Build calendar
    const firstDow = (start.getDay() || 7) - 1; // 0=Mon
    const daysInMonth = end.getDate();

    // Group tasks
    const dayTaskMap = {};
    tls.forEach(t => {
      const dk = (t.due_date || t.start_date || '').slice(0,10);
      if (!dayTaskMap[dk]) dayTaskMap[dk] = [];
      dayTaskMap[dk].push(t);
    });

    let cells = '';
    // Leading empty cells
    for (let i = 0; i < firstDow; i++) cells += `<div class="month-day other-month"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), d);
      const dk = date.toISOString().split('T')[0];
      const isToday = dk === todayStr;
      const dayTasks = dayTaskMap[dk] || [];
      cells += `<div class="month-day${isToday ? ' today' : ''}">
        <div class="month-day-num" style="${isToday ? 'color:#0066cc;' : ''}">${d}</div>
        ${dayTasks.slice(0,3).map(t => {
          const color = getCatColor(t.category_id) || '#0066cc';
          return `<div class="tl-task-bar" style="background:${color};font-size:10px;" onclick="openTaskDetail('${t.id}')" title="${esc(t.title)}">${esc(t.title)}</div>`;
        }).join('')}
        ${dayTasks.length > 3 ? `<div style="font-size:10px;color:#888;">+${dayTasks.length-3}</div>` : ''}
      </div>`;
    }

    container.innerHTML = `<div class="month-grid">${header}${cells}</div>`;
  }
}

function getCatColor(catId) {
  const cat = categories.find(c => c.id === catId);
  return cat ? cat.color : null;
}

// =====================================================================
// CATEGORIES
// =====================================================================
async function loadCategories() {
  categories = await apiFetch('/api/operations/categories');
}

function renderCategories() {
  const el = document.getElementById('categories-list');
  if (categories.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏷</div><p>No hay categorías. Crea la primera.</p></div>';
    return;
  }
  el.innerHTML = categories.map(c => `
    <div class="entity-row" data-testid="row-cat-${c.id}">
      <div class="color-dot" style="background:${c.color}"></div>
      <span class="entity-name">${esc(c.name)}</span>
      <span class="${c.active ? 'badge-active' : 'badge-inactive'}">${c.active ? 'Activa' : 'Inactiva'}</span>
      <button class="btn-icon" onclick="editCategory('${c.id}')" title="Editar" data-testid="button-edit-cat-${c.id}">✏️</button>
      <button class="btn-icon" onclick="toggleCategory('${c.id}', ${!c.active})" title="${c.active ? 'Desactivar' : 'Activar'}" data-testid="button-toggle-cat-${c.id}">${c.active ? '🔕' : '🔔'}</button>
      <button class="btn-icon" onclick="deleteCategory('${c.id}')" title="Eliminar" style="color:#dc3545;" data-testid="button-del-cat-${c.id}">🗑</button>
    </div>
  `).join('');
}

function openCatModal() {
  editingCatId = null;
  const titleEl = document.getElementById('cat-modal-title');
  if (titleEl) {
    titleEl.setAttribute('data-i18n', 'ops.modal.new_cat');
    titleEl.textContent = window.i18n ? window.i18n.t('ops.modal.new_cat') : 'Nueva Categoría';
  }
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-color').value = '#0066cc';
  document.getElementById('cat-modal').classList.add('open');
  if (window.i18n) window.i18n.translateDynamicContent(document.getElementById('cat-modal'));
}

function closeCatModal() {
  document.getElementById('cat-modal').classList.remove('open');
  editingCatId = null;
}

function editCategory(id) {
  const c = categories.find(x => x.id === id);
  if (!c) return;
  editingCatId = id;
  const titleEl = document.getElementById('cat-modal-title');
  if (titleEl) {
    titleEl.setAttribute('data-i18n', 'ops.modal.edit_cat');
    titleEl.textContent = window.i18n ? window.i18n.t('ops.modal.edit_cat') : 'Editar Categoría';
  }
  document.getElementById('cat-name').value = c.name;
  document.getElementById('cat-color').value = c.color || '#0066cc';
  document.getElementById('cat-modal').classList.add('open');
  if (window.i18n) window.i18n.translateDynamicContent(document.getElementById('cat-modal'));
}

async function saveCategory() {
  const name = document.getElementById('cat-name').value.trim();
  const color = document.getElementById('cat-color').value;
  if (!name) { alert('El nombre es obligatorio'); return; }
  try {
    if (editingCatId) {
      await apiFetch(`/api/operations/categories/${editingCatId}`, { method: 'PATCH', body: { name, color } });
      showToast('Categoría actualizada');
    } else {
      await apiFetch('/api/operations/categories', { method: 'POST', body: { name, color } });
      showToast('Categoría creada');
    }
    closeCatModal();
    await loadCategories();
    renderCategories();
    populateFilterDropdowns();
    populateFormDropdowns();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function toggleCategory(id, active) {
  try {
    await apiFetch(`/api/operations/categories/${id}`, { method: 'PATCH', body: { active } });
    await loadCategories();
    renderCategories();
    populateFilterDropdowns();
    populateFormDropdowns();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteCategory(id) {
  const c = categories.find(x => x.id === id);
  if (!confirm(`¿Eliminar categoría "${c?.name}"?`)) return;
  try {
    await apiFetch(`/api/operations/categories/${id}`, { method: 'DELETE' });
    showToast('Categoría eliminada');
    await loadCategories();
    renderCategories();
    populateFilterDropdowns();
    populateFormDropdowns();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// =====================================================================
// ASSIGNEES
// =====================================================================
async function loadAssignees() {
  assignees = await apiFetch('/api/operations/assignees');
}

function renderAssignees() {
  const el = document.getElementById('assignees-list');
  if (assignees.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>No hay responsables. Crea el primero.</p></div>';
    return;
  }
  el.innerHTML = assignees.map(a => `
    <div class="entity-row" data-testid="row-assignee-${a.id}">
      <div style="width:36px;height:36px;border-radius:50%;background:#0066cc22;color:#0066cc;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">${a.name.charAt(0).toUpperCase()}</div>
      <div style="flex:1;">
        <div class="entity-name">${esc(a.name)}</div>
        ${a.role ? `<div class="entity-meta">${esc(a.role)}</div>` : ''}
        ${a.email ? `<div class="entity-meta">${esc(a.email)}</div>` : ''}
      </div>
      <span class="${a.active ? 'badge-active' : 'badge-inactive'}">${a.active ? 'Activo' : 'Inactivo'}</span>
      <button class="btn-icon" onclick="editAssignee('${a.id}')" title="Editar" data-testid="button-edit-assignee-${a.id}">✏️</button>
      <button class="btn-icon" onclick="toggleAssignee('${a.id}', ${!a.active})" title="${a.active ? 'Desactivar' : 'Activar'}">${a.active ? '🔕' : '🔔'}</button>
      <button class="btn-icon" onclick="deleteAssignee('${a.id}')" style="color:#dc3545;" title="Eliminar" data-testid="button-del-assignee-${a.id}">🗑</button>
    </div>
  `).join('');
}

function openAssigneeModal() {
  editingAssigneeId = null;
  const titleEl = document.getElementById('assignee-modal-title');
  if (titleEl) {
    titleEl.setAttribute('data-i18n', 'ops.modal.new_assignee');
    titleEl.textContent = window.i18n ? window.i18n.t('ops.modal.new_assignee') : 'Nuevo Responsable';
  }
  document.getElementById('assignee-name').value = '';
  document.getElementById('assignee-role').value = '';
  document.getElementById('assignee-email').value = '';
  document.getElementById('assignee-modal').classList.add('open');
  if (window.i18n) window.i18n.translateDynamicContent(document.getElementById('assignee-modal'));
}

function closeAssigneeModal() {
  document.getElementById('assignee-modal').classList.remove('open');
  editingAssigneeId = null;
}

function editAssignee(id) {
  const a = assignees.find(x => x.id === id);
  if (!a) return;
  editingAssigneeId = id;
  const titleEl = document.getElementById('assignee-modal-title');
  if (titleEl) {
    titleEl.setAttribute('data-i18n', 'ops.modal.edit_assignee');
    titleEl.textContent = window.i18n ? window.i18n.t('ops.modal.edit_assignee') : 'Editar Responsable';
  }
  document.getElementById('assignee-name').value = a.name;
  document.getElementById('assignee-role').value = a.role || '';
  document.getElementById('assignee-email').value = a.email || '';
  document.getElementById('assignee-modal').classList.add('open');
  if (window.i18n) window.i18n.translateDynamicContent(document.getElementById('assignee-modal'));
}

async function saveAssignee() {
  const name = document.getElementById('assignee-name').value.trim();
  const role = document.getElementById('assignee-role').value.trim();
  const email = document.getElementById('assignee-email').value.trim();
  if (!name) { alert('El nombre es obligatorio'); return; }
  try {
    if (editingAssigneeId) {
      await apiFetch(`/api/operations/assignees/${editingAssigneeId}`, { method: 'PATCH', body: { name, role: role||null, email: email||null } });
      showToast('Responsable actualizado');
    } else {
      await apiFetch('/api/operations/assignees', { method: 'POST', body: { name, role: role||null, email: email||null } });
      showToast('Responsable creado');
    }
    closeAssigneeModal();
    await loadAssignees();
    renderAssignees();
    populateFilterDropdowns();
    populateFormDropdowns();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function toggleAssignee(id, active) {
  try {
    await apiFetch(`/api/operations/assignees/${id}`, { method: 'PATCH', body: { active } });
    await loadAssignees();
    renderAssignees();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteAssignee(id) {
  const a = assignees.find(x => x.id === id);
  if (!confirm(`¿Eliminar responsable "${a?.name}"?`)) return;
  try {
    await apiFetch(`/api/operations/assignees/${id}`, { method: 'DELETE' });
    showToast('Responsable eliminado');
    await loadAssignees();
    renderAssignees();
    populateFilterDropdowns();
    populateFormDropdowns();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// =====================================================================
// DROPDOWNS
// =====================================================================
function populateFilterDropdowns() {
  const catSel = document.getElementById('filter-category');
  if (catSel) {
    catSel.innerHTML = '<option value="">Todas</option>' +
      categories.filter(c => c.active).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
  const assigneeSel = document.getElementById('filter-assignee');
  if (assigneeSel) {
    assigneeSel.innerHTML = '<option value="">Todos</option>' +
      assignees.filter(a => a.active).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  }
}

function populateFormDropdowns() {
  const catSel = document.getElementById('task-category');
  if (catSel) {
    catSel.innerHTML = '<option value="">Sin categoría</option>' +
      categories.filter(c => c.active).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
  const assSel = document.getElementById('task-assignee');
  if (assSel) {
    assSel.innerHTML = '<option value="">Sin asignar</option>' +
      assignees.filter(a => a.active).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  }
}

// =====================================================================
// GOOGLE CALENDAR LINK GENERATOR (no OAuth needed)
// =====================================================================
function generateCalendarLink(t) {
  if (!t.start_date && !t.due_date) return null;
  const startDate = (t.start_date || t.due_date).slice(0,10).replace(/-/g,'');
  const endDate = (t.due_date || t.start_date).slice(0,10).replace(/-/g,'');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: t.title,
    dates: `${startDate}/${endDate}`,
    details: [
      t.description || '',
      t.assignee_name ? `Responsable: ${t.assignee_name}` : '',
      t.amount ? `Monto: $${t.amount}` : '',
      t.location_address ? `Ubicación: ${t.location_address}` : '',
      `Estado: ${statusLabel(t.status)}`,
    ].filter(Boolean).join('\n'),
    location: t.location_address || t.location_name || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// =====================================================================
// HELPERS
// =====================================================================
function buildMapsUrl(address) {
  if (!address || !address.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function statusLabel(s) {
  const map = { pendiente: 'Pendiente', en_progreso: 'En Progreso', completada: 'Completada', pausada: 'Pausada', cancelada: 'Cancelada' };
  return map[s] || s;
}

function formatDate(str) {
  if (!str) return null;
  const d = new Date(str + (str.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('es-US', { day:'2-digit', month:'short', year:'numeric' });
}

function daysUntil(str) {
  if (!str) return null;
  const now = new Date();
  const due = new Date(str + 'T12:00:00');
  return Math.floor((due - now) / (1000 * 60 * 60 * 24));
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function getVal(id) {
  return document.getElementById(id)?.value || '';
}

function setChecked(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

function parseFloatOrNull(str) {
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '24px', right: '24px', background: '#222',
    color: 'white', padding: '12px 20px', borderRadius: '8px',
    zIndex: 9999, fontSize: '14px', fontWeight: '600',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)', transition: 'opacity 0.3s'
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
}

async function apiFetch(url, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (options.body) opts.body = JSON.stringify(options.body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
