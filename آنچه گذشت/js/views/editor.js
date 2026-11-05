import { AI_LEVELS, MOODS, WEATHER, PROMPTS } from '../config.js';
import { esc, icon, qs, qsa, on, debounce, uid, formatBytes } from '../lib/dom.js';
import { fa, fmtDate, fmtTime, readMinutes, toISODate, wordCount } from '../lib/format.js';
import { navigate, current } from '../lib/router.js';
import { toast, confirmDialog } from '../lib/ui.js';
import { processImage, imagesFromDataTransfer } from '../lib/images.js';
import { sanitizeHtml, htmlToText, activeCommands, selectionInside } from '../lib/richtext.js';
import { db, emptyEntry, useCloud } from '../services/db.js';
import { correct, saveRun, setFeedback } from '../services/ai.js';
import { openLightbox } from '../ui/lightbox.js';
import { drafts, prefs, bus, state } from '../state.js';
import { moodColor } from '../ui/parts.js';

export const title = 'قاب تازه';
export const sub = () => 'یک روز، یک عکس، چند جملهٔ صادقانه';

const TOOLBAR = [
  { cmd: 'bold', icon: 'bold', label: 'توپر', key: '⌘B' },
  { cmd: 'italic', icon: 'italic', label: 'کج', key: '⌘I' },
  { cmd: 'underline', icon: 'underline', label: 'زیرخط', key: '⌘U' },
  { sep: true },
  { cmd: 'h2', icon: 'heading', label: 'سرتیتر' },
  { cmd: 'blockquote', icon: 'quote', label: 'نقل‌قول' },
  { sep: true },
  { cmd: 'insertUnorderedList', icon: 'list', label: 'فهرست نقطه‌ای' },
  { cmd: 'insertOrderedList', icon: 'list-ol', label: 'فهرست شماره‌دار' },
  { sep: true },
  { cmd: 'link', icon: 'link', label: 'پیوند' },
  { cmd: 'hr', icon: 'filter', label: 'خط جداکننده' },
  { sep: true },
  { cmd: 'undo', icon: 'refresh', label: 'واگرد' },
];

