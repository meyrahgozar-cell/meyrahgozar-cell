/* ============================================================
   کاغذ سفید — نمای برنامه‌ریزی (هر افق زمانی)
   ============================================================ */

import { State } from '../core/state.js';
import { Router } from '../core/router.js';
import { HORIZONS } from '../models/Plan.js';
import { createGoal, GOAL_PRIORITY, goalProgress, priorityMeta } from '../models/Goal.js';
import { toFa, faDate, relativeTime, esc } from '../core/utils.js';
import { ProgressRing } from '../components/ProgressRing.js';
import { Modal } from '../components/Modal.js';
import { Toast } from '../components/Toast.js';
import { planProgress } from '../models/Plan.js';

const ICONS = ['🎯','📚','💼','🏃','🧘','💡','🎨','🌱','💰','❤️','🏆','🔬','✈️','🎸','🧠','⏰','📝','🌟','🔑','🎓','🍎','🚴','🏔️','📷'];
const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f59e0b','#10b981','#0ea5e9','#06b6d4','#a855f7','#eab308'];

let unsubs = [];

export async function PlannerView({ container, parts }) {
  const horizonKey = parts[1] || 'monthly';
  const meta = HORIZONS[horizonKey];
  if (!meta) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🧭</div><p>افق زمانی یافت نشد</p></div>`;
    return;
  }

  const plan = State.getPlans().find(p => p.horizon === horizonKey);

  if (!plan) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🧭</div><p>برنامه یافت نشد</p></div>`;
    return;
  }

  render();

  function render() {
    const progress = planProgress(plan);
    const filter = State.ui.filter;
    const search = State.ui.searchTerm.trim();

    let goals = plan.goals;
    if (filter === 'active') goals = goals.filter(g => g.status !== 'completed');
    if (filter === 'done')   goals = goals.filter(g => g.status === 'completed');
    if (search) {
      const q = search.toLowerCase();
      goals = goals.filter(g =>
        g.title.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q)
      );
    }

    container.innerHTML = `
      <div class="planner-header anim-in">
        <div class="planner-title">
          <div class="planner-icon" style="background:${hexA(meta.color,0.15)};">${plan.icon}</div>
          <div>
            <h1>${plan.title}</h1>
            <p>${plan.description || meta.tag}</p>
          </div>
        </div>
        <div class="planner-toolbar">
          <div class="filter-tabs" id="filter-tabs">
            <button class="filter-tab ${filter === 'all' ? 'active' : ''}" data-f="all">همه</button>
            <button class="filter-tab ${filter === 'active' ? 'active' : ''}" data-f="active">فعال</button>
            <button class="filter-tab ${filter === 'done' ? 'active' : ''}" data-f="done">انجام‌شده</button>
          </div>
          <input class="input" id="search" placeholder="جستجو…" style="width:180px;" value="${esc(search)}" />
          <button class="btn btn-primary" id="btn-add">
            <span>+</span><span>افزودن</span>
          </button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;margin-bottom:24px;">
        <div>
          <div class="progress-bar"><div class="progress-fill" style="width:${progress}%;background:linear-gradient(90deg,${meta.color},${shade(meta.color,0.15)});"></div></div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:var(--fs-sm);color:var(--text-muted);">
            <span>${toFa(plan.goals.filter(g=>g.status==='completed').length)} هدف انجام‌شده</span>
            <span>${toFa(progress)}٪ پیشرفت کل</span>
          </div>
        </div>
        ${ProgressRing({ percent: progress, size: 72, stroke: 6, color: meta.color })}
      </div>

      <div class="goal-list stagger" id="goal-list"></div>
    `;

    // رندر اهداف
    const list = container.querySelector('#goal-list');
    if (goals.length === 0) {
      list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">${plan.icon}</div>
        <div class="empty-title">هنوز هدفی ثبت نشده</div>
        <div class="empty-desc">اولین قدم را بردار — یک هدف کوچک برای «${plan.title}» اضافه کن.</div>
        <button class="btn btn-primary" id="btn-add-empty"><span>+</span><span>افزودن اولین هدف</span></button>
      </div>`;
      list.querySelector('#btn-add-empty').onclick = () => goalModal(plan);
    } else {
      for (const g of goals) list.appendChild(goalCard(g, plan));
    }

    // رویدادها
    container.querySelector('#btn-add').onclick = () => goalModal(plan);
    container.querySelectorAll('[data-f]').forEach(b => {
      b.onclick = () => {
        State.updateUI({ filter: b.dataset.f });
        render();
      };
    });
    const searchEl = container.querySelector('#search');
    searchEl.oninput = (e) => {
      State.updateUI({ searchTerm: e.target.value });
      render();
      // حفظ فوکوس
      const s = container.querySelector('#search');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    };
  }

  function goalCard(goal, plan) {
    const pr = goalProgress(goal);
    const pm = priorityMeta(goal.priority);
    const isDone = goal.status === 'completed';

    const card = document.createElement('div');
    card.className = 'goal-card' + (isDone ? ' done' : '');
    card.innerHTML = `
      <div class="goal-head">
        <div class="goal-check ${isDone ? 'checked' : ''}" data-toggle>${isDone ? '✓' : ''}</div>
        <div style="flex:1;min-width:0;">
          <div class="goal-title">${esc(goal.title)}</div>
          ${goal.description ? `<div class="goal-desc">${esc(goal.description)}</div>` : ''}
        </div>
      </div>
      <div class="goal-meta">
        <span class="chip" title="اولویت" style="color:${pm.color};border-color:${hexA(pm.color.replace('var(--ink-500)','#52526a'),0.3)};">
          ${pm.icon} ${pm.label}
        </span>
        ${goal.dueDate ? `<span class="chip">📅 ${faDate(goal.dueDate)}</span>` : ''}
        ${pr > 0 && !isDone ? `<span class="chip info">${toFa(pr)}٪</span>` : ''}
        ${isDone ? `<span class="chip success">✓ انجام شد</span>` : ''}
        <div class="goal-actions">
          <button class="goal-action" data-edit title="ویرایش">✎</button>
          <button class="goal-action danger" data-del title="حذف">🗑</button>
        </div>
      </div>
    `;

    card.querySelector('[data-toggle]').onclick = () => {
      State.toggleGoal(plan.id, goal.id);
      persist();
      render();
      if (!isDone) Toast.success('هدف انجام شد 🎉');
    };
    card.querySelector('[data-edit]').onclick = () => goalModal(plan, goal);
    card.querySelector('[data-del]').onclick = async () => {
      const ok = await Modal.confirm({
        title: 'حذف هدف',
        message: `آیا از حذف «${esc(goal.title)}» مطمئن هستید؟`,
        confirmText: 'حذف',
        danger: true,
      });
      if (ok) {
        State.removeGoal(plan.id, goal.id);
        persist();
        render();
        Toast.success('هدف حذف شد');
      }
    };
    return card;
  }
}

/** مودال افزودن/ویرایش هدف */
export function goalModal(plan, goal = null) {
  if (!plan) {
    // پیدا کردن پلن پیش‌فرض ماهانه
    plan = State.getPlans().find(p => p.horizon === 'monthly') || State.getPlans()[0];
    if (!plan) {
      Toast.warning('ابتدا یک برنامه بسازید');
      return;
    }
  }
  const isEdit = !!goal;
  const draft = goal || createGoal({});

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="field">
      <label class="field-label">عنوان هدف *</label>
      <input class="input" id="f-title" placeholder="مثلاً: پیاده‌روی روزانه ۳۰ دقیقه" value="${esc(draft.title)}" />
    </div>
    <div class="field">
      <label class="field-label">توضیحات</label>
      <textarea class="textarea" id="f-desc" placeholder="جزئیات بیشتر…">${esc(draft.description)}</textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="field">
        <label class="field-label">اولویت</label>
        <select class="select" id="f-priority">
          <option value="low"    ${draft.priority==='low'?'selected':''}>کم</option>
          <option value="medium" ${draft.priority==='medium'?'selected':''}>متوسط</option>
          <option value="high"   ${draft.priority==='high'?'selected':''}>زیاد</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">تاریخ سررسید</label>
        <input class="input" id="f-due" type="date" value="${draft.dueDate ? draft.dueDate.slice(0,10) : ''}" />
      </div>
    </div>
    <div class="field">
      <label class="field-label">پیشرفت (٪)</label>
      <input class="input" id="f-progress" type="number" min="0" max="100" value="${draft.progress || 0}" />
    </div>
    <div class="field">
      <label class="field-label">افزودن به برنامه</label>
      <select class="select" id="f-plan">
        ${State.getPlans().map(p => `
          <option value="${p.id}" ${p.id===plan.id?'selected':''}>${p.icon} ${p.title}</option>
        `).join('')}
      </select>
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost';
  cancel.textContent = 'انصراف';
  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.textContent = isEdit ? 'ذخیره تغییرات' : 'افزودن هدف';
  footer.appendChild(cancel);
  footer.appendChild(save);

  const wrap = document.createElement('div');
  wrap.appendChild(body);
  wrap.appendChild(footer);

  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">${isEdit ? 'ویرایش هدف' : 'هدف جدید'}</div>
        <button class="btn-icon" data-close>✕</button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    </div>
  `;
  backdrop.querySelector('.modal-body').appendChild(body);
  backdrop.querySelector('.modal-footer').appendChild(footer);
  root.appendChild(backdrop);

  const close = () => {
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 180);
  };
  cancel.onclick = close;
  backdrop.querySelector('[data-close]').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  save.onclick = async () => {
    const title = body.querySelector('#f-title').value.trim();
    if (!title) { Toast.warning('عنوان هدف را وارد کنید'); return; }

    const patch = {
      title,
      description: body.querySelector('#f-desc').value.trim(),
      priority: body.querySelector('#f-priority').value,
      dueDate: body.querySelector('#f-due').value || null,
      progress: Math.max(0, Math.min(100, Number(body.querySelector('#f-progress').value) || 0)),
    };
    const targetPlanId = body.querySelector('#f-plan').value;

    if (isEdit) {
      // اگر برنامه عوض شده، حذف از قبلی و افزودن به جدید
      if (targetPlanId !== plan.id) {
        State.removeGoal(plan.id, goal.id);
        State.addGoal(targetPlanId, { ...goal, ...patch });
      } else {
        State.updateGoal(plan.id, goal.id, patch);
      }
    } else {
      State.addGoal(targetPlanId, createGoal(patch));
    }

    const { Storage } = await import('../services/storage.js');
    await Storage.save(State.snapshot());

    Toast.success(isEdit ? 'هدف ویرایش شد' : 'هدف اضافه شد');
    close();
    // رفرش نما
    Router.handle();
  };

  setTimeout(() => body.querySelector('#f-title')?.focus(), 80);
}

async function persist() {
  const { Storage } = await import('../services/storage.js');
  await Storage.save(State.snapshot());
}

function hexA(hex, alpha) {
  const c = hex.replace('#', '');
  const n = parseInt(c, 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
function shade(hex, amt) {
  const c = hex.replace('#','');
  const n = parseInt(c, 16);
  let r = (n >> 16) + Math.round(255 * amt);
  let g = ((n >> 8) & 0xff) + Math.round(255 * amt);
  let b = (n & 0xff) + Math.round(255 * amt);
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}