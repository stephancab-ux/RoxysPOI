// =============================================================================
// Offline, keyless country auto-tagging from lat/lng, against a bundled
// world-borders GeoJSON (Natural Earth 50m admin-0, stripped — see
// data/ne_countries.json).
//
// Two passes keep it both accurate and fast for an island/coast-heavy dataset:
//   1. Exact point-in-polygon (handles all inland points).
//   2. Nearest-country fallback within a tolerance — beaches and small islands
//      often sit right on (or just seaward of) the simplified coastline, so a
//      strict containment test misses them. We snap them to the closest country.
// A bbox pre-filter skips all but a few candidate countries per point.
// =============================================================================

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { BASE_URL } from '../config.js';

// Fallback search radius in degrees (~44 km at the equator). Big enough to
// catch coastal/island points, small enough to avoid cross-border mis-tags.
const FALLBACK_TOL = 0.4;

let _taggerPromise = null;

function nameOf(props = {}) {
  return props.name || props.ADMIN || props.NAME || props.SOVEREIGNT || '';
}

/** Flatten any Polygon/MultiPolygon coordinates into [lng,lat,lng,lat,…]. */
function flatten(geometry) {
  const out = [];
  const walk = (c) => {
    if (typeof c[0] === 'number') out.push(c[0], c[1]);
    else for (const x of c) walk(x);
  };
  walk(geometry.coordinates);
  return out;
}

function bboxOf(verts) {
  let minX = 180,
    minY = 90,
    maxX = -180,
    maxY = -90;
  for (let i = 0; i < verts.length; i += 2) {
    if (verts[i] < minX) minX = verts[i];
    if (verts[i] > maxX) maxX = verts[i];
    if (verts[i + 1] < minY) minY = verts[i + 1];
    if (verts[i + 1] > maxY) maxY = verts[i + 1];
  }
  return [minX, minY, maxX, maxY];
}

export function loadCountryTagger() {
  if (_taggerPromise) return _taggerPromise;
  _taggerPromise = (async () => {
    let index = [];
    try {
      const res = await fetch(`${BASE_URL}data/ne_countries.json`);
      if (res.ok) {
        const geo = await res.json();
        index = (geo.features || []).map((f) => {
          const verts = flatten(f.geometry);
          return { name: nameOf(f.properties), bbox: bboxOf(verts), verts, feature: f };
        });
      }
    } catch {
      /* dataset missing → tagger returns '' (admin can set country manually) */
    }

    const tag = (lat, lng) => {
      if (lat == null || lng == null) return '';
      const pt = { type: 'Point', coordinates: [lng, lat] };
      // 1) exact containment
      for (const c of index) {
        const [a, b, cc, d] = c.bbox;
        if (lng < a || lng > cc || lat < b || lat > d) continue;
        try {
          if (booleanPointInPolygon(pt, c.feature)) return c.name;
        } catch {
          /* skip malformed polygon */
        }
      }
      // 2) nearest-country fallback (coastal / island points)
      const cosLat = Math.cos((lat * Math.PI) / 180);
      let best = '';
      let bestD = FALLBACK_TOL * FALLBACK_TOL;
      for (const c of index) {
        const [a, b, cc, d] = c.bbox;
        if (lng < a - FALLBACK_TOL || lng > cc + FALLBACK_TOL || lat < b - FALLBACK_TOL || lat > d + FALLBACK_TOL) continue;
        const v = c.verts;
        for (let i = 0; i < v.length; i += 2) {
          const dx = (lng - v[i]) * cosLat;
          const dy = lat - v[i + 1];
          const dd = dx * dx + dy * dy;
          if (dd < bestD) {
            bestD = dd;
            best = c.name;
          }
        }
      }
      return best;
    };

    return { tag, ready: index.length > 0 };
  })();
  return _taggerPromise;
}
