// =============================================================================
// Admin "Texts" tab: edit the welcome + trip-ended messages and the contact
// email in EN/FR/DE. Saved into the master dataset; "Export content.json" writes
// the file the agency publishes (the client reads /data/content.json at startup).
// =============================================================================

import { el, mount, toast } from '../ui/components.js';
import { t } from '../ui/i18n.js';
import { LANGUAGES } from '../config.js';
import { persistMaster } from '../data/master.js';
import { saveOutput } from './saveOutput.js';

export function renderTextsPanel(container, { master }) {
  if (!master.content) {
    master.content = { welcome: { en: '', fr: '', de: '' }, expiry: { en: '', fr: '', de: '' }, email: 'info@roxystravelplan.com' };
  }
  const c = master.content;

  // A block of three textareas (EN/FR/DE) bound to a {en,fr,de} object.
  const langBlock = (titleKey, obj) => {
    const section = el('div', { class: 'section' }, [el('h3', { text: t(titleKey) })]);
    LANGUAGES.forEach((l) => {
      const ta = el('textarea', { rows: 3 });
      ta.value = obj[l.code] || '';
      ta.addEventListener('input', () => {
        obj[l.code] = ta.value;
      });
      section.append(el('div', { class: 'field' }, [el('label', { text: l.label }), ta]));
    });
    return section;
  };

  const emailInput = el('input', { type: 'email', value: c.email || '' });
  emailInput.addEventListener('input', () => {
    c.email = emailInput.value;
  });

  const saveBtn = el('button', {
    class: 'btn btn--primary',
    text: t('common.save'),
    onclick: async () => {
      await persistMaster(master);
      toast(t('admin.texts.saved'), 'ok');
    },
  });
  const exportBtn = el('button', { class: 'btn', text: t('admin.texts.export'), onclick: () => saveOutput('Exports', 'content.json', JSON.stringify(master.content, null, 2), 'application/json') });

  const panel = el('div', { class: 'panel' }, [
    el('h1', { text: t('admin.texts.title') }),
    el('p', { class: 'panel__hint', text: t('admin.texts.hint') }),
    langBlock('admin.texts.welcome', c.welcome),
    langBlock('admin.texts.expiry', c.expiry),
    el('div', { class: 'section' }, [el('h3', { text: t('admin.texts.email') }), el('div', { class: 'field' }, [emailInput])]),
    el('div', { class: 'toolbar' }, [saveBtn, exportBtn]),
  ]);
  mount(container, panel);
}
