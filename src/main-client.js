// =============================================================================
// Client app bootstrap: welcome → import → map (filters, search, settings,
// offline maps, GPS) with date-based expiry locking.
// =============================================================================

import './styles/tokens.css';
import './styles/app.css';
import './styles/map.css';

import { BRAND, LANGUAGES } from './config.js';
import { initTheme, getTheme, setTheme, logoForTheme } from './ui/theme.js';
import { initI18n, setLang, getLang, t, applyTranslations, onLangChange } from './ui/i18n.js';
import { el, clear, toast, openDrawer, pickFile } from './ui/components.js';
import { loadDataset, loadItinerary, getSetting, setSetting } from './data/db.js';
import { isExpired, categoryName, validateClientFile } from './data/schema.js';
import { loadContent, getContent, pickLang, resolveText, resolveEmail } from './data/content.js';
import { importTravelFile } from './data/clientFile.js';
import { itineraryPoints, validateItinerary } from './data/itinerary.js';
import { createMap, createLocator, fitToPoints } from './map/mapCore.js';
import { BaseLayers } from './map/baseLayers.js';
import { createClusterGroup } from './map/clusters.js';
import { poiToMarker } from './map/markers.js';
import { createItineraryLayer } from './map/itineraryLayer.js';
import { createFilters } from './filters/filters.js';
import { buildOfflineSection, hydratePacks } from './offline/packs.js';

const root = document.getElementById('app');

/** Welcome intro text — agency-edited (content.json) with the i18n default as fallback. */
function welcomeIntroEl() {
  const p = el('p', { class: 'welcome__intro' });
  const c = getContent();
  const txt = c && pickLang(c.welcome, getLang());
  if (txt) p.innerHTML = escapeHtml(txt).replace(/\n/g, '<br>');
  else p.innerHTML = t('welcome.intro');
  return p;
}

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
          renderWelcome(); // re-render so the intro text follows the new language
        },
      })
    )
  );

  const view = el('div', { class: 'welcome' }, [
    logo,
    el('p', { class: 'welcome__tagline', text: BRAND.tagline }),
    el('div', { class: 'section' }, [
      el('div', { class: 'muted', 'data-i18n': 'welcome.langPrompt', style: { marginBottom: '.5rem' } }),
      langRow,
    ]),
    welcomeIntroEl(),
    el('div', { class: 'welcome__actions' }, [importButton()]),
  ]);
  clear(root).append(view);
  applyTranslations(view);
}

/**
 * The single welcome-screen import button. One document now: it auto-detects a
 * recommendation list, a trip itinerary, or the combined file from Roxy admin.
 */
function importButton() {
  const btn = el('button', {
    class: 'btn btn--primary',
    'data-i18n': 'welcome.importPlan',
    onclick: async () => {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      btn.disabled = true;
      btn.textContent = t('welcome.importing');
      const { ok, errors } = await importTravelFile(file);
      if (ok) {
        await showFromStorage();
      } else {
        toast(errors[0] || t('welcome.badFile'), 'error');
        btn.disabled = false;
        btn.textContent = t('welcome.importPlan');
      }
    },
  });
  return btn;
}

// ---- Expiry lock -------------------------------------------------------------
function renderLock(dataset) {
  const lang = getLang();
  const msg = resolveText('expiry', lang, dataset) || t('expiry.body');
  const email = resolveEmail(dataset) || t('expiry.contactLine');

  const msgEl = el('p', {});
  msgEl.innerHTML = escapeHtml(msg).replace(/\n/g, '<br>');
  const dates =
    dataset.validFrom || dataset.validUntil
      ? el('p', { class: 'muted', text: t('expiry.dates', { from: dataset.validFrom || '—', until: dataset.validUntil || '—' }) })
      : null;

  const view = el('div', { class: 'lock' }, [
    el('img', { class: 'lock__logo', src: logoForTheme(), alt: BRAND.name, 'data-logo': true }),
    el('h1', { 'data-i18n': 'expiry.title' }),
    msgEl,
    dates,
    el('p', { 'data-i18n': 'expiry.contact' }),
    el('p', { class: 'muted' }, [el('a', { class: 'popup__link', href: `mailto:${email}`, text: email })]),
    el('button', { class: 'btn btn--ghost', 'data-i18n': 'settings.reimport', onclick: () => replaceFile() }),
  ].filter(Boolean));
  clear(root).append(view);
  applyTranslations(view);
}

