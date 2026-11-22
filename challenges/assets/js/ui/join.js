/** جریان پیوستن به چالش: تعهد وزن + پرداخت سهم. */
import { state, store } from '../store.js';
import { CONFIG } from '../config.js';
import {
  h, icon, field, modal, money, toast, fmt, num,
} from '../utils.js';
import { bmiValue, bmiBand, idealRange, ageFromBirthYear } from '../ai.js';
import { formatJalali, currentRoundRange } from '../jalali.js';

export function profileMissing() {
  const p = state.profile || {};
  const missing = [];
  if (!p.height_cm) missing.push('قد');
  if (!p.birth_year) missing.push('سال تولد');
  if (!p.gender) missing.push('جنسیت');
  return missing;
}

export function openPledgeModal({ onSaved } = {}) {
  const profile = state.profile || {};
  const existing = store.myPledge();
  const last = state.sessionUser ? store.latestEntry(state.sessionUser.id) : null;
  const missing = profileMissing();

  if (missing.length) {
    toast(`برای محاسبه‌ی BMI ابتدا ${missing.join('، ')} را در پروفایل ثبت کن.`, 'warn');
    location.hash = '#/profile';
    return;
  }

  const height = Number(profile.height_cm);
  const ideal = idealRange(height);
  const startInput = h('input.input', {
    type: 'number', step: '0.1', inputmode: 'decimal', min: '25', max: '300',
    value: existing?.start_weight ?? last?.weight ?? '',
    placeholder: 'مثلاً ۸۲٫۵',
  });
  const promisedInput = h('input.input', {
    type: 'number', step: '0.1', inputmode: 'decimal', min: '25', max: '300',
    value: existing?.promised_weight ?? (ideal ? Math.max(ideal.min, Number(startInput.value || 80) - 4) : ''),
    placeholder: 'وزن پایان ماه',
  });
  const hint = h('div.alert', { class: 'alert info', style: { marginTop: '4px' } });
  const compute = h('div.target-preview');

  function refresh() {
    const start = num(startInput.value);
    const promised = num(promisedInput.value);
    const kg = start - promised;
    const bmiStart = bmiValue(start, height);
    const bmiTarget = bmiValue(promised, height);
    const band = bmiBand(bmiTarget);
    const tone = bmiTarget && bmiTarget < CONFIG.bmi.safeMin ? 'danger' : bmiTarget > CONFIG.bmi.safeMax ? 'warn' : 'success';

    hint.className = `alert ${tone}`;
    hint.replaceChildren(
      h('span', { html: icon(tone === 'success' ? 'check' : 'alert', 18) }),
      h('div', {},
        bmiTarget
          ? h('div', {}, `BMI پایان ماه: `, h('strong', {}, fmt(bmiTarget)), ` (${band.label})`)
          : h('div', {}, 'وزن شروع و وزن تعهد را وارد کن.'),
        bmiStart ? h('div.tiny', {}, `BMI فعلی با وزن شروع: ${fmt(bmiStart)} • محدوده سالم قد شما: ${fmt(ideal.min)} تا ${fmt(ideal.max)} کیلو`) : null,
      ),
    );

    compute.replaceChildren(
      h('span.muted', {}, 'کاهش تعهد‌شده'),
      h('div.row.gap-8', {},
        h('strong', { style: { color: kg > 0 ? 'var(--brand)' : 'var(--danger)' } }, `${fmt(Math.max(0, kg))} کیلو`),
        h('span.badge.gold', {}, `${fmt(Math.max(0, Math.round(kg)))} بلیت شانس`),
      ),
    );

    saveBtn.disabled = !(start > 25 && promised > 25 && kg > 0.2) || (bmiTarget && bmiTarget < 17);
  }

  startInput.addEventListener('input', refresh);
  promisedInput.addEventListener('input', refresh);

  const range = currentRoundRange();
  const saveBtn = h('button.btn.primary', { onClick: save }, icon('check', 17), 'ثبت تعهد و ادامه');

  async function save() {
    const start = num(startInput.value);
    const promised = num(promisedInput.value);
    try {
      saveBtn.disabled = true;
      await store.savePledge({
        startWeight: start,
        promisedWeight: promised,
        targetBmi: bmiValue(promised, height),
      });
      toast('تعهد شما ثبت شد. حالا سهم اشتراک را پرداخت کن.', 'success');
      m.close();
      onSaved?.();
      setTimeout(() => openPaymentModal(), 250);
    } catch (err) {
      toast(err.message || 'ثبت تعهد ناموفق بود.', 'error');
      saveBtn.disabled = false;
    }
  }

  const m = modal({
    title: existing ? 'ویرایش تعهد پایان ماه' : 'پیوستن به چالش این ماه',
    subtitle: `دوره‌ی ${range.title} • ${formatJalali(range.start, { long: true })} تا ${formatJalali(range.end, { long: true })}`,
    width: 580,
    body: h('div.stack', {},
      h('div.alert.info', {},
        h('span', { html: icon('info', 18) }),
        h('div', {}, 'وزن تعهد باید کمتر از وزن شروع باشد. هر کیلو کاهش تعهد، یک بلیت شانس در قرعه‌کشی جایزه است.'),
      ),
      h('div.field-row', {},
        field('وزن شروع دوره (کیلوگرم)', startInput, 'اگر قبلاً وزن ثبت کرده‌ای، همان مقدار پیشنهاد شده است.'),
        field('وزن تعهد پایان ماه (کیلوگرم)', promisedInput, `محدوده‌ی سالم برای قد ${fmt(height, 0)} سانتی‌متر: ${fmt(ideal.min)} تا ${fmt(ideal.max)}`),
      ),
      hint,
      compute,
      h('div.small.muted', {}, `سهم اشتراک این دوره: ${money(store.round?.fee || CONFIG.defaultFee)} — پس از ثبت تعهد، مرحله‌ی پرداخت نمایش داده می‌شود.`),
    ),
    footer: [
      h('button.btn.ghost', { onClick: () => m.close() }, 'انصراف'),
      saveBtn,
    ],
  });
  refresh();
}

