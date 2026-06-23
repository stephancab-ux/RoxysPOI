// =============================================================================
// Admin "auth". This is client-side only and the password hash ships in the
// bundle, so it merely keeps casual visitors out — it is NOT real security.
// (The master data is public anyway. Don't store secrets in the repo.)
// =============================================================================

import { ADMIN } from '../config.js';

const FLAG = 'roxys.admin.session';

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkLogin(user, pass) {
  if (user !== ADMIN.user) return false;
  return (await sha256Hex(pass)) === ADMIN.passSha256;
}

export function isAuthed() {
  return sessionStorage.getItem(FLAG) === '1';
}
export function setAuthed() {
  sessionStorage.setItem(FLAG, '1');
}
export function logout() {
  sessionStorage.removeItem(FLAG);
}
