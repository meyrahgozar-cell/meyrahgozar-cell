/* ============================================================
   کاغذ سفید — مدل برنامه (افق زمانی)
   ============================================================ */

import { uid } from '../core/utils.js';

/** انواع افق‌های زمانی */
export const HORIZONS = {
  daily:   { key: 'daily',   title: 'روزانه',   tag: 'امروز',     icon: '☀️', color: '#f59e0b', days: 1 },
  weekly:  { key: 'weekly',  title: 'هفتگی',   tag: 'این هفته',  icon: '🗓️', color: '#10b981', days: 7 },
  monthly: { key: 'monthly', title: 'ماهانه',  tag: 'این ماه',   icon: '📆', color: '#6366f1', days: 30 },
  quarterly:{key: 'quarterly',title:'سه‌ماهه', tag: 'فصل',       icon: '🍂', color: '#0ea5e9', days: 90 },
  half:    { key: 'half',    title: 'شش‌ماهه', tag: 'نیم‌سال',   icon: '🌗', color: '#8b5cf6', days: 180 },
  yearly:  { key: 'yearly',  title: 'سالانه',  tag: 'امسال',     icon: '🎯', color: '#a855f7', days: 365 },
  y3:      { key: 'y3',      title: 'سه ساله', tag: 'افق میان‌مدت', icon: '🧭', color: '#ec4899', days: 365*3 },
  y5:      { key: 'y5',      title: 'پنج ساله',tag: 'افق بلندمدت', icon: '🚀', color: '#f43f5e', days: 365*5 },
  y10:     { key: 'y10',     title: 'ده ساله', tag: 'چشم‌انداز', icon: '🌌', color: '#06b6d4', days: 365*10 },
  life:    { key: 'life',    title: 'عمر',     tag: 'کل زندگی',  icon: '♾️', color: '#eab308', days: 365*85 },
};

/** فهرست ترتیب‌یافته */
export const HORIZON_ORDER = [
  'daily','weekly','monthly','quarterly','half',
  'yearly','y3','y5','y10','life'
];

export function createPlan(data = {}) {
  const now = new Date().toISOString();
  const h = HORIZONS[data.horizon] || HORIZONS.monthly;
  return {
    id: data.id || uid('plan'),
    horizon: data.horizon || 'monthly',
    title: data.title || h.title,
    description: data.description || '',
    icon: data.icon || h.icon,
    color: data.color || h.color,
    goals: Array.isArray(data.goals) ? data.goals : [],
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    startDate: data.startDate || now,
    endDate: data.endDate || null,
  };
}

export function planProgress(plan) {
  if (!plan.goals?.length) return 0;
  const done = plan.goals.filter(g => g.status === 'completed').length;
  return Math.round((done / plan.goals.length) * 100);
}

/** ساخت خودکار همه افق‌های پیش‌فرض */
export function seedDefaultPlans() {
  return HORIZON_ORDER.map(h => {
    const meta = HORIZONS[h];
    return createPlan({
      horizon: h,
      title: meta.title,
      icon: meta.icon,
      color: meta.color,
      description: defaultDesc(h),
    });
  });
}

function defaultDesc(h) {
  const map = {
    daily:   'کارهای امروز — تمرکز بر یک قدم کوچک',
    weekly:  'برنامه هفته — مرور و اولویت‌بندی',
    monthly: 'اهداف ماه — پیشرفت پایدار',
    quarterly:'چشم‌انداز فصل — بازبینی مسیر',
    half:    'نیم‌سال — تنظیم دقیق اهداف',
    yearly:  'اهداف سال — تصویر بزرگ',
    y3:      'افق سه‌ساله — ساخت پایه‌ها',
    y5:      'افق پنج‌ساله — جهت‌گیری راهبردی',
    y10:     'افق ده‌ساله — چشم‌انداز زندگی',
    life:    'تمام زندگی — مأموریت و میراث',
  };
  return map[h] || '';
}