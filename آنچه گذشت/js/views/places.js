import { esc, icon } from '../lib/dom.js';
import { fa, fmtDate, jParts, plural } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { db, coverOf } from '../services/db.js';
import { emptyState } from '../ui/parts.js';

export const title = 'مکان‌ها';
export const sub = () => 'جغرافیای روایت';

export default {
  title,
  sub,
  async mount(root) {
    root.innerHTML = `<div class="places-grid">${Array.from({ length: 4 }).map(() => '<div class="skeleton" style="height:190px"></div>').join('')}</div>`;
    try {
      const entries = await db.entries.all();
      const map = new Map();
      entries.forEach((e) => {
        const loc = (e.location || '').trim();
        if (!loc) return;
        const key = loc.toLowerCase();
        if (!map.has(key)) map.set(key, { label: loc, entries: [] });
        map.get(key).entries.push(e);
      });
      const places = [...map.values()].sort((a, b) => b.entries.length - a.entries.length);
      const unplaced = entries.filter((e) => !(e.location || '').trim()).length;

      if (!places.length) {
        root.innerHTML = emptyState({
          iconName: 'pin',
          title: 'هنوز مکانی نیست',
          text: 'به یک قاب جا اضافه کن — یک شهر، یک اتاق، یک نام — تا اطلس خودش ساخته شود.',
          action: '<button class="btn btn--primary" data-action="new-frame">' + icon('plus') + 'نوشتن قاب</button>',
        });
        return;
      }

      root.innerHTML = `
        <div class="spread" style="margin-bottom:var(--sp-5)">
          <p class="muted" style="font-size:var(--fs-sm)">${plural(places.length, 'مکان')} در ${plural(entries.length - unplaced, 'قاب')}${unplaced ? ` · ${plural(unplaced, 'قاب')} بدون مکان` : ''}</p>
        </div>
        <div class="places-grid stagger">
          ${places.map((p) => {
            const covers = p.entries.map(coverOf).filter(Boolean).slice(0, 3);
            const sorted = [...p.entries].sort((a, b) => String(a.happened_on).localeCompare(String(b.happened_on)));
            return `<button class="place-card" data-place="${esc(p.label)}" type="button">
              <div class="place-card__strip">
                ${[0, 1, 2].map((i) => covers[i] ? `<img src="${esc(covers[i])}" alt="" loading="lazy" />` : '<div></div>').join('')}
              </div>
              <div class="place-card__body">
                <strong class="truncate">${icon('pin', 'ico--sm')} ${esc(p.label)}</strong>
                <span>${plural(p.entries.length, 'قاب')} · ${esc(fmtDate(sorted[0].happened_on, 'month'))} تا ${esc(fmtDate(sorted[sorted.length - 1].happened_on, 'month'))}</span>
              </div>
            </button>`;
          }).join('')}
        </div>`;

      root.querySelectorAll('[data-place]').forEach((btn) => {
        btn.addEventListener('click', () => navigate(`/timeline?q=${encodeURIComponent(btn.dataset.place)}`));
      });
      void fa; void jParts;
    } catch (err) {
      root.innerHTML = emptyState({ iconName: 'alert', title: 'مکان‌ها بارگذاری نشد', text: err.message });
    }
  },
};
