/** گزارش شخصی: روند وزن، پیش‌بینی پایان ماه، تحلیل کیفیت ثبت و خروجی CSV. */
import { state, store } from '../store.js';
import {
  h, icon, fmt, faDigits, money, toast, downloadFile, csvEscape, avatarTone, initials,
} from '../utils.js';
import { pageHead, sectionHead, loginPrompt, statCard } from '../ui/shell.js';
import { lineChart, barChart, progressRing } from '../chart.js';
import { openPledgeModal } from '../ui/join.js';
import { formatJalali, formatTime, daysBetween, relativeDay } from '../jalali.js';
import { analyze, statusFor } from '../ai.js';

function weeklyGroups(entries, round) {
  const start = new Date(`${round.starts_on}T00:00:00`);
  const map = new Map();
  for (const e of entries) {
    const d = new Date(`${e.entry_date}T00:00:00`);
    const week = Math.floor(daysBetween(start, d) / 7) + 1;
    if (!map.has(week)) map.set(week, []);
    map.get(week).push(e);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([week, list]) => {
    const first = list[0];
    const last = list.at(-1);
    const avg = list.reduce((a, b) => a + Number(b.weight), 0) / list.length;
    return {
      week,
      count: list.length,
      avg: Number(avg.toFixed(1)),
      change: Number((Number(last.weight) - Number(first.weight)).toFixed(1)),
      first: Number(first.weight),
      last: Number(last.weight),
      range: `${formatJalali(new Date(`${first.entry_date}T00:00:00`), { long: false })} — ${formatJalali(new Date(`${last.entry_date}T00:00:00`), { long: false })}`,
    };
  });
}

