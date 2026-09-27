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

export function renderHeader() {
  const el = document.getElementById('header');
  if (!el) return;

  const route = State.ui.currentRoute;
  const horizon = route.startsWith('planner/') ? route.split('/')[1] : null;
  const meta = horizon ? HORIZONS[horizon] : TITLES[route] || { title: 'کاغذ سفید', sub: '' };
  const syncing = State.ui.syncing;
  const hasToken = Auth.hasToken();

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;min-width:0;">
      <button class="btn-icon" id="menu-toggle" aria-label="منو" style="display:none;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M3 12h18M3 18h18"/>
        </svg>
      </button>
      <div class="header-title">
        <h1>${meta.title || 'کاغذ سفید'}</h1>
        <div class="header-sub">${meta.sub || faDate()}</div>
      </div>
    </div>

    <div class="header-actions">
      <span class="chip ${hasToken ? 'success' : 'warning'} hide-sm" title="${hasToken ? 'متصل به GitHub' : 'بدون توکن — فقط محلی'}">
        ${hasToken ? '☁️ همگام' : '💾 محلی'}
      </span>
      <button class="btn-icon hide-sm" id="btn-sync" title="${syncing ? 'در حال همگام‌سازی' : 'همگام‌سازی'}">
        ${syncing ? spinnerSvg() : syncSvg()}
      </button>
      <button class="btn btn-primary btn-sm" id="btn-quick-add">
        <span>+</span>
        <span class="hide-sm">هدف جدید</span>
      </button>
    </div>
  `;

  document.getElementById('btn-quick-add').onclick = () => Router.go('dashboard?new=1');
  document.getElementById('btn-sync').onclick = async () => {
    if (!Auth.hasToken()) {
      Toast.warning('ابتدا توکن GitHub را در تنظیمات وارد کنید');
      Router.go('settings');
      return;
    }
    const { Storage } = await import('../services/storage.js');
    const res = await Storage.save(State.snapshot());
    if (res.synced) Toast.success('همگام‌سازی انجام شد');
    else Toast.error(res.error || 'خطا در همگام‌سازی');
  };

  // دکمه منو در موبایل
  const toggle = document.getElementById('menu-toggle');
  if (window.matchMedia('(max-width: 900px)').matches) {
    toggle.style.display = 'grid';
    toggle.onclick = () => {
      const sb = document.getElementById('sidebar');
      sb.classList.toggle('open');
    };
  }

  // اشتراک
  State.subscribe('ui', () => {
    const syncBtn = document.getElementById('btn-sync');
    if (syncBtn) syncBtn.innerHTML = State.ui.syncing ? spinnerSvg() : syncSvg();
  });
}

function syncSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
    <path d="M21 3v5h-5"/>
  </svg>`;
}
function spinnerSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;">
    <path d="M21 12a9 9 0 1 1-6.2-8.6"/>
  </svg>`;
}