// =============================================================================
// Admin app: login gate → tabbed shell (Points, Categories, Client file,
// Import CSV, Master data). Shares all modules with the client app.
// =============================================================================

import './styles/tokens.css';
import './styles/app.css';
import './styles/map.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

import { BRAND, BASE_URL, LANGUAGES } from './config.js';
import { initTheme, toggleTheme, getTheme, logoForTheme } from './ui/theme.js';
import { initI18n, setLang, getLang, t, applyTranslations } from './ui/i18n.js';
import { el, clear, mount, toast, confirmDialog, pickFile } from './ui/components.js';
import { isAuthed, setAuthed, logout, checkLogin } from './admin/auth.js';
import { loadMasterData, exportMaster, persistMaster, fetchSeed } from './data/master.js';
import { normalizeCategory, normalizePOI } from './data/schema.js';
import { renderPoiTable } from './admin/poiTable.js';
import { renderCategoryEditor } from './admin/categoryEditor.js';
import { renderGenerator } from './admin/generator.js';
import { renderImportPanel } from './admin/importPanel.js';
import { renderTextsPanel } from './admin/textsPanel.js';
import { upsertPois, mergeCategories } from './data/merge.js';

const root = document.getElementById('admin-app');
let master = { categories: [], pois: [] };
let currentTab = 'pois';

// ---- Login -------------------------------------------------------------------
function renderLogin() {
  const user = el('input', { type: 'text', autocomplete: 'username' });
  const pass = el('input', { type: 'password', autocomplete: 'current-password' });
  const error = el('p', { class: 'error-text hidden', text: t('admin.login.error') });

  const submit = async (e) => {
    e?.preventDefault();
    if (await checkLogin(user.value.trim(), pass.value)) {
      setAuthed();
      master = await loadMasterData();
      renderApp();
    } else {
      error.classList.remove('hidden');
    }
  };

  const form = el('form', { class: 'login__card', onsubmit: submit }, [
    el('img', { src: logoForTheme(), alt: BRAND.name, 'data-logo': true }),
    el('div', { class: 'field' }, [el('label', { text: t('admin.login.user') }), user]),
    el('div', { class: 'field' }, [el('label', { text: t('admin.login.pass') }), pass]),
    error,
    el('button', { class: 'btn btn--primary', type: 'submit', text: t('admin.login.submit'), style: { width: '100%' } }),
  ]);
  mount(root, el('div', { class: 'login' }, [form]));
  user.focus();
}

// ---- App shell ---------------------------------------------------------------
const TABS = [
  ['pois', 'admin.tab.pois', (c) => renderPoiTable(c, { master, onChange })],
  ['categories', 'admin.tab.categories', (c) => renderCategoryEditor(c, { master, onChange })],
  ['generate', 'admin.tab.generate', (c) => renderGenerator(c, { master })],
  ['import', 'admin.tab.import', (c) => renderImportPanel(c, { master, onChange })],
  ['texts', 'admin.tab.texts', (c) => renderTextsPanel(c, { master })],
  ['data', 'admin.tab.data', (c) => renderDataPanel(c)],
];

function onChange() {
  /* data already persisted by the module; cross-tab views refresh on switch */
}

function renderApp() {
  const langSel = el(
    'select',
    { style: { width: 'auto' }, onchange: async (e) => { await setLang(e.target.value); renderApp(); } },
    LANGUAGES.map((l) => el('option', { value: l.code, selected: l.code === getLang() ? '' : null }, [l.label]))
  );

  const bar = el('div', { class: 'admin__bar' }, [
    el('img', { src: logoForTheme(), alt: BRAND.name, 'data-logo': true }),
    el('strong', { text: t('admin.title') }),
    el('div', { class: 'appbar__spacer' }),
    el('button', { class: 'btn btn--sm btn--ghost', text: getTheme() === 'dark' ? '☀️' : '🌙', title: t('settings.theme'), onclick: () => { toggleTheme(); renderApp(); } }),
    langSel,
    el('a', { class: 'btn btn--sm btn--ghost', href: BASE_URL, text: t('admin.openClient') }),
    el('button', { class: 'btn btn--sm', text: t('admin.logout'), onclick: () => { logout(); renderLogin(); } }),
  ]);

  const tabsRow = el(
    'div',
    { class: 'tabs' },
    TABS.map(([id, key]) =>
      el('button', { 'aria-selected': id === currentTab ? 'true' : 'false', text: t(key), onclick: () => { currentTab = id; renderTab(); } })
    )
  );

  const body = el('div', { class: 'admin__body', id: 'admin-body' });
  mount(root, el('div', { class: 'admin' }, [bar, tabsRow, body]));
  renderTab();
}

function renderTab() {
  const body = document.getElementById('admin-body');
  if (!body) return;
  [...document.querySelectorAll('.tabs button')].forEach((b, i) => b.setAttribute('aria-selected', TABS[i][0] === currentTab ? 'true' : 'false'));
  const def = TABS.find((tdef) => tdef[0] === currentTab);
  def[2](body);
}

// ---- Master data tab ---------------------------------------------------------
function renderDataPanel(container) {
  const stats = el('p', { class: 'muted', text: t('admin.data.stats', { points: master.pois.length, categories: master.categories.length }) });

  const panel = el('div', { class: 'panel' }, [
    el('h1', { text: t('admin.data.title') }),
    el('p', { class: 'panel__hint', text: t('admin.data.hint') }),
    stats,
    el('div', { class: 'toolbar' }, [
      el('button', { class: 'btn btn--primary', text: t('admin.data.export'), onclick: () => exportMaster(master) }),
      el('button', {
        class: 'btn',
        text: t('admin.data.import'),
        onclick: async () => {
          const file = await pickFile('.json,application/json');
          if (!file) return;
          try {
            const raw = JSON.parse(await file.text());
            const incCats = (raw.categories || []).map(normalizeCategory);
            const incPois = (raw.pois || []).map(normalizePOI).filter(Boolean);
            master.categories = mergeCategories(master.categories, incCats);
            const { added, updated } = upsertPois(master.pois, incPois);
            if (raw.content) master.content = raw.content;
            await persistMaster(master);
            toast(t('admin.data.merged', { added, updated }), 'ok');
            renderTab();
          } catch {
            toast(t('welcome.badFile'), 'error');
          }
        },
      }),
      el('button', {
        class: 'btn btn--danger',
        text: t('admin.data.reset'),
        onclick: async () => {
          if (!(await confirmDialog(t('admin.data.resetConfirm'), { danger: true }))) return;
          master = await fetchSeed();
          await persistMaster(master);
          toast(t('admin.data.loaded'), 'ok');
          renderTab();
        },
      }),
    ]),
  ]);
  mount(container, panel);
}

// ---- Boot --------------------------------------------------------------------
async function main() {
  initTheme();
  await initI18n();
  if (!isAuthed()) {
    renderLogin();
    return;
  }
  master = await loadMasterData();
  renderApp();
}

main();
