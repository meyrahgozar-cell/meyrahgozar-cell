/* ============================================================
   کاغذ سفید — نقطه ورود اصلی
   ============================================================ */

import { State } from './core/state.js';
import { Router } from './core/router.js';
import { Auth } from './core/auth.js';
import { Storage } from './services/storage.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { Toast } from './components/Toast.js';
import { seedDefaultPlans } from './models/Plan.js';

import { DashboardView } from './views/DashboardView.js';
import { PlannerView } from './views/PlannerView.js';
import { LifeView } from './views/LifeView.js';
import { SettingsView } from './views/SettingsView.js';

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

  // اگر هیچ برنامه‌ای نیست، پیش‌فرض بساز
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

  // ---- نمایش خوش‌آمد در اولین بار ----
  if (!Auth.hasToken() && !localStorage.getItem('kaghaz:welcomed')) {
    localStorage.setItem('kaghaz:welcomed', '1');
    setTimeout(() => {
      Toast.info('برای همگام‌سازی با GitHub، به تنظیمات بروید', 5000);
    }, 1200);
  }

  console.log('%c📜 کاغذ سفید', 'font-size:20px;font-weight:bold;color:#818cf8', '\nآماده برنامه‌ریزی زندگی');
}

function setupGlobalEvents() {
  // ذخیره خودکار پس از هر تغییر (با تاخیر)
  let saveTimer = null;
  State.subscribeAll(async () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await Storage.save(State.snapshot());
    }, 800);
  });

  // میان‌برهای کیبورد
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K → جستجو (نمای فعلی)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.querySelector('#search')?.focus();
    }
    // Ctrl/Cmd + S → همگام‌سازی دستی
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      Storage.save(State.snapshot()).then(r => {
        if (r.synced) Toast.success('همگام‌سازی انجام شد');
        else if (r.error) Toast.error(r.error);
      });
    }
    // ESC → بستن سایدبار موبایل
    if (e.key === 'Escape') {
      document.getElementById('sidebar')?.classList.remove('open');
    }
  });

  // وضعیت پاورقی
  State.subscribe('ui', () => {
    const el = document.getElementById('footer-status');
    if (!el) return;
    el.className = 'footer-status';
    if (State.ui.syncing) {
      el.classList.add('syncing');
      el.textContent = 'در حال همگام‌سازی…';
    } else if (State.ui.lastError) {
      el.classList.add('error');
      el.textContent = 'خطا در همگام‌سازی';
      el.title = State.ui.lastError;
    } else {
      el.textContent = Auth.hasToken() ? 'متصل به GitHub' : 'محلی';
    }
  });

  // قبل از بستن صفحه، ذخیره کند
  window.addEventListener('beforeunload', () => {
    Storage.saveLocal(State.snapshot());
  });
}

// ---- شروع ----
boot().catch(err => {
  console.error('Boot error:', err);
  document.getElementById('app').innerHTML = `
    <div style="padding:40px;text-align:center;color:#f43f5e;">
      <h1>خطا در راه‌اندازی</h1>
      <p>${err.message}</p>
    </div>
  `;
});