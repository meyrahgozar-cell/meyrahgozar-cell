import { CONFIG } from './config.js';
const KEY = CONFIG.storageKeys.theme;
const BROWSER_CHROME = { dark: '#1b2236', light: '#edf1f9' };

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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_CHROME[theme] || BROWSER_CHROME.dark);
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