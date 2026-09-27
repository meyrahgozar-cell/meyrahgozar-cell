/* ============================================================
   کاغذ سفید — لایه ذخیره‌سازی (نسخه اصلاح‌شده)
   ============================================================ */

import { defaultGitHub } from '../core/github.js';
import { Auth } from '../core/auth.js';
import { safeParse } from '../core/utils.js';

const LOCAL_KEY = 'kaghaz:data';

/* ---------- سیستم اطلاع‌رسانی وضعیت همگام‌سازی ---------- */
const statusSubs = new Set();
export function onSyncStatus(fn) {
  statusSubs.add(fn);
  return () => statusSubs.delete(fn);
}
function emitStatus(patch) {
  for (const fn of statusSubs) {
    try { fn(patch); } catch (e) { console.error(e); }
  }
}

export const Storage = {
  _savingPromise: null,   // جلوگیری از save همزمان

  /* ---------- Local ---------- */
  loadLocal() {
    return safeParse(localStorage.getItem(LOCAL_KEY), null);
  },

  saveLocal(data) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('LocalStorage پر است:', e);
      return false;
    }
  },

  /* ---------- Remote ---------- */
  async loadRemote() {
    if (!Auth.hasToken()) return null;
    try {
      return await defaultGitHub.read();
    } catch (e) {
      console.warn('GitHub read failed:', e.message);
      return null;
    }
  },

  async saveRemote(data) {
    if (!Auth.hasToken()) throw new Error('توکن تنظیم نشده');
    return defaultGitHub.write(
      data,
      `به‌روزرسانی کاغذ سفید — ${new Date().toISOString()}`
    );
  },

  /* ---------- ترکیبی ---------- */
  async load() {
    emitStatus({ syncing: true, error: null });
    try {
      const remote = await this.loadRemote();
      if (remote) {
        this.saveLocal(remote);
        emitStatus({ syncing: false, error: null, lastSyncedAt: new Date().toISOString() });
        return remote;
      }
      return this.loadLocal();
    } finally {
      emitStatus({ syncing: false });
    }
  },

  /**
   * ذخیره — با قفل ضد-همزمانی
   * اگر در حال ذخیره باشیم، همان promise برگردانده می‌شود.
   */
  async save(data) {
    // ذخیره محلی همیشه فوری
    this.saveLocal(data);

    if (!Auth.hasToken()) {
      return { ok: true, synced: false };
    }

    // اگر قبلاً در حال ذخیره هستیم، همان را برگردان
    if (this._savingPromise) return this._savingPromise;

    emitStatus({ syncing: true, error: null });

    this._savingPromise = (async () => {
      try {
        await this.saveRemote(data);
        emitStatus({
          syncing: false,
          error: null,
          lastSyncedAt: new Date().toISOString(),
        });
        return { ok: true, synced: true };
      } catch (e) {
        console.error('Save remote error:', e);
        emitStatus({ syncing: false, error: e.message });
        return { ok: false, synced: false, error: e.message };
      } finally {
        this._savingPromise = null;
      }
    })();

    return this._savingPromise;
  },

  /* ---------- ابزارها ---------- */
  clearLocal() {
    localStorage.removeItem(LOCAL_KEY);
  },

  async ping() {
    return defaultGitHub.ping();
  },

  lastLocalSaveAt() {
    return this.loadLocal()?.meta?.updatedAt || null;
  },
};