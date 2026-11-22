/**
 * لایه‌ی داده: نسخه‌ی Supabase (REST + Auth) و نسخه‌ی نمایشی (localStorage).
 * هر دو یک رابط مشترک دارند تا بقیه‌ی برنامه از جزئیات بی‌خبر باشد.
 */
import { CONFIG } from './config.js';
import { seedDemoDb } from './demo-data.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const NET_TIMEOUT = 8000;

/** fetch با مهلت مشخص؛ اگر شبکه در دسترس نباشد سریع شکست می‌خورد. */
async function fetchWithTimeout(url, options = {}, ms = NET_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ApiError('زمان پاسخ سرور به پایان رسید. اتصال اینترنت را بررسی کنید.', { code: 'NETWORK' });
    }
    throw new ApiError('اتصال به سرور برقرار نشد. اینترنت یا فیلترشکن را بررسی کنید.', { code: 'NETWORK' });
  } finally {
    clearTimeout(timer);
  }
}

export function isMissingTable(err) {
  return (
    err?.code === 'PGRST205' ||
    err?.code === '42P01' ||
    err?.code === 'PGRST202' ||
    /relation .* does not exist|schema cache|could not find the table/i.test(err?.message || '')
  );
}

const NUMERIC_FIELDS = new Set([
  'weight', 'start_weight', 'promised_weight', 'target_bmi', 'height_cm',
  'birth_year', 'measure_hour', 'amount', 'chance', 'promise_kg',
  'final_weight', 'prize_pool', 'fee', 'seed', 'won', 'compliant', 'paid',
]);

export function coerceRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'string' && value !== '' && NUMERIC_FIELDS.has(key) && /^-?\d+(\.\d+)?$/.test(value)) {
      out[key] = Number(value);
    }
  }
  return out;
}

/* =================================================================== */
/*                             Supabase                                */
/* =================================================================== */

const SESSION_KEY = 'tarazoo.session.v2';

