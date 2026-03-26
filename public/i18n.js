/**
 * i18n.js — Motor de internacionalización ligero para Nadaki Gestión
 * Sin dependencias externas. Basado en JSON + localStorage.
 */
(function () {
  const STORAGE_KEY = 'app_lang';
  const DEFAULT_LANG = 'es';
  const SUPPORTED = ['es', 'en', 'fr', 'it', 'pt'];
  const FLAGS = { es: '🇪🇸', en: '🇺🇸', fr: '🇫🇷', it: '🇮🇹', pt: '🇵🇹' };
  const NAMES = { es: 'ES', en: 'EN', fr: 'FR', it: 'IT', pt: 'PT' };

  let translations = {};
  let currentLang = DEFAULT_LANG;
  const cache = {};

  /* ─── Carga de idioma ─── */
  async function loadLanguage(lang) {
    if (cache[lang]) { translations = cache[lang]; return; }
    try {
      const res = await fetch('/locales/' + lang + '.json?v=' + (window._i18nVer || '1'));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      cache[lang] = await res.json();
      translations = cache[lang];
    } catch (e) {
      console.warn('i18n: no se pudo cargar ' + lang + ', usando ' + DEFAULT_LANG);
      if (lang !== DEFAULT_LANG) await loadLanguage(DEFAULT_LANG);
    }
  }

  /* ─── Traducción de clave ─── */
  function t(key) {
    return translations[key] !== undefined ? translations[key] : key;
  }

  /* ─── Aplicar traducciones al DOM ─── */
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      var attr = el.getAttribute('data-i18n-attr');
      if (attr) {
        el.setAttribute(attr, val);
      } else if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.placeholder !== undefined && !attr) {
        el.placeholder = val;
      } else {
        el.textContent = val;
      }
    });
    document.documentElement.lang = currentLang;
    var display = document.getElementById('i18n-current');
    if (display) display.textContent = FLAGS[currentLang] + ' ' + NAMES[currentLang];
    document.querySelectorAll('.i18n-option').forEach(function (btn) {
      btn.classList.toggle('i18n-active', btn.dataset.lang === currentLang);
    });
  }

  /* ─── Cambiar idioma ─── */
  async function changeLanguage(lang) {
    if (!SUPPORTED.includes(lang)) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    await loadLanguage(lang);
    applyTranslations();
    var dd = document.getElementById('i18n-dropdown');
    if (dd) dd.classList.remove('i18n-open');
  }

  /* ─── Construir selector ─── */
  function buildSelector() {
    var wrapper = document.createElement('div');
    wrapper.className = 'i18n-selector';

    var trigger = document.createElement('button');
    trigger.className = 'i18n-trigger';
    trigger.type = 'button';
    trigger.innerHTML = '<span id="i18n-current">' + FLAGS[currentLang] + ' ' + NAMES[currentLang] + '</span><span class="i18n-caret">&#9662;</span>';

    var dropdown = document.createElement('div');
    dropdown.className = 'i18n-dropdown';
    dropdown.id = 'i18n-dropdown';

    SUPPORTED.forEach(function (lang) {
      var btn = document.createElement('button');
      btn.className = 'i18n-option' + (lang === currentLang ? ' i18n-active' : '');
      btn.type = 'button';
      btn.dataset.lang = lang;
      btn.textContent = FLAGS[lang] + ' ' + NAMES[lang];
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        changeLanguage(lang);
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

  /* ─── Inyectar selector en el DOM ─── */
  function injectSelector() {
    if (document.getElementById('i18n-dropdown')) return;

    var existing = document.getElementById('langToggle');
    if (existing) {
      var sel = buildSelector();
      existing.parentNode.replaceChild(sel, existing);
      return;
    }

    var container = document.querySelector('.header-controls, .header-actions');
    if (container) {
      var sel = buildSelector();
      container.insertBefore(sel, container.firstChild);
      return;
    }

    var header = document.querySelector('header');
    if (header) {
      var sel = buildSelector();
      sel.style.position = 'absolute';
      sel.style.top = '12px';
      sel.style.right = '16px';
      header.style.position = 'relative';
      header.appendChild(sel);
      return;
    }

    var floating = buildSelector();
    floating.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;';
    document.body.appendChild(floating);
  }

  /* ─── Estilos del selector ─── */
  function injectStyles() {
    if (document.getElementById('i18n-styles')) return;
    var style = document.createElement('style');
    style.id = 'i18n-styles';
    style.textContent = [
      '.i18n-selector{position:relative;display:inline-flex;align-items:center;}',
      '.i18n-trigger{',
        'display:flex;align-items:center;gap:5px;',
        'padding:5px 10px;',
        'background:rgba(255,255,255,0.15);',
        'border:1px solid rgba(255,255,255,0.35);',
        'border-radius:6px;cursor:pointer;',
        'font-size:13px;font-weight:600;color:inherit;',
        'white-space:nowrap;transition:background 0.2s;',
      '}',
      '.i18n-trigger:hover{background:rgba(255,255,255,0.28);}',
      '.i18n-caret{font-size:10px;opacity:0.65;margin-left:2px;}',
      '.i18n-dropdown{',
        'display:none;position:absolute;',
        'top:calc(100% + 6px);right:0;',
        'background:#fff;border:1px solid #e0e6ed;',
        'border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.13);',
        'overflow:hidden;z-index:99999;min-width:110px;',
      '}',
      '.i18n-dropdown.i18n-open{display:block;}',
      '.i18n-option{',
        'display:flex;align-items:center;gap:8px;',
        'width:100%;padding:8px 14px;',
        'background:none;border:none;cursor:pointer;',
        'font-size:13px;font-weight:500;color:#333;',
        'text-align:left;transition:background 0.15s;white-space:nowrap;',
      '}',
      '.i18n-option:hover{background:#f4f6f9;}',
      '.i18n-option.i18n-active{background:#e8f0fe;color:#0066cc;font-weight:700;}',
    ].join('');
    document.head.appendChild(style);
  }

  /* ─── Inicialización ─── */
  async function initLanguage() {
    var saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    currentLang = SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
    injectStyles();
    await loadLanguage(currentLang);
    injectSelector();
    applyTranslations();
  }

  /* ─── API pública ─── */
  window.i18n = {
    t: t,
    change: changeLanguage,
    apply: applyTranslations,
    current: function () { return currentLang; }
  };
  window.changeLanguage = changeLanguage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
  } else {
    initLanguage();
  }
})();
