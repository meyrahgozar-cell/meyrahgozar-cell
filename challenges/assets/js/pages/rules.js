/** قوانین چالش، نحوه‌ی تقسیم جایزه و ماشین‌حساب شانس. */
import { store } from '../store.js';
import { CONFIG } from '../config.js';
import {
  h, icon, field, fmt, money, faDigits, num, modal,
} from '../utils.js';
import { pageHead, sectionHead } from '../ui/shell.js';
import { currentRoundRange, formatJalali } from '../jalali.js';

const RULES = [
  {
    title: 'سهم اشتراک و شکل‌گیری جایزه',
    text: 'هر شرکت‌کننده برای هر دوره یک سهم اشتراک پرداخت می‌کند. مجموع همین سهم‌ها استخر جایزه‌ی همان دوره را می‌سازد؛ هیچ مبلغی از خارج اضافه نمی‌شود.',
  },
  {
    title: 'تعهد وزن پایان ماه',
    text: 'در شروع دوره، وزن شروع و وزن تعهد پایان ماه را ثبت می‌کنی. تفاوت این دو، «کیلوهای تعهد» توست. تعهد باید واقع‌بینانه و در محدوده‌ی سالم BMI باشد.',
  },
  {
    title: 'ثبت روزانه‌ی وزن',
    text: 'هر روز وزن را با ساعت اندازه‌گیری و وضعیت معده (ناشتا / سبک / پر) ثبت کن. برای مقایسه‌ی درست، صبح، ناشتا و با همان ترازو وزن کن.',
  },
  {
    title: 'شرط برنده شدن',
    text: 'در پایان ماه، هر کس وزنش کمتر یا مساوی وزن تعهدش باشد و سهم اشتراکش تأیید شده باشد، «واجد شرایط» است. نرسیدن به تعهد یعنی حذف از قرعه‌کشی.',
  },
  {
    title: 'قرعه‌کشی با بلیت وزنی',
    text: 'برای هر کیلوگرم کاهش تعهد، یک بلیت به آن نفر داده می‌شود. سپس یک بلیت به‌صورت تصادفی از مجموع بلیت‌های واجدین شرایط انتخاب می‌شود. هرچه تعهد بزرگ‌تر، شانس بیشتر — ولی نرسیدن به تعهد، همه‌ی شانس را از بین می‌برد.',
  },
  {
    title: 'شفافیت نتیجه',
    text: 'قرعه‌کشی با بذر ثابت (seed) انجام و در تاریخچه‌ی دوره ثبت می‌شود؛ نتیجه با همان بذر قابل بازتولید است. جدول شانس همه‌ی نفرات قبل از قرعه‌کشی قابل مشاهده است.',
  },
  {
    title: 'سلامت و محدوده‌ی BMI',
    text: 'BMI هدف کمتر از ۱۸٫۵ پذیرفته نمی‌شود. اگر BMI بالای ۳۵، بارداری، شیردهی یا بیماری زمینه‌ای داری، قبل از شرکت با پزشک مشورت کن. این چالش جایگزین درمان نیست.',
  },
  {
    title: 'حریم خصوصی',
    text: 'وزن و یادداشت‌های روزانه فقط برای خودت و مدیر دوره نمایش داده می‌شود؛ در جدول عمومی فقط وزن شروع، وزن فعلی، تعهد و شاخص‌های محاسبه‌شده دیده می‌شود.',
  },
];

