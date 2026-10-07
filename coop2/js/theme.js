import { CONFIG } from './config.js';
const KEY = CONFIG.storageKeys.theme;

export function getStoredTheme() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function getPreferredTheme() {
  const s = getStoredTheme();
  if (s === 'dark' || s === 'light') return s;
  return 'dark';
}
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(KEY, theme); } catch {}
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}
export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
export function initThemeToggle(selector = '[data-theme-toggle]') {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });
}
applyTheme(getPreferredTheme());