/* ================================================================
   CENTRO OPERATIVO NADAKI — Knowledge Base + Search Engine
   ================================================================ */

'use strict';

/* ── KNOWLEDGE BASE ── */
const KB = [
  {
    id: 'kb-booking-create',
    category: 'Bookings',
    title: 'Cómo registrar un booking correctamente',
    keywords: ['booking', 'crear', 'registrar', 'nuevo', 'reserva', 'crear booking'],
    steps: [
      'Ve a Fleet Operations Center en el menú Operaciones.',
      'Haz clic en "Nuevo Booking" en el día correspondiente.',
      'Ingresa cliente, barco, fecha, hora y duración.',
      'Define el total del servicio y el depósito recibido.',
      'Si hay broker, selecciona el broker antes de guardar.',
      'El sistema crea automáticamente la Cuenta por Cobrar si hay saldo pendiente.',
    ],
    avoid: 'No registres el mismo booking dos veces. No mezcles el depósito con el pago final — son pasos separados.',
    link: '/fleet.html#foc',
    linkLabel: 'Ir a Fleet Operations Center',
    faqId: 'faq-booking-create',
  },
  {
    id: 'kb-mark-paid',
    category: 'Cobros',
    title: 'Cómo marcar un pago recibido',
    keywords: ['pago', 'cobrar', 'mark paid', 'marcar pagado', 'saldo', 'cobro', 'balance'],
    steps: [
      'Ve a Contabilidad → Cuentas por Cobrar.',
      'Busca la cuenta correspondiente al booking.',
      'Haz clic en "Marcar Pagado".',
      'El sistema registra la transacción de ingreso automáticamente.',
      'Verifica en el Executive Dashboard que el saldo refleje el pago.',
    ],
    avoid: 'No registres el ingreso manualmente en Transacciones si ya usaste "Marcar Pagado" — se duplicaría el ingreso.',
    link: '/accounting.html',
    linkLabel: 'Ir a Contabilidad',
    faqId: 'faq-mark-paid',
  },
  {
    id: 'kb-deposit',
    category: 'Depósitos',
    title: 'Cómo registrar un depósito bancario',
    keywords: ['depositar', 'depósito', 'bancario', 'bank', 'deposit', 'depositado'],
    steps: [
      'El booking debe estar previamente marcado como "Pagado".',
      'Ve a Contabilidad → Depósitos.',
      'Busca el booking y haz clic en "Marcar Depositado".',
      'Ingresa la fecha de depósito y referencia bancaria si aplica.',
      'El sistema crea el registro en Bank Statements y reconcilia la transacción.',
    ],
    avoid: 'Depositar NO crea un nuevo ingreso — solo concilia el ingreso ya registrado. No uses esta función sin haber marcado el pago primero.',
    link: '/accounting.html#deposits',
    linkLabel: 'Ir a Depósitos',
    faqId: 'faq-deposit',
  },
  {
    id: 'kb-bank-statement',
    category: 'Reconciliación',
    title: 'Cómo subir un bank statement',
    keywords: ['bank statement', 'estado de cuenta', 'csv', 'subir', 'importar', 'banco'],
    steps: [
      'Ve a Contabilidad → Conciliación Bancaria.',
      'Haz clic en "Importar CSV".',
      'Sube el archivo CSV de tu banco (formato estándar).',
      'El sistema corre auto-match automáticamente.',
      'Revisa los registros "Unmatched" y asígnalos manualmente si aplica.',
    ],
    avoid: 'No subas el mismo estado de cuenta dos veces — el sistema detecta duplicados, pero es mejor evitarlo.',
    link: '/accounting.html#reconciliation',
    linkLabel: 'Ir a Conciliación',
    faqId: 'faq-bank-statement',
  },
  {
    id: 'kb-reconcile',
    category: 'Reconciliación',
    title: 'Cómo reconciliar pagos bancarios',
    keywords: ['reconciliar', 'conciliar', 'match', 'matched', 'unmatched', 'reconciliación', 'conciliación'],
    steps: [
      'Ve a Contabilidad → Conciliación Bancaria.',
      'Revisa los registros con estado "Unmatched".',
      'Busca la transacción correspondiente en el sistema.',
      'Haz clic en "Match" para enlazar ambos registros.',
      'Los registros "Matched" aparecen reconciliados en el Executive Dashboard.',
    ],
    avoid: 'No borres registros bancarios sin reconciliarlos primero — se pierde la trazabilidad.',
    link: '/accounting.html#reconciliation',
    linkLabel: 'Ir a Conciliación',
    faqId: 'faq-reconcile',
  },
  {
    id: 'kb-expense',
    category: 'Gastos',
    title: 'Cómo registrar un gasto operativo',
    keywords: ['gasto', 'expense', 'combustible', 'mantenimiento', 'crew', 'registrar gasto', 'costo'],
    steps: [
      'Ve a Contabilidad → Gastos o Flota → Barcos según el tipo.',
      'Para combustible: Flota → Combustible.',
      'Para mantenimiento: Flota → Mantenimiento.',
      'Para crew (capitán/stew): Contabilidad → Comisiones.',
      'Para gastos recurrentes: Flota → Gastos Recurrentes.',
      'Asigna siempre el barco correcto para análisis por embarcación.',
    ],
    avoid: 'No registres gastos como ingresos por error. No mezcles gastos de diferentes barcos en un mismo registro.',
    link: '/accounting.html#gastos-analisis',
    linkLabel: 'Ir a Análisis de Gastos',
    faqId: 'faq-expense',
  },
  {
    id: 'kb-who-owes',
    category: 'Cobros',
    title: 'Cómo ver quién debe dinero',
    keywords: ['quien debe', 'saldo pendiente', 'AR', 'cuentas por cobrar', 'pendiente', 'owes', 'debe'],
    steps: [
      'Ve al Executive Dashboard → Tab Cobros.',
      'La sección "Cuentas por Cobrar" muestra todos los saldos pendientes.',
      'Filtra por "Sin depósito" o "Alto riesgo" para priorizar.',
      'Los KPIs superiores muestran totales: AR Pendiente Total, Clientes, Brokers.',
      'Usa el botón "Recordatorio" para enviar WhatsApp al cliente.',
    ],
    avoid: '',
    link: '/reports.html#f1',
    linkLabel: 'Ir a Executive Dashboard',
    faqId: 'faq-who-owes',
  },
  {
    id: 'kb-reminder',
    category: 'Cobros',
    title: 'Cómo enviar un recordatorio de pago',
    keywords: ['recordatorio', 'reminder', 'whatsapp', 'enviar', 'cobrar', 'notificación'],
    steps: [
      'Ve al Executive Dashboard → Tab Cobros.',
      'En "Cuentas por Cobrar" o "Próximos Bookings", busca el cliente.',
      'Haz clic en el botón "Recordatorio".',
      'El sistema envía un WhatsApp automático con el saldo pendiente.',
      'El cron diario (9 AM ET) también envía recordatorios automáticamente.',
    ],
    avoid: 'El sistema tiene protección anti-spam de 24 horas — no intentes enviar dos recordatorios seguidos al mismo cliente.',
    link: '/reports.html#f1',
    linkLabel: 'Ir a Executive Dashboard',
    faqId: 'faq-reminder',
  },
  {
    id: 'kb-pricing',
    category: 'Pricing',
    title: 'Cómo revisar el pricing dinámico',
    keywords: ['pricing', 'precio', 'dinámico', 'recomendado', 'occupancy', 'tarifa', 'dynamic pricing'],
    steps: [
      'Ve a Comercial → Pricing Dinámico.',
      'El sistema muestra el precio recomendado por barco y fecha.',
      'Revisa los "reasons" que explican cada ajuste (ocupación, fin de semana, lead time).',
      'Aplica el precio recomendado o ajusta manualmente si hay circunstancias especiales.',
      'Compara con el precio base en Comercial → Precios.',
    ],
    avoid: 'No ignores las recomendaciones sin revisar los reasons — pueden reflejar alta demanda o temporada baja.',
    link: '/dynamic-pricing.html',
    linkLabel: 'Ir a Pricing Dinámico',
    faqId: 'faq-pricing',
  },
  {
    id: 'kb-broker',
    category: 'Brokers',
    title: 'Cómo manejar un booking de broker',
    keywords: ['broker', 'agencia', 'intermediario', 'comisión', 'broker pending'],
    steps: [
      'Al crear el depósito/booking, selecciona el broker en el campo correspondiente.',
      'El payer_type se asigna como "broker" automáticamente.',
      'La Cuenta por Cobrar se crea a nombre del broker, no del cliente final.',
      'En Tab Cobros, los brokers aparecen con badge BROKER en color morado.',
      'El saldo pendiente de brokers se muestra separado en los KPIs.',
    ],
    avoid: 'No registres el pago de un broker como pago de cliente directo — afecta la trazabilidad de comisiones.',
    link: '/accounting.html',
    linkLabel: 'Ir a Contabilidad',
    faqId: 'faq-broker',
  },
];

