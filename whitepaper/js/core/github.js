/* ============================================================
   کاغذ سفید — لایه GitHub API
   ============================================================ */

import { Auth } from './auth.js';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

export class GitHubAPI {
  constructor({ owner, repo, branch = 'main', path }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.path = path;
  }

  get rawUrl() {
    return `${RAW}/${this.owner}/${this.repo}/${this.branch}/${this.path}`;
  }

  get apiUrl() {
    return `${API}/repos/${this.owner}/${this.repo}/contents/${this.path}`;
  }

  /** خواندن فایل (بدون نیاز به توکن اگر مخزن عمومی باشد) */
  async read() {
    // تلاش با raw
    try {
      const res = await fetch(this.rawUrl + '?t=' + Date.now());
      if (res.ok) return await res.json();
    } catch (e) { /* ادامه */ }

    // تلاش با API (برای مخزن خصوصی)
    const token = Auth.getToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch(this.apiUrl, { headers });
    if (!res.ok) {
      if (res.status === 404) throw new Error('فایل داده یافت نشد');
      throw new Error(`خطای خواندن: ${res.status}`);
    }
    const data = await res.json();
    const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    return JSON.parse(decoded);
  }

  /** نوشتن فایل (نیاز به توکن) */
  async write(payload, message = 'به‌روزرسانی کاغذ سفید') {
    const token = Auth.getToken();
    if (!token) throw new Error('توکن GitHub تنظیم نشده است');

    // گرفتن SHA فعلی
    let sha = null;
    try {
      const res = await fetch(this.apiUrl, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
      });
      if (res.ok) {
        const data = await res.json();
        sha = data.sha;
      }
    } catch (e) { /* فایل جدید */ }

    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2)))),
      branch: this.branch,
      ...(sha && { sha }),
    };

    const res = await fetch(this.apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `خطای نوشتن: ${res.status}`);
    }
    return res.json();
  }

  /** تست اتصال */
  async ping() {
    try {
      const res = await fetch(this.rawUrl + '?t=' + Date.now());
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

/* نمونه پیش‌فرض برای کاغذ سفید */
export const defaultGitHub = new GitHubAPI({
  owner: 'meyrahgozar-cell',
  repo: 'meyrahgozar-cell',
  branch: 'main',
  path: 'whitepaper/data.json',
});