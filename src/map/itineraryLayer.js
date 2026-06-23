// =============================================================================
// Draw a parsed itinerary on the Leaflet map: route legs (styled per transport
// mode), numbered stop markers, and emoji annotation pins. Returns a LayerGroup
// (with a `.bounds` LatLngBounds) the client can add/remove/toggle.
// =============================================================================

import L from 'leaflet';

// Transport mode → icon + line dash. Flights/boats are dashed (no road to
// follow); ground modes are solid. Unknown modes get a neutral default.
const MODES = {
  car: { emoji: '🚗' },
  taxi: { emoji: '🚕' },
  bus: { emoji: '🚌' },
  shuttle: { emoji: '🚐' },
  van: { emoji: '🚐' },
  train: { emoji: '🚆' },
  bike: { emoji: '🚲' },
  cycling: { emoji: '🚲' },
  walk: { emoji: '🚶', dash: '1 9' },
  walking: { emoji: '🚶', dash: '1 9' },
  hike: { emoji: '🥾', dash: '1 9' },
  trekking: { emoji: '🥾', dash: '1 9' },
  'horse riding': { emoji: '🐴', dash: '8 8' },
  horse: { emoji: '🐴', dash: '8 8' },
  flight: { emoji: '✈️', dash: '2 10' },
  plane: { emoji: '✈️', dash: '2 10' },
  boat: { emoji: '⛴️', dash: '2 10' },
  ferry: { emoji: '⛴️', dash: '2 10' },
};
function modeInfo(mode) {
  const k = (mode || '').toLowerCase().trim();
  if (MODES[k]) return MODES[k];
  if (/fly|flight|air|plane/.test(k)) return MODES.flight;
  if (/boat|ferry|ship|sea/.test(k)) return MODES.boat;
  if (/walk|foot|hik/.test(k)) return MODES.walk;
  return { emoji: '➡️' };
}

const ROUTE_COLOR = '#15803d'; // green route, echoing the CRM map

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stopIcon(n, color) {
  return L.divIcon({ className: '', html: `<div class="rx-stop" style="background:${color}"><span>${n}</span></div>`, iconSize: [30, 38], iconAnchor: [15, 38], popupAnchor: [0, -34] });
}
function annoIcon(emoji, color) {
  return L.divIcon({ className: '', html: `<div class="rx-anno" style="border-color:${color}">${emoji}</div>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
}
function modeBadge(emoji) {
  return L.divIcon({ className: '', html: `<div class="rx-mode">${emoji}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
}

export function createItineraryLayer(it) {
  const group = L.layerGroup();
  const byId = new Map((it.stops || []).map((s) => [s.id, s]));
  const all = [];

  // ---- Legs (drawn first, so markers sit on top) ----
  for (const leg of it.legs || []) {
    const from = byId.get(leg.from);
    const to = byId.get(leg.to);
    const info = modeInfo(leg.mode);

    let pts;
    if (leg.waypoints && leg.waypoints.length) {
      pts = [from && [from.lat, from.lng], ...leg.waypoints.map((w) => [w.lat, w.lng]), to && [to.lat, to.lng]].filter(Boolean);
    } else {
      // No road geometry (e.g. a flight) → straight line between the two stops.
      pts = [from && [from.lat, from.lng], to && [to.lat, to.lng]].filter(Boolean);
    }
    if (pts.length < 2) continue;

    const line = L.polyline(pts, { color: ROUTE_COLOR, weight: 4, opacity: 0.9, dashArray: info.dash, lineJoin: 'round', lineCap: 'round' });
    const label = `${info.emoji} ${escapeHtml(leg.mode || '')}${leg.note ? ` — ${escapeHtml(leg.note)}` : ''}`.trim();
    if (label) line.bindPopup(label);
    group.addLayer(line);
    pts.forEach((p) => all.push(p));

    // Transport icon at the leg's midpoint.
    const mid = pts[Math.floor(pts.length / 2)];
    group.addLayer(L.marker(mid, { icon: modeBadge(info.emoji), interactive: false, keyboard: false }));
  }

  // ---- Numbered stops ----
  (it.stops || []).forEach((s, i) => {
    const n = Number.isFinite(s.order) ? s.order + 1 : i + 1;
    const m = L.marker([s.lat, s.lng], { icon: stopIcon(n, s.color || '#c2410c'), zIndexOffset: 500 });
    m.bindPopup(`<div class="popup__title">${escapeHtml(s.name || `Stop ${n}`)}</div>${s.note ? `<div class="popup__note">${escapeHtml(s.note)}</div>` : ''}`);
    group.addLayer(m);
    all.push([s.lat, s.lng]);
  });

  // ---- Annotation pins ----
  for (const a of it.annotations || []) {
    for (const p of a.points) {
      const m = L.marker([p.lat, p.lng], { icon: annoIcon(a.emoji, a.color) });
      if (a.label) m.bindPopup(`<div class="popup__title">${escapeHtml(a.label)}</div>`);
      group.addLayer(m);
      all.push([p.lat, p.lng]);
    }
  }

  group.bounds = all.length ? L.latLngBounds(all) : null;
  return group;
}
