// =============================================================================
// Manage POIs: sortable/filterable table AND a map view, with add/edit/delete,
// bulk-delete (checkboxes), CSV export, and Google-link auto-fill on add.
// =============================================================================

import L from 'leaflet';
import Papa from 'papaparse';
import { el, mount, openModal, confirmDialog, toast } from '../ui/components.js';
import { saveOutput } from './saveOutput.js';
import { t } from '../ui/i18n.js';
import { genId, hasCoords, countriesOf } from '../data/schema.js';
import { persistMaster } from '../data/master.js';
import { createOsmLayer } from '../map/baseLayers.js';
import { createClusterGroup } from '../map/clusters.js';
import { pinIcon } from '../map/markers.js';
import { loadCountryTagger } from '../geo/countryTag.js';
import { parseGoogleMapsUrl } from '../csv/googleUrl.js';

export function renderPoiTable(container, { master, onChange }) {
  const state = { q: '', cat: '', country: '', sortKey: 'name', sortDir: 1, view: 'table' };
  const catById = () => new Map(master.categories.map((c) => [c.id, c]));
  const selected = new Set(); // POI ids selected for bulk delete (persists across re-renders)
  let deleteBtn = null;

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return master.pois.filter((p) => {
      if (state.cat && p.categoryId !== state.cat) return false;
      if (state.country && p.country !== state.country) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.note || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function sorted(list) {
    const map = catById();
    const key = state.sortKey;
    const val = (p) =>
      key === 'category' ? map.get(p.categoryId)?.name || '' : key === 'coords' ? (hasCoords(p) ? 0 : 1) : (p[key] ?? '');
    return [...list].sort((a, b) => {
      const va = val(a),
        vb = val(b);
      return (va > vb ? 1 : va < vb ? -1 : 0) * state.sortDir;
    });
  }

  // ---- Bulk delete -----------------------------------------------------------
  function updateBulkUI() {
    if (!deleteBtn) return;
    const n = selected.size;
    deleteBtn.textContent = t('admin.pois.deleteSelected', { n });
    deleteBtn.disabled = n === 0;
    deleteBtn.style.display = n === 0 ? 'none' : '';
  }
  async function deleteSelected() {
    const n = selected.size;
    if (!n) return;
    if (!(await confirmDialog(t('admin.pois.deleteSelectedConfirm', { n }), { danger: true }))) return;
    master.pois = master.pois.filter((p) => !selected.has(p.id));
    selected.clear();
    await persistMaster(master);
    toast(t('admin.pois.deleted', { n }), 'ok');
    render();
    onChange?.();
  }

  // ---- Export CSV ------------------------------------------------------------
  function exportCsv() {
    const map = catById();
    const rows = sorted(filtered()).map((p) => ({
      Title: p.name,
      Note: p.note || '',
      URL: p.googleUrl || '',
      Latitude: p.lat ?? '',
      Longitude: p.lng ?? '',
      Country: p.country || '',
      Category: map.get(p.categoryId)?.name || '',
      placeId: p.placeId || '',
    }));
    // Prepend a UTF-8 BOM so Excel opens accented / non-Latin names correctly.
    saveOutput('CSV exports', 'roxys-points.csv', '﻿' + Papa.unparse(rows), 'text/csv;charset=utf-8');
  }

  // ---- Edit / add form -------------------------------------------------------
  function openForm(existing) {
    const poi = existing || { name: '', note: '', googleUrl: '', lat: '', lng: '', categoryId: master.categories[0]?.id || '', country: '', placeId: '' };
    const f = {
      name: el('input', { type: 'text', value: poi.name }),
      note: el('textarea', { rows: 2 }, [poi.note || '']),
      category: el(
        'select',
        {},
        master.categories.map((c) => el('option', { value: c.id, selected: c.id === poi.categoryId ? '' : null }, [`${c.emoji} ${c.name}`]))
      ),
      country: el('input', { type: 'text', value: poi.country || '' }),
      lat: el('input', { type: 'number', step: 'any', value: poi.lat ?? '' }),
      lng: el('input', { type: 'number', step: 'any', value: poi.lng ?? '' }),
      url: el('input', { type: 'url', value: poi.googleUrl || '' }),
    };

    // Auto-fill name + coordinates + country from a pasted Google Maps link.
    const doAutofill = async () => {
      const parsed = parseGoogleMapsUrl(f.url.value.trim());
      if (!parsed.name && parsed.lat == null) return toast(t('admin.poi.autofillNone'), 'error');
      if (parsed.name) f.name.value = parsed.name;
      if (parsed.lat != null) f.lat.value = parsed.lat;
      if (parsed.lng != null) f.lng.value = parsed.lng;
      if (parsed.lat != null && parsed.lng != null) {
        const tagger = await loadCountryTagger();
        const c = tagger.tag(parsed.lat, parsed.lng);
        if (c) f.country.value = c;
      }
      toast(parsed.name || t('common.save'), 'ok');
    };
    const autoFillButton = el('button', { class: 'btn btn--sm', text: t('admin.poi.autofill'), onclick: doAutofill });
    f.url.addEventListener('paste', () => setTimeout(doAutofill, 0));

    const autotag = el('button', {
      class: 'btn btn--sm btn--ghost',
      text: t('admin.poi.autotag'),
      onclick: async () => {
        const lat = parseFloat(f.lat.value),
          lng = parseFloat(f.lng.value);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return toast(t('admin.poi.lat') + ' / ' + t('admin.poi.lng'), 'error');
        const tagger = await loadCountryTagger();
        const c = tagger.tag(lat, lng);
        if (c) {
          f.country.value = c;
          toast(c, 'ok');
        }
      },
    });

    const body = el('div', { class: 'stack' }, [
      el('div', { class: 'field' }, [el('label', { text: t('admin.poi.url') }), el('div', { class: 'row' }, [f.url, autoFillButton])]),
      el('p', { class: 'muted', text: t('admin.poi.urlHint') }),
      field('admin.poi.name', f.name),
      field('admin.poi.category', f.category),
      el('div', { class: 'grid2' }, [field('admin.poi.lat', f.lat), field('admin.poi.lng', f.lng)]),
      el('div', { class: 'field' }, [el('label', { text: t('admin.poi.country') }), el('div', { class: 'row' }, [f.country, autotag])]),
      field('admin.poi.note', f.note),
    ]);

    const save = el('button', {
      class: 'btn btn--primary',
      text: t('common.save'),
      onclick: async () => {
        const name = f.name.value.trim();
        if (!name) return toast(t('common.required'), 'error');
        const parsed = parseGoogleMapsUrl(f.url.value.trim());
        const data = {
          name,
          note: f.note.value.trim() || null,
          googleUrl: f.url.value.trim(),
          lat: f.lat.value === '' ? null : parseFloat(f.lat.value),
          lng: f.lng.value === '' ? null : parseFloat(f.lng.value),
          categoryId: f.category.value,
          country: f.country.value.trim(),
          placeId: parsed.placeId || poi.placeId || '',
        };
        if (existing) Object.assign(existing, data);
        else master.pois.push({ id: genId('poi'), ...data });
        await persistMaster(master);
        ctrl.close();
        render();
        onChange?.();
      },
    });

    const ctrl = openModal({
      title: existing ? t('admin.poi.edit') : t('admin.poi.new'),
      body,
      footer: [el('button', { class: 'btn btn--ghost', text: t('common.cancel'), onclick: () => ctrl.close() }), save],
    });
  }

  function field(key, input) {
    return el('div', { class: 'field' }, [el('label', { text: t(key) }), input]);
  }

  async function remove(poi) {
    if (!(await confirmDialog(t('admin.poi.deleteConfirm'), { danger: true }))) return;
    master.pois = master.pois.filter((p) => p !== poi);
    selected.delete(poi.id);
    await persistMaster(master);
    render();
    onChange?.();
  }

  // ---- Table view ------------------------------------------------------------
  function buildTable() {
    const map = catById();
    const rows = sorted(filtered());
    const capped = rows.slice(0, 1000);
    const allIds = rows.map((p) => p.id);
    const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));

    const headChk = el('input', {
      type: 'checkbox',
      checked: allChecked,
      'aria-label': t('common.selectAll'),
      onchange: (e) => {
        if (e.target.checked) allIds.forEach((id) => selected.add(id));
        else allIds.forEach((id) => selected.delete(id));
        render();
      },
    });

    const head = (key, label) =>
      el(
        'th',
        {
          onclick: () => {
            if (state.sortKey === key) state.sortDir *= -1;
            else {
              state.sortKey = key;
              state.sortDir = 1;
            }
            render();
          },
        },
        [label + (state.sortKey === key ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '')]
      );

    const table = el('table', { class: 'data' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { style: { cursor: 'default', width: '34px' } }, [headChk]),
          head('name', t('admin.pois.col.name')),
          head('category', t('admin.pois.col.category')),
          head('country', t('admin.pois.col.country')),
          head('coords', t('admin.pois.col.coords')),
          el('th', { text: t('admin.pois.col.actions') }),
        ]),
      ]),
      el(
        'tbody',
        {},
        capped.map((p) => {
          const c = map.get(p.categoryId);
          const chk = el('input', {
            type: 'checkbox',
            checked: selected.has(p.id),
            onchange: (e) => {
              if (e.target.checked) selected.add(p.id);
              else selected.delete(p.id);
              updateBulkUI();
              headChk.checked = allIds.every((id) => selected.has(id));
            },
          });
          return el('tr', {}, [
            el('td', {}, [chk]),
            el('td', { text: p.name }),
            el('td', {}, [c ? el('span', { class: 'badge', style: { background: c.color } }, [`${c.emoji} ${c.name}`]) : '—']),
            el('td', { text: p.country || '—' }),
            el('td', {}, [hasCoords(p) ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : el('span', { class: 'tag-missing', text: t('admin.pois.missing') })]),
            el('td', {}, [
              el('button', { class: 'btn btn--sm', text: t('common.edit'), onclick: () => openForm(p) }),
              ' ',
              el('button', { class: 'btn btn--sm btn--danger', text: t('common.delete'), onclick: () => remove(p) }),
            ]),
          ]);
        })
      ),
    ]);
    const wrap = el('div', { class: 'table-wrap' }, [table]);
    const note = rows.length > capped.length ? el('p', { class: 'muted', text: `${capped.length} / ${rows.length}` }) : null;
    return el('div', {}, [wrap, note].filter(Boolean));
  }

  // ---- Map view --------------------------------------------------------------
  let mapInstance = null;
  let mapResizeObserver = null;

  // Admin popup: name + category + Edit / Delete (delete removes from the DB).
  function adminPopup(p, c) {
    return el('div', { class: 'popup' }, [
      el('div', { class: 'popup__title', text: p.name }),
      c ? el('div', { class: 'popup__cat' }, [el('span', { text: c.emoji }), el('span', { text: c.name })]) : null,
      p.note ? el('div', { class: 'popup__note', text: p.note }) : null,
      el('div', { class: 'row', style: { gap: '.4rem', marginTop: '.5rem' } }, [
        el('button', { class: 'btn btn--sm', text: t('common.edit'), onclick: () => { mapInstance?.closePopup(); openForm(p); } }),
        el('button', { class: 'btn btn--sm btn--danger', text: t('common.delete'), onclick: async () => { mapInstance?.closePopup(); await remove(p); } }),
      ]),
    ].filter(Boolean));
  }

  function buildMap() {
    const div = el('div', { class: 'admin-map', id: 'admin-map' });
    setTimeout(() => {
      mapResizeObserver?.disconnect();
      mapInstance?.remove();
      mapInstance = L.map(div).setView([-8.4, 115.2], 5);
      createOsmLayer().addTo(mapInstance);
      const cats = catById();
      const cluster = createClusterGroup();
      const pts = filtered().filter(hasCoords);
      const markers = pts.map((p) => {
        const m = L.marker([p.lat, p.lng], { icon: pinIcon(cats.get(p.categoryId)), title: p.name });
        m.bindPopup(() => adminPopup(p, catById().get(p.categoryId)), { maxWidth: 260 });
        return m;
      });
      cluster.addLayers(markers);
      mapInstance.addLayer(cluster);
      if (pts.length) mapInstance.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.15));
      // repaint when the user drag-resizes the container (avoids grey tiles)
      mapResizeObserver = new ResizeObserver(() => mapInstance && mapInstance.invalidateSize());
      mapResizeObserver.observe(div);
    }, 0);
    return div;
  }

  // ---- Render shell ----------------------------------------------------------
  function render() {
    if (mapResizeObserver) {
      mapResizeObserver.disconnect();
      mapResizeObserver = null;
    }
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    const catSel = el('select', { onchange: (e) => ((state.cat = e.target.value), render()) }, [
      el('option', { value: '' }, [t('admin.pois.filterCat')]),
      ...master.categories.map((c) => el('option', { value: c.id, selected: c.id === state.cat ? '' : null }, [`${c.emoji} ${c.name}`])),
    ]);
    const countrySel = el('select', { onchange: (e) => ((state.country = e.target.value), render()) }, [
      el('option', { value: '' }, [t('admin.pois.filterCountry')]),
      ...countriesOf(master.pois).map((c) => el('option', { value: c, selected: c === state.country ? '' : null }, [c])),
    ]);
    const searchInput = el('input', {
      type: 'search',
      'data-i18n-placeholder': 'admin.pois.search',
      placeholder: t('admin.pois.search'),
      value: state.q,
      oninput: (e) => {
        state.q = e.target.value;
        body.replaceChildren(state.view === 'table' ? buildTable() : buildMap());
      },
    });
    const viewToggle = el('div', { class: 'segmented' }, [
      el('button', { text: t('admin.pois.viewTable'), 'aria-pressed': state.view === 'table' ? 'true' : 'false', onclick: () => ((state.view = 'table'), render()) }),
      el('button', { text: t('admin.pois.viewMap'), 'aria-pressed': state.view === 'map' ? 'true' : 'false', onclick: () => ((state.view = 'map'), render()) }),
    ]);

    deleteBtn = el('button', { class: 'btn btn--danger', onclick: deleteSelected });
    const exportBtn = el('button', { class: 'btn', text: t('admin.pois.export'), onclick: exportCsv });

    const body = el('div', {}, [
      master.pois.length === 0 ? el('p', { class: 'muted', text: t('admin.pois.empty') }) : state.view === 'table' ? buildTable() : buildMap(),
    ]);

    const panel = el('div', { class: 'panel' }, [
      el('h1', { text: t('admin.pois.title') }),
      el('p', { class: 'panel__hint', text: t('admin.pois.hint') }),
      el('div', { class: 'toolbar' }, [
        el('button', { class: 'btn btn--primary', text: t('admin.pois.add'), onclick: () => openForm(null) }),
        deleteBtn,
        searchInput,
        catSel,
        countrySel,
        el('div', { class: 'appbar__spacer' }),
        exportBtn,
        viewToggle,
      ]),
      body,
    ]);
    mount(container, panel);
    updateBulkUI();
  }

  render();
}
