/* ============================================================
   کاغذ سفید — هدر (نسخه اصلاح‌شده)
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

/* ---------- آیکون‌های SVG ---------- */
function syncSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7"/>
      <path d="M21 3v5h-5"/>
    </svg>
  `;
}

function syncActiveSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-6.2-8.6"/>
    </svg>
  `;
}

function menuSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round">
      <path d="M3 6h18M3 12h18M3 18h18"/>
    </svg>
  `;
}

/* ============================================================
   رندر هدر
   ============================================================ */
export function renderHeader() {
  const el = document.getElementById('header');
  if (!el) return;

  const route = State.ui.currentRoute;
  const horizon = route.startsWith('planner/') ? route.split('/')[1] : null;
  const meta = horizon ? HORIZONS[horizon] : TITLES[route] || { title: 'کاغذ سفید', sub: '' };
  const syncing = State.ui.syncing;
  const hasToken = Auth.hasToken();

  el.innerHTML = `
    <div class="header-left">
      <button class="btn-icon" id="menu-toggle" aria-label="باز کردن منو"
              style="display:none;">
        ${menuSvg()}
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

      <button class="btn-icon ${syncing ? 'syncing' : ''}"
              id="btn-sync"
              title="${syncing ? 'در حال همگام‌سازی…' : 'همگام‌سازی دستی (Ctrl+S)'}"
              aria-label="همگام‌سازی">
        ${syncing ? syncActiveSvg() : syncSvg()}
      </button>

      <button class="btn btn-primary btn-sm" id="btn-quick-add"
              title="افزودن هدف جدید">
        <span style="font-weight:700;font-size:15px;line-height:1;">+</span>
        <span class="hide-sm">هدف جدید</span>
      </button>
    </div>
  `;

  /* ---------- رویدادها ---------- */

  // افزودن سریع
  document.getElementById('btn-quick-add').onclick = () => Router.go('dashboard?new=1');

  // همگام‌سازی دستی
  document.getElementById('btn-sync').onclick = async (e) => {
    const btn = e.currentTarget;

    if (!Auth.hasToken()) {
      Toast.warning('ابتدا توکن GitHub را در تنظیمات وارد کنید');
      Router.go('settings');
      return;
    }

    // فوری نشان بده که در حال کار است
    btn.classList.add('syncing');
    btn.innerHTML = syncActiveSvg();
    btn.title = 'در حال همگام‌سازی…';

    try {
      const { Storage } = await import('../services/storage.js');
      const res = await Storage.save(State.snapshot());

      if (res.synced) {
        Toast.success('همگام‌سازی با موفقیت انجام شد ✓');
      } else if (res.error) {
        Toast.error(res.error);
      } else {
        Toast.info('تغییری برای ذخیره وجود نداشت');
      }
    } catch (err) {
      console.error(err);
      Toast.error('خطا در همگام‌سازی: ' + err.message);
    } finally {
      // بازگرداندن به حالت عادی
      btn.classList.remove('syncing');
      btn.innerHTML = syncSvg();
      btn.title = 'همگام‌سازی دستی (Ctrl+S)';
    }
  };

  // منوی موبایل
  const toggle = document.getElementById('menu-toggle');
  const updateMenuVisibility = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      toggle.style.display = 'inline-flex';
    } else {
      toggle.style.display = 'none';
    }
  };
  updateMenuVisibility();
  window.addEventListener('resize', updateMenuVisibility);

  toggle.onclick = () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  };

  /* ---------- اشتراک در تغییرات ---------- */

  // وقتی مسیر عوض شد، دوباره هدر را بساز
  State.subscribe('ui', () => {
    // فقط اگر عنوان عوض شده، دوباره رندر کن
    const currentTitle = el.querySelector('.header-title h1')?.textContent;
    const newRoute = State.ui.currentRoute;
    const newHorizon = newRoute.startsWith('planner/') ? newRoute.split('/')[1] : null;
    const newMeta = newHorizon ? HORIZONS[newHorizon] : TITLES[newRoute] || { title: 'کاغذ سفید' };

    if (currentTitle !== newMeta.title) {
      renderHeader();
      return;
    }

    // در غیر این صورت، فقط دکمه sync را آپدیت کن
    const syncBtn = document.getElementById('btn-sync');
    if (syncBtn) {
      const isSyncing = !!State.ui.syncing;
      syncBtn.classList.toggle('syncing', isSyncing);
      syncBtn.innerHTML = isSyncing ? syncActiveSvg() : syncSvg();
      syncBtn.title = isSyncing ? 'در حال همگام‌سازی…' : 'همگام‌سازی دستی (Ctrl+S)';
    }
  });
}