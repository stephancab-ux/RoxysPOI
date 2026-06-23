// =============================================================================
// Category CRUD. Emoji + colour apply globally to every POI in the category.
// =============================================================================

import { el, mount, openModal, confirmDialog, toast } from '../ui/components.js';
import { t } from '../ui/i18n.js';
import { genId } from '../data/schema.js';
import { persistMaster } from '../data/master.js';

export function renderCategoryEditor(container, { master, onChange }) {
  const countOf = (id) => master.pois.filter((p) => p.categoryId === id).length;

  function openForm(existing) {
    const cat = existing || { name: '', emoji: '📍', color: '#B8902F' };
    const name = el('input', { type: 'text', value: cat.name });
    const emoji = el('input', { type: 'text', value: cat.emoji, maxlength: 4, style: { width: '5rem', textAlign: 'center', fontSize: '1.4rem' } });
    const color = el('input', { type: 'color', value: cat.color, style: { width: '4rem', height: '40px', padding: '2px' } });

    const body = el('div', { class: 'stack' }, [
      el('div', { class: 'field' }, [el('label', { text: t('admin.cat.name') }), name]),
      el('div', { class: 'row' }, [
        el('div', { class: 'field' }, [el('label', { text: t('admin.cat.emoji') }), emoji]),
        el('div', { class: 'field' }, [el('label', { text: t('admin.cat.color') }), color]),
      ]),
    ]);

    const save = el('button', {
      class: 'btn btn--primary',
      text: t('common.save'),
      onclick: async () => {
        const data = { name: name.value.trim() || 'Untitled', emoji: emoji.value.trim() || '📍', color: color.value };
        if (existing) Object.assign(existing, data);
        else master.categories.push({ id: genId('cat'), ...data });
        await persistMaster(master);
        ctrl.close();
        render();
        onChange?.();
      },
    });
    const ctrl = openModal({
      title: existing ? t('admin.cat.edit') : t('admin.cat.new'),
      body,
      footer: [el('button', { class: 'btn btn--ghost', text: t('common.cancel'), onclick: () => ctrl.close() }), save],
    });
  }

  async function remove(cat) {
    const ok = await confirmDialog(t('admin.cat.deleteConfirm', { name: cat.name }), { danger: true });
    if (!ok) return;
    master.categories = master.categories.filter((c) => c.id !== cat.id);
    await persistMaster(master);
    render();
    onChange?.();
    toast(t('admin.data.saved'), 'ok');
  }

  function card(cat) {
    return el('div', { class: 'cat-card' }, [
      el('span', { class: 'swatch', style: { background: cat.color }, text: cat.emoji }),
      el('div', { class: 'grow' }, [
        el('strong', { text: cat.name }),
        el('span', { text: t('admin.cat.count', { n: countOf(cat.id) }) }),
      ]),
      el('button', { class: 'btn btn--sm', text: t('common.edit'), onclick: () => openForm(cat) }),
      el('button', { class: 'btn btn--sm btn--danger', text: t('common.delete'), onclick: () => remove(cat) }),
    ]);
  }

  function render() {
    const panel = el('div', { class: 'panel' }, [
      el('h1', { text: t('admin.cats.title') }),
      el('p', { class: 'panel__hint', text: t('admin.cats.hint') }),
      el('div', { class: 'toolbar' }, [
        el('button', { class: 'btn btn--primary', text: t('admin.cats.add'), onclick: () => openForm(null) }),
      ]),
      el('div', { class: 'grid2' }, master.categories.map(card)),
    ]);
    mount(container, panel);
  }

  render();
}
