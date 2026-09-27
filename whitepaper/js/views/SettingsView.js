/* ============================================================
   کاغذ سفید — تنظیمات (نسخه اصلاح‌شده)
   ============================================================ */

import { State } from '../core/state.js';
import { Auth } from '../core/auth.js';
import { Storage } from '../services/storage.js';
import { defaultGitHub } from '../core/github.js';
import { Toast } from '../components/Toast.js';
import { toFa, faDateTime, prettyBytes, isoDate, esc } from '../core/utils.js';

export async function SettingsView({ container }) {
  render();

  function render() {
    const s = State.data.settings;
    const user = Auth.getUser();
    const hasToken = Auth.hasToken();
    const lastSync = s.lastSyncedAt;
    const stats = State.stats();

    container.innerHTML = `
      <div class="settings-grid anim-in">

        <!-- ================= مشخصات کاربر ================= -->
        <div class="settings-section">
          <h3>👤 مشخصات شما</h3>
          <div class="field">
            <label class="field-label">نام شما</label>
            <input class="input" id="s-name" placeholder="مثلاً: سارا" value="${esc(s.userName || '')}" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="field">
              <label class="field-label">تاریخ تولد</label>
              <input class="input" id="s-birth" type="date" value="${(s.birthDate || '1995-01-01').slice(0, 10)}" />
            </div>
            <div class="field">
              <label class="field-label">امید به زندگی (سال)</label>
              <input class="input" id="s-life" type="number" min="30" max="120" value="${s.lifeExpectancy || 85}" />
            </div>
          </div>
          <button class="btn btn-primary" id="save-profile">ذخیره مشخصات</button>
        </div>

        <!-- ================= همگام‌سازی با GitHub ================= -->
        <div class="settings-section">
          <h3>☁️ همگام‌سازی با GitHub</h3>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">وضعیت اتصال</div>
              <div class="setting-desc">
                ${hasToken
                  ? (user ? `متصل به عنوان <strong>${esc(user.login)}</strong>` : 'توکن ذخیره شده')
                  : 'بدون توکن — داده‌ها فقط روی همین دستگاه ذخیره می‌شوند'}
              </div>
            </div>
            <span class="chip ${hasToken ? 'success' : 'warning'}">
              ${hasToken ? '✓ متصل' : 'آفلاین'}
            </span>
          </div>

          <div class="field" style="margin-top:16px;">
            <label class="field-label">توکن دسترسی GitHub (Personal Access Token)</label>
            <input
              class="input"
              id="s-token"
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value="${hasToken ? '••••••••••••••••' : ''}"
              autocomplete="off"
            />
            <div class="field-hint">
              از
              <a href="https://github.com/settings/tokens/new?scopes=repo&description=Kaghaz%20Sefid" target="_blank" rel="noopener">
                این آدرس
              </a>
              یک توکن با دسترسی <code>repo</code> بسازید.
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="save-token">ذخیره و اتصال</button>
            <button class="btn btn-soft" id="test-conn">تست اتصال</button>
            ${hasToken ? `<button class="btn btn-danger" id="clear-token">قطع اتصال</button>` : ''}
          </div>

          <div class="divider"></div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">آدرس مخزن</div>
              <div class="setting-desc" style="font-family:var(--font-mono);direction:ltr;text-align:left;font-size:var(--fs-xs);">
                ${defaultGitHub.owner}/${defaultGitHub.repo}/${defaultGitHub.path}
              </div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">شاخه</div>
              <div class="setting-desc">${defaultGitHub.branch}</div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">آخرین همگام‌سازی</div>
              <div class="setting-desc">${lastSync ? faDateTime(lastSync) : 'هرگز'}</div>
            </div>
          </div>
        </div>

        <!-- ================= داده‌ها ================= -->
        <div class="settings-section">
          <h3>💾 داده‌ها</h3>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">تعداد برنامه‌ها</div>
              <div class="setting-desc">${toFa(stats.plansCount)} برنامه</div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">تعداد اهداف</div>
              <div class="setting-desc">${toFa(stats.goalsCount)} هدف — ${toFa(stats.doneCount)} انجام‌شده</div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">حجم داده محلی</div>
              <div class="setting-desc">
                ${prettyBytes(new Blob([JSON.stringify(State.snapshot())]).size)}
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
            <button class="btn btn-soft" id="export-data">📤 خروجی JSON</button>
            <button class="btn btn-soft" id="import-data">📥 بازگردانی</button>
            <button class="btn btn-danger" id="reset-data">🗑 پاک‌سازی کامل</button>
          </div>
        </div>

        <!-- ================= راهنما ================= -->
        <div class="settings-section">
          <h3>❓ راهنما</h3>
          <div style="line-height:2;font-size:var(--fs-sm);color:var(--text-secondary);">
            <p>• <strong>بدون توکن:</strong> داده‌ها فقط روی مرورگر شما ذخیره می‌شوند.</p>
            <p>• <strong>با توکن:</strong> داده‌ها روی مخزن GitHub ذخیره و همگام‌سازی می‌شوند.</p>
            <p>• <strong>Ctrl+S:</strong> همگام‌سازی دستی در هر لحظه.</p>
            <p>• <strong>Ctrl+K:</strong> فوکوس سریع روی جستجو.</p>
            <p>• توکن شما هرگز جایی جز مرورگر خودتان ذخیره نمی‌شود.</p>
          </div>
        </div>

      </div>
    `;

    /* ============================================================
       رویدادها
       ============================================================ */

    /* ---------- ذخیره مشخصات ---------- */
    container.querySelector('#save-profile').onclick = async () => {
      const name = container.querySelector('#s-name').value.trim();
      const birth = container.querySelector('#s-birth').value;
      const life = Number(container.querySelector('#s-life').value) || 85;

      State.updateSettings({
        userName: name,
        birthDate: birth,
        lifeExpectancy: life,
      });

      await Storage.save(State.snapshot());
      Toast.success('مشخصات ذخیره شد');
    };

    /* ---------- ذخیره و اتصال توکن ---------- */
    container.querySelector('#save-token').onclick = async () => {
      const input = container.querySelector('#s-token');
      const val = input.value.trim();

      if (!val || val.startsWith('••')) {
        Toast.warning('توکن جدید وارد کنید');
        return;
      }

      Toast.info('در حال بررسی توکن…');
      const res = await Auth.validate(val);
      if (!res.ok) {
        Toast.error(res.error || 'توکن نامعتبر است');
        return;
      }

      // ذخیره توکن
      Auth.setToken(val);
      State.updateSettings({ githubTokenSet: true });
      Toast.success(`متصل شد به ${res.user.login}`);

      // بارگذاری یا ذخیره داده‌ها
      try {
        const remote = await Storage.loadRemote();

        if (remote && remote.plans && remote.plans.length > 0) {
          // داده روی GitHub وجود دارد → بارگذاری کن
          State.replaceData({
            ...State.data,
            plans: remote.plans,
            settings: { ...State.data.settings, ...(remote.settings || {}) },
            meta: remote.meta || State.data.meta,
          });
          Toast.success('داده‌ها از GitHub بارگذاری شد');
        } else {
          // داده روی GitHub نیست → داده محلی را بفرست
          const r = await Storage.save(State.snapshot());
          if (r.synced) Toast.success('داده‌های محلی روی GitHub ذخیره شد');
          else Toast.error(r.error || 'خطا در ذخیره روی GitHub');
        }
      } catch (e) {
        console.error('Sync error:', e);
        Toast.error('خطا در اتصال: ' + e.message);
      }

      // رفرش
      render();
    };

    /* ---------- تست اتصال ---------- */
    const testBtn = container.querySelector('#test-conn');
    if (testBtn) {
      testBtn.onclick = async () => {
        Toast.info('در حال تست اتصال…');
        const ping = await Storage.ping();
        if (ping.ok) {
          Toast.success('اتصال به مخزن برقرار است ✓');
        } else {
          Toast.error(`عدم دسترسی (کد ${ping.status || 'نامشخص'})`);
        }
      };
    }

    /* ---------- حذف توکن ---------- */
    const clearBtn = container.querySelector('#clear-token');
    if (clearBtn) {
      clearBtn.onclick = () => {
        Auth.clearToken();
        State.updateSettings({ githubTokenSet: false });
        Toast.info('توکن حذف شد — حالت محلی فعال است');
        render();
      };
    }

    /* ---------- خروجی JSON ---------- */
    container.querySelector('#export-data').onclick = () => {
      const blob = new Blob(
        [JSON.stringify(State.snapshot(), null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaghaz-sefid-backup-${isoDate()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      Toast.success('فایل پشتیبان دانلود شد');
    };

    /* ---------- بازگردانی ---------- */
    container.querySelector('#import-data').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);

          if (!data.plans || !Array.isArray(data.plans)) {
            Toast.error('ساختار فایل نامعتبر است');
            return;
          }

          State.replaceData({
            ...State.data,
            plans: data.plans,
            settings: { ...State.data.settings, ...(data.settings || {}) },
            meta: data.meta || State.data.meta,
          });

          await Storage.save(State.snapshot());
          Toast.success('داده‌ها بازیابی شد ✓');
          render();
        } catch (err) {
          console.error(err);
          Toast.error('فایل نامعتبر یا خراب است');
        }
      };
      input.click();
    };

    /* ---------- پاک‌سازی کامل ---------- */
    container.querySelector('#reset-data').onclick = async () => {
      const ok = confirm(
        '⚠️ هشدار!\n\nهمه داده‌ها، توکن و تنظیمات پاک خواهند شد.\nاین عمل بازگشت‌پذیر نیست.\n\nآیا مطمئن هستید؟'
      );
      if (!ok) return;

      const ok2 = confirm('برای اطمینان نهایی، یک‌بار دیگر تایید کنید.');
      if (!ok2) return;

      Storage.clearLocal();
      localStorage.removeItem('kaghaz:github_token');
      localStorage.removeItem('kaghaz:github_user');
      localStorage.removeItem('kaghaz:welcomed');

      Toast.warning('داده‌ها پاک شد — در حال بازنشانی…');
      setTimeout(() => location.reload(), 800);
    };
  }

  return {
    destroy() {
      /* پاک‌سازی در صورت نیاز */
    },
  };
}