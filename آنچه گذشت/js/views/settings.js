import { ACCENTS, CONFIG } from '../config.js';
import { esc, icon, qs, qsa, on, formatBytes } from '../lib/dom.js';
import { fa, fmtDate } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { toast, confirmDialog, openModal, field } from '../lib/ui.js';
import { processAvatar, downloadText, downloadBlob } from '../lib/images.js';
import { htmlToText } from '../lib/richtext.js';
import { db, useCloud } from '../services/db.js';
import { prefs, savePrefs, applyPrefs, state, bus, drafts } from '../state.js';
import { signOut, requestPasswordReset } from '../services/auth.js';
import { idb } from '../services/localdb.js';
import { modelStats, clearRuns } from '../services/ai.js';

export const title = 'تنظیمات';
export const sub = () => 'ظاهر، همگام‌سازی و خروجی روایت';

const SECTIONS = [
  ['account', 'حساب'],
  ['appearance', 'ظاهر'],
  ['writing', 'نوشتن'],
  ['ai', 'هوش مصنوعی'],
  ['vault', 'گنجینه و همگام‌سازی'],
  ['data', 'خروجی و ورودی'],
  ['danger', 'منطقهٔ خطر'],
];

export default {
  title,
  sub,
  async mount(root) {
    let profile = state.profile || { display_name: '', bio: '', avatar_src: '' };
    let stats = { entries: 0, threads: 0, photos: 0, words: 0 };
    try { profile = await db.profile.get(); } catch { /* offline */ }
    try { stats = await db.stats(); } catch { /* offline */ }
    const localEstimate = await idb.estimate();
    const cloud = useCloud();
    const email = state.user?.email || 'گنجینهٔ محلی';
    const joined = state.user?.created_at ? fmtDate(state.user.created_at.slice(0, 10), 'medium') : null;

    root.innerHTML = `
    <div class="settings-grid">
      <nav class="settings-nav no-print">
        ${SECTIONS.map(([id, label], i) => `<a href="#/settings" data-jump="${id}" class="${i === 0 ? 'is-active' : ''}">${label}</a>`).join('')}
      </nav>

      <div>
        <section class="set-section" id="set-account">
          <h2>حساب</h2>
          <div class="card card--pad" style="display:grid;gap:var(--sp-4)">
            <div class="row" style="gap:var(--sp-4)">
              <button class="avatar avatar--xl" id="avatarBtn" title="تغییر چهره" style="cursor:pointer;position:relative">
                ${profile.avatar_src ? `<img src="${esc(profile.avatar_src)}" alt="" />` : esc((profile.display_name || email)[0] || 'ر')}
              </button>
              <div class="grow">
                <strong style="font-size:var(--fs-md)">${esc(profile.display_name || 'دوست')}</strong>
                <p class="faint" style="font-size:var(--fs-xs)">${esc(email)}${joined ? ` · عضو از ${esc(joined)}` : ''}</p>
                <div class="row" style="gap:6px;margin-top:6px">
                  <span class="badge ${cloud ? 'badge--accent' : ''}">${cloud ? icon('cloud', 'ico--sm') + ' گنجینهٔ ابری' : icon('lock', 'ico--sm') + ' گنجینهٔ محلی'}</span>
                  <span class="badge">${fa(stats.entries)} قاب</span>
                </div>
              </div>
              <input type="file" accept="image/*" id="avatarInput" hidden />
            </div>
            <div class="row" style="gap:var(--sp-3);flex-wrap:wrap">
              <label class="field grow">
                <span class="field__label">نام نمایشی</span>
                <input class="input" id="displayName" value="${esc(profile.display_name || '')}" placeholder="روایت تو را چه صدا کند؟" />
              </label>
              <label class="field grow">
                <span class="field__label">یک خط دربارهٔ تو</span>
                <input class="input" id="bio" value="${esc(profile.bio || '')}" placeholder="اگر دوست داری، یک جمله" />
              </label>
            </div>
            <div class="row" style="gap:8px">
              <button class="btn btn--primary btn--sm" id="saveProfile">${icon('check')}ذخیرهٔ نمایه</button>
              ${state.user ? `<button class="btn btn--ghost btn--sm" id="resetPassword">${icon('lock')}فرستادن پیوند بازنشانی</button>` : ''}
            </div>
          </div>
        </section>

        <section class="set-section" id="set-appearance">
          <h2>ظاهر</h2>
          <div class="card card--pad">
            <div class="rowset">
              <div class="rowset__label"><strong>پوسته</strong><span>روشن، تاریک، یا هم‌راه با سامانه.</span></div>
              <div class="rowset__control theme-row" id="themeRow">
                ${[['light', 'روشن'], ['dark', 'تاریک'], ['system', 'سامانه']].map(([v, l]) => `
                  <button class="theme-opt ${prefs.theme === v ? 'is-on' : ''}" data-theme-opt="${v}">
                    <span class="theme-opt__prev" style="background:${v === 'light' ? '#f6f4ef' : v === 'dark' ? '#121210' : 'linear-gradient(90deg,#f6f4ef 50%,#121210 50%)'}">
                      <i style="background:${v === 'light' ? '#e6e0d3' : v === 'dark' ? '#2a2723' : 'transparent'}"></i>
                    </span>
                    ${l}
                  </button>`).join('')}
              </div>
            </div>
            <div class="rowset">
              <div class="rowset__label"><strong>رنگ امضا</strong><span>رنگِ ویژهٔ روایت تو.</span></div>
              <div class="accent-row" id="accentRow">
                ${ACCENTS.map((a) => `<button class="accent-dot ${prefs.accent === a.slug ? 'is-on' : ''}" data-accent-opt="${a.slug}" style="background:${a.hex};color:${a.hex}" title="${a.label}" aria-label="${a.label}"></button>`).join('')}
              </div>
            </div>
            <div class="rowset">
              <div class="rowset__label"><strong>چیدمان</strong><span>چقدر فضا میان اجزا بماند.</span></div>
              <div class="seg" id="densityRow">
                ${[['compact', 'فشرده'], ['comfy', 'راحت'], ['cozy', 'باز']].map(([v, l]) => `<button data-density-opt="${v}" class="${prefs.density === v ? 'is-on' : ''}">${l}</button>`).join('')}
              </div>
            </div>
            <div class="rowset">
              <div class="rowset__label"><strong>اندازهٔ متن</strong><span>راحتی برای خواندن‌های طولانی.</span></div>
              <div class="seg" id="scaleRow">
                ${[['md', 'عادی'], ['lg', 'بزرگ'], ['xl', 'بزرگ‌تر']].map(([v, l]) => `<button data-scale-opt="${v}" class="${prefs.scale === v ? 'is-on' : ''}">${l}</button>`).join('')}
              </div>
            </div>
            <div class="rowset">
              <div class="rowset__label"><strong>کاهش حرکت</strong><span>پویانماییِ رابط را خاموش کن.</span></div>
              <button class="switch" role="switch" id="motionSwitch" aria-checked="${!!prefs.reduceMotion}"></button>
            </div>
          </div>
        </section>

        <section class="set-section" id="set-writing">
          <h2>نوشتن</h2>
          <div class="card card--pad">
            <div class="rowset">
              <div class="rowset__label"><strong>قصد هفتگی</strong><span>چند قاب در هفته می‌خواهی ثبت کنی — حلقهٔ هدف همین را می‌سنجد.</span></div>
              <div class="rowset__control">
                <input class="input" type="number" min="1" max="40" id="goalInput" value="${prefs.goalPerWeek}" style="width:74px" />
                <span class="faint" style="font-size:var(--fs-2xs)">قاب</span>
              </div>
            </div>
            <div class="rowset">
              <div class="rowset__label"><strong>آغاز هفته</strong><span>تقویم و ستون‌های زنجیره.</span></div>
              <div class="seg" id="weekRow">
                <button data-week="6" class="${prefs.weekStart === 6 ? 'is-on' : ''}">شنبه</button>
                <button data-week="0" class="${prefs.weekStart === 0 ? 'is-on' : ''}">یکشنبه</button>
                <button data-week="1" class="${prefs.weekStart === 1 ? 'is-on' : ''}">دوشنبه</button>
              </div>
            </div>
            <div class="rowset">
              <div class="rowset__label"><strong>پیش از ترک ویرایشگر تأیید بگیر</strong><span>از قابی که ذخیره نشده محافظت کن.</span></div>
              <button class="switch" role="switch" id="confirmSwitch" aria-checked="${!!prefs.confirmDelete}"></button>
            </div>
            <div class="rowset">
              <div class="rowset__label"><strong>پاک کردن پیش‌نویس بازیابی‌شده</strong><span>نسخهٔ موقتِ آفلاینِ قاب تازه را بردار.</span></div>
              <button class="btn btn--sm btn--ghost" id="clearDrafts">${icon('trash')}پیش‌نویس‌ها را پاک کن</button>
            </div>
          </div>
        </section>

        <section class="set-section" id="set-vault">
          <h2>گنجینه و همگام‌سازی</h2>
          <div class="card card--pad" style="display:grid;gap:var(--sp-3)">
            <div class="rowset" style="border:0;padding-top:0">
              <div class="rowset__label">
                <strong>${cloud ? 'گنجینهٔ ابری وصل است' : 'گنجینهٔ محلی روی این دستگاه'}</strong>
                <span>${cloud
                  ? `Supabase · ${esc(CONFIG.supabaseUrl.replace('https://', ''))} · جدول‌ها با پیشوند <code>reel_*</code>`
                  : state.user ? 'وارد شده‌ای، اما جدول‌های ابری هنوز ساخته نشده‌اند.' : 'بدون حساب هم کار می‌کند. قاب‌هایت در همین مرورگر می‌مانند.'}</span>
              </div>
              <span class="badge ${cloud ? 'badge--accent badge--live' : 'badge--live'}">${cloud ? 'همگام' : 'روی دستگاه'}</span>
            </div>
            ${!cloud ? `<div class="banner banner--warn">${icon('alert')}
              <div class="grow"><span class="banner__title">گنجینهٔ ابری فعال نیست</span><br>یک بار اسکریپت SQL را در پروژهٔ Supabase اجرا کن تا قاب‌ها، عکس‌ها و نمایه در ابر ذخیره شوند.</div>
              <div class="banner__actions"><a class="btn btn--sm btn--outline" href="#/setup">راهنمای راه‌اندازی</a></div>
            </div>` : ''}
            <div class="rowset">
              <div class="rowset__label"><strong>فضای مصرفی این دستگاه</strong><span>گنجینهٔ محلی به‌همراه فایل‌های موقت رابط.</span></div>
              <span class="faint" style="font-size:var(--fs-2xs)">${formatBytes(localEstimate.usage)}${localEstimate.quota ? ` از ${formatBytes(localEstimate.quota)}` : ''}</span>
            </div>
            <div class="rowset">
              <div class="rowset__label"><strong>این روایت</strong><span>در همهٔ بخش‌ها.</span></div>
              <span class="faint" style="font-size:var(--fs-2xs)">${fa(stats.entries)} قاب · ${fa(stats.photos)} عکس · ${fa(stats.words)} واژه</span>
            </div>
            ${state.session ? `<div class="rowset"><div class="rowset__label"><strong>خروج</strong><span>قاب‌هایت در گنجینه می‌مانند.</span></div>
              <button class="btn btn--sm btn--outline" id="signOutBtn">${icon('logout')}خروج</button></div>`
              : `<div class="rowset"><div class="rowset__label"><strong>برای همگام‌سازی وارد شو</strong><span>یک حساب برای همهٔ دستگاه‌ها.</span></div>
              <button class="btn btn--sm btn--primary" id="signInBtn">${icon('user')}ورود</button></div>`}
            ${!state.session && state.mode === 'local' ? `<div class="rowset"><div class="rowset__label"><strong>گنجینهٔ این دستگاه را وارد کن</strong><span>پس از ورود، قاب‌های محلی را به ابر ببر.</span></div>
              <button class="btn btn--sm btn--ghost" id="importLocal" disabled>${icon('cloud')}اول وارد شو</button></div>` : ''}
            ${cloud && (await idb.all('entries')).length ? `<div class="rowset"><div class="rowset__label"><strong>بردن قاب‌های محلی به ابر</strong><span>${fa((await idb.all('entries')).length)} قاب در گنجینهٔ آفلاین پیدا شد.</span></div>
              <button class="btn btn--sm btn--outline" id="migrateBtn">${icon('upload')}وارد کن</button></div>` : ''}
          </div>
        </section>

        <section class="set-section" id="set-ai">
          <h2>هوش مصنوعی</h2>
          <p class="hint">متن را در چهار سطح اصلاح می‌کند. مدل واقعی هر اجرا ذخیره می‌شود و با رأی مثبت یا منفی تو، مدل‌های بهتر بالا می‌آیند.</p>
          <div class="card card--pad">
            <div class="rowset">
              <div class="rowset__label"><strong>مدل فعال</strong><span>«تصادفی رایگان» هر بار یکی از مدل‌های رایگان OpenRouter را می‌آورد؛ مدل واقعیِ همان اجرا ثبت می‌شود.</span></div>
              <select class="input" id="aiModelSelect" style="max-width:250px"></select>
            </div>
            <div id="aiModels"></div>
            <div class="rowset" style="border:0">
              <div class="rowset__label"><strong>پاک کردن تاریخچهٔ رأی‌ها</strong><span>همهٔ اجراها و رأی‌های ذخیره‌شده روی این دستگاه پاک می‌شوند.</span></div>
              <button class="btn btn--sm btn--ghost" id="aiClear">${icon('trash')}پاک کن</button>
            </div>
          </div>
        </section>

        <section class="set-section" id="set-data">
          <h2>خروجی و ورودی</h2>
          <p class="hint">روایتت از خودت است. با قالب‌های باز، هر جا می‌خواهی ببرش.</p>
          <div class="export-grid">
            <button class="export-tile" data-export="json">
              <strong>${icon('download')}همه‌چیز (JSON)</strong>
              <span>قاب‌ها، رشته‌ها، نمایه — آرشیو کامل.</span>
            </button>
            <button class="export-tile" data-export="md">
              <strong>${icon('download')}دست‌نوشته (Markdown)</strong>
              <span>همهٔ قاب‌ها به ترتیب، به‌صورت متن خوانا.</span>
            </button>
            <button class="export-tile" data-export="csv">
              <strong>${icon('download')}صفحه‌گسترده (CSV)</strong>
              <span>تاریخ‌ها، عنوان‌ها، حال‌وهوا، برچسب‌ها و شمار واژه‌ها.</span>
            </button>
            <button class="export-tile" data-export="html">
              <strong>${icon('download')}کتاب چاپی (HTML)</strong>
              <span>یک صفحهٔ یکپارچه برای چاپ.</span>
            </button>
            <button class="export-tile" data-export="import">
              <strong>${icon('upload')}وارد کردن آرشیو JSON</strong>
              <span>قاب‌های یک خروجی پیشین را ادغام کن.</span>
            </button>
          </div>
          <input type="file" accept="application/json" id="importInput" hidden />
        </section>

        <section class="set-section" id="set-danger">
          <h2>منطقهٔ خطر</h2>
          <div class="card card--pad danger-zone" style="display:grid;gap:var(--sp-3)">
            <div class="rowset" style="border:0">
              <div class="rowset__label"><strong>پاک کردن همهٔ قاب‌ها</strong><span>همهٔ قاب‌ها، عکس‌ها و رشته‌های این گنجینه را پاک می‌کند. حسابت می‌ماند.</span></div>
              <button class="btn btn--sm btn--danger" id="wipeBtn">${icon('trash')}روایت را پاک کن</button>
            </div>
            <div class="rowset" style="border:0">
              <div class="rowset__label"><strong>حذف حساب</strong><span>حذف حساب باید از داشبورد Supabase انجام شود — این سایت سروری ندارد.</span></div>
              <a class="btn btn--sm btn--ghost" href="https://supabase.com/dashboard/project/zlvsmjhwyzfdecfyhxal/auth/users" target="_blank" rel="noopener">${icon('arrow-right')}باز کردن داشبورد</a>
            </div>
          </div>
        </section>
      </div>
    </div>`;

    /* ── account ──────────────────────────────────────────── */
    qs('#saveProfile', root).addEventListener('click', async () => {
      try {
        const saved = await db.profile.save({
          display_name: qs('#displayName', root).value.trim().slice(0, 60),
          bio: qs('#bio', root).value.trim().slice(0, 160),
        });
        state.profile = saved;
        bus.emit('profile:changed');
        toast('نمایه ذخیره شد', { type: 'success' });
      } catch (err) { toast(err.message, { type: 'error' }); }
    });

    qs('#avatarBtn', root).addEventListener('click', () => qs('#avatarInput', root).click());
    qs('#avatarInput', root).addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const { blob } = await processAvatar(file, 512);
        let value;
        if (cloud) value = await db.photos.upload(blob, 'webp', 'avatars');
        else {
          const { key } = await db.photos.storeLocal(blob, 'webp');
          value = key;
        }
        const saved = await db.profile.save({ avatar_url: value });
        state.profile = saved;
        bus.emit('profile:changed');
        toast('چهره به‌روز شد', { type: 'success' });
        this.mount(root);
      } catch (err) { toast(err.message, { type: 'error' }); }
    });

    qs('#resetPassword', root)?.addEventListener('click', async () => {
      if (!state.user?.email) return;
      try {
        await requestPasswordReset(state.user.email);
        toast('پیوند بازنشانی گذرواژه به ایمیلت رفت', { type: 'success' });
      } catch (err) { toast(err.message, { type: 'error' }); }
    });

    /* ── appearance ───────────────────────────────────────── */
    on(root, 'click', '[data-theme-opt]', (e, b) => {
      savePrefs({ theme: b.dataset.themeOpt });
      qsa('[data-theme-opt]', root).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    on(root, 'click', '[data-accent-opt]', (e, b) => {
      savePrefs({ accent: b.dataset.accentOpt });
      qsa('[data-accent-opt]', root).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    on(root, 'click', '[data-density-opt]', (e, b) => {
      savePrefs({ density: b.dataset.densityOpt });
      qsa('[data-density-opt]', root).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    on(root, 'click', '[data-scale-opt]', (e, b) => {
      savePrefs({ scale: b.dataset.scaleOpt });
      qsa('[data-scale-opt]', root).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    qs('#motionSwitch', root).addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
      e.currentTarget.setAttribute('aria-checked', String(on));
      savePrefs({ reduceMotion: on });
    });

    /* ── writing ──────────────────────────────────────────── */
    qs('#goalInput', root).addEventListener('change', (e) => {
      const v = Math.max(1, Math.min(40, Number(e.target.value) || 3));
      e.target.value = v;
      savePrefs({ goalPerWeek: v });
      toast('قصد هفتگی به‌روز شد', { type: 'success' });
    });
    on(root, 'click', '[data-week]', (e, b) => {
      savePrefs({ weekStart: Number(b.dataset.week) });
      qsa('[data-week]', root).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    qs('#confirmSwitch', root).addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
      e.currentTarget.setAttribute('aria-checked', String(on));
      savePrefs({ confirmDelete: on });
    });
    qs('#clearDrafts', root).addEventListener('click', () => {
      drafts.clear('new');
      toast('پیش‌نویس بازیابی‌شده پاک شد', { type: 'info' });
    });

    /* ── vault ────────────────────────────────────────────── */
    qs('#signOutBtn', root)?.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'خارج شوم؟', message: 'روایتت سالم در گنجینه می‌ماند. هر وقت بخواهی دوباره وارد می‌شوی.', confirmLabel: 'خروج' });
      if (!ok) return;
      try { await signOut(); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('reel:signout'));
    });
    qs('#signInBtn', root)?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('reel:signin')));

    qs('#migrateBtn', root)?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'قاب‌های محلی وارد شوند؟',
        message: 'قاب‌های ذخیره‌شده روی این دستگاه، همراه عکس‌ها، به گنجینهٔ ابری کپی می‌شوند. نسخه‌های محلی سر جایشان می‌مانند.',
        confirmLabel: 'همین حالا وارد کن',
      });
      if (!ok) return;
      const closeToast = toast('در حال وارد کردن گنجینهٔ محلی…', { type: 'info', timeout: 0 });
      try {
        const n = await db.importLocalVault();
        closeToast();
        toast(`${fa(n)} قاب به گنجینهٔ ابری رفت`, { type: 'success' });
        bus.emit('entries:changed');
        this.mount(root);
      } catch (err) { closeToast(); toast(err.message, { type: 'error' }); }
    });

    /* ── export / import ──────────────────────────────────── */
    on(root, 'click', '[data-export]', async (e, btn) => {
      const kind = btn.dataset.export;
      if (kind === 'import') { qs('#importInput', root).click(); return; }
      try {
        const entries = await db.entries.all();
        const threads = await db.threads.list();
        const stamp = new Date().toISOString().slice(0, 10);
        if (kind === 'json') {
          const profileOut = await db.profile.get();
          downloadText(JSON.stringify({ app: 'reel', exported_at: new Date().toISOString(), profile: profileOut, threads, entries }, null, 2), `reel-${stamp}.json`, 'application/json');
        }
        if (kind === 'md') {
          const md = entries.map((x) => [
            `## ${x.title || 'قاب بی‌نام'}`,
            `*${fmtDate(x.happened_on, 'long')}*${x.mood ? ` · ${x.mood}` : ''}${x.location ? ` · ${x.location}` : ''}`,
            '',
            htmlToText(x.body),
            '',
            (x.tags || []).map((t) => '`#' + t + '`').join(' '),
            '',
            '---',
            '',
          ].join('\n')).join('\n');
          downloadText(`# ریل — مستندی از یک زندگی\n\nبرون‌بری ${stamp}\n\n${md}`, `reel-${stamp}.md`, 'text/markdown');
        }
        if (kind === 'csv') {
          const head = ['تاریخ', 'ساعت', 'عنوان', 'حال‌وهوا', 'امتیاز', 'انرژی', 'مکان', 'آب‌وهوا', 'برچسب‌ها', 'افراد', 'واژه‌ها', 'عکس‌ها', 'دوست‌داشتنی', 'رشته'];
          const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          const rows = entries.map((x) => [
            x.happened_on, x.happened_at || '', x.title || '', x.mood || '', x.rating || '', x.energy || '',
            x.location || '', x.weather || '', (x.tags || []).join('|'), (x.people || []).join('|'),
            x.word_count || 0, (x.photos || []).length, x.favorite ? 'بله' : '', threads.find((t) => t.id === x.thread_id)?.title || '',
          ].map(cell).join(','));
          downloadText([head.join(','), ...rows].join('\n'), `reel-${stamp}.csv`, 'text/csv');
        }
        if (kind === 'html') {
          const doc = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>ریل — مستندی از یک زندگی</title>
            <style>body{font-family:Georgia,serif;max-width:720px;margin:64px auto;padding:0 24px;color:#1a1713;line-height:1.7}
            h1{font-size:34px;letter-spacing:-.02em}h2{margin-top:56px;font-size:24px}img{max-width:100%;border-radius:6px;margin:14px 0}
            .meta{color:#777;font-size:13px;text-transform:uppercase;letter-spacing:.08em}hr{border:0;border-top:1px solid #ddd;margin:40px 0}
            blockquote{border-left:2px solid #ccc;margin-left:0;padding-left:18px;color:#555;font-style:italic}</style></head><body>
            <h1>ریل — مستندی از یک زندگی</h1><p class="meta">برون‌بری ${esc(stamp)} · ${fa(entries.length)} قاب</p><hr>
            ${entries.map((x) => `<article><h2>${esc(x.title || 'قاب بی‌نام')}</h2>
              <p class="meta">${esc(fmtDate(x.happened_on, 'long'))}${x.mood ? ' · ' + esc(x.mood) : ''}${x.location ? ' · ' + esc(x.location) : ''}</p>
              ${(x.photos || []).map((p) => p.src ? `<img src="${esc(p.src)}" alt="">` : '').join('')}
              <div>${x.body || ''}</div></article><hr>`).join('')}
            </body></html>`;
          downloadText(doc, `reel-${stamp}.html`, 'text/html');
        }
        toast('خروجی آماده است', { type: 'success' });
      } catch (err) { toast(err.message, { type: 'error' }); }
    });

    qs('#importInput', root).addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const list = Array.isArray(data) ? data : data.entries;
        if (!Array.isArray(list)) throw new Error('این فایل آرشیو ریل به نظر نمی‌رسد.');
        let imported = 0;
        for (const raw of list.slice(0, 2000)) {
          await db.entries.save({
            ...raw,
            id: raw.id || undefined,
            photos: Array.isArray(raw.photos) ? raw.photos.filter((p) => p.path || p.localKey) : [],
            cover_url: raw.photos?.[0]?.path || '',
          });
          imported += 1;
        }
        toast(`${fa(imported)} قاب وارد شد`, { type: 'success' });
        bus.emit('entries:changed');
        this.mount(root);
      } catch (err) { toast(err.message, { type: 'error' }); }
    });

    /* ── danger ───────────────────────────────────────────── */
    qs('#wipeBtn', root).addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'همهٔ روایت پاک شود؟',
        message: `این کار <strong>${fa(stats.entries)} قاب</strong> و همهٔ عکس‌های ذخیره‌شده را${cloud ? ' برای همیشه از گنجینهٔ ابری' : ' از این دستگاه'} پاک می‌کند. اگر شاید بعداً بخواهی‌شان، اول یک نسخه بگیر.`,
        confirmLabel: 'همه را پاک کن',
        danger: true,
      });
      if (!ok) return;
      try {
        await db.entries.removeAll();
        await Promise.all((await db.threads.list()).map((t) => db.threads.remove(t.id)));
        toast('روایت پاک شد', { type: 'success' });
        bus.emit('entries:changed');
        this.mount(root);
      } catch (err) { toast(err.message, { type: 'error' }); }
    });

    /* ── هوش مصنوعی ──────────────────────────────────────── */
    const aiSelect = qs('#aiModelSelect', root);
    const aiList = qs('#aiModels', root);
    const aiStats = modelStats();
    const preferredModel = prefs.aiPreferredModel || CONFIG.ai.freeModel;
    const options = [
      { value: CONFIG.ai.freeModel, label: 'تصادفی رایگان (openrouter/free)' },
      ...aiStats.map((s) => ({ value: s.model, label: `${s.model} · امتیاز ${s.score >= 0 ? '+' : '−'}${fa(Math.abs(s.score))}` })),
    ];
    if (aiSelect) {
      aiSelect.innerHTML = options.map((o) => `<option value="${esc(o.value)}" ${preferredModel === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      aiSelect.addEventListener('change', () => {
        savePrefs({ aiPreferredModel: aiSelect.value });
        toast('مدل فعال عوض شد', { type: 'success' });
      });
    }
    if (aiList) {
      aiList.innerHTML = aiStats.length
        ? `<table class="table" style="margin-top:6px">
            <tr><td class="faint">مدل</td><td class="faint">👍</td><td class="faint">👎</td><td class="faint">امتیاز</td></tr>
            ${aiStats.map((s) => `<tr><td class="truncate" style="max-width:230px">${esc(s.model)}</td><td class="num">${fa(s.up)}</td><td class="num">${fa(s.down)}</td><td class="num">${s.score >= 0 ? '+' : '−'}${fa(Math.abs(s.score))}</td></tr>`).join('')}
          </table>`
        : '<p class="faint" style="font-size:var(--fs-xs)">هنوز اجرایی ثبت نشده است. در ویرایشگر یک قاب، «اصلاح کن» را بزن و به نتیجه رأی بده.</p>';
    }
    qs('#aiClear', root)?.addEventListener('click', () => {
      clearRuns();
      toast('تاریخچهٔ رأی‌ها پاک شد', { type: 'success' });
      this.mount(root);
    });

    /* ── nav ──────────────────────────────────────────────── */
    on(root, 'click', '[data-jump]', (e, a) => {
      e.preventDefault();
      qs(`#set-${a.dataset.jump}`, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      qsa('[data-jump]', root).forEach((x) => x.classList.toggle('is-active', x === a));
    });

    void applyPrefs;
    void openModal;
    void field;
    void downloadBlob;
    void navigate;
  },
};
