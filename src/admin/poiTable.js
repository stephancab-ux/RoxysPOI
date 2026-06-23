// =============================================================================
// Manage POIs: sortable/filterable table AND a map view, with add/edit/delete,
// bulk-delete (checkboxes), CSV export, and Google-link auto-fill on add.
// The table's data columns (Name/Category/Country/Coordinates/Notes) can be
// drag-reordered and edge-resized; the order/widths persist in localStorage.
// =============================================================================

import L from 'leaflet';
import Papa from 'papaparse';
import { el, mount, openModal, confirmDialog, toast } from '../ui/components.js';
import { saveOutput } from './saveOutput.js';
import { t } from '../ui/i18n.js';
import { genId, hasCoords, countriesOf } from '../data/schema.js';
import { persistMaster } from '../data/master.js';
import { createOnlineLayer } from '../map/baseLayers.js';
import { createClusterGroup } from '../map/clusters.js';
import { pinIcon } from '../map/markers.js';
import { loadCountryTagger } from '../geo/countryTag.js';
import { parseGoogleMapsUrl } from '../csv/googleUrl.js';

export function renderPoiTable(container, { master, onChange }) {
  const state = { q: '', cat: '', country: '', sortKey: 'name', sortDir: 1, view: 'table' };
  const catById = () => new Map(master.categories.map((c) => [c.id, c]));
  const selected = new Set(); // POI ids selected for bulk delete (persists across re-renders)
  let deleteBtn = null;

  // ---- Column model ----------------------------------------------------------
  // The checkbox (pinned first) and Actions (pinned last) columns are fixed.
  // These DATA columns are reorderable + resizable; cellFn(p, cats) builds a cell.
  const DATA_COLUMNS = [
    { key: 'name', defaultWidth: 200, cellFn: (p) => p.name },
    {
      key: 'category',
      defaultWidth: 160,
      cellFn: (p, cats) => {
        const c = cats.get(p.categoryId);
        return c ? el('span', { class: 'badge', style: { background: c.color } }, [`${c.emoji} ${c.name}`]) : '—';
      },
    },
    { key: 'country', defaultWidth: 140, cellFn: (p) => p.country || '—' },
    {
      key: 'coords',
      defaultWidth: 150,
      cellFn: (p) =>
        hasCoords(p) ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : el('span', { class: 'tag-missing', text: t('admin.pois.missing') }),
    },
    { key: 'note', defaultWidth: 280, cellFn: (p) => p.note || '—' },
  ];
  const COL_BY_KEY = new Map(DATA_COLUMNS.map((c) => [c.key, c]));
  const DEFAULT_ORDER = DATA_COLUMNS.map((c) => c.key);
  const colLabel = (key) => t(`admin.pois.col.${key}`);

  // Per-user column order/widths (UI preference → localStorage, not the dataset).
  const LS_ORDER = 'roxys.poiCols.order';
  const LS_WIDTH = 'roxys.poiCols.width';
  function loadColOrder() {
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem(LS_ORDER)) || []; } catch { /* ignore */ }
    const valid = stored.filter((k) => COL_BY_KEY.has(k)); // drop removed/renamed cols
    const missing = DEFAULT_ORDER.filter((k) => !valid.includes(k)); // append new cols
    return [...valid, ...missing];
  }
  function loadColWidths() {
    try { return JSON.parse(localStorage.getItem(LS_WIDTH)) || {}; } catch { return {}; }
  }
  function saveColOrder(order) { localStorage.setItem(LS_ORDER, JSON.stringify(order)); }
  function saveColWidth(key, px) {
    const m = loadColWidths();
    m[key] = Math.round(px);
    localStorage.setItem(LS_WIDTH, JSON.stringify(m));
  }
  function resetCols() {
    localStorage.removeItem(LS_ORDER);
    localStorage.removeItem(LS_WIDTH);
    render();
  }

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
    const cats = catById();
    const rows = sorted(filtered());
    const capped = rows.slice(0, 1000);
    const allIds = rows.map((p) => p.id);
    const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));

    const order = loadColOrder();
    const widths = loadColWidths();
    const cols = order.map((k) => COL_BY_KEY.get(k));
    let dragKey = null; // key being dragged
    let didDrag = false; // suppress the click-to-sort that may follow a drop

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

    // <colgroup> + table-layout:fixed make the column widths authoritative (so
    // cells truncate to width). Actions is width-less so it absorbs any slack,
    // keeping the data columns pixel-exact for clean resizing.
    const colEls = cols.map((c) => el('col', { 'data-col': c.key, style: { width: (widths[c.key] ?? c.defaultWidth) + 'px' } }));
    const colgroup = el('colgroup', {}, [el('col', { style: { width: '34px' } }), ...colEls, el('col')]);

    // One data-column header: click = sort, drag = reorder, edge handle = resize.
    const buildDataHeader = (c, colEl) => {
      const arrow = state.sortKey === c.key ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
      const th = el(
        'th',
        {
          title: colLabel(c.key),
          onclick: () => {
            if (didDrag) { didDrag = false; return; } // a drag, not a sort click
            if (state.sortKey === c.key) state.sortDir *= -1;
            else { state.sortKey = c.key; state.sortDir = 1; }
            render();
          },
          ondragstart: (e) => {
            dragKey = c.key;
            didDrag = true;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', c.key);
          },
          ondragover: (e) => {
            if (dragKey && dragKey !== c.key) { e.preventDefault(); th.classList.add('col-drop'); }
          },
          ondragleave: () => th.classList.remove('col-drop'),
          ondrop: (e) => {
            e.preventDefault();
            th.classList.remove('col-drop');
            if (!dragKey || dragKey === c.key) return;
            const next = order.filter((k) => k !== dragKey);
            next.splice(next.indexOf(c.key), 0, dragKey); // insert before the drop target
            saveColOrder(next);
            render();
          },
          ondragend: () => { dragKey = null; },
        },
        [colLabel(c.key) + arrow]
      );
      th.draggable = true; // set via property: the `draggable=""` attribute means "auto"

      // Resize handle on the right edge. stopPropagation keeps it off sort/drag;
      // disabling th.draggable on hover stops the edge from starting a column drag.
      const handle = el('span', { class: 'col-resize', 'aria-hidden': 'true' });
      handle.addEventListener('mouseenter', () => { th.draggable = false; });
      handle.addEventListener('mouseleave', () => { th.draggable = true; });
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = th.getBoundingClientRect().width; // <col> has no box; measure the th
        const apply = (ev) => Math.max(60, startW + (ev.clientX - startX));
        const onMove = (ev) => { colEl.style.width = apply(ev) + 'px'; };
        const onUp = (ev) => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          saveColWidth(c.key, apply(ev));
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      th.append(handle);
      return th;
    };

    const table = el('table', { class: 'data poi-table' }, [
      colgroup,
      el('thead', {}, [
        el('tr', {}, [
          el('th', { class: 'col-fixed', style: { cursor: 'default' } }, [headChk]),
          ...cols.map((c, i) => buildDataHeader(c, colEls[i])),
          el('th', { class: 'col-fixed', text: t('admin.pois.col.actions') }),
        ]),
      ]),
      el(
        'tbody',
        {},
        capped.map((p) => {
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
          const dataCells = cols.map((c) =>
            el('td', c.key === 'note' ? { class: 'cell-note', title: p.note || '' } : {}, [c.cellFn(p, cats)])
          );
          return el('tr', {}, [
            el('td', { class: 'col-fixed' }, [chk]),
            ...dataCells,
            el('td', { class: 'col-fixed' }, [
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
  let savedView = null; // {center, zoom} remembered across rebuilds (session-only)

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

  // Tear down the map, remembering its viewport so the next build can restore it.
  // This is why editing/deleting/selecting a point no longer resets the zoom.
  function teardownMap() {
    if (mapInstance) savedView = { center: mapInstance.getCenter(), zoom: mapInstance.getZoom() };
    if (mapResizeObserver) { mapResizeObserver.disconnect(); mapResizeObserver = null; }
    if (mapInstance) { mapInstance.stop(); mapInstance.remove(); mapInstance = null; } // stop() halts pending animations before teardown
  }

  function buildMap() {
    const div = el('div', { class: 'admin-map', id: 'admin-map' });
    setTimeout(() => {
      teardownMap();
      mapInstance = L.map(div, { minZoom: 1, maxZoom: 19 }); // explicit maxZoom so markercluster has a finite zoom
      if (savedView) mapInstance.setView(savedView.center, savedView.zoom);
      else mapInstance.setView([-8.4, 115.2], 5);
      createOnlineLayer().addTo(mapInstance); // English (OpenFreeMap) base, same as the client
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
      // Only auto-fit on the FIRST build; afterwards keep the user's viewport.
      if (!savedView && pts.length) mapInstance.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.15));
      // repaint when the user drag-resizes the container (avoids grey tiles).
      // Guard against a just-detached container (rebuild race) to avoid errors.
      mapResizeObserver = new ResizeObserver(() => {
        if (mapInstance && mapInstance.getContainer().isConnected) mapInstance.invalidateSize();
      });
      mapResizeObserver.observe(div);
    }, 0);
    return div;
  }

  // ---- Render shell ----------------------------------------------------------
  function render() {
    teardownMap();
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
    const resetColsBtn = el('button', { class: 'btn btn--sm btn--ghost', text: t('admin.pois.resetColumns'), onclick: resetCols });

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
        state.view === 'table' ? resetColsBtn : null,
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
