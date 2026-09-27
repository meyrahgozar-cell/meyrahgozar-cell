/* ============================================================
   کاغذ سفید — نقطه ورود اصلی (نسخه اصلاح‌شده)
   ============================================================ */

import { State } from './core/state.js';
import { Router } from './core/router.js';
import { Auth } from './core/auth.js';
import { Storage, onSyncStatus } from './services/storage.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { Toast } from './components/Toast.js';
import { seedDefaultPlans } from './models/Plan.js';

import { DashboardView } from './views/DashboardView.js';
import { PlannerView } from './views/PlannerView.js';
import { LifeView } from './views/LifeView.js';
import { SettingsView } from './views/SettingsView.js';

/* ============================================================
   راه‌اندازی
   ============================================================ */
async function boot() {
  // ---- بارگذاری داده‌ها ----
  try {
    const data = await Storage.load();
    if (data) {
      State.replaceData({
        plans: data.plans || [],
        settings: { ...State.data.settings, ...(data.settings || {}) },
        meta: data.meta || State.data.meta,
      });
    }
  } catch (e) {
    console.warn('خطا در بارگذاری:', e);
  }

  // ---- ساخت برنامه‌های پیش‌فرض در اولین اجرا ----
  if (State.getPlans().length === 0) {
    for (const p of seedDefaultPlans()) State.addPlan(p);
    await Storage.save(State.snapshot());
  }

  // ---- رندر پوسته ----
  renderSidebar();
  renderHeader();

  // ---- ثبت مسیرها ----
  Router.register('dashboard', DashboardView);
  Router.register('life', LifeView);
  Router.register('settings', SettingsView);
  Router.register('planner', PlannerView);

  Router.setNotFound(async ({ container }) => {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧭</div>
        <div class="empty-title">صفحه یافت نشد</div>
        <div class="empty-desc">به <a href="#dashboard">داشبورد</a> بازگردید.</div>
      </div>
    `;
  });

  // ---- شروع مسیریاب ----
  Router.start();

  // ---- رویدادهای سراسری ----
  setupGlobalEvents();

  // ---- خوش‌آمد اولین بازدید ----
  if (!Auth.hasToken() && !localStorage.getItem('kaghaz:welcomed')) {
    localStorage.setItem('kaghaz:welcomed', '1');
    setTimeout(() => {
      Toast.info('برای همگام‌سازی با GitHub، به تنظیمات بروید', 5000);
    }, 1200);
  }

  console.log(
    '%c📜 کاغذ سفید',
    'font-size:20px;font-weight:bold;color:#818cf8',
    '\nآماده برنامه‌ریزی زندگی'
  );
}

/* ============================================================
   رویدادهای سراسری
   ============================================================ */
function setupGlobalEvents() {
  /* ------------------------------------------------------------
     ⚡️ ذخیره خودکار
     مهم: رویدادهای 'ui' نادیده گرفته می‌شوند تا حلقه بی‌نهایت رخ ندهد
     ------------------------------------------------------------ */
  let saveTimer = null;
  State.subscribeAll(async (key) => {
    // ❗️ حیاتی: از حلقه بی‌نهایت جلوگیری می‌کند
    if (key === 'ui') return;

    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await Storage.save(State.snapshot());
    }, 1000);
  });

  /* ------------------------------------------------------------
     وضعیت همگام‌سازی — از طریق callback جدا (نه State)
     ------------------------------------------------------------ */
  onSyncStatus((status) => {
    // نگه‌داشتن در State.ui برای استفاده‌های بعدی (بدون emit)
    State.ui.syncing = !!status.syncing;
    State.ui.lastError = status.error || null;

    // آپدیت پاورقی
    const el = document.getElementById('footer-status');
    if (el) {
      el.className = 'footer-status';
      if (status.syncing) {
        el.classList.add('syncing');
        el.textContent = 'در حال همگام‌سازی…';
        el.title = '';
      } else if (status.error) {
        el.classList.add('error');
        el.textContent = 'خطا در همگام‌سازی';
        el.title = status.error;
      } else {
        el.textContent = Auth.hasToken() ? 'متصل به GitHub' : 'محلی';
        el.title = '';
      }
    }

    // آپدیت آیکون هدر — بدون trigger کردن save
    const syncBtn = document.getElementById('btn-sync');
    if (syncBtn) {
      syncBtn.innerHTML = status.syncing
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>`;
    }
  });

  /* ------------------------------------------------------------
     میان‌برهای کیبورد
     ------------------------------------------------------------ */
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K → فوکوس روی جستجو
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.querySelector('#search')?.focus();
    }

    // Ctrl/Cmd + S → همگام‌سازی دستی
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      Storage.save(State.snapshot()).then((r) => {
        if (r.synced) Toast.success('همگام‌سازی انجام شد');
        else if (r.error) Toast.error(r.error);
      });
    }

    // ESC → بستن سایدبار موبایل
    if (e.key === 'Escape') {
      document.getElementById('sidebar')?.classList.remove('open');
    }
  });

  /* ------------------------------------------------------------
     ذخیره محلی قبل از بستن صفحه (برای اطمینان)
     ------------------------------------------------------------ */
  window.addEventListener('beforeunload', () => {
    Storage.saveLocal(State.snapshot());
  });

  /* ------------------------------------------------------------
     وقتی کاربر به تب برمی‌گردد، همگام‌سازی کن
     ------------------------------------------------------------ */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Auth.hasToken()) {
      // فقط اگر بیش از ۵ دقیقه از آخرین sync گذشته باشد
      const lastSync = State.data.settings.lastSyncedAt;
      const fiveMin = 5 * 60 * 1000;
      if (!lastSync || Date.now() - new Date(lastSync).getTime() > fiveMin) {
        Storage.save(State.snapshot());
      }
    }
  });
}

/* ============================================================
   شروع
   ============================================================ */
boot().catch((err) => {
  console.error('Boot error:', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div style="padding:40px;text-align:center;color:#f43f5e;">
        <h1 style="margin-bottom:12px;">خطا در راه‌اندازی</h1>
        <p style="opacity:.8;">${err.message}</p>
      </div>
    `;
  }
});