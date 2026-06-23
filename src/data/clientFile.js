// =============================================================================
// Import a client travel file (the JSON the agency emails). Reads the picked
// File, validates it, and stores it in IndexedDB as the active dataset.
// =============================================================================

import { validateClientFile } from './schema.js';
import { validateItinerary } from './itinerary.js';
import { saveDataset, saveItinerary } from './db.js';

async function readJson(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    return { ok: false, data: null, errors: ['Could not read the file.'] };
  }
  try {
    return { ok: true, data: JSON.parse(text), errors: [] };
  } catch {
    return { ok: false, data: null, errors: ['The file is not valid JSON.'] };
  }
}

/**
 * Import the places file (the JSON of points of interest).
 * @param {File} file
 * @returns {Promise<{ ok: boolean, data: ?object, errors: string[] }>}
 */
export async function importClientFile(file) {
  const read = await readJson(file);
  if (!read.ok) return read;
  const result = validateClientFile(read.data);
  if (result.ok) await saveDataset(result.data);
  return result;
}

/**
 * Import the itinerary file (the route exported from the CRM).
 * @param {File} file
 * @returns {Promise<{ ok: boolean, data: ?object, errors: string[] }>}
 */
export async function importItineraryFile(file) {
  const read = await readJson(file);
  if (!read.ok) return read;
  const result = validateItinerary(read.data);
  if (result.ok) await saveItinerary(result.data);
  return result;
}
