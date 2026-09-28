// =============================================================================
// Data model: type definitions, id generation, validation & normalisation.
// =============================================================================

import { isItineraryShape } from './itinerary.js';

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
 * @property {?{name:string,dataUri?:string,url?:string}} guide  optional Travel Guide: an embedded base64 PDF (`dataUri`) or a hosted link (`url`)
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

// Country display-name table (English NE name -> { fr, de }), installed once at
// startup from public/i18n/countries.json. Empty until then, so countryName()
// simply falls back to the English name and every call site stays safe.
let countryNames = {};

/** Install the EN->{fr,de} country table (called once after it is fetched). */
export function setCountryNames(table) {
  countryNames = table || {};
}

/**
 * A country's display name in the given language. POIs always store the
 * canonical English Natural Earth name; this translates it for display only,
 * falling back to the English string when there is no entry (or before the
 * table has loaded). EN passes through unchanged.
 */
export function countryName(name, lang = 'en') {
  if (!name) return '';
  const tr = countryNames[name];
  return (tr && tr[lang]) || name;
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
 * Coerce an optional Travel Guide into a clean shape, or null. Exactly one of
 * `dataUri` (an embedded base64 PDF) or `url` (a hosted link) survives; anything
 * else — missing, wrong type, a non-PDF data URI — drops to null so the viewer
 * simply shows no guide button.
 */
function normalizeGuide(g) {
  if (!g || typeof g !== 'object') return null;
  const name = String(g.name ?? '').trim();
  if (typeof g.dataUri === 'string' && g.dataUri.startsWith('data:application/pdf')) return { name, dataUri: g.dataUri };
  if (typeof g.url === 'string' && /^https?:\/\//i.test(g.url.trim())) return { name, url: g.url.trim() };
  return null;
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
    // Optional combined-file payload: the raw CRM itinerary, re-validated on use
    // by validateItinerary() so the route renders alongside the recommendation list.
    itinerary: obj.itinerary && isItineraryShape(obj.itinerary) ? obj.itinerary : null,
    // Optional Travel Guide PDF (embedded base64 data URI) or a hosted link.
    guide: normalizeGuide(obj.guide),
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

/**
 * Distinct country list from a set of POIs. Values are always the canonical
 * English names; pass `lang` to sort by the localized display name (the EN
 * default reproduces the plain English sort).
 */
export function countriesOf(points, lang = 'en') {
  return [...new Set(points.map((p) => p.country).filter(Boolean))].sort((a, b) =>
    countryName(a, lang).localeCompare(countryName(b, lang))
  );
}

// ---- Master dataset { categories, pois, content } ----------------------------

const DEFAULT_EMAIL = 'info@roxystravelplan.com';

// Default legal disclaimer (agency-editable in the Texts tab). Shown as a
// must-accept gate after a client imports a file, and re-readable in Settings.
export const DEFAULT_DISCLAIMER = {
  en: `Travel Information Disclaimer

The points of interest displayed within this application are based on locations visited, observed, or recommended during our travels across Asia.

While we strive to provide useful and accurate information, Roxy's Travel Plan does not warrant or guarantee the accuracy, availability, suitability, safety, or current status of any location, activity, accommodation, transportation provider, restaurant, tour operator, or service featured on this map.

Businesses may close, change ownership, alter services, modify operating hours, or cease operations without notice. Users are solely responsible for verifying all information and assessing the suitability and safety of any activity or destination prior to making reservations or travel decisions.

Roxy's Travel Plan shall not be liable for any loss, damage, injury, inconvenience, expense, or dissatisfaction arising from the use of information contained within this application.

Intellectual Property

© Roxy's Travel Plan. All rights reserved.

This itinerary, map, and all associated content are proprietary materials of Roxy's Travel Plan and are licensed solely for the personal use of the purchasing traveler(s). Unauthorized sharing, duplication, distribution, publication, resale, or commercial use is strictly prohibited.`,
  fr: `Avertissement sur les informations de voyage

Les points d'intérêt présentés dans cette application sont basés sur des lieux visités, observés ou recommandés lors de nos voyages à travers l'Asie.

Bien que nous nous efforcions de fournir des informations utiles et exactes, Roxy's Travel Plan ne garantit pas l'exactitude, la disponibilité, l'adéquation, la sécurité ou l'état actuel d'un lieu, d'une activité, d'un hébergement, d'un prestataire de transport, d'un restaurant, d'un voyagiste ou d'un service présenté sur cette carte.

Les établissements peuvent fermer, changer de propriétaire, modifier leurs services ou leurs horaires, ou cesser leur activité sans préavis. Il incombe à l'utilisateur de vérifier toutes les informations et d'évaluer l'adéquation et la sécurité de toute activité ou destination avant d'effectuer des réservations ou de prendre des décisions de voyage.

Roxy's Travel Plan ne saurait être tenu responsable de toute perte, dommage, blessure, désagrément, dépense ou insatisfaction résultant de l'utilisation des informations contenues dans cette application.

Propriété intellectuelle

© Roxy's Travel Plan. Tous droits réservés.

Cet itinéraire, cette carte et l'ensemble du contenu associé sont la propriété exclusive de Roxy's Travel Plan et sont concédés sous licence uniquement pour l'usage personnel du ou des voyageurs acheteurs. Tout partage, duplication, distribution, publication, revente ou usage commercial non autorisé est strictement interdit.`,
  de: `Haftungsausschluss zu Reiseinformationen

Die in dieser Anwendung angezeigten Sehenswürdigkeiten basieren auf Orten, die wir auf unseren Reisen durch Asien besucht, beobachtet oder empfohlen haben.

Wir bemühen uns, nützliche und genaue Informationen bereitzustellen, dennoch übernimmt Roxy's Travel Plan keine Gewähr für die Richtigkeit, Verfügbarkeit, Eignung, Sicherheit oder den aktuellen Status eines Ortes, einer Aktivität, einer Unterkunft, eines Transportanbieters, eines Restaurants, eines Reiseveranstalters oder einer Dienstleistung auf dieser Karte.

Betriebe können ohne Vorankündigung schließen, den Eigentümer wechseln, Leistungen oder Öffnungszeiten ändern oder den Betrieb einstellen. Die Nutzer sind allein dafür verantwortlich, alle Informationen zu überprüfen und die Eignung und Sicherheit jeder Aktivität oder jedes Reiseziels zu beurteilen, bevor sie Reservierungen vornehmen oder Reiseentscheidungen treffen.

Roxy's Travel Plan haftet nicht für Verluste, Schäden, Verletzungen, Unannehmlichkeiten, Kosten oder Unzufriedenheit, die sich aus der Nutzung der in dieser Anwendung enthaltenen Informationen ergeben.

Geistiges Eigentum

© Roxy's Travel Plan. Alle Rechte vorbehalten.

Diese Reiseroute, diese Karte und alle zugehörigen Inhalte sind urheberrechtlich geschütztes Material von Roxy's Travel Plan und werden ausschließlich für den persönlichen Gebrauch der kaufenden Reisenden lizenziert. Unbefugtes Teilen, Vervielfältigen, Verbreiten, Veröffentlichen, Weiterverkaufen oder die kommerzielle Nutzung sind strengstens untersagt.`,
};

export function normalizeContent(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const block = (b) => ({ en: (b?.en || '').toString(), fr: (b?.fr || '').toString(), de: (b?.de || '').toString() });
  const disclaimer = block(r.disclaimer);
  if (!disclaimer.en && !disclaimer.fr && !disclaimer.de) Object.assign(disclaimer, DEFAULT_DISCLAIMER);
  return { welcome: block(r.welcome), expiry: block(r.expiry), email: (r.email || DEFAULT_EMAIL).toString(), disclaimer };
}

export function normalizeMaster(raw) {
  return {
    categories: (raw.categories || []).map(normalizeCategory),
    pois: (raw.pois || []).map(normalizePOI).filter(Boolean),
    content: raw.content ? normalizeContent(raw.content) : null, // filled from content.json if absent
  };
}

/** Ensure a master carries texts (a file saved without `content` gets the defaults). */
export function withDefaultContent(m) {
  if (!m.content) m.content = normalizeContent({});
  return m;
}
