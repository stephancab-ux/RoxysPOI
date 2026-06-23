// =============================================================================
// Import a client travel file (the JSON the agency emails). Reads the picked
// File, validates it, and stores it in IndexedDB as the active dataset.
// =============================================================================

import { validateClientFile } from './schema.js';
import { validateItinerary, isItineraryShape } from './itinerary.js';
import { saveDataset, clearDataset, saveItinerary, clearItinerary } from './db.js';

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

/**
 * Unified import for the single client document. Auto-detects the file kind and
 * REPLACES whatever is currently loaded (each file is the whole travel plan):
 *   • recommendation list (points+categories), optionally carrying an `itinerary`
 *     → save the places, save/clear the route accordingly;
 *   • bare CRM itinerary (has `stops`) → save the route, clear the places.
 * @param {File} file
 * @returns {Promise<{ ok: boolean, data: ?object, errors: string[] }>}
 */
export async function importTravelFile(file) {
  const read = await readJson(file);
  if (!read.ok) return read;
  const obj = read.data;

  // Recommendation list / combined file (carries points + categories).
  if (obj && Array.isArray(obj.points) && Array.isArray(obj.categories)) {
    const result = validateClientFile(obj);
    if (!result.ok) return result;
    await saveDataset(result.data);
    const itin = result.data.itinerary ? validateItinerary(result.data.itinerary) : null;
    if (itin && itin.ok) await saveItinerary(itin.data);
    else await clearItinerary(); // replace-all: a list-only file clears any old route
    return result;
  }

  // Bare itinerary exported from the CRM (carries stops).
  if (isItineraryShape(obj)) {
    const result = validateItinerary(obj);
    if (!result.ok) return result;
    await saveItinerary(result.data);
    await clearDataset(); // replace-all: a route-only file is the whole plan
    return result;
  }

  return { ok: false, data: null, errors: ['Unrecognized file — not a recommendation list or an itinerary.'] };
}
