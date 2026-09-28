// =============================================================================
// Points → CSV (same columns as the import format, plus Category and placeId).
// DOM-free so the admin's Points tab and the agent helper share it.
// =============================================================================

import Papa from 'papaparse';

/** CSV text for the given points, with a UTF-8 BOM so Excel reads accents. */
export function buildPointsCsv(pois, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows = pois.map((p) => ({
    Title: p.name,
    Note: p.note || '',
    URL: p.googleUrl || '',
    Latitude: p.lat ?? '',
    Longitude: p.lng ?? '',
    Country: p.country || '',
    Category: byId.get(p.categoryId)?.name || '',
    placeId: p.placeId || '',
  }));
  return '﻿' + Papa.unparse(rows);
}
