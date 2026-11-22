/** ثبت وزن روزانه: وزن، ساعت اندازه‌گیری، وضعیت معده و یادداشت. */
import { state, store } from '../store.js';
import { CONFIG } from '../config.js';
import {
  h, icon, field, fmt, num, toast, faDigits, confirmDialog,
} from '../utils.js';
import { pageHead, sectionHead, loginPrompt, statCard } from '../ui/shell.js';
import { openPledgeModal } from '../ui/join.js';
import { jalaliDateField } from '../ui/datepicker.js';
import {
  formatJalali, formatTime, relativeDay, toJalali, jalaliISO,
} from '../jalali.js';
import { lineChart } from '../chart.js';
import { analyze } from '../ai.js';

export async function render(root) {
  if (!store.isLoggedIn) {
    loginPrompt(root, 'برای ثبت وزن روزانه باید وارد حساب خود شوی.');
    return;
  }
  const user = state.sessionUser;
  const pledge = store.myPledge();
  const round = store.round;

  root.append(pageHead(
    'ثبت وزن امروز',
    'عدد ترازو را با ساعت اندازه‌گیری و وضعیت معده ثبت کن؛ همین جزئیات، تحلیل را دقیق می‌کند.',
    [h('a.btn.ghost', { href: '#/report' }, icon('chart', 16), 'گزارش من')],
  ));

  if (!pledge) {
    root.append(
      h('div.alert.warn.mb-16', {},
        h('span', { html: icon('alert', 18) }),
        h('div.grow', {}, h('strong', {}, 'اول تعهد این ماه را ثبت کن. '), 'تا وزن شروع و وزن تعهد مشخص نشود، پیشرفت قابل محاسبه نیست.'),
        h('button.btn.sm.primary', { onClick: () => openPledgeModal() }, 'ثبت تعهد'),
      ),
    );
  }

  const entries = store.entriesFor(user.id, round.id);
  const latest = entries.at(-1) || null;
  const today = new Date();

  /* ------------------------------------------------------------- form card */
  const picker = jalaliDateField({ value: today });
  const weightInput = h('input.input', {
    type: 'number', step: '0.1', inputmode: 'decimal', min: '25', max: '300',
    placeholder: 'مثلاً ۷۸٫۴', style: { fontSize: '20px', fontWeight: '750', textAlign: 'center' },
  });
  const noteInput = h('textarea.input', { rows: 2, placeholder: 'مثلاً: بعد از پیاده‌روی صبحگاهی، خواب خوب' });
  let selectedHour = 8;
  let selectedStomach = 'empty';

  const hourWrap = h('div.hour-grid');
  const stomachWrap = h('div.stomach-options');
  const compareLine = h('div.small.muted');
  const saveBtn = h('button.btn.primary.lg.block', { onClick: save }, icon('check', 18), 'ثبت وزن');
  const existingBadge = h('div');

  function renderHours() {
    hourWrap.replaceChildren(...CONFIG.measurementHours.map((_, idx) => {
      const hour = idx + 6;
      return h('button', {
        type: 'button',
        class: `hour-btn ${hour === selectedHour ? 'active' : ''}`,
        onClick: () => {
          selectedHour = hour;
          renderHours();
        },
      }, formatTime(hour));
    }));
  }

  function renderStomach() {
    stomachWrap.replaceChildren(...CONFIG.stomachStates.map((opt) => h('div', {
      class: `stomach-option ${opt.value === selectedStomach ? 'active' : ''}`,
      role: 'button',
      tabindex: '0',
      onClick: () => {
        selectedStomach = opt.value;
        renderStomach();
      },
    },
    h('span.stomach-dot'),
    h('div', {}, h('strong', {}, opt.label), h('small', {}, opt.hint)),
    )));
  }

  function findEntry(date) {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return entries.find((e) => e.entry_date === iso) || null;
  }

  function syncForDate() {
    const date = picker.getDate();
    const found = findEntry(date);
    existingBadge.replaceChildren(
      found
        ? h('span.badge.gold', {}, icon('refresh', 12), 'برای این روز قبلاً ثبت شده — ذخیره، آن را ویرایش می‌کند')
        : h('span.badge.muted', {}, 'ثبت جدید'),
    );
    if (found) {
      weightInput.value = found.weight;
      selectedHour = Number(found.measure_hour) || 8;
      selectedStomach = found.stomach || 'empty';
      noteInput.value = found.note || '';
      renderHours();
      renderStomach();
    }
    updateCompare();
  }

  function updateCompare() {
    const w = num(weightInput.value);
    const prev = entries.filter((e) => e.entry_date !== (findEntry(picker.getDate())?.entry_date)).at(-1);
    if (!w || !prev) {
      compareLine.textContent = prev ? `آخرین وزن ثبت‌شده: ${fmt(prev.weight)} کیلوگرم` : 'اولین ثبت این دوره';
      return;
    }
    const diff = w - Number(prev.weight);
    const cls = diff < -0.05 ? 'tone-brand' : diff > 0.05 ? 'tone-danger' : 'tone-muted';
    compareLine.replaceChildren(
      h('span', {}, `نسبت به ثبت قبل (${fmt(prev.weight)}): `),
      h('strong', { class: cls }, `${diff > 0 ? '+' : ''}${fmt(Math.abs(diff))} کیلو`),
    );
  }

  weightInput.addEventListener('input', updateCompare);

  const step = (delta) => {
    const cur = num(weightInput.value) || (latest ? Number(latest.weight) : 75);
    weightInput.value = (cur + delta).toFixed(1);
    updateCompare();
  };

  async function save() {
    const weight = num(weightInput.value);
    if (!weight || weight < 25 || weight > 300) {
      toast('وزن معتبر وارد کن (بین ۲۵ تا ۳۰۰ کیلوگرم).', 'error');
      return;
    }
    if (!selectedHour) {
      toast('ساعت اندازه‌گیری را انتخاب کن.', 'warn');
      return;
    }
    try {
      saveBtn.disabled = true;
      await store.saveEntry({
        date: picker.getDate(),
        weight,
        hour: selectedHour,
        stomach: selectedStomach,
        note: noteInput.value,
      });
      toast('وزن ثبت شد. تحلیل و جدول به‌روز شد.', 'success');
      saveBtn.disabled = false;
    } catch (err) {
      toast(err.message || 'ثبت وزن ناموفق بود.', 'error');
      saveBtn.disabled = false;
    }
  }

  renderHours();
  renderStomach();
  if (latest) weightInput.value = latest.weight;
  updateCompare();

  const formCard = h('div.card', {},
    h('div.card-head', {},
      h('div', {},
        h('h3.card-title', {}, icon('scale', 18), 'فرم ثبت وزن'),
        h('p.card-sub', {}, 'همیشه همان شرایط را تکرار کن: صبح، ناشتا، همان ترازو.'),
      ),
      existingBadge,
    ),
    h('div.stack', {},
      field('تاریخ (شمسی)', picker.el, 'پیش‌فرض امروز است؛ می‌توانی روزهای گذشته را هم ثبت کنی.'),
      h('div', {},
        h('span.field-label', {}, 'وزن (کیلوگرم)'),
        h('div.row.gap-8', {},
          h('button.icon-btn', { type: 'button', 'aria-label': 'کم کردن', onClick: () => step(-0.1) }, '−'),
          weightInput,
          h('button.icon-btn', { type: 'button', 'aria-label': 'اضافه کردن', onClick: () => step(0.1) }, '+'),
        ),
        compareLine,
      ),
      h('div', {}, h('span.field-label', {}, 'ساعت اندازه‌گیری'), hourWrap),
      h('div', {}, h('span.field-label', {}, 'وضعیت معده'), stomachWrap),
      field('یادداشت (اختیاری)', noteInput, 'خواب، ورزش، مهمانی یا هر چیزی که ممکن است روی عدد اثر بگذارد.'),
      saveBtn,
    ),
  );

  /* ------------------------------------------------------------ side column */
  const analysis = pledge ? analyze({
    profile: state.profile,
    pledge,
    entries,
    round,
  }) : null;

  const recent = [...entries].reverse().slice(0, 8);
  const recentCard = h('div.card', {},
    h('div.card-head', {},
      h('h3.card-title', {}, icon('clock', 18), 'ثبت‌های اخیر'),
      h('span.badge', {}, `${faDigits(entries.length)} ثبت`),
    ),
    recent.length
      ? h('div.entry-list', {}, ...recent.map((e) => {
        const d = new Date(`${e.entry_date}T00:00:00`);
        const idx = entries.findIndex((x) => x.id === e.id);
        const prev = idx > 0 ? entries[idx - 1] : null;
        const diff = prev ? Number(e.weight) - Number(prev.weight) : null;
        return h('div.entry-row', {},
          h('div.entry-date', {}, relativeDay(d), h('small', {}, formatJalali(d, { long: false }))),
          h('div.grow', {},
            h('div', {},
              h('span.entry-weight', {}, `${fmt(e.weight)} کیلو`),
              diff !== null
                ? h('span.small', { class: `tone-${diff < 0 ? 'brand' : diff > 0 ? 'danger' : 'muted'}`, style: { marginInlineStart: '8px' } },
                  `${diff > 0 ? '+' : ''}${fmt(Math.abs(diff))}`)
                : null,
            ),
            h('div.entry-meta', {},
              h('span', {}, icon('clock', 12), ' ', formatTime(e.measure_hour)),
              h('span', {}, CONFIG.stomachStates.find((s) => s.value === e.stomach)?.label || '—'),
            ),
          ),
          h('button.entry-del', {
            title: 'حذف ثبت',
            onClick: async () => {
              if (await confirmDialog('این ثبت وزن حذف شود؟', { danger: true, okText: 'حذف' })) {
                await store.deleteEntry(e.id);
                toast('ثبت حذف شد.', 'info');
              }
            },
            html: icon('trash', 15),
          }),
        );
      }))
      : h('div.empty', {},
        h('div.empty-ic', { html: icon('scale', 22) }),
        h('strong', {}, 'هنوز وزنی ثبت نشده'),
        h('p', {}, 'اولین عدد را ثبت کن تا نمودار و تحلیل شخصی ساخته شود.'),
      ),
  );

  const chartPoints = entries.map((e) => {
    const d = new Date(`${e.entry_date}T00:00:00`);
    return { x: d.getDate(), y: Number(e.weight), label: formatJalali(d, { long: false }).slice(5), title: `${formatJalali(d, { long: true })} — ${e.weight}` };
  });

  const trendCard = h('div.card', {},
    h('div.card-head', {},
      h('h3.card-title', {}, icon('chart', 18), 'روند این دوره'),
      h('a.card-link', { href: '#/report' }, 'گزارش کامل'),
    ),
    lineChart({ points: chartPoints, target: pledge?.promised_weight ?? null, height: 210 }),
  );

  root.append(
    h('div.log-grid.mt-16', {},
      h('div.stack', {}, formCard, analysis ? h('div.card', {},
        h('div.card-head', {}, h('h3.card-title', {}, icon('sparkles', 18), 'پیشنهاد امروز مربی')),
        h('div.insight', {},
          h('span', { html: icon('sparkles', 16) }),
          h('div', {},
            h('strong', {}, analysis.tips[0]?.title || 'ثبت منظم'),
            analysis.tips[0]?.text || 'هر روز در ساعت ثابت وزن کن.',
          ),
        ),
        h('div.row.gap-8.mt-12', {},
          h('a.btn.sm.ghost', { href: '#/coach' }, 'گفت‌وگو با مربی'),
          h('a.btn.sm.ghost', { href: '#/profile' }, 'شرایط BMI'),
        ),
      ) : null),
      h('div.stack', {}, recentCard, trendCard),
    ),
  );
}
