/**
 * i18n.js — Motor de internacionalización para Nadaki Gestión
 * v3.1 — Sin dependencias externas. Basado en JSON + localStorage.
 * Soporta: es, en, fr, it, pt, tl
 * Dropdown con position:fixed para evitar clipping por overflow:hidden
 * Debug panel visible incluido (clase i18n-debug-hide para ocultar)
 */
(function () {
  var STORAGE_KEY = 'app_lang';
  var DEFAULT_LANG = 'es';
  var SUPPORTED = ['es', 'en', 'fr', 'it', 'pt', 'tl'];
  var FLAGS   = { es: '🇪🇸', en: '🇺🇸', fr: '🇫🇷', it: '🇮🇹', pt: '🇵🇹', tl: '🇵🇭' };
  var NAMES   = { es: 'ES',   en: 'EN',   fr: 'FR',   it: 'IT',   pt: 'PT',   tl: 'TL'  };

  var translations = {};
  var currentLang  = DEFAULT_LANG;
  var cache        = {};
  var ready        = false;

  /* ─────────────────────────────────────────────────────────────
     CARGA DEL JSON
  ───────────────────────────────────────────────────────────── */
  function loadLanguage(lang, callback) {
    if (!SUPPORTED.includes(lang)) {
      console.warn('[i18n] Idioma no soportado: "' + lang + '". Usando "' + DEFAULT_LANG + '".');
      lang = DEFAULT_LANG;
    }

    if (cache[lang]) {
      translations = cache[lang];
      console.log('[i18n] Idioma "' + lang + '" cargado desde caché (' + Object.keys(translations).length + ' claves).');
      if (callback) callback();
      return;
    }

    var url = '/locales/' + lang + '.json?v=4';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          cache[lang] = JSON.parse(xhr.responseText);
          translations = cache[lang];
          debugStats.lastFetch = '200 OK (' + lang + '.json)';
          console.log('[i18n] ✅ Cargado "' + lang + '" — ' + Object.keys(translations).length + ' claves.');
          if (callback) callback();
        } catch (e) {
          console.error('[i18n] ❌ JSON inválido para "' + lang + '":', e.message);
          if (lang !== DEFAULT_LANG) {
            console.warn('[i18n] Fallback a "' + DEFAULT_LANG + '".');
            loadLanguage(DEFAULT_LANG, callback);
          }
        }
      } else {
        debugStats.lastFetch = 'HTTP ' + xhr.status + ' (' + lang + '.json)';
        console.error('[i18n] ❌ HTTP ' + xhr.status + ' al cargar ' + url);
        if (lang !== DEFAULT_LANG) {
          console.warn('[i18n] Fallback a "' + DEFAULT_LANG + '".');
          loadLanguage(DEFAULT_LANG, callback);
        }
      }
    };
    xhr.onerror = function () {
      console.error('[i18n] ❌ Error de red al cargar ' + url);
      if (lang !== DEFAULT_LANG) loadLanguage(DEFAULT_LANG, callback);
    };
    xhr.send();
  }

  /* ─────────────────────────────────────────────────────────────
     TRADUCCIÓN DE CLAVE
  ───────────────────────────────────────────────────────────── */
  function t(key) {
    if (!key) return '';
    if (translations[key] !== undefined) return translations[key];
    debugStats.missing++;
    console.warn('[i18n] ⚠️ Clave faltante: "' + key + '" en idioma "' + currentLang + '"');
    return key;
  }

  /* ─────────────────────────────────────────────────────────────
     APLICAR TRADUCCIONES AL DOM
  ───────────────────────────────────────────────────────────── */
  function applyTranslations(root) {
    if (!root && typeof root !== 'undefined') {
      console.warn('[i18n] applyTranslations: contenedor inválido.');
      return;
    }
    var container = root || document;
    debugStats.translated = 0;
    debugStats.missing = 0;

    container.querySelectorAll('[data-i18n]').forEach(function (el) {
      debugStats.translated++;
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      /* Sólo modificar textContent si el elemento NO tiene hijos de elemento
         (para evitar destruir íconos SVG u otros elementos hijos) */
      var hasElementChildren = false;
      el.childNodes.forEach(function (n) {
        if (n.nodeType === 1) hasElementChildren = true;
      });
      if (hasElementChildren) {
        /* Reemplazar sólo el primer nodo de texto */
        el.childNodes.forEach(function (n) {
          if (n.nodeType === 3 && n.nodeValue.trim()) {
            n.nodeValue = val;
          }
        });
      } else {
        el.textContent = val;
      }
    });

    container.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });

    container.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });

    container.querySelectorAll('[data-i18n-value]').forEach(function (el) {
      el.setAttribute('value', t(el.getAttribute('data-i18n-value')));
    });

    container.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      var attr = el.getAttribute('data-i18n-attr');
      var key  = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-' + attr);
      if (attr && key) el.setAttribute(attr, t(key));
    });

    document.documentElement.lang = currentLang;
    updateSelectorUI();
    updateDebugPanel();

    try {
      document.dispatchEvent(new CustomEvent('i18n:applied', { detail: { lang: currentLang } }));
    } catch (e) {}
  }

  /* ─────────────────────────────────────────────────────────────
     CONTENIDO DINÁMICO (modales, tabs, etc.)
  ───────────────────────────────────────────────────────────── */
  function translateDynamicContent(container) {
    if (!container) {
      console.warn('[i18n] translateDynamicContent: se requiere un contenedor válido.');
      return;
    }
    applyTranslations(container);
  }

  /* ─────────────────────────────────────────────────────────────
     CAMBIAR IDIOMA
  ───────────────────────────────────────────────────────────── */
  function changeLanguage(lang) {
    if (!SUPPORTED.includes(lang)) {
      console.warn('[i18n] Idioma no soportado: "' + lang + '". Opciones: ' + SUPPORTED.join(', '));
      return;
    }
    console.log('[i18n] Cambiando idioma: ' + currentLang + ' → ' + lang);
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    closeDropdown();
    loadLanguage(lang, function () {
      applyTranslations();
    });
  }

  /* ─────────────────────────────────────────────────────────────
     SELECTOR — DROPDOWN CON POSITION:FIXED
     (evita el clipping por overflow:hidden en cualquier ancestro)
  ───────────────────────────────────────────────────────────── */
  var dropdownEl = null;
  var triggerEl  = null;
  var selectorRoot = null;

  function buildSelector() {
    var wrapper = document.createElement('div');
    wrapper.className = 'i18n-selector';
    wrapper.id = 'i18n-selector-root';
    wrapper.setAttribute('role', 'navigation');
    wrapper.setAttribute('aria-label', 'Selector de idioma');

    var btn = document.createElement('button');
    btn.className = 'i18n-trigger';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-label', 'Cambiar idioma');
    btn.innerHTML = '<span id="i18n-current">' + FLAGS[currentLang] + ' ' + NAMES[currentLang] + '</span><span class="i18n-caret" aria-hidden="true">&#9662;</span>';

    var dd = document.createElement('div');
    dd.className = 'i18n-dropdown';
    dd.id = 'i18n-dropdown';
    dd.setAttribute('role', 'listbox');

    SUPPORTED.forEach(function (lng) {
      var opt = document.createElement('button');
      opt.className = 'i18n-option' + (lng === currentLang ? ' i18n-active' : '');
      opt.type = 'button';
      opt.dataset.lang = lng;
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', lng === currentLang ? 'true' : 'false');
      opt.textContent = FLAGS[lng] + ' ' + NAMES[lng];
      opt.addEventListener('click', function (e) {
        e.stopPropagation();
        changeLanguage(lng);
      });
      dd.appendChild(opt);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown();
    });

    /* Append dropdown to BODY with fixed positioning to avoid overflow clipping */
    document.body.appendChild(dd);
    dropdownEl = dd;
    triggerEl  = btn;
    selectorRoot = wrapper;

    wrapper.appendChild(btn);
    return wrapper;
  }

  function getDropdownPosition() {
    if (!triggerEl) return { top: 0, right: 0 };
    var rect = triggerEl.getBoundingClientRect();
    return {
      top:   rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right)
    };
  }

  function openDropdown() {
    if (!dropdownEl) return;
    var pos = getDropdownPosition();
    dropdownEl.style.top   = pos.top + 'px';
    dropdownEl.style.right = pos.right + 'px';
    dropdownEl.classList.add('i18n-open');
    if (triggerEl) triggerEl.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    if (!dropdownEl) return;
    dropdownEl.classList.remove('i18n-open');
    if (triggerEl) triggerEl.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown() {
    if (!dropdownEl) return;
    if (dropdownEl.classList.contains('i18n-open')) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  /* ─────────────────────────────────────────────────────────────
     ACTUALIZAR UI DEL SELECTOR
  ───────────────────────────────────────────────────────────── */
  function updateSelectorUI() {
    var display = document.getElementById('i18n-current');
    if (display) display.textContent = FLAGS[currentLang] + ' ' + NAMES[currentLang];

    if (dropdownEl) {
      dropdownEl.querySelectorAll('.i18n-option').forEach(function (btn) {
        var isActive = btn.dataset.lang === currentLang;
        btn.classList.toggle('i18n-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────
     INYECTAR SELECTOR EN EL HEADER
  ───────────────────────────────────────────────────────────── */
  function injectSelector() {
    if (document.getElementById('i18n-selector-root')) return;

    var sel = buildSelector();

    /* Reemplazar #langToggle si existe (dashboard.html) */
    var existing = document.getElementById('langToggle');
    if (existing) {
      existing.parentNode.replaceChild(sel, existing);
      return;
    }

    /* Insertar en .header-controls o .header-actions */
    var container = document.querySelector('.header-controls, .header-actions');
    if (container) {
      container.insertBefore(sel, container.firstChild);
      return;
    }

    /* Insertar en header absoluto */
    var header = document.querySelector('header');
    if (header) {
      sel.style.cssText = 'position:absolute;top:12px;right:16px;z-index:9999;';
      header.style.position = 'relative';
      header.appendChild(sel);
      return;
    }

    /* Último recurso: fixed en la esquina */
    sel.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:99999;';
    document.body.appendChild(sel);
  }

  /* ─────────────────────────────────────────────────────────────
     ESTILOS CSS
  ───────────────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('i18n-styles')) return;
    var style = document.createElement('style');
    style.id = 'i18n-styles';
    style.textContent = [
      '.i18n-selector{position:relative;display:inline-flex;align-items:center;flex-shrink:0;}',
      '.i18n-trigger{',
        'display:flex;align-items:center;gap:5px;padding:5px 10px;',
        'background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);',
        'border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:inherit;',
        'white-space:nowrap;transition:background 0.2s;line-height:1.4;',
      '}',
      '.i18n-trigger:hover{background:rgba(255,255,255,0.28);}',
      '.i18n-trigger:focus-visible{outline:2px solid rgba(255,255,255,0.6);outline-offset:2px;}',
      '.i18n-caret{font-size:10px;opacity:0.65;margin-left:2px;}',

      /* Dropdown está en el BODY con position:fixed para evitar overflow:hidden */
      '#i18n-dropdown{',
        'display:none;',
        'position:fixed;',
        'background:#fff;',
        'border:1px solid #e0e6ed;',
        'border-radius:8px;',
        'box-shadow:0 8px 24px rgba(0,0,0,0.15);',
        'overflow:hidden;',
        'z-index:2147483647;',
        'min-width:120px;',
      '}',
      '#i18n-dropdown.i18n-open{display:block;}',
      '.i18n-option{',
        'display:flex;align-items:center;gap:8px;width:100%;padding:9px 16px;',
        'background:none;border:none;cursor:pointer;font-size:13px;font-weight:500;',
        'color:#222;text-align:left;white-space:nowrap;transition:background 0.12s;',
      '}',
      '.i18n-option:hover{background:#f4f6f9;}',
      '.i18n-option:focus-visible{background:#f4f6f9;outline:none;}',
      '.i18n-option.i18n-active{background:#e8f0fe;color:#0055bb;font-weight:700;}'
    ].join('');
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────────────────────────
     PANEL DE DEBUG VISUAL
  ───────────────────────────────────────────────────────────── */
  var debugEl = null;
  var debugStats = { translated: 0, missing: 0, fetches: 0, lastFetch: '' };

  function updateDebugPanel() {
    if (!debugEl) return;
    debugEl.innerHTML = [
      '<b>i18n Debug</b>',
      'currentLanguage: <b>' + currentLang + '</b>',
      'initLanguage: <b>' + (ready ? '✅' : '⏳') + '</b>',
      'selectorMounted: <b>' + (!!document.getElementById('i18n-selector-root')) + '</b>',
      'translationsLoaded: <b>' + Object.keys(translations).length + '</b>',
      'translatedNodes: <b>' + debugStats.translated + '</b>',
      'missingKeys: <b>' + debugStats.missing + '</b>',
      'fetchStatus: <b>' + debugStats.lastFetch + '</b>',
      '<small style="opacity:.6">app_lang → localStorage: ' + (localStorage.getItem(STORAGE_KEY)||'—') + '</small>',
      '<button onclick="document.getElementById(\'i18n-debug-panel\').remove()" style="margin-top:4px;padding:2px 6px;font-size:10px;cursor:pointer;border:1px solid #888;border-radius:3px;background:#f8f8f8;">✕ Cerrar</button>'
    ].join('<br>');
  }

  function showDebugPanel() {
    if (document.getElementById('i18n-debug-panel')) { updateDebugPanel(); return; }
    var panel = document.createElement('div');
    panel.id = 'i18n-debug-panel';
    panel.style.cssText = [
      'position:fixed;bottom:16px;left:16px;z-index:2147483646;',
      'background:rgba(0,0,0,0.85);color:#0f0;font-family:monospace;font-size:11px;',
      'padding:10px 14px;border-radius:8px;line-height:1.8;',
      'box-shadow:0 4px 16px rgba(0,0,0,0.4);max-width:280px;word-break:break-all;',
      'pointer-events:auto;'
    ].join('');
    document.body.appendChild(panel);
    debugEl = panel;
    updateDebugPanel();
  }

  /* ─────────────────────────────────────────────────────────────
     INICIALIZACIÓN
  ───────────────────────────────────────────────────────────── */
  function initLanguage() {
    var saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    currentLang = SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
    console.log('[i18n] Iniciando. Idioma guardado: "' + saved + '". Usando: "' + currentLang + '".');

    injectStyles();

    loadLanguage(currentLang, function () {
      injectSelector();
      applyTranslations();
      ready = true;
      console.log('[i18n] ✅ Sistema listo. Idioma activo: "' + currentLang + '".');
      updateDebugPanel();
    });
  }

  /* ─────────────────────────────────────────────────────────────
     CERRAR DROPDOWN AL HACER CLICK FUERA
  ───────────────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    if (!selectorRoot) return;
    if (dropdownEl && !selectorRoot.contains(e.target) && !dropdownEl.contains(e.target)) {
      closeDropdown();
    }
  });

  /* Reposicionar si la ventana cambia de tamaño */
  window.addEventListener('resize', function () {
    if (dropdownEl && dropdownEl.classList.contains('i18n-open')) {
      var pos = getDropdownPosition();
      dropdownEl.style.top   = pos.top + 'px';
      dropdownEl.style.right = pos.right + 'px';
    }
  });

  /* ─────────────────────────────────────────────────────────────
     API PÚBLICA
  ───────────────────────────────────────────────────────────── */
  window.i18n = {
    t:                    t,
    change:               changeLanguage,
    apply:                applyTranslations,
    translateDynamicContent: translateDynamicContent,
    current:              function () { return currentLang; },
    isReady:              function () { return ready; },
    supported:            function () { return SUPPORTED.slice(); },
    debug:                showDebugPanel
  };
  window.changeLanguage = changeLanguage;
  /* Activar panel de debug desde consola: window.i18nDebug() */
  window.i18nDebug = showDebugPanel;

  /* ─────────────────────────────────────────────────────────────
     ARRANQUE
  ───────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
  } else {
    initLanguage();
  }
})();
