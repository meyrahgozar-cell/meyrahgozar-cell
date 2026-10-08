import { CONFIG } from './config.js';
const UKEY = CONFIG.storageKeys.user;
// Project root, independent of how deep the current page is (e.g. /admin/import.html)
const ROOT = new URL('../', import.meta.url).href;

export function saveUser(member, remember) {
  const payload = {
    id: member.id,
    first_name: member.first_name,
    last_name: member.last_name,
    national_id: member.national_id,
    cooperative: member.cooperative,
    membership_status: member.membership_status,
    role: member.role || 'member',
    email: member.email || null
  };
  try {
    const store = remember ? localStorage : sessionStorage;
    store.setItem(UKEY, JSON.stringify(payload));
    (remember ? sessionStorage : localStorage).removeItem(UKEY);
  } catch {}
}

export function getUser() {
  try {
    const s = sessionStorage.getItem(UKEY) || localStorage.getItem(UKEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function logout() {
  try { localStorage.removeItem(UKEY); sessionStorage.removeItem(UKEY); } catch {}
  location.href = ROOT + 'index.html';
}

export function requireAuth() {
  const u = getUser();
  if (!u) { location.replace(ROOT + 'index.html'); return null; }
  return u;
}

export function isAdmin(user) {
  if (!user) user = getUser();
  if (!user) return false;
  const r = (user.role || '').toLowerCase();
  return r === 'admin' || r === 'superadmin';
}

export function isSuperAdmin(user) {
  if (!user) user = getUser();
  if (!user) return false;
  return (user.role || '').toLowerCase() === 'superadmin';
}

export function requireAdmin() {
  const u = requireAuth();
  if (!u) return null;
  if (!isAdmin(u)) {
    location.replace(ROOT + 'dashboard.html');
    return null;
  }
  return u;
}

export function requireSuperAdmin() {
  const u = requireAuth();
  if (!u) return null;
  if (!isSuperAdmin(u)) {
    location.replace(ROOT + 'dashboard.html');
    return null;
  }
  return u;
}
