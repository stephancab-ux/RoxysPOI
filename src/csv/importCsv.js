// =============================================================================
// CSV import (exportgooglemaps.com format). Flexible column mapping, tolerant
// of minor naming differences, blank rows skipped.
//
// Real source format (Beach.csv): Title, Note, URL, Tags, Comment — and often
// NO Latitude/Longitude until the file is run through the resolver. So the
// importer handles BOTH shapes: with coordinates (full import + country
// auto-tag) and without (rows flagged as "missing coordinates" to fix later).
// =============================================================================

import Papa from 'papaparse';
import { CSV_DEFAULT_MAPPING, CSV_IGNORED_COLUMNS } from '../config.js';
import { normalizePOI, hasCoords } from '../data/schema.js';

/** Parse a CSV File → { headers, rows }. Blank rows are dropped. */
export function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy', // drops the blank first data row too
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const headers = res.meta.fields ? res.meta.fields.filter(Boolean) : [];
        // keep only rows that have at least one non-empty cell
        const rows = res.data.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));
        resolve({ headers, rows });
      },
      error: reject,
    });
  });
}

const norm = (s) => String(s || '').trim().toLowerCase();

/** Best-guess mapping from our fields to actual CSV headers. */
export function autoMap(headers) {
  const mapping = {};
  for (const [field, aliases] of Object.entries(CSV_DEFAULT_MAPPING)) {
    const found = headers.find((h) => aliases.includes(norm(h)));
    mapping[field] = found || null;
  }
  return mapping;
}

/** True if a header is one we ignore by default (Tags / Comment). */
export function isIgnored(header) {
  return CSV_IGNORED_COLUMNS.includes(norm(header));
}

/**
 * Build POIs from parsed rows + a field→column mapping.
 * @param {object[]} rows
 * @param {Record<string,?string>} mapping
 * @param {string} categoryId
 * @param {?{tag:(lat:number,lng:number)=>string}} tagger  country auto-tagger
 * @returns {{ pois: object[], imported: number, tagged: number, missing: object[], hasCoordsColumn: boolean }}
 */
export function buildPois(rows, mapping, categoryId, tagger) {
  const pois = [];
  const missing = [];
  let tagged = 0;
  const hasCoordsColumn = Boolean(mapping.lat && mapping.lng);

  for (const row of rows) {
    const get = (field) => (mapping[field] ? row[mapping[field]] ?? '' : '');
    const name = String(get('name')).trim();
    if (!name) continue; // skip blank rows

    const poi = normalizePOI({
      name,
      note: get('note'),
      googleUrl: get('googleUrl'),
      lat: get('lat'),
      lng: get('lng'),
      categoryId,
      country: String(get('country')).trim(),
    });
    if (!poi) continue;

    // Derive country from coordinates when no country column supplied a value.
    if (!poi.country && hasCoords(poi) && tagger) {
      poi.country = tagger.tag(poi.lat, poi.lng);
    }
    if (poi.country) tagged++;
    if (!hasCoords(poi)) missing.push(poi);
    pois.push(poi);
  }
  return { pois, imported: pois.length, tagged, missing, hasCoordsColumn };
}
