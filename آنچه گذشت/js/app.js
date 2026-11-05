/* ریل — پوستهٔ برنامه، مسیرها، نوارها و کیبورد. */
import { esc, icon, qs, qsa, isTypingTarget, debounce } from './lib/dom.js';
import { firstName } from './lib/format.js';
import { applyPrefs, prefs, savePrefs, state, toggleTheme, appliedTheme, bus } from './state.js';
import * as router from './lib/router.js';
import { navigate, route, start, setFallback } from './lib/router.js';
import { toast, openModal, menu, closeMenu } from './lib/ui.js';
import { getSession, onAuthChange, signOut, updatePassword } from './services/auth.js';
import { db, probeCloudSchema } from './services/db.js';
import { mountAuth } from './views/auth.js';
import home from './views/home.js';
import timeline from './views/timeline.js';
import gallery from './views/gallery.js';
import calendar from './views/calendar.js';
import insights from './views/insights.js';
import { threadsView, threadDetailView } from './views/threads.js';
import places from './views/places.js';
import settings from './views/settings.js';
import editor from './views/editor.js';
import frame from './views/frame.js';
import setup from './views/setup.js';

let currentView = null;
let currentCtx = null;
let shellReady = false;

const LOCAL_KEY = 'reel.localvault.v1';
const hasLocalVault = () => localStorage.getItem(LOCAL_KEY) === '1';

/* ── نوارها ─────────────────────────────────────────────────── */
function paintChrome() {
  const shell = qs('#shell');
  if (!shell) return;

  const path = currentCtx?.path || '/home';
  const section = path === '/' ? 'home'
    : path.startsWith('/frame') ? ''
    : path.startsWith('/write') ? 'write'
    : path.startsWith('/thread/') ? 'threads'
    : path.split('/')[1] || 'home';
  qsa('[data-nav]').forEach((a) => {
    const key = a.dataset.nav;
    const active = key === section || (key === 'reel' && section === 'timeline');
    a.classList.toggle('is-active', active);
  });

  const name = state.profile?.display_name || state.user?.email || 'دوست';
  qs('#railName').textContent = name;
  qs('#railMeta').textContent = state.mode === 'cloud'
    ? (state.user?.email || 'گنجینهٔ ابری')
    : hasLocalVault() || !state.session ? 'گنجینهٔ محلی' : 'در انتظار همگام‌سازی';
  const avatar = qs('#railAvatar');
  if (state.profile?.avatar_src) {
    avatar.innerHTML = `<img src="${esc(state.profile.avatar_src)}" alt="" />`;
  } else {
    avatar.textContent = name.trim()[0] || 'ر';
  }

  const chip = qs('#syncChip');
  const text = chip?.querySelector('.sync__text');
  if (chip && text) {
    if (!state.online) {
      chip.dataset.state = 'offline';
      text.textContent = 'آفلاین · ذخیره روی دستگاه';
    } else if (state.mode === 'cloud') {
      chip.dataset.state = 'cloud';
      text.textContent = 'گنجینهٔ ابری · همگام';
    } else {
      chip.dataset.state = 'local';
      text.textContent = state.session ? 'گنجینهٔ محلی · ابر تنظیم نشده' : 'گنجینهٔ محلی · همین دستگاه';
    }
  }

  const count = qs('#countFrames');
  if (count) count.textContent = state.entryCount ? state.entryCount.toLocaleString('fa-IR') : '';

  const themeBtn = qs('#themeBtn');
  if (themeBtn) {
    themeBtn.innerHTML = icon(appliedTheme() === 'dark' ? 'sun' : 'moon');
    themeBtn.setAttribute('aria-label', appliedTheme() === 'dark' ? 'روشن کن' : 'تاریک کن');
  }
}

function refreshTitle() {
  const view = currentView;
  const ctx = currentCtx;
  if (!view || !ctx) return;
  const t = typeof view.title === 'function' ? view.title(ctx) : view.title;
  const s = typeof view.sub === 'function' ? view.sub(ctx) : (view.sub || '');
  qs('#pageTitle').textContent = t || 'ریل';
  qs('#pageSub').textContent = s || '';
  document.title = `${t || 'ریل'} · ریل`;
}