export function createSupabaseDb() {
  const base = CONFIG.supabaseUrl.replace(/\/$/, '');
  const key = CONFIG.supabaseKey;
  let session = readSession();

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveSession(next) {
    session = next;
    try {
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* حافظه در دسترس نیست */
    }
  }

  async function authRequest(path, { method = 'POST', body } = {}) {
    const res = await fetchWithTimeout(`${base}/auth/v1${path}`, {
      method,
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const message = data?.msg || data?.error_description || data?.message || data?.error || 'خطا در احراز هویت';
      throw new ApiError(translateAuthError(message, data), {
        status: res.status,
        code: data?.error_code || data?.code || '',
        details: data,
      });
    }
    return data;
  }

  function applySession(payload) {
    if (!payload?.access_token) return null;
    const next = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
      user: payload.user,
    };
    saveSession(next);
    return next;
  }

  async function refreshIfNeeded() {
    if (!session) return null;
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at - 90 > now) return session;
    if (!session.refresh_token) {
      saveSession(null);
      return null;
    }
    try {
      const data = await authRequest(`/token?grant_type=refresh_token`, {
        body: { refresh_token: session.refresh_token },
      });
      return applySession(data);
    } catch {
      saveSession(null);
      return null;
    }
  }

  async function restRequest(path, { method = 'GET', body, headers = {}, prefer } = {}) {
    await refreshIfNeeded();
    const token = session?.access_token || key;
    const res = await fetchWithTimeout(`${base}/rest/v1${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      throw new ApiError(
        data?.message || data?.hint || data?.details || 'خطا در ارتباط با پایگاه‌داده',
        { status: res.status, code: data?.code || '', details: data },
      );
    }
    return data;
  }

  function queryString({ select = '*', eq = {}, order, limit, onConflict } = {}) {
    const params = new URLSearchParams();
    params.set('select', select);
    for (const [col, value] of Object.entries(eq || {})) {
      if (value === undefined || value === null) continue;
      params.append(col, `eq.${value}`);
    }
    if (order) params.set('order', order);
    if (limit) params.set('limit', String(limit));
    if (onConflict) params.set('on_conflict', onConflict);
    return params.toString();
  }

  return {
    kind: 'supabase',

    async probe() {
      await restRequest(`/${CONFIG.prefix}rounds?select=id&limit=1`);
      return true;
    },

    getSession: () => session?.user || null,

    async signIn(email, password) {
      const data = await authRequest('/token?grant_type=password', { body: { email, password } });
      applySession(data);
      return data.user;
    },

    async signUp(email, password, metadata = {}) {
      const data = await authRequest('/signup', {
        body: { email, password, data: metadata },
      });
      if (data?.access_token) applySession(data);
      return { user: data?.user || null, needsConfirm: !data?.access_token };
    },

    async signOut() {
      try {
        if (session?.access_token) {
          await fetch(`${base}/auth/v1/logout`, {
            method: 'POST',
            headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
          });
        }
      } catch {
        /* نادیده بگیر */
      }
      saveSession(null);
    },

    async select(table, opts = {}) {
      const rows = await restRequest(`/${table}?${queryString(opts)}`);
      return (rows || []).map(coerceRow);
    },

    async insert(table, row) {
      const rows = await restRequest(`/${table}`, {
        method: 'POST',
        body: Array.isArray(row) ? row : [row],
        prefer: 'return=representation',
      });
      return (rows || []).map(coerceRow);
    },

    async upsert(table, row, onConflict) {
      const rows = await restRequest(`/${table}?${queryString({ onConflict })}`, {
        method: 'POST',
        body: Array.isArray(row) ? row : [row],
        prefer: 'resolution=merge-duplicates,return=representation',
      });
      return (rows || []).map(coerceRow);
    },

    async update(table, patch, eq) {
      const rows = await restRequest(`/${table}?${queryString({ eq })}`, {
        method: 'PATCH',
        body: patch,
        prefer: 'return=representation',
      });
      return (rows || []).map(coerceRow);
    },

    async remove(table, eq) {
      await restRequest(`/${table}?${queryString({ eq })}`, { method: 'DELETE' });
      return true;
    },
  };
}

function translateAuthError(message, data) {
  const map = [
    [/invalid login credentials/i, 'ایمیل یا رمز عبور اشتباه است.'],
    [/email not confirmed/i, 'ایمیل شما هنوز تأیید نشده است. صندوق ایمیل را بررسی کنید.'],
    [/user already registered/i, 'این ایمیل قبلاً ثبت‌نام کرده است. وارد شوید.'],
    [/password should be at least/i, 'رمز عبور باید حداقل ۶ کاراکتر باشد.'],
    [/unable to validate email address/i, 'ایمیل معتبر نیست.'],
    [/email rate limit/i, 'تعداد تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید.'],
    [/signups? not allowed/i, 'ثبت‌نام در این پروژه غیرفعال است.'],
  ];
  for (const [re, fa] of map) if (re.test(message)) return fa;
  return message || data?.message || 'خطای ناشناخته';
}

/* =================================================================== */
/*                        نسخه‌ی نمایشی (Demo)                          */
/* =================================================================== */

const DEMO_KEY = 'tarazoo.demo.v5';
const DEMO_SESSION = 'tarazoo.demo.session.v5';

export function createDemoDb() {
  let db;
  db = load();

  function load() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.version === 5) return parsed;
      }
    } catch {
      /* داده‌ی خراب را بازنویسی می‌کنیم */
    }
    const fresh = seedDemoDb();
    persist(fresh);
    return fresh;
  }

  function persist(next = db) {
    db = next;
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const table = (name) => {
    if (!db.tables[name]) db.tables[name] = [];
    return db.tables[name];
  };

  function applyEq(rows, eq = {}) {
    return rows.filter((row) =>
      Object.entries(eq || {}).every(([key, value]) => value === undefined || value === null || String(row[key]) === String(value)),
    );
  }

  return {
    kind: 'demo',

    async probe() { return true; },

    getSession() {
      try {
        const id = localStorage.getItem(DEMO_SESSION);
        if (!id) return null;
        return db.users.find((u) => u.id === id) || null;
      } catch {
        return null;
      }
    },

    async signIn(email, password) {
      const user = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase().trim());
      if (!user || user.password !== password) {
        throw new ApiError('ایمیل یا رمز عبور اشتباه است.', { status: 400 });
      }
      localStorage.setItem(DEMO_SESSION, user.id);
      return { id: user.id, email: user.email };
    },

    async signUp(email, password, metadata = {}) {
      const clean = String(email).toLowerCase().trim();
      if (db.users.some((u) => u.email === clean)) {
        throw new ApiError('این ایمیل قبلاً ثبت‌نام کرده است.', { status: 400 });
      }
      if (String(password).length < 6) {
        throw new ApiError('رمز عبور باید حداقل ۶ کاراکتر باشد.', { status: 400 });
      }
      const user = { id: uidLocal(), email: clean, password, name: metadata.full_name || '' };
      db.users.push(user);
      persist();
      localStorage.setItem(DEMO_SESSION, user.id);
      return { user: { id: user.id, email: clean }, needsConfirm: false };
    },

    async signOut() {
      localStorage.removeItem(DEMO_SESSION);
    },

    async select(name, { eq = {}, order, limit } = {}) {
      let rows = applyEq(table(name), eq).map((r) => ({ ...r }));
      if (order) {
        const [col, dir] = order.split('.');
        rows.sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          const cmp = av > bv ? 1 : av < bv ? -1 : 0;
          return dir === 'desc' ? -cmp : cmp;
        });
      }
      if (limit) rows = rows.slice(0, limit);
      return rows;
    },

    async insert(name, row) {
      const list = table(name);
      const rows = (Array.isArray(row) ? row : [row]).map((r) => {
        const item = { id: r.id || uidLocal(), created_at: r.created_at || new Date().toISOString(), ...r };
        if (!item.id) item.id = uidLocal();
        list.push(item);
        return { ...item };
      });
      persist();
      return rows;
    },

    async upsert(name, row, onConflict) {
      const list = table(name);
      const rows = (Array.isArray(row) ? row : [row]).map((r) => {
        const keys = String(onConflict || 'id').split(',').map((s) => s.trim());
        const existing = list.find((item) => keys.every((k) => String(item[k]) === String(r[k]) && r[k] !== undefined));
        if (existing) {
          Object.assign(existing, r, { id: existing.id });
          return { ...existing };
        }
        const item = { id: r.id || uidLocal(), created_at: r.created_at || new Date().toISOString(), ...r };
        list.push(item);
        return { ...item };
      });
      persist();
      return rows;
    },

    async update(name, patch, eq) {
      const list = table(name);
      const matched = applyEq(list, eq);
      matched.forEach((row) => Object.assign(row, patch));
      persist();
      return matched.map((r) => ({ ...r }));
    },

    async remove(name, eq) {
      const list = table(name);
      const keep = list.filter((row) => !applyEq([row], eq).length);
      db.tables[name] = keep;
      persist();
      return true;
    },

    reset() {
      const fresh = seedDemoDb();
      localStorage.removeItem(DEMO_SESSION);
      persist(fresh);
    },
  };
}

let localCounter = 0;
function uidLocal() {
  localCounter += 1;
  const rand = Math.random().toString(16).slice(2, 10);
  return `d-${Date.now().toString(16)}-${localCounter}-${rand}`;
}