// ---- Map view ----------------------------------------------------------------
// Either layer is optional: a traveler may import places, an itinerary, or both.
function renderMap(dataset, itinerary) {
  const hasPlaces = !!(dataset && Array.isArray(dataset.points));
  const points = hasPlaces ? dataset.points : [];

  const logo = el('img', { class: 'appbar__logo', src: logoForTheme(), alt: BRAND.name, 'data-logo': true });

  // search box (places only)
  const results = el('div', { class: 'search__results hidden' });
  const searchInput = el('input', {
    type: 'search',
    'data-i18n-placeholder': 'map.search.placeholder',
    'aria-label': t('common.search'),
    autocomplete: 'off',
  });
  const search = el('div', { class: 'search' }, [searchInput, results]);

  // ☰ hamburger → filters (countries/categories) · ⚙ gear → settings
  const filtersBtn = el('button', { class: 'fab', title: t('map.filters'), 'aria-label': t('map.filters'), text: '☰' });
  const settingsBtn = el('button', { class: 'fab', title: t('map.settings'), 'aria-label': t('map.settings'), text: '⚙' });

  const appbar = el('div', { class: 'appbar' }, [
    logo,
    hasPlaces ? search : null,
    el('div', { class: 'appbar__spacer' }),
    hasPlaces ? filtersBtn : null,
    settingsBtn,
  ].filter(Boolean));
  const mapEl = el('div', { class: 'map', id: 'map' });
  const locateBtn = el('button', { class: 'fab', title: t('map.locate'), 'aria-label': t('map.locate'), text: '📍' });
  const fabStack = el('div', { class: 'fab-stack' }, [locateBtn]);

  clear(root).append(appbar, mapEl, fabStack);

  // map + base layers
  const map = createMap(mapEl);
  const baseLayers = new BaseLayers(map);
  baseLayers.start();
  const locator = createLocator(map);
  locateBtn.addEventListener('click', () => locator.locate());

  // ---- Itinerary layer (route + numbered stops + annotation pins) ----
  if (itinerary) {
    const itinLayer = createItineraryLayer(itinerary);
    map.addLayer(itinLayer);
    let shown = true;
    const routeBtn = el('button', { class: 'fab', title: t('map.toggleRoute'), 'aria-label': t('map.toggleRoute'), text: '🧭' });
    routeBtn.addEventListener('click', () => {
      shown = !shown;
      if (shown) map.addLayer(itinLayer);
      else map.removeLayer(itinLayer);
      routeBtn.classList.toggle('fab--off', !shown);
    });
    fabStack.append(routeBtn);
  }

  // ---- Places layer (clusters + filters + pills + search) ----
  if (hasPlaces) {
    const clusterGroup = createClusterGroup();
    map.addLayer(clusterGroup);
    const filters = createFilters(dataset);

    const renderMarkers = () => {
      clusterGroup.clearLayers();
      clusterGroup.addLayers(filters.filtered().map((p) => poiToMarker(p, filters.getCategory)));
    };
    filters.onChange(renderMarkers);
    renderMarkers();

    let pillBar = filters.buildCategoryBar();
    root.append(pillBar);
    onLangChange(() => {
      const fresh = filters.buildCategoryBar();
      pillBar.replaceWith(fresh);
      pillBar = fresh;
    });

    const goToPoint = (p) => {
      results.classList.add('hidden');
      searchInput.value = '';
      map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15));
      const cat = filters.getCategory(p.categoryId);
      const html = [
        `<div class="popup__title">${escapeHtml(p.name)}</div>`,
        cat ? `<div class="popup__cat">${cat.emoji} ${escapeHtml(categoryName(cat, getLang()))}</div>` : '',
        p.note ? `<div class="popup__note">${escapeHtml(p.note)}</div>` : '',
        p.googleUrl ? `<a class="popup__link" href="${encodeURI(p.googleUrl)}" target="_blank" rel="noopener noreferrer">📍 ${escapeHtml(t('popup.openGoogle'))}</a>` : '',
      ].join('');
      map.openPopup(html, [p.lat, p.lng], { maxWidth: 280 });
    };

    const runSearch = () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) return results.classList.add('hidden');
      const matches = points.filter((p) => p.name.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q)).slice(0, 12);
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
    filtersBtn.addEventListener('click', () => openDrawer({ title: t('filters.title'), body: filters.buildFilterPanel() }));
  }

  settingsBtn.addEventListener('click', () => openSettings(dataset, itinerary, baseLayers));

  // fit to everything we have (places + itinerary)
  const fitPts = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  if (itinerary) fitPts.push(...itineraryPoints(itinerary));
  fitToPoints(map, fitPts);

  // offline packs (register any already downloaded)
  hydratePacks(baseLayers).then(() => baseLayers.update());

  // make controls follow language changes
  applyTranslations(appbar);
}

