// =============================================================================
// Admin master dataset: { categories, pois, content }. Source of truth lives as
// data/master.json (+ data/content.json) in the repo; the admin loads it, edits
// it (persisted to IndexedDB), and exports it for the agency to commit to GitHub.
// =============================================================================

import { BASE_URL, SEED_CATEGORIES, isDesktop } from '../config.js';
import { loadMaster, saveMaster } from './db.js';
import { normalizeCategory, normalizePOI } from './schema.js';
import { downloadFile } from '../ui/components.js';

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

/** A fresh starter dataset (default categories, no points) — used by the
 *  desktop app's "Start a new list" and as a fallback seed. */
export function seedMaster() {
  return {
    categories: SEED_CATEGORIES.map((c) => normalizeCategory({ ...c })),
    pois: [],
    content: normalizeContent({}),
  };
}

// ---- Unsaved-changes tracking (desktop: the file is the source of truth) -----
let _dirty = false;
let _onDirty = null;
/** Subscribe to dirty-state changes (desktop save indicator). */
export function onDirtyChange(cb) {
  _onDirty = cb;
}
export function isDirty() {
  return _dirty;
}
function setDirty(v) {
  _dirty = v;
  _onDirty?.(v);
}
/** Call after a successful file save (desktop) to clear the unsaved flag. */
export function markSaved() {
  setDirty(false);
}

/** The published live texts (data/content.json), or sensible defaults. */
export async function fetchPublishedContent() {
  try {
    const res = await fetch(`${BASE_URL}data/content.json`);
    if (res.ok) return normalizeContent(await res.json());
  } catch {
    /* ignore */
  }
  return normalizeContent({});
}

/** Load from IndexedDB, falling back to the bundled seed files on first run. */
export async function loadMasterData() {
  const stored = await loadMaster();
  if (stored && Array.isArray(stored.pois)) {
    const m = normalizeMaster(stored);
    if (!m.content) m.content = await fetchPublishedContent();
    return m;
  }
  const seed = await fetchSeed();
  await saveMaster(seed);
  return seed;
}

export async function fetchSeed() {
  let m = { categories: [], pois: [], content: null };
  try {
    const res = await fetch(`${BASE_URL}data/master.json`);
    if (res.ok) m = normalizeMaster(await res.json());
  } catch {
    /* ignore */
  }
  // No published seed (the agency list is no longer shipped online) → start from
  // the built-in default categories so the admin is never empty.
  if (!m.categories.length) m.categories = seedMaster().categories;
  if (!m.content) m.content = await fetchPublishedContent();
  return m;
}

/**
 * Persist the working master. On the web admin this writes IndexedDB. In the
 * desktop app the FILE is the source of truth and saving is explicit, so we only
 * flag unsaved changes here (the user clicks Save to write the file).
 */
export async function persistMaster(master) {
  if (isDesktop()) {
    setDirty(true);
    return;
  }
  await saveMaster({ categories: master.categories, pois: master.pois, content: master.content || null });
}

export function exportMaster(master) {
  downloadFile('master.json', JSON.stringify({ categories: master.categories, pois: master.pois, content: master.content }, null, 2));
}

/** Export just the editable texts for publishing as public/data/content.json. */
export function exportContent(master) {
  downloadFile('content.json', JSON.stringify(master.content || normalizeContent({}), null, 2));
}
