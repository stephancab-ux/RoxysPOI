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
import { parseGoogleMapsUrl } from './googleUrl.js';

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

const GMAPS_RE = /google\.[^/]+\/maps|maps\.app\.goo\.gl|\/place\//i;

// A Google Maps URL contains commas (the "@lat,lng,zoomZ" viewport). In a CSV
// that doesn't quote its fields, PapaParse splits that one URL across several
// columns, leaving the URL truncated (e.g. ".../@46.28") and the rest in the
// row's `__parsed_extra`. These helpers stitch it back together so coordinates
// (and the dedup placeId) survive an unquoted export.
const TRUNCATED_GMAPS_RE = /[@,][-\d.]+$/; // ends mid-viewport: "…@46.28" or "…,7.51"
function isUrlContinuation(s) {
  s = String(s);
  return /^[-\d.]+$/.test(s) || /\d(?:\.\d+)?z(?:[/?]|$)|\/data=|!\dm|!\dd|\/@/.test(s);
}
/** Rejoin a Google Maps URL that an unquoted-comma CSV split across columns. */
function repairGoogleUrl(url, extra) {
  if (!url || !Array.isArray(extra) || !GMAPS_RE.test(url) || !TRUNCATED_GMAPS_RE.test(url)) return url;
  const parts = [url];
  for (const e of extra) {
    if (isUrlContinuation(e)) parts.push(String(e));
    else break;
  }
  return parts.join(',');
}

/**
 * Best-guess mapping from our fields to actual CSV headers.
 * Falls back to **content sniffing** for the Google Maps URL column when no
 * header matched — so a column named e.g. "Link" or "Lieu" is still found.
 */
export function autoMap(headers, rows = []) {
  const mapping = {};
  for (const [field, aliases] of Object.entries(CSV_DEFAULT_MAPPING)) {
    const found = headers.find((h) => aliases.includes(norm(h)));
    mapping[field] = found || null;
  }
  if (!mapping.googleUrl && headers.length && rows.length) {
    const sample = rows.slice(0, 25);
    const nonEmpty = sample.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== '')).length || 1;
    let best = null;
    let bestScore = 0;
    for (const h of headers) {
      let score = 0;
      for (const r of sample) if (GMAPS_RE.test(String(r[h] ?? ''))) score++;
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    if (best && bestScore >= Math.max(1, Math.ceil(nonEmpty * 0.5))) mapping.googleUrl = best;
  }
  return mapping;
}

/** True if a header is one we ignore by default (Tags / Comment). */
export function isIgnored(header) {
  return CSV_IGNORED_COLUMNS.includes(norm(header));
}

/**
 * Build POIs from parsed rows + a field→column mapping.
 * - The name and coordinates can come from a Google Maps URL when the dedicated
 *   columns are absent; the URL also yields a stable `placeId` (for de-dup).
 * - A per-row Category ("list") column maps each row to its own category via
 *   `resolveCategory(name) → id` (which may create the category); otherwise the
 *   file-level `defaultCategoryId` is used.
 * @param {object[]} rows
 * @param {Record<string,?string>} mapping
 * @param {string} defaultCategoryId
 * @param {?{tag:(lat:number,lng:number)=>string}} tagger  country auto-tagger
 * @param {?(name:string)=>?string} resolveCategory
 * @returns {{ pois: object[], imported: number, tagged: number, missing: object[], hasCoordsColumn: boolean }}
 */
export function buildPois(rows, mapping, defaultCategoryId, tagger, resolveCategory) {
  const pois = [];
  const missing = [];
  let tagged = 0;
  const hasCoordsColumn = Boolean(mapping.lat && mapping.lng);

  for (const row of rows) {
    const get = (field) => (mapping[field] ? row[mapping[field]] ?? '' : '');
    const url = repairGoogleUrl(String(get('googleUrl')).trim(), row.__parsed_extra);
    const parsed = url ? parseGoogleMapsUrl(url) : { name: '', lat: null, lng: null, placeId: '' };

    const name = String(get('name')).trim() || parsed.name;
    if (!name) continue; // skip blank rows

    // Coordinates: prefer explicit columns, fall back to the URL's exact pin.
    let lat = get('lat');
    let lng = get('lng');
    if ((lat === '' || lat == null || lng === '' || lng == null) && parsed.lat != null && parsed.lng != null) {
      lat = parsed.lat;
      lng = parsed.lng;
    }

    // Per-row category, else the file default.
    let categoryId = defaultCategoryId;
    const catCell = String(get('category')).trim();
    if (catCell && resolveCategory) {
      const cid = resolveCategory(catCell);
      if (cid) categoryId = cid;
    }

    const poi = normalizePOI({
      name,
      note: get('note'),
      googleUrl: url,
      lat,
      lng,
      categoryId,
      country: String(get('country')).trim(),
      placeId: parsed.placeId,
    });
    if (!poi) continue;

    if (!poi.country && hasCoords(poi) && tagger) {
      poi.country = tagger.tag(poi.lat, poi.lng);
    }
    if (poi.country) tagged++;
    if (!hasCoords(poi)) missing.push(poi);
    pois.push(poi);
  }
  return { pois, imported: pois.length, tagged, missing, hasCoordsColumn };
}
