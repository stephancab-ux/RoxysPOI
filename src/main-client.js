// =============================================================================
// Client app bootstrap: welcome → import → map (filters, search, settings,
// offline maps, GPS) with date-based expiry locking.
// =============================================================================

import './styles/tokens.css';
import './styles/app.css';
import './styles/map.css';

import { BRAND, LANGUAGES } from './config.js';
import { initTheme, getTheme, setTheme, logoForTheme } from './ui/theme.js';
import { initI18n, setLang, getLang, t, applyTranslations } from './ui/i18n.js';
import { el, clear, toast, openDrawer, pickFile } from './ui/components.js';
import { loadDataset } from './data/db.js';
import { isExpired } from './data/schema.js';
import { importClientFile } from './data/clientFile.js';
import { createMap, createLocator, fitToPoints } from './map/mapCore.js';
import { BaseLayers } from './map/baseLayers.js';
import { createClusterGroup } from './map/clusters.js';
import { poiToMarker } from './map/markers.js';
import { createFilters } from './filters/filters.js';
import { buildOfflineSection, hydratePacks } from './offline/packs.js';

const root = document.getElementById('app');

// ---- Welcome screen ----------------------------------------------------------
function renderWelcome() {
  const logo = el('img', { class: 'welcome__logo', src: logoForTheme(), alt: BRAND.name, 'data-logo': true });
  const langRow = el(
    'div',
    { class: 'lang-row' },
    LANGUAGES.map((l) =>
      el('button', {
        class: 'chip',
        text: l.label,
        'aria-pressed': getLang() === l.code ? 'true' : 'false',
        onclick: async () => {
          await setLang(l.code);
          [...langRow.children].forEach((b, i) =>
            b.setAttribute('aria-pressed', LANGUAGES[i].code === l.code ? 'true' : 'false')
          );
        },
      })
    )
  );

  const importBtn = el('button', {
    class: 'btn btn--primary',
    'data-i18n': 'welcome.import',
    onclick: async () => {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      importBtn.disabled = true;
      importBtn.textContent = t('welcome.importing');
      const { ok, data, errors } = await importClientFile(file);
      if (ok) {
        startMap(data);
      } else {
        toast(errors[0] || t('welcome.badFile'), 'error');
        importBtn.disabled = false;
        importBtn.textContent = t('welcome.import');
      }
    },
  });

  const view = el('div', { class: 'welcome' }, [
    logo,
    el('p', { class: 'welcome__tagline', text: BRAND.tagline }),
    el('div', { class: 'section' }, [
      el('div', { class: 'muted', 'data-i18n': 'welcome.langPrompt', style: { marginBottom: '.5rem' } }),
      langRow,
    ]),
    el('p', { class: 'welcome__intro', 'data-i18n-html': 'welcome.intro' }),
    el('div', { class: 'welcome__actions' }, [importBtn]),
  ]);
  clear(root).append(view);
  applyTranslations(view);
}

// ---- Expiry lock -------------------------------------------------------------
function renderLock(dataset) {
  const body = el('p', {});
  body.innerHTML = t('expiry.body', { from: dataset.validFrom || '—', until: dataset.validUntil || '—' });
  const view = el('div', { class: 'lock' }, [
    el('img', { class: 'lock__logo', src: logoForTheme(), alt: BRAND.name, 'data-logo': true }),
    el('h1', { 'data-i18n': 'expiry.title' }),
    body,
    el('p', { 'data-i18n': 'expiry.contact' }),
    el('p', { class: 'muted', 'data-i18n': 'expiry.contactLine' }),
    el('button', {
      class: 'btn btn--ghost',
      'data-i18n': 'settings.reimport',
      onclick: () => replaceFile(),
    }),
  ]);
  clear(root).append(view);
  applyTranslations(view);
}

