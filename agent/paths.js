// =============================================================================
// Where are the master list and the Documents folder? The desktop app remembers
// both (per computer) in its settings file, written by tauri-plugin-store into
// the app-data folder. Flags and environment variables override it.
// =============================================================================

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Must match `identifier` in src-tauri/tauri.conf.json (checked by a test). */
export const APP_ID = 'com.roxystravelplan.admin';
/** Must match STORE_FILE in src/data/desktopStore.js (checked by a test). */
export const STORE_FILE = 'roxys-admin.json';

/** Tauri's app-data folder for this app (BaseDirectory::AppData). */
export function appDataDir(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const roaming = env.APPDATA || path.join(env.USERPROFILE || os.homedir(), 'AppData', 'Roaming');
    return path.win32.join(roaming, APP_ID);
  }
  if (platform === 'darwin') return path.join(env.HOME || os.homedir(), 'Library', 'Application Support', APP_ID);
  return path.join(env.XDG_DATA_HOME || path.join(env.HOME || os.homedir(), '.local', 'share'), APP_ID);
}

/** The app's remembered settings ({ masterPath, documentsFolder, … }), or null. */
function readAppSettings(file) {
  try {
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Resolve both locations. Precedence: explicit option (CLI flag) → environment
 * variable (ROXYS_MASTER / ROXYS_DOCUMENTS) → the desktop app's settings.
 * Re-read on every call so a change made in the app applies immediately.
 */
export function resolvePaths({ master, docs } = {}, env = process.env, platform = process.platform) {
  const settingsFile = (platform === 'win32' ? path.win32 : path).join(appDataDir(env, platform), STORE_FILE);
  const settings = readAppSettings(settingsFile);
  const pick = (flag, envName, key) => {
    if (flag) return { value: path.resolve(flag), source: 'flag' };
    if (env[envName]) return { value: path.resolve(env[envName]), source: 'env' };
    const v = settings && typeof settings[key] === 'string' && settings[key].trim();
    return v ? { value: v, source: 'app' } : { value: null, source: null };
  };
  const m = pick(master, 'ROXYS_MASTER', 'masterPath');
  const d = pick(docs, 'ROXYS_DOCUMENTS', 'documentsFolder');
  return {
    settingsFile,
    settingsFound: settings !== null,
    master: m.value,
    masterSource: m.source,
    docs: d.value,
    docsSource: d.source,
  };
}
