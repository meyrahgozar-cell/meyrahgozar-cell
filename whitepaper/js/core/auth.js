/* ============================================================
   کاغذ سفید — مدیریت توکن GitHub
   ============================================================ */

const TOKEN_KEY = 'kaghaz:github_token';
const USER_KEY  = 'kaghaz:github_user';

export const Auth = {
  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token.trim());
  },
  getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  },
  hasToken() {
    return !!this.getToken();
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  },

  /** بررسی اعتبار توکن */
  async validate(token) {
    if (!token) return { ok: false, error: 'توکن خالی است' };
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
        },
      });
      if (!res.ok) {
        if (res.status === 401) return { ok: false, error: 'توکن نامعتبر است' };
        return { ok: false, error: `خطای ${res.status}` };
      }
      const user = await res.json();
      this.setUser(user);
      return { ok: true, user };
    } catch (e) {
      return { ok: false, error: 'عدم دسترسی به اینترنت' };
    }
  },
};