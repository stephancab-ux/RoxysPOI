// =============================================================================
// Admin app: login gate → tabbed shell (Points, Categories, Client file,
// Import CSV, Master data). Shares all modules with the client app.
// =============================================================================

import './styles/tokens.css';
import './styles/app.css';
import './styles/map.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

import { BRAND, BASE_URL, LANGUAGES, isDesktop } from './config.js';
import { initTheme, toggleTheme, getTheme, logoForTheme } from './ui/theme.js';
import { initI18n, setLang, getLang, t, applyTranslations } from './ui/i18n.js';
import { el, clear, mount, toast, confirmDialog, pickFile, openModal } from './ui/components.js';
import { isAuthed, setAuthed, logout, checkLogin } from './admin/auth.js';
import {
  loadMasterData, exportMaster, persistMaster, fetchSeed,
  normalizeMaster, normalizeContent, seedMaster, markSaved, isDirty, onDirtyChange,
} from './data/master.js';
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

// Desktop-only state (the master list is a file the user keeps in a synced folder)
let ds = null; // lazily-imported ./data/desktopStore.js (Tauri APIs)
let appWindow = null; // Tauri window handle (for the close guard)
let masterPath = null; // bound file path on this computer
let lastSavedAt = null; // epoch ms of the last successful file save

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString() : '—');

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

  const themeBtn = el('button', { class: 'btn btn--sm btn--ghost', text: getTheme() === 'dark' ? '☀️' : '🌙', title: t('settings.theme'), onclick: () => { toggleTheme(); renderApp(); } });

  // Desktop shows a save indicator + Save button (no login/logout); web keeps the
  // logout + open-client controls.
  const rightItems = isDesktop()
    ? [
        el('span', { id: 'save-indicator', class: 'muted', style: { fontSize: '.82rem' } }),
        el('button', { id: 'desktop-save', class: 'btn btn--sm btn--primary', text: t('admin.desktop.save'), onclick: desktopSave }),
        themeBtn,
        langSel,
      ]
    : [
        themeBtn,
        langSel,
        el('a', { class: 'btn btn--sm btn--ghost', href: BASE_URL, text: t('admin.openClient') }),
        el('button', { class: 'btn btn--sm', text: t('admin.logout'), onclick: () => { logout(); renderLogin(); } }),
      ];

  const bar = el('div', { class: 'admin__bar' }, [
    el('img', { src: logoForTheme(), alt: BRAND.name, 'data-logo': true }),
    el('strong', { text: t('admin.title') }),
    el('div', { class: 'appbar__spacer' }),
    ...rightItems,
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
  if (isDesktop()) updateSaveIndicator(isDirty());
}

// ---- Desktop: master-file storage (Google Drive / OneDrive synced file) ------
function updateSaveIndicator(dirty) {
  const ind = document.getElementById('save-indicator');
  if (ind) {
    ind.textContent = dirty ? t('admin.desktop.unsaved') : t('admin.desktop.savedAt', { time: fmtTime(lastSavedAt) });
    ind.style.color = dirty ? 'var(--danger, #e06)' : '';
  }
  const btn = document.getElementById('desktop-save');
  if (btn) btn.disabled = !dirty;
}

/** Save the working master to the bound file (+ a dated backup). */
async function desktopSave() {
  if (!masterPath) return chooseLocationAndSave();
  try {
    const { ts } = await ds.writeMasterFile(masterPath, master, { backup: true });
    lastSavedAt = ts;
    markSaved();
    updateSaveIndicator(false);
    if (currentTab === 'data') renderTab();
    toast(t('admin.desktop.saved'), 'ok');
  } catch {
    toast(t('admin.desktop.saveError'), 'error');
  }
}

/** First-time / "Save as": pick a location, bind it, write the file. */
async function chooseLocationAndSave() {
  const path = await ds.pickSaveLocation();
  if (!path) return;
  masterPath = path;
  await ds.setMasterPath(path);
  await desktopSave();
}

/** Re-read the bound file from disk (e.g. after the other computer synced edits). */
async function desktopReload() {
  if (!masterPath) return;
  if (isDirty() && !(await confirmDialog(t('admin.desktop.reloadConfirm'), { danger: true }))) return;
  try {
    master = withContent(normalizeMaster(await ds.readMasterFile(masterPath)));
    lastSavedAt = await ds.getLastSavedAt();
    markSaved();
    renderApp();
    toast(t('admin.desktop.reloaded'), 'ok');
  } catch {
    toast(t('admin.desktop.readError'), 'error');
  }
}

/** Open a different existing master file and bind to it. */
async function desktopOpen() {
  const path = await ds.pickOpenLocation();
  if (!path) return;
  try {
    master = withContent(normalizeMaster(await ds.readMasterFile(path)));
    masterPath = path;
    await ds.setMasterPath(path);
    lastSavedAt = await ds.getLastSavedAt();
    markSaved();
    renderApp();
  } catch {
    toast(t('admin.desktop.readError'), 'error');
  }
}

/** Start a brand-new list (default categories) and choose where to keep it. */
async function desktopStartNew() {
  const path = await ds.pickSaveLocation();
  if (!path) return;
  master = seedMaster();
  masterPath = path;
  await ds.setMasterPath(path);
  const { ts } = await ds.writeMasterFile(path, master, { backup: false });
  lastSavedAt = ts;
  markSaved();
  renderApp();
}

/** Export a standalone copy without changing the bound file. */
async function desktopExportCopy() {
  const path = await ds.pickSaveLocation('roxys-master-copy.json');
  if (!path) return;
  try {
    await ds.writeMasterFile(path, master, { backup: false });
    toast(t('admin.desktop.copySaved'), 'ok');
  } catch {
    toast(t('admin.desktop.saveError'), 'error');
  }
}

const withContent = (m) => (m.content ? m : ((m.content = normalizeContent({})), m));

// First-run screen: no file bound yet → open an existing list or start a new one.
function renderFirstRun() {
  mount(
    root,
    el('div', { class: 'login' }, [
      el('div', { class: 'login__card' }, [
        el('img', { src: logoForTheme(), alt: BRAND.name, 'data-logo': true }),
        el('h2', { text: t('admin.desktop.welcomeTitle') }),
        el('p', { class: 'muted', text: t('admin.desktop.welcomeHint') }),
        el('div', { class: 'toolbar', style: { justifyContent: 'center' } }, [
          el('button', { class: 'btn btn--primary', text: t('admin.desktop.openExisting'), onclick: desktopOpen }),
          el('button', { class: 'btn', text: t('admin.desktop.startNew'), onclick: desktopStartNew }),
        ]),
      ]),
    ])
  );
}

// Intercept window close while there are unsaved edits → Save / Discard / Cancel.
function unsavedChoice() {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); ctrl.close(); } };
    const ctrl = openModal({
      title: t('admin.desktop.unsavedTitle'),
      body: el('p', { text: t('admin.desktop.unsavedBody') }),
      footer: [
        el('button', { class: 'btn btn--ghost', text: t('common.cancel'), onclick: () => fin('cancel') }),
        el('button', { class: 'btn btn--danger', text: t('admin.desktop.discard'), onclick: () => fin('discard') }),
        el('button', { class: 'btn btn--primary', text: t('admin.desktop.saveClose'), onclick: () => fin('save') }),
      ],
      onClose: () => { if (!done) { done = true; resolve('cancel'); } },
    });
  });
}