export default {
  title,
  sub,
  async mount(root, ctx) {
    const editingId = ctx.params.id || null;
    let entry = null;
    let photos = [];
    let coverId = null;
    let dirty = false;
    let saving = false;
    let allTags = [];

    root.innerHTML = `<div class="stack"><div class="skeleton" style="height:60px"></div><div class="skeleton" style="height:320px"></div></div>`;

    if (editingId) {
      try {
        entry = await db.entries.get(editingId);
      } catch (err) {
        root.innerHTML = `<div class="banner banner--warn">${icon('alert')}این قاب باز نشد: ${esc(err.message)}</div>`;
        return;
      }
      if (!entry) {
        root.innerHTML = `<div class="empty"><div class="empty__icon">${icon('reel')}</div><h3>این قاب پیدا نشد</h3><p>شاید پاک شده باشد.</p><a class="btn btn--outline" href="#/timeline">بازگشت به خط زمان</a></div>`;
        return;
      }
      this.title = 'ویرایش قاب';
      this.sub = () => fmtDate(entry.happened_on, 'long');
      bus.emit('shell:title');
    } else {
      entry = emptyEntry({
        happened_on: /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.date || '') ? ctx.query.date : toISODate(),
        happened_at: new Date().toTimeString().slice(0, 5),
      });
      this.title = 'قاب تازه';
      this.sub = () => 'یک روز، یک عکس، چند جملهٔ صادقانه';
      bus.emit('shell:title');
    }

    photos = (entry.photos || []).map((p) => ({ ...p, id: p.id || uid() }));
    coverId = photos.find((p) => (p.path && p.path === entry.cover_url) || (p.localKey && p.localKey === entry.cover_url))?.id || photos[0]?.id || null;

    let threads = [];
    try {
      const all = await db.entries.all();
      threads = await db.threads.list();
      const tagCount = new Map();
      all.forEach((e) => (e.tags || []).forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
      allTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    } catch { /* offline — suggestions are optional */ }

    const promptText = ctx.query.prompt ? decodeURIComponent(ctx.query.prompt) : '';
    const draft = !editingId ? drafts.read('new') : null;
    const restored = draft && (draft.title || draft.body) && !draft.consumed;

    root.innerHTML = `
      <div class="ed-head">
        <a class="ed-head__back" href="#/timeline">${icon('arrow-right')}بازگشت</a>
        <div class="sparator" style="width:1px;height:18px;background:var(--line)"></div>
        <span class="savestate" id="saveState" data-state="idle"><span class="dot"></span><span>هنوز ذخیره نشده</span></span>
        <div style="margin-inline-start:auto;display:flex;gap:8px;align-items:center">
          <button class="btn btn--sm btn--ghost" id="promptBtn" title="یک پیشنهاد در متن بگذار">${icon('sparkles')}پیشنهاد</button>
          ${editingId ? `<a class="btn btn--sm btn--outline" href="#/frame/${editingId}">${icon('reel')}خواندن</a>` : ''}
          <button class="btn btn--primary btn--sm" id="saveBtn">${icon('check')}ذخیرهٔ قاب</button>
        </div>
      </div>

      ${restored ? `<div class="banner banner--accent" style="margin-bottom:var(--sp-4)" id="draftBanner">
        ${icon('sparkles')}<div class="grow"><span class="banner__title">پیش‌نویس بازیابی شد</span><br>قابی ناتمام از ${esc(fmtDate(draft.savedAt, 'long'))} · ساعت ${esc(fmtTime(new Date(draft.savedAt).toTimeString().slice(0, 5)))} برگشت.</div>
        <div class="banner__actions"><button class="btn btn--sm btn--ghost" id="discardDraft">دور بریز</button></div>
      </div>` : ''}

      <div class="editor">
        <div class="editor__main">
          <div>
            <input class="ed-title" id="edTitle" placeholder="برای این روز یک عنوان بگذار" value="${esc(entry.title)}" maxlength="180" />
            <div class="ed-meta-row" style="margin-top:var(--sp-3)">
              <label class="ed-date">
                ${icon('calendar', 'ico--sm')}
                <input class="input" type="date" id="edDate" value="${esc(entry.happened_on)}" style="width:auto" />
              </label>
              <label class="ed-date">
                ${icon('clock', 'ico--sm')}
                <input class="input" type="time" id="edTime" value="${esc(entry.happened_at || '')}" style="width:auto" />
              </label>
              <span class="faint" style="font-size:var(--fs-3xs)" id="edStamp"></span>
            </div>
          </div>

          <div class="ed-toolbar" id="edToolbar" role="toolbar" aria-label="قالب‌بندی">
            ${TOOLBAR.map((t) => t.sep
              ? '<span class="sep"></span>'
              : `<button type="button" data-cmd="${t.cmd}" title="${t.label}${t.key ? ' (' + t.key + ')' : ''}" aria-label="${t.label}">${icon(t.icon)}</button>`).join('')}
          </div>

          <div class="ed-body" id="edBody" contenteditable="true" spellcheck="true"
            data-placeholder="چه شد؟ چه حسی داشت؟ همان‌طور بنویس که به یک دوست می‌گفتی.">${sanitizeHtml(entry.body || (promptText ? `<p><strong>${esc(promptText)}</strong></p><p></p>` : ''))}</div>

          <div class="ed-foot">
            <span id="edCount">۰ کلمه</span>
            <span style="opacity:.4">·</span>
            <span id="edRead">۱ دقیقه</span>
            <span style="opacity:.4">·</span>
            <span>${useCloud() ? 'در گنجینهٔ ابری ذخیره می‌شود' : 'روی همین دستگاه ذخیره می‌شود'}</span>
            <span style="margin-inline-start:auto" class="kbdhints"><span><kbd class="kbd">⌘↵</kbd> ذخیره</span><span><kbd class="kbd">esc</kbd> خروج</span></span>
          </div>
        </div>

        <aside class="editor__side">
          <section class="sidecard">
            <div class="sidecard__title">${icon('image')}عکس‌ها <span class="faint" style="margin-inline-start:auto">${fa(photos.length)}/۱۲</span></div>
            <div class="photo-grid" id="photoGrid"></div>
            <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="افزودن عکس">
              <span class="dropzone__icon">${icon('camera')}</span>
              <span><strong>عکس را رها کن</strong> یا برای انتخاب کلیک کن</span>
              <span style="font-size:10px;opacity:.8">تا ۷۲۰ پیکسل کوچک می‌شود · اطلاعات مکانی پاک</span>
            </div>
            <input type="file" accept="image/*" multiple hidden id="fileInput" />
            <div class="upload-progress" id="upProgress" hidden>
              <div class="upload-progress__bar"><span id="upBar"></span></div>
              <div class="upload-progress__label"><span id="upLabel">آماده‌سازی…</span><span id="upMeta"></span></div>
            </div>
          </section>

          <section class="sidecard">
            <div class="sidecard__title">${icon('sparkles')}چه حسی داشت؟</div>
            <div class="mood-grid" id="moodGrid">
              ${MOODS.map((m) => `<button type="button" class="mood-opt ${entry.mood === m.slug ? 'is-on' : ''}" data-mood="${m.slug}" style="color:${m.color}">
                <span class="swatch"></span><span style="color:var(--muted)">${esc(m.label)}</span>
              </button>`).join('')}
            </div>
            <div class="spread" style="gap:var(--sp-3);align-items:center">
              <span class="field__label" style="margin:0">${icon('star')}امتیاز</span>
              <div class="stars" id="stars">
                ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="${entry.rating >= n ? 'is-on' : ''}" aria-label="${fa(n)} از ۵">${icon('star')}</button>`).join('')}
              </div>
            </div>
            <label class="field">
              <span class="field__label">${icon('chart')}انرژی · <span id="energyVal">${fa(entry.energy || 3)}</span>/۵</span>
              <input class="range" type="range" min="1" max="5" step="1" id="energy" value="${entry.energy || 3}" />
            </label>
          </section>

          <section class="sidecard">
            <div class="sidecard__title">${icon('pin')}جزئیات</div>
            <label class="field">
              <span class="field__label">مکان</span>
              <input class="input" id="edLocation" placeholder="کجا بودی؟" value="${esc(entry.location || '')}" list="placeSuggest" />
              <datalist id="placeSuggest"></datalist>
            </label>
            <label class="field">
              <span class="field__label">آب‌وهوا</span>
              <select class="select" id="edWeather">
                <option value="">—</option>
                ${WEATHER.map((w) => `<option value="${esc(w)}" ${entry.weather === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field__label">رشته</span>
              <select class="select" id="edThread">
                <option value="">بدون رشته</option>
                ${threads.map((t) => `<option value="${esc(t.id)}" ${entry.thread_id === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}
              </select>
            </label>
          </section>

          <section class="sidecard">
            <div class="sidecard__title">${icon('tag')}برچسب‌ها</div>
            <div class="taginput" id="tagInput">
              <input type="text" id="tagField" placeholder="برچسب بنویس و ↵ بزن" aria-label="افزودن برچسب" />
            </div>
            <div class="suggest" id="tagSuggest"></div>
          </section>

          <section class="sidecard">
            <div class="sidecard__title">${icon('users')}آدم‌ها</div>
            <div class="taginput" id="peopleInput">
              <input type="text" id="peopleField" placeholder="چه کسی آنجا بود؟" aria-label="افزودن آدم" />
            </div>
          </section>

          <section class="sidecard" id="aiCard">
            <div class="sidecard__title">${icon('wand')}اصلاح با هوش مصنوعی</div>
            <div class="ai-levels" id="aiLevels">
              ${AI_LEVELS.map((l) => `<button type="button" class="ai-level ${l.level === 2 ? 'is-on' : ''}" data-level="${l.level}">
                <span class="ai-level__num">${fa(l.level)}</span>
                <span class="ai-level__meta"><strong>${esc(l.name)}</strong><em>${esc(l.short)}</em></span>
              </button>`).join('')}
            </div>
            <p class="ai-hint" id="aiStatus"></p>
            <button class="btn btn--sm btn--primary btn--block" id="aiRun" type="button" style="margin-top:4px">${icon('sparkles')}اصلاح کن</button>
            <div id="aiResult" hidden></div>
            <a class="linkbtn" href="#/settings" style="font-size:var(--fs-3xs);color:var(--faint);justify-self:start">مدل‌ها و رأی‌های من</a>
          </section>

          ${editingId ? `<section class="sidecard" style="border-color:rgba(207,106,106,.24)">
            <div class="sidecard__title" style="color:#d98a8a">${icon('alert')}منطقهٔ خطر</div>
            <button class="btn btn--sm btn--danger" id="deleteFrame">${icon('trash')}پاک کردن این قاب</button>
          </section>` : ''}
        </aside>
      </div>`;

    /* ── elements ─────────────────────────────────────────── */
    const bodyEl = qs('#edBody', root);
    const titleEl = qs('#edTitle', root);
    const dateEl = qs('#edDate', root);
    const timeEl = qs('#edTime', root);
    const countEl = qs('#edCount', root);
    const readEl = qs('#edRead', root);
    const saveState = qs('#saveState', root);
    const photoGrid = qs('#photoGrid', root);
    const tags = [...(entry.tags || [])];
    const people = [...(entry.people || [])];

    if (restored) {
      titleEl.value = draft.title ?? titleEl.value;
      bodyEl.innerHTML = sanitizeHtml(draft.body ?? bodyEl.innerHTML);
      if (draft.mood) qsa('#moodGrid [data-mood]', root).forEach((b) => b.classList.toggle('is-on', b.dataset.mood === draft.mood));
      qs('#discardDraft', root)?.addEventListener('click', () => {
        drafts.clear('new');
        qs('#draftBanner', root)?.remove();
        toast('پیش‌نویس دور ریخته شد', { type: 'info' });
      });
    }

    const setState = (kind, text) => {
      saveState.dataset.state = kind;
      saveState.innerHTML = `<span class="dot"></span><span>${esc(text)}</span>`;
    };

    const updateCounts = () => {
      const words = wordCount(htmlToText(bodyEl.innerHTML));
      countEl.textContent = `${fa(words)} کلمه`;
      readEl.textContent = `${fa(readMinutes(words))} دقیقه`;
    };

    const markDirty = () => { dirty = true; setState('idle', 'تغییرات ذخیره نشده'); };

    /* ── اصلاح با هوش مصنوعی ─────────────────────────────── */
    let aiLevel = 2;
    let aiRun = null;
    const aiStatus = qs('#aiStatus', root);
    const aiResult = qs('#aiResult', root);
    const aiBtn = qs('#aiRun', root);

    const renderAiLevels = () => {
      qsa('#aiLevels [data-level]', root).forEach((b) => {
        b.classList.toggle('is-on', Number(b.dataset.level) === aiLevel);
      });
      if (aiStatus && !aiRun) aiStatus.textContent = AI_LEVELS.find((l) => l.level === aiLevel)?.hint || '';
    };
    on(root, 'click', '#aiLevels [data-level]', (e, b) => {
      aiLevel = Number(b.dataset.level);
      aiRun = null;
      if (aiStatus) aiStatus.textContent = AI_LEVELS.find((l) => l.level === aiLevel)?.hint || '';
      renderAiLevels();
    });

    const showAiResult = (run) => {
      aiRun = run;
      if (!aiResult) return;
      aiResult.hidden = false;
      aiResult.innerHTML = `
        <div class="ai-result">
          <div class="ai-result__head">
            <span class="badge">${esc(run.model || 'مدل نامشخص')}</span>
            <span class="faint" style="font-size:var(--fs-3xs)">سطح ${fa(run.level || aiLevel)}</span>
          </div>
          <div class="ai-result__text">${esc(run.result || '')}</div>
          <div class="ai-result__acts">
            <button class="btn btn--sm btn--primary" data-ai="apply" type="button">${icon('check')}جایگزین کن</button>
            <button class="btn btn--sm btn--ghost" data-ai="copy" type="button">${icon('copy')}رونوشت</button>
            <span style="margin-inline-start:auto;display:flex;gap:4px">
              <button class="icon-btn ${run.feedback === 1 ? 'is-on' : ''}" data-ai="up" type="button" title="این مدل خوب بود">${icon('thumb-up')}</button>
              <button class="icon-btn ${run.feedback === -1 ? 'is-on' : ''}" data-ai="down" type="button" title="این مدل خوب نبود">${icon('thumb-down')}</button>
            </span>
          </div>
        </div>`;
    };

    aiBtn?.addEventListener('click', async () => {
      const text = htmlToText(bodyEl.innerHTML).trim();
      if (!text) { toast('اول چند جمله بنویس، بعد اصلاح کن', { type: 'info' }); bodyEl.focus(); return; }
      const previous = aiBtn.innerHTML;
      aiBtn.disabled = true;
      aiBtn.innerHTML = `${icon('refresh')}در حال نوشتن…`;
      aiStatus.textContent = 'مدل رایگان در حال خواندن متن است…';
      try {
        const out = await correct({ text, level: aiLevel, model: prefs.aiPreferredModel || '' });
        const run = await saveRun({
          entryId: entry.id || null, level: aiLevel, model: out.model, original: text, result: out.text,
        });
        showAiResult({ ...run, model: out.model, result: out.text, level: aiLevel });
        aiStatus.textContent = `نوشته شد با ${out.model}`;
      } catch (err) {
        aiStatus.textContent = err.message;
        toast(err.message, { type: 'error', timeout: 8000 });
      } finally {
        aiBtn.disabled = false;
        aiBtn.innerHTML = previous;
      }
    });

    on(aiResult, 'click', '[data-ai]', async (e, b) => {
      const act = b.dataset.ai;
      if (!aiRun) return;
      if (act === 'apply') {
        const html = String(aiRun.result || '').split(/\n{2,}/)
          .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') || '<p></p>';
        bodyEl.innerHTML = sanitizeHtml(html);
        markDirty();
        updateCounts();
        toast('متن جایگزین شد — حالا مال خودت است', { type: 'success' });
      }
      if (act === 'copy') {
        try { await navigator.clipboard.writeText(aiRun.result || ''); toast('رونوشت شد', { type: 'success' }); }
        catch { toast('رونوشت نشد', { type: 'error' }); }
      }
      if (act === 'up' || act === 'down') {
        const value = act === 'up' ? 1 : -1;
        const next = aiRun.feedback === value ? 0 : value;
        await setFeedback(aiRun.id, next);
        aiRun.feedback = next;
        qsa('[data-ai="up"], [data-ai="down"]', aiResult).forEach((x) => x.classList.remove('is-on'));
        if (next) b.classList.add('is-on');
        toast(next ? 'رأی ثبت شد — رتبهٔ مدل‌ها به‌روز می‌شود' : 'رأی برداشته شد', { type: 'success' });
      }
    });

    /* ── photos ───────────────────────────────────────────── */
    function renderPhotos() {
      photoGrid.innerHTML = photos.map((p, i) => `
        <div class="photo-tile" data-photo="${p.id}">
          <img src="${esc(p.src || '')}" alt="${esc(p.caption || '')}" loading="lazy" />
          ${coverId === p.id ? '<span class="photo-tile__cover">کاور</span>' : ''}
          <div class="photo-tile__acts">
            <button type="button" class="photo-tile__act" data-act="cover" data-i="${i}" title="کاور شود">${icon('star')}</button>
            <button type="button" class="photo-tile__act" data-act="caption" data-i="${i}" title="توضیح عکس">${icon('pencil')}</button>
            <button type="button" class="photo-tile__act" data-act="remove" data-i="${i}" title="حذف">${icon('trash')}</button>
          </div>
        </div>`).join('') + (photos.length < 12 ? `
        <button type="button" class="photo-tile photo-tile--add" id="addPhotoTile">
          ${icon('plus', 'ico--sm')}<span style="font-size:9px">افزودن</span>
        </button>` : '');
      qs('#addPhotoTile', photoGrid)?.addEventListener('click', () => qs('#fileInput', root).click());
    }

    on(photoGrid, 'click', '[data-act]', async (e, btn) => {
      const i = Number(btn.dataset.i);
      const photo = photos[i];
      if (!photo) return;
      if (btn.dataset.act === 'cover') {
        coverId = photo.id;
        markDirty();
        renderPhotos();
      }
      if (btn.dataset.act === 'caption') {
        const cap = window.prompt('توضیح این عکس', photo.caption || '');
        if (cap != null) { photo.caption = cap.trim().slice(0, 180); markDirty(); renderPhotos(); }
      }
      if (btn.dataset.act === 'remove') {
        const ok = await confirmDialog({ title: 'عکس حذف شود؟', message: 'از این قاب برداشته می‌شود.', confirmLabel: 'حذف', danger: true });
        if (!ok) return;
        if (photo.path || photo.localKey) await db.photos.remove(photo);
        if (photo._blob && photo.src) URL.revokeObjectURL(photo.src);
        photos = photos.filter((p) => p.id !== photo.id);
        if (coverId === photo.id) coverId = photos[0]?.id || null;
        markDirty();
        renderPhotos();
      }
    });

    const upProgress = qs('#upProgress', root);
    const upBar = qs('#upBar', root);
    const upLabel = qs('#upLabel', root);
    const upMeta = qs('#upMeta', root);

    async function addFiles(fileList) {
      const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      upProgress.hidden = false;
      let done = 0;
      const results = [];
      for (const file of files) {
        if (photos.length + results.length >= 12) { toast('هر قاب حداکثر ۱۲ عکس می‌گیرد', { type: 'info' }); break; }
        upLabel.textContent = `آماده‌سازی ${fa(done + 1)} از ${fa(files.length)}…`;
        upMeta.textContent = file.name;
        upBar.style.width = `${Math.round((done / files.length) * 100)}%`;
        try {
          const processed = await processImage(file);
          const url = URL.createObjectURL(processed.blob);
          results.push({
            id: uid(),
            _blob: processed.blob,
            _ext: processed.ext,
            src: url,
            w: processed.width,
            h: processed.height,
            caption: '',
            originalSize: processed.originalSize,
            resized: processed.resized,
          });
        } catch (err) {
          toast(err.message, { type: 'error' });
        }
        done += 1;
      }
      upBar.style.width = '100%';
      photos.push(...results);
      renderPhotos();
      markDirty();
      const resizedCount = results.filter((r) => r.resized).length;
      const savedBytes = results.reduce((n, r) => n + r.originalSize, 0);
      upLabel.textContent = results.length ? `${fa(results.length)} عکس آماده است` : 'چیزی اضافه نشد';
      upMeta.textContent = resizedCount
        ? `${fa(resizedCount)} عکس به ۷۲۰ پیکسل رسید · اصل ${formatBytes(savedBytes)}`
        : 'از قبل زیر ۷۲۰ پیکسل بود';
      setTimeout(() => { if (upProgress) upProgress.hidden = true; }, 3600);
      if (!photos.length) toast('تصویر معتبری پیدا نشد', { type: 'error' });
      if (results.length && !coverId) { coverId = photos[0].id; renderPhotos(); }
      if (results.length) toast(`${fa(results.length)} عکس اضافه شد`, { type: 'success' });
    }

    const fileInput = qs('#fileInput', root);
    fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
    const dropzone = qs('#dropzone', root);
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    ['dragenter', 'dragover'].forEach((t) => dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.remove('is-over'); }));
    dropzone.addEventListener('drop', (e) => addFiles(imagesFromDataTransfer(e.dataTransfer)));
    bodyEl.addEventListener('paste', (e) => {
      const imgs = imagesFromDataTransfer(e.clipboardData);
      if (imgs.length) { e.preventDefault(); addFiles(imgs); }
    });

    /* ── tags & people ────────────────────────────────────── */
    function renderTags() {
      const input = qs('#tagField', root);
      const wrap = qs('#tagInput', root);
      qsa('.chip', wrap).forEach((c) => c.remove());
      tags.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'chip chip--xs';
        chip.innerHTML = `${esc(t)}<button type="button" aria-label="حذف ${esc(t)}">${icon('close', 'ico--sm')}</button>`;
        chip.querySelector('button').addEventListener('click', () => {
          tags.splice(tags.indexOf(t), 1); markDirty(); renderTags(); renderSuggest();
        });
        wrap.insertBefore(chip, input);
      });
      const suggestWrap = qs('#tagSuggest', root);
      const remaining = allTags.filter((t) => !tags.includes(t)).slice(0, 8);
      suggestWrap.innerHTML = remaining.map((t) => `<button type="button" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
    }
    function renderSuggest() {
      renderTags();
    }
    function renderPeople() {
      const input = qs('#peopleField', root);
      const wrap = qs('#peopleInput', root);
      qsa('.chip', wrap).forEach((c) => c.remove());
      people.forEach((p) => {
        const chip = document.createElement('span');
        chip.className = 'chip chip--xs';
        chip.innerHTML = `${esc(p)}<button type="button" aria-label="حذف ${esc(p)}">${icon('close', 'ico--sm')}</button>`;
        chip.querySelector('button').addEventListener('click', () => {
          people.splice(people.indexOf(p), 1); markDirty(); renderPeople();
        });
        wrap.insertBefore(chip, input);
      });
    }

    const addTag = (raw) => {
      const t = String(raw || '').replace(/^#/, '').trim().slice(0, 28);
      if (!t || tags.includes(t) || tags.length >= 20) return;
      tags.push(t); markDirty(); renderTags();
    };
    qs('#tagField', root).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(e.target.value);
        e.target.value = '';
      }
      if (e.key === 'Backspace' && !e.target.value && tags.length) { tags.pop(); renderTags(); markDirty(); }
    });
    on(root, 'click', '#tagSuggest button', (e, b) => addTag(b.dataset.tag));

    const addPerson = (raw) => {
      const p = String(raw || '').trim().slice(0, 40);
      if (!p || people.includes(p) || people.length >= 20) return;
      people.push(p); markDirty(); renderPeople();
    };
    qs('#peopleField', root).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addPerson(e.target.value);
        e.target.value = '';
      }
    });

    /* ── mood / rating / energy ───────────────────────────── */
    let mood = entry.mood || '';
    let rating = entry.rating || 0;
    let energy = entry.energy || 3;

    on(root, 'click', '#moodGrid [data-mood]', (e, b) => {
      mood = mood === b.dataset.mood ? '' : b.dataset.mood;
      qsa('#moodGrid [data-mood]', root).forEach((x) => x.classList.toggle('is-on', x.dataset.mood === mood));
      markDirty();
    });

    on(root, 'click', '#stars [data-star]', (e, b) => {
      const n = Number(b.dataset.star);
      rating = rating === n ? 0 : n;
      qsa('#stars [data-star]', root).forEach((s) => s.classList.toggle('is-on', Number(s.dataset.star) <= rating));
      markDirty();
    });

    qs('#energy', root).addEventListener('input', (e) => {
      energy = Number(e.target.value);
      qs('#energyVal', root).textContent = fa(energy);
      markDirty();
    });

    /* ── rich text toolbar ────────────────────────────────── */
    qsa('#edToolbar [data-cmd]', root).forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        bodyEl.focus();
        if (cmd === 'h2') document.execCommand('formatBlock', false, 'h2');
        else if (cmd === 'blockquote') document.execCommand('formatBlock', false, 'blockquote');
        else if (cmd === 'hr') document.execCommand('insertHorizontalRule');
        else if (cmd === 'link') {
          const url = window.prompt('نشانی پیوند', 'https://');
          if (url && /^(https?:|mailto:)/i.test(url)) document.execCommand('createLink', false, url);
        } else document.execCommand(cmd);
        markDirty();
        updateCounts();
        syncToolbar();
      });
    });

    function syncToolbar() {
      if (!selectionInside(bodyEl)) return;
      const st = activeCommands();
      qsa('#edToolbar [data-cmd]', root).forEach((btn) => {
        const cmd = btn.dataset.cmd;
        const on = st[cmd] || (cmd === 'h2' && st.block === 'h2') || (cmd === 'blockquote' && st.block === 'blockquote');
        btn.classList.toggle('is-on', !!on);
      });
    }
    document.addEventListener('selectionchange', syncToolbar);

    bodyEl.addEventListener('input', () => { markDirty(); updateCounts(); });
    bodyEl.addEventListener('paste', (e) => {
      if (imagesFromDataTransfer(e.clipboardData).length) return;
      const text = e.clipboardData.getData('text/plain');
      if (text) {
        e.preventDefault();
        document.execCommand('insertText', false, text);
      }
    });
    bodyEl.addEventListener('drop', (e) => {
      const imgs = imagesFromDataTransfer(e.dataTransfer);
      if (imgs.length) { e.preventDefault(); addFiles(imgs); }
    });

    titleEl.addEventListener('input', markDirty);
    dateEl.addEventListener('change', () => { markDirty(); renderStamp(); });
    timeEl.addEventListener('change', markDirty);
    qs('#edLocation', root).addEventListener('input', markDirty);
    qs('#edWeather', root).addEventListener('change', markDirty);
    qs('#edThread', root).addEventListener('change', markDirty);

    const renderStamp = () => {
      qs('#edStamp', root).textContent = fmtDate(dateEl.value, 'long');
    };
    renderStamp();

    /* ── autosave draft + save ────────────────────────────── */
    const persistDraft = debounce(() => {
      if (editingId) return;
      if (!titleEl.value && htmlToText(bodyEl.innerHTML).length < 2) return;
      drafts.write('new', {
        title: titleEl.value,
        body: bodyEl.innerHTML,
        mood,
        savedAt: Date.now(),
      });
      setState('saved', 'پیش‌نویس روی این دستگاه ماند');
    }, 1200);
    bodyEl.addEventListener('input', persistDraft);
    titleEl.addEventListener('input', persistDraft);

    async function save({ stay = false } = {}) {
      if (saving) return;
      const plain = htmlToText(bodyEl.innerHTML);
      if (!titleEl.value.trim() && !plain.trim() && !photos.length) {
        toast('یک عنوان، چند کلمه یا یک عکس لازم است', { type: 'info' });
        titleEl.focus();
        return;
      }
      saving = true;
      qs('#saveBtn', root).disabled = true;
      setState('saving', 'در حال ذخیره…');
      try {
        const finalPhotos = [];
        for (const photo of photos) {
          if (photo._blob) {
            setState('saving', `بارگذاری ${fa(finalPhotos.length + 1)} از ${fa(photos.length)}…`);
            if (useCloud()) {
              const path = await db.photos.upload(photo._blob, photo._ext || 'webp');
              finalPhotos.push({ id: photo.id, path, w: photo.w, h: photo.h, caption: photo.caption || '' });
            } else {
              const { key } = await db.photos.storeLocal(photo._blob, photo._ext || 'webp');
              finalPhotos.push({ id: photo.id, localKey: key, w: photo.w, h: photo.h, caption: photo.caption || '' });
            }
            URL.revokeObjectURL(photo.src);
          } else {
            finalPhotos.push({ id: photo.id, path: photo.path, localKey: photo.localKey, w: photo.w, h: photo.h, caption: photo.caption || '' });
          }
        }
        const coverPhoto = finalPhotos.find((p) => p.id === coverId) || finalPhotos[0];
        const payload = {
          ...entry,
          title: titleEl.value.trim(),
          body: sanitizeHtml(bodyEl.innerHTML),
          happened_on: dateEl.value || toISODate(),
          happened_at: timeEl.value || '',
          mood,
          rating,
          energy,
          weather: qs('#edWeather', root).value,
          location: qs('#edLocation', root).value.trim(),
          thread_id: qs('#edThread', root).value || null,
          tags,
          people,
          photos: finalPhotos.map(({ id, ...p }) => p),
          cover_url: coverPhoto ? (coverPhoto.path || coverPhoto.localKey || '') : '',
        };
        const saved = await db.entries.save(payload);
        photos = (saved.photos || []).map((p) => ({ ...p, id: p.id || uid() }));
        coverId = photos[0]?.id || null;
        dirty = false;
        drafts.clear('new');
        setState('saved', `ذخیره شد ${new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`);
        toast(editingId ? 'قاب به‌روز شد' : 'قاب به روایت اضافه شد', { type: 'success' });
        bus.emit('entries:changed');
        if (!stay && !editingId) {
          navigate(`/frame/${saved.id}`);
        } else if (!editingId) {
          navigate(`/write/${saved.id}`);
        } else {
          entry = saved;
          renderPhotos();
        }
      } catch (err) {
        setState('idle', 'ذخیره نشد');
        toast(err.message || 'این قاب ذخیره نشد', { type: 'error', timeout: 6000 });
      } finally {
        saving = false;
        qs('#saveBtn', root).disabled = false;
      }
    }

    qs('#saveBtn', root).addEventListener('click', () => save());
    qs('#promptBtn', root).addEventListener('click', () => {
      const p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
      bodyEl.focus();
      const sel = window.getSelection();
      if (sel && bodyEl.contains(sel.anchorNode)) {
        document.execCommand('insertHTML', false, `<p><strong>${esc(p)}</strong></p><p><br></p>`);
      } else {
        bodyEl.innerHTML += `<p><strong>${esc(p)}</strong></p><p><br></p>`;
      }
      markDirty();
      updateCounts();
    });

    qs('#deleteFrame', root)?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'این قاب پاک شود؟',
        message: 'قاب و عکس‌هایش برای همیشه از گنجینه حذف می‌شوند.',
        confirmLabel: 'برای همیشه پاک کن',
        danger: true,
      });
      if (!ok) return;
      try {
        await db.entries.remove(editingId);
        toast('قاب پاک شد', { type: 'success' });
        bus.emit('entries:changed');
        navigate('/timeline');
      } catch (err) { toast(err.message, { type: 'error' }); }
    });

    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) {
        e.preventDefault();
        save({ stay: true });
      }
      if (e.key === 'Escape' && !document.querySelector('.overlay')) {
        e.preventDefault();
        leave();
      }
    };
    document.addEventListener('keydown', onKey);

    async function leave() {
      if (dirty && prefs.confirmDelete) {
        const ok = await confirmDialog({
          title: 'بدون ذخیره بروی؟',
          message: 'تغییرات هنوز در روایت نیستند. پیش‌نویس روی این دستگاه می‌ماند، اما خود قاب خالی می‌ماند.',
          confirmLabel: 'برو',
          cancelLabel: 'ادامهٔ نوشتن',
        });
        if (!ok) return;
      }
      navigate(editingId ? `/frame/${editingId}` : '/timeline');
    }

    qs('.ed-head__back', root).addEventListener('click', (e) => {
      e.preventDefault();
      leave();
    });

    const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('selectionchange', syncToolbar);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('hashchange', onHash);
      photos.forEach((p) => { if (p._blob && p.src) URL.revokeObjectURL(p.src); });
    };
    function onHash() { cleanup(); }
    window.addEventListener('hashchange', onHash);

    /* ── go ───────────────────────────────────────────────── */
    renderPhotos();
    renderTags();
    renderPeople();
    updateCounts();
    renderAiLevels();
    qsa('#moodGrid [data-mood]', root).forEach((b) => { b.style.color = moodColor(b.dataset.mood); });

    qs('#placeSuggest', root).innerHTML = '';
    db.entries.all().then((all) => {
      const places = [...new Set(all.map((e) => e.location).filter(Boolean))].slice(0, 40);
      qs('#placeSuggest', root).innerHTML = places.map((p) => `<option value="${esc(p)}"></option>`).join('');
    }).catch(() => {});

    setTimeout(() => (editingId ? bodyEl : titleEl).focus({ preventScroll: true }), 60);
    if (promptText) {
      setState('idle', 'پیشنهاد در متن گذاشته شد');
    }
    void state;
  },
};
