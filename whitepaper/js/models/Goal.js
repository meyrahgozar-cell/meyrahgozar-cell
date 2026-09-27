/* ============================================================
   کاغذ سفید — مدل هدف
   ============================================================ */

import { uid } from '../core/utils.js';

export const GOAL_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PAUSED: 'paused',
};

export const GOAL_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

export function createGoal(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id || uid('goal'),
    title: data.title || '',
    description: data.description || '',
    status: data.status || GOAL_STATUS.ACTIVE,
    priority: data.priority || GOAL_PRIORITY.MEDIUM,
    progress: typeof data.progress === 'number' ? data.progress : 0,
    tags: Array.isArray(data.tags) ? data.tags : [],
    dueDate: data.dueDate || null,
    completedAt: data.completedAt || null,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
    notes: data.notes || '',
  };
}

export function goalProgress(goal) {
  if (goal.status === GOAL_STATUS.COMPLETED) return 100;
  if (goal.subtasks.length) {
    const done = goal.subtasks.filter(t => t.done).length;
    return Math.round((done / goal.subtasks.length) * 100);
  }
  return goal.progress || 0;
}

export function priorityMeta(p) {
  return {
    low:    { label: 'کم',    color: 'var(--ink-500)', icon: '▽' },
    medium: { label: 'متوسط', color: 'var(--sky-400)', icon: '◆' },
    high:   { label: 'زیاد',  color: 'var(--rose-400)', icon: '▲' },
  }[p] || { label: 'متوسط', color: 'var(--sky-400)', icon: '◆' };
}