// ---- Map view ----------------------------------------------------------------
function renderMap(dataset) {
  const logo = el('img', { class: 'appbar__logo', src: logoForTheme(), alt: BRAND.name, 'data-logo': true });

  // search box
  const results = el('div', { class: 'search__results hidden' });
  const searchInput = el('input', {
    type: 'search',
    'data-i18n-placeholder': 'map.search.placeholder',
    'aria-label': t('common.search'),
    autocomplete: 'off',
  });
  const search = el('div', { class: 'search' }, [searchInput, results]);

  const filtersBtn = el('button', {
    class: 'fab',
    title: t('map.filters'),
    'aria-label': t('map.filters'),
    text: '⚙',
  });
  const settingsBtn = el('button', {
    class: 'fab',
    title: t('map.settings'),
    'aria-label': t('map.settings'),
    text: '☰',
  });

  const appbar = el('div', { class: 'appbar' }, [logo, search, el('div', { class: 'appbar__spacer' }), filtersBtn, settingsBtn]);
  const mapEl = el('div', { class: 'map', id: 'map' });
  const locateBtn = el('button', { class: 'fab', title: t('map.locate'), 'aria-label': t('map.locate'), text: '📍' });
  const fabStack = el('div', { class: 'fab-stack' }, [locateBtn]);

  clear(root).append(appbar, mapEl, fabStack);

  // map + layers
  const map = createMap(mapEl);
  const baseLayers = new BaseLayers(map);
  baseLayers.start();
  const clusterGroup = createClusterGroup();
  map.addLayer(clusterGroup);
  const locator = createLocator(map);
  locateBtn.addEventListener('click', () => locator.locate());

  const filters = createFilters(dataset);

  function renderMarkers() {
    clusterGroup.clearLayers();
    const markers = filters.filtered().map((p) => poiToMarker(p, filters.getCategory));
    clusterGroup.addLayers(markers);
  }
  filters.onChange(renderMarkers);
  renderMarkers();
  fitToPoints(map, dataset.points);

  // bottom category pills
  root.append(filters.buildCategoryBar());

  // search behaviour
  const runSearch = () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      results.classList.add('hidden');
      return;
    }
    const matches = dataset.points
      .filter((p) => p.name.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q))
      .slice(0, 12);
    clear(results);
    if (matches.length === 0) {
      results.append(el('button', { class: 'muted', text: t('map.search.none'), disabled: true }));
    } else {
      for (const p of matches) {
        const cat = filters.getCategory(p.categoryId);
        results.append(
          el('button', { onclick: () => goToPoint(p) }, [
            el('div', { text: `${cat ? cat.emoji + ' ' : ''}${p.name}` }),
            p.country && el('div', { class: 'muted', text: p.country }),
          ])
        );
      }
    }
    results.classList.remove('hidden');
  };
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', runSearch);
  document.addEventListener('click', (e) => {
    if (!search.contains(e.target)) results.classList.add('hidden');
  });

  function goToPoint(p) {
    results.classList.add('hidden');
    searchInput.value = '';
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15));
    const cat = filters.getCategory(p.categoryId);
    const html = [
      `<div class="popup__title">${escapeHtml(p.name)}</div>`,
      cat ? `<div class="popup__cat">${cat.emoji} ${escapeHtml(cat.name)}</div>` : '',
      p.note ? `<div class="popup__note">${escapeHtml(p.note)}</div>` : '',
      p.googleUrl
        ? `<a class="popup__link" href="${encodeURI(p.googleUrl)}" target="_blank" rel="noopener noreferrer">📍 ${escapeHtml(t('popup.openGoogle'))}</a>`
        : '',
    ].join('');
    map.openPopup(html, [p.lat, p.lng], { maxWidth: 280 });
  }

  // drawers
  filtersBtn.addEventListener('click', () => {
    openDrawer({ title: t('filters.title'), body: filters.buildFilterPanel() });
  });
  settingsBtn.addEventListener('click', () => openSettings(dataset, baseLayers));

  // offline packs (register any already downloaded)
  hydratePacks(baseLayers).then(() => baseLayers.update());

  // make controls follow language changes
  applyTranslations(appbar);
}

// ---- Settings drawer ---------------------------------------------------------
async function openSettings(dataset, baseLayers) {
  const body = el('div', {});

  // Theme
  const themeSeg = el('div', { class: 'segmented' }, [
    themeBtn('dark', 'settings.theme.dark'),
    themeBtn('light', 'settings.theme.light'),
  ]);
  function themeBtn(value, key) {
    return el('button', {
      'data-i18n': key,
      'aria-pressed': getTheme() === value ? 'true' : 'false',
      onclick: () => {
        setTheme(value);
        [...themeSeg.children].forEach((b, i) => b.setAttribute('aria-pressed', (i === 0 ? 'dark' : 'light') === value ? 'true' : 'false'));
      },
    });
  }

  // Language
  const langSeg = el(
    'div',
    { class: 'segmented' },
    LANGUAGES.map((l) =>
      el('button', {
        text: l.label,
        'aria-pressed': getLang() === l.code ? 'true' : 'false',
        onclick: async () => {
          await setLang(l.code);
          [...langSeg.children].forEach((b, i) => b.setAttribute('aria-pressed', LANGUAGES[i].code === l.code ? 'true' : 'false'));
        },
      })
    )
  );

  body.append(
    el('div', { class: 'section' }, [el('h3', { 'data-i18n': 'settings.theme' }), themeSeg]),
    el('div', { class: 'section' }, [el('h3', { 'data-i18n': 'settings.language' }), langSeg])
  );

  // Offline maps
  body.append(await buildOfflineSection(dataset, baseLayers));

  // Your travel file
  body.append(
    el('div', { class: 'section' }, [
      el('h3', { 'data-i18n': 'settings.data' }),
      el('div', { class: 'row' }, [
        el('span', { class: 'muted', text: `${t('settings.client')}: ${dataset.client || '—'}` }),
      ]),
      dataset.validUntil &&
        el('div', { class: 'row' }, [el('span', { class: 'muted', text: `${t('settings.validUntil')}: ${dataset.validUntil}` })]),
      el('button', { class: 'btn btn--ghost', 'data-i18n': 'settings.reimport', onclick: () => replaceFile() }),
    ])
  );

  const ctrl = openDrawer({ title: t('settings.title'), body });
  applyTranslations(ctrl.drawer);
}

// ---- Replace / re-import file ------------------------------------------------
async function replaceFile() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  const { ok, data, errors } = await importClientFile(file);
  if (ok) {
    location.reload();
  } else {
    toast(errors[0] || t('welcome.badFile'), 'error');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Route -------------------------------------------------------------------
async function startMap(dataset) {
  if (isExpired(dataset.validUntil)) renderLock(dataset);
  else renderMap(dataset);
}

async function main() {
  initTheme();
  await initI18n();
  const dataset = await loadDataset();
  if (dataset && Array.isArray(dataset.points)) startMap(dataset);
  else renderWelcome();
}

main();
