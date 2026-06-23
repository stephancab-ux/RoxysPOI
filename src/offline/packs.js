// =============================================================================
// Offline map packs. A browser cannot generate PMTiles, so "Download for
// offline" FETCHES a prebuilt per-country .pmtiles (the agency generates these
// with `pmtiles extract` — see data/packs/README.md) and caches the Blob in
// IndexedDB. When offline, BaseLayers serves tiles from that Blob locally.
// =============================================================================

import { BASE_URL } from '../config.js';
import { savePack, loadPack, listPacks, deletePack } from '../data/db.js';
import { createVectorLayer } from '../map/baseLayers.js';
import { bufferedBbox } from '../geo/bbox.js';
import { el, toast, confirmDialog } from '../ui/components.js';
import { t } from '../ui/i18n.js';

/** A filesystem-safe pack name, e.g. "Indonesia" → "indonesia". */
export function packFileName(country) {
  return (
    country
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '.pmtiles'
  );
}

export function packUrl(country) {
  return `${BASE_URL}data/packs/${packFileName(country)}`;
}

export function formatBytes(n) {
  if (!n) return '0 MB';
  const mb = n / (1024 * 1024);
  return mb < 1 ? `${(n / 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
}

/** Download + cache a pack for one country. `onProgress(0..1|null)`. */
export async function downloadPack(country, points, onProgress) {
  const res = await fetch(packUrl(country));
  if (!res.ok) throw new Error('unavailable');
  const total = Number(res.headers.get('content-length')) || 0;
  let blob;
  if (res.body && total) {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.(received / total);
    }
    blob = new Blob(chunks, { type: 'application/octet-stream' });
  } else {
    onProgress?.(null);
    blob = await res.blob();
  }
  const bbox = bufferedBbox(points.filter((p) => p.country === country));
  const rec = { country, blob, size: blob.size, bbox };
  await savePack(rec);
  return rec;
}

/** Load all cached packs and register them with the map's BaseLayers. */
export async function hydratePacks(baseLayers) {
  const packs = await listPacks();
  for (const rec of packs) {
    baseLayers.registerPack(rec.country, rec.bbox, () => createVectorLayer(rec.blob, rec.country));
  }
  return packs;
}

export async function removePack(country, baseLayers) {
  await deletePack(country);
  baseLayers?.unregisterPack(country);
}

/**
 * Build the "Offline maps" settings section: each country in the client's file
 * with a Download / Delete control and size.
 */
export async function buildOfflineSection(dataset, baseLayers) {
  const section = el('div', { class: 'section' });
  section.append(el('h3', { text: t('settings.offline') }), el('p', { class: 'muted', text: t('settings.offline.hint') }));

  const countries = [...new Set(dataset.points.map((p) => p.country).filter(Boolean))].sort();
  if (countries.length === 0) {
    section.append(el('p', { class: 'muted', text: '—' }));
    return section;
  }

  for (const country of countries) {
    const row = el('div', { class: 'row' });
    const label = el('div', { class: 'grow' }, [el('strong', { text: country })]);
    const status = el('span', { class: 'muted' });
    const actions = el('div', {});
    row.append(label, actions);

    const render = async () => {
      const existing = await loadPack(country);
      actions.replaceChildren();
      if (existing) {
        status.textContent = `${t('settings.offline.downloaded')} · ${formatBytes(existing.size)}`;
        label.append(status);
        actions.append(
          el('button', {
            class: 'btn btn--sm btn--danger',
            text: t('settings.offline.delete'),
            onclick: async () => {
              if (await confirmDialog(t('settings.offline.delete') + ' — ' + country, { danger: true })) {
                await removePack(country, baseLayers);
                render();
              }
            },
          })
        );
      } else {
        status.textContent = '';
        const bar = el('span', { class: 'progress', style: { width: '90px', display: 'none' } }, [el('span')]);
        const btn = el('button', {
          class: 'btn btn--sm',
          text: t('settings.offline.download'),
          onclick: async () => {
            btn.disabled = true;
            btn.textContent = t('settings.offline.downloading');
            bar.style.display = 'block';
            try {
              const rec = await downloadPack(country, dataset.points, (p) => {
                bar.firstChild.style.width = p == null ? '100%' : `${Math.round(p * 100)}%`;
              });
              baseLayers?.registerPack(country, rec.bbox, () => createVectorLayer(rec.blob, country));
              toast(`${country} · ${formatBytes(rec.size)}`, 'ok');
              render();
            } catch (err) {
              toast(t('settings.offline.unavailable'), 'error');
              btn.disabled = false;
              btn.textContent = t('settings.offline.download');
              bar.style.display = 'none';
            }
          },
        });
        label.append(status);
        actions.append(bar, btn);
      }
    };
    await render();
    section.append(row);
  }
  return section;
}
