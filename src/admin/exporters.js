// =============================================================================
// Export a scoped client file in three extra shapes:
//   • buildStandaloneHtml — a self-contained map page to paste into a Wix HTML
//     embed (Leaflet + markercluster from CDN, data inline). Works at any size.
//   • buildIframeEmbed     — an <iframe> pointing at the hosted app's embed mode
//     (#data=<base64url>), so the full app (filters/search/English labels) shows.
//   • buildKml             — KML for Google My Maps (a folder per category).
// =============================================================================

const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/** Base64url-encode a JSON-able object for safe inclusion in a URL fragment. */
export function encodeData(obj) {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---- Standalone HTML (self-contained map) -----------------------------------
export function buildStandaloneHtml(file) {
  const cats = {};
  for (const c of file.categories || []) cats[c.id] = { name: c.name, emoji: c.emoji, color: c.color };
  const data = { cats, points: (file.points || []).filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number') };
  // Escape "<" so a note containing "</script>" can't break out of the inline data.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const title = xml(file.client || 'Roxys Travel Plan');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Roxys Travel Plan</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<style>
  html,body,#map{height:100%;margin:0}
  #map{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .rx-pin{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);font-size:15px}
  .rx-cl{width:40px;height:40px;border-radius:50%;background:#B8902F;border:3px solid #d8b24a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.4)}
  .rx-pop b{font-size:1.02rem}.rx-pop a{color:#B8902F;font-weight:600}
</style></head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
var D=${json};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]});}
var map=L.map('map');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
var cluster=L.markerClusterGroup({maxClusterRadius:60,showCoverageOnHover:false,iconCreateFunction:function(c){return L.divIcon({html:'<div class=rx-cl>'+c.getChildCount()+'</div>',className:'',iconSize:[40,40]});}});
D.points.forEach(function(p){
  var c=D.cats[p.categoryId]||{};
  var icon=L.divIcon({className:'',html:'<div class="rx-pin" style="background:'+(c.color||'#B8902F')+'">'+(c.emoji||'📍')+'</div>',iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-12]});
  var m=L.marker([p.lat,p.lng],{icon:icon});
  var h='<div class=rx-pop><b>'+esc(p.name)+'</b>'+(c.name?'<br><small>'+(c.emoji||'')+' '+esc(c.name)+'</small>':'')+(p.note?'<br>'+esc(p.note):'')+(p.googleUrl?'<br><a href="'+encodeURI(p.googleUrl)+'" target="_blank" rel="noopener">Open in Google Maps</a>':'')+'</div>';
  m.bindPopup(h);cluster.addLayer(m);
});
map.addLayer(cluster);
if(D.points.length){map.fitBounds(L.latLngBounds(D.points.map(function(p){return[p.lat,p.lng];})).pad(0.15));}else{map.setView([20,0],2);}
</script>
</body></html>`;
}

// ---- Branded standalone HTML (cream-themed deliverable page) ----------------
// Header (logo + serif brand + trip title + stats) over the places map, with a
// category-icon legend and a minimal footer — modeled on the agency's CRM page.
export function buildBrandedHtml(file, { logoDataUri = '' } = {}) {
  const cats = {};
  for (const c of file.categories || []) cats[c.id] = { name: c.name, emoji: c.emoji, color: c.color };
  const points = (file.points || []).filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  const json = JSON.stringify({ cats, points }).replace(/</g, '\\u003c');
  const title = xml(file.client || 'Roxys Travel Plan');
  const nCountries = new Set(points.map((p) => p.country).filter(Boolean)).size;
  const nCats = (file.categories || []).length;
  const legend = (file.categories || [])
    .map((c) => `<div class="legend-item"><span class="legend-icon" style="border-color:${xml(c.color || '#B8902F')}">${xml(c.emoji || '📍')}</span><span>${xml(c.name)}</span></div>`)
    .join('');
  const brand = logoDataUri
    ? `<img class="brand-logo" src="${logoDataUri}" alt="Roxys Travel Plan">`
    : `<div class="brand-logo-text">Roxys&nbsp;Travel&nbsp;Plan</div>`;
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Roxys Travel Plan</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<style>
  :root{--gold:#B8902F;--ink:#1f2937;--muted:#6b7280;--cream:#faf7f0;--cream-2:#f3ede1;--line:#e7ded0}
  *{box-sizing:border-box}
  body{margin:0;background:var(--cream);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
  .page-wrap{max-width:1100px;margin:0 auto;padding:0 20px}
  .page-header{background:linear-gradient(180deg,#fff,var(--cream));border-bottom:1px solid var(--line);padding:22px 0}
  .header-row{display:flex;gap:26px;align-items:center;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:14px}
  .brand-logo{width:60px;height:60px;object-fit:contain}
  .brand-logo-text{font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:17px;color:var(--gold);background:#fff;border:1px solid var(--line);padding:10px 14px;border-radius:8px}
  .brand-name{font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:18px;color:var(--gold)}
  .brand-motto{color:var(--muted);font-size:12px;margin-top:2px}
  .trip-meta{flex:1;min-width:220px}
  .trip-kicker{text-transform:uppercase;letter-spacing:2px;font-weight:700;font-size:11px;color:var(--gold);margin-bottom:6px}
  .trip-title{font-family:'Georgia','Times New Roman',serif;font-weight:700;font-size:30px;margin:0 0 6px;line-height:1.15}
  .trip-stats{color:var(--muted);font-size:13px}.trip-stats strong{color:var(--gold)}
  .map-canvas{height:64vh;min-height:420px;border-bottom:1px solid var(--line)}
  .section{padding:20px 0}
  .legend-grid{display:flex;flex-wrap:wrap;gap:10px 22px}
  .legend-item{display:flex;align-items:center;gap:8px;font-size:14px}
  .legend-icon{width:30px;height:30px;border-radius:50%;background:#fff;border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-size:15px}
  .page-footer{background:var(--cream-2);border-top:1px solid var(--line);padding:18px 0;color:var(--muted);font-size:13px}
  .footer-name{font-family:'Georgia','Times New Roman',serif;color:var(--gold);font-weight:700}
  .rx-pin{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);font-size:15px}
  .rx-cl{width:40px;height:40px;border-radius:50%;background:var(--gold);border:3px solid #d8b24a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.4)}
  .rx-pop b{font-size:1.02rem}.rx-pop a{color:var(--gold);font-weight:600}
</style></head><body>
<header class="page-header"><div class="page-wrap header-row">
  <div class="brand">${brand}<div><div class="brand-name">Roxys Travel Plan</div><div class="brand-motto">Your expert for unique adventure</div></div></div>
  <div class="trip-meta">
    <div class="trip-kicker">Recommendation List</div>
    <h1 class="trip-title">${title}</h1>
    <div class="trip-stats"><strong>${points.length}</strong> places &middot; <strong>${nCountries}</strong> countries &middot; <strong>${nCats}</strong> categories</div>
  </div>
</div></header>
<div id="map" class="map-canvas"></div>
<div class="page-wrap section"><div class="legend-grid">${legend}</div></div>
<footer class="page-footer"><div class="page-wrap"><span class="footer-name">Roxys Travel Plan</span> &middot; © ${year} &middot; <a href="https://www.roxystravelplan.com" style="color:inherit">www.roxystravelplan.com</a></div></footer>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
var D=${json};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]});}
var map=L.map('map',{scrollWheelZoom:true});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
var cluster=L.markerClusterGroup({maxClusterRadius:60,showCoverageOnHover:false,iconCreateFunction:function(c){return L.divIcon({html:'<div class=rx-cl>'+c.getChildCount()+'</div>',className:'',iconSize:[40,40]});}});
D.points.forEach(function(p){
  var c=D.cats[p.categoryId]||{};
  var icon=L.divIcon({className:'',html:'<div class="rx-pin" style="background:'+(c.color||'#B8902F')+'">'+(c.emoji||'📍')+'</div>',iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-12]});
  var m=L.marker([p.lat,p.lng],{icon:icon});
  var h='<div class=rx-pop><b>'+esc(p.name)+'</b>'+(c.name?'<br><small>'+(c.emoji||'')+' '+esc(c.name)+'</small>':'')+(p.note?'<br>'+esc(p.note):'')+(p.googleUrl?'<br><a href="'+encodeURI(p.googleUrl)+'" target="_blank" rel="noopener">Open in Google Maps</a>':'')+'</div>';
  m.bindPopup(h);cluster.addLayer(m);
});
map.addLayer(cluster);
if(D.points.length){map.fitBounds(L.latLngBounds(D.points.map(function(p){return[p.lat,p.lng];})).pad(0.15));}else{map.setView([20,0],2);}
setTimeout(function(){map.invalidateSize();},200);
</script>
</body></html>`;
}

