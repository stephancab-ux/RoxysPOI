// =============================================================================
// Base-layer manager — the keystone of the online/offline map.
//
// ONE Leaflet map. The base layer is swapped underneath the (always-mounted)
// cluster layer:
//   • Online  → standard OpenStreetMap raster tiles (full detail).
//   • Offline → a PMTiles vector basemap styled to look like OSM ("light"
//     flavor), read from a Blob in IndexedDB, but only where a downloaded pack
//     covers the current view; otherwise we fall back to (cached) OSM raster
//     and show a small "no offline map here" banner.
// Swapping adds the next layer before removing the previous one (no blank flash).
// =============================================================================

import L from 'leaflet';
import { leafletLayer } from 'protomaps-leaflet';
import { PMTiles } from 'pmtiles';
import { MAP } from '../config.js';
import { IDBBlobSource } from './idbPmtilesSource.js';
import { t } from '../ui/i18n.js';

export function createOsmLayer() {
  return L.tileLayer(MAP.osmUrl, {
    maxZoom: MAP.maxZoom,
    attribution: MAP.osmAttribution,
    crossOrigin: true, // lets the service worker cache tiles cleanly
  });
}

/** Build an OSM-like vector layer from a PMTiles archive Blob. */
export function createVectorLayer(blob, key) {
  const archive = new PMTiles(new IDBBlobSource(blob, key));
  return leafletLayer({
    url: archive,
    flavor: 'light', // resembles standard OpenStreetMap
    lang: 'en',
    attribution: `${MAP.osmAttribution} · <a href="https://protomaps.com">Protomaps</a>`,
    maxDataZoom: 14, // packs are generated to z14; Leaflet overzooms beyond
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
    this.osm = createOsmLayer();
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
    this._show(this.osm);
    this.update();
  }

  /** Register (or replace) a downloaded pack. `make` builds the vector layer lazily. */
  registerPack(country, bbox, make) {
    this.unregisterPack(country);
    this.packs.push({ country, bbox, make, layer: null });
    this.update();
  }

  unregisterPack(country) {
    const i = this.packs.findIndex((p) => p.country === country);
    if (i >= 0) {
      const [p] = this.packs.splice(i, 1);
      if (p.layer && this.current === p.layer) this._show(this.osm);
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
      this._show(this.osm);
      this._setBanner(null);
      return;
    }
    const pack = this._packForView();
    if (pack) {
      this._show(this._packLayer(pack));
      this._setBanner(null);
    } else {
      // Offline with no pack here: keep raster (cached tiles may render) + hint.
      this._show(this.osm);
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