/* ── SEARCH ENGINE ── */
function initSearch() {
  const input   = document.getElementById('oc-search-input');
  const results = document.getElementById('oc-search-results');
  if (!input || !results) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.classList.remove('visible'); return; }

    const hits = KB.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some(k => k.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );

    if (!hits.length) {
      results.innerHTML = `<div class="sr-empty">Sin resultados para "${escH(q)}" — intenta con otras palabras</div>`;
    } else {
      results.innerHTML = hits.map(item => `
        <button class="sr-item" onclick="scrollToFAQ('${item.faqId}')" data-testid="sr-${item.id}">
          <span class="sr-cat">${escH(item.category)}</span>
          <div>
            <div class="sr-title">${escH(item.title)}</div>
            <div class="sr-desc">${escH(item.steps[0] || '')}</div>
          </div>
        </button>`).join('');
    }
    results.classList.add('visible');
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.remove('visible');
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { results.classList.remove('visible'); input.blur(); }
  });
}

function scrollToFAQ(faqId) {
  const el = document.getElementById(faqId);
  const input   = document.getElementById('oc-search-input');
  const results = document.getElementById('oc-search-results');
  if (results) results.classList.remove('visible');
  if (input) input.value = '';
  if (!el) return;
  el.classList.add('open');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('oc-highlight');
  setTimeout(() => el.classList.remove('oc-highlight'), 1500);
}

