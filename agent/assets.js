// =============================================================================
// Bundled reference files (country-name translations + the brand logo). In the
// standalone roxys-agent.exe they are embedded as SEA assets (see
// agent/build-exe.mjs); when run from the repo they are read from public/.
// =============================================================================

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as sea from 'node:sea';

const standalone = typeof sea.isSea === 'function' && sea.isSea();

/** True when running as the standalone executable. */
export function isStandalone() {
  return standalone;
}

function read(key, repoPath) {
  if (standalone) return Buffer.from(sea.getAsset(key));
  return fs.readFileSync(fileURLToPath(new URL(`../${repoPath}`, import.meta.url)));
}

/** EN → { fr, de } country-name table (public/i18n/countries.json). */
export function countryNamesTable() {
  return JSON.parse(read('countries.json', 'public/i18n/countries.json').toString('utf8'));
}

/** The black logo as a data URI, exactly as the admin embeds it in branded pages. */
export function logoDataUri() {
  return `data:image/png;base64,${read('logo-black.png', 'public/assets/logo-black.png').toString('base64')}`;
}

/** SEA asset key → repo path, used by the exe build. */
export const SEA_ASSETS = {
  'countries.json': 'public/i18n/countries.json',
  'logo-black.png': 'public/assets/logo-black.png',
};
