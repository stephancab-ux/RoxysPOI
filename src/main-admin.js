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
import { el, clear, mount, toast, confirmDialog, pickFile } from './ui/components.js';
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
let masterPath = null; // bound file path on this computer (continuous autosave target)
let lastSavedAt = null; // epoch ms of the last successful file save
let documentsFolder = null; // folder where generated client files are saved
let backupFolder = null; // folder where "Save backup" drops timestamped snapshots
let autosaveTimer = null; // debounce handle for continuous master-file autosave

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
        el('button', { class: 'btn btn--sm btn--primary', text: t('admin.desktop.backup'), onclick: desktopBackup }),
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
  if (ind) ind.textContent = dirty ? t('admin.desktop.saving') : t('admin.desktop.savedAt', { time: fmtTime(lastSavedAt) });
}

// ---- Continuous autosave (the bound file is the source of truth) -------------
// Every edit funnels through persistMaster → setDirty(true) → scheduleAutosave().
// We debounce so rapid edits (typing a note) don't thrash the disk, then write.
function scheduleAutosave() {
  if (!masterPath) return; // no bound file yet (first run) — nothing to write to
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveNow, 800);
}

async function autosaveNow() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  if (!masterPath || !isDirty()) return;
  try {
    const { ts } = await ds.writeMasterFile(masterPath, master);
    lastSavedAt = ts;
    markSaved();
    updateSaveIndicator(false);
    if (currentTab === 'data') renderTab();
  } catch {
    toast(t('admin.desktop.saveError'), 'error'); // stay dirty → retries on next change / quit
  }
}

/** Bind a master-file location (first run / change file) and write it once. */
async function chooseLocationAndSave() {
  const path = await ds.pickSaveLocation();
  if (!path) return;
  masterPath = path;
  await ds.setMasterPath(path);
  try {
    const { ts } = await ds.writeMasterFile(masterPath, master);
    lastSavedAt = ts;
    markSaved();
    if (currentTab === 'data') renderTab();
  } catch {
    toast(t('admin.desktop.saveError'), 'error');
  }
}

/** "Save backup": drop a timestamped snapshot into the chosen backup folder. */
async function desktopBackup() {
  if (!backupFolder) {
    const folder = await ds.pickFolder();
    if (!folder) return;
    backupFolder = folder;
    await ds.setBackupFolder(folder);
  }
  await autosaveNow(); // flush any pending edit so the snapshot matches disk
  try {
    const path = await ds.writeBackup(backupFolder, master);
    if (currentTab === 'data') renderTab();
    toast(t('admin.desktop.backupSaved', { path }), 'ok');
  } catch {
    toast(t('admin.desktop.saveError'), 'error');
  }
}

/** Choose the folder where "Save backup" snapshots are written. */
async function pickBackupFolder() {
  const path = await ds.pickFolder();
  if (!path) return;
  backupFolder = path;
  await ds.setBackupFolder(path);
  if (currentTab === 'data') renderTab();
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
  const { ts } = await ds.writeMasterFile(path, master);
  lastSavedAt = ts;
  markSaved();
  renderApp();
}

/** Export a standalone copy without changing the bound file. */
async function desktopExportCopy() {
  const path = await ds.pickSaveLocation('roxys-master-copy.json');
  if (!path) return;
  try {
    await ds.writeMasterFile(path, master);
    toast(t('admin.desktop.copySaved'), 'ok');
  } catch {
    toast(t('admin.desktop.saveError'), 'error');
  }
}

/** Import another list into the current one — Merge (upsert) or Replace. */
async function desktopImport(mode) {
  const path = await ds.pickOpenLocation();
  if (!path) return;
  try {
    const incoming = normalizeMaster(await ds.readMasterFile(path));
    if (mode === 'replace') {
      master.categories = incoming.categories;
      master.pois = incoming.pois;
      if (incoming.content) master.content = incoming.content;
      toast(t('admin.desktop.imported'), 'ok');
    } else {
      master.categories = mergeCategories(master.categories, incoming.categories);
      const { added, updated } = upsertPois(master.pois, incoming.pois);
      toast(t('admin.import.merged', { added, updated }), 'ok');
    }
    await persistMaster(master); // marks unsaved → user clicks Save to write the file
    renderApp();
  } catch {
    toast(t('admin.desktop.readError'), 'error');
  }
}

