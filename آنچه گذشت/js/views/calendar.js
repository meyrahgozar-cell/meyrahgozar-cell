import { esc, icon, qs, qsa, on } from '../lib/dom.js';
import { DOW, fa, fmtDate, jParts, plural, toISODate } from '../lib/format.js';
import { jMonthLength, toGregorian } from '../lib/jalali.js';
import { navigate } from '../lib/router.js';
import { db, coverOf } from '../services/db.js';
import { emptyState, entryCard, entryMenu, moodColor, moodLabel } from '../ui/parts.js';
import { MONTHS } from '../lib/format.js';

export const title = 'تقویم';
export const sub = () => 'روایت، روز به روز';

const pad = (n) => String(n).padStart(2, '0');

export default {
  title,
  sub,
  async mount(root) {
    let entries = [];
    try { entries = await db.entries.all(); } catch (err) {
      root.innerHTML = emptyState({ iconName: 'alert', title: 'تقویم بارگذاری نشد', text: err.message });
      return;
    }

    const byDay = new Map();
    entries.forEach((e) => {
      const k = String(e.happened_on).slice(0, 10);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(e);
    });

    const todayISO = toISODate(new Date());
    const todayJ = jParts(todayISO);
    const view = { jy: todayJ.year, jm: todayJ.month, selected: todayISO };

    root.innerHTML = `
      <div class="cal-head">
        <h2 id="calTitle"></h2>
        <div class="row" style="gap:4px">
          <button class="icon-btn" id="calPrev" aria-label="ماه پیش">${icon('chevron-right')}</button>
          <button class="btn btn--sm btn--outline" id="calToday">امروز</button>
          <button class="icon-btn" id="calNext" aria-label="ماه بعد">${icon('chevron-left')}</button>
        </div>
        <div class="row faint" style="margin-inline-start:auto;gap:var(--sp-3)">
          <span class="filter-summary" id="calStats"></span>
        </div>
      </div>
      <div class="cal" id="calGrid"></div>
      <div id="calDay" style="margin-top:var(--sp-7)"></div>`;

    const grid = qs('#calGrid', root);
    const dayPanel = qs('#calDay', root);

    const isoOf = (jy, jm, jd) => {
      const g = toGregorian(jy, jm, jd);
      return toISODate(new Date(g.gy, g.gm - 1, g.gd));
    };

    function drawGrid() {
      const { jy, jm } = view;
      qs('#calTitle', root).textContent = `${MONTHS[jm - 1]} ${fa(jy)}`;

      const length = jMonthLength(jy, jm);
      const g = toGregorian(jy, jm, 1);
      const firstDow = new Date(g.gy, g.gm - 1, g.gd).getDay(); // 0=یکشنبه
      const offset = (firstDow + 1) % 7; // شنبه = ۰

      const prevJy = jm === 1 ? jy - 1 : jy;
      const prevJm = jm === 1 ? 12 : jm - 1;
      const prevLen = jMonthLength(prevJy, prevJm);

      const nextJy = jm === 12 ? jy + 1 : jy;
      const nextJm = jm === 12 ? 1 : jm + 1;

      const dowOrder = [6, 0, 1, 2, 3, 4, 5];
      let html = dowOrder.map((d) => `<div class="cal__dow">${DOW[d].replace('‌', '')}</div>`).join('');

      const cell = (iso, dayNum, out) => {
        const list = byDay.get(iso) || [];
        const cover = list.map(coverOf).find(Boolean) || '';
        const moods = [...new Set(list.map((e) => e.mood).filter(Boolean))].slice(0, 4);
        const isToday = iso === todayISO;
        const isSel = iso === view.selected;
        const cls = ['cal__cell', out ? 'cal__cell--out' : '', isToday ? 'cal__cell--today' : '', isSel ? 'cal__cell--sel' : ''].join(' ');
        return `<button class="${cls}" data-day="${iso}" data-has="${list.length ? 1 : 0}" type="button" aria-label="${esc(fmtDate(iso, 'long'))}${list.length ? `، ${plural(list.length, 'قاب')}` : ''}">
          <span class="cal__num">${fa(dayNum)}</span>
          ${moods.length ? `<span class="cal__dots">${moods.map((m) => `<i style="background:${moodColor(m)}"></i>`).join('')}</span>` : ''}
          ${cover ? `<span class="cal__thumb"><img src="${esc(cover)}" alt="" loading="lazy" /></span>` : (list.length ? '<span class="cal__thumb" style="background:var(--accent-soft)"></span>' : '')}
        </button>`;
      };

      for (let i = offset; i > 0; i -= 1) {
        const d = prevLen - i + 1;
        html += cell(isoOf(prevJy, prevJm, d), d, true);
      }
      for (let d = 1; d <= length; d += 1) html += cell(isoOf(jy, jm, d), d, false);
      const tail = (7 - ((offset + length) % 7)) % 7;
      for (let d = 1; d <= tail; d += 1) html += cell(isoOf(nextJy, nextJm, d), d, true);
      grid.innerHTML = html;

      const monthCount = [...byDay.keys()].filter((k) => {
        const p = jParts(k);
        return p.year === jy && p.month === jm;
      }).length;
      qs('#calStats', root).textContent = monthCount
        ? `${fa(monthCount)} روز ثبت‌شده در این ماه`
        : 'این ماه هنوز خالی است';
    }

    on(grid, 'click', '[data-day]', (e, t) => {
      view.selected = t.dataset.day;
      qsa('.cal__cell', grid).forEach((c) => c.classList.toggle('cal__cell--sel', c.dataset.day === view.selected));
      drawDay();
      qs('#calDay', root)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    function drawDay() {
      const list = byDay.get(view.selected) || [];
      const dateLabel = fmtDate(view.selected, 'long');
      const dayNum = jParts(view.selected).day;

      if (!list.length) {
        dayPanel.innerHTML = `<div class="spread" style="margin-bottom:var(--sp-3)">
            <div class="daychip"><strong>${fa(dayNum)}</strong><span>${esc(dateLabel)}</span></div>
          </div>
          ${emptyState({
            iconName: 'calendar',
            title: 'این روز خالی است',
            text: 'خلأ هم بخشی از روایت است. هنوز می‌توانی پرش کنی.',
            action: `<button class="btn btn--outline" data-action="new-frame" data-date="${view.selected}">${icon('plus')}نوشتن این روز</button>`,
          })}`;
        return;
      }

      const words = list.reduce((n, e) => n + (e.word_count || 0), 0);
      const moods = [...new Set(list.map((e) => e.mood).filter(Boolean))];
      dayPanel.innerHTML = `
        <div class="spread" style="margin-bottom:var(--sp-4)">
          <div class="row" style="gap:var(--sp-3);align-items:baseline">
            <div class="daychip"><strong>${fa(dayNum)}</strong><span>${esc(dateLabel)}</span></div>
            <span class="faint" style="font-size:var(--fs-2xs)">${plural(list.length, 'قاب')} · ${fa(words)} کلمه${moods.length ? ' · ' + moods.map(moodLabel).join('، ') : ''}</span>
          </div>
          <button class="btn btn--sm btn--ghost" data-action="new-frame" data-date="${view.selected}">${icon('plus')}افزودن</button>
        </div>
        <div class="frames stagger">${list.map((e) => entryCard(e)).join('')}</div>`;

      on(dayPanel, 'click', '[data-open]', (e, t) => {
        if (e.target.closest('button.icon-btn')) return;
        navigate(`/frame/${t.dataset.open}`);
      });
      on(dayPanel, 'click', '[data-menu]', (e, t) => {
        const entry = list.find((x) => x.id === t.dataset.menu);
        if (entry) entryMenu(t, entry);
      });
    }

    qs('#calPrev', root).addEventListener('click', () => {
      view.jm -= 1;
      if (view.jm < 1) { view.jm = 12; view.jy -= 1; }
      drawGrid();
    });
    qs('#calNext', root).addEventListener('click', () => {
      view.jm += 1;
      if (view.jm > 12) { view.jm = 1; view.jy += 1; }
      drawGrid();
    });
    qs('#calToday', root).addEventListener('click', () => {
      const j = jParts(toISODate(new Date()));
      view.jy = j.year;
      view.jm = j.month;
      view.selected = todayISO;
      drawGrid();
      drawDay();
    });

    const onNav = (e) => {
      if (e.target.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowRight') qs('#calPrev', root).click();
      if (e.key === 'ArrowLeft') qs('#calNext', root).click();
    };
    document.addEventListener('keydown', onNav);
    window.addEventListener('hashchange', () => document.removeEventListener('keydown', onNav), { once: true });

    drawGrid();
    drawDay();
    void pad;
  },
};
