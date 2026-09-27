/* ============================================================
   کاغذ سفید — تنظیمات
   ============================================================ */

import { State } from '../core/state.js';
import { Auth } from '../core/auth.js';
import { Storage } from '../services/storage.js';
import { defaultGitHub } from '../core/github.js';
import { Toast } from '../components/Toast.js';
import { toFa, faDateTime, prettyBytes, isoDate } from '../core/utils.js';

export async function SettingsView({ container }) {
  const s = State.data.settings;
  const user = Auth.getUser();
  const hasToken = Auth.hasToken();
  const lastSync = s.lastSyncedAt;

  container.innerHTML = `
    <div class="settings-grid anim-in">

      <div class="settings-section">
        <h3>👤 مشخصات شما</h3>
        <div class="field">
          <label class="field-label">نام شما</label>
          <input class="input" id="s-name" placeholder="مثلاً: سارا" value="${s.userName || ''}" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="field">
            <label class="field-label">تاریخ تولد</label>
            <input class="input" id="s-birth" type="date" value="${(s.birthDate||'').slice(0,10)}" />
          </div>
          <div class="field">
            <label class="field-label">امید به زندگی (سال)</label>
            <input class="input" id="s-life" type="number" min="30" max="120" value="${s.lifeExpectancy || 85}" />
          </div>
        </div>
        <button class="btn btn-primary" id="save-profile">ذخیره</button>
      </div>

      <div class="settings-section">
        <h3>☁️ همگام‌سازی با GitHub</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">وضعیت اتصال</div>
            <div class="setting-desc">${hasToken ? (user ? `متصل به عنوان ${user.login}` : 'توکن ذخیره شده') : 'بدون توکن — داده‌ها فقط روی همین دستگاه ذخیره می‌شوند'}</div>
          </div>
          <span class="chip ${hasToken ? 'success' : 'warning'}">${hasToken ? '✓ متصل' : 'آفلاین'}</span>
        </div>

        <div class="field" style="margin-top:16px;">
          <label class="field-label">توکن دسترسی GitHub (Personal Access Token)</label>
          <input class="input" id="s-token" type="password" placeholder="ghp_xxxxxxxxxxxxxxxx" value="${hasToken ? '••••••••••••••••' : ''}" />
          <div class="field-hint">
            از <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">این آدرس</a> یک توکن با دسترسی <code>repo</code> بسازید.
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="save-token">ذخیره توکن</button>
          <button class="btn btn-soft" id="test-conn">تست اتصال</button>
          ${hasToken ? `<button class="btn btn-danger" id="clear-token">حذف توکن</button>` : ''}
        </div>

        <div class="divider"></div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">آدرس مخزن</div>
            <div class="setting-desc" style="font-family:var(--font-mono);direction:ltr;text-align:left;">
              ${defaultGitHub.owner}/${defaultGitHub.repo}/${defaultGitHub.path}
            </div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">آخرین همگام‌سازی</div>
            <div class="setting-desc">${lastSync ? faDateTime(lastSync) : 'هرگز'}</div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>💾 داده‌ها</h3>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">تعداد برنامه‌ها</div>
            <div class="setting-desc">${toFa(State.getPlans().length)} برنامه</div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">حجم داده محلی</div>
            <div class="setting-desc">${prettyBytes(new Blob([JSON.stringify(State.snapshot())]).size)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
          <button class="btn btn-soft" id="export-data">📤 خروجی JSON</button>
          <button class="btn btn-soft" id="import-data">📥 بازگردانی</button>
          <button class="btn btn-danger" id="reset-data">🗑 پاک‌سازی کامل</button>
        </div>
      </div>

    </div>
  `;

  // ---- رویدادها ----
  container.querySelector('#save-profile').onclick = async () => {
    State.updateSettings({
      userName: container.querySelector('#s-name').value.trim(),
      birthDate: container.querySelector('#s-birth').value,
      lifeExpectancy: Number(container.querySelector('#s-life').value) || 85,
    });
    await Storage.save(State.snapshot());
    Toast.success('مشخصات ذخیره شد');
  };

  container.querySelector('#save-token').onclick = async () => {
    const val = container.querySelector('#s-token').value.trim();
    if (!val || val.startsWith('••')) {
      Toast.warning('توکن جدید وارد کنید');
      return;
    }
    Toast.info('در حال بررسی توکن…');
    const res = await Auth.validate(val);
    if (!res.ok) { Toast.error(res.error || 'توکن نامعتبر'); return; }
    Auth.setToken(val);
    State.updateSettings({ githubTokenSet: true });
    Toast.success(`متصل شد به ${res.user.login}`);

    // تلاش برای بارگذاری از GitHub
    const remote = await Storage.loadRemote();
    if (remote) {
      State.replaceData({ ...State.data, ...remote });
      await Storage.save(State.snapshot());
      Toast.success('داده‌ها از GitHub بارگذاری شد');
    } else {
      // ذخیره محلی روی GitHub
      await Storage.save(State.snapshot());
      Toast.success('داده‌ها روی GitHub ذخیره شد');
    }
  };

  const testBtn = container.querySelector('#test-conn');
  if (testBtn) testBtn.onclick = async () => {
    const ping = await Storage.ping();
    if (ping.ok) Toast.success('اتصال به مخزن برقرار است');
    else Toast.error('عدم دسترسی به مخزن');
  };

  const clearBtn = container.querySelector('#clear-token');
  if (clearBtn) clearBtn.onclick = () => {
    Auth.clearToken();
    State.updateSettings({ githubTokenSet: false });
    Toast.info('توکن حذف شد');
    SettingsView({ container });
  };

  container.querySelector('#export-data').onclick = () => {
    const blob = new Blob([JSON.stringify(State.snapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaghaz-sefid-backup-${isoDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.success('فایل پشتیبان دانلود شد');
  };

  container.querySelector('#import-data').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        State.replaceData({ ...State.data, ...data });
        await Storage.save(State.snapshot());
        Toast.success('داده‌ها بازیابی شد');
      } catch (err) {
        Toast.error('فایل نامعتبر');
      }
    };
    input.click();
  };

  container.querySelector('#reset-data').onclick = async () => {
    const ok = confirm('همه داده‌ها پاک شود؟ این عمل بازگشت‌پذیر نیست.');
    if (!ok) return;
    Storage.clearLocal();
    localStorage.removeItem('kaghaz:github_token');
    Toast.warning('داده‌ها پاک شد — در حال بازنشانی…');
    setTimeout(() => location.reload(), 800);
  };

  return { destroy() {} };
}