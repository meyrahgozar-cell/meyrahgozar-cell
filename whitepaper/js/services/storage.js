/* ============================================================
   کاغذ سفید — لایه ذخیره‌سازی (GitHub + Local)
   ============================================================ */

import { defaultGitHub } from '../core/github.js';
import { Auth } from '../core/auth.js';
import { State } from '../core/state.js';
import { safeParse } from '../core/utils.js';

const LOCAL_KEY = 'kaghaz:data';

export const Storage = {
  /** بارگذاری از LocalStorage */
  loadLocal() {
    const raw = localStorage.getItem(LOCAL_KEY);
    return safeParse(raw, null);
  },

  /** ذخیره در LocalStorage */
  saveLocal(data) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('LocalStorage پر است', e);
      return false;
    }
  },

  /** بارگذاری از GitHub (اگر توکن موجود باشد) */
  async loadRemote() {
    if (!Auth.hasToken()) return null;
    try {
      return await defaultGitHub.read();
    } catch (e) {
      console.warn('GitHub read failed:', e.message);
      return null;
    }
  },

  /** ذخیره در GitHub */
  async saveRemote(data) {
    if (!Auth.hasToken()) throw new Error('توکن تنظیم نشده');
    return await defaultGitHub.write(data, `به‌روزرسانی کاغذ سفید — ${new Date().toISOString()}`);
  },

  /** بارگذاری ترکیبی: اول Local، سپس تلاش GitHub */
  async load() {
    State.updateUI({ syncing: true });
    try {
      const remote = await this.loadRemote();
      if (remote) {
        this.saveLocal(remote);
        State.updateSettings({ lastSyncedAt: new Date().toISOString() });
        return remote;
      }
      const local = this.loadLocal();
      if (local) return local;
      return null;
    } finally {
      State.updateUI({ syncing: false });
    }
  },

  /** ذخیره ترکیبی: ابتدا Local، سپس GitHub در پس‌زمینه */
  async save(data) {
    // ذخیره محلی فوری
    this.saveLocal(data);

    // اگر توکن داریم، به GitHub هم بفرست
    if (Auth.hasToken()) {
      State.updateUI({ syncing: true });
      try {
        await this.saveRemote(data);
        State.updateSettings({ lastSyncedAt: new Date().toISOString() });
        State.updateUI({ syncing: false, lastError: null });
        return { ok: true, synced: true };
      } catch (e) {
        State.updateUI({ syncing: false, lastError: e.message });
        return { ok: true, synced: false, error: e.message };
      }
    }
    return { ok: true, synced: false };
  },

  /** پاکسازی کامل */
  clearLocal() {
    localStorage.removeItem(LOCAL_KEY);
  },

  /** تست اتصال */
  async ping() {
    return await defaultGitHub.ping();
  },

  /** اطلاعات آخرین ذخیره */
  lastLocalSaveAt() {
    const d = this.loadLocal();
    return d?.meta?.updatedAt || null;
  },
};