/* ── نمایش نما ──────────────────────────────────────────────── */
async function renderView(view, ctx) {
  currentView = view;
  currentCtx = ctx;
  closeMenu();
  const root = qs('#view');
  if (!root) return;
  root.className = 'view';
  refreshTitle();
  paintChrome();
  window.scrollTo({ top: 0, behavior: 'auto' });
  qs('#rail')?.classList.remove('is-open');
  qs('#shell')?.removeAttribute('data-rail');
  try {
    await view.mount(root, ctx);
    refreshTitle();
  } catch (err) {
    console.error('[view]', err);
    root.innerHTML = `<div class="banner banner--warn">${icon('alert')}<div class="grow"><span class="banner__title">این صفحه باز نشد</span><br>${esc(err.message || 'خطای نامشخص')}</div>
      <div class="banner__actions"><button class="btn btn--sm btn--outline" onclick="location.reload()">بارگذاری دوباره</button></div></div>`;
  }
}

function notFound(ctx) {
  const root = qs('#view');
  qs('#pageTitle').textContent = 'قابِ گمشده';
  qs('#pageSub').textContent = '';
  root.innerHTML = `<div class="empty" style="margin-top:var(--sp-7)">
    <div class="empty__icon">${icon('info', 'ico--lg')}</div>
    <h3>هیچ‌چیز اینجا نیست: <code>${esc(ctx.path)}</code></h3>
    <p>هر روایت فهرست خودش را دارد. خط زمان را امتحان کن.</p>
    <a class="btn btn--primary" href="#/timeline">${icon('reel')}رفتن به خط زمان</a>
  </div>`;
}

/* ── راه‌اندازی ─────────────────────────────────────────────── */
async function boot() {
  applyPrefs();

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (prefs.theme === 'system') applyPrefs();
  });

  registerServiceWorker();
  watchConnectivity();

  try { await refreshAuth(); } catch (err) { console.warn('auth bootstrap', err); }

  if (!state.session && !hasLocalVault()) {
    showAuthScreen();
  } else {
    showShell();
  }

  hideSplash();
  bindGlobalEvents();
  bindAuthEvents();
}

async function refreshAuth() {
  state.session = await getSession();
  state.user = state.session?.user || null;
  if (state.session) {
    const probe = await probeCloudSchema();
    state.schemaReady = !!probe.ready;
    state.mode = probe.ready ? 'cloud' : 'local';
  } else {
    state.schemaReady = false;
    state.mode = 'local';
  }
  try { state.profile = await db.profile.get(); } catch { state.profile = null; }
  try { state.threads = await db.threads.list(); } catch { state.threads = []; }
  try { state.entryCount = (await db.entries.list({ limit: 1, withCount: true })).count ?? 0; } catch { state.entryCount = 0; }
}

function hideSplash() {
  const bootEl = qs('#boot');
  if (!bootEl) return;
  bootEl.dataset.done = 'true';
  setTimeout(() => bootEl.remove(), 700);
}

function showAuthScreen() {
  shellReady = false;
  qs('#shell').hidden = true;
  qs('#authRoot')?.remove();
  const host = document.createElement('div');
  host.id = 'authRoot';
  document.body.appendChild(host);
  mountAuth(host, {
    onAuthenticated: async () => {
      try { await refreshAuth(); } catch { /* ignore */ }
      host.remove();
      showShell();
      toast(`خوش آمدی، ${firstName(state.profile?.display_name || state.user?.email || 'دوست')}`, { type: 'success' });
    },
    onLocalVault: () => {
      host.remove();
      showShell();
      toast('گنجینهٔ محلی آماده است — قاب‌ها روی همین دستگاه می‌مانند', { type: 'info' });
    },
  });
}

function showShell() {
  qs('#authRoot')?.remove();
  qs('#shell').hidden = false;
  paintChrome();
  if (!shellReady) {
    shellReady = true;
    registerRoutes();
    start();
  } else {
    paintChrome();
    router.render();
  }
}

