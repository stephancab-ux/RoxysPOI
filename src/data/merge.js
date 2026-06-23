// =============================================================================
// Import de-duplication (upsert). Merges incoming POIs into the existing master
// list instead of blindly appending: an incoming place is matched to an existing
// one by Google place id (preferred), falling back to rounded coordinates. On a
// match the existing record is refreshed (name, note, coords, category, country,
// link); otherwise the place is added. Returns { added, updated }.
// =============================================================================

import { genId } from './schema.js';

const coordKey = (lat, lng) =>
  lat == null || lng == null ? null : `${lat.toFixed(4)},${lng.toFixed(4)}`; // ~11 m

/** Mutates `existing` in place. */
export function upsertPois(existing, incoming) {
  const byPlace = new Map();
  const byCoord = new Map();
  for (const p of existing) {
    if (p.placeId) byPlace.set(p.placeId, p);
    const k = coordKey(p.lat, p.lng);
    if (k && !byCoord.has(k)) byCoord.set(k, p);
  }

  let added = 0;
  let updated = 0;
  for (const inc of incoming) {
    let match = inc.placeId && byPlace.get(inc.placeId);
    if (!match) {
      const k = coordKey(inc.lat, inc.lng);
      if (k) match = byCoord.get(k);
    }

    if (match) {
      if (inc.name) match.name = inc.name;
      if (inc.note !== undefined) match.note = inc.note;
      if (inc.lat != null && inc.lng != null) {
        match.lat = inc.lat;
        match.lng = inc.lng;
      }
      if (inc.categoryId) match.categoryId = inc.categoryId;
      if (inc.country) match.country = inc.country;
      if (inc.googleUrl) match.googleUrl = inc.googleUrl;
      if (inc.placeId && !match.placeId) {
        match.placeId = inc.placeId;
        byPlace.set(inc.placeId, match);
      }
      updated++;
    } else {
      const rec = { ...inc, id: inc.id || genId('poi') };
      existing.push(rec);
      if (rec.placeId) byPlace.set(rec.placeId, rec);
      const k = coordKey(rec.lat, rec.lng);
      if (k && !byCoord.has(k)) byCoord.set(k, rec);
      added++;
    }
  }
  return { added, updated };
}

/** Merge category lists by id (then by case-insensitive name); returns merged array. */
export function mergeCategories(existing, incoming) {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
  const out = [...existing];
  for (const c of incoming) {
    if (byId.has(c.id) || byName.has((c.name || '').toLowerCase())) continue;
    out.push(c);
    byId.set(c.id, c);
    byName.set((c.name || '').toLowerCase(), c);
  }
  return out;
}
