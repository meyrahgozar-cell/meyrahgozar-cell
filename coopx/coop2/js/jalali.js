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
// Jalali -> Gregorian (inverse of gregorianToJalali)
export function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd
           + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const md = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > md[gm]; gm++) gd -= md[gm];
  return [gy, gm, gd];
}

const _digits = (s) => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

// "1404/05/23", "۱۴۰۴-۵-۲۳", "2025-08-14", Date, Excel serial -> "YYYY-MM-DD" (Gregorian) or null
export function parseDateLoose(input) {
  if (input == null || input === '') return null;
  const pad = (n) => String(n).padStart(2, '0');
  if (input instanceof Date) {
    return isNaN(input) ? null : `${input.getUTCFullYear()}-${pad(input.getUTCMonth() + 1)}-${pad(input.getUTCDate())}`;
  }
  if (typeof input === 'number') {                       // Excel serial day
    if (input < 1 || input > 80000) return null;
    const d = new Date(Math.round((input - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const m = _digits(String(input).trim()).match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  let [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y < 1700) [y, mo, d] = jalaliToGregorian(y, mo, d);
  return `${y}-${pad(mo)}-${pad(d)}`;
}
