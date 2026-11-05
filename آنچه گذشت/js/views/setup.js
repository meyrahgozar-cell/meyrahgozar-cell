import { CONFIG } from '../config.js';
import { esc, icon, qs } from '../lib/dom.js';
import { toast } from '../lib/ui.js';
import { sb } from '../services/client.js';
import { probeCloudSchema } from '../services/db.js';
import { state } from '../state.js';

export const title = 'راه‌اندازی ابری';
export const sub = () => 'یک اسکریپت SQL، گنجینهٔ ابری را روشن می‌کند';

const projectRef = CONFIG.supabaseUrl.replace('https://', '').split('.')[0];
const SQL_URL = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;
const FUNCTIONS_URL = `https://supabase.com/dashboard/project/${projectRef}/functions`;

export default {
  title,
  sub,
  async mount(root) {
    root.innerHTML = `<div class="setup">
      <div class="card card--pad">
        <div class="row" style="gap:10px;margin-bottom:8px">${icon('cloud', 'ico--lg')}<h2 class="serif" style="font-size:var(--fs-xl);font-weight:600">دو دقیقه تا گنجینهٔ ابری</h2></div>
        <p class="muted" style="font-size:var(--fs-sm);line-height:1.9">ریل یک سایت ایستا است — سروری برای اجرا ندارد. قاب‌ها و عکس‌ها مستقیم در پروژهٔ Supabase تو ذخیره می‌شوند و امنیت سطح‌ردیف تضمین می‌کند هر حساب فقط ردیف‌های خودش را بخواند. جدول‌های این برنامه همگی با پیشوند <code>reel_</code> هستند و باکت <code>${esc(CONFIG.bucket)}</code>، پس هرگز به داده‌های اپ دیگری در همین پروژه دست نمی‌زند.</p>
      </div>

      <div id="statusCard" class="card card--pad">
        <div class="panel-title">${icon('shield')}آمادگی</div>
        <div id="checks" class="stack stack--sm"><div class="skeleton" style="height:44px"></div><div class="skeleton" style="height:44px"></div></div>
      </div>

      <div class="setup__steps">
        <div class="setup__step"><div>
          <h4>۱ — ویرایشگر SQL را باز کن</h4>
          <p>اسکریپت سه جدول، سیاست‌های امنیتی، تریگری که با ثبت‌نام پروفایل می‌سازد و باکت خصوصی عکس‌ها را می‌سازد.</p>
          <a class="btn btn--sm btn--outline" href="${SQL_URL}" target="_blank" rel="noopener" style="margin-top:8px">${icon('arrow-left')}باز کردن ویرایشگر SQL</a>
        </div></div>
        <div class="setup__step"><div>
          <h4>۲ — اسکریپت را بچسبان و اجرا کن</h4>
          <p>تکرارش بی‌خطر است؛ اجرای دوباره چیزی را خراب نمی‌کند.</p>
          <div class="row" style="margin-top:8px;gap:6px">
            <button class="btn btn--sm btn--primary" id="copySql">${icon('copy')}رونوشت SQL</button>
            <button class="btn btn--sm btn--ghost" id="downloadSql">${icon('download')}دریافت فایل .sql</button>
          </div>
        </div></div>
        <div class="setup__step"><div>
          <h4>۳ — برگرد و بررسی کن</h4>
          <p>این بررسی جدول‌ها و باکت عکس را می‌بیند و سایت را به حالت ابری می‌برد.</p>
          <button class="btn btn--sm btn--outline" id="recheck" style="margin-top:8px">${icon('refresh')}بررسی دوباره</button>
        </div></div>
      </div>

      <div class="card card--pad">
        <div class="panel-title">${icon('wand')}تابع هوش مصنوعی</div>
        <p class="muted" style="font-size:var(--fs-sm);line-height:1.9">
          اصلاح متن از تابع لبهٔ <code>diary</code> استفاده می‌کند. کد آن در پوشهٔ
          <code>supabase/functions/diary/index.ts</code> است. کلید OpenRouter را به‌عنوان راز ذخیره کن،
          بعد تابع را منتشر کن — از این پس دکمهٔ «اصلاح کن» در ویرایشگر کار می‌کند.
        </p>
        <pre class="copybox" style="margin-top:10px">supabase secrets set OPENROUTER=sk-or-...
supabase functions deploy diary --no-verify-jwt</pre>
        <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap">
          <a class="btn btn--sm btn--outline" href="${FUNCTIONS_URL}" target="_blank" rel="noopener">${icon('arrow-left')}توابع پروژه</a>
          <button class="btn btn--sm btn--ghost" id="copyCmd">${icon('copy')}رونوشت دستورها</button>
        </div>
      </div>

      <pre class="copybox" id="sqlBox">در حال خواندن schema.sql…</pre>
      <input type="file" hidden id="sqlFile" />
    </div>`;

    let sql = '';
    try {
      const res = await fetch('supabase/schema.sql', { cache: 'no-store' });
      sql = await res.text();
      const aiRes = await fetch('supabase/ai.sql', { cache: 'no-store' });
      if (aiRes.ok) sql += `\n\n-- ===== جدول تاریخچهٔ هوش مصنوعی =====\n${await aiRes.text()}`;
    } catch {
      sql = '-- خواندن supabase/schema.sql ممکن نشد. فایل را از پوشهٔ پروژه باز کن.';
    }
    qs('#sqlBox', root).textContent = sql;

    qs('#copySql', root).addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(sql);
        toast('SQL رونوشت شد — در ویرایشگر Supabase بچسبان', { type: 'success' });
      } catch { toast('رونوشت نشد؛ متن را دستی انتخاب کن', { type: 'error' }); }
    });

    qs('#copyCmd', root).addEventListener('click', async () => {
      const cmd = 'supabase secrets set OPENROUTER=sk-or-...\nsupabase functions deploy diary --no-verify-jwt';
      try {
        await navigator.clipboard.writeText(cmd);
        toast('دستورها رونوشت شدند', { type: 'success' });
      } catch { toast('رونوشت نشد', { type: 'error' }); }
    });

    qs('#downloadSql', root).addEventListener('click', () => {
      const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'reel-schema.sql';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    });

    async function check() {
      const checks = qs('#checks', root);
      checks.innerHTML = `<div class="row"><span class="skeleton" style="height:18px;width:18px;border-radius:50%"></span><span class="faint" style="font-size:var(--fs-xs)">در حال بررسی…</span></div>`;

      let schema = { ready: false };
      try {
        schema = await probeCloudSchema();
      } catch (err) {
        console.warn('[setup] schema probe failed', err);
      }
      let bucketOk = null;
      if (state.user) {
        try {
          const { error } = await sb.storage.from(CONFIG.bucket).list(`${state.user.id}`, { limit: 1 });
          bucketOk = !error || !/not found|does not exist/i.test(error.message);
        } catch { bucketOk = false; }
      }

      const rows = [
        {
          ok: !!state.user,
          label: state.user ? `وارد شده‌ای با ${state.user.email}` : 'وارد نشده‌ای',
          detail: state.user ? 'نشست این برنامه از بقیه جدا نگه داشته می‌شود.' : 'برای روشن شدن گنجینهٔ ابری وارد شو.',
        },
        {
          ok: schema.ready,
          label: schema.ready
            ? 'جدول‌ها در دسترس‌اند'
            : (schema.reason === 'missing-tables' ? 'جدول‌ها ساخته نشده‌اند' : 'دسترسی به Supabase ممکن نشد'),
          detail: schema.ready
            ? 'reel_entries، reel_threads، reel_profiles، reel_ai_runs'
            : (schema.reason === 'missing-tables'
              ? 'اسکریپت پایین را اجرا کن، بعد دوباره بررسی کن.'
              : `${schema.error || 'درخواست کامل نشد.'} — اتصالت را بررسی کن و باز امتحان کن.`),
        },
        {
          ok: bucketOk === true,
          label: bucketOk === true ? 'باکت عکس آماده است' : (bucketOk === false ? 'باکت عکس نیست' : 'باکت عکس نامشخص'),
          detail: `باکت خصوصی «${CONFIG.bucket}» با پوشهٔ جدا برای هر کاربر.`,
        },
        {
          ok: schema.ready && bucketOk === true && !!state.user,
          label: schema.ready && bucketOk === true && !!state.user ? 'گنجینهٔ ابری فعال است' : 'الان گنجینهٔ محلی فعال است',
          detail: 'تا آماده شدن گنجینهٔ ابری، قاب‌ها در همین مرورگر می‌مانند.',
        },
      ];

      checks.innerHTML = rows.map((r) => `
        <div class="row" style="align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-soft)">
          <span style="display:grid;place-items:center;width:20px;height:20px;border-radius:50%;flex:0 0 auto;background:${r.ok ? 'rgba(111,191,143,.16)' : 'rgba(233,185,73,.14)'};color:${r.ok ? 'var(--mood-content)' : 'var(--mood-radiant)'}">
            ${icon(r.ok ? 'check' : 'alert', 'ico--sm')}
          </span>
          <div class="grow">
            <strong style="font-size:var(--fs-sm);font-weight:550">${esc(r.label)}</strong>
            <p class="faint" style="font-size:var(--fs-2xs)">${esc(r.detail)}</p>
          </div>
        </div>`).join('');

      if (schema.ready && bucketOk && state.user) {
        state.schemaReady = true;
        state.mode = 'cloud';
        toast('گنجینهٔ ابری روشن شد — روایتت بارگذاری می‌شود', { type: 'success' });
        setTimeout(() => { window.dispatchEvent(new CustomEvent('reel:schema-ready')); }, 600);
      }
      return schema;
    }

    qs('#recheck', root).addEventListener('click', async () => {
      const r = await check();
      if (!r.ready) {
        toast(r.reason === 'missing-tables'
          ? 'جدول‌ها هنوز نیستند — اسکریپت اجرا شد؟'
          : 'همین حالا دسترسی به Supabase نبود — یک لحظه بعد امتحان کن.', { type: 'info' });
      }
    });

    qs('#sqlFile', root).addEventListener('change', () => {});
    check().catch((err) => {
      qs('#checks', root).innerHTML = `<div class="err">${icon('alert')}<span>بررسی کامل نشد: ${esc(err.message || String(err))}</span></div>`;
    });
  },
};
