import { esc, icon, qs, on } from '../lib/dom.js';
import { fa, fmtDate, fmtTime, readMinutes, relativeDays, wordCount, excerptFromHtml } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { toast, menu, confirmDialog } from '../lib/ui.js';
import { sanitizeHtml } from '../lib/richtext.js';
import { downloadText } from '../lib/images.js';
import { db, coverOf } from '../services/db.js';
import { openLightbox } from '../ui/lightbox.js';
import { bus } from '../state.js';
import { emptyState, moodColor, moodLabel, tagChips } from '../ui/parts.js';

export const title = 'قاب';
export const sub = () => '';

export default {
  title,
  sub,
  async mount(root, ctx) {
    root.innerHTML = `<div class="reader"><div class="skeleton" style="height:26px;width:60%"></div><div class="skeleton" style="height:54px;width:85%;margin-top:14px"></div><div class="skeleton" style="height:220px;margin-top:24px"></div></div>`;
    let entry = null;
    let all = [];
    try {
      entry = await db.entries.get(ctx.params.id);
      all = await db.entries.all();
    } catch (err) {
      root.innerHTML = emptyState({ iconName: 'alert', title: 'این قاب باز نشد', text: err.message });
      return;
    }
    if (!entry) {
      root.innerHTML = emptyState({
        iconName: 'reel',
        title: 'این قاب اینجا نیست',
        text: 'شاید پاک شده باشد، یا به گنجینهٔ دیگری تعلق داشته باشد.',
        action: '<a class="btn btn--outline" href="#/timeline">بازگشت به خط زمان</a>',
      });
      return;
    }

    this.title = entry.title || 'قاب بی‌نام';
    this.sub = () => fmtDate(entry.happened_on, 'long');
    bus.emit('shell:title');

    const sorted = [...all].sort((a, b) => String(a.happened_on).localeCompare(String(b.happened_on)));
    const idx = sorted.findIndex((e) => e.id === entry.id);
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
    const thread = entry.thread_id ? (await db.threads.list()).find((t) => t.id === entry.thread_id) : null;
    const cover = coverOf(entry);
    const otherPhotos = (entry.photos || []).filter((p) => p.src && p.src !== cover);
    const words = entry.word_count || wordCount(entry.body_text || '');

    root.innerHTML = `
      <article class="reader">
        <div class="reader__kicker">
          ${entry.mood ? `<span class="chip chip--mood is-on" style="color:${moodColor(entry.mood)}"><span class="chip__dot"></span>${esc(moodLabel(entry.mood))}</span>` : ''}
          ${entry.favorite ? `<span class="chip is-on">${icon('star')}محبوب</span>` : ''}
          ${entry.pinned ? `<span class="chip is-on">${icon('pinmark')}سنجاق‌شده</span>` : ''}
          ${thread ? `<a class="chip" href="#/thread/${esc(thread.id)}">${icon('threads')}${esc(thread.title)}</a>` : ''}
          <span class="faint" style="font-size:var(--fs-3xs);margin-inline-start:auto">${esc(relativeDays(entry.happened_on))}</span>
        </div>

        <h1 class="reader__title">${esc(entry.title || excerptFromHtml(entry.body, 90) || 'قاب بی‌نام')}</h1>

        <div class="reader__sub">
          <span>${esc(fmtDate(entry.happened_on, 'long'))}</span>
          ${entry.happened_at ? `<span style="opacity:.4">·</span><span>${esc(fmtTime(entry.happened_at))}</span>` : ''}
          ${entry.location ? `<span style="opacity:.4">·</span><span>${icon('pin', 'ico--sm')} ${esc(entry.location)}</span>` : ''}
          ${entry.weather ? `<span style="opacity:.4">·</span><span>${esc(entry.weather)}</span>` : ''}
          <span style="opacity:.4">·</span><span>${fa(words)} کلمه · ${fa(readMinutes(words))} دقیقه</span>
        </div>

        ${cover ? `<div class="reader__cover"><img src="${esc(cover)}" alt="${esc(entry.title || '')}" /></div>` : ''}

        <div class="reader__body">${sanitizeHtml(entry.body) || '<p class="faint">این قاب فقط عکس دارد — بدون یک کلمه.</p>'}</div>

        ${(entry.rating || entry.people?.length || entry.energy !== 3) ? `<div class="row row--wrap" style="margin-top:var(--sp-5);gap:var(--sp-4)">
          ${entry.rating ? `<span class="row" style="gap:3px;color:var(--mood-radiant)">${Array.from({ length: 5 }).map((_, i) => `<svg class="ico ico--sm" style="fill:${i < entry.rating ? 'currentColor' : 'none'};opacity:${i < entry.rating ? 1 : .3}"><use href="#i-star"/></svg>`).join('')}<span class="faint" style="font-size:var(--fs-2xs);margin-inline-start:4px">${fa(entry.rating)}/۵</span></span>` : ''}
          ${entry.energy !== 3 ? `<span class="faint" style="font-size:var(--fs-2xs)">انرژی ${fa(entry.energy)}/۵</span>` : ''}
          ${(entry.people || []).length ? `<span class="row" style="gap:5px;font-size:var(--fs-2xs)">${icon('users', 'ico--sm')}${entry.people.map((p) => `<span class="tagchip" style="--x:0">${esc(p)}</span>`).join('')}</span>` : ''}
        </div>` : ''}

        ${(entry.tags || []).length ? `<div class="row row--wrap" style="margin-top:var(--sp-4)">${tagChips(entry.tags, 12)}</div>` : ''}

        ${otherPhotos.length ? `<div class="reader__photos">${otherPhotos.map((p, i) => `
          <figure data-photo="${i}"><img src="${esc(p.src)}" alt="${esc(p.caption || '')}" loading="lazy" />${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}

        <footer class="reader__foot">
          <button class="btn btn--sm btn--outline" id="editFrame">${icon('pencil')}ویرایش</button>
          <button class="btn btn--sm ${entry.favorite ? 'btn--primary' : 'btn--ghost'}" id="favFrame">${icon('star')}${entry.favorite ? 'محبوب است' : 'محبوب'}</button>
          <button class="btn btn--sm btn--ghost" id="pinFrame">${icon('pinmark')}${entry.pinned ? 'برداشتن سنجاق' : 'سنجاق'}</button>
          <button class="btn btn--sm btn--ghost" id="printFrame">${icon('printer')}چاپ</button>
          <button class="icon-btn" id="moreFrame" aria-label="بیشتر">${icon('more')}</button>
          <div style="margin-inline-start:auto" class="row" id="frameNav">
            ${prev ? `<button class="btn btn--sm btn--ghost" data-nav="${esc(prev.id)}" title="${esc(prev.title || fmtDate(prev.happened_on))}">${icon('chevron-right')}پیشین</button>` : ''}
            ${next ? `<button class="btn btn--sm btn--ghost" data-nav="${esc(next.id)}" title="${esc(next.title || fmtDate(next.happened_on))}">بعدی${icon('chevron-left')}</button>` : ''}
          </div>
        </footer>
      </article>`;

    qs('#editFrame', root).addEventListener('click', () => navigate(`/write/${entry.id}`));
    qs('#favFrame', root).addEventListener('click', async () => {
      await db.entries.toggleFlag(entry.id, 'favorite');
      toast(entry.favorite ? 'از محبوب‌ها برداشته شد' : 'به محبوب‌ها اضافه شد', { type: 'success' });
      bus.emit('entries:changed');
      this.mount(root, ctx);
    });
    qs('#pinFrame', root).addEventListener('click', async () => {
      await db.entries.toggleFlag(entry.id, 'pinned');
      toast(entry.pinned ? 'سنجاق برداشته شد' : 'سنجاق شد', { type: 'success' });
      bus.emit('entries:changed');
      this.mount(root, ctx);
    });
    qs('#printFrame', root).addEventListener('click', () => window.print());
    qs('#moreFrame', root).addEventListener('click', (e) => {
      menu(e.currentTarget, [
        {
          label: 'رونوشت پیوند قاب', icon: 'copy', onSelect: async () => {
            try {
              await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/frame/${entry.id}`);
              toast('پیوند رونوشت شد', { type: 'success' });
            } catch { toast('رونوشت نشد', { type: 'error' }); }
          },
        },
        {
          label: 'خروجی مارک‌داون', icon: 'download', onSelect: () => {
            const md = `# ${entry.title || 'قاب بی‌نام'}\n\n*${fmtDate(entry.happened_on, 'long')}*\n\n${(entry.body_text || '').trim()}\n\n${(entry.tags || []).map((t) => '#' + t).join(' ')}\n`;
            downloadText(md, `frame-${entry.happened_on}.md`, 'text/markdown');
            toast('فایل مارک‌داون ذخیره شد', { type: 'success' });
          },
        },
        {
          label: 'خروجی JSON', icon: 'download', onSelect: () => {
            downloadText(JSON.stringify(entry, null, 2), `frame-${entry.happened_on}.json`, 'application/json');
            toast('فایل JSON ذخیره شد', { type: 'success' });
          },
        },
        '-',
        {
          label: 'پاک کردن قاب', icon: 'trash', danger: true, onSelect: async () => {
            const ok = await confirmDialog({
              title: 'این قاب پاک شود؟',
              message: 'قاب و عکس‌هایش از گنجینه حذف می‌شوند. این کار بازگشت‌پذیر نیست.',
              confirmLabel: 'پاک کن برای همیشه', danger: true,
            });
            if (!ok) return;
            await db.entries.remove(entry.id);
            toast('قاب پاک شد', { type: 'success' });
            bus.emit('entries:changed');
            navigate('/timeline');
          },
        },
      ]);
    });

    on(root, 'click', '[data-nav]', (e, t) => navigate(`/frame/${t.dataset.nav}`));
    on(root, 'click', '.reader__photos figure', (e, t) => {
      const list = otherPhotos.map((p) => ({ ...p, entryId: entry.id, date: entry.happened_on, title: entry.title, location: entry.location }));
      openLightbox(list, Number(t.dataset.photo));
    });
    qs('.reader__cover', root)?.addEventListener('click', () => {
      const list = (entry.photos || []).map((p) => ({ ...p, entryId: entry.id, date: entry.happened_on, title: entry.title, location: entry.location }));
      openLightbox(list, Math.max(0, list.findIndex((p) => p.src === cover)));
    });
  },
};
