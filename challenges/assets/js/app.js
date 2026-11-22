/** نقطه‌ی ورود: راه‌اندازی، مسیریابی هش‌محور و اتصال به پوسته. */
import { store, state } from './store.js';
import { renderShell, applyTheme, pageHead, offlinePage } from './ui/shell.js';
import { h, icon, toast } from './utils.js';

import * as Home from './pages/home.js';
import * as Log from './pages/log.js';
import * as Profile from './pages/profile.js';
import * as Report from './pages/report.js';
import * as Overall from './pages/overall.js';
import * as Coach from './pages/coach.js';
import * as Rules from './pages/rules.js';
import * as Auth from './pages/auth.js';

const ROUTES = [
  { key: 'home', path: '/', module: Home, auth: false },
  { key: 'log', path: '/log', module: Log, auth: true },
  { key: 'profile', path: '/profile', module: Profile, auth: true },
  { key: 'report', path: '/report', module: Report, auth: true },
  { key: 'coach', path: '/coach', module: Coach, auth: true },
  { key: 'overall', path: '/overall', module: Overall, auth: false },
  { key: 'rules', path: '/rules', module: Rules, auth: false },
  { key: 'auth', path: '/auth', module: Auth, auth: false },
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query || '') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ router */

let routing = false;
let pending = false;
let lastPath = null;

async function route() {
  if (routing) {
    pending = true;
    return;
  }
  routing = true;
  try {
    const { path, params } = parseHash();
    const known = ROUTES.find((r) => r.path === path);

    if (!known) {
      renderShell('home');
      const app = document.getElementById('app');
      app.replaceChildren(
        h('div.page', {},
          pageHead('صفحه پیدا نشد', 'آدرس وارد‌شده وجود ندارد.'),
          h('div.card', {}, h('div.empty', {},
            h('div.empty-ic', { html: icon('alert', 24) }),
            h('strong', {}, '۴۰۴'),
            h('p', {}, 'این مسیر در برنامه وجود ندارد.'),
            h('a.btn.primary', { href: '#/' }, 'بازگشت به خانه'),
          )),
        ),
      );
      return;
    }

    if (state.backend === 'offline') {
      renderShell(known.key);
      const app = document.getElementById('app');
      app.hidden = false;
      app.replaceChildren(offlinePage());
      return;
    }

    if (known.auth && !store.isLoggedIn) {
      location.hash = `#/auth?next=${encodeURIComponent(path)}`;
      const loop = setTimeout(() => { if (!store.isLoggedIn) location.hash = '#/'; }, 3000);
      void loop;
      return;
    }

    renderShell(known.key);
    const app = document.getElementById('app');
    app.hidden = false;
    const page = h('div.page');
    app.replaceChildren(page);

    if (path !== lastPath) {
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      lastPath = path;
    }

    try {
      await known.module.render(page, { params });
    } catch (err) {
      console.error('[challenge] render error:', err);
      page.replaceChildren(
        pageHead('خطا در نمایش صفحه', ''),
        h('div.alert.danger', {},
          h('span', { html: icon('alert', 18) }),
          h('div', {}, 'مشکلی در ساخت این صفحه پیش آمد: ', h('span.mono', {}, err?.message || String(err))),
        ),
      );
    }
  } finally {
    routing = false;
    if (pending) {
      pending = false;
      route();
    }
  }
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  applyTheme(localStorage.getItem('weightchallenge.theme') || 'dark');
  const bootEl = document.getElementById('app-loading');

  try {
    await store.init();
  } catch (err) {
    console.error('[challenge] init failed', err);
    if (bootEl) {
      bootEl.innerHTML = `<div class="boot-title">خطا در راه‌اندازی</div><div class="boot-sub">${String(err?.message || err)}</div>`;
    }
    return;
  }

  if (bootEl) bootEl.hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('footer').hidden = false;
  renderShell('home');
  await route();

  window.addEventListener('hashchange', route);

  let timer = null;
  store.on((s) => {
    if (!s.ready || s.loading) return;
    clearTimeout(timer);
    timer = setTimeout(() => route(), 40);
  });

  window.addEventListener('error', (e) => {
    console.error(e.error || e.message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message;
    if (msg) toast(msg, 'error');
    console.error(e.reason);
  });

  // در دسترس بودن برای عیب‌یابی در کنسول
  window.__challenge = { store, state };
}

boot();
