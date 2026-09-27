/* ============================================================
   کاغذ سفید — مسیریاب هش‌محور
   ============================================================ */

import { State } from './state.js';

const routes = new Map();
let notFoundHandler = null;
let currentView = null;

export const Router = {
  /** ثبت مسیر */
  register(path, handler) {
    routes.set(path, handler);
  },

  setNotFound(fn) {
    notFoundHandler = fn;
  },

  /** پیمایش به مسیر */
  go(path, replace = false) {
    const hash = '#' + path;
    if (replace) {
      history.replaceState(null, '', hash);
      this.handle();
    } else {
      location.hash = hash;
    }
  },

  /** مسیر جاری */
  current() {
    return location.hash.replace(/^#/, '') || 'dashboard';
  },

  /** پارس مسیر به بخش‌ها */
  parse() {
    const raw = this.current();
    const [path, query] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query || '');
    return { path, parts, params };
  },

  /** هندل کردن تغییر مسیر */
  async handle() {
    const { path, parts, params } = this.parse();
    const handler = routes.get(path) || routes.get(parts[0]);
    State.updateUI({ currentRoute: path });

    const container = document.getElementById('view');
    if (!container) return;

    // انیمیشن خروج
    container.style.opacity = '0';
    container.style.transform = 'translateY(6px)';

    await new Promise(r => setTimeout(r, 80));

    try {
      if (handler) {
        currentView = await handler({ container, parts, params });
      } else if (notFoundHandler) {
        currentView = await notFoundHandler({ container, parts, params });
      } else {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🧭</div><p>صفحه یافت نشد</p></div>';
      }
    } catch (err) {
      console.error('Route error:', err);
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">خطا در بارگذاری</div>
        <div class="empty-desc">${err.message || 'مشکلی رخ داد'}</div>
      </div>`;
    }

    container.style.transition = 'opacity 240ms ease, transform 240ms ease';
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /** شروع */
  start() {
    window.addEventListener('hashchange', () => this.handle());
    if (!location.hash) location.replace('#dashboard');
    this.handle();
  },

  /** رویداد پاک‌سازی نمای قبلی (اختیاری) */
  cleanup() {
    if (currentView?.destroy) currentView.destroy();
    currentView = null;
  },
};