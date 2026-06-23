// =============================================================================
// Base-layer manager — the keystone of the online/offline map.
//
// ONE Leaflet map. The base layer is swapped underneath the (always-mounted)
// cluster layer:
//   • Online  → an OpenFreeMap vector basemap rendered by MapLibre GL inside
//     Leaflet, with all labels forced to ENGLISH worldwide (free, keyless).
//   • Offline → a PMTiles vector basemap styled like OSM ("light" flavor, also
//     English), read from a Blob in IndexedDB, where a downloaded pack covers
//     the current view; otherwise we fall back to cached raster + a banner.
// Swapping adds the next layer before removing the previous one (no blank flash).
// =============================================================================

import L from 'leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet'; // augments L with L.maplibreGL
import { leafletLayer } from 'protomaps-leaflet';
import { PMTiles } from 'pmtiles';
import { MAP } from '../config.js';
import { IDBBlobSource } from './idbPmtilesSource.js';
import { t } from '../ui/i18n.js';

// OpenFreeMap: free, no API key, no account. "liberty" ≈ standard OSM look.
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const ENGLISH_LABEL = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];

/** Force every label layer in a MapLibre style to render English names. */
function forceEnglishLabels(gl) {
  let style;
  try {
    style = gl.getStyle();
  } catch {
    return;
  }
  if (!style || !style.layers) return;
  for (const layer of style.layers) {
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
      try {
        gl.setLayoutProperty(layer.id, 'text-field', ENGLISH_LABEL);
      } catch {
        /* some layers can't be updated mid-style; ignore */
      }
    }
  }
}

/** True if the browser can give us a WebGL context (MapLibre GL needs one). */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

/** Online base: OpenFreeMap vector via MapLibre GL, labels forced to English.
 *  Falls back to OSM raster on devices without WebGL (labels then stay local). */
export function createOnlineLayer() {
  if (!hasWebGL()) return createOsmLayer();
  const layer = L.maplibreGL({
    style: OPENFREEMAP_STYLE,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &middot; <a href="https://openfreemap.org">OpenFreeMap</a>',
  });
  // The MapLibre map is created when the layer is added to the Leaflet map.
  layer.on('add', () => {
    const gl = layer.getMaplibreMap();
    if (!gl) return;
    const apply = () => forceEnglishLabels(gl);
    gl.on('style.load', apply);
    if (gl.isStyleLoaded && gl.isStyleLoaded()) apply();
  });
  return layer;
}

/** Plain OSM raster — used by the internal admin map (no language constraint). */
export function createOsmLayer() {
  return L.tileLayer(MAP.osmUrl, {
    maxZoom: MAP.maxZoom,
    attribution: MAP.osmAttribution,
    crossOrigin: true,
  });
}

/** Build an OSM-like vector layer from a PMTiles archive Blob (offline). */
export function createVectorLayer(blob, key) {
  const archive = new PMTiles(new IDBBlobSource(blob, key));
  return leafletLayer({
    url: archive,
    flavor: 'light',
    lang: 'en',
    attribution: `${MAP.osmAttribution} · <a href="https://protomaps.com">Protomaps</a>`,
    maxDataZoom: 14,
  });
}

function pointInBbox([lng, lat], bbox) {
  if (!bbox) return false;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

export class BaseLayers {
  constructor(map) {
    this.map = map;
    this.online = createOnlineLayer();
    this.current = null;
    /** @type {{country:string, bbox:number[], make:()=>L.Layer, layer:?L.Layer}[]} */
    this.packs = [];
    this.banner = null;

    this._onChange = () => this.update();
    window.addEventListener('online', this._onChange);
    window.addEventListener('offline', this._onChange);
    map.on('moveend', this._onChange);
  }

  start() {
    this._show(this.online);
    this.update();
  }

  registerPack(country, bbox, make) {
    this.unregisterPack(country);
    this.packs.push({ country, bbox, make, layer: null });
    this.update();
  }

  unregisterPack(country) {
    const i = this.packs.findIndex((p) => p.country === country);
    if (i >= 0) {
      const [p] = this.packs.splice(i, 1);
      if (p.layer && this.current === p.layer) this._show(this.online);
    }
  }

  _packForView() {
    const c = this.map.getCenter();
    return this.packs.find((p) => pointInBbox([c.lng, c.lat], p.bbox));
  }

  _packLayer(p) {
    if (!p.layer) p.layer = p.make();
    return p.layer;
  }

  update() {
    if (navigator.onLine) {
      this._show(this.online);
      this._setBanner(null);
      return;
    }
    const pack = this._packForView();
    if (pack) {
      this._show(this._packLayer(pack));
      this._setBanner(null);
    } else {
      this._show(this.online); // cached tiles may still render
      this._setBanner(t('map.offlineNoPack'));
    }
  }

  _show(layer) {
    if (this.current === layer) return;
    layer.addTo(this.map); // add next…
    if (this.current) this.map.removeLayer(this.current); // …then remove prev
    this.current = layer;
  }

  _setBanner(text) {
    if (!text) {
      this.banner?.remove();
      this.banner = null;
      return;
    }
    if (!this.banner) {
      this.banner = L.DomUtil.create('div', 'map-banner', this.map.getContainer());
    }
    this.banner.textContent = text;
  }

  destroy() {
    window.removeEventListener('online', this._onChange);
    window.removeEventListener('offline', this._onChange);
    this.map.off('moveend', this._onChange);
  }
}
