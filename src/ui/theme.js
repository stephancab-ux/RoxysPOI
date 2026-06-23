// =============================================================================
// Theme: dark (default) / light. Persisted in localStorage. Swaps the Roxys
// logo per theme — white logo on the dark theme, black logo on the light theme.
// =============================================================================

import { BRAND, DEFAULT_THEME } from '../config.js';

const KEY = 'roxys.theme';

export function getTheme() {
  return localStorage.getItem(KEY) || DEFAULT_THEME;
}

/** The correct logo URL for the active theme. */
export function logoForTheme(theme = getTheme()) {
  return theme === 'light' ? BRAND.logoLight : BRAND.logoDark;
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Keep the PWA theme-color meta honest for light/dark.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#101010');
  // Swap every logo image marked with [data-logo].
  const src = logoForTheme(theme);
  document.querySelectorAll('img[data-logo]').forEach((img) => {
    img.src = src;
  });
}

export function setTheme(theme) {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light');
}

export function initTheme() {
  applyTheme(getTheme());
}
