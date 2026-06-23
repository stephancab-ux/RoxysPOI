// =============================================================================
// Desktop (Tauri) master-file storage. The agency's master list lives as a JSON
// file the user keeps in a Google Drive / OneDrive synced folder, so it travels
// between their computers without any server. File I/O goes through small Rust
// commands (read_text / write_text / write_backup / path_exists) so we can read
// and write any user-chosen path; the chosen path + last-saved time are
// remembered per-computer via the store plugin.
//
// This module is only ever imported in desktop mode (see config.isDesktop()).
// =============================================================================

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { load as loadStore } from '@tauri-apps/plugin-store';

const STORE_FILE = 'roxys-admin.json';
const DEFAULT_NAME = 'roxys-master.json';

let _storePromise = null;
function store() {
  return (_storePromise ||= loadStore(STORE_FILE, { autoSave: true }));
}

// ---- Remembered settings (per computer) -------------------------------------
export async function getMasterPath() {
  return (await (await store()).get('masterPath')) || null;
}
export async function setMasterPath(path) {
  const s = await store();
  await s.set('masterPath', path);
  await s.save();
}
export async function getLastSavedAt() {
  return (await (await store()).get('lastSavedAt')) || null;
}
async function setLastSavedAt(ts) {
  const s = await store();
  await s.set('lastSavedAt', ts);
  await s.save();
}

// Folder where generated documents (client files, KML, website embeds, CSV) land.
export async function getDocumentsFolder() {
  return (await (await store()).get('documentsFolder')) || null;
}
export async function setDocumentsFolder(path) {
  const s = await store();
  await s.set('documentsFolder', path);
  await s.save();
}

// Folder where "Save backup" drops timestamped master snapshots.
export async function getBackupFolder() {
  return (await (await store()).get('backupFolder')) || null;
}
export async function setBackupFolder(path) {
  const s = await store();
  await s.set('backupFolder', path);
  await s.save();
}
/** Pick a folder (for the documents or backup location). */
export function pickFolder() {
  return open({ title: 'Choose a folder', directory: true, multiple: false });
}

/** Write arbitrary text to an exact path (for a one-off "save as"). */
export async function writeTextAt(path, contents) {
  await invoke('write_text', { path, contents });
  return path;
}

/**
 * Save a generated document into the configured documents folder under
 * `subfolder/filename`. Returns the full path, or null if no folder is set.
 */
export async function saveDocument(subfolder, filename, contents) {
  const folder = await getDocumentsFolder();
  if (!folder) return null;
  return invoke('save_document', { folder, subfolder, filename, contents });
}

// ---- File operations (via Rust commands) ------------------------------------
export function fileExists(path) {
  return invoke('path_exists', { path });
}

/** Read + parse the master JSON file at `path`. Throws on bad JSON / missing file. */
export async function readMasterFile(path) {
  const text = await invoke('read_text', { path });
  return JSON.parse(text);
}

// Local timestamp YYYYMMDD-HHMMSS for backup filenames (sorts chronologically).
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// The on-disk shape: only the data the app owns (pretty-printed, stable).
function serializeMaster(master) {
  return JSON.stringify({ categories: master.categories, pois: master.pois, content: master.content || null }, null, 2);
}

/**
 * Write the master object to `path` (pretty JSON). This is the continuous
 * autosave target — no backup is made here (backups are an explicit action).
 * @returns {Promise<{ ts:number }>}
 */
export async function writeMasterFile(path, master) {
  await invoke('write_text', { path, contents: serializeMaster(master) });
  const ts = Date.now();
  await setLastSavedAt(ts);
  return { ts };
}

/**
 * Drop a timestamped snapshot of the master into the chosen backup `folder`.
 * @returns {Promise<string>} the backup file path.
 */
export async function writeBackup(folder, master) {
  return invoke('write_backup', { folder, contents: serializeMaster(master), stamp: stamp() });
}

// ---- Native file pickers ----------------------------------------------------
/** Pick/confirm where to SAVE the master file (defaults into the last folder). */
export function pickSaveLocation(defaultPath = DEFAULT_NAME) {
  return save({ title: 'Choose where to keep your master list', defaultPath, filters: [{ name: 'Roxys master', extensions: ['json'] }] });
}
/** Pick an EXISTING master file to open. */
export function pickOpenLocation() {
  return open({ title: 'Open your master list', multiple: false, directory: false, filters: [{ name: 'Roxys master', extensions: ['json'] }] });
}