// ---- Settings drawer ---------------------------------------------------------
async function openSettings(dataset, itinerary, baseLayers) {
  const hasPlaces = !!(dataset && Array.isArray(dataset.points));
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
  body.append(await buildOfflineSection(dataset || { points: [], client: '' }, baseLayers));

  // Your travel plan — one document now (recommendation list and/or route).
  // Importing a new file REPLACES whatever is loaded (see importTravelFile).
  const planRows = [el('h3', { 'data-i18n': 'settings.plan' })];
  if (hasPlaces) {
    planRows.push(el('div', { class: 'row' }, [el('span', { class: 'muted', text: `${t('settings.client')}: ${dataset.client || '—'}` })]));
    if (dataset.validUntil) planRows.push(el('div', { class: 'row' }, [el('span', { class: 'muted', text: `${t('settings.validUntil')}: ${dataset.validUntil}` })]));
  }
  if (itinerary) {
    planRows.push(el('div', { class: 'row' }, [el('span', { class: 'muted', text: `${t('settings.route')}: ${itinerary.title || '—'} · ${t('settings.stops', { n: (itinerary.stops || []).length })}` })]));
  }
  planRows.push(el('button', { class: 'btn btn--ghost', 'data-i18n': 'settings.replacePlan', onclick: () => replaceFile() }));
  body.append(el('div', { class: 'section' }, planRows));

  // Disclaimer (re-readable) at the bottom.
  const disclaimer = resolveText('disclaimer', getLang(), dataset);
  if (disclaimer) {
    const box = el('div', { class: 'disclaimer__scroll', style: { marginTop: '.5rem' } });
    box.innerHTML = paragraphsHtml(disclaimer);
    body.append(el('div', { class: 'section' }, [el('h3', { 'data-i18n': 'settings.disclaimer' }), box]));
  }

  const ctrl = openDrawer({ title: t('settings.title'), body });
  applyTranslations(ctrl.drawer);
}

// ---- Replace / re-import files -----------------------------------------------
async function replaceFile() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  const { ok, errors } = await importTravelFile(file);
  if (ok) location.reload();
  else toast(errors[0] || t('welcome.badFile'), 'error');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Disclaimer gate ---------------------------------------------------------
// A token that changes whenever a new/updated file is imported, so the traveler
// re-accepts per imported file.
const disclaimerToken = (d) => `${d.client || ''}|${d.validFrom || ''}|${d.validUntil || ''}`;
const paragraphsHtml = (text) => text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');

function renderDisclaimer(dataset, itinerary) {
  const text = resolveText('disclaimer', getLang(), dataset);
  const scroll = el('div', { class: 'disclaimer__scroll' });
  scroll.innerHTML = paragraphsHtml(text);
  const view = el('div', { class: 'lock' }, [
    el('img', { class: 'lock__logo', src: logoForTheme(), alt: BRAND.name, 'data-logo': true }),
    el('div', { class: 'disclaimer__kicker', 'data-i18n': 'disclaimer.kicker' }),
    scroll,
    el('button', {
      class: 'btn btn--primary',
      'data-i18n': 'disclaimer.accept',
      onclick: async () => {
        await setSetting('disclaimer.acceptedToken', disclaimerToken(dataset));
        renderMap(dataset, itinerary);
      },
    }),
  ]);
  clear(root).append(view);
  applyTranslations(view);
}

// ---- Route -------------------------------------------------------------------
async function startMap(dataset, itinerary) {
  if (dataset && isExpired(dataset.validUntil)) {
    renderLock(dataset);
    return;
  }
  if (dataset && resolveText('disclaimer', getLang(), dataset)) {
    const accepted = await getSetting('disclaimer.acceptedToken', '');
    if (accepted !== disclaimerToken(dataset)) {
      renderDisclaimer(dataset, itinerary);
      return;
    }
  }
  renderMap(dataset, itinerary);
}

/** Load whatever the traveler has imported (places and/or itinerary) and show it. */
async function showFromStorage() {
  const [dataset, itinerary] = await Promise.all([loadDataset(), loadItinerary()]);
  const hasPlaces = dataset && Array.isArray(dataset.points);
  if (hasPlaces || itinerary) await startMap(hasPlaces ? dataset : null, itinerary || null);
  else renderWelcome();
}

// ---- Embed mode (website iframe: data passed in the URL fragment) ------------
function decodeData(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}
function embedDataset() {
  const m = (location.hash || '').match(/[#&]data=([^&]+)/);
  if (!m) return null;
  try {
    const result = validateClientFile(decodeData(m[1]));
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

async function main() {
  initTheme();
  await initI18n();
  await loadContent(); // agency-editable welcome/expiry/email text
  const embed = embedDataset();
  if (embed) {
    document.documentElement.classList.add('embed');
    // The iframe payload may carry the route too (combined file) — render both.
    const itin = embed.itinerary ? validateItinerary(embed.itinerary) : null;
    renderMap(embed, itin && itin.ok ? itin.data : null); // embedded map: skip welcome/import and the expiry lock
    return;
  }
  await showFromStorage();
}

main();
