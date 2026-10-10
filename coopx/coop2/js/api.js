// Thin client for the database functions (PostgREST /rpc). Every call carries the session token.
import { CONFIG } from './config.js';

const SKEY = CONFIG.storageKeys.user;
const ROOT = new URL('../', import.meta.url).href;

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || 'error');
    this.status = status;
    this.code = (body && body.code) || null;
    this.detail = (body && body.details) || null;
    this.hint = (body && body.hint) || null;
  }
}

// ---- session: { token, expires_at, user }
export function getSession() {
  try {
    const raw = sessionStorage.getItem(SKEY) || localStorage.getItem(SKEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.token || !s.user) return null;
    if (s.expires_at && new Date(s.expires_at) <= new Date()) { clearSession(); return null; }
    return s;
  } catch { return null; }
}
export function saveSession(sess, remember) {
  try {
    (remember ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(sess));
    (remember ? sessionStorage : localStorage).removeItem(SKEY);
  } catch {}
}
export function updateSessionUser(user) {
  const s = getSession(); if (!s) return;
  const inLocal = !!localStorage.getItem(SKEY);
  saveSession({ ...s, user }, inLocal);
}
export function clearSession() {
  try { localStorage.removeItem(SKEY); sessionStorage.removeItem(SKEY); } catch {}
}
export function goLogin() {
  if (!/\/(index\.html)?$/.test(location.pathname)) location.replace(ROOT + 'index.html');
}

// requests cut short because the page is being left/reloaded are not errors
let leaving = false;
addEventListener('beforeunload', () => { leaving = true; });
addEventListener('pagehide', () => { leaving = true; });

const baseHeaders = () => {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', apikey: CONFIG.supabaseKey };
  if (/^eyJ/.test(CONFIG.supabaseKey)) h.Authorization = 'Bearer ' + CONFIG.supabaseKey;   // legacy JWT keys only
  return h;
};

export async function rpc(name, args = {}, opts = {}) {
  const sess = opts.auth === false ? null : getSession();
  if (opts.auth !== false && !sess) { goLogin(); throw new ApiError(401, { message: 'unauthorized' }); }
  let res;
  try {
    res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: baseHeaders(),
      body: JSON.stringify(sess ? { p_token: sess.token, ...args } : args),
      signal: opts.signal
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    if (leaving) return new Promise(() => {});
    throw new ApiError(0, { message: 'network' });
  }
  let text;
  try { text = await res.text(); }                    // the body can be cut short too
  catch { if (leaving) return new Promise(() => {}); throw new ApiError(0, { message: 'network' }); }
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) {
    if (res.status === 401 && sess) { clearSession(); goLogin(); }
    throw new ApiError(res.status, data);
  }
  return data;
}
