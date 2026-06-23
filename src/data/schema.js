// =============================================================================
// Data model: type definitions, id generation, validation & normalisation.
// =============================================================================

/**
 * @typedef {Object} POI
 * @property {string} id          stable unique id
 * @property {string} name        e.g. "Bali Museum"
 * @property {?string} note       optional free text (shown in popup if present)
 * @property {string} googleUrl   original Google Maps link
 * @property {number} lat
 * @property {number} lng
 * @property {string} categoryId  references a Category
 * @property {string} country     ISO country name, e.g. "Indonesia" ('' if unknown)
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name        e.g. "Beach"
 * @property {string} emoji       one emoji, applied globally
 * @property {string} color       hex, used for the marker colour
 */

/**
 * @typedef {Object} ClientFile
 * @property {string} client
 * @property {string} validFrom   "YYYY-MM-DD"
 * @property {string} validUntil  "YYYY-MM-DD" (inclusive; app locks after)
 * @property {Category[]} categories
 * @property {POI[]} points
 */

/** Generate a stable unique id (never derived from name — duplicates exist). */
export function genId(prefix = 'id') {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${rand}`;
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Coerce loose input into a clean Category with per-language names. */
export function normalizeCategory(c) {
  const base = String(c.name ?? '').trim() || 'Untitled';
  const src = c.names && typeof c.names === 'object' ? c.names : {};
  const en = String(src.en ?? base).trim() || base;
  return {
    id: c.id || genId('cat'),
    name: en, // EN is the canonical fallback used everywhere a single name is needed
    names: {
      en,
      fr: String(src.fr ?? '').trim() || en,
      de: String(src.de ?? '').trim() || en,
    },
    emoji: String(c.emoji ?? '📍').trim() || '📍',
    color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.color || '') ? c.color : '#B8902F',
  };
}

/** The category's name in the given language, falling back to EN. */
export function categoryName(cat, lang = 'en') {
  if (!cat) return '';
  return (cat.names && (cat.names[lang] || cat.names.en)) || cat.name || '';
}

/** Coerce loose input into a clean POI. Returns null if unusable (no name). */
export function normalizePOI(p) {
  const name = String(p.name ?? '').trim();
  if (!name) return null;
  const lat = typeof p.lat === 'string' ? parseFloat(p.lat) : p.lat;
  const lng = typeof p.lng === 'string' ? parseFloat(p.lng) : p.lng;
  return {
    id: p.id || genId('poi'),
    name,
    note: p.note ? String(p.note).trim() : null,
    googleUrl: p.googleUrl ? String(p.googleUrl).trim() : '',
    lat: isFiniteNum(lat) ? lat : null,
    lng: isFiniteNum(lng) ? lng : null,
    categoryId: p.categoryId || '',
    country: p.country ? String(p.country).trim() : '',
    // Stable Google "feature id" (0x…:0x…) used to dedupe imports; '' if unknown.
    placeId: p.placeId ? String(p.placeId).trim() : '',
  };
}

/** True when a POI has usable coordinates. */
export function hasCoords(p) {
  return isFiniteNum(p.lat) && isFiniteNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

/**
 * Validate & normalise an imported client file.
 * @returns {{ ok: boolean, errors: string[], data: ?ClientFile }}
 */
export function validateClientFile(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Not a valid JSON object.'], data: null };
  }
  if (!Array.isArray(obj.points)) errors.push('Missing "points" array.');
  if (!Array.isArray(obj.categories)) errors.push('Missing "categories" array.');
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (obj.validUntil && !dateRe.test(obj.validUntil)) errors.push('"validUntil" must be YYYY-MM-DD.');
  if (obj.validFrom && !dateRe.test(obj.validFrom)) errors.push('"validFrom" must be YYYY-MM-DD.');
  if (errors.length) return { ok: false, errors, data: null };

  const categories = obj.categories.map(normalizeCategory);
  const points = obj.points.map(normalizePOI).filter(Boolean).filter(hasCoords);
  const data = {
    client: String(obj.client ?? '').trim(),
    validFrom: obj.validFrom || '',
    validUntil: obj.validUntil || '',
    categories,
    points,
    // Baked-in agency texts (welcome/expiry/email/disclaimer) travel with the file.
    content: obj.content && typeof obj.content === 'object' ? obj.content : null,
  };
  return { ok: true, errors: [], data };
}

/**
 * Is the dataset expired? `validUntil` is inclusive and compared in UTC so the
 * result does not flip with the device timezone. Empty = never expires.
 */
export function isExpired(validUntil, now = new Date()) {
  if (!validUntil) return false;
  const end = new Date(`${validUntil}T23:59:59Z`).getTime();
  return now.getTime() > end;
}

/** Distinct, sorted country list from a set of POIs. */
export function countriesOf(points) {
  return [...new Set(points.map((p) => p.country).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