async function registerCloseGuard() {
  if (!appWindow) return;
  await appWindow.onCloseRequested(async (event) => {
    if (!isDirty()) return; // nothing unsaved → let it close
    event.preventDefault();
    const choice = await unsavedChoice();
    if (choice === 'cancel') return;
    if (choice === 'save') {
      await desktopSave();
      if (isDirty()) return; // save failed → stay open
    }
    await appWindow.destroy();
  });
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
  if (isDesktop()) return renderDesktopDataPanel(container);
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

// Desktop "Master data" hub: where the file lives, Save, Reload, Open, Start new.
function renderDesktopDataPanel(container) {
  const stats = el('p', { class: 'muted', text: t('admin.data.stats', { points: master.pois.length, categories: master.categories.length }) });

  const pathInput = el('input', {
    type: 'text',
    value: masterPath || '',
    placeholder: t('admin.desktop.pathPlaceholder'),
    style: { fontFamily: 'monospace', fontSize: '.82rem' },
    onchange: async (e) => {
      masterPath = e.target.value.trim() || null;
      if (masterPath) await ds.setMasterPath(masterPath);
    },
  });

  const panel = el('div', { class: 'panel' }, [
    el('h1', { text: t('admin.data.title') }),
    el('p', { class: 'panel__hint', text: t('admin.desktop.hint') }),
    stats,
    el('div', { class: 'field' }, [
      el('label', { text: t('admin.desktop.fileLocation') }),
      el('div', { class: 'row' }, [pathInput, el('button', { class: 'btn btn--sm', text: t('admin.desktop.browse'), onclick: chooseLocationAndSave })]),
    ]),
    el('p', { class: 'muted', text: t('admin.desktop.savedAt', { time: fmtTime(lastSavedAt) }) }),
    el('div', { class: 'toolbar' }, [
      el('button', { class: 'btn btn--primary', text: t('admin.desktop.save'), onclick: desktopSave }),
      el('button', { class: 'btn', text: t('admin.desktop.reload'), onclick: desktopReload }),
      el('button', { class: 'btn', text: t('admin.desktop.openOther'), onclick: desktopOpen }),
      el('button', { class: 'btn', text: t('admin.desktop.exportCopy'), onclick: desktopExportCopy }),
      el('button', { class: 'btn btn--danger', text: t('admin.desktop.startNew'), onclick: async () => {
        if (isDirty() && !(await confirmDialog(t('admin.desktop.reloadConfirm'), { danger: true }))) return;
        desktopStartNew();
      } }),
    ]),
  ]);
  mount(container, panel);
}

// ---- Boot --------------------------------------------------------------------
async function bootDesktop() {
  ds = await import('./data/desktopStore.js');
  try {
    const w = await import('@tauri-apps/api/window');
    appWindow = w.getCurrentWindow();
    await registerCloseGuard();
  } catch {
    /* window API unavailable — close guard simply won't arm */
  }
  onDirtyChange(updateSaveIndicator);
  masterPath = await ds.getMasterPath();
  lastSavedAt = await ds.getLastSavedAt();
  if (masterPath && (await ds.fileExists(masterPath).catch(() => false))) {
    try {
      master = withContent(normalizeMaster(await ds.readMasterFile(masterPath)));
      renderApp();
      return;
    } catch {
      toast(t('admin.desktop.readError'), 'error');
    }
  }
  renderFirstRun();
}

async function main() {
  initTheme();
  await initI18n();
  if (isDesktop()) {
    await bootDesktop();
    return;
  }
  if (!isAuthed()) {
    renderLogin();
    return;
  }
  master = await loadMasterData();
  renderApp();
}

main();
