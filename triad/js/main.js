// ---------------------------------------------------------------------------
// main.js — boot the shell, wire the router, start the app.
// ---------------------------------------------------------------------------
import { store } from './core/store.js';
import { bus, EV } from './core/bus.js';
import { Router, routeMeta } from './core/router.js';
import { setNavRouter } from './core/nav.js';
import { h, clamp } from './core/dom.js';
import { installSoundBus, bindFirstGesture, sfx } from './ui/sounds.js';
import { toastBus, toast } from './ui/overlay.js';
import { initFx, sparkleBurst } from './ui/fx.js';
import { mountRail, mountTopbar, mountStatus, renderDock, installShortcuts, installShellBus, setRouter, showShortcuts, toggleDock } from './ui/shell.js';
import { installAuthBus, openAuth } from './ui/authui.js';
import { installGlobalActions } from './main-actions.js';
import { installAiBus, hasKey } from './ui/ai.js';
import { onAuthChange, currentSession } from './core/auth.js';

import { hubView } from './views/hub.js';
import { matrixView } from './views/matrix.js';
import { deckView } from './views/deck.js';
import { peopleView } from './views/people.js';
import { traitsView } from './views/traits.js';
import { insightsView } from './views/insights.js';
import { compareView } from './views/compare.js';
import { labView } from './views/lab.js';
import { settingsView } from './views/settings.js';

const BOOT_LINES = [
  'allocating cube',
  'indexing people',
  'resolving traits',
  'binding matrix',
  'wiring audio',
  'ready'
];

async function boot() {
  const bootEl = document.getElementById('boot');
  const lines = document.getElementById('boot-lines');
  let li = 0;
  const lineTimer = setInterval(() => {
    if (!lines) return;
    lines.textContent = BOOT_LINES[Math.min(li, BOOT_LINES.length - 1)];
    li++;
    if (li > BOOT_LINES.length) clearInterval(lineTimer);
  }, 210);

  installSoundBus();
  installAuthBus();
  installShellBus();
  installGlobalActions();
  installAiBus();
  bindFirstGesture();

  try {
    await store.init();
  } catch (err) {
    console.error('[boot] store init failed', err);
    toast({ kind: 'error', title: 'Load failed', text: err.message, duration: 0 });
  }

  sfx.setEnabled(store.prefs.sound);
  sfx.setVolume(store.prefs.volume);
  sfx.setHaptics(store.prefs.haptics);
  if (store.prefs.ambient) sfx.startAmbient();

  const app = document.getElementById('app');
  app.hidden = false;
  mountRail();
  mountTopbar();
  mountStatus();
  initFx();
  toastBus();

  const router = new Router(document.getElementById('view'));
  setRouter(router);
  setNavRouter(router);

  router.register('hub', () => hubView());
  router.register('matrix', (ctx) => matrixView(ctx));
  router.register('deck', (ctx) => deckView(ctx));
  router.register('people', (ctx) => peopleView(ctx));
  router.register('traits', (ctx) => traitsView(ctx));
  router.register('insights', () => insightsView());
  router.register('compare', (ctx) => compareView(ctx));
  router.register('lab', () => labView());
  router.register('settings', () => settingsView());

  installShortcuts(router);
  router.start();

  // auth state
  onAuthChange(async (event, session) => {
    store.setSession(session);
    if (event === 'SIGNED_IN' && session) {
      await store.load();
      renderDock();
      toast({ kind: 'ok', title: 'Session active', text: 'Cloud writes enabled' });
    }
    if (event === 'SIGNED_OUT') {
      await store.load();
      renderDock();
    }
  });

  // restore session silently (PKCE redirects)
  const session = await currentSession().catch(() => null);
  if (session && !store.session) store.setSession(session);

  clearInterval(lineTimer);
  if (lines) lines.textContent = 'ready';
  await new Promise(r => setTimeout(r, 340));
  bootEl?.classList.add('is-done');
  setTimeout(() => bootEl?.remove(), 700);

  // first-run affordances
  setTimeout(() => {
    if (store.mode === 'local') {
      toast({
        kind: 'info',
        title: 'Local cube active',
        text: 'You are working offline-first. Run the SQL from Settings → Console to move into Supabase.',
        duration: 5600
      });
    } else if (!hasKey()) {
      toast({ kind: 'info', title: 'Cloud cube connected', text: 'Add an OpenRouter key in AI Lab to switch the AI on.', duration: 4200 });
    }
  }, 1200);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') e.preventDefault();
  });

  bus.on(EV.TOAST, () => {});
  bus.on(EV.DATA_CHANGED, () => { mountStatus(); });

  // expose a tiny debug surface (useful in the console, harmless in prod)
  window.TRIAD = {
    store,
    bus,
    sfx,
    routes: Object.keys(routeMeta),
    go: (name, params) => router.go(name, params),
    palette: () => document.querySelector('.rail__logo')?.click(),
    sparkle: sparkleBurst,
    auth: () => openAuth('signin'),
    dock: () => toggleDock()
  };
}

window.addEventListener('error', (e) => {
  console.error('[triad]', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[triad] unhandled', e.reason);
});

boot();
