/** صفحه‌ی اصلی: جدول چالش، جایزه، شمارش معکوس و خلاصه‌ی دوره. */
import { state, store } from '../store.js';
import { CONFIG } from '../config.js';
import {
  h, icon, avatarTone, initials, fmt, money, faDigits, toast, modal,
} from '../utils.js';
import { statusFor } from '../ai.js';
import { pageHead, sectionHead, statCard } from '../ui/shell.js';
import { openPledgeModal } from '../ui/join.js';
import { currentRoundRange, formatJalali, formatTime, relativeDay, daysBetween } from '../jalali.js';
import { progressRing } from '../chart.js';

const HOW_STEPS = [
  { title: 'تعهدت را ثبت کن', text: 'قد، سال تولد و جنسیت را در پروفایل کامل کن؛ وزن شروع و وزن پایان ماه را در «پیوستن به چالش» ثبت کن و سهم اشتراک را بپرداز.' },
  { title: 'هر روز وزن کن', text: 'وزن روزانه با ساعت اندازه‌گیری و وضعیت معده ثبت می‌شود تا تحلیل‌ها و نمودار دقیق باشند.' },
  { title: 'پایان ماه، قرعه‌کشی', text: 'هر کیلو تعهد یک بلیت است. بین کسانی که به وزن تعهد رسیده‌اند و سهمشان تأیید شده، برنده به‌صورت تصادفی انتخاب می‌شود.' },
];

function openHowItWorks() {
  modal({
    title: 'چالش چطور کار می‌کند؟',
    subtitle: 'سه قدم تا شرکت در قرعه‌کشی جایزه',
    width: 620,
    body: h('div.stack', {},
      h('div.steps', {}, ...HOW_STEPS.map((s, i) => h('div.step', {},
        h('div.step-num', {}, faDigits(i + 1)),
        h('div', {}, h('h4', {}, s.title), h('p', {}, s.text)),
      ))),
      h('div.alert.info', {},
        h('span', { html: icon('info', 18) }),
        h('div', {}, 'استخر جایزه از مجموع سهم‌های تأییدشده ساخته می‌شود و بین کسانی که به تعهد پایان ماه رسیده‌اند قرعه‌کشی می‌شود.'),
      ),
    ),
    footer: h('button.btn.primary', { onClick: (e) => e.target.closest('.modal-overlay').remove() }, 'متوجه شدم'),
  });
}

function openBoardHelp() {
  modal({
    title: 'جدول چگونه محاسبه می‌شود؟',
    width: 600,
    body: h('div.stack', {},
      h('div.kv', {},
        h('div.kv-row', {}, h('span', {}, 'وزن فعلی'), h('strong', {}, 'آخرین وزن ثبت‌شده')),
        h('div.kv-row', {}, h('span', {}, 'وزن شروع'), h('strong', {}, 'وزن ثبت‌شده در تعهد')),
        h('div.kv-row', {}, h('span', {}, 'بلیت شانس'), h('strong', {}, 'حداقل ۱، بر پایه‌ی کیلوهای تعهد')),
        h('div.kv-row', {}, h('span', {}, 'شرط برد'), h('strong', {}, 'رسیدن به تعهد + پرداخت تأییدشده')),
      ),
      h('p.small.muted', {}, 'وزن‌ها از ثبت‌های روزانه‌ی همان دوره خوانده می‌شوند؛ هر کس BMI را خصوصی کرده باشد، عددش نمایش داده نمی‌شود.'),
    ),
    footer: h('button.btn.ghost', { onClick: (e) => e.target.closest('.modal-overlay').remove() }, 'بستن'),
  });
}

