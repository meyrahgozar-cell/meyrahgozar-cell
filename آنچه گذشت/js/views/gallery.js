import { esc, icon, qs, on } from '../lib/dom.js';
import { fa, fmtDate, jParts, plural } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { db } from '../services/db.js';
import { MOODS } from '../config.js';
import { emptyState } from '../ui/parts.js';
import { openLightbox } from '../ui/lightbox.js';

export const title = 'آلبوم';
export const sub = () => 'همهٔ عکس‌های این روایت';

export default {
  title,
  sub,
  async mount(root) {
    root.innerHTML = `<div class="gallery">${Array.from({ length: 9 }).map((_, i) => `<div class="skeleton" style="height:${140 + (i % 4) * 46}px;margin-bottom:12px;break-inside:avoid"></div>`).join('')}</div>`;

    let entries = [];
    try { entries = await db.entries.all(); } catch (err) {
      root.innerHTML = emptyState({ iconName: 'alert', title: 'آلبوم بارگذاری نشد', text: err.message });
      return;
    }

    const photos = [];
    entries.forEach((e) => {
      (e.photos || []).forEach((p) => {
        if (!p.src) return;
        photos.push({
          entryId: e.id,
          src: p.src,
          caption: p.caption || '',
          date: e.happened_on,
          title: e.title || 'قاب بی‌نام',
          location: e.location || '',
          mood: e.mood || '',
          tags: e.tags || [],
          jy: jParts(e.happened_on).year,
        });
      });
    });
    photos.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const years = [...new Set(photos.map((p) => p.jy))].sort((a, b) => b - a);
    const filters = { year: '', mood: '' };
    let currentList = [];

    root.innerHTML = `
      <div class="tl-toolbar">
        <div class="row" style="gap:8px;align-items:baseline">
          <span class="serif" style="font-size:var(--fs-2xl)">${fa(photos.length)}</span>
          <span class="faint" style="font-size:var(--fs-xs)">عکس · ${plural(entries.filter((e) => e.photos?.length).length, 'قاب')}</span>
        </div>
        <div style="margin-inline-start:auto" class="row row--wrap">
          <select class="input tl-select" id="gYear" aria-label="سال">
            <option value="">همهٔ سال‌ها</option>
            ${years.map((y) => `<option value="${y}">${fa(y)}</option>`).join('')}
          </select>
          <select class="input tl-select" id="gMood" aria-label="حال‌وهوا">
            <option value="">همهٔ حال‌وهواها</option>
            ${MOODS.map((m) => `<option value="${m.slug}">${esc(m.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="gBody"></div>`;

    const body = qs('#gBody', root);

    function draw() {
      const list = photos.filter((p) => (!filters.year || String(p.jy) === filters.year) && (!filters.mood || p.mood === filters.mood));
      currentList = list;
      if (!list.length) {
        body.innerHTML = emptyState({
          iconName: 'image',
          title: photos.length ? 'عکسی با این فیلتر نیست' : 'هنوز عکسی نیست',
          text: photos.length
            ? 'سال یا حال‌وهوای دیگری را امتحان کن.'
            : 'هر قاب می‌تواند عکس داشته باشد؛ پیش از ذخیره، عکس به ۷۲۰ پیکسل کوچک می‌شود.',
          action: photos.length ? '' : '<button class="btn btn--primary" data-action="new-frame">' + icon('camera') + 'اولین عکس را اضافه کن</button>',
        });
        return;
      }
      body.innerHTML = `<div class="gallery">${list.map((p, i) => `
        <button class="gallery__item" data-i="${i}" type="button" aria-label="باز کردن عکس">
          <img src="${esc(p.src)}" alt="${esc(p.caption || p.title)}" loading="lazy" decoding="async" />
          <span class="gallery__cap">
            <span class="truncate">${esc(p.caption || p.title)}</span>
            <small>${esc(fmtDate(p.date, 'short'))}</small>
          </span>
        </button>`).join('')}</div>`;
    }

    on(body, 'click', '.gallery__item', (e, t) => {
      openLightbox(currentList, Number(t.dataset.i));
    });

    qs('#gYear', root).addEventListener('change', (e) => { filters.year = e.target.value; draw(); });
    qs('#gMood', root).addEventListener('change', (e) => { filters.mood = e.target.value; draw(); });
    draw();

    on(root, 'click', '[data-open]', (e, t) => navigate(`/frame/${t.dataset.open}`));
  },
};
