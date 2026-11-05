import { MOODS } from '../config.js';
import { esc, icon, qs } from '../lib/dom.js';
import {
  DOW, MONTHS, dayKey, fa, fmtDate, fmtNumber, jMonthKey, jParts, parseDate,
} from '../lib/format.js';
import { barChart, donutChart, lineChart } from '../lib/charts.js';
import { db } from '../services/db.js';
import { emptyState, statTile } from '../ui/parts.js';
import { bus } from '../state.js';

export const title = 'بینش';
export const sub = () => 'شکلِ روایت';

const pad = (n) => String(n).padStart(2, '0');

export default {
  title,
  sub,
  async mount(root) {
    root.innerHTML = `<div class="kpis">${Array.from({ length: 5 }).map(() => '<div class="skeleton" style="height:92px"></div>').join('')}</div>
      <div class="insight-grid">${Array.from({ length: 4 }).map(() => '<div class="skeleton" style="height:260px"></div>').join('')}</div>`;

    let entries = [];
    try { entries = await db.entries.all(); } catch (err) {
      root.innerHTML = emptyState({ iconName: 'alert', title: 'بینش بارگذاری نشد', text: err.message });
      return;
    }

    if (!entries.length) {
      root.innerHTML = emptyState({
        iconName: 'chart',
        title: 'بینش کمی داده می‌خواهد',
        text: 'چند قاب بنویس تا این صفحه از ریتم روزهایت پر شود: حال‌وهوا، واژه‌ها، مکان‌ها و پیوستگی.',
        action: '<button class="btn btn--primary" data-action="new-frame">' + icon('plus') + 'نوشتن قاب</button>',
      });
      return;
    }

    /* ── داده‌های تجمیعی ───────────────────────────────────── */
    const words = entries.reduce((n, e) => n + (e.word_count || 0), 0);
    const photos = entries.reduce((n, e) => n + (e.photos?.length || 0), 0);
    const dayCount = new Set(entries.map((e) => dayKey(e.happened_on))).size;
    const places = new Map();
    entries.forEach((e) => {
      const loc = (e.location || '').trim();
      if (loc) places.set(loc, (places.get(loc) || 0) + 1);
    });
    const moodCounts = MOODS.map((m) => ({
      ...m, value: entries.filter((e) => e.mood === m.slug).length,
    })).filter((m) => m.value).sort((a, b) => b.value - a.value)
      .map((m) => ({ ...m, canvasColor: m.hex }));
    const tagged = entries.filter((e) => e.mood).length;

    /* دوازده ماه شمسی گذشته */
    const nowJ = jParts(new Date().toISOString().slice(0, 10));
    const months = [];
    for (let i = 11; i >= 0; i -= 1) {
      let m = nowJ.month - i;
      let y = nowJ.year;
      while (m < 1) { m += 12; y -= 1; }
      const key = `${y}-${pad(m)}`;
      const list = entries.filter((e) => jMonthKey(e.happened_on) === key);
      months.push({
        label: MONTHS[m - 1],
        value: list.length,
        words: list.reduce((n, e) => n + (e.word_count || 0), 0),
      });
    }

    const weekday = Array.from({ length: 7 }).map((_, i) => ({
      label: DOW[i],
      value: entries.filter((e) => parseDate(e.happened_on).getDay() === i).length,
    }));
    const orderedWeekday = [...weekday.slice(1), weekday[0]];

    const byDay = new Map();
    entries.forEach((e) => {
      const k = dayKey(e.happened_on);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    });
    const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const longest = [...entries].sort((a, b) => (b.word_count || 0) - (a.word_count || 0))[0];
    const first = [...entries].sort((a, b) => String(a.happened_on).localeCompare(String(b.happened_on)))[0];
    const spanDays = Math.max(1, Math.round((new Date() - parseDate(first.happened_on)) / 86400000));
    const perWeek = fa((entries.length / Math.max(1, spanDays / 7)).toFixed(1));
    const avgWords = Math.round(words / entries.length);
    const avgMood = (() => {
      const rated = entries.filter((e) => e.rating);
      return rated.length ? fa((rated.reduce((n, e) => n + e.rating, 0) / rated.length).toFixed(1)) : '—';
    })();

    const thisYear = entries.filter((e) => jParts(e.happened_on).year === nowJ.year).length;
    const lastYear = entries.filter((e) => jParts(e.happened_on).year === nowJ.year - 1).length;
    const delta = lastYear ? Math.round(((thisYear - lastYear) / lastYear) * 100) : null;

    const tagCounts = new Map();
    entries.forEach((e) => (e.tags || []).forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
    const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
    const maxTag = tags[0]?.[1] || 1;

    const topPlaces = [...places.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
    const maxPlace = topPlaces[0]?.[1] || 1;

    root.innerHTML = `
      <div class="kpis">
        ${statTile('قاب‌ها', fmtNumber(entries.length), `به‌طور میانگین ${perWeek} در هفته`)}
        ${statTile('کلمه‌ها', fmtNumber(words), `${fa(avgWords)} کلمه در هر قاب`)}
        ${statTile('روزهای ثبت‌شده', fmtNumber(dayCount), `از ${fa(spanDays)} روز از اولین قاب`)}
        ${statTile('عکس‌ها', fmtNumber(photos), `${fa((photos / entries.length).toFixed(1))} عکس در هر قاب`)}
        ${statTile('امسال', fmtNumber(thisYear), delta == null ? 'هنوز مقایسه‌ای نیست' : `${delta >= 0 ? '+' : ''}${fa(delta)}٪ نسبت به سال پیش`)}
        ${statTile('حال‌وهواها', `${fa(tagged)}/${fa(entries.length)}`, `میانگین امتیاز ${avgMood} از ۵`)}
      </div>

      <div class="insight-grid">
        <div class="card chart-card" style="grid-column:span 2">
          <div class="chart-card__head">
            <div class="grow">
              <h3>قاب در هر ماه</h3>
              <p>دوازده ماه گذشتهٔ روایت</p>
            </div>
            <span class="badge">${fa(months.reduce((n, m) => n + m.value, 0))} قاب</span>
          </div>
          <canvas class="chart-canvas" id="chMonths"></canvas>
        </div>

        <div class="card chart-card">
          <div class="chart-card__head">
            <div class="grow"><h3>حال‌وهوا</h3><p>روزها چه حسی داشتند</p></div>
          </div>
          <canvas class="chart-canvas" id="chMoods"></canvas>
          <div class="legend">
            ${moodCounts.map((m) => `<span class="legend__item"><i style="background:${m.color}"></i>${esc(m.label)} · ${fa(m.value)}</span>`).join('') || '<span class="faint" style="font-size:var(--fs-3xs)">هنوز حال‌وهوایی ثبت نشده</span>'}
          </div>
        </div>

        <div class="card chart-card">
          <div class="chart-card__head">
            <div class="grow"><h3>ریتم هفته</h3><p>کِی بیشتر می‌نویسی</p></div>
          </div>
          <canvas class="chart-canvas" id="chWeek"></canvas>
        </div>

        <div class="card chart-card">
          <div class="chart-card__head">
            <div class="grow"><h3>کلمه در هر ماه</h3><p>حجم روایت</p></div>
          </div>
          <canvas class="chart-canvas" id="chWords"></canvas>
        </div>

        <div class="card chart-card">
          <div class="chart-card__head">
            <div class="grow"><h3>مکان‌ها</h3><p>قاب‌ها کجا ساخته شده‌اند</p></div>
          </div>
          ${topPlaces.length ? topPlaces.map(([loc, n]) => `
            <div class="datarow">
              <span class="datarow__label truncate">${esc(loc)}</span>
              <span class="datarow__bar"><span style="width:${Math.round((n / maxPlace) * 100)}%"></span></span>
              <span class="datarow__val">${fa(n)}</span>
            </div>`).join('') : '<p class="faint" style="font-size:var(--fs-xs)">به یک قاب جا اضافه کن تا اینجا پیدا شود.</p>'}
        </div>

        <div class="card chart-card">
          <div class="chart-card__head">
            <div class="grow"><h3>موضوع‌ها</h3><p>سوژه‌های تکرارشونده</p></div>
          </div>
          <div class="tagcloud">
            ${tags.length ? tags.map(([t, n]) => `<button data-tag="${esc(t)}" style="font-size:${(0.82 + (n / maxTag) * 1.5).toFixed(2)}rem">${esc(t)}<sup>${fa(n)}</sup></button>`).join('')
              : '<p class="faint" style="font-size:var(--fs-xs)">برچسب‌هایی که به قاب‌ها می‌زنی اینجا جمع می‌شوند.</p>'}
          </div>
        </div>

        <div class="card chart-card">
          <div class="chart-card__head">
            <div class="grow"><h3>رکوردها</h3><p>چند واقعیت کوچک از یک زندگی</p></div>
          </div>
          <table class="table">
            <tr><td>اولین قاب</td><td class="num">${esc(fmtDate(first.happened_on, 'medium'))}</td></tr>
            <tr><td>بلندترین نوشته</td><td class="num">${fa(longest.word_count || 0)} کلمه</td></tr>
            <tr><td>پرمشغله‌ترین روز</td><td class="num">${busiest ? `${fa(busiest[1])} قاب` : '—'}</td></tr>
            <tr><td>روزهای عکس‌دار</td><td class="num">${fa(new Set(entries.filter((e) => e.photos?.length).map((e) => dayKey(e.happened_on))).size)}</td></tr>
            <tr><td>رشته‌ها</td><td class="num">${fa(new Set(entries.map((e) => e.thread_id).filter(Boolean)).size)}</td></tr>
            <tr><td>روزهای خالی</td><td class="num">${fa(Math.max(0, spanDays - dayCount))}</td></tr>
          </table>
        </div>
      </div>`;

    /* ── رسم نمودارها ─────────────────────────────────────── */
    const draw = () => {
      barChart(qs('#chMonths'), { items: months, suffix: ' قاب' });
      barChart(qs('#chWeek'), { items: orderedWeekday, suffix: ' قاب' });
      lineChart(qs('#chWords'), { items: months.map((m) => ({ label: m.label, value: m.words })) });
    };
    draw();
    donutChart(qs('#chMoods'), {
      segments: moodCounts.map((m) => ({ label: m.label, value: m.value, color: m.canvasColor || m.hex })),
      centerValue: fmtNumber(tagged),
      centerLabel: 'ثبت‌شده',
    });

    qs('.tagcloud', root)?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tag]');
      if (btn) location.hash = `#/timeline?tag=${encodeURIComponent(btn.dataset.tag)}`;
    });

    const off = bus.on('theme', draw);
    window.addEventListener('hashchange', off, { once: true });
  },
};
