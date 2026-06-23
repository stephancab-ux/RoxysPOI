// =============================================================================
// Generate a scoped client file: pick countries × categories + a date range,
// download a JSON containing only that subset (no password). Also prints the
// buffered bbox per country for the agency's PMTiles offline-pack command.
// =============================================================================

import { el, mount, toast, openModal } from '../ui/components.js';
import { t } from '../ui/i18n.js';
import { CLIENT_APP_URL, BASE_URL } from '../config.js';
import { hasCoords, countriesOf } from '../data/schema.js';
import { bufferedBbox, formatBbox } from '../geo/bbox.js';
import { packFileName } from '../offline/packs.js';
import { buildStandaloneHtml, buildIframeEmbed, buildKml, buildBrandedHtml } from './exporters.js';
import { saveOutput } from './saveOutput.js';

// Fetch the brand logo once and return it as a base64 data URI so the branded
// HTML export stays fully self-contained (works offline, no external request).
let _logoPromise;
function logoDataUri() {
  return (_logoPromise ||= (async () => {
    try {
      const res = await fetch(`${BASE_URL}assets/logo-black.png`);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => resolve('');
        r.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  })());
}

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

  /** Validate the selection and assemble the scoped client file (or null). */
  function buildFile() {
    if (!sel.client.trim()) return toast(t('admin.gen.needClient'), 'error'), null;
    if (!sel.from || !sel.until) return toast(t('admin.gen.needDates'), 'error'), null;
    if (sel.countries.size === 0 || sel.cats.size === 0) return toast(t('admin.gen.needSelection'), 'error'), null;
    const points = selectedPoints();
    const usedCats = new Set(points.map((p) => p.categoryId));
    const categories = master.categories.filter((c) => usedCats.has(c.id));
    // Bake the current agency texts (welcome/expiry/email/disclaimer) into the file.
    return { client: sel.client.trim(), validFrom: sel.from, validUntil: sel.until, categories, points, content: master.content || null };
  }
  const slug = () => sel.client.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';

  function downloadJson() {
    const f = buildFile();
    if (!f) return;
    saveOutput('Recommendation lists', `${slug()}-recommendation-list.json`, JSON.stringify(f, null, 2), 'application/json');
  }
  function downloadHtmlEmbed() {
    const f = buildFile();
    if (!f) return;
    showEmbed(t('admin.gen.htmlTitle'), buildStandaloneHtml(f), `${slug()}-map.html`, 'text/html', 'Website embeds');
  }
  function copyIframeEmbed() {
    const f = buildFile();
    if (!f) return;
    // Always point travelers at the hosted client viewer (the admin is local-only).
    showEmbed(t('admin.gen.iframeTitle'), buildIframeEmbed(f, CLIENT_APP_URL));
  }
  function downloadKmlFile() {
    const f = buildFile();
    if (!f) return;
    saveOutput('KML', `${slug()}-roxys.kml`, buildKml(f), 'application/vnd.google-earth.kml+xml');
  }
  async function downloadBrandedHtml() {
    const f = buildFile();
    if (!f) return;
    const html = buildBrandedHtml(f, { logoDataUri: await logoDataUri() });
    saveOutput('Recommendation pages', `${slug()}-recommendation.html`, html, 'text/html');
  }

  // Modal with copy-to-clipboard (and optional file download) for embed code.
  function showEmbed(title, code, downloadName, mime, subfolder) {
    const ta = el('textarea', { rows: 7, readonly: '', style: { width: '100%', fontFamily: 'monospace', fontSize: '.78rem' } });
    ta.value = code;
    const footer = [el('button', { class: 'btn btn--ghost', text: t('common.close'), onclick: () => ctrl.close() })];
    if (downloadName) footer.push(el('button', { class: 'btn', text: t('admin.gen.downloadHtml'), onclick: () => saveOutput(subfolder || 'Exports', downloadName, code, mime) }));
    footer.push(
      el('button', {
        class: 'btn btn--primary',
        text: t('admin.gen.copy'),
        onclick: () => {
          ta.select();
          navigator.clipboard?.writeText(code).then(() => toast(t('admin.gen.copied'), 'ok')).catch(() => {});
        },
      })
    );
    const ctrl = openModal({ title, body: el('div', { class: 'stack' }, [el('p', { class: 'muted', text: t('admin.gen.embedHint') }), ta]), footer });
    setTimeout(() => ta.select(), 50);
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
      el('div', { class: 'toolbar' }, [
        el('button', { class: 'btn btn--primary', text: t('admin.gen.generate'), onclick: downloadJson }),
        el('button', { class: 'btn', text: t('admin.gen.branded'), onclick: downloadBrandedHtml }),
        el('button', { class: 'btn', text: t('admin.gen.html'), onclick: downloadHtmlEmbed }),
        el('button', { class: 'btn', text: t('admin.gen.iframe'), onclick: copyIframeEmbed }),
        el('button', { class: 'btn', text: t('admin.gen.kml'), onclick: downloadKmlFile }),
      ]),
      el('div', { class: 'section' }, [el('h3', { text: t('admin.gen.bbox') }), bboxEl]),
    ]);
    mount(container, panel);
    updateSummary();
  }

  render();
}
