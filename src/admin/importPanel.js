// =============================================================================
// CSV import tab: pick a file, confirm the column mapping + target category,
// then import (auto-tagging country from coordinates where possible).
// =============================================================================

import { el, mount, toast, pickFile } from '../ui/components.js';
import { t } from '../ui/i18n.js';
import { genId } from '../data/schema.js';
import { persistMaster } from '../data/master.js';
import { parseCsv, autoMap, buildPois } from '../csv/importCsv.js';
import { loadCountryTagger } from '../geo/countryTag.js';

const FIELDS = [
  ['name', 'admin.poi.name'],
  ['note', 'admin.poi.note'],
  ['googleUrl', 'admin.poi.url'],
  ['lat', 'admin.poi.lat'],
  ['lng', 'admin.poi.lng'],
  ['country', 'admin.poi.country'],
];

export function renderImportPanel(container, { master, onChange }) {
  let parsed = null; // { headers, rows }
  let mapping = {};

  function render() {
    const panel = el('div', { class: 'panel' }, [
      el('h1', { text: t('admin.import.title') }),
      el('p', { class: 'panel__hint', text: t('admin.import.hint') }),
      el('div', { class: 'toolbar' }, [
        el('button', {
          class: 'btn btn--primary',
          text: t('admin.import.choose'),
          onclick: async () => {
            const file = await pickFile('.csv,text/csv');
            if (!file) return;
            try {
              parsed = await parseCsv(file);
              mapping = autoMap(parsed.headers);
              render();
            } catch {
              toast(t('welcome.badFile'), 'error');
            }
          },
        }),
        parsed && el('span', { class: 'muted', text: t('admin.import.preview', { rows: parsed.rows.length }) }),
      ].filter(Boolean)),
      parsed && buildMappingSection(),
    ].filter(Boolean));
    mount(container, panel);
  }

  function buildMappingSection() {
    const headerOptions = (selected) => [
      el('option', { value: '' }, [t('admin.import.ignore')]),
      ...parsed.headers.map((h) => el('option', { value: h, selected: h === selected ? '' : null }, [h])),
    ];

    const mapRows = FIELDS.map(([field, key]) =>
      el('div', { class: 'row' }, [
        el('label', { text: t(key), style: { margin: 0, minWidth: '120px' } }),
        el('select', { onchange: (e) => (mapping[field] = e.target.value || null) }, headerOptions(mapping[field])),
      ])
    );

    // category picker (existing or new)
    const newCatBox = el('div', { class: 'grid2 hidden' }, [
      el('input', { type: 'text', placeholder: t('admin.cat.name'), id: 'newcat-name' }),
      el('input', { type: 'text', placeholder: t('admin.cat.emoji'), id: 'newcat-emoji', value: '📍' }),
      el('input', { type: 'color', id: 'newcat-color', value: '#B8902F' }),
    ]);
    const catSelect = el(
      'select',
      {
        onchange: (e) => newCatBox.classList.toggle('hidden', e.target.value !== '__new__'),
      },
      [
        ...master.categories.map((c) => el('option', { value: c.id }, [`${c.emoji} ${c.name}`])),
        el('option', { value: '__new__' }, [t('admin.import.newCategory')]),
      ]
    );

    const warn = !mapping.lat || !mapping.lng ? el('p', { class: 'error-text', text: t('admin.import.needCoords') }) : null;
    const resultBox = el('div', { class: 'section' });

    const runBtn = el('button', {
      class: 'btn btn--primary',
      text: t('admin.import.run'),
      onclick: async () => {
        let categoryId = catSelect.value;
        if (categoryId === '__new__') {
          const name = newCatBox.querySelector('#newcat-name').value.trim();
          if (!name) return toast(t('admin.import.needCategory'), 'error');
          const cat = { id: genId('cat'), name, emoji: newCatBox.querySelector('#newcat-emoji').value.trim() || '📍', color: newCatBox.querySelector('#newcat-color').value };
          master.categories.push(cat);
          categoryId = cat.id;
        }
        runBtn.disabled = true;
        const tagger = await loadCountryTagger();
        const { pois, imported, tagged, missing } = buildPois(parsed.rows, mapping, categoryId, tagger);
        master.pois.push(...pois);
        await persistMaster(master);
        onChange?.();
        resultBox.replaceChildren(
          el('p', { class: 'stack' }, [el('strong', { text: t('admin.import.result', { imported, tagged, missing: missing.length }) })]),
          missing.length
            ? el('div', {}, [el('p', { class: 'muted', text: t('admin.import.missingList') }), el('ul', {}, missing.slice(0, 30).map((p) => el('li', { text: p.name })))])
            : null
        );
        runBtn.disabled = false;
        toast(t('admin.import.result', { imported, tagged, missing: missing.length }), 'ok');
      },
    });

    return el('div', { class: 'stack', style: { marginTop: '1rem' } }, [
      el('div', { class: 'section' }, [el('h3', { text: t('admin.import.mapping') }), ...mapRows]),
      el('div', { class: 'section' }, [el('h3', { text: t('admin.import.category') }), catSelect, newCatBox]),
      warn,
      runBtn,
      resultBox,
    ].filter(Boolean));
  }

  render();
}
