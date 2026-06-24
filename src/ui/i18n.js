// =============================================================================
// Internationalisation. UI strings only — POI data is NEVER translated.
// Dictionaries are plain JSON in /public/i18n so they are easy to edit later.
// =============================================================================

import { BASE_URL, DEFAULT_LANGUAGE, LANGUAGES } from '../config.js';
import { setCountryNames } from '../data/schema.js';

const KEY = 'roxys.lang';
const cache = new Map(); // lang -> dict
let current = DEFAULT_LANGUAGE;
let dict = {};
const listeners = new Set();

export function getLang() {
  return current;
}

export function storedLang() {
  const saved = localStorage.getItem(KEY);
  return LANGUAGES.some((l) => l.code === saved) ? saved : DEFAULT_LANGUAGE;
}

async function loadDict(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const res = await fetch(`${BASE_URL}i18n/${lang}.json`);
  if (!res.ok) throw new Error(`Cannot load language "${lang}"`);
  const json = await res.json();
  cache.set(lang, json);
  return json;
}

/** Translate a dotted key, with optional {placeholder} interpolation. */
export function t(key, vars) {
  let s = dict[key];
  if (s == null) s = key; // fall back to the key so missing strings are obvious
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
  return s;
}

/** Apply translations to every [data-i18n*] element under `root`. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((n) => {
    n.textContent = t(n.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((n) => {
    n.innerHTML = t(n.getAttribute('data-i18n-html'));
  });
  const attrs = ['placeholder', 'title', 'aria-label', 'value'];
  attrs.forEach((attr) => {
    root.querySelectorAll(`[data-i18n-${attr}]`).forEach((n) => {
      n.setAttribute(attr, t(n.getAttribute(`data-i18n-${attr}`)));
    });
  });
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Load + activate a language, persist it, re-render, and notify listeners. */
export async function setLang(lang) {
  dict = await loadDict(lang);
  current = lang;
  localStorage.setItem(KEY, lang);
  document.documentElement.setAttribute('lang', lang);
  applyTranslations(document);
  listeners.forEach((fn) => fn(lang));
}

// Country names live in a single bundled table carrying every language, so we
// load it once (not per setLang). On failure countryName() falls back to EN.
let countriesLoaded = false;
async function loadCountryNames() {
  if (countriesLoaded) return;
  try {
    const res = await fetch(`${BASE_URL}i18n/countries.json`);
    if (res.ok) setCountryNames(await res.json());
  } catch {
    /* non-fatal: country names stay in English */
  }
  countriesLoaded = true;
}

export async function initI18n() {
  await Promise.all([setLang(storedLang()), loadCountryNames()]);
}
