/* ============================================================
   کاغذ سفید — سایدبار
   ============================================================ */

import { State } from '../core/state.js';
import { Router } from '../core/router.js';
import { HORIZONS, HORIZON_ORDER } from '../models/Plan.js';
import { toFa } from '../core/utils.js';

const MAIN_ITEMS = [
  { key: 'dashboard', label: 'داشبورد',     icon: '🏠' },
  { key: 'life',      label: 'نمای عمر',    icon: '♾️' },
  { key: 'settings',  label: 'تنظیمات',     icon: '⚙️' },
];

export function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;

  const { currentRoute } = State.ui;
  const stats = State.stats();

  el.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-mark">📜</div>
      <div class="brand-text">
        <div class="brand-title">کاغذ سفید</div>
        <div class="brand-sub">برنامه‌ریزی زندگی</div>
      </div>
    </div>

    <nav class="nav-group">
      <div class="nav-group-title">عمومی</div>
      ${MAIN_ITEMS.map(item => navItem(item, currentRoute)).join('')}
    </nav>

    <nav class="nav-group">
      <div class="nav-group-title">افق‌های زمانی</div>
      ${HORIZON_ORDER.map(key => {
        const h = HORIZONS[key];
        const plan = State.getPlans().find(p => p.horizon === key);
        const count = plan?.goals.length || 0;
        return navItem({
          key: 'planner/' + key,
          label: h.title,
          icon: h.icon,
          badge: count ? toFa(count) : '',
        }, currentRoute);
      }).join('')}
    </nav>

    <div class="sidebar-footer">
      <div>${toFa(stats.doneCount)} هدف انجام‌شده</div>
      <div style="opacity:.6;margin-top:2px;">از ${toFa(stats.goalsCount)} هدف</div>
    </div>
  `;

  // رویداد کلیک روی آیتم‌ها
  el.querySelectorAll('[data-route]').forEach(btn => {
    btn.addEventListener('click', () => {
      Router.go(btn.dataset.route);
      State.updateUI({ sidebarOpen: false });
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // بروزرسانی خودکار
  State.subscribe('plans', () => renderSidebar());
  State.subscribe('goals', () => renderSidebar());
  State.subscribe('ui', () => {
    el.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.route === State.ui.currentRoute);
    });
  });
}

function navItem({ key, label, icon, badge = '' }, currentRoute) {
  const active = currentRoute === key;
  return `
    <button class="nav-item ${active ? 'active' : ''}" data-route="${key}">
      <span class="nav-icon">${icon}</span>
      <span>${label}</span>
      ${badge ? `<span class="nav-badge">${badge}</span>` : ''}
    </button>
  `;
}