// ---- Iframe embed (hosted full app) -----------------------------------------
export function buildIframeEmbed(file, appUrl) {
  const src = `${appUrl}#data=${encodeData(file)}`;
  return `<iframe src="${src}" width="100%" height="600" style="border:0;border-radius:8px" loading="lazy" title="Roxys Travel Map" allow="geolocation"></iframe>`;
}

// ---- KML (Google My Maps) ---------------------------------------------------
function kmlColor(hex) {
  // KML is aabbggrr; our colours are #rrggbb.
  const h = (hex || '#B8902F').replace('#', '');
  const r = h.slice(0, 2) || 'b8';
  const g = h.slice(2, 4) || '90';
  const b = h.slice(4, 6) || '2f';
  return `ff${b}${g}${r}`.toLowerCase();
}

export function buildKml(file) {
  const cats = file.categories || [];
  const pts = (file.points || []).filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  const styles = cats
    .map(
      (c) =>
        `<Style id="cat-${xml(c.id)}"><IconStyle><color>${kmlColor(c.color)}</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/blank.png</href></Icon></IconStyle></Style>`
    )
    .join('');
  const folders = cats
    .map((c) => {
      const placemarks = pts
        .filter((p) => p.categoryId === c.id)
        .map((p) => placemark(p, c.id))
        .join('');
      return placemarks ? `<Folder><name>${xml(c.emoji)} ${xml(c.name)}</name>${placemarks}</Folder>` : '';
    })
    .join('');
  const orphans = pts.filter((p) => !cats.some((c) => c.id === p.categoryId)).map((p) => placemark(p, null)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(file.client || 'Roxys Travel Plan')}</name>${styles}${folders}${orphans}</Document></kml>`;
}

function placemark(p, catId) {
  const desc = `${p.note ? xml(p.note) : ''}${p.googleUrl ? `${p.note ? '<br/>' : ''}<a href="${xml(p.googleUrl)}">Open in Google Maps</a>` : ''}`;
  return `<Placemark><name>${xml(p.name)}</name>${desc ? `<description><![CDATA[${desc}]]></description>` : ''}${
    catId ? `<styleUrl>#cat-${xml(catId)}</styleUrl>` : ''
  }<Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`;
}
