// =============================================================================
// "Connect an AI agent" (desktop Master data tab). The Windows app ships a
// helper, roxys-agent.exe, that an AI agent (e.g. the owner's local Atlas)
// starts itself to read the master list and make client files. This box shows
// the exact settings to paste into the agent, with the real path filled in.
// See agent/ and docs/atlas-agent.md.
// =============================================================================

import { el, toast } from '../ui/components.js';
import { t } from '../ui/i18n.js';
import { agentSnippets } from './agentSnippets.js';

const HELPER = 'roxys-agent.exe';

/** Where the bundled helper is installed, or null if this build has none. */
async function findHelper(fileExists) {
  try {
    const { resolveResource } = await import('@tauri-apps/api/path');
    const exe = await resolveResource(HELPER);
    return (await fileExists(exe)) ? exe : null;
  } catch {
    return null;
  }
}

function codeBox(label, code) {
  const ta = el('textarea', { rows: Math.min(code.split('\n').length, 12), readonly: '', spellcheck: 'false', style: { width: '100%', fontFamily: 'monospace', fontSize: '.78rem' } });
  ta.value = code;
  const copy = () => {
    ta.select();
    navigator.clipboard?.writeText(code).then(() => toast(t('admin.gen.copied'), 'ok')).catch(() => {});
  };
  return el('div', { class: 'field' }, [
    el('label', { text: label }),
    ta,
    el('div', { class: 'row' }, [el('button', { class: 'btn btn--sm', text: t('admin.gen.copy'), onclick: copy })]),
  ]);
}

/**
 * The section element. Renders immediately, then fills in once the helper's
 * path is known. `fileExists(path)` is desktopStore.fileExists.
 */
export function agentSection({ documentsFolder, fileExists }) {
  const body = el('div', { class: 'stack' });
  const section = el('div', { class: 'section' }, [
    el('h3', { text: t('admin.agent.title') }),
    el('p', { class: 'muted', text: t('admin.agent.hint') }),
    body,
  ]);
  findHelper(fileExists).then((exe) => {
    if (!exe) {
      body.append(el('p', { class: 'muted', text: t('admin.agent.notFound') }));
      return;
    }
    const s = agentSnippets(exe);
    body.append(
      ...[
        documentsFolder ? null : el('p', { class: 'muted', text: t('admin.agent.docsMissing') }),
        codeBox(t('admin.agent.mcp'), s.mcp),
        codeBox(t('admin.agent.python'), s.python),
        codeBox(t('admin.agent.test'), s.test),
        el('p', { class: 'muted', text: t('admin.agent.guide') }),
      ].filter(Boolean)
    );
  });
  return section;
}
