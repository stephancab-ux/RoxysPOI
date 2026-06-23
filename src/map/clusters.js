// =============================================================================
// Numbered marker clusters (Leaflet.markercluster), brand-gold, that split apart
// as the user zooms in — the core map UX from the reference screenshots.
// =============================================================================

import L from 'leaflet';
import 'leaflet.markercluster';
import { MAP } from '../config.js';

/** Brand-styled, numbered cluster bubble; size bucket scales with count. */
function clusterIcon(cluster) {
  const count = cluster.getChildCount();
  const bucket = count < 10 ? 'sm' : count < 100 ? 'md' : 'lg';
  return L.divIcon({
    html: `<div><span>${count}</span></div>`,
    className: `roxy-cluster roxy-cluster--${bucket}`,
    iconSize: null,
  });
}

/**
 * Create the cluster group. Tuned for thousands of points:
 * chunked loading, no add animation, bulk addLayers().
 */
export function createClusterGroup() {
  return L.markerClusterGroup({
    maxClusterRadius: MAP.clusterMaxRadius,
    chunkedLoading: true,
    chunkInterval: 200,
    animateAddingMarkers: false,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: clusterIcon,
  });
}
