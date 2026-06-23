// =============================================================================
// IndexedDB access (via idb). Stores:
//   dataset       — the client's imported travel file (single record, key 'current')
//   itinerary     — the client's imported route file (single record, key 'current')
//   master        — the agency master {pois, categories} (single record, key 'current')
//   offlinePacks  — downloaded PMTiles vector packs, keyed by country
//   settings      — misc key/value (language & theme live in localStorage)
//
// The dataset MUST NOT live in localStorage (per the brief) — it can be large.
// =============================================================================

import { openDB } from 'idb';

const DB_NAME = 'roxys-travel-plan';
const DB_VERSION = 2;

let _dbPromise = null;

export function db() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        // Versioned, additive upgrades keep stored data safe across app updates.
        if (oldVersion < 1) {
          database.createObjectStore('dataset');
          database.createObjectStore('master');
          database.createObjectStore('offlinePacks', { keyPath: 'country' });
          database.createObjectStore('settings');
        }
        if (oldVersion < 2) {
          database.createObjectStore('itinerary');
        }
      },
    });
  }
  return _dbPromise;
}

// ---- Client dataset ----------------------------------------------------------
export async function saveDataset(dataset) {
  return (await db()).put('dataset', dataset, 'current');
}
export async function loadDataset() {
  return (await db()).get('dataset', 'current');
}
export async function clearDataset() {
  return (await db()).delete('dataset', 'current');
}

// ---- Client itinerary (route) ------------------------------------------------
export async function saveItinerary(itinerary) {
  return (await db()).put('itinerary', itinerary, 'current');
}
export async function loadItinerary() {
  return (await db()).get('itinerary', 'current');
}
export async function clearItinerary() {
  return (await db()).delete('itinerary', 'current');
}

// ---- Admin master ------------------------------------------------------------
export async function saveMaster(master) {
  return (await db()).put('master', master, 'current');
}
export async function loadMaster() {
  return (await db()).get('master', 'current');
}

// ---- Offline map packs -------------------------------------------------------
/** @param {{country:string, blob:Blob, size:number, bbox:number[]}} rec */
export async function savePack(rec) {
  return (await db()).put('offlinePacks', rec);
}
export async function loadPack(country) {
  return (await db()).get('offlinePacks', country);
}
export async function listPacks() {
  return (await db()).getAll('offlinePacks');
}
export async function deletePack(country) {
  return (await db()).delete('offlinePacks', country);
}

// ---- Settings (misc) ---------------------------------------------------------
export async function getSetting(key, fallback = null) {
  const v = await (await db()).get('settings', key);
  return v === undefined ? fallback : v;
}
export async function setSetting(key, value) {
  return (await db()).put('settings', value, key);
}