export async function render(root) {
  if (!store.isLoggedIn) {
    loginPrompt(root, 'گزارش شخصی مخصوص حساب شماست؛ وارد شو تا ساخته شود.');
    return;
  }
  const user = state.sessionUser;
  const profile = state.profile;
  const round = store.round;
  const pledge = store.myPledge();
  const entries = store.entriesFor(user.id, round.id);
  const status = statusFor(pledge ? { hasData: true } : null);

  if (!pledge) {
    root.append(
      pageHead('گزارش شخصی', 'هنوز تعهدی برای این دوره ثبت نکرده‌ای.'),
      h('div.card', {}, h('div.empty', {},
        h('div.empty-ic', { html: icon('target', 24) }),
        h('strong', {}, 'برای دیدن گزارش، اول تعهدت را ثبت کن'),
        h('p', {}, 'با ثبت وزن شروع و وزن پایان ماه، روند، پیش‌بینی و شانس جایزه محاسبه می‌شود.'),
        h('div.row.gap-8', {},
          h('button.btn.primary', { onClick: () => openPledgeModal() }, 'ثبت تعهد'),
          h('a.btn.ghost', { href: '#/profile' }, 'تکمیل BMI'),
        ),
      )),
    );
    return;
  }

  const a = analyze({ profile, pledge, entries, round });
  const rowStatus = statusFor(a);
  const weeks = weeklyGroups(entries, round);
  const points = store.seriesFor(user.id, round.id);

  const range = { start: new Date(`${round.starts_on}T00:00:00`), end: new Date(`${round.ends_on}T00:00:00`) };
  const axisLabels = [0, 7, 14, 21, 28]
    .filter((d) => d <= daysBetween(range.start, new Date(`${round.ends_on}T00:00:00`)))
    .map((d) => {
      const dt = new Date(`${round.starts_on}T00:00:00`);
      dt.setDate(dt.getDate() + d);
      return { x: d, label: formatJalali(dt, { long: false }).slice(5) };
    });

  function exportCsv() {
    const rows = [
      ['تاریخ شمسی', 'تاریخ میلادی', 'وزن (کیلوگرم)', 'تغییر', 'ساعت', 'وضعیت معده', 'یادداشت'],
    ];
    let prev = null;
    for (const e of entries) {
      const delta = prev !== null ? (Number(e.weight) - prev).toFixed(1) : '';
      rows.push([
        e.shamsi_date || '', e.entry_date, e.weight, delta,
        formatTime(e.measure_hour).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)),
        e.stomach === 'empty' ? 'ناشتا' : e.stomach === 'light' ? 'سبک' : 'پر',
        e.note || '',
      ]);
      prev = Number(e.weight);
    }
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    downloadFile(`challenge-report-${round.round_key || 'round'}.csv`, csv);
    toast('فایل CSV دانلود شد.', 'success');
  }

  root.append(
    pageHead('گزارش شخصی', `${profile.full_name} • دوره‌ی ${round.title}`, [
      h('button.btn.ghost', { onClick: exportCsv }, icon('download', 16), 'خروجی CSV'),
      h('button.btn.ghost', { onClick: () => window.print() }, icon('print', 16), 'چاپ'),
      h('a.btn.primary', { href: '#/coach' }, icon('sparkles', 16), 'تحلیل مربی'),
    ]),
  );

  /* --------------------------------------------------------------- summary */
  root.append(
    h('div.card.mb-16', {},
      h('div.row-between.wrap', {},
        h('div.row.gap-12', {},
          h('span', { class: `avatar lg ${avatarTone(user.id)}` }, initials(profile.full_name)),
          h('div', {},
            h('div.row.gap-8', {},
              h('strong', { style: { fontSize: '17px' } }, profile.full_name),
              h('span', { class: `badge ${rowStatus.tone}` }, rowStatus.label),
              h('span.badge.violet', {}, `${faDigits(a.chance)} بلیت`),
            ),
            h('div.small.muted', {},
              `از ${fmt(a.start)} به ${fmt(a.current)} کیلو • ${faDigits(a.entries.length)} ثبت • ${faDigits(a.daysLeft)} روز باقی‌مانده`,
            ),
          ),
        ),
        progressRing(a.score, { size: 84, stroke: 8, label: faDigits(a.score), sub: 'امتیاز پایبندی' }),
      ),
    ),
  );

  root.append(
    h('div.dash-strip.mb-16', {},
      statCard({ label: 'وزن فعلی', value: fmt(a.current), unit: 'کیلو', iconName: 'scale', foot: `شروع: ${fmt(a.start)}`, footTone: '' }),
      statCard({ label: 'کاهش ثبت‌شده', value: fmt(a.lost), unit: 'کیلو', iconName: 'flame', foot: a.lost > 0 ? 'ادامه بده' : 'شروع کن', footTone: a.lost > 0 ? 'down' : '' }),
      statCard({ label: 'فاصله تا تعهد', value: fmt(Math.max(0, a.remaining)), unit: 'کیلو', iconName: 'target', foot: `تعهد: ${fmt(a.promised)}` }),
      statCard({
        label: 'پیش‌بینی پایان ماه',
        value: fmt(a.projectedFinal),
        unit: 'کیلو',
        iconName: 'chart',
        foot: a.onTrack ? 'در مسیر رسیدن به تعهد' : `${fmt(a.projectionGap)} کیلو بالاتر از تعهد`,
        footTone: a.onTrack ? 'down' : 'up',
      }),
    ),
  );

  /* ----------------------------------------------------------------- chart */
  root.append(
    h('div.card.mb-16', {},
      h('div.card-head', {},
        h('div', {},
          h('h3.card-title', {}, icon('chart', 18), 'روند وزن در این دوره'),
          h('p.card-sub', {}, `شیب کلی: ${fmt(a.ratePerWeek)} کیلو در هفته • پیش‌بینی: ${fmt(a.projectedFinal)} کیلو`),
        ),
        h('div.chip-row', {},
          h('span.badge.brand', {}, 'وزن'),
          h('span.badge.gold', {}, 'تعهد'),
        ),
      ),
      lineChart({ points, target: pledge.promised_weight, height: 300, labels: axisLabels }),
      h('div.row-between.mt-8.small.muted', {},
        h('span', {}, `کیفیت ثبت: ${faDigits(a.quality)} از ۱۰۰`),
        h('span', {}, `میانگین ثبت: ${faDigits(Math.round(a.adherence))}٪ روزها`),
        h('span', {}, `بیشترین زنجیره: ${faDigits(a.streak)} روز`),
      ),
    ),
  );

  /* ------------------------------------------------------------ two columns */
  const weeklyCard = h('div.card', {},
    h('div.card-head', {}, h('h3.card-title', {}, icon('calendar', 18), 'خلاصه‌ی هفتگی')),
    weeks.length
      ? h('table.week-table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'هفته'), h('th', {}, 'میانگین'), h('th', {}, 'تغییر'), h('th', {}, 'ثبت'),
        )),
        h('tbody', {}, ...weeks.map((w) => h('tr', {},
          h('td', {}, `هفته ${faDigits(w.week)}`, h('div.tiny.muted', {}, w.range)),
          h('td', {}, `${fmt(w.avg)} کیلو`),
          h('td', { class: w.change < 0 ? 'tone-brand' : w.change > 0 ? 'tone-danger' : 'muted' }, `${w.change > 0 ? '+' : ''}${fmt(w.change)}`),
          h('td', {}, faDigits(w.count)),
        ))),
      )
      : h('div.empty', {}, h('p', {}, 'برای خلاصه‌ی هفتگی، چند وزن ثبت کن.')),
  );

  const bmiCard = h('div.card', {},
    h('div.card-head', {}, h('h3.card-title', {}, icon('heart', 18), 'BMI و هدف')),
    h('div.kv', {},
      h('div.kv-row', {}, h('span', {}, 'BMI فعلی'), h('strong', { class: `tone-${a.band.tone}` }, a.bmi ? `${fmt(a.bmi)} (${a.band.label})` : '—')),
      h('div.kv-row', {}, h('span', {}, 'BMI شروع'), h('strong', {}, a.bmiStart ? fmt(a.bmiStart) : '—')),
      h('div.kv-row', {}, h('span', {}, 'محدوده سالم'), h('strong', {}, a.ideal ? `${fmt(a.ideal.min)} – ${fmt(a.ideal.max)} کیلو` : '—')),
      h('div.kv-row', {}, h('span', {}, 'BMI هدف'), h('strong', {}, pledge.target_bmi ? fmt(pledge.target_bmi) : '—')),
      h('div.kv-row', {}, h('span', {}, 'BMR / TDEE'), h('strong', {}, a.bmr ? `${faDigits(a.bmr)} / ${faDigits(a.tdee)}` : '—')),
      h('div.kv-row', {}, h('span', {}, 'کالری پیشنهادی'), h('strong', {}, a.calorieTarget ? `${faDigits(a.calorieTarget)} کالری` : '—')),
    ),
  );

  const insights = h('div.card', {},
    h('div.card-head', {}, h('h3.card-title', {}, icon('sparkles', 18), 'تحلیل و توصیه‌ها')),
    h('div.stack', {},
      ...(a.risks.length
        ? a.risks.map((r) => h('div', { class: `insight ${r.level === 'high' ? 'danger' : r.level === 'medium' ? 'warn' : ''}` },
          h('span', { html: icon(r.level === 'low' ? 'info' : 'alert', 16) }),
          h('div', {}, r.text),
        ))
        : [h('div.insight', {}, h('span', { html: icon('check', 16) }), h('div', {}, 'هیچ ریسک مهمی در داده‌های تو دیده نمی‌شود. همین روند را ادامه بده.'))]),
      ...a.tips.slice(0, 3).map((t) => h('div.insight', {},
        h('span', { html: icon(t.icon, 16) }),
        h('div', {}, h('strong', {}, t.title), t.text),
      )),
    ),
  );

  root.append(
    h('div.grid.grid-2.mb-16', {}, weeklyCard, bmiCard),
    h('div.grid.grid-2.mb-16', {},
      insights,
      h('div.card', {},
        h('div.card-head', {}, h('h3.card-title', {}, icon('ruler', 18), 'کیفیت اندازه‌گیری')),
        h('div.kv', {},
          h('div.kv-row', {}, h('span', {}, 'ثبت ناشتا و صبح'), h('strong', {}, `${faDigits(entries.filter((e) => e.stomach === 'empty' && Number(e.measure_hour) <= 10).length)} مورد`)),
          h('div.kv-row', {}, h('span', {}, 'اختلاف ساعت ثبت'), h('strong', {}, `${faDigits(a.hourSpread)} ساعت`)),
          h('div.kv-row', {}, h('span', {}, 'نوسان ۸ ثبت اخیر'), h('strong', {}, `${fmt(a.noise)} کیلو`)),
          h('div.kv-row', {}, h('span', {}, 'آخرین ثبت'), h('strong', {}, a.latest ? relativeDay(new Date(`${a.latest.entry_date}T00:00:00`)) : '—')),
          h('div.kv-row', {}, h('span', {}, 'روند ۷ روز اخیر'), h('strong', { class: a.mood === 'down' ? 'tone-brand' : a.mood === 'up' ? 'tone-danger' : 'muted' }, a.mood === 'down' ? 'نزولی' : a.mood === 'up' ? 'صعودی' : 'ثابت')),
        ),
        h('div.alert.info.mt-12', {},
          h('span', { html: icon('info', 17) }),
          h('div', {}, 'برای مقایسه‌ی درست، همیشه صبح، ناشتا و با همان ترازو وزن کن.'),
        ),
      ),
    ),
  );

  /* --------------------------------------------------------------- entries */
  const rows = [...entries].reverse();
  root.append(
    h('div', {},
      sectionHead('همه‌ی ثبت‌ها', 'clock', h('span.badge', {}, `${faDigits(entries.length)} ردیف`)),
      h('div.table-wrap', {},
        h('table.data', {},
          h('thead', {}, h('tr', {},
            h('th', {}, 'تاریخ'),
            h('th', {}, 'روز'),
            h('th.num', {}, 'وزن'),
            h('th.num', {}, 'تغییر'),
            h('th', {}, 'ساعت'),
            h('th', {}, 'وضعیت معده'),
            h('th', {}, 'یادداشت'),
          )),
          h('tbody', {}, ...rows.map((e, i) => {
            const d = new Date(`${e.entry_date}T00:00:00`);
            const next = rows[i + 1];
            const diff = next ? Number(e.weight) - Number(next.weight) : null;
            return h('tr', {},
              h('td.nowrap', {}, formatJalali(d, { long: false })),
              h('td.nowrap', {}, relativeDay(d)),
              h('td.num', {}, `${fmt(e.weight)}`),
              h('td.num', {}, diff === null ? '—' : h('span', { class: `delta ${diff < 0 ? 'down' : diff > 0 ? 'up' : 'flat'}` }, `${diff > 0 ? '+' : ''}${fmt(Math.abs(diff))}`)),
              h('td.nowrap', {}, formatTime(e.measure_hour)),
              h('td', {}, h('span.badge', { class: e.stomach === 'empty' ? 'brand' : e.stomach === 'light' ? 'sky' : 'muted' },
                e.stomach === 'empty' ? 'ناشتا' : e.stomach === 'light' ? 'سبک' : 'پر')),
              h('td', {}, e.note || h('span.muted', {}, '—')),
            );
          })),
        ),
        h('div.table-note', {}, 'این گزارش فقط برای شما و مدیر دوره قابل مشاهده است.'),
      ),
    ),
  );
}
