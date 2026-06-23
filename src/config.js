// =============================================================================
// Roxys Travel Plan — central configuration
// Everything an agency might want to tweak without digging into logic lives here.
// =============================================================================

/** Path prefix the app is served under (mirrors `base` in vite.config.js). */
export const BASE_URL = import.meta.env.BASE_URL;

/**
 * Public URL of the hosted CLIENT viewer (GitHub Pages). The admin is local-only
 * now, so generated embed/iframe codes must point travelers at THIS live app —
 * not at the desktop app's local origin.
 */
export const CLIENT_APP_URL = 'https://stephancab-ux.github.io/RoxysPOI/';

/** True when running inside the Tauri desktop shell (admin desktop app). */
export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Brand identity. */
export const BRAND = {
  name: 'Roxys Travel Plan',
  tagline: 'Your expert for unique adventure.',
  gold: '#B8902F',
  logoLight: `${BASE_URL}assets/logo-black.png`, // black logo on light backgrounds
  logoDark: `${BASE_URL}assets/logo-white.png`, // white logo on dark backgrounds
};

// -----------------------------------------------------------------------------
// Admin access (client-side only — keeps casual visitors out, NOT real security).
// The password is stored as a SHA-256 hash, never in plaintext. Change it with:
//   node -e "console.log(require('crypto').createHash('sha256').update('NEW_PASSWORD').digest('hex'))"
// and paste the result below. Default credentials: user "roxy" / password "roxys-admin".
// -----------------------------------------------------------------------------
export const ADMIN = {
  user: 'roxy',
  passSha256: 'aa802c97ffea1fb1382603c471b40ea2ada8316bbb9f669526c67eea79be7d64',
};

// -----------------------------------------------------------------------------
// Map configuration.
// -----------------------------------------------------------------------------
export const MAP = {
  // Online default: standard, keyless, full-detail OpenStreetMap raster tiles.
  osmUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  osmAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  // Where the map opens before any data/geolocation is available (Bali — the
  // agency's hub in the reference material).
  defaultCenter: [-8.4095, 115.1889],
  defaultZoom: 9,
  // Clustering behaviour: radius ≈ one pin's footprint (iconSize 32 + border),
  // so pins only merge when their bodies would actually touch/overlap.
  clusterMaxRadius: 32,
};

// -----------------------------------------------------------------------------
// Internationalisation.
// -----------------------------------------------------------------------------
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
];
export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_THEME = 'dark'; // 'dark' | 'light'

// -----------------------------------------------------------------------------
// Seed categories (the agency will add many more via the admin).
// Each category renders the SAME emoji + colour worldwide. Fully editable.
// -----------------------------------------------------------------------------
export const SEED_CATEGORIES = [
  { id: 'cat-beach', name: 'Beach', names: { en: 'Beach', fr: 'Plage', de: 'Strand' }, emoji: '🏖️', color: '#2A9D8F' },
  { id: 'cat-food', name: 'Food', names: { en: 'Food', fr: 'Restaurant', de: 'Essen' }, emoji: '🍜', color: '#E76F51' },
  { id: 'cat-drink', name: 'Drink', names: { en: 'Drink', fr: 'Bar', de: 'Getränke' }, emoji: '🍹', color: '#9B5DE5' },
  { id: 'cat-coffee', name: 'Coffee Breaky', names: { en: 'Coffee Breaky', fr: 'Pause café', de: 'Kaffeepause' }, emoji: '☕', color: '#6F4E37' },
  { id: 'cat-hikes', name: 'Hikes', names: { en: 'Hikes', fr: 'Randonnées', de: 'Wanderungen' }, emoji: '🥾', color: '#588157' },
  { id: 'cat-animal', name: 'Animal Land', names: { en: 'Animal Land', fr: 'Animaux', de: 'Tierwelt' }, emoji: '🐾', color: '#F4A261' },
  { id: 'cat-attraction', name: 'Attraction', names: { en: 'Attraction', fr: 'Attraction', de: 'Attraktion' }, emoji: '⭐', color: '#264653' },
];

// -----------------------------------------------------------------------------
// CSV import — default column mapping for exportgooglemaps.com output.
// Matching is case-insensitive and whitespace-trimmed; these are the defaults the
// importer offers, and the admin can override them per file in the mapping UI.
// -----------------------------------------------------------------------------
export const CSV_DEFAULT_MAPPING = {
  name: ['title', 'name'],
  note: ['note', 'notes', 'description'],
  googleUrl: ['url', 'link', 'google maps url', 'maps url'],
  lat: ['latitude', 'lat', 'y'],
  lng: ['longitude', 'lng', 'lon', 'long', 'x'],
  country: ['country', 'address', 'location'],
  // Optional per-row category ("list") column → each row links to its own category.
  category: ['category', 'list', 'type', 'categorie', 'catégorie', 'kategorie'],
};
/** Columns we explicitly ignore from the source files. */
export const CSV_IGNORED_COLUMNS = ['tags', 'comment'];
