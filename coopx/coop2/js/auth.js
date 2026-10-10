import { rpc, getSession, saveSession, clearSession, updateSessionUser, goLogin } from './api.js';

const ROOT = new URL('../', import.meta.url).href;

export const isAdmin = (u) => !!u && (u.role === 'admin' || u.role === 'superadmin');
export const isSuper = (u) => !!u && u.role === 'superadmin';

export async function login(nationalId, password, remember) {
  const r = await rpc('app_login', { p_national_id: nationalId, p_password: password, p_remember: !!remember }, { auth: false });
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'error', retryAfter: r && r.retry_after };
  saveSession({ token: r.token, expires_at: r.expires_at, user: r.user }, remember);
  return { ok: true, user: r.user };
}

export function getUser() {
  const s = getSession();
  return s ? s.user : null;
}

export async function logout() {
  try { await rpc('app_logout'); } catch {}
  clearSession();
  location.href = ROOT + 'index.html';
}

export function requireAuth() {
  const u = getUser();
  if (!u) { goLogin(); return null; }
  return u;
}

// min: 'admin' | 'superadmin'
export function requireRole(min = 'admin') {
  const u = requireAuth();
  if (!u) return null;
  if (min === 'superadmin' ? !isSuper(u) : !isAdmin(u)) { location.replace(ROOT + 'dashboard.html'); return null; }
  return u;
}

// Re-read the member from the server (roles can change while a session is open)
export async function refreshUser() {
  const u = await rpc('app_me');
  updateSessionUser(u);
  return u;
}
