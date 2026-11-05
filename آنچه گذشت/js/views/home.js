import { MOODS, PROMPTS } from '../config.js';
import { esc, icon, qs, qsa, on } from '../lib/dom.js';
import {
  DOW, dayKey, fa, fmtDate, fmtNumber, jParts, parseDate, relativeDays, timeOfDayGreeting,
  firstName, plural, toISODate,
} from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { toast } from '../lib/ui.js';
import { db, coverOf, emptyEntry } from '../services/db.js';
import { prefs, savePrefs, state } from '../state.js';
import {
  emptyState, entryCard, entryMenu, moodLabel, skeletonCards,
} from '../ui/parts.js';

export const title = 'نمای کلی';
export const sub = () => fmtDate(toISODate(), 'long');

/* ── محاسبه‌ها ──────────────────────────────────────────────── */
function streaks(days) {
  const sorted = [...days].sort();
  const set = new Set(sorted);
  let longest = 0; let run = 0; let prev = null;
  sorted.forEach((d) => {
    if (!prev) { run = 1; } else {
      const gap = (new Date(d) - new Date(prev)) / 86400000;
      run = gap === 1 ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cursor = new Date(today);
  if (!set.has(toISODate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (set.has(toISODate(cursor))) { current += 1; cursor.setDate(cursor.getDate() - 1); }

  const week = [];
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    week.push({ date: d, has: set.has(toISODate(d)), isToday: toISODate(d) === toISODate(today) });
  }
  return { current, longest, week };
}

function heatGrid(entries) {
  const count = new Map();
  entries.forEach((e) => {
    const k = dayKey(e.happened_on);
    count.set(k, (count.get(k) || 0) + 1);
  });
  const weeks = 20;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // هفته در ایران از شنبه شروع می‌شود.
  const startOffset = (today.getDay() + 1) % 7;
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - startOffset));
  const cells = [];
  for (let i = weeks * 7 - 1; i >= 0; i -= 1) {
    const d = new Date(end); d.setDate(end.getDate() - i);
    const k = toISODate(d);
    const n = count.get(k) || 0;
    const lvl = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n < 4 ? 3 : 4;
    cells.push({ k, n, lvl, date: d, future: d > today });
  }
  return cells;
}

function onThisDay(entries) {
  const now = jParts(toISODate());
  return entries
    .filter((e) => {
      const p = jParts(e.happened_on);
      return p.month === now.month && p.day === now.day && p.year !== now.year;
    })
    .sort((a, b) => String(b.happened_on).localeCompare(String(a.happened_on)))
    .slice(0, 3);
}

export default {
  title,
  sub,
  async mount(root) {
    root.innerHTML = `<div class="stack" style="gap:var(--sp-6)">
      <div class="skeleton" style="height:220px;border-radius:var(--r-xl)"></div>
      ${skeletonCards(3)}
    </div>`;

    let entries = [];
    try { entries = await db.entries.all(); } catch (err) {
      root.innerHTML = emptyState({ iconName: 'cloud-off', title: 'گنجینه خوانده نشد', text: err.message });
      return;
    }

    const days = new Set(entries.map((e) => dayKey(e.happened_on)));
    const st = streaks([...days]);
    const heat = heatGrid(entries);
    const photos = entries.reduce((n, e) => n + (e.photos?.length || 0), 0);
    const words = entries.reduce((n, e) => n + (e.word_count || 0), 0);
    const places = new Set(entries.map((e) => (e.location || '').trim()).filter(Boolean));
    const pinned = entries.filter((e) => e.pinned).slice(0, 2);
    const recent = entries.slice(0, 5);
    const otd = onThisDay(entries);
    const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    const goal = Math.max(1, prefs.goalPerWeek || 3);
    const weekCount = st.week.filter((d) => d.has).length;
    const name = firstName(state.profile?.display_name || state.user?.email || 'دوست');

    root.innerHTML = `
    <section class="hero">
      <p class="hero__date">${esc(fmtDate(toISODate(), 'long'))}</p>
      <h2 class="hero__greeting">${esc(timeOfDayGreeting())}، <em>${esc(name)}</em>.<br>${entries.length ? 'امروز چه چیزی به آن اضافه می‌شود؟' : 'بیا مستندت را شروع کنیم.'}</h2>
      <p class="hero__sub">${entries.length
        ? `${plural(entries.length, 'قاب')} از ${esc(fmtDate(entries[entries.length - 1].happened_on, 'month'))} تا امروز. ${fa(weekCount)} از ${fa(goal)} قدم این هفته برداشته‌ای.`
        : 'یک عکس، صد کلمه، روزی یک بار. همین برای ساختن روایتِ یک زندگی کافی است.'}</p>
      <div class="hero__row">
        <button class="btn btn--primary" data-action="new-frame">${icon('plus')}ثبت یک قاب</button>
        <button class="btn btn--outline" data-action="quick-prompt">${icon('sparkles')}یک پیشنهاد برایم بیاور</button>
      </div>
      <div class="hero__stats">
        <div class="hero__stat"><strong>${fmtNumber(entries.length)}</strong><span>قاب</span></div>
        <div class="hero__stat"><strong>${fa(st.current)}</strong><span>روز پیوسته</span></div>
        <div class="hero__stat"><strong>${fa(photos)}</strong><span>عکس</span></div>
        <div class="hero__stat"><strong>${fmtNumber(words)}</strong><span>کلمه</span></div>
        <div class="hero__stat"><strong>${fa(places.size)}</strong><span>مکان</span></div>
      </div>
    </section>

    <div class="home-grid">
      <div class="home-col">
        <div class="quickcap">
          <div class="quickcap__top">
            ${icon('pencil', 'ico--sm')}
            <span class="eyebrow">ثبت سریع</span>
            <span class="faint" style="font-size:var(--fs-3xs);margin-inline-start:auto">${esc(fmtDate(toISODate(), 'short'))}</span>
          </div>
          <textarea class="quickcap__input" id="qcInput" rows="2" placeholder="همین حالا چه شد؟"></textarea>
          <div class="quickcap__foot">
            <div class="moodstrip" id="qcMoods">
              ${MOODS.map((m) => `<button class="mood-pill" data-mood="${m.slug}" type="button"><span class="mood-dot" style="background:${m.color}"></span>${esc(m.label)}</button>`).join('')}
            </div>
            <button class="btn btn--solid btn--sm" id="qcSave" style="margin-inline-start:auto">${icon('check')}ذخیره</button>
          </div>
        </div>

        ${pinned.length ? `<section>
          <div class="section__head"><h2>سنجاق‌شده</h2><p>آن‌هایی که نزدیک نگه می‌داری</p></div>
          <div class="frames stagger">${pinned.map((e) => entryCard(e)).join('')}</div>
        </section>` : ''}

        <section>
          <div class="section__head">
            <h2>قاب‌های تازه</h2>
            <div class="spacer"></div>
            <a class="linkbtn" href="#/timeline">همهٔ خط زمان ${icon('arrow-left', 'ico--sm')}</a>
          </div>
          ${recent.length ? `<div class="recent-list stagger">${recent.map((e) => {
            const p = jParts(e.happened_on);
            const img = coverOf(e);
            return `<button class="recent-item" data-open="${esc(e.id)}" type="button">
              <span class="recent-item__date"><strong>${fa(p.day)}</strong><span>${esc(fmtDate(e.happened_on, 'month').split(' ')[0])}</span></span>
              <span class="recent-item__body">
                <strong>${esc(e.title || 'قاب بی‌نام')}</strong>
                <p>${esc(moodLabel(e.mood) || 'بدون حال‌وهوا')}${e.location ? ' · ' + esc(e.location) : ''} · ${esc(relativeDays(e.happened_on))}</p>
              </span>
              ${img ? `<img class="recent-item__thumb" src="${esc(img)}" alt="" loading="lazy" />` : ''}
            </button>`;
          }).join('')}</div>` : emptyState({
            iconName: 'reel',
            title: 'اولین قاب، سخت‌ترین قاب است',
            text: 'از امروز شروع کن: عکسی از آنچه پیش رویت است و سه جملهٔ صادقانه.',
            action: '<button class="btn btn--primary" data-action="new-frame">' + icon('plus') + 'اولین قاب را بنویس</button>',
          })}
        </section>
      </div>

      <div class="home-col">
        <div class="card streakcard">
          <div class="spread">
            <div>
              <span class="eyebrow">پیوستگی</span>
              <div class="row" style="gap:6px;align-items:baseline;margin-top:2px">
                <strong class="serif" style="font-size:var(--fs-2xl)">${fa(st.current)}</strong>
                <span class="faint" style="font-size:var(--fs-2xs)">روز پیوسته</span>
              </div>
            </div>
            <div style="text-align:start">
              <span class="eyebrow">بلندترین</span>
              <div class="serif" style="font-size:var(--fs-lg);margin-top:2px">${fa(st.longest)}</div>
            </div>
          </div>
          <div class="streak__grid" aria-hidden="true">
            ${heat.map((c) => `<div class="streak__cell" data-lvl="${c.lvl}" title="${plural(c.n, 'قاب')} · ${fmtDate(c.date, 'short')}" style="${c.future ? 'opacity:.25' : ''}"></div>`).join('')}
          </div>
          <div class="spread">
            <div class="streak__legend">
              <span>کم</span>
              <i style="background:var(--surface-3)"></i>
              <i style="background:color-mix(in oklab,var(--accent) 40%,var(--surface-3))"></i>
              <i style="background:color-mix(in oklab,var(--accent) 70%,var(--surface-3))"></i>
              <i style="background:var(--accent)"></i>
              <span>بیش</span>
            </div>
            <span class="faint" style="font-size:var(--fs-3xs)">۲۰ هفتهٔ گذشته</span>
          </div>
        </div>

        <div class="promptcard">
          <div class="spread">
            <span class="eyebrow">یک پیشنهاد، اگر لازم داری</span>
            <button class="icon-btn" data-action="quick-prompt" aria-label="پیشنهاد دیگر">${icon('refresh')}</button>
          </div>
          <p id="promptText">${esc(prompt)}</p>
          <button class="btn btn--sm btn--outline" data-action="write-prompt" style="justify-self:start">${icon('pencil')}با همین بنویس</button>
        </div>

        <div class="card card--pad">
          <div class="panel-title">${icon('sparkles')}در چنین روزی</div>
          ${otd.length ? `<div class="otd stagger">${otd.map((e) => {
            const img = coverOf(e);
            const years = jParts(toISODate()).year - jParts(e.happened_on).year;
            return `<button class="otd-card" data-open="${esc(e.id)}" type="button">
              <span class="otd-card__thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : ''}</span>
              <span class="otd-card__meta">
                <span class="otd-card__years">${fa(years)} سال پیش</span>
                <span class="otd-card__title truncate">${esc(e.title || 'قاب بی‌نام')}</span>
                <span class="otd-card__date">${esc(fmtDate(e.happened_on, 'long'))}</span>
              </span>
            </button>`;
          }).join('')}</div>` : '<p class="faint" style="font-size:var(--fs-xs)">امسال در چنین روزی چیزی ثبت نکرده‌ای — هنوز. این کارت با بزرگ‌شدن روایت خودش پر می‌شود.</p>'}
        </div>

        <div class="card card--pad">
          <div class="panel-title">${icon('chart')}این هفته</div>
          <div class="ringsrow">
            <div class="ring" style="width:92px;height:92px">
              <svg width="92" height="92" viewBox="0 0 92 92">
                <circle class="ring__track" cx="46" cy="46" r="38" fill="none" stroke-width="7"/>
                <circle class="ring__value" cx="46" cy="46" r="38" fill="none" stroke-width="7"
                  stroke-dasharray="${2 * Math.PI * 38}"
                  stroke-dashoffset="${2 * Math.PI * 38 * (1 - Math.min(1, weekCount / goal))}"/>
              </svg>
              <span class="ring__label"><strong>${fa(weekCount)}/${fa(goal)}</strong><span>قاب</span></span>
            </div>
            <div class="stack stack--sm grow">
              ${st.week.map((d) => `<div class="spread" style="font-size:var(--fs-2xs)">
                <span class="faint">${DOW[d.date.getDay()]}</span>
                <span style="display:flex;align-items:center;gap:5px">${d.has ? '<span class="mood-dot" style="background:var(--accent)"></span>ثبت شد' : '<span class="faint">—</span>'}</span>
              </div>`).join('')}
            </div>
          </div>
          <button class="btn btn--sm btn--ghost" data-action="edit-goal" style="justify-self:start;margin-top:2px">${icon('settings')}تغییر هدف هفتگی</button>
        </div>
      </div>
    </div>`;

    /* ── تعامل‌ها ─────────────────────────────────────────── */
    let chosenMood = '';
    const qcInput = qs('#qcInput', root);
    qsa('#qcMoods .mood-pill', root).forEach((pill) => {
      pill.addEventListener('click', () => {
        chosenMood = chosenMood === pill.dataset.mood ? '' : pill.dataset.mood;
        qsa('#qcMoods .mood-pill', root).forEach((p) => p.classList.toggle('is-on', p.dataset.mood === chosenMood));
      });
    });

    const saveQuick = async () => {
      const text = qcInput.value.trim();
      if (!text) { qcInput.focus(); return; }
      const firstLine = text.split('\n')[0].slice(0, 90);
      const entry = emptyEntry({
        title: firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine,
        body: `<p>${esc(text).replace(/\n/g, '<br>')}</p>`,
        happened_on: toISODate(),
        mood: chosenMood,
      });
      try {
        const saved = await db.entries.save(entry);
        qcInput.value = '';
        chosenMood = '';
        qsa('#qcMoods .mood-pill', root).forEach((p) => p.classList.remove('is-on'));
        toast('قاب ذخیره شد', {
          type: 'success',
          action: { label: 'افزودن عکس', onClick: () => navigate(`/write/${saved.id}`) },
        });
        this.mount(root);
      } catch (err) { toast(err.message, { type: 'error' }); }
    };
    qs('#qcSave', root).addEventListener('click', saveQuick);
    qcInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveQuick(); }
    });

    on(root, 'click', '[data-open]', (e, t) => {
      if (e.target.closest('button[data-action], .icon-btn, a')) return;
      navigate(`/frame/${t.dataset.open}`);
    });
    on(root, 'click', '[data-menu]', (e, t) => {
      const entry = entries.find((x) => x.id === t.dataset.menu);
      if (entry) entryMenu(t, entry);
    });

    on(root, 'click', '[data-action="quick-prompt"]', () => {
      const el = qs('#promptText', root);
      const next = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
      if (el) el.textContent = next;
      else toast(next, { type: 'info', timeout: 6000 });
    });

    on(root, 'click', '[data-action="write-prompt"]', () => {
      const text = qs('#promptText', root)?.textContent || '';
      navigate(`/write?prompt=${encodeURIComponent(text)}`);
    });

    on(root, 'click', '[data-action="edit-goal"]', () => {
      const n = prompt('چند قاب در هفته می‌خواهی؟', String(goal));
      const val = Number(n);
      if (Number.isFinite(val) && val > 0 && val < 50) {
        savePrefs({ goalPerWeek: Math.round(val) });
        this.mount(root);
      }
    });
    void parseDate;
  },
};
