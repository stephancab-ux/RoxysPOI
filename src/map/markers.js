// =============================================================================
// POI markers: a colored teardrop pin showing the category emoji, plus a popup
// with name, category, optional note and an "Open in Google Maps" link.
// =============================================================================

import L from 'leaflet';
import { el } from '../ui/components.js';
import { t, getLang } from '../ui/i18n.js';
import { categoryName } from '../data/schema.js';

/** A divIcon styled as a colored pin with the category emoji centered. */
export function pinIcon(category) {
  const color = category?.color || '#B8902F';
  const emoji = category?.emoji || '📍';
  return L.divIcon({
    className: 'poi-pin',
    html: `<div class="poi-pin__body" style="background:${color}"><span class="poi-pin__emoji">${emoji}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 38], // the teardrop's point sits ~38px down (the rotated corner overflows the box)
    popupAnchor: [0, -40],
  });
}

/** Build the popup content node (rebuilt on open, so it follows the language). */
function popupContent(poi, category) {
  const children = [
    el('div', { class: 'popup__title', text: poi.name }),
    category &&
      el('div', { class: 'popup__cat' }, [
        el('span', { text: category.emoji }),
        el('span', { text: categoryName(category, getLang()) }),
      ]),
  ];
  if (poi.note) {
    children.push(el('div', { class: 'popup__note', text: poi.note }));
  }
  if (poi.googleUrl) {
    children.push(
      el(
        'a',
        {
          class: 'popup__link',
          href: poi.googleUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        ['📍 ', t('popup.openGoogle')]
      )
    );
  }
  return el('div', { class: 'popup' }, children.filter(Boolean));
}

/** Create a Leaflet marker for a POI. `getCategory(id)` resolves its category. */
export function poiToMarker(poi, getCategory) {
  const category = getCategory(poi.categoryId);
  const marker = L.marker([poi.lat, poi.lng], {
    icon: pinIcon(category),
    title: poi.name,
    keyboard: false,
  });
  marker.poi = poi;
  // Function form → popup is built fresh each open (picks up current language).
  marker.bindPopup(() => popupContent(poi, getCategory(poi.categoryId)), {
    closeButton: true,
    maxWidth: 280,
  });
  return marker;
}
