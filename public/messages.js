// Global state
let platforms = [];
let currentThread = null;
let templates = [];
let analyticsChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    setupTabs();
    await loadPlatforms();
    await loadTemplates();
    await loadInbox();
    setupAutoRefresh();
});

// Tab switching
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

// Load platforms for filters and dropdowns
async function loadPlatforms() {
    try {
        const response = await fetch('/api/messages/platforms');
        platforms = await response.json();
        
        // Populate platform dropdowns
        const platformSelects = [
            document.getElementById('filter-platform'),
            document.getElementById('manual-platform')
        ];
        
        platformSelects.forEach(select => {
            platforms.forEach(platform => {
                const option = document.createElement('option');
                option.value = platform.platform_name;
                option.textContent = `${platform.platform_icon} ${platform.platform_name}`;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('Error loading platforms:', error);
    }
}

// Load inbox threads
async function loadInbox() {
    try {
        const platform = document.getElementById('filter-platform').value;
        const status = document.getElementById('filter-status').value;
        const search = document.getElementById('filter-search').value;
        
        const params = new URLSearchParams();
        if (platform) params.append('platform', platform);
        if (status) params.append('status', status);
        if (search) params.append('search', search);
        
        const response = await fetch(`/api/messages/inbox?${params}`);
        const threads = await response.json();
        
        renderThreadList(threads);
    } catch (error) {
        console.error('Error loading inbox:', error);
        document.getElementById('thread-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-text">Error al cargar mensajes</div>
            </div>
        `;
    }
}

// Render thread list
function renderThreadList(threads) {
    const container = document.getElementById('thread-list');
    
    if (threads.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-text">No hay mensajes</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = threads.map(thread => {
        const platform = platforms.find(p => p.platform_name === thread.platform);
        const isUnread = parseInt(thread.unread_count) > 0;
        const timeAgo = formatTimeAgo(thread.last_message_at);
        
        return `
            <div class="thread-item ${isUnread ? 'unread' : ''}" onclick="openThread('${thread.id}')">
                <div class="platform-icon" style="background: ${platform?.platform_color || '#ccc'}">
                    ${platform?.platform_icon || '?'}
                </div>
                <div class="thread-content">
                    <div class="thread-header">
                        <span class="thread-customer">${thread.customer_name || 'Cliente'}</span>
                        <span class="thread-time">${timeAgo}</span>
                    </div>
                    <div class="thread-preview">
                        ${thread.customer_email || thread.customer_phone || 'Sin contacto'}
                    </div>
                </div>
                <div class="thread-meta">
                    <span class="badge badge-${thread.status}">${getStatusLabel(thread.status)}</span>
                    ${isUnread ? `<span class="badge badge-unread">${thread.unread_count}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Open thread conversation
async function openThread(threadId) {
    try {
        const response = await fetch(`/api/messages/threads/${threadId}`);
        const data = await response.json();
        
        currentThread = data.thread;
        renderConversation(data);
        
        // Switch to conversation tab
        document.querySelector('[data-tab="conversation"]').click();
        
        // Mark messages as read
        data.messages.forEach(msg => {
            if (msg.status === 'new' && msg.direction === 'inbound') {
                markMessageAsRead(msg.id);
            }
        });
    } catch (error) {
        console.error('Error opening thread:', error);
        alert('Error al abrir conversación');
    }
}

// Render conversation
function renderConversation(data) {
    const { thread, messages } = data;
    const platform = platforms.find(p => p.platform_name === thread.platform);
    
    // Update header
    document.getElementById('conv-customer-name').textContent = thread.customer_name || 'Cliente';
    document.getElementById('conv-platform-badge').innerHTML = `
        <span class="badge" style="background: ${platform?.platform_color || '#ccc'}; color: white;">
            ${platform?.platform_icon || ''} ${thread.platform}
        </span>
    `;
    
    // Update sidebar
    const initials = (thread.customer_name || 'C').substring(0, 1).toUpperCase();
    document.querySelector('.customer-avatar').textContent = initials;
    document.querySelector('.customer-name').textContent = thread.customer_name || 'Cliente';
    
    const contactHtml = [];
    if (thread.customer_email) {
        contactHtml.push(`<div class="customer-contact">📧 ${thread.customer_email}</div>`);
    }
    if (thread.customer_phone) {
        contactHtml.push(`<div class="customer-contact">📱 ${thread.customer_phone}</div>`);
    }
    document.querySelector('.customer-info').innerHTML = `
        <div class="customer-name">${thread.customer_name || 'Cliente'}</div>
        ${contactHtml.join('')}
    `;
    
    document.getElementById('sidebar-platform').textContent = `Plataforma: ${thread.platform}`;
    document.getElementById('sidebar-status').innerHTML = `
        Estado: <span class="badge badge-${thread.status}">${getStatusLabel(thread.status)}</span>
    `;
    document.getElementById('sidebar-booking').textContent = 
        `Reserva: ${thread.booking_id || 'Sin asignar'}`;
    
    // Render messages
    const messagesContainer = document.getElementById('conversation-messages');
    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <div class="empty-state-text">No hay mensajes en esta conversación</div>
            </div>
        `;
        return;
    }
    
    messagesContainer.innerHTML = messages.map(msg => `
        <div class="message ${msg.direction}">
            <div class="message-bubble">
                ${escapeHtml(msg.message_content)}
            </div>
            <div class="message-meta">
                ${msg.sender_name || (msg.direction === 'inbound' ? 'Cliente' : 'Nadaki')} • 
                ${formatDateTime(msg.received_at)}
                ${msg.responded_at ? ` • Respondido ${formatDateTime(msg.responded_at)}` : ''}
            </div>
        </div>
    `).join('');
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Load AI suggestions for this thread
    loadSuggestions(thread.id);
}

// Mark message as read
async function markMessageAsRead(messageId) {
    try {
        await fetch(`/api/messages/${messageId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'read' })
        });
    } catch (error) {
        console.error('Error marking message as read:', error);
    }
}

// Send message
async function sendMessage(method) {
    if (!currentThread) {
        alert('Selecciona una conversación primero');
        return;
    }
    
    const content = document.getElementById('message-composer').value.trim();
    if (!content) {
        alert('Escribe un mensaje');
        return;
    }
    
    try {
        const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thread_id: currentThread.id,
                message_content: content,
                send_via: method
            })
        });
        
        if (!response.ok) throw new Error('Error al enviar mensaje');
        
        // Clear composer
        document.getElementById('message-composer').value = '';
        
        // Reload conversation
        await openThread(currentThread.id);
        
        alert(`Mensaje enviado vía ${method === 'whatsapp' ? 'WhatsApp' : 'Email'}`);
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error al enviar mensaje');
    }
}

// Mark as responded (without sending)
async function markAsResponded() {
    if (!currentThread) {
        alert('Selecciona una conversación primero');
        return;
    }
    
    const content = document.getElementById('message-composer').value.trim();
    if (!content) {
        alert('Escribe la respuesta que enviaste manualmente');
        return;
    }
    
    try {
        // Create outbound message record
        await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thread_id: currentThread.id,
                message_content: content,
                send_via: 'manual' // Won't actually send, just records
            })
        });
        
        document.getElementById('message-composer').value = '';
        await openThread(currentThread.id);
        alert('Marcado como respondido');
    } catch (error) {
        console.error('Error:', error);
        alert('Error al marcar como respondido');
    }
}

// Copy to clipboard
function copyToClipboard() {
    const content = document.getElementById('message-composer').value;
    if (!content) {
        alert('No hay nada que copiar');
        return;
    }
    
    navigator.clipboard.writeText(content).then(() => {
        alert('Copiado al portapapeles');
    }).catch(err => {
        console.error('Error copying:', err);
        alert('Error al copiar');
    });
}

// Open platform link
function openPlatformLink() {
    if (!currentThread) {
        alert('Selecciona una conversación primero');
        return;
    }
    
    const platform = platforms.find(p => p.platform_name === currentThread.platform);
    if (!platform || !platform.base_url) {
        alert('Esta plataforma no tiene enlace configurado');
        return;
    }
    
    window.open(`https://${platform.base_url}`, '_blank');
}

// Submit manual message
async function submitManualMessage(event) {
    event.preventDefault();
    
    const formData = {
        platform: document.getElementById('manual-platform').value,
        customer_name: document.getElementById('manual-customer-name').value,
        customer_email: document.getElementById('manual-customer-email').value || null,
        customer_phone: document.getElementById('manual-customer-phone').value || null,
        message_content: document.getElementById('manual-message-content').value,
        platform_message_url: document.getElementById('manual-platform-url').value || null,
        booking_id: document.getElementById('manual-booking-id').value || null
    };
    
    try {
        const response = await fetch('/api/messages/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) throw new Error('Error al guardar mensaje');
        
        alert('Mensaje guardado exitosamente');
        
        // Clear form
        document.getElementById('manual-message-form').reset();
        
        // Reload inbox
        await loadInbox();
    } catch (error) {
        console.error('Error:', error);
        alert('Error al guardar mensaje');
    }
}

// Load templates
async function loadTemplates() {
    try {
        const response = await fetch('/api/messages/templates');
        templates = await response.json();
        
        renderTemplates();
        populateTemplateSelector();
    } catch (error) {
        console.error('Error loading templates:', error);
    }
}

// Render templates grid
function renderTemplates() {
    const container = document.getElementById('templates-grid');
    
    if (templates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div class="empty-state-text">No hay plantillas creadas</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = templates.map(template => `
        <div class="template-card" onclick="useTemplate('${template.id}')">
            <div class="template-header">
                <span class="template-name">${escapeHtml(template.name)}</span>
                <span class="template-category">${template.category}</span>
            </div>
            <div class="template-content">${escapeHtml(template.content.substring(0, 150))}${template.content.length > 150 ? '...' : ''}</div>
        </div>
    `).join('');
}

// Populate template selector in composer
function populateTemplateSelector() {
    const selector = document.getElementById('template-selector');
    selector.innerHTML = '<option value="">-- Usar Plantilla --</option>';
    
    templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = `${template.name} (${template.category})`;
        selector.appendChild(option);
    });
}

// Apply template to composer
function applyTemplate() {
    const selector = document.getElementById('template-selector');
    const templateId = selector.value;
    
    if (!templateId) return;
    
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    let content = template.content;
    
    // Replace variables if we have current thread
    if (currentThread) {
        content = content.replace('{customer_name}', currentThread.customer_name || 'Cliente');
        content = content.replace('{date}', new Date().toLocaleDateString());
    }
    
    document.getElementById('message-composer').value = content;
}

// Use template (from templates tab)
function useTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    // Copy to clipboard
    navigator.clipboard.writeText(template.content).then(() => {
        alert(`Plantilla "${template.name}" copiada al portapapeles`);
    }).catch(err => {
        console.error('Error copying:', err);
        alert('Error al copiar plantilla');
    });
}

// Show/hide new template form
function showNewTemplateForm() {
    document.getElementById('new-template-form').style.display = 'block';
}

function hideNewTemplateForm() {
    document.getElementById('new-template-form').style.display = 'none';
    document.getElementById('template-name').value = '';
    document.getElementById('template-content').value = '';
}

// Save new template
async function saveNewTemplate(event) {
    event.preventDefault();
    
    const formData = {
        name: document.getElementById('template-name').value,
        category: document.getElementById('template-category').value,
        content: document.getElementById('template-content').value
    };
    
    try {
        const response = await fetch('/api/messages/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) throw new Error('Error al guardar plantilla');
        
        alert('Plantilla guardada exitosamente');
        hideNewTemplateForm();
        await loadTemplates();
    } catch (error) {
        console.error('Error:', error);
        alert('Error al guardar plantilla');
    }
}

// Load analytics
async function loadAnalytics() {
    try {
        const startDate = document.getElementById('analytics-start-date').value;
        const endDate = document.getElementById('analytics-end-date').value;
        
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        const response = await fetch(`/api/messages/analytics?${params}`);
        const data = await response.json();
        
        renderAnalytics(data);
    } catch (error) {
        console.error('Error loading analytics:', error);
        alert('Error al cargar analytics');
    }
}

// Render analytics
function renderAnalytics(data) {
    // Update KPI cards
    document.getElementById('stat-total-messages').textContent = 
        data.overall.total_messages || 0;
    document.getElementById('stat-pending-messages').textContent = 
        data.overall.pending_messages || 0;
    document.getElementById('stat-avg-response-time').textContent = 
        (data.overall.avg_response_hours || 0).toFixed(1);
    
    // Calculate conversion rate
    const conversionRate = data.conversion.threads_with_bookings > 0
        ? ((data.conversion.converted_threads / data.conversion.threads_with_bookings) * 100).toFixed(1)
        : 0;
    document.getElementById('stat-conversion-rate').textContent = `${conversionRate}%`;
    
    // Render chart
    renderMessagesChart(data.by_platform);
    
    // Render performance table
    renderPerformanceTable(data.by_platform);
}

// Render messages by platform chart
function renderMessagesChart(platformData) {
    const ctx = document.getElementById('messages-by-platform-chart');
    
    // Destroy existing chart
    if (analyticsChart) {
        analyticsChart.destroy();
    }
    
    analyticsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: platformData.map(p => p.platform),
            datasets: [{
                label: 'Mensajes Totales',
                data: platformData.map(p => parseInt(p.total_messages)),
                backgroundColor: 'rgba(0, 102, 204, 0.7)',
                borderColor: 'rgba(0, 102, 204, 1)',
                borderWidth: 2
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
                        precision: 0
                    }
                }
            }
        }
    });
}

// Render performance table
function renderPerformanceTable(platformData) {
    const tbody = document.querySelector('#platform-performance-table tbody');
    
    tbody.innerHTML = platformData.map(p => {
        const avgTime = p.avg_response_hours ? parseFloat(p.avg_response_hours).toFixed(1) : '-';
        
        return `
            <tr>
                <td>${p.platform}</td>
                <td>${p.total_messages}</td>
                <td>${p.inbound}</td>
                <td>${p.outbound}</td>
                <td>${avgTime}</td>
                <td><span class="badge badge-unread">${p.unread_messages}</span></td>
            </tr>
        `;
    }).join('');
}

// Auto-refresh inbox every 30 seconds
function setupAutoRefresh() {
    setInterval(() => {
        // Only refresh if on inbox tab
        const inboxTab = document.getElementById('inbox-tab');
        if (inboxTab.classList.contains('active')) {
            loadInbox();
        }
    }, 30000);
}

// Helper functions
function formatTimeAgo(dateString) {
    if (!dateString) return 'Desconocido';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return date.toLocaleDateString();
}

function formatDateTime(dateString) {
    if (!dateString) return 'Desconocido';
    
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusLabel(status) {
    const labels = {
        'pending': 'Pendiente',
        'responded': 'Respondido',
        'archived': 'Archivado'
    };
    return labels[status] || status;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===================================================================
// AI-POWERED SUGGESTIONS
// ===================================================================

// Load AI-powered boat suggestions for current thread
async function loadSuggestions(threadId) {
    if (!threadId) return;
    
    const suggestionsSection = document.getElementById('suggestions-section');
    const suggestionsContent = document.getElementById('suggestions-content');
    
    // Show loading state
    suggestionsSection.style.display = 'block';
    suggestionsContent.innerHTML = `
        <div class="suggestions-loading">
            <div class="spinner"></div>
            <p>Analizando conversación...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/messages/suggestions/${threadId}`);
        const data = await response.json();
        
        renderSuggestions(data);
    } catch (error) {
        console.error('Error loading suggestions:', error);
        suggestionsContent.innerHTML = `
            <p style="color: #999; font-size: 13px; text-align: center;">
                No se pudieron cargar las sugerencias
            </p>
        `;
    }
}

// Render suggestions in sidebar (using DOM APIs for security)
function renderSuggestions(data) {
    const { inquiry, suggestions, confidence, message } = data;
    const suggestionsContent = document.getElementById('suggestions-content');
    
    // Clear existing content
    suggestionsContent.innerHTML = '';
    
    if (!inquiry || confidence === 0) {
        const msgEl = document.createElement('p');
        msgEl.style.cssText = 'color: #999; font-size: 13px; text-align: center; padding: 12px;';
        msgEl.textContent = message || 'No se detectaron detalles de reserva en la conversación';
        suggestionsContent.appendChild(msgEl);
        return;
    }
    
    // Show inquiry summary
    if (inquiry.summary) {
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'inquiry-summary';
        
        const heading = document.createElement('h5');
        heading.textContent = '📋 Detalles Detectados';
        summaryDiv.appendChild(heading);
        
        inquiry.summary.split('\n').forEach(line => {
            const detailDiv = document.createElement('div');
            detailDiv.className = 'inquiry-detail';
            detailDiv.textContent = line;
            summaryDiv.appendChild(detailDiv);
        });
        
        const confidenceBadge = document.createElement('div');
        const confidenceClass = confidence >= 0.7 ? 'confidence-high' : 
                               confidence >= 0.4 ? 'confidence-medium' : 'confidence-low';
        const confidenceText = confidence >= 0.7 ? 'Alta' : 
                              confidence >= 0.4 ? 'Media' : 'Baja';
        confidenceBadge.className = `confidence-badge ${confidenceClass}`;
        confidenceBadge.textContent = `Confianza: ${confidenceText} (${Math.round(confidence * 100)}%)`;
        summaryDiv.appendChild(confidenceBadge);
        
        suggestionsContent.appendChild(summaryDiv);
    }
    
    // Show boat suggestions
    if (suggestions && suggestions.length > 0) {
        const container = document.createElement('div');
        container.className = 'suggestions-container';
        
        suggestions.slice(0, 5).forEach((boat) => {
            const boatDiv = document.createElement('div');
            boatDiv.className = 'boat-suggestion';
            
            // Store data using dataset (safe from XSS)
            boatDiv.dataset.boatId = boat.boatId || '';
            boatDiv.dataset.boatName = boat.boatName || '';
            boatDiv.dataset.boatPrice = String(boat.finalPrice || 0);
            boatDiv.dataset.boatDate = boat.date || '';
            
            // Header
            const header = document.createElement('div');
            header.className = 'boat-suggestion-header';
            
            const nameTypeDiv = document.createElement('div');
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'boat-name';
            nameDiv.textContent = boat.boatName || '';
            nameTypeDiv.appendChild(nameDiv);
            
            const typeDiv = document.createElement('div');
            typeDiv.className = 'boat-type';
            typeDiv.textContent = boat.boatType || '';
            nameTypeDiv.appendChild(typeDiv);
            
            header.appendChild(nameTypeDiv);
            
            const priceDiv = document.createElement('div');
            priceDiv.className = 'boat-price';
            priceDiv.textContent = `$${(boat.finalPrice || 0).toLocaleString()}`;
            header.appendChild(priceDiv);
            
            boatDiv.appendChild(header);
            
            // Details
            const details = document.createElement('div');
            details.className = 'boat-details';
            
            const capacityItem = document.createElement('div');
            capacityItem.className = 'boat-detail-item';
            capacityItem.textContent = `👥 ${boat.capacity || 0} personas`;
            details.appendChild(capacityItem);
            
            if (boat.date) {
                const dateItem = document.createElement('div');
                dateItem.className = 'boat-detail-item';
                dateItem.textContent = `📅 ${formatDate(boat.date)}`;
                details.appendChild(dateItem);
            }
            
            if (boat.duration) {
                const durationItem = document.createElement('div');
                durationItem.className = 'boat-detail-item';
                durationItem.textContent = `⏱️ ${boat.duration}h`;
                details.appendChild(durationItem);
            }
            
            boatDiv.appendChild(details);
            
            // Availability badge
            const availabilityBadge = document.createElement('div');
            const availabilityClass = boat.isAvailable === true ? 'available' : 
                                     boat.isAvailable === false ? 'unavailable' : 'unknown';
            const availabilityText = boat.isAvailable === true ? '✅ Disponible' : 
                                    boat.isAvailable === false ? '❌ No disponible' : '❓ Verificar';
            availabilityBadge.className = `availability-badge ${availabilityClass}`;
            availabilityBadge.textContent = availabilityText;
            boatDiv.appendChild(availabilityBadge);
            
            // Add click handler
            boatDiv.addEventListener('click', function() {
                const boatId = this.dataset.boatId;
                const boatName = this.dataset.boatName;
                const price = parseFloat(this.dataset.boatPrice || 0);
                const date = this.dataset.boatDate;
                insertBoatIntoMessage(boatId, boatName, price, date);
            });
            
            container.appendChild(boatDiv);
        });
        
        suggestionsContent.appendChild(container);
    } else {
        const msgEl = document.createElement('p');
        msgEl.style.cssText = 'color: #999; font-size: 13px; text-align: center; margin-top: 12px;';
        msgEl.textContent = message || 'No se encontraron barcos disponibles para los criterios detectados';
        suggestionsContent.appendChild(msgEl);
    }
}

// Insert boat details into message composer
function insertBoatIntoMessage(boatId, boatName, price, date) {
    const composer = document.getElementById('message-composer');
    const dateStr = date ? ` para el ${formatDate(date)}` : '';
    
    const suggestion = `\n\n✅ Tenemos disponible el ${boatName}${dateStr} por $${price.toLocaleString()}.\n\n¿Te gustaría reservarlo?`;
    
    composer.value += suggestion;
    composer.focus();
}

// Format date for display
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });
}

// Load analytics on tab switch
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[data-tab="analytics"]').addEventListener('click', () => {
        loadAnalytics();
    });
});

