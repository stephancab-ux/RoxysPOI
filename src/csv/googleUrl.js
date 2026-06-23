// =============================================================================
// Parse a Google Maps "place" link into { name, lat, lng, placeId }.
// Used by the admin Add-point auto-fill and by the CSV importer (to recover
// coordinates + a stable id from a URL column).
//
// Example link:
//   .../place/Cave+des+Bernunes+SA/@46.2847584,7.519287,14z/data=...!3d46.3018463!4d7.549879!...!1s0x478f...:0xc273...
//   • name      → "Cave des Bernunes SA"   (the /place/<name> segment)
//   • lat,lng   → 46.3018463, 7.549879      (the exact pin "!3d…!4d…", NOT the "@" viewport centre)
//   • placeId   → "0x478f1f054e45a54b:0xc273212fc1161511"  (stable feature id, for de-dup)
// =============================================================================

const num = (s) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

export function parseGoogleMapsUrl(url) {
  const out = { name: '', lat: null, lng: null, placeId: '' };
  if (!url || typeof url !== 'string') return out;

  // ---- name: /place/<name>/ ----
  const place = url.match(/\/place\/([^/@?]+)/);
  if (place) {
    try {
      out.name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim();
    } catch {
      out.name = place[1].replace(/\+/g, ' ').trim();
    }
  }

  // ---- coordinates: prefer the exact pin "!3d<lat>!4d<lng>" ----
  const pin = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) {
    out.lat = num(pin[1]);
    out.lng = num(pin[2]);
  } else {
    // fall back to the "@lat,lng,zoom" viewport centre
    const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) {
      out.lat = num(at[1]);
      out.lng = num(at[2]);
    }
  }

  // ---- placeId: "!1s0x…:0x…", else ftid/cid query params ----
  const ftid = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || url.match(/[?&]ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (ftid) {
    out.placeId = ftid[1];
  } else {
    const cid = url.match(/[?&]cid=(\d+)/);
    if (cid) out.placeId = `cid:${cid[1]}`;
  }

  return out;
}
