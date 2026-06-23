// =============================================================================
// Save a generated file (client JSON, KML, website embed, CSV export…).
//   • Web   → a normal browser download.
//   • Desktop (Tauri) → write it into the configured Documents folder under a
//     subfolder; if no folder is set yet, fall back to a native Save dialog.
// Keeping this in one place means every "export" button behaves correctly in
// both the web build and the desktop app.
// =============================================================================

import { isDesktop } from '../config.js';
import { downloadFile, toast } from '../ui/components.js';
import { t } from '../ui/i18n.js';

export async function saveOutput(subfolder, filename, content, mime) {
  if (!isDesktop()) {
    downloadFile(filename, content, mime);
    toast(t('admin.docs.downloaded'), 'ok');
    return;
  }
  const ds = await import('../data/desktopStore.js');
  try {
    let path = await ds.saveDocument(subfolder, filename, content);
    if (!path) {
      // No documents folder configured → let the user pick a location once.
      const chosen = await ds.pickSaveLocation(filename);
      if (!chosen) return;
      path = await ds.writeTextAt(chosen, content);
    }
    toast(t('admin.docs.savedTo', { path }), 'ok');
  } catch {
    toast(t('admin.desktop.saveError'), 'error');
  }
}