// Template Preview Functions
let previewedTemplateContent = '';

async function showTemplatePreview() {
    const composer = document.getElementById('message-composer');
    const templateContent = composer.value.trim();
    
    if (!templateContent) {
        alert('Escribe o selecciona un template primero');
        return;
    }
    
    if (!currentThread) {
        alert('Selecciona una conversación primero');
        return;
    }
    
    try {
        const response = await fetch('/api/messages/templates/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_content: templateContent,
                thread_id: currentThread.id
            })
        });
        
        if (!response.ok) throw new Error('Error al generar preview');
        
        const result = await response.json();
        
        // Store the rendered content
        previewedTemplateContent = result.rendered;
        
        // Show preview
        const previewDiv = document.getElementById('template-preview');
        const previewContent = document.getElementById('preview-content');
        
        previewContent.textContent = result.rendered;
        previewDiv.style.display = 'block';
        
        // Scroll to preview
        previewDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Error:', error);
        alert('Error al generar vista previa');
    }
}

function closePreview() {
    const previewDiv = document.getElementById('template-preview');
    previewDiv.style.display = 'none';
    previewedTemplateContent = '';
}

function usePreviewedTemplate() {
    const composer = document.getElementById('message-composer');
    composer.value = previewedTemplateContent;
    closePreview();
    
    // Focus on composer
    composer.focus();
}