/* ── مسیرها ─────────────────────────────────────────────────── */
function registerRoutes() {
  route('/', () => navigate('/home', { replace: true }));
  route('/home', (ctx) => renderView(home, ctx));
  route('/timeline', (ctx) => renderView(timeline, ctx));
  route('/gallery', (ctx) => renderView(gallery, ctx));
  route('/calendar', (ctx) => renderView(calendar, ctx));
  route('/insights', (ctx) => renderView(insights, ctx));
  route('/threads', (ctx) => renderView(threadsView, ctx));
  route('/thread/:id', (ctx) => renderView(threadDetailView, ctx));
  route('/places', (ctx) => renderView(places, ctx));
  route('/settings', (ctx) => renderView(settings, ctx));
  route('/setup', (ctx) => renderView(setup, ctx));
  route('/write', (ctx) => renderView(editor, ctx));
  route('/write/:id', (ctx) => renderView(editor, ctx));
  route('/frame/:id', (ctx) => renderView(frame, ctx));
  setFallback(notFound);
  router.setGuard(() => null);
}

/* ── رویدادهای عمومی ────────────────────────────────────────── */
function bindGlobalEvents() {
  document.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    switch (action) {
      case 'new-frame': {
        const date = actionEl.dataset.date;
        navigate(`/write${date ? `?date=${date}` : ''}`);
        break;
      }
      case 'open-search': router.openPalette ? router.openPalette() : openSearch(); break;
      case 'toggle-theme': {
        const next = toggleTheme();
        paintChrome();
        toast(next === 'dark' ? 'اتاق تاریک' : 'روشنایی روز', { type: 'info', timeout: 1600 });
        break;
      }
      case 'open-rail': qs('#shell').dataset.rail = 'open'; break;
      case 'close-rail': qs('#shell').removeAttribute('data-rail'); break;
      case 'open-user-menu': {
        const chip = qs('#userChip');
        menu(chip, [
          state.session
            ? { label: state.profile?.display_name || state.user?.email || 'وارد شده', icon: 'user', heading: true }
            : { label: 'گنجینهٔ محلی', icon: 'lock', heading: true },
          { label: 'پروفایل و تنظیمات', icon: 'settings', onSelect: () => navigate('/settings') },
          { label: `پوسته: ${prefs.theme === 'dark' ? 'تاریک' : prefs.theme === 'light' ? 'روشن' : 'سیستم'}`, icon: 'palette', onSelect: () => { savePrefs({ theme: appliedTheme() === 'dark' ? 'light' : 'dark' }); paintChrome(); } },
          { label: 'راه‌اندازی ابری', icon: 'cloud', onSelect: () => navigate('/setup') },
          '-',
          state.session
            ? { label: 'خروج از حساب', icon: 'logout', danger: true, onSelect: handleSignOut }
            : {
              label: 'ورود برای همگام‌سازی', icon: 'user', onSelect: () => {
                showAuthScreen();
              },
            },
          { label: 'کلیدهای میان‌بر', icon: 'info', onSelect: showShortcuts },
        ]);
        break;
      }
      default: break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!shellReady) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
    if (isTypingTarget(e.target)) return;

    if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); showShortcuts(); return; }
    if (e.key === '/') { e.preventDefault(); openSearch(); return; }

    if (meta) return;
    const key = e.key.toLowerCase();
    if (key === 'n') { e.preventDefault(); navigate('/write'); return; }
    if (key === 't') { toggleTheme(); paintChrome(); return; }
    if (key === 'g') {
      const handler = (ev) => {
        document.removeEventListener('keydown', handler);
        const map = { h: '/home', t: '/timeline', g: '/gallery', c: '/calendar', i: '/insights', p: '/places', s: '/settings', r: '/threads' };
        const dest = map[ev.key.toLowerCase()];
        if (dest) { ev.preventDefault(); navigate(dest); }
      };
      document.addEventListener('keydown', handler, { once: true });
      setTimeout(() => document.removeEventListener('keydown', handler), 1400);
    }
  });

  window.addEventListener('online', () => { state.online = true; paintChrome(); qs('#offlineBar').hidden = true; });
  window.addEventListener('offline', () => { state.online = false; paintChrome(); qs('#offlineBar').hidden = false; });

  bus.on('entries:changed', debounce(async () => {
    try { state.entryCount = (await db.entries.list({ limit: 1, withCount: true })).count ?? 0; } catch { /* ignore */ }
    paintChrome();
  }, 300));
  bus.on('profile:changed', paintChrome);
  bus.on('shell:title', () => { refreshTitle(); });
  bus.on('theme', () => paintChrome());

  window.addEventListener('reel:signout', handleSignOut);
  window.addEventListener('reel:signin', () => showAuthScreen());
  window.addEventListener('reel:schema-ready', async () => {
    await refreshAuth();
    paintChrome();
    router.render();
    if (state.mode === 'cloud' && (await db.entries.list({ limit: 1 })).count === 0) {
      toast('گنجینهٔ ابری آماده است — اولین قاب را بساز', { type: 'info' });
    }
  });
}

