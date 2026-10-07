import { CONFIG } from './config.js';
const UKEY = CONFIG.storageKeys.user;

export function saveUser(member, remember) {
  const payload = {
    id: member.id,
    first_name: member.first_name,
    last_name: member.last_name,
    national_id: member.national_id,
    cooperative: member.cooperative,
    membership_status: member.membership_status
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
  location.href = 'index.html';
}

export function requireAuth() {
  const u = getUser();
  if (!u) { location.replace('index.html'); return null; }
  return u;
}