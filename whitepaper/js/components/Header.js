/* ============================================================
   کاغذ سفید — هدر
   ============================================================ */

import { State } from '../core/state.js';
import { Router } from '../core/router.js';
import { Auth } from '../core/auth.js';
import { greeting, toFa, faDate } from '../core/utils.js';
import { HORIZONS } from '../models/Plan.js';
import { Toast } from './Toast.js';

const TITLES = {
  dashboard: { title: 'داشبورد', sub: 'نمای کلی برنامه‌ها' },
  life:      { title: 'نمای عمر',  sub: 'تصویر بزرگ زندگی شما' },
  settings:  { title: 'تنظیمات',  sub: 'پیکربندی و همگام‌سازی' },
};

function syncSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
    <path d="M21 3v5h-5"/>
  </svg>`;
}
function spinSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 1 1-6.2-8.6"/>
  </svg>`;
}

export function renderHeader() {
  const el = document.getElementById('header');
  if (!el) return;

  const route = State.ui.currentRoute;
  const horizon = route.startsWith('planner/') ? route.split('/')[1] : null;
  const meta = horizon ? HORIZONS[horizon] : TITLES[route] || { title: 'کاغذ سفید', sub: '' };
  const hasToken = Auth.hasToken();

  el.innerHTML = `
    <div class="header-left">
      <button class="btn-icon" id="menu-toggle" aria-label="منو" style="display:none;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M3 6h18M3 12h18M3 18h18"/>
        </svg>
      </button>
      <div class="header-title">
        <h1>${meta.title || 'کاغذ سفید'}</h1>
        <div class="header-sub">${meta.sub || faDate()}</div>
      </div>
    </div>

    <div class="header-actions">
      <span class="chip ${hasToken ? 'success' : 'warning'} hide-sm"
            title="${hasToken ? 'متصل به GitHub' : 'بدون توکن — فقط محلی'}">
        ${hasToken ? '☁️ همگام' : '💾 محلی'}
      </span>
      <button class="btn-icon" id="btn-sync" title="همگام‌سازی (Ctrl+S)">
        ${syncSvg()}
      </button>
      <button class="btn btn-primary btn-sm" id="btn-quick-add">
        <span>+</span>
        <span class="hide-sm">هدف جدید</span>
      </button>
    </div>
  `;

  // افزودن سریع
  document.getElementById('btn-quick-add').onclick = () => Router.go('dashboard?new=1');

  // ✅ FIX: sync button with proper state toggling
  document.getElementById('btn-sync').onclick = async (e) => {
    const btn = e.currentTarget;

    if (!Auth.hasToken()) {
      Toast.warning('ابتدا توکن GitHub را در تنظیمات وارد کنید');
      Router.go('settings');
      return;
    }

    btn.classList.add('syncing');
    btn.innerHTML = spinSvg();

    try {
      const { Storage } = await import('../services/storage.js');
      const res = await Storage.save(State.snapshot());
      if (res.synced) Toast.success('همگام‌سازی انجام شد');
      else if (res.error) Toast.error(res.error);
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    } finally {
      btn.classList.remove('syncing');
      btn.innerHTML = syncSvg();
    }
  };

  // منوی موبایل
  const toggle = document.getElementById('menu-toggle');
  const syncToggleVisibility = () => {
    toggle.style.display = window.matchMedia('(max-width: 900px)').matches
      ? 'inline-flex' : 'none';
  };
  syncToggleVisibility();
  window.addEventListener('resize', syncToggleVisibility);

  toggle.onclick = () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  };
}

// ✅ FIX: only re-render header when route actually changes title
let lastTitle = null;
State.subscribe('ui', () => {
  const route = State.ui.currentRoute;
  const horizon = route.startsWith('planner/') ? route.split('/')[1] : null;
  const meta = horizon ? HORIZONS[horizon] : TITLES[route] || { title: 'کاغذ سفید' };

  if (lastTitle !== meta.title) {
    lastTitle = meta.title;
    renderHeader();
  }
});