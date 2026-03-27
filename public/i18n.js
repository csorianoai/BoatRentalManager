/**
 * i18n.js — Motor de internacionalización para Nadaki Gestión
 * Sin dependencias externas. Basado en JSON + localStorage.
 */
(function () {
  const STORAGE_KEY = 'app_lang';
  const DEFAULT_LANG = 'es';
  const SUPPORTED = ['es', 'en', 'fr', 'it', 'pt'];
  const FLAGS = { es: '🇪🇸', en: '🇺🇸', fr: '🇫🇷', it: '🇮🇹', pt: '🇵🇹' };
  const NAMES = { es: 'ES', en: 'EN', fr: 'FR', it: 'IT', pt: 'PT' };

  var translations = {};
  var currentLang = DEFAULT_LANG;
  var cache = {};
  var ready = false;

  /* ─── Carga del archivo JSON ─── */
  function loadLanguage(lang, callback) {
    if (cache[lang]) {
      translations = cache[lang];
      callback && callback();
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/locales/' + lang + '.json?v=2', true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          cache[lang] = JSON.parse(xhr.responseText);
          translations = cache[lang];
          callback && callback();
        } catch (e) {
          console.error('i18n: JSON inválido para ' + lang, e);
          if (lang !== DEFAULT_LANG) loadLanguage(DEFAULT_LANG, callback);
        }
      } else {
        console.error('i18n: no se pudo cargar /locales/' + lang + '.json (HTTP ' + xhr.status + ')');
        if (lang !== DEFAULT_LANG) loadLanguage(DEFAULT_LANG, callback);
      }
    };
    xhr.onerror = function () {
      console.error('i18n: error de red al cargar ' + lang);
      if (lang !== DEFAULT_LANG) loadLanguage(DEFAULT_LANG, callback);
    };
    xhr.send();
  }

  /* ─── Traducción de clave ─── */
  function t(key) {
    if (translations[key] !== undefined) return translations[key];
    if (key) console.warn('i18n: clave faltante "' + key + '" en ' + currentLang);
    return key || '';
  }

  /* ─── Aplicar traducciones al DOM ─── */
  function applyTranslations(root) {
    var container = root || document;
    container.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      el.textContent = val;
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
      var key = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-' + attr);
      if (attr && key) el.setAttribute(attr, t(key));
    });
    document.documentElement.lang = currentLang;
    updateSelectorState();
  }

  /* ─── Actualizar estado visual del selector ─── */
  function updateSelectorState() {
    var display = document.getElementById('i18n-current');
    if (display) display.textContent = FLAGS[currentLang] + ' ' + NAMES[currentLang];
    document.querySelectorAll('.i18n-option').forEach(function (btn) {
      btn.classList.toggle('i18n-active', btn.dataset.lang === currentLang);
    });
    try {
      document.dispatchEvent(new CustomEvent('i18n:applied', { detail: { lang: currentLang } }));
    } catch (e) {}
  }

  /* ─── Traducir contenido dinámico (modales, tabs, etc.) ─── */
  function translateDynamicContent(container) {
    applyTranslations(container || document);
  }

  /* ─── Cambiar idioma ─── */
  function changeLanguage(lang) {
    if (!SUPPORTED.includes(lang)) {
      console.warn('i18n: idioma no soportado "' + lang + '"');
      return;
    }
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    var dd = document.getElementById('i18n-dropdown');
    if (dd) dd.classList.remove('i18n-open');
    loadLanguage(lang, function () {
      applyTranslations();
    });
  }

  /* ─── Construir el selector desplegable ─── */
  function buildSelector() {
    var wrapper = document.createElement('div');
    wrapper.className = 'i18n-selector';
    wrapper.id = 'i18n-selector-root';

    var trigger = document.createElement('button');
    trigger.className = 'i18n-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Selector de idioma');
    trigger.innerHTML = '<span id="i18n-current">' + FLAGS[currentLang] + ' ' + NAMES[currentLang] + '</span><span class="i18n-caret">&#9662;</span>';

    var dropdown = document.createElement('div');
    dropdown.className = 'i18n-dropdown';
    dropdown.id = 'i18n-dropdown';

    SUPPORTED.forEach(function (lng) {
      var btn = document.createElement('button');
      btn.className = 'i18n-option' + (lng === currentLang ? ' i18n-active' : '');
      btn.type = 'button';
      btn.dataset.lang = lng;
      btn.textContent = FLAGS[lng] + ' ' + NAMES[lng];
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        changeLanguage(lng);
      });
      dropdown.appendChild(btn);
    });

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('i18n-open');
    });

    document.addEventListener('click', function () {
      dropdown.classList.remove('i18n-open');
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    return wrapper;
  }

  /* ─── Inyectar selector en el header ─── */
  function injectSelector() {
    if (document.getElementById('i18n-selector-root')) return;

    var sel = buildSelector();

    var existing = document.getElementById('langToggle');
    if (existing) {
      existing.parentNode.replaceChild(sel, existing);
      return;
    }

    var container = document.querySelector('.header-controls, .header-actions');
    if (container) {
      container.insertBefore(sel, container.firstChild);
      return;
    }

    var header = document.querySelector('header');
    if (header) {
      sel.style.cssText = 'position:absolute;top:12px;right:16px;z-index:9999;';
      header.style.position = 'relative';
      header.appendChild(sel);
      return;
    }

    sel.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:99999;';
    document.body.appendChild(sel);
  }

  /* ─── Inyectar estilos CSS ─── */
  function injectStyles() {
    if (document.getElementById('i18n-styles')) return;
    var style = document.createElement('style');
    style.id = 'i18n-styles';
    style.textContent =
      '.i18n-selector{position:relative;display:inline-flex;align-items:center;}' +
      '.i18n-trigger{display:flex;align-items:center;gap:5px;padding:5px 10px;' +
      'background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);' +
      'border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:inherit;' +
      'white-space:nowrap;transition:background 0.2s;}' +
      '.i18n-trigger:hover{background:rgba(255,255,255,0.28);}' +
      '.i18n-caret{font-size:10px;opacity:0.65;margin-left:2px;}' +
      '.i18n-dropdown{display:none;position:absolute;top:calc(100% + 6px);right:0;' +
      'background:#fff;border:1px solid #e0e6ed;border-radius:8px;' +
      'box-shadow:0 6px 20px rgba(0,0,0,0.13);overflow:hidden;z-index:99999;min-width:110px;}' +
      '.i18n-dropdown.i18n-open{display:block;}' +
      '.i18n-option{display:flex;align-items:center;gap:8px;width:100%;padding:8px 14px;' +
      'background:none;border:none;cursor:pointer;font-size:13px;font-weight:500;' +
      'color:#333;text-align:left;transition:background 0.15s;white-space:nowrap;}' +
      '.i18n-option:hover{background:#f4f6f9;}' +
      '.i18n-option.i18n-active{background:#e8f0fe;color:#0066cc;font-weight:700;}';
    document.head.appendChild(style);
  }

  /* ─── Inicialización ─── */
  function initLanguage() {
    var saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    currentLang = SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
    injectStyles();
    loadLanguage(currentLang, function () {
      injectSelector();
      applyTranslations();
      ready = true;
    });
  }

  /* ─── API pública ─── */
  window.i18n = {
    t: t,
    change: changeLanguage,
    apply: applyTranslations,
    translateDynamicContent: translateDynamicContent,
    current: function () { return currentLang; },
    isReady: function () { return ready; }
  };
  window.changeLanguage = changeLanguage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
  } else {
    initLanguage();
  }
})();
