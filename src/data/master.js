// =============================================================================
// Admin master dataset: { categories, pois, content }. Source of truth lives as
// data/master.json (+ data/content.json) in the repo; the admin loads it, edits
// it (persisted to IndexedDB), and exports it for the agency to commit to GitHub.
// =============================================================================

import { BASE_URL, SEED_CATEGORIES, isDesktop } from '../config.js';
import { loadMaster, saveMaster } from './db.js';
import { normalizeCategory, normalizePOI } from './schema.js';
import { downloadFile } from '../ui/components.js';

const DEFAULT_EMAIL = 'info@roxystravelplan.com';

export function normalizeContent(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const block = (b) => ({ en: (b?.en || '').toString(), fr: (b?.fr || '').toString(), de: (b?.de || '').toString() });
  return { welcome: block(r.welcome), expiry: block(r.expiry), email: (r.email || DEFAULT_EMAIL).toString() };
}

export function normalizeMaster(raw) {
  return {
    categories: (raw.categories || []).map(normalizeCategory),
    pois: (raw.pois || []).map(normalizePOI).filter(Boolean),
    content: raw.content ? normalizeContent(raw.content) : null, // filled from content.json if absent
  };
}

/** A fresh starter dataset (default categories, no points) — used by the
 *  desktop app's "Start a new list" and as a fallback seed. */
export function seedMaster() {
  return {
    categories: SEED_CATEGORIES.map((c) => normalizeCategory({ ...c })),
    pois: [],
    content: normalizeContent({}),
  };
}

// ---- Unsaved-changes tracking (desktop: the file is the source of truth) -----
let _dirty = false;
let _onDirty = null;
/** Subscribe to dirty-state changes (desktop save indicator). */
export function onDirtyChange(cb) {
  _onDirty = cb;
}
export function isDirty() {
  return _dirty;
}
function setDirty(v) {
  _dirty = v;
  _onDirty?.(v);
}
/** Call after a successful file save (desktop) to clear the unsaved flag. */
export function markSaved() {
  setDirty(false);
}

/** The published live texts (data/content.json), or sensible defaults. */
export async function fetchPublishedContent() {
  try {
    const res = await fetch(`${BASE_URL}data/content.json`);
    if (res.ok) return normalizeContent(await res.json());
  } catch {
    /* ignore */
  }
  return normalizeContent({});
}

/** Load from IndexedDB, falling back to the bundled seed files on first run. */
export async function loadMasterData() {
  const stored = await loadMaster();
  if (stored && Array.isArray(stored.pois)) {
    const m = normalizeMaster(stored);
    if (!m.content) m.content = await fetchPublishedContent();
    return m;
  }
  const seed = await fetchSeed();
  await saveMaster(seed);
  return seed;
}

export async function fetchSeed() {
  let m = { categories: [], pois: [], content: null };
  try {
    const res = await fetch(`${BASE_URL}data/master.json`);
    if (res.ok) m = normalizeMaster(await res.json());
  } catch {
    /* ignore */
  }
  // No published seed (the agency list is no longer shipped online) → start from
  // the built-in default categories so the admin is never empty.
  if (!m.categories.length) m.categories = seedMaster().categories;
  if (!m.content) m.content = await fetchPublishedContent();
  return m;
}

/**
 * Persist the working master. On the web admin this writes IndexedDB. In the
 * desktop app the FILE is the source of truth and saving is explicit, so we only
 * flag unsaved changes here (the user clicks Save to write the file).
 */
export async function persistMaster(master) {
  if (isDesktop()) {
    setDirty(true);
    return;
  }
  await saveMaster({ categories: master.categories, pois: master.pois, content: master.content || null });
}

export function exportMaster(master) {
  downloadFile('master.json', JSON.stringify({ categories: master.categories, pois: master.pois, content: master.content }, null, 2));
}

/** Export just the editable texts for publishing as public/data/content.json. */
export function exportContent(master) {
  downloadFile('content.json', JSON.stringify(master.content || normalizeContent({}), null, 2));
}
