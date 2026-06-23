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

/**
 * Resolve an agency text (welcome/expiry/email/disclaimer) for a language.
 * Precedence: the imported file's baked-in content → the published content.json
 * → '' (caller falls back to the i18n default). `dataset` may be null.
 */
export function resolveText(field, lang, dataset) {
  const fromFile = dataset && dataset.content ? pickLang(dataset.content[field], lang) : '';
  if (fromFile) return fromFile;
  const c = getContent();
  return c ? pickLang(c[field], lang) : '';
}

/** Resolve the contact email (file → content.json → ''). */
export function resolveEmail(dataset) {
  const fromFile = dataset && dataset.content && dataset.content.email ? String(dataset.content.email).trim() : '';
  if (fromFile) return fromFile;
  const c = getContent();
  return c && c.email ? String(c.email).trim() : '';
}
