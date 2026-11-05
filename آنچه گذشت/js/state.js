/* Application state, preferences, and the tiny event bus. */
import { createBus, storage } from './lib/store.js';

export const bus = createBus();

const prefsStore = storage('reel.prefs.v1', {
  theme: 'system',
  accent: 'amber',
  density: 'comfy',
  scale: 'md',
  reduceMotion: false,
  listView: 'list',
  weekStart: 6,
  goalPerWeek: 3,
  showCovers: true,
  confirmDelete: true,
  promptTone: 'reflective',
  aiPreferredModel: '',
  onboarded: false,
});

export const prefs = prefsStore.read();

export const state = {
  session: null,
  user: null,
  profile: null,
  mode: 'local',        // 'cloud' | 'local'
  schemaReady: false,
  online: navigator.onLine,
  threads: [],
  entryCount: 0,
  lastSync: null,
  booted: false,
  hideChrome: false,
};

const ACCENTS = new Set(['aurora', 'amber', 'rose', 'violet', 'ocean', 'clay']);

export function resolvedTheme() {
  if (prefs.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return prefs.theme === 'light' ? 'light' : 'dark';
}

export function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.dataset.accent = ACCENTS.has(prefs.accent) ? prefs.accent : 'amber';
  root.dataset.density = prefs.density;
  root.dataset.scale = prefs.scale;
  root.dataset.reduceMotion = String(!!prefs.reduceMotion);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolvedTheme() === 'light' ? '#f6f4ef' : '#12100e');
  bus.emit('theme', resolvedTheme());
}

export function savePrefs(patch = {}) {
  Object.assign(prefs, patch);
  prefsStore.write(prefs);
  applyPrefs();
  bus.emit('prefs', prefs);
  return prefs;
}

export function toggleTheme() {
  const now = resolvedTheme();
  savePrefs({ theme: now === 'dark' ? 'light' : 'dark' });
  return resolvedTheme();
}

export function isCloud() { return state.mode === 'cloud'; }

export { resolvedTheme as appliedTheme };

/* draft autosave, per entry / per new frame */
const DRAFT_KEY = 'reel.draft.v1';
export const drafts = {
  read(id = 'new') {
    try {
      const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
      return all[id] || null;
    } catch { return null; }
  },
  write(id, data) {
    try {
      const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
      all[id] = { ...data, savedAt: Date.now() };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
  },
  clear(id = 'new') {
    try {
      const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
      delete all[id];
      localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
  },
};
