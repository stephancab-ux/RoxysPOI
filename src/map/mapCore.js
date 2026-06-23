// =============================================================================
// Map creation + the "you are here" GPS dot (no routing, per the brief).
// =============================================================================

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { MAP } from '../config.js';
import { t } from '../ui/i18n.js';
import { toast } from '../ui/components.js';

/** Create the Leaflet map with zoom controls top-left (as in the reference UI). */
export function createMap(container) {
  const map = L.map(container, {
    center: MAP.defaultCenter,
    zoom: MAP.defaultZoom,
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true,
  });
  map.zoomControl.setPosition('topleft');
  return map;
}

/**
 * Geolocation "blue dot". Returns { locate } — call locate() from a control.
 * Shows the usual browser permission prompt; no continuous tracking.
 */
export function createLocator(map) {
  let dot = null;
  let circle = null;

  function locate() {
    if (!('geolocation' in navigator)) {
      toast(t('map.locateUnavailable'), 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const latlng = [latitude, longitude];
        if (!dot) {
          dot = L.marker(latlng, {
            icon: L.divIcon({ className: '', html: '<div class="gps-dot"></div>', iconSize: [18, 18] }),
            interactive: false,
            keyboard: false,
            zIndexOffset: 1000,
          }).addTo(map);
          circle = L.circle(latlng, { radius: accuracy, color: '#2a7bf6', weight: 1, fillOpacity: 0.08 }).addTo(map);
        } else {
          dot.setLatLng(latlng);
          circle.setLatLng(latlng).setRadius(accuracy);
        }
        map.setView(latlng, Math.max(map.getZoom(), 14));
      },
      (err) => {
        toast(err.code === err.PERMISSION_DENIED ? t('map.locateDenied') : t('map.locateUnavailable'), 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  return { locate };
}

/** Fit the map to a set of POIs (with padding), or fall back to the default view. */
export function fitToPoints(map, points) {
  const pts = points.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lat, p.lng]);
  if (pts.length === 0) {
    map.setView(MAP.defaultCenter, MAP.defaultZoom);
  } else if (pts.length === 1) {
    map.setView(pts[0], 13);
  } else {
    map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }
}
