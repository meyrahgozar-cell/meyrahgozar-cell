/* ============================================================
   کاغذ سفید — مدیریت وضعیت مرکزی
   ============================================================ */

import { clone } from './utils.js';

const listeners = new Map(); // key -> Set<fn>
let globalListeners = new Set();

export const State = {
  /** داده اصلی اپلیکیشن */
  data: {
    plans: [],
    settings: {
      birthDate: '1995-01-01',
      lifeExpectancy: 85,
      userName: '',
      theme: 'dark',
      lastSyncedAt: null,
      githubTokenSet: false,
    },
    meta: {
      version: 1,
      updatedAt: null,
    },
  },

  /** وضعیت لحظه‌ای UI (persist نمی‌شود) */
  ui: {
    currentRoute: 'dashboard',
    filter: 'all',           // all | active | done
    searchTerm: '',
    syncing: false,
    lastError: null,
    sidebarOpen: false,
  },

  /** اشتراک در تغییرات یک کلید خاص */
  subscribe(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  },

  /** اشتراک در همه تغییرات */
  subscribeAll(fn) {
    globalListeners.add(fn);
    return () => globalListeners.delete(fn);
  },

  /** اطلاع‌رسانی تغییر */
  emit(key, payload) {
    if (listeners.has(key)) {
      for (const fn of listeners.get(key)) {
        try { fn(this.data, payload); } catch (e) { console.error(e); }
      }
    }
    for (const fn of globalListeners) {
      try { fn(key, payload, this.data); } catch (e) { console.error(e); }
    }
  },

  /** جایگزینی کل داده */
  replaceData(newData) {
    this.data = { ...this.data, ...newData };
    this.emit('data', newData);
  },

  /** به‌روزرسانی تنظیمات */
  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.emit('settings', patch);
  },

  /** به‌روزرسانی UI */
  updateUI(patch) {
    this.ui = { ...this.ui, ...patch };
    this.emit('ui', patch);
  },

  /** ---------- عملیات پلن‌ها ---------- */

  getPlans() { return this.data.plans; },

  getPlan(id) { return this.data.plans.find(p => p.id === id); },

  addPlan(plan) {
    this.data.plans.push(plan);
    this.emit('plans', { type: 'add', plan });
    return plan;
  },

  updatePlan(id, patch) {
    const p = this.getPlan(id);
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: new Date().toISOString() });
    this.emit('plans', { type: 'update', plan: p });
    return p;
  },

  removePlan(id) {
    this.data.plans = this.data.plans.filter(p => p.id !== id);
    this.emit('plans', { type: 'remove', id });
  },

  /** ---------- عملیات اهداف ---------- */

  getGoal(planId, goalId) {
    const p = this.getPlan(planId);
    return p?.goals.find(g => g.id === goalId) || null;
  },

  addGoal(planId, goal) {
    const p = this.getPlan(planId);
    if (!p) return null;
    p.goals.push(goal);
    p.updatedAt = new Date().toISOString();
    this.emit('goals', { type: 'add', planId, goal });
    return goal;
  },

  updateGoal(planId, goalId, patch) {
    const g = this.getGoal(planId, goalId);
    if (!g) return null;
    Object.assign(g, patch, { updatedAt: new Date().toISOString() });
    this.emit('goals', { type: 'update', planId, goal: g });
    return g;
  },

  removeGoal(planId, goalId) {
    const p = this.getPlan(planId);
    if (!p) return;
    p.goals = p.goals.filter(g => g.id !== goalId);
    p.updatedAt = new Date().toISOString();
    this.emit('goals', { type: 'remove', planId, goalId });
  },

  toggleGoal(planId, goalId) {
    const g = this.getGoal(planId, goalId);
    if (!g) return;
    const done = g.status === 'completed';
    g.status = done ? 'active' : 'completed';
    g.completedAt = done ? null : new Date().toISOString();
    g.updatedAt = new Date().toISOString();
    this.emit('goals', { type: 'toggle', planId, goal: g });
    return g;
  },

  /** ---------- آمار ---------- */
  stats() {
    const plans = this.data.plans;
    const allGoals = plans.flatMap(p => p.goals);
    const done = allGoals.filter(g => g.status === 'completed');
    const active = allGoals.filter(g => g.status !== 'completed');
    const overdue = active.filter(g => g.dueDate && new Date(g.dueDate) < new Date());
    return {
      plansCount: plans.length,
      goalsCount: allGoals.length,
      doneCount: done.length,
      activeCount: active.length,
      overdueCount: overdue.length,
      completionRate: allGoals.length ? Math.round((done.length / allGoals.length) * 100) : 0,
    };
  },

  /** خروجی تمیز برای ذخیره */
  snapshot() {
    return clone({
      plans: this.data.plans,
      settings: this.data.settings,
      meta: { ...this.data.meta, updatedAt: new Date().toISOString() },
    });
  },
};