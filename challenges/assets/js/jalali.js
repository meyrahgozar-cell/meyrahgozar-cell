/**
 * تقویم شمسی (جلالی): تبدیل دقیق میلادی/شمسی، طول ماه، فرمت فارسی،
 * بازه‌ی ماه جاری و فاصله‌ی روزها.
 * بر پایه‌ی الگوریتم استاندارد jalaali (Borkowski).
 */
import { faDigits } from './utils.js';

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

export const MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
export const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
export const WEEKDAYS_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

function jalCal(jy) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('سال شمسی نامعتبر');
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
    + div(153 * mod(gm + 9, 12) + 2, 5)
    + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  let gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm;
  let jd;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function toJalali(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
}

export const todayJalali = () => toJalali(new Date());

export function fromJalali(jy, jm, jd, hour = 12) {
  const g = d2g(j2d(jy, jm, jd));
  return new Date(g.gy, g.gm - 1, g.gd, hour, 0, 0, 0);
}

export function isLeapJalaliYear(jy) {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

/* ------------------------------------------------------------- formatting */

export const pad2 = (n) => String(n).padStart(2, '0');

export function jalaliISO(date = new Date()) {
  const { jy, jm, jd } = toJalali(date);
  return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

export function formatJalali(date, { long = false, withWeekday = false, withTime = false, digits = true } = {}) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const { jy, jm, jd } = toJalali(d);
  let out = long ? `${jd} ${MONTHS[jm - 1]} ${jy}` : `${jy}/${pad2(jm)}/${pad2(jd)}`;
  if (withWeekday) out = `${WEEKDAYS[d.getDay()]}، ${out}`;
  if (withTime) out += ` — ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return digits ? faDigits(out) : out;
}

export function formatTime(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return '—';
  return faDigits(`${pad2(h)}:۰۰`);
}

export function relativeDay(date) {
  const today = startOfDay(new Date());
  const target = startOfDay(date instanceof Date ? date : new Date(date));
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'دیروز';
  if (diff === 2) return '۲ روز پیش';
  if (diff > 0 && diff < 7) return `${faDigits(diff)} روز پیش`;
  if (diff === -1) return 'فردا';
  return formatJalali(target, { long: true });
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfJalaliMonth(date = new Date()) {
  const { jy, jm } = toJalali(date);
  return fromJalali(jy, jm, 1, 0);
}

export function endOfJalaliMonth(date = new Date()) {
  const { jy, jm } = toJalali(date);
  return fromJalali(jy, jm, jalaliMonthLength(jy, jm), 23);
}

export function monthKey(date = new Date()) {
  const { jy, jm } = toJalali(date);
  return `${jy}-${pad2(jm)}`;
}

export function monthTitle(date = new Date()) {
  const { jy, jm } = toJalali(date);
  return `${MONTHS[jm - 1]} ${faDigits(jy)}`;
}

/** بازه‌ی چالش ماه جاری (اول تا آخر ماه شمسی) */
export function currentRoundRange(now = new Date()) {
  const { jy, jm } = toJalali(now);
  const start = fromJalali(jy, jm, 1, 0);
  const end = fromJalali(jy, jm, jalaliMonthLength(jy, jm), 23);
  return {
    key: monthKey(now),
    title: `${MONTHS[jm - 1]} ${faDigits(jy)}`,
    jy, jm,
    start,
    end,
    startISO: `${jy}-${pad2(jm)}-01`,
    endISO: `${jy}-${pad2(jm)}-${pad2(jalaliMonthLength(jy, jm))}`,
    days: jalaliMonthLength(jy, jm),
    dayOfMonth: toJalali(now).jd,
  };
}

export function parseJalaliField(value) {
  const m = String(value || '').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!m) return null;
  return { jy: Number(m[1]), jm: Number(m[2]), jd: Number(m[3]) };
}

export function jalaliWeekday(date) {
  return WEEKDAYS[(date instanceof Date ? date : new Date(date)).getDay()];
}

/** لیست گزینه‌های ساعت اندازه‌گیری */
export function hourOptions() {
  const out = [];
  for (let i = 0; i <= 23; i += 1) out.push({ value: String(i), label: formatTime(i) });
  return out;
}
