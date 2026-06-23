// =============================================================================
// Tiny DOM helpers + shared UI primitives (toast, modal, drawer, confirm).
// No framework — just functions that return / manage elements.
// =============================================================================

import { t } from './i18n.js';

/** Create an element. props.class, .html, .text, dataset, on:{event}, attrs. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(parent, ...nodes) {
  clear(parent);
  parent.append(...nodes.filter(Boolean));
  return parent;
}

// ---- Toast -------------------------------------------------------------------
function toastWrap() {
  let w = document.querySelector('.toast-wrap');
  if (!w) {
    w = el('div', { class: 'toast-wrap' });
    document.body.append(w);
  }
  return w;
}
/** @param {'info'|'ok'|'error'} type */
export function toast(message, type = 'info', ms = 3200) {
  const node = el('div', { class: `toast toast--${type}`, role: 'status', text: message });
  toastWrap().append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 300);
  }, ms);
}

// ---- Modal -------------------------------------------------------------------
/**
 * Open a modal. `body` is a node; `footer` an array of nodes (buttons).
 * Returns { close }.
 */
export function openModal({ title, body, footer = [], onClose }) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const head = el('div', { class: 'modal__head' }, [
    el('h2', { text: title || '' }),
    el('button', { class: 'btn btn--icon btn--ghost', 'aria-label': t('common.close'), text: '✕', onclick: close }),
  ]);
  const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
    head,
    el('div', { class: 'modal__body' }, [body]),
    footer.length ? el('div', { class: 'modal__foot' }, footer) : null,
  ]);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  return { close, modal };
}

/** Promise-based yes/no confirm. */
export function confirmDialog(message, { okLabel, danger } = {}) {
  return new Promise((resolve) => {
    // Guard so the first settle wins: closing the modal fires onClose (→ false),
    // which must NOT override a click on OK (→ true).
    let settled = false;
    const settle = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const ok = el('button', {
      class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
      text: okLabel || t('common.confirm'),
      onclick: () => {
        settle(true);
        ctrl.close();
      },
    });
    const cancel = el('button', {
      class: 'btn btn--ghost',
      text: t('common.cancel'),
      onclick: () => {
        settle(false);
        ctrl.close();
      },
    });
    const ctrl = openModal({
      title: t('common.confirm'),
      body: el('p', { text: message }),
      footer: [cancel, ok],
      onClose: () => settle(false),
    });
  });
}

// ---- Drawer (slide-in panel from the right) ----------------------------------
export function openDrawer({ title, body, onClose }) {
  const backdrop = el('div', { class: 'drawer-backdrop' });
  const close = () => {
    backdrop.remove();
    drawer.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const drawer = el('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' }, [
    el('div', { class: 'drawer__head' }, [
      el('h2', { text: title || '' }),
      el('button', { class: 'btn btn--icon btn--ghost', 'aria-label': t('common.close'), text: '✕', onclick: close }),
    ]),
    el('div', { class: 'drawer__body' }, [body]),
  ]);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop, drawer);
  return { close, drawer };
}

/** Trigger a client-side download of a Blob/string. */
export function downloadFile(filename, content, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open a file picker and resolve the chosen File (or null). */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 60000);
  });
}
