// =============================================================================
// Import a client travel file (the JSON the agency emails). Reads the picked
// File, validates it, and stores it in IndexedDB as the active dataset.
// =============================================================================

import { validateClientFile } from './schema.js';
import { saveDataset } from './db.js';

/**
 * @param {File} file
 * @returns {Promise<{ ok: boolean, data: ?object, errors: string[] }>}
 */
export async function importClientFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    return { ok: false, data: null, errors: ['Could not read the file.'] };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, data: null, errors: ['The file is not valid JSON.'] };
  }
  const result = validateClientFile(json);
  if (result.ok) await saveDataset(result.data);
  return result;
}
