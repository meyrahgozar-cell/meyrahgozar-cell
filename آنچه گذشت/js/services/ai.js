/**
 * اصلاح متن با هوش مصنوعی از طریق تابع لبهٔ Supabase.
 * مدل واقعیِ برگردانده‌شده ذخیره می‌شود تا با رأی کاربر، مدل‌های بهتر شناخته شوند.
 */
import { AI_LEVELS, CONFIG } from '../config.js';
import { state } from '../state.js';

const RUNS_KEY = 'reel.ai.runs.v1';
const MAX_LOCAL_RUNS = 400;

export const LEVELS = AI_LEVELS;

export class AiError extends Error {
  constructor(message, code = 'ai-error') {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

const FA_ERRORS = {
  notDeployed: 'سرویس هوش مصنوعی هنوز مستقر نشده است. تابع diary را در Supabase اجرا کن (راهنما در تنظیمات ← هوش مصنوعی).',
  noKey: 'کلید OPENROUTER در Supabase تنظیم نشده است.',
  empty: 'متنی برای اصلاح پیدا نشد. اول چند جمله بنویس.',
  offline: 'برای اصلاح متن به اینترنت نیاز است.',
  busy: 'مدل‌های رایگان الان شلوغ‌اند. چند لحظه بعد دوباره امتحان کن.',
};

function headers() {
  return {
    'Content-Type': 'application/json',
    apikey: CONFIG.supabaseKey,
    Authorization: `Bearer ${state.session?.access_token || CONFIG.supabaseKey}`,
    'x-client-info': 'reel-web/1.0',
  };
}

/** رونوشت متن را به یک درخواست کامل تبدیل می‌کند. */
export async function correct({ text, level = 1, model = '' }) {
  const body = String(text || '').trim();
  if (!body) throw new AiError(FA_ERRORS.empty, 'empty');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new AiError(FA_ERRORS.offline, 'offline');

  const payload = {
    text: body,
    level: Number(level) || 1,
    model: model || CONFIG.ai.freeModel,
    language: 'fa',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  let res;
  try {
    res = await fetch(CONFIG.ai.endpoint, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    throw new AiError(err.name === 'AbortError' ? FA_ERRORS.busy : FA_ERRORS.offline, 'network');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    if (/OPENROUTER|api key|unauthor/i.test(String(msg))) throw new AiError(FA_ERRORS.noKey, 'no-key');
    if (res.status === 429) throw new AiError(FA_ERRORS.busy, 'busy');
    throw new AiError(String(msg), 'http');
  }

  const corrected = data?.text || data?.corrected || data?.result || data?.output || '';
  if (!corrected || typeof corrected !== 'string' || /^Hello\s/i.test(corrected)) {
    // تابع پیش‌فرض Supabase فقط «Hello undefined!» برمی‌گرداند.
    throw new AiError(FA_ERRORS.notDeployed, 'not-deployed');
  }

  return {
    text: corrected.trim(),
    model: data?.model || data?.model_used || payload.model,
    level: Number(level) || 1,
    usage: data?.usage || null,
  };
}

/* ── ذخیره‌سازی اجراها ─────────────────────────────────────── */

export function readRuns() {
  try {
    const list = JSON.parse(localStorage.getItem(RUNS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function writeRuns(list) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(list.slice(0, MAX_LOCAL_RUNS)));
  } catch { /* حافظه پر است — رأی‌ها می‌مانند، تاریخچه کوتاه می‌شود */ }
}

/** یک اجرا را روی دستگاه (و در صورت امکان در ابر) ذخیره می‌کند. */
export async function saveRun({ entryId = null, level, model, original, result, feedback = 0 }) {
  const run = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    entry_id: entryId,
    level: Number(level) || 1,
    model: model || CONFIG.ai.freeModel,
    original: String(original || '').slice(0, 4000),
    result: String(result || '').slice(0, 4000),
    feedback,
    created_at: new Date().toISOString(),
  };
  const list = readRuns();
  list.unshift(run);
  writeRuns(list);

  if (state.mode === 'cloud' && state.user) {
    try {
      const { sb } = await import('./client.js');
      await sb.from(CONFIG.tables.aiRuns).insert({
        id: run.id,
        user_id: state.user.id,
        entry_id: entryId,
        level: run.level,
        model: run.model,
        feedback,
        original: run.original,
        result: run.result,
        created_at: run.created_at,
      });
    } catch (err) {
      console.warn('[ai] cloud save skipped', err?.message || err);
    }
  }
  return run;
}

/** رأی مثبت یا منفی به مدلِ یک اجرا. */
export async function setFeedback(runId, value) {
  const list = readRuns();
  const run = list.find((r) => r.id === runId);
  if (!run) return null;
  run.feedback = value;
  writeRuns(list);

  if (state.mode === 'cloud' && state.user) {
    try {
      const { sb } = await import('./client.js');
      await sb.from(CONFIG.tables.aiRuns).update({ feedback: value }).eq('id', runId);
    } catch { /* آفلاین یا جدول هنوز ساخته نشده */ }
  }
  return run;
}

/** آمار هر مدل: تعداد رأی مثبت، منفی و امتیاز. */
export function modelStats() {
  const map = new Map();
  readRuns().forEach((r) => {
    const key = r.model || CONFIG.ai.freeModel;
    if (!map.has(key)) map.set(key, { model: key, up: 0, down: 0, total: 0 });
    const row = map.get(key);
    row.total += 1;
    if (r.feedback > 0) row.up += 1;
    if (r.feedback < 0) row.down += 1;
  });
  return [...map.values()]
    .map((m) => ({ ...m, score: m.up - m.down, rated: m.up + m.down }))
    .sort((a, b) => b.score - a.score || b.rated - a.rated || b.total - a.total);
}

export function lastRunFor(entryId) {
  return readRuns().find((r) => r.entry_id === entryId) || null;
}

export function clearRuns() {
  writeRuns([]);
}
