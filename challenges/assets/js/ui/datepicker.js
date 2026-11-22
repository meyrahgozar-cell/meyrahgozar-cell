/** انتخابگر تاریخ شمسی با سه فهرست سال/ماه/روز. */
import {
  MONTHS, jalaliMonthLength, todayJalali, fromJalali, jalaliWeekday, formatJalali, toJalali,
} from '../jalali.js';
import { h, faDigits } from '../utils.js';

export function jalaliDateField({ value = new Date(), onChange, minYear, maxYear } = {}) {
  const today = todayJalali();
  const initial = toJalali(value);
  const yMin = minYear || today.jy - 1;
  const yMax = maxYear || today.jy + 1;
  let state = { ...initial };

  const yearSel = h('select.input', { 'aria-label': 'سال' });
  for (let y = yMax; y >= yMin; y -= 1) {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = faDigits(y);
    yearSel.appendChild(o);
  }
  const monthSel = h('select.input', { 'aria-label': 'ماه' });
  MONTHS.forEach((m, i) => {
    const o = document.createElement('option');
    o.value = String(i + 1);
    o.textContent = m;
    monthSel.appendChild(o);
  });
  const daySel = h('select.input', { 'aria-label': 'روز' });
  const hint = h('span.field-hint');

  function syncDays() {
    const length = jalaliMonthLength(state.jy, state.jm);
    if (state.jd > length) state.jd = length;
    daySel.replaceChildren();
    for (let d = 1; d <= length; d += 1) {
      const o = document.createElement('option');
      o.value = String(d);
      o.textContent = faDigits(d);
      if (d === state.jd) o.selected = true;
      daySel.appendChild(o);
    }
    yearSel.value = String(state.jy);
    monthSel.value = String(state.jm);
    const date = fromJalali(state.jy, state.jm, state.jd);
    hint.textContent = `${jalaliWeekday(date)} — ${formatJalali(date, { long: true })}`;
    onChange?.(date);
  }

  yearSel.addEventListener('change', () => {
    state.jy = Number(yearSel.value);
    syncDays();
  });
  monthSel.addEventListener('change', () => {
    state.jm = Number(monthSel.value);
    syncDays();
  });
  daySel.addEventListener('change', () => {
    state.jd = Number(daySel.value);
    syncDays();
  });

  const el = h('div', {},
    h('div.field-row-3', {}, yearSel, monthSel, daySel),
    hint,
  );

  syncDays();

  return {
    el,
    getDate: () => fromJalali(state.jy, state.jm, state.jd),
    getValue: () => ({ ...state }),
    setDate: (d) => {
      state = toJalali(d);
      syncDays();
    },
  };
}