/* ── FAQ ACCORDION ── */
function initFAQ() {
  document.querySelectorAll('.oc-faq-hd').forEach(hd => {
    hd.addEventListener('click', () => {
      const card = hd.closest('.oc-faq-card');
      card.classList.toggle('open');
    });
  });
}

/* ── UTILS ── */
function escH(s) {
  return String(s || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ── ANALYTICS (localStorage, no backend) ── */
const ocAnalytics = (() => {
  const KEY = 'oc_analytics_v1';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{"searches":[],"clicks":[]}');
    } catch (_) {
      return { searches: [], clicks: [] };
    }
  }

  function save(data) {
    try {
      // Keep max 200 entries each to avoid localStorage bloat
      data.searches = data.searches.slice(-200);
      data.clicks   = data.clicks.slice(-200);
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (_) { /* storage full or blocked — silent */ }
  }

  function trackSearch(term) {
    if (!term || term.length < 2) return;
    const data = load();
    data.searches.push({ term: term.toLowerCase().trim(), ts: new Date().toISOString() });
    save(data);
    updateUsagePanel(data);
  }

  function trackClick(target, label) {
    const data = load();
    data.clicks.push({ target, label: label || target, ts: new Date().toISOString() });
    save(data);
    updateUsagePanel(data);
  }

  function getTopModule(clicks) {
    if (!clicks.length) return '—';
    const counts = {};
    clicks.forEach(c => {
      const key = c.target.split('#')[0].replace(/^\//, '').replace('.html', '') || 'home';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  function updateUsagePanel(data) {
    const panel = document.getElementById('oc-usage-panel');
    if (!panel) return;
    const total = data.searches.length + data.clicks.length;
    if (total === 0) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const vs = document.getElementById('val-searches');
    const vc = document.getElementById('val-clicks');
    const vt = document.getElementById('val-top');
    if (vs) vs.textContent = data.searches.length;
    if (vc) vc.textContent = data.clicks.length;
    if (vt) vt.textContent = getTopModule(data.clicks);
  }

  function clearAll() {
    try { localStorage.removeItem(KEY); } catch (_) {}
    const panel = document.getElementById('oc-usage-panel');
    if (panel) panel.style.display = 'none';
  }

  function init() {
    updateUsagePanel(load());
  }

  return { trackSearch, trackClick, clearAll, init };
})();

/* ── CLICK TRACKING (event delegation) ── */
function initClickTracking() {
  document.addEventListener('click', (e) => {
    // Track quick-action links
    const qa = e.target.closest('.oc-qa-item');
    if (qa) {
      ocAnalytics.trackClick(qa.getAttribute('href') || '', qa.querySelector('.oc-qa-label')?.textContent || '');
      return;
    }
    // Track oc-btn / faq links
    const btn = e.target.closest('.oc-btn[href], .oc-cl-link[data-track]');
    if (btn) {
      const track = btn.getAttribute('data-track');
      if (track) {
        const [target, label] = track.split('|');
        ocAnalytics.trackClick(target, label);
      } else {
        ocAnalytics.trackClick(btn.getAttribute('href') || '', btn.textContent.trim());
      }
    }
  });
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  initSearch();
  initFAQ();
  initClickTracking();
  ocAnalytics.init();

  // Wire search tracking into the existing input listener
  const input = document.getElementById('oc-search-input');
  if (input) {
    let searchTimer;
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const term = input.value.trim();
      if (term.length >= 2) {
        searchTimer = setTimeout(() => ocAnalytics.trackSearch(term), 1200);
      }
    });
  }
});
