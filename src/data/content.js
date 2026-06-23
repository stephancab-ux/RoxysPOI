// =============================================================================
// Agency-editable UI text (welcome screen, expiry screen, contact email) in
// EN/FR/DE. The live copy is published as /data/content.json; the client fetches
// it at startup and overrides the built-in i18n defaults. If it's missing or
// unreachable, callers fall back to the i18n strings so the app always works.
// The admin edits this and re-publishes content.json (see admin Texts tab).
// =============================================================================

import { BASE_URL } from '../config.js';

export const EMPTY_CONTENT = { welcome: {}, expiry: {}, email: '' };

let _content = null;
let _loaded = false;

export async function loadContent() {
  if (_loaded) return _content;
  try {
    const res = await fetch(`${BASE_URL}data/content.json`);
    if (res.ok) _content = await res.json();
  } catch {
    /* offline / missing → fall back to i18n defaults */
  }
  _loaded = true;
  return _content;
}

export function getContent() {
  return _content;
}

/** Pick a language string from a {en,fr,de} block, falling back to EN. */
export function pickLang(block, lang) {
  if (!block || typeof block !== 'object') return '';
  return (block[lang] || block.en || '').trim();
}
