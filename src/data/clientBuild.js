// =============================================================================
// Build a scoped client file (the "recommendation list") from the master list.
// DOM-free so the admin's Client file tab and the agent helper (agent/) share
// one set of rules and produce identical files.
// =============================================================================

import { hasCoords } from './schema.js';

/** Where each deliverable is saved: Documents subfolder + filename suffix. */
export const DELIVERABLES = {
  list: { subfolder: 'Recommendation lists', suffix: '-recommendation-list.json', mime: 'application/json' },
  page: { subfolder: 'Recommendation pages', suffix: '-recommendation.html', mime: 'text/html' },
  map: { subfolder: 'Website embeds', suffix: '-map.html', mime: 'text/html' },
  kml: { subfolder: 'KML', suffix: '-roxys.kml', mime: 'application/vnd.google-earth.kml+xml' },
};

/** Filename-safe slug of the client label ("Smith Family" → "smith-family"). */
export function clientSlug(client) {
  return String(client ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';
}

/** Points with coordinates whose country and category are both selected. */
export function selectClientPoints(master, { countries, categoryIds }) {
  return master.pois.filter((p) => hasCoords(p) && countries.has(p.country) && categoryIds.has(p.categoryId));
}

/**
 * Validate the selection and assemble the client file.
 * `countries` / `categoryIds` are Sets; `itinerary` is the raw CRM JSON (or null);
 * `guide` is {name, dataUri} or {name, url} (or null).
 * @returns {{ ok: boolean, error?: 'needClient'|'needDates'|'needSelection', file?: object }}
 */
export function buildClientFile(master, { client, validFrom, validUntil, countries, categoryIds, itinerary = null, guide = null }) {
  const name = String(client ?? '').trim();
  if (!name) return { ok: false, error: 'needClient' };
  if (!validFrom || !validUntil) return { ok: false, error: 'needDates' };
  if (countries.size === 0 || categoryIds.size === 0) return { ok: false, error: 'needSelection' };
  const points = selectClientPoints(master, { countries, categoryIds });
  const usedCats = new Set(points.map((p) => p.categoryId));
  const categories = master.categories.filter((c) => usedCats.has(c.id));
  // Bake the current agency texts (welcome/expiry/email/disclaimer) into the file.
  // `itinerary` carries the raw CRM route (or null) so the client renders both.
  return {
    ok: true,
    file: { client: name, validFrom, validUntil, categories, points, content: master.content || null, itinerary: itinerary || null, guide: guide || null },
  };
}