export function openPaymentModal() {
  const round = store.round || {};
  const fee = Number(round.fee || CONFIG.defaultFee);
  const payment = store.myPayment();
  const refInput = h('input.input', { placeholder: 'مثلاً ۱۲۳۴۵۶ (شماره پیگیری)' });
  const methodSel = h('select.input', {},
    ...['کارت به کارت', 'درگاه بانکی', 'نقدی'].map((m) => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      return o;
    }),
  );

  let m;
  const submit = h('button.btn.primary', {
    onClick: async () => {
      try {
        submit.disabled = true;
        await store.submitPayment({ method: methodSel.value, ref: refInput.value.trim() });
        toast('پرداخت ثبت شد و در انتظار تأیید مدیر دوره است.', 'success');
        m.close();
      } catch (err) {
        toast(err.message || 'ثبت پرداخت ناموفق بود.', 'error');
        submit.disabled = false;
      }
    },
  }, icon('wallet', 17), 'ثبت پرداخت');

  m = modal({
    title: payment ? 'وضعیت سهم اشتراک' : 'پرداخت سهم اشتراک',
    subtitle: `استخر جایزه‌ی ${round.title || 'دوره'} از مجموع همین سهم‌ها ساخته می‌شود.`,
    width: 540,
    body: h('div.stack', {},
      payment
        ? h('div.alert', { class: payment.status === 'paid' ? 'success' : 'warn' },
          h('span', { html: icon(payment.status === 'paid' ? 'check' : 'clock', 18) }),
          h('div', {},
            h('strong', {}, payment.status === 'paid' ? 'پرداخت تأیید شده است.' : 'پرداخت در انتظار تأیید مدیر است.'),
            h('div.tiny', {}, `مبلغ ${money(payment.amount)} • کد پیگیری ${payment.ref || '—'}`),
          ),
        )
        : null,
      h('div.row-between', { style: { background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: '12px', padding: '12px 14px' } },
        h('span.muted', {}, 'مبلغ سهم این دوره'),
        h('strong', { style: { fontSize: '18px', color: 'var(--gold)' } }, money(fee)),
      ),
      h('div.small.muted', {}, 'در این نسخه درگاه بانکی متصل نیست؛ مبلغ را با هماهنگی مدیر دوره واریز کن و شماره پیگیری را ثبت کن. مدیر پرداخت را تأیید می‌کند.'),
      h('div.field-row', {},
        field('روش پرداخت', methodSel),
        field('شماره پیگیری', refInput, 'اختیاری — برای پیگیری توسط مدیر'),
      ),
      h('div.alert.info', {},
        h('span', { html: icon('info', 18) }),
        h('div', {}, 'تنها شرکت‌کنندگانی که سهم خود را پرداخت کرده‌اند در استخر جایزه و قرعه‌کشی شرکت داده می‌شوند.'),
      ),
    ),
    footer: [
      h('button.btn.ghost', { onClick: () => m.close() }, 'بستن'),
      payment?.status === 'paid' ? null : submit,
    ],
  });
}
