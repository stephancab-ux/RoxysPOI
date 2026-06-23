// =============================================================================
// Bounding-box helpers. Used to (a) fit the map and (b) print the buffered
// bbox around a client's POIs for the agency's PMTiles offline-pack command.
// =============================================================================

/**
 * Buffered bbox around a set of POIs: [minLng, minLat, maxLng, maxLat].
 * Padding is in degrees (~0.3° ≈ 33 km) so the offline pack covers a little
 * beyond the exact points. Returns null if there are no usable coordinates.
 */
export function bufferedBbox(points, padDeg = 0.3) {
  const pts = points.filter((p) => p.lat != null && p.lng != null);
  if (pts.length === 0) return null;
  let minLng = 180,
    minLat = 90,
    maxLng = -180,
    maxLat = -90;
  for (const p of pts) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [
    Math.max(-180, minLng - padDeg),
    Math.max(-85, minLat - padDeg),
    Math.min(180, maxLng + padDeg),
    Math.min(85, maxLat + padDeg),
  ];
}

/** Format a bbox as "minLng,minLat,maxLng,maxLat" with fixed decimals. */
export function formatBbox(bbox, decimals = 4) {
  if (!bbox) return '';
  return bbox.map((n) => n.toFixed(decimals)).join(',');
}