export async function render(root) {
  const round = store.round;
  const range = currentRoundRange();
  const fee = round?.fee || CONFIG.defaultFee;
  const board = store.board();

  root.append(pageHead(
    'قوانین، جایزه و شفافیت',
    'همه‌چیز درباره‌ی سهم اشتراک، تعهد وزن، شرایط برنده شدن و نحوه‌ی قرعه‌کشی.',
    [h('a.btn.primary', { href: '#/overall' }, icon('trophy', 16), 'جدول شانس و قرعه‌کشی')],
  ));

  root.append(
    h('div.pool-box.mb-16', {},
      h('div.row-between.wrap', {},
        h('div', {},
          h('div.prize-label', {}, icon('calendar', 15), `دوره‌ی جاری: ${round.title}`),
          h('div.pool-amount', {}, money(fee)),
          h('div.small.muted', {}, `سهم هر نفر • ${formatJalali(range.start, { long: true })} تا ${formatJalali(range.end, { long: true })}`),
        ),
        h('div', {},
          h('div.prize-label', {}, icon('trophy', 15), 'استخر فعلی'),
          h('div.strong', { style: { fontSize: '22px', color: 'var(--brand)' } }, money(store.poolForRound())),
          h('div.tiny.muted', {}, `${faDigits(store.paidPayments().length)} سهم پرداخت‌شده`),
        ),
      ),
    ),
    h('div.alert.info.mb-16', {},
      h('span', { html: icon('info', 18) }),
      h('div', {}, 'در این نسخه درگاه پرداخت آنلاین متصل نیست؛ پرداخت با هماهنگی مدیر دوره ثبت و تأیید می‌شود. ساختار داده برای اتصال درگاه آماده است.'),
    ),
  );

  /* --------------------------------------------------------------- rules */
  root.append(
    sectionHead('قوانین دوره', 'book'),
    h('div.rule-list', {}, ...RULES.map((rule, i) => h('div.rule-item', {},
      h('div.rule-num', {}, faDigits(i + 1)),
      h('div', {}, h('h4', {}, rule.title), h('p', {}, rule.text)),
    ))),
  );

  /* -------------------------------------------------------------- formula */
  root.append(
    sectionHead('فرمول قرعه‌کشی', 'trophy'),
    h('div.card', {},
      h('div.formula', {},
        h('div', {}, 'استخر جایزه = ', h('code', {}, 'مجموع سهم‌های پرداخت‌شده')),
        h('div', {}, 'بلیت هر نفر = ', h('code', {}, 'حداکثر(۱، گرد شده‌ی کیلوگرم تعهد)')),
        h('div', {}, 'شرط ورود = ', h('code', {}, 'وزن پایانی ≤ وزن تعهد  و  پرداخت تأییدشده')),
        h('div', {}, 'احتمال برد = ', h('code', {}, 'بلیت او ÷ مجموع بلیت‌های واجدین')),
      ),
      h('div.small.muted.mt-8', {}, 'مثال: اگر دو نفر به تعهد برسند، یکی با ۶ کیلو و دیگری با ۴ کیلو تعهد، شانس‌ها ۶۰٪ و ۴۰٪ است.'),
    ),
  );

  /* ----------------------------------------------------------- calculator */
  const peopleInput = h('input.input', { type: 'number', min: '2', max: '200', value: String(Math.max(2, board.length || 6)) });
  const feeInput = h('input.input', { type: 'number', min: '0', step: '10000', value: String(fee) });
  const kgA = h('input.input', { type: 'number', min: '0', max: '30', step: '0.5', value: '5' });
  const kgB = h('input.input', { type: 'number', min: '0', max: '30', step: '0.5', value: '3' });
  const result = h('div');

  function calc() {
    const people = num(peopleInput.value);
    const f = num(feeInput.value);
    const a = num(kgA.value);
    const b = num(kgB.value);
    const pool = people * f;
    const ta = Math.max(1, Math.round(a));
    const tb = Math.max(1, Math.round(b));
    const total = ta + tb;
    result.replaceChildren(
      h('div.grid.grid-2', {},
        h('div.target-preview', {}, h('span.muted', {}, 'استخر جایزه'), h('strong', { style: { color: 'var(--gold)' } }, money(pool))),
        h('div.target-preview', {}, h('span.muted', {}, 'شانس نفر با'), h('strong', {}, `${fmt(a)} کیلو تعهد: ${faDigits(Math.round((ta / total) * 100))}٪`)),
      ),
      h('div.ticket-strip.mt-12', {},
        h('i', { style: { width: `${(ta / total) * 100}%`, background: 'var(--gold)' } }),
        h('i', { style: { width: `${(tb / total) * 100}%`, background: 'var(--brand)' } }),
      ),
      h('div.small.muted.mt-8', {},
        `نفر اول ${faDigits(ta)} بلیت و نفر دوم ${faDigits(tb)} بلیت از ${faDigits(total)} بلیت دارد.`,
      ),
    );
  }

  [peopleInput, feeInput, kgA, kgB].forEach((i) => i.addEventListener('input', calc));
  calc();

  root.append(
    sectionHead('ماشین‌حساب شانس', 'target'),
    h('div.card', {},
      h('div.card-head', {},
        h('div', {}, h('h3.card-title', {}, icon('target', 18), 'اگر دو نفر به تعهد برسند…'),
          h('p.card-sub', {}, 'با تغییر اعداد، استخر جایزه و شانس‌ها را ببین.')),
      ),
      h('div.field-row', {},
        field('تعداد شرکت‌کننده', peopleInput, 'همه سهم کامل پرداخت کرده باشند.'),
        field('سهم هر نفر (تومان)', feeInput),
      ),
      h('div.field-row.mt-12', {},
        field('کیلو تعهد نفر اول', kgA),
        field('کیلو تعهد نفر دوم', kgB),
      ),
      result,
    ),
  );

  /* ----------------------------------------------------------------- faq */
  const FAQS = [
    ['اگر کسی به تعهد نرسد چه می‌شود؟', 'از قرعه‌کشی حذف می‌شود و سهمش در استخر جایزه می‌ماند؛ جایزه به برنده‌ی واجد شرایط می‌رسد.'],
    ['اگر هیچ‌کس به تعهد نرسد؟', 'قرعه‌کشی انجام نمی‌شود. تصمیم درباره‌ی استخر (انتقال به دوره بعد یا بازگشت سهم‌ها) با مدیر دوره و شرکت‌کننده‌هاست.'],
    ['چرا ساعت و وضعیت معده مهم است؟', 'وزن بین صبح ناشتا و بعد از غذا می‌تواند تا یک کیلو اختلاف داشته باشد. ثبت همین جزئیات باعث می‌شود تحلیل و روند واقعی باشد، نه نوسان آب و غذا.'],
    ['آیا می‌توانم تعهدم را وسط ماه عوض کنم؟', 'تعهد قابل ویرایش است تا قبل از پایان دوره، اما هر تغییر در تاریخچه ثبت می‌شود. برای انصاف، تعهد نهایی همان است که در لحظه‌ی تسویه ثبت شده.'],
    ['جایزه چطور پرداخت می‌شود؟', 'پس از تسویه، مدیر دوره مبلغ استخر را به برنده پرداخت می‌کند. در این نسخه درگاه آنلاین متصل نیست.'],
    ['BMI هدفم را چطور انتخاب کنم؟', 'در صفحه‌ی پروفایل، قد و وزن را وارد کن؛ محدوده‌ی سالم نمایش داده می‌شود. هدف زیر ۱۸٫۵ پذیرفته نمی‌شود.'],
  ];

  root.append(
    sectionHead('پرسش‌های پرتکرار', 'info'),
    h('div.stack', {}, ...FAQS.map(([q, a]) => h('details.card.pad-sm', {},
      h('summary', { style: { cursor: 'pointer', fontWeight: '650', fontSize: '13.5px' } }, q),
      h('p.small.muted.mt-8', {}, a),
    ))),
  );
}