async function openSearch() {
  const { openPalette } = await import('./ui/palette.js');
  openPalette();
}

async function handleSignOut() {
  try { await signOut(); } catch { /* ignore */ }
  state.session = null; state.user = null; state.profile = null;
  state.mode = 'local'; state.schemaReady = false; state.entryCount = 0;
  shellReady = false;
  localStorage.removeItem(LOCAL_KEY);
  showAuthScreen();
  paintChrome();
}

function bindAuthEvents() {
  onAuthChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      askNewPassword();
      return;
    }
    if (event === 'SIGNED_OUT') return;
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (!session) return;
      state.session = session;
      state.user = session.user;
      if (!shellReady) {
        if (event === 'SIGNED_IN') {
          try { await refreshAuth(); } catch { /* ignore */ }
          qs('#authRoot')?.remove();
          showShell();
        }
        return;
      }
      await refreshAuth();
      paintChrome();
    }
  });
}

function askNewPassword() {
  openModal({
    title: 'گذرواژهٔ تازه انتخاب کن',
    subtitle: 'از پیوند بازیابی آمدی. از این به بعد با این گذرواژه وارد می‌شوی.',
    body: `<label class="field"><span class="field__label">گذرواژهٔ تازه</span>
      <input class="input input--lg" type="password" id="npw" placeholder="دست‌کم ۸ کاراکتر" /></label>
      <div id="npwMsg" style="margin-top:8px"></div>`,
    actions: [
      { label: 'بی‌خیال', onClick: (close) => close() },
      {
        label: 'ذخیرهٔ گذرواژه',
        variant: 'primary',
        onClick: async (close, modal) => {
          const value = qs('#npw', modal).value;
          if (value.length < 8) { qs('#npwMsg', modal).innerHTML = '<div class="err">دست‌کم ۸ کاراکتر لازم است.</div>'; return true; }
          try {
            await updatePassword(value);
            toast('گذرواژه ذخیره شد', { type: 'success' });
            close();
          } catch (err) {
            qs('#npwMsg', modal).innerHTML = `<div class="err">${esc(err.message)}</div>`;
            return true;
          }
          return true;
        },
      },
    ],
    dismissible: false,
  });
}

function showShortcuts() {
  const rows = [
    ['⌘K / Ctrl K', 'جست‌وجو در قاب‌ها و فرمان‌ها'],
    ['N', 'قاب تازه'],
    ['T', 'روشن / تاریک'],
    ['G سپس H', 'نمای کلی'],
    ['G سپس T', 'خط زمان'],
    ['G سپس G', 'آلبوم'],
    ['G سپس C', 'تقویم'],
    ['G سپس I', 'بینش'],
    ['G سپس P', 'مکان‌ها'],
    ['G سپس S', 'تنظیمات'],
    ['⌘↵', 'ذخیرهٔ قاب در حال ویرایش'],
    ['Esc', 'بستن پنجره یا خروج از ویرایشگر'],
    ['← / →', 'جابه‌جایی بین ماه‌ها و عکس‌ها'],
  ];
  openModal({
    title: 'کلیدهای میان‌بر',
    subtitle: 'برای همان کیبوردی که داری نوشته شده.',
    body: `<table class="table">${rows.map(([k, v]) => `<tr><td><kbd class="kbd">${esc(k)}</kbd></td><td style="color:var(--muted)">${esc(v)}</td></tr>`).join('')}</table>`,
    actions: [{ label: 'فهمیدم', variant: 'primary', onClick: (close) => close() }],
  });
}

function watchConnectivity() {
  state.online = navigator.onLine;
  const bar = qs('#offlineBar');
  if (bar) bar.hidden = navigator.onLine;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

/* ── برو ────────────────────────────────────────────────────── */
boot().catch((err) => {
  console.error('[boot]', err);
  hideSplash();
  const shell = qs('#shell');
  shell.hidden = false;
  qs('#view').innerHTML = `<div class="banner banner--warn">${icon('alert')}<div class="grow"><span class="banner__title">ریل بالا نیامد</span><br>${esc(err.message || String(err))}</div></div>`;
});
