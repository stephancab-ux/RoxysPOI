// =============================================================================
// Manage POIs: sortable/filterable table AND a map view, with add/edit/delete.
// =============================================================================

import L from 'leaflet';
import { el, mount, openModal, confirmDialog, toast } from '../ui/components.js';
import { t } from '../ui/i18n.js';
import { genId, hasCoords, countriesOf } from '../data/schema.js';
import { persistMaster } from '../data/master.js';
import { createOsmLayer } from '../map/baseLayers.js';
import { createClusterGroup } from '../map/clusters.js';
import { poiToMarker } from '../map/markers.js';
import { loadCountryTagger } from '../geo/countryTag.js';

export function renderPoiTable(container, { master, onChange }) {
  const state = { q: '', cat: '', country: '', sortKey: 'name', sortDir: 1, view: 'table' };
  const catById = () => new Map(master.categories.map((c) => [c.id, c]));

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

  // ---- Edit / add form -------------------------------------------------------
  function openForm(existing) {
    const map = catById();
    const poi = existing || { name: '', note: '', googleUrl: '', lat: '', lng: '', categoryId: master.categories[0]?.id || '', country: '' };
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
      field('admin.poi.name', f.name),
      field('admin.poi.category', f.category),
      el('div', { class: 'grid2' }, [field('admin.poi.lat', f.lat), field('admin.poi.lng', f.lng)]),
      el('div', { class: 'field' }, [el('label', { text: t('admin.poi.country') }), el('div', { class: 'row' }, [f.country, autotag])]),
      field('admin.poi.note', f.note),
      field('admin.poi.url', f.url),
    ]);

    const save = el('button', {
      class: 'btn btn--primary',
      text: t('common.save'),
      onclick: async () => {
        const name = f.name.value.trim();
        if (!name) return toast(t('common.required'), 'error');
        const data = {
          name,
          note: f.note.value.trim() || null,
          googleUrl: f.url.value.trim(),
          lat: f.lat.value === '' ? null : parseFloat(f.lat.value),
          lng: f.lng.value === '' ? null : parseFloat(f.lng.value),
          categoryId: f.category.value,
          country: f.country.value.trim(),
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
    await persistMaster(master);
    render();
    onChange?.();
  }

  // ---- Table view ------------------------------------------------------------
  function buildTable() {
    const map = catById();
    const rows = sorted(filtered());
    const capped = rows.slice(0, 1000);
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
          return el('tr', {}, [
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
  function buildMap() {
    const div = el('div', { class: 'admin-map', id: 'admin-map' });
    // create after it is in the DOM
    setTimeout(() => {
      mapInstance?.remove();
      mapInstance = L.map(div).setView([-8.4, 115.2], 5);
      createOsmLayer().addTo(mapInstance);
      const cluster = createClusterGroup();
      const pts = filtered().filter(hasCoords);
      cluster.addLayers(pts.map((p) => poiToMarker(p, (id) => catById().get(id))));
      mapInstance.addLayer(cluster);
      if (pts.length) mapInstance.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.15));
    }, 0);
    return div;
  }

  // ---- Render shell ----------------------------------------------------------
  function render() {
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

    const body = el('div', {}, [
      master.pois.length === 0 ? el('p', { class: 'muted', text: t('admin.pois.empty') }) : state.view === 'table' ? buildTable() : buildMap(),
    ]);

    const panel = el('div', { class: 'panel' }, [
      el('h1', { text: t('admin.pois.title') }),
      el('p', { class: 'panel__hint', text: t('admin.pois.hint') }),
      el('div', { class: 'toolbar' }, [
        el('button', { class: 'btn btn--primary', text: t('admin.pois.add'), onclick: () => openForm(null) }),
        searchInput,
        catSel,
        countrySel,
        el('div', { class: 'appbar__spacer' }),
        viewToggle,
      ]),
      body,
    ]);
    mount(container, panel);
  }

  render();
}
