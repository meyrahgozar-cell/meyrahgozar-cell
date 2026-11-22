/**
 * لایه‌ی داده: نسخه‌ی Supabase (REST + Auth) و نسخه‌ی نمایشی (localStorage).
 * هر دو یک رابط مشترک دارند تا بقیه‌ی برنامه از جزئیات بی‌خبر باشد.
 */
import { CONFIG } from './config.js';

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
  'weight', 'weight_kg', 'start_weight', 'promised_weight', 'height_cm',
  'age_years', 'measure_hour', 'amount', 'chance', 'promise_kg',
  'final_weight', 'value', 'score',
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

const SESSION_KEY = 'weightchallenge.session.v1';

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
      await restRequest(`/${CONFIG.tables.pledges}?select=id&limit=1`);
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
