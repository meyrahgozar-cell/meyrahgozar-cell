const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
function div(a, b) { return Math.floor(a / b); }

export function gregorianToJalali(gy, gm, gd) {
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) { jy += div(days - 1, 365); days = (days - 1) % 365; }
  const jm = (days < 186) ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return [jy, jm, jd];
}

const FA_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function toFa(s) { return String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }

export function formatJalali(input, opts = {}) {
  if (!input) return '—';
  let y, m, d;
  if (input instanceof Date) {
    y = input.getFullYear(); m = input.getMonth() + 1; d = input.getDate();
  } else {
    const s = String(input).split('T')[0].split(' ')[0];
    const parts = s.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return String(input);
    [y, m, d] = parts;
  }
  const [jy, jm, jd] = gregorianToJalali(y, m, d);
  if (opts.long) return `${toFa(jd)} ${FA_MONTHS[jm - 1]} ${toFa(jy)}`;
  return toFa(`${jy}/${pad(jm)}/${pad(jd)}`);
}

export function todayJalali(opts = {}) { return formatJalali(new Date(), opts); }