/** Choose the folder where generated client files (JSON/KML/HTML/CSV) are saved. */
async function pickDocumentsFolder() {
  const path = await ds.pickFolder();
  if (!path) return;
  documentsFolder = path;
  await ds.setDocumentsFolder(path);
  if (currentTab === 'data') renderTab();
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

// Flush any pending autosave before the window closes. Continuous autosave
// makes the old Save / Discard / Cancel prompt unnecessary.
async function registerCloseGuard() {
  if (!appWindow) return;
  await appWindow.onCloseRequested(async (event) => {
    if (!autosaveTimer && !isDirty()) return; // nothing pending → let it close
    event.preventDefault();
    await autosaveNow();
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

  const importMode = el('select', { style: { width: 'auto' } }, [
    el('option', { value: 'merge' }, [t('admin.desktop.merge')]),
    el('option', { value: 'replace' }, [t('admin.desktop.replace')]),
  ]);

  const docsInput = el('input', {
    type: 'text',
    value: documentsFolder || '',
    placeholder: t('admin.docs.placeholder'),
    style: { fontFamily: 'monospace', fontSize: '.82rem' },
    onchange: async (e) => {
      documentsFolder = e.target.value.trim() || null;
      if (documentsFolder) await ds.setDocumentsFolder(documentsFolder);
    },
  });

  const backupInput = el('input', {
    type: 'text',
    value: backupFolder || '',
    placeholder: t('admin.desktop.backupPlaceholder'),
    style: { fontFamily: 'monospace', fontSize: '.82rem' },
    onchange: async (e) => {
      backupFolder = e.target.value.trim() || null;
      if (backupFolder) await ds.setBackupFolder(backupFolder);
    },
  });

  const panel = el('div', { class: 'panel' }, [
    el('h1', { text: t('admin.data.title') }),
    el('p', { class: 'panel__hint', text: t('admin.desktop.hint') }),
    stats,
    el('div', { class: 'field' }, [
      el('label', { text: t('admin.desktop.fileLocation') }),
      el('div', { class: 'row' }, [pathInput, el('button', { class: 'btn btn--sm', text: t('admin.desktop.browse'), onclick: chooseLocationAndSave })]),
      el('p', { class: 'muted', text: t('admin.desktop.autoHint') }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: t('admin.desktop.backupLocation') }),
      el('div', { class: 'row' }, [backupInput, el('button', { class: 'btn btn--sm', text: t('admin.desktop.browse'), onclick: pickBackupFolder })]),
      el('p', { class: 'muted', text: backupFolder ? t('admin.desktop.backupHint') : t('admin.desktop.backupNone') }),
    ]),
    el('p', { class: 'muted', text: t('admin.desktop.savedAt', { time: fmtTime(lastSavedAt) }) }),
    el('div', { class: 'toolbar' }, [
      el('button', { class: 'btn btn--primary', text: t('admin.desktop.backup'), onclick: desktopBackup }),
      el('button', { class: 'btn', text: t('admin.desktop.reload'), onclick: desktopReload }),
      el('button', { class: 'btn', text: t('admin.desktop.openOther'), onclick: desktopOpen }),
      el('button', { class: 'btn', text: t('admin.desktop.exportCopy'), onclick: desktopExportCopy }),
      el('button', { class: 'btn btn--danger', text: t('admin.desktop.startNew'), onclick: async () => {
        if (isDirty() && !(await confirmDialog(t('admin.desktop.reloadConfirm'), { danger: true }))) return;
        desktopStartNew();
      } }),
    ]),

    // Import another list (Merge / Replace).
    el('div', { class: 'section' }, [
      el('h3', { text: t('admin.desktop.importTitle') }),
      el('p', { class: 'muted', text: t('admin.desktop.importHint') }),
      el('div', { class: 'row' }, [importMode, el('button', { class: 'btn', text: t('admin.desktop.importBtn'), onclick: () => desktopImport(importMode.value) })]),
    ]),

    // Documents folder for generated client files (JSON/KML/HTML/CSV).
    el('div', { class: 'section' }, [
      el('h3', { text: t('admin.docs.title') }),
      el('p', { class: 'muted', text: t('admin.docs.hint') }),
      el('div', { class: 'row' }, [docsInput, el('button', { class: 'btn btn--sm', text: t('admin.docs.browse'), onclick: pickDocumentsFolder })]),
      documentsFolder ? null : el('p', { class: 'muted', text: t('admin.docs.none') }),
    ].filter(Boolean)),
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
  onDirtyChange((dirty) => { updateSaveIndicator(dirty); if (dirty) scheduleAutosave(); });
  masterPath = await ds.getMasterPath();
  lastSavedAt = await ds.getLastSavedAt();
  documentsFolder = await ds.getDocumentsFolder();
  backupFolder = await ds.getBackupFolder();
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
