// =============================================================================
// Admin master dataset: {categories, pois}. Source of truth lives as
// data/master.json in the repo; the admin loads it, edits it (persisted to
// IndexedDB), and exports it for the agency to commit back to GitHub.
// =============================================================================

import { BASE_URL } from '../config.js';
import { loadMaster, saveMaster } from './db.js';
import { normalizeCategory, normalizePOI } from './schema.js';
import { downloadFile } from '../ui/components.js';

function normalizeMaster(raw) {
  return {
    categories: (raw.categories || []).map(normalizeCategory),
    pois: (raw.pois || []).map(normalizePOI).filter(Boolean),
  };
}

/** Load from IndexedDB, falling back to the bundled seed file on first run. */
export async function loadMasterData() {
  const stored = await loadMaster();
  if (stored && Array.isArray(stored.pois)) return normalizeMaster(stored);
  const seed = await fetchSeed();
  await saveMaster(seed);
  return seed;
}

export async function fetchSeed() {
  try {
    const res = await fetch(`${BASE_URL}data/master.json`);
    if (res.ok) return normalizeMaster(await res.json());
  } catch {
    /* ignore */
  }
  return { categories: [], pois: [] };
}

export async function persistMaster(master) {
  await saveMaster({ categories: master.categories, pois: master.pois });
}

export function exportMaster(master) {
  downloadFile('master.json', JSON.stringify({ categories: master.categories, pois: master.pois }, null, 2));
}