function countdownBlock(range) {
  const target = new Date(range.end);
  target.setHours(23, 59, 59, 999);
  const dEl = h('strong', {}, '—');
  const hEl = h('strong', {}, '—');
  const mEl = h('strong', {}, '—');

  const tick = () => {
    const diff = Math.max(0, target - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    dEl.textContent = faDigits(days);
    hEl.textContent = faDigits(hours);
    mEl.textContent = faDigits(mins);
  };
  tick();
  const timer = setInterval(() => {
    if (!document.body.contains(dEl)) { clearInterval(timer); return; }
    tick();
  }, 30000);

  return h('div.countdown', {},
    h('div.countdown-unit', {}, dEl, h('span', {}, 'روز')),
    h('div.countdown-unit', {}, hEl, h('span', {}, 'ساعت')),
    h('div.countdown-unit', {}, mEl, h('span', {}, 'دقیقه')),
  );
}

function hero(board) {
  const round = store.round;
  const range = currentRoundRange();
  const pool = store.poolForRound();
  const paidCount = store.paidPayments().length;
  const totalPromise = board.reduce((a, b) => a + Math.max(0, b.promiseKg), 0);
  const compliant = board.filter((b) => b.compliant).length;
  const me = store.myAnalysis();
  const myPledge = store.myPledge();

  const actions = [];
  if (store.isLoggedIn && myPledge) {
    actions.push(h('a.btn.primary', { href: '#/log' }, icon('scale', 17), 'ثبت وزن امروز'));
    actions.push(h('a.btn.ghost', { href: '#/report' }, icon('chart', 17), 'گزارش من'));
  } else if (store.isLoggedIn) {
    actions.push(h('button.btn.primary', { onClick: () => openPledgeModal() }, icon('trophy', 17), 'پیوستن به چالش این ماه'));
    actions.push(h('a.btn.ghost', { href: '#/profile' }, icon('user', 17), 'تکمیل پروفایل'));
  } else {
    actions.push(h('a.btn.primary', { href: '#/auth' }, icon('trophy', 17), 'شرکت در چالش'));
    actions.push(h('a.btn.ghost', { href: '#/rules' }, icon('book', 17), 'قوانین و جایزه'));
  }

  return h('section.hero', {},
    h('div.hero-content', {},
      h('span.hero-eyebrow', {}, icon('calendar', 14), `دوره‌ی ${round.title} • ${formatJalali(range.start, { long: true })} تا ${formatJalali(range.end, { long: true })}`),
      h('h1.hero-title', {}, 'هر کیلو تعهد، ', h('em', {}, 'یک بلیت شانس'), ' برای جایزه‌ی ماه'),
      h('p.hero-lead', {}, 'جدول زنده‌ی وزن شروع، وزن فعلی و تعهد پایان ماه — هر کیلو تعهد، یک بلیت شانس.'),
      h('div.hero-actions', {},
        ...actions,
        h('button.btn.ghost', { onClick: openHowItWorks }, icon('info', 16), 'چالش چطور کار می‌کند؟'),
      ),
      h('div.hero-stats', {},
        h('div.hero-stat', {}, h('strong', {}, faDigits(board.length)), h('span', {}, 'شرکت‌کننده')),
        h('div.hero-stat', {}, h('strong', {}, `${fmt(totalPromise)} کیلو`), h('span', {}, 'مجموع تعهد کاهش')),
        h('div.hero-stat', {}, h('strong', {}, faDigits(compliant)), h('span', {}, 'به تعهد رسیده')),
        h('div.hero-stat', {}, h('strong', {}, money(pool)), h('span', {}, 'استخر جایزه')),
      ),
    ),
    h('aside.hero-side', {},
      h('div', {},
        h('div.prize-label', {}, icon('trophy', 15), 'استخر جایزه‌ی این دوره'),
        h('div.prize-pool', {}, money(pool)),
        h('div.tiny.muted', {}, `${faDigits(paidCount)} سهم پرداخت‌شده از ${faDigits(Math.max(board.length, paidCount))} شرکت‌کننده`),
      ),
      h('div', {},
        h('div.prize-label', {}, icon('clock', 15), 'تا پایان دوره'),
        countdownBlock(range),
      ),
      h('div', {},
        h('div.prize-label', {}, icon('wallet', 15), 'سهم اشتراک هر نفر'),
        h('div.row-between', {},
          h('strong', { style: { fontSize: '16px' } }, money(round.fee || CONFIG.defaultFee)),
          h('a.chip', { href: '#/rules' }, 'قوانین تقسیم'),
        ),
      ),
      me
        ? h('div', {},
          h('div.prize-label', {}, icon('target', 15), 'وضعیت من'),
          h('div.row-between', {},
            h('div', {},
              h('div.strong', { style: { fontSize: '15px' } }, `${fmt(me.current)} کیلو`),
              h('div.tiny.muted', {}, me.remaining > 0 ? `${fmt(me.remaining)} کیلو تا تعهد` : 'به تعهد رسیده‌ای'),
            ),
            progressRing(Math.min(100, me.progress), { size: 58, stroke: 6, label: Math.round(me.progress) }),
          ),
          h('a.chip.mt-8', { href: '#/log', style: { display: 'inline-flex' } }, icon('plus', 14), 'ثبت سریع وزن'),
        )
        : h('a.btn.primary.block', { href: '#/auth' }, icon('users', 16), 'ورود و پیوستن'),
    ),
  );
}

function boardTable(board) {
  const meId = state.sessionUser?.id;
  const rows = board.map((row) => {
    const status = statusFor(row);
    const delta = row.current - row.start;
    const deltaClass = delta < -0.05 ? 'down' : delta > 0.05 ? 'up' : 'flat';
    const rankClass = row.rank === 1 ? 'gold' : row.rank === 2 ? 'silver' : row.rank === 3 ? 'bronze' : '';
    return h('tr', { class: row.userId === meId ? 'me' : '' },
      h('td', {}, h('span', { class: `rank-pill ${rankClass}` }, faDigits(row.rank))),
      h('td', {},
        h('div.cell-user', {},
          h('span', { class: `avatar sm ${avatarTone(row.userId)}` }, initials(row.name)),
          h('div', {},
            h('strong', {}, row.name),
            h('small', {}, [row.city, row.paid ? 'سهم پرداخت‌شده' : 'در انتظار پرداخت'].filter(Boolean).join(' • ')),
          ),
        ),
      ),
      h('td.num', {}, fmt(row.start)),
      h('td.num', {}, h('strong', { style: { fontSize: '14.5px' } }, fmt(row.current))),
      h('td.num', {}, h('span', { class: `delta ${deltaClass}` }, `${delta > 0 ? '+' : ''}${fmt(Math.abs(delta))}`)),
      h('td.num', {}, h('span', { class: 'badge gold' }, fmt(row.promised))),
      h('td.num', {},
        row.remaining > 0
          ? h('span', { class: 'muted' }, `${fmt(row.remaining)} کیلو`)
          : h('span', { class: 'badge brand' }, 'رسیده'),
      ),
      h('td.num', {},
        row.bmi ? h('span', { class: `badge ${row.band.tone}` }, fmt(row.bmi)) : '—',
      ),
      h('td.cell-progress', {},
        h('div.progress', {}, h('span', { style: { width: `${Math.min(100, Math.max(0, row.progress))}%` } })),
        h('small', {}, `${faDigits(Math.round(row.progress))}٪ از تعهد`),
      ),
      h('td', {}, h('span', { class: `badge ${status.tone}` }, h('span.dot'), status.label)),
      h('td.num', {}, h('span', { class: 'badge violet' }, `${faDigits(row.chance)} بلیت`)),
    );
  });

  return h('div.table-wrap', {},
    h('table.data', {},
      h('thead', {},
        h('tr', {},
          h('th', {}, '#'),
          h('th', {}, 'شرکت‌کننده'),
          h('th.num', {}, 'وزن شروع'),
          h('th.num', {}, 'وزن فعلی'),
          h('th.num', {}, 'تغییر'),
          h('th.num', {}, 'تعهد پایان ماه'),
          h('th.num', {}, 'باقی‌مانده'),
          h('th.num', {}, 'BMI'),
          h('th', {}, 'پیشرفت'),
          h('th', {}, 'وضعیت'),
          h('th.num', {}, 'شانس'),
        ),
      ),
      h('tbody', {}, ...rows),
    ),
    h('div.table-note', {}, `آخرین به‌روزرسانی: ${formatJalali(new Date(), { withTime: true })}`),
  );
}

export async function render(root) {
  const board = store.board();
  const round = store.round;

  root.append(
    pageHead(
      'چالش کاهش وزن گروهی',
      'وضعیت زنده‌ی وزن و تعهد اعضای گروه.',
      [
        store.isLoggedIn && !store.myPledge()
          ? h('button.btn.primary', { onClick: () => openPledgeModal() }, icon('plus', 16), 'پیوستن به چالش')
          : null,
        h('a.btn.ghost', { href: '#/overall' }, icon('trophy', 16), 'گزارش کلی و قرعه‌کشی'),
      ].filter(Boolean),
    ),
    hero(board),
  );

  /* ---------------------------------------------------------- stats strip */
  const my = store.myAnalysis();
  const range = currentRoundRange();
  const stats = my
    ? [
      statCard({ label: 'وزن فعلی من', value: fmt(my.current), unit: 'کیلوگرم', iconName: 'scale', foot: my.lost > 0 ? `${fmt(Math.abs(my.lost))} کیلو کاهش` : 'بدون کاهش ثبت‌شده', footTone: my.lost > 0 ? 'down' : '' }),
      statCard({ label: 'فاصله تا تعهد', value: fmt(Math.max(0, my.remaining)), unit: 'کیلوگرم', iconName: 'target', foot: my.onTrack ? 'در مسیر تعهد' : 'عقب‌تر از روند لازم' }),
      statCard({ label: 'شاخص توده بدنی', value: my.bmi ? fmt(my.bmi) : '—', iconName: 'heart', foot: my.band?.label || 'قد را در پروفایل ثبت کن' }),
      statCard({ label: 'بلیت شانس من', value: faDigits(my.chance), unit: 'بلیت', iconName: 'trophy', foot: `${faDigits(my.daysLeft)} روز تا پایان دوره` }),
    ]
    : [
      statCard({ label: 'شرکت‌کننده‌ها', value: faDigits(board.length), iconName: 'users', foot: 'در دوره‌ی جاری' }),
      statCard({ label: 'مجموع تعهد', value: fmt(board.reduce((a, b) => a + Math.max(0, b.promiseKg), 0)), unit: 'کیلوگرم', iconName: 'target', foot: 'کاهش تعهد‌شده' }),
      statCard({ label: 'به تعهد رسیده', value: faDigits(board.filter((b) => b.compliant).length), iconName: 'check', foot: 'واجد شرایط قرعه‌کشی' }),
      statCard({ label: 'سهم هر نفر', value: money(round.fee || CONFIG.defaultFee), iconName: 'wallet', foot: 'برای استخر جایزه' }),
    ];

  root.append(h('section.dash-strip.mt-16', {}, ...stats));

  /* ----------------------------------------------------------- main table */
  let filterMode = 'all';
  let query = '';

  const tbodyHost = h('div');
  const search = h('input.input', { placeholder: 'جست‌وجوی نام یا شهر…', 'aria-label': 'جست‌وجو' });
  const segButtons = [
    { key: 'all', label: 'همه' },
    { key: 'ontrack', label: 'در مسیر' },
    { key: 'done', label: 'به تعهد رسیده' },
    { key: 'paid', label: 'پرداخت‌شده' },
  ].map((item) => h('button', {
    class: item.key === 'all' ? 'active' : '',
    onClick: (e) => {
      filterMode = item.key;
      [...e.target.parentElement.children].forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      paint();
    },
  }, item.label));

  function filtered() {
    return board.filter((row) => {
      if (query && !`${row.name} ${row.city}`.includes(query)) return false;
      if (filterMode === 'ontrack') return row.onTrack && !row.compliant;
      if (filterMode === 'done') return row.compliant;
      if (filterMode === 'paid') return row.paid;
      return true;
    });
  }

  function paint() {
    const list = filtered();
    tbodyHost.replaceChildren(
      list.length
        ? boardTable(list)
        : h('div.card', {}, h('div.empty', {},
          h('div.empty-ic', { html: icon('users', 24) }),
          h('strong', {}, 'شرکت‌کننده‌ای با این فیلتر پیدا نشد'),
          h('p', {}, 'فیلتر را تغییر بده یا اولین نفر باش و تعهدت را ثبت کن.'),
          store.isLoggedIn ? h('button.btn.primary', { onClick: () => openPledgeModal() }, 'پیوستن به چالش') : null,
        )),
    );
  }

  search.addEventListener('input', (e) => {
    query = e.target.value.trim();
    paint();
  });

  root.append(
    h('section.mt-24', {},
      sectionHead('جدول چالش این ماه', 'users',
        h('div.chip-row', {},
          store.isLoggedIn && store.myPledge()
            ? h('a.chip', { href: '#/log' }, icon('plus', 14), 'ثبت وزن')
            : null,
          h('a.chip', { href: '#/overall' }, icon('trophy', 14), 'شانس‌ها و قرعه‌کشی'),
          h('button.chip', { onClick: openBoardHelp }, icon('info', 14), 'نحوه‌ی محاسبه'),
        ),
      ),
      h('div.filter-bar', {},
        h('div.search-box', {}, h('span', { html: icon('search', 16) }), search),
        h('div.segmented', {}, ...segButtons),
      ),
      tbodyHost,
    ),
  );
  paint();

  /* --------------------------------------------------------------- podium */
  const top = [...board].filter((b) => b.entries?.length).sort((a, b) => b.progress - a.progress).slice(0, 3);
  if (top.length) {
    const medals = ['🥇', '🥈', '🥉'];
    root.append(
      h('section.mt-24', {},
        sectionHead('پیشتازان این دوره', 'crown', h('a.card-link', { href: '#/overall' }, 'جدول کامل', icon('arrow', 14))),
        h('div.podium', {},
          ...top.map((row, i) => h('div', { class: `podium-item ${i === 0 ? 'first' : ''}` },
            h('span.podium-medal', {}, medals[i]),
            h('span', { class: `avatar ${avatarTone(row.userId)}` }, initials(row.name)),
            h('strong', {}, row.name),
            h('span', {}, `${fmt(row.lost)} کیلو کاهش • ${faDigits(Math.round(row.progress))}٪ تعهد`),
            h('div.progress', { style: { width: '100%' } }, h('span', { style: { width: `${Math.min(100, row.progress)}%` } })),
            h('span.badge.gold', {}, `${faDigits(row.chance)} بلیت`),
          )),
        ),
      ),
    );
  }

  /* ---------------------------------------------------------- last winner */
  const lastRound = store.settledRounds()[0];
  if (lastRound) {
    const info = store.winnerOf(lastRound.id);
    const settlements = store.settlementsFor(lastRound.id);
    root.append(
      h('section.mt-24', {},
        sectionHead('برنده‌ی دوره‌ی قبل', 'trophy'),
        h('div.card', {},
          h('div.row-between.wrap', {},
            h('div.row.gap-12', {},
              h('span.avatar.lg.gold', {}, '🏆'),
              h('div', {},
                h('div.strong', { style: { fontSize: '16px' } }, info?.profile?.full_name || 'برنده'),
                h('div.small.muted', {},
                  `${lastRound.title} • ${faDigits(info?.settlement?.chance || 0)} بلیت از ${faDigits(settlements.filter((s) => s.compliant).reduce((a, b) => a + Number(b.chance || 0), 0))} بلیت`,
                ),
              ),
            ),
            h('div.row.gap-16', {},
              h('div.center', {}, h('div.strong', { style: { color: 'var(--gold)', fontSize: '20px' } }, money(lastRound.prize_pool)), h('div.tiny.muted', {}, 'جایزه')),
              h('a.btn.ghost.sm', { href: '#/overall' }, 'جزئیات تسویه'),
            ),
          ),
        ),
      ),
    );
  }

  /* -------------------------------------------------------- join CTA strip */
  if (store.isLoggedIn && !store.myPledge()) {
    root.append(
      h('section.mt-24', {},
        h('div.card', { style: { background: 'linear-gradient(135deg, var(--brand-soft), transparent 70%)', borderColor: 'color-mix(in srgb, var(--brand) 25%, transparent)' } },
          h('div.row-between.wrap', {},
            h('div', {},
              h('h3', { style: { fontSize: '17px' } }, 'هنوز تعهد این ماه را ثبت نکرده‌ای'),
              h('p.small.muted', {}, 'با ثبت وزن شروع و وزن تعهد، در جدول و قرعه‌کشی جایزه شرکت می‌کنی.'),
            ),
            h('button.btn.primary', { onClick: () => openPledgeModal() }, icon('plus', 16), 'ثبت تعهد'),
          ),
        ),
      ),
    );
  }
}
