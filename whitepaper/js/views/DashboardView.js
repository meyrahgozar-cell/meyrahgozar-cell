/* ============================================================
   کاغذ سفید — داشبورد
   ============================================================ */

import { State } from '../core/state.js';
import { Router } from '../core/router.js';
import { greeting, toFa, faDate } from '../core/utils.js';
import { HORIZONS, HORIZON_ORDER, planProgress, seedDefaultPlans } from '../models/Plan.js';
import { ProgressRing } from '../components/ProgressRing.js';
import { Toast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { goalModal } from './PlannerView.js';

export async function DashboardView({ container, params }) {
  const stats = State.stats();
  const settings = State.data.settings;
  const plans = State.getPlans();

  // اگر هیچ برنامه‌ای وجود ندارد، افق‌های پیش‌فرض بساز
  if (plans.length === 0) {
    for (const p of seedDefaultPlans()) State.addPlan(p);
    const { Storage } = await import('../services/storage.js');
    Storage.save(State.snapshot());
  }

  container.innerHTML = `
    <div class="dash-hero anim-in">
      <div class="hero-greeting">${greeting()}${settings.userName ? '، ' + settings.userName : ''} 👋</div>
      <div class="hero-sub">امروز ${faDate()} است. یک قدم کوچک، یک گام به رویاهایت نزدیک‌تر.</div>
      <div class="hero-stats stagger">
        ${heroStat('برنامه‌های فعال', toFa(stats.plansCount))}
        ${heroStat('اهداف کل', toFa(stats.goalsCount))}
        ${heroStat('انجام‌شده', toFa(stats.doneCount))}
        ${heroStat('نرخ موفقیت', toFa(stats.completionRate) + '٪')}
        ${heroStat('عقب‌افتاده', toFa(stats.overdueCount))}
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-4);">
      <h2 style="font-size:var(--fs-xl);">افق‌های زمانی</h2>
      <span class="chip">${toFa(stats.goalsCount)} هدف در ${toFa(stats.plansCount)} برنامه</span>
    </div>

    <div class="horizon-grid stagger" id="horizon-grid"></div>
  `;

  // رندر کارت‌های افق
  const grid = container.querySelector('#horizon-grid');
  for (const key of HORIZON_ORDER) {
    const plan = State.getPlans().find(p => p.horizon === key);
    if (!plan) continue;
    grid.appendChild(horizonCard(plan));
  }

  // پارامتر ?new=1 — باز کردن سریع مودال
  if (params.get('new') === '1') {
    setTimeout(() => goalModal(null), 300);
  }

  return {
    destroy() { /* پاک‌سازی در صورت نیاز */ }
  };
}

function heroStat(label, value) {
  return `<div class="hero-stat">
    <div class="hero-stat-value">${value}</div>
    <div class="hero-stat-label">${label}</div>
  </div>`;
}

function horizonCard(plan) {
  const meta = HORIZONS[plan.horizon];
  const progress = planProgress(plan);
  const done = plan.goals.filter(g => g.status === 'completed').length;

  const card = document.createElement('button');
  card.className = 'horizon-card';
  card.style.setProperty('--card-accent', meta.color);
  card.style.setProperty('--card-accent-soft', hexA(meta.color, 0.15));
  card.innerHTML = `
    <div class="horizon-card-top">
      <div class="horizon-icon">${plan.icon}</div>
      <div class="horizon-meta">
        <div class="horizon-name">${plan.title}</div>
        <div class="horizon-tag">${meta.tag}</div>
      </div>
    </div>
    <div class="horizon-body">
      <div class="horizon-stats">
        <span>${toFa(done)} از ${toFa(plan.goals.length)} هدف</span>
        <span class="text-muted" style="font-size:var(--fs-xs)">${progress}٪ پیشرفت</span>
      </div>
      ${ProgressRing({ percent: progress, size: 56, stroke: 5, color: meta.color })}
    </div>
  `;
  card.onclick = () => Router.go('planner/' + plan.horizon);
  return card;
}

function hexA(hex, alpha) {
  const c = hex.replace('#', '');
  const n = parseInt(c, 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}