/** پروفایل کاربر و الزامات BMI: قد، سن، جنسیت، سطح فعالیت و BMI هدف. */
import { state, store } from '../store.js';
import { CONFIG } from '../config.js';
import {
  h, icon, field, fmt, num, money, toast, faDigits, avatarTone, initials,
  selectEl, confirmDialog,
} from '../utils.js';
import { pageHead, sectionHead, loginPrompt } from '../ui/shell.js';
import { openPledgeModal, openPaymentModal, profileMissing } from '../ui/join.js';
import { bmiValue, bmiBand, idealRange, tdeeValue, bmr, ageFromBirthYear } from '../ai.js';
import { formatJalali, toJalali } from '../jalali.js';

export async function render(root) {
  if (!store.isLoggedIn) {
    loginPrompt(root, 'برای دیدن و ویرایش پروفایل وارد حساب خود شو.');
    return;
  }
  const p = state.profile;
  const round = store.round;
  const pledge = store.myPledge();
  const payment = store.myPayment();
  const latest = store.latestEntry(state.sessionUser.id);
  const weightNow = latest ? Number(latest.weight) : (pledge?.start_weight || null);
  const height = Number(p.height_cm) || null;
  const bmi = bmiValue(weightNow, height);
  const band = bmiBand(bmi);
  const ideal = idealRange(height);
  const age = ageFromBirthYear(p.birth_year);
  const missing = profileMissing();

  root.append(pageHead(
    'پروفایل و شرایط BMI',
    'این اطلاعات پایه‌ی محاسبه‌ی BMI، کالری و تحلیل هوشمند است.',
    [h('a.btn.ghost', { href: '#/report' }, icon('chart', 16), 'گزارش من')],
  ));

  if (missing.length) {
    root.append(
      h('div.alert.warn.mb-16', {},
        h('span', { html: icon('alert', 18) }),
        h('div', {}, h('strong', {}, 'اطلاعات BMI ناقص است: '), `${missing.join('، ')} را پر کن تا BMI و برنامه‌ی کالری محاسبه شود.`),
      ),
    );
  }

  /* ---------------------------------------------------------- identity card */
  const nameInput = h('input.input', { value: p.full_name || '', placeholder: 'نام و نام خانوادگی' });
  const cityInput = h('input.input', { value: p.city || '', placeholder: 'شهر' });
  const genderSel = selectEl(CONFIG.genders, p.gender || 'female', null);
  const birthSel = (() => {
    const { jy } = toJalali(new Date());
    const opts = [];
    for (let y = jy - 14; y >= jy - 80; y -= 1) opts.push({ value: y, label: faDigits(y) });
    return selectEl(opts, p.birth_year || jy - 32, null);
  })();
  const heightInput = h('input.input', {
    type: 'number', inputmode: 'numeric', min: '100', max: '230', step: '1',
    value: p.height_cm || '', placeholder: 'مثلاً ۱۶۸',
  });
  const activitySel = selectEl(
    CONFIG.activityLevels.map((a) => ({ value: a.value, label: a.label })),
    p.activity_level || 'light',
    null,
  );

  const identity = h('div.card', {},
    h('div.profile-head.mb-16', {},
      h('span', { class: `avatar lg ${avatarTone(p.id)}` }, initials(p.full_name)),
      h('div.profile-id.grow', {},
        h('h2', {}, p.full_name || 'کاربر ترازو'),
        h('p.small.muted', {}, state.sessionUser.email || ''),
        h('div.chip-row.mt-8', {},
          h('span', { class: `badge ${p.role === 'admin' ? 'gold' : 'muted'}` }, p.role === 'admin' ? 'مدیر دوره' : 'شرکت‌کننده'),
          h('span.badge', {}, icon('calendar', 12), `عضویت از ${formatJalali(p.created_at || new Date(), { long: true })}`),
          age ? h('span.badge', {}, `${faDigits(age)} سال`) : null,
        ),
      ),
    ),
    h('div.stack', {},
      h('div.field-row', {}, field('نام و نام خانوادگی', nameInput), field('شهر', cityInput)),
      h('div.field-row-3', {},
        field('جنسیت', genderSel),
        field('سال تولد (شمسی)', birthSel),
        field('قد (سانتی‌متر)', heightInput),
      ),
      field('سطح فعالیت روزانه', activitySel, 'برای محاسبه‌ی کالری روزانه (TDEE) استفاده می‌شود.'),
      h('button.btn.primary', { onClick: saveIdentity }, icon('check', 17), 'ذخیره‌ی اطلاعات'),
    ),
  );

  async function saveIdentity() {
    const name = nameInput.value.trim();
    const heightVal = num(heightInput.value);
    if (name.length < 3) return toast('نام کامل را وارد کن.', 'warn');
    if (heightInput.value && (heightVal < 100 || heightVal > 230)) return toast('قد باید بین ۱۰۰ تا ۲۳۰ سانتی‌متر باشد.', 'error');
    try {
      await store.saveProfile({
        full_name: name,
        city: cityInput.value.trim(),
        gender: genderSel.value,
        birth_year: Number(birthSel.value),
        height_cm: heightVal || null,
        activity_level: activitySel.value,
      });
      toast('پروفایل ذخیره شد.', 'success');
    } catch (err) {
      toast(err.message || 'ذخیره ناموفق بود.', 'error');
    }
  }

  /* -------------------------------------------------------------- BMI card */
  const bmiPercent = bmi ? Math.min(100, Math.max(0, ((bmi - 15) / 25) * 100)) : 0;
  const targetWeight = ideal && bmi ? weightNow : null;

  const targetBmiInput = h('input.input', {
    type: 'number', step: '0.1', min: '17', max: '35',
    value: p.target_bmi || (bmi ? Math.max(CONFIG.bmi.safeMin + 1, bmi - 3).toFixed(1) : ''),
  });
  const targetPreview = h('div.target-preview');
  const targetHint = h('div.small.muted');

  function updateTargetPreview() {
    const tb = num(targetBmiInput.value);
    const w = bmiValue(weightNow, height);
    if (!tb || !height) {
      targetPreview.replaceChildren(h('span.muted', {}, 'قد را وارد کن تا وزن هدف محاسبه شود.'));
      return;
    }
    const targetW = Number((tb * (height / 100) ** 2).toFixed(1));
    const diff = weightNow ? Number((weightNow - targetW).toFixed(1)) : null;
    const unsafe = tb < CONFIG.bmi.safeMin || tb > 40;
    targetPreview.replaceChildren(
      h('span.muted', {}, 'وزن متناظر با این BMI'),
      h('div.row.gap-8', {},
        h('strong', { style: { color: 'var(--brand)' } }, `${fmt(targetW)} کیلو`),
        diff !== null ? h('span.badge', { class: diff > 0 ? 'gold' : 'sky' }, `${diff > 0 ? 'کاهش' : 'افزایش'} ${fmt(Math.abs(diff))} کیلو`) : null,
        h('span.badge', { class: unsafe ? 'danger' : 'brand' }, unsafe ? 'خارج از محدوده سالم' : 'محدوده سالم'),
      ),
    );
    targetHint.replaceChildren(
      bmi
        ? h('span', {}, `BMI فعلی: ${fmt(bmi)} (${band.label}) — قد ${fmt(height, 0)} سانتی‌متر`)
        : h('span', {}, 'برای محاسبه‌ی BMI، قد و وزن لازم است.'),
    );
  }
  targetBmiInput.addEventListener('input', updateTargetPreview);
  heightInput.addEventListener('input', updateTargetPreview);

  const bmiCard = h('div.card', {},
    h('div.card-head', {},
      h('div', {}, h('h3.card-title', {}, icon('heart', 18), 'شاخص توده بدنی (BMI)'), h('p.card-sub', {}, 'الزامات BMI برای شروع و هدف‌گذاری')),
      bmi ? h('span', { class: `badge lg ${band.tone}` }, band.label) : h('span.badge.muted', {}, 'ناقص'),
    ),
    h('div.bmi-ring-wrap', {},
      h('div', {},
        h('div.bmi-big', { class: `tone-${band.tone}` }, bmi ? fmt(bmi) : '—'),
        h('div.small.muted', {}, 'کیلوگرم بر متر مربع'),
      ),
      h('div.grow', {},
        h('div.bmi-scale', {},
          h('i.b1'), h('i.b2'), h('i.b3'), h('i.b4'),
          h('span.bmi-marker', { style: { insetInlineStart: `${bmiPercent}%` } }),
        ),
        h('div.bmi-labels', {},
          h('span', {}, 'کمبود ۱۸٫۵'),
          h('span', {}, 'نرمال ۲۴٫۹'),
          h('span', {}, 'اضافه ۲۹٫۹'),
          h('span', {}, 'چاقی ۳۵+'),
        ),
        ideal ? h('div.small.muted.mt-8', {}, `محدوده‌ی وزن سالم برای قد تو: `, h('strong', {}, `${fmt(ideal.min)} تا ${fmt(ideal.max)} کیلو`)) : null,
      ),
    ),
    h('div.formula.mt-16', {},
      h('div', {}, 'BMI = وزن (کیلوگرم) ÷ قد² (متر)'),
      h('div.tiny.muted', {}, 'برای شرکت در چالش، BMI هدف باید حداقل ۱۸٫۵ باشد. برنامه هدف‌های زیر ۱۸٫۵ را نمی‌پذیرد.'),
    ),
    h('div.mt-16', {},
      h('span.field-label', {}, 'BMI هدف من'),
      h('div.row.gap-8', {}, targetBmiInput, h('span.input-suffix', {}, 'kg/m²')),
    ),
    targetPreview,
    targetHint,
    h('button.btn.ghost.mt-12', { onClick: saveTarget }, icon('target', 16), 'ذخیره‌ی BMI هدف'),
  );

  async function saveTarget() {
    const tb = num(targetBmiInput.value);
    if (!tb || tb < CONFIG.bmi.safeMin) return toast('BMI هدف باید حداقل ۱۸٫۵ باشد.', 'error');
    try {
      await store.saveProfile({ target_bmi: tb });
      toast('BMI هدف ذخیره شد.', 'success');
    } catch (err) {
      toast(err.message || 'ذخیره ناموفق بود.', 'error');
    }
  }

  /* ---------------------------------------------------------- calories card */
  const b = bmr({ gender: p.gender || genderSel.value, weight: weightNow, heightCm: height, age });
  const tdee = tdeeValue({ ...p, height_cm: height, birth_year: Number(birthSel.value), activity_level: activitySel.value }, weightNow);
  const calories = h('div.card', {},
    h('div.card-head', {},
      h('h3.card-title', {}, icon('flame', 18), 'نیاز کالری روزانه'),
      h('a.card-link', { href: '#/coach' }, 'توصیه‌های مربی'),
    ),
    weightNow && height && age
      ? h('div.stack', {},
        h('div.kv', {},
          h('div.kv-row', {}, h('span', {}, 'BMR (سوخت پایه)'), h('strong', {}, `${faDigits(b)} کالری`)),
          h('div.kv-row', {}, h('span', {}, 'TDEE (با فعالیت)'), h('strong', {}, `${faDigits(tdee)} کالری`)),
          h('div.kv-row', {}, h('span', {}, 'کاهش آرام'), h('strong', {}, `${faDigits(Math.max(1200, tdee - 300))} کالری`)),
          h('div.kv-row', {}, h('span', {}, 'کاهش تعهدی'), h('strong', {}, `${faDigits(Math.max(p.gender === 'male' ? 1500 : 1200, tdee - 550))} کالری`)),
        ),
        h('p.tiny.muted', {}, 'این اعداد تخمینی‌اند؛ اگر بیماری زمینه‌ای داری یا دارو مصرف می‌کنی، با پزشک مشورت کن.'),
      )
      : h('div.empty', {},
        h('div.empty-ic', { html: icon('flame', 22) }),
        h('strong', {}, 'اطلاعات کافی نیست'),
        h('p', {}, 'قد، سال تولد، جنسیت و وزن ثبت‌شده لازم است.'),
      ),
  );

  /* -------------------------------------------------------------- pledge card */
  const pledgeCard = h('div.card', {},
    h('div.card-head', {},
      h('div', {}, h('h3.card-title', {}, icon('target', 18), 'تعهد این دوره'), h('p.card-sub', {}, round.title)),
      pledge ? h('span.badge.brand', {}, 'فعال') : h('span.badge.gold', {}, 'ثبت نشده'),
    ),
    pledge
      ? h('div.stack', {},
        h('div.kv', {},
          h('div.kv-row', {}, h('span', {}, 'وزن شروع'), h('strong', {}, `${fmt(pledge.start_weight)} کیلو`)),
          h('div.kv-row', {}, h('span', {}, 'وزن فعلی'), h('strong', {}, weightNow ? `${fmt(weightNow)} کیلو` : '—')),
          h('div.kv-row', {}, h('span', {}, 'تعهد پایان ماه'), h('strong', {}, `${fmt(pledge.promised_weight)} کیلو`)),
          h('div.kv-row', {}, h('span', {}, 'کاهش تعهد‌شده'), h('strong', {}, `${fmt(pledge.promise_kg)} کیلو`)),
          h('div.kv-row', {}, h('span', {}, 'بلیت شانس'), h('strong', {}, `${faDigits(Math.max(1, Math.round(pledge.promise_kg)))} بلیت`)),
          h('div.kv-row', {}, h('span', {}, 'BMI هدف'), h('strong', {}, pledge.target_bmi ? fmt(pledge.target_bmi) : '—')),
        ),
        h('div.row.gap-8.mt-8', {},
          h('button.btn.ghost.sm', { onClick: () => openPledgeModal({ onSaved: () => store.reload() }) }, icon('refresh', 15), 'ویرایش تعهد'),
          payment
            ? h('button.btn.ghost.sm', { onClick: () => openPaymentModal() }, icon('wallet', 15),
              payment.status === 'paid' ? 'سهم پرداخت شد' : 'پرداخت در انتظار تأیید')
            : h('button.btn.primary.sm', { onClick: () => openPaymentModal() }, icon('wallet', 15), `پرداخت ${money(round.fee || CONFIG.defaultFee)}`),
        ),
      )
      : h('div.stack', {},
        h('p.small.muted', {}, 'هنوز تعهدی برای این ماه ثبت نکرده‌ای. با ثبت وزن شروع و وزن پایان ماه، در جدول و قرعه‌کشی شرکت می‌کنی.'),
        h('button.btn.primary', { onClick: () => openPledgeModal() }, icon('plus', 16), 'ثبت تعهد ماه'),
      ),
  );

  /* -------------------------------------------------------------- account */
  const account = h('div.card', {},
    h('div.card-head', {}, h('h3.card-title', {}, icon('lock', 18), 'حساب کاربری')),
    h('div.stack', {},
      h('div.kv', {},
        h('div.kv-row', {}, h('span', {}, 'ایمیل'), h('strong', { class: 'mono' }, state.sessionUser.email || '—')),
        h('div.kv-row', {}, h('span', {}, 'وضعیت پایگاه‌داده'), h('strong', {}, state.backend === 'supabase' ? 'Supabase' : 'نمایشی (مرورگر)')),
      ),
      h('div.row.gap-8', {},
        h('button.btn.ghost.sm', {
          onClick: async () => {
            await store.signOut();
            toast('خارج شدی.', 'info');
            location.hash = '#/';
          },
        }, icon('logout', 15), 'خروج'),
        state.backend === 'demo'
          ? h('button.btn.danger.sm', {
            onClick: async () => {
              if (await confirmDialog('همه‌ی داده‌های نمایشی بازنشانی شود؟', { danger: true, okText: 'بازنشانی' })) {
                await store.resetDemo();
                toast('داده‌ی نمایشی بازنشانی شد.', 'info');
                location.hash = '#/';
              }
            },
          }, icon('refresh', 15), 'بازنشانی داده‌ی نمایشی')
          : null,
      ),
    ),
  );

  root.append(
    h('div.grid.grid-sidebar.mt-16', {},
      h('div.stack', {}, identity, bmiCard),
      h('div.stack', {}, pledgeCard, calories, account),
    ),
  );
}
