/* ============================================================
   کاغذ سفید — لایه GitHub API (نسخه اصلاح‌شده)
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
    // صف نوشتن — همه نوشتن‌ها به ترتیب اجرا می‌شوند
    this._queue = Promise.resolve();
  }

  get rawUrl() {
    return `${RAW}/${this.owner}/${this.repo}/${this.branch}/${this.path}`;
  }

  get apiUrl() {
    return `${API}/repos/${this.owner}/${this.repo}/contents/${this.path}`;
  }

  /** خواندن فایل */
  async read() {
    try {
      const res = await fetch(this.rawUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (_) { /* ادامه */ }

    const token = Auth.getToken();
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(this.apiUrl + '?t=' + Date.now(), { headers, cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 404) throw new Error('فایل داده یافت نشد');
      if (res.status === 401) throw new Error('توکن نامعتبر است');
      throw new Error(`خطای خواندن: ${res.status}`);
    }
    const data = await res.json();
    const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    return JSON.parse(decoded);
  }

  /**
   * نوشتن فایل — به صورت سریالی از طریق صف
   * همه فراخوانی‌ها به ترتیب اجرا می‌شوند و از ۴۰۹ جلوگیری می‌شود.
   */
  write(payload, message = 'به‌روزرسانی کاغذ سفید') {
    const task = () => this._writeOnce(payload, message, true);
    // زنجیره صف: هر تسک بعد از تسک قبلی
    const result = this._queue.then(task, task);
    // جلوگیری از شکستن صف در صورت خطا
    this._queue = result.catch(() => {});
    return result;
  }

  /** نوشتن واقعی با دریافت تازه SHA */
  async _writeOnce(payload, message, allowRetry) {
    const token = Auth.getToken();
    if (!token) throw new Error('توکن GitHub تنظیم نشده است');

    // ۱. دریافت تازه‌ی SHA دقیقاً قبل از نوشتن
    let sha = null;
    const head = await fetch(this.apiUrl + '?t=' + Date.now(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      },
      cache: 'no-store',
    });

    if (head.ok) {
      const info = await head.json();
      sha = info.sha;
    } else if (head.status === 401) {
      throw new Error('توکن نامعتبر است');
    } else if (head.status !== 404) {
      throw new Error(`خطا در خواندن فایل فعلی: ${head.status}`);
    }

    // ۲. رمزگذاری محتوا
    const json = JSON.stringify(payload, null, 2);
    const content = btoa(unescape(encodeURIComponent(json)));

    const body = {
      message,
      content,
      branch: this.branch,
      ...(sha && { sha }),
    };

    // ۳. نوشتن
    const res = await fetch(this.apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // ۴. اگر ۴۰۹ خورد (کسی دیگر بین کار ما نوشت) → یک بار دیگر تلاش کن
    if (res.status === 409 && allowRetry) {
      await new Promise(r => setTimeout(r, 500));
      return this._writeOnce(payload, message, false);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `خطای نوشتن: ${res.status}`);
    }

    return res.json();
  }

  /** تست اتصال */
  async ping() {
    try {
      const res = await fetch(this.rawUrl + '?t=' + Date.now(), { cache: 'no-store' });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

/* نمونه پیش‌فرض */
export const defaultGitHub = new GitHubAPI({
  owner: 'meyrahgozar-cell',
  repo: 'meyrahgozar-cell',
  branch: 'main',
  path: 'whitepaper/data.json',
});