// =============================================================================
// Parse + validate a CRM itinerary export (the route file the agency creates in
// its CRM and emails to the client alongside the places file). The format nests
// JSON-as-text in two spots — each leg's `waypoints` and the top-level
// `annotations_json` — so those get a second parse.
//
// Shape we read:
//   { title, stops:[{id,sort_order,name,lat,lng,note,color}],
//     legs:[{from_stop_id,to_stop_id,transport_mode,waypoints("[…]"),note}],
//     annotations_json: "[{label,emoji,color,points:[{lat,lng}]}]" }
// =============================================================================

const num = (v) => (typeof v === 'string' ? parseFloat(v) : v);
const okPt = (p) => p && Number.isFinite(num(p.lat)) && Number.isFinite(num(p.lng));
const pt = (p) => ({ lat: num(p.lat), lng: num(p.lng) });

/** Parse a value that may already be an array or a JSON string of an array. */
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** A file is an itinerary if it carries a `stops` array. */
export function isItineraryShape(obj) {
  return Boolean(obj && typeof obj === 'object' && Array.isArray(obj.stops));
}

/**
 * @returns {{ ok:boolean, errors:string[], data:?{title,stops,legs,annotations} }}
 */
export function validateItinerary(obj) {
  if (!isItineraryShape(obj)) return { ok: false, errors: ['Not an itinerary file (no "stops").'], data: null };

  const stops = obj.stops
    .map((s) => ({
      id: s.id,
      order: Number.isFinite(s.sort_order) ? s.sort_order : 0,
      name: (s.name || '').toString(),
      note: (s.note || '').toString(),
      lat: num(s.lat),
      lng: num(s.lng),
      color: (s.color || '#c2410c').toString(),
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .sort((a, b) => a.order - b.order);

  const legs = asArray(obj.legs).map((l) => ({
    from: l.from_stop_id,
    to: l.to_stop_id,
    mode: (l.transport_mode || '').toString(),
    note: (l.note || '').toString(),
    waypoints: asArray(l.waypoints).filter(okPt).map(pt),
  }));

  const annotations = asArray(obj.annotations_json)
    .map((a) => ({
      label: (a.label || '').toString(),
      emoji: (a.emoji || '📍').toString(),
      color: (a.color || '#e11d48').toString(),
      points: asArray(a.points).filter(okPt).map(pt),
    }))
    .filter((a) => a.points.length);

  if (!stops.length && !annotations.length) {
    return { ok: false, errors: ['The itinerary has no usable stops.'], data: null };
  }
  return { ok: true, errors: [], data: { title: (obj.title || '').toString(), stops, legs, annotations } };
}

/** Every coordinate in the itinerary (for fitting the map). */
export function itineraryPoints(it) {
  const out = [];
  for (const s of it.stops || []) out.push({ lat: s.lat, lng: s.lng });
  for (const l of it.legs || []) for (const w of l.waypoints || []) out.push(w);
  for (const a of it.annotations || []) for (const p of a.points) out.push(p);
  return out;
}
