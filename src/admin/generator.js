// =============================================================================
// Generate a scoped client file: pick countries × categories + a date range,
// download a JSON containing only that subset (no password). Also prints the
// buffered bbox per country for the agency's PMTiles offline-pack command.
// =============================================================================

import { el, mount, downloadFile, toast } from '../ui/components.js';
import { t } from '../ui/i18n.js';
import { hasCoords, countriesOf } from '../data/schema.js';
import { bufferedBbox, formatBbox } from '../geo/bbox.js';
import { packFileName } from '../offline/packs.js';

export function renderGenerator(container, { master }) {
  const allCountries = countriesOf(master.pois);
  const sel = { client: '', countries: new Set(allCountries), cats: new Set(master.categories.map((c) => c.id)), from: '', until: '' };

  function selectedPoints() {
    return master.pois.filter((p) => hasCoords(p) && sel.countries.has(p.country) && sel.cats.has(p.categoryId));
  }

  function checklist(items, selectedSet, labelFn, onToggle) {
    const wrap = el('div', {});
    const toggleAll = (on) => {
      selectedSet.clear();
      if (on) items.forEach((it) => selectedSet.add(it.value));
      render();
      onToggle?.();
    };
    wrap.append(
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn--sm btn--ghost', text: t('common.selectAll'), onclick: () => toggleAll(true) }),
        el('button', { class: 'btn btn--sm btn--ghost', text: t('common.selectNone'), onclick: () => toggleAll(false) }),
      ])
    );
    items.forEach((it) => {
      wrap.append(
        el('label', { class: 'check' }, [
          el('input', {
            type: 'checkbox',
            checked: selectedSet.has(it.value),
            onchange: (e) => {
              e.target.checked ? selectedSet.add(it.value) : selectedSet.delete(it.value);
              updateSummary();
              onToggle?.();
            },
          }),
          el('span', { text: labelFn(it) }),
        ])
      );
    });
    return wrap;
  }

  let summaryEl, bboxEl;
  function updateSummary() {
    const pts = selectedPoints();
    const countries = new Set(pts.map((p) => p.country));
    const cats = new Set(pts.map((p) => p.categoryId));
    summaryEl.textContent = t('admin.gen.summary', { points: pts.length, countries: countries.size, categories: cats.size });
    // bbox per selected country (for PMTiles generation)
    bboxEl.replaceChildren();
    for (const country of [...countries].sort()) {
      const bbox = bufferedBbox(pts.filter((p) => p.country === country));
      bboxEl.append(el('div', { class: 'muted', text: `${country} → ${packFileName(country)} · --bbox=${formatBbox(bbox)}` }));
    }
  }

  function generate() {
    if (!sel.client.trim()) return toast(t('admin.gen.needClient'), 'error');
    if (!sel.from || !sel.until) return toast(t('admin.gen.needDates'), 'error');
    if (sel.countries.size === 0 || sel.cats.size === 0) return toast(t('admin.gen.needSelection'), 'error');
    const points = selectedPoints();
    const usedCats = new Set(points.map((p) => p.categoryId));
    const categories = master.categories.filter((c) => usedCats.has(c.id));
    const file = { client: sel.client.trim(), validFrom: sel.from, validUntil: sel.until, categories, points };
    const slug = sel.client.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';
    downloadFile(`${slug}-roxys-travel.json`, JSON.stringify(file, null, 2));
    toast(t('admin.gen.done'), 'ok');
  }

  function render() {
    summaryEl = el('strong', {});
    bboxEl = el('div', { class: 'stack' });
    const clientInput = el('input', { type: 'text', value: sel.client, oninput: (e) => (sel.client = e.target.value) });
    const from = el('input', { type: 'date', value: sel.from, onchange: (e) => (sel.from = e.target.value) });
    const until = el('input', { type: 'date', value: sel.until, onchange: (e) => (sel.until = e.target.value) });

    const panel = el('div', { class: 'panel' }, [
      el('h1', { text: t('admin.gen.title') }),
      el('p', { class: 'panel__hint', text: t('admin.gen.hint') }),
      el('div', { class: 'field' }, [el('label', { text: t('admin.gen.client') }), clientInput]),
      el('div', { class: 'grid2' }, [
        el('div', { class: 'section' }, [el('h3', { text: t('admin.gen.countries') }), checklist(allCountries.map((c) => ({ value: c })), sel.countries, (it) => it.value, updateSummary)]),
        el('div', { class: 'section' }, [el('h3', { text: t('admin.gen.categories') }), checklist(master.categories.map((c) => ({ value: c.id, c })), sel.cats, (it) => `${it.c.emoji} ${it.c.name}`, updateSummary)]),
      ]),
      el('div', { class: 'grid2' }, [
        el('div', { class: 'field' }, [el('label', { text: t('admin.gen.from') }), from]),
        el('div', { class: 'field' }, [el('label', { text: t('admin.gen.until') }), until]),
      ]),
      el('div', { class: 'section' }, [el('p', {}, [summaryEl])]),
      el('button', { class: 'btn btn--primary', text: t('admin.gen.generate'), onclick: generate }),
      el('div', { class: 'section' }, [el('h3', { text: t('admin.gen.bbox') }), bboxEl]),
    ]);
    mount(container, panel);
    updateSummary();
  }

  render();
}
