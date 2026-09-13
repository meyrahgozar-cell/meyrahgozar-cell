// =========================================================
// تبدیل تاریخ میلادی به شمسی (جلالی) — بدون نیاز به کتابخانه‌ی خارجی
// الگوریتم استاندارد مبدل جلالی (بر پایه‌ی کتابخانه‌ی jalaali-js)
// =========================================================

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function div(a, b) {
  return Math.trunc(a / b);
}

function jalCal(jy) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;

  for (let i = 1; i < breaks.length; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm;
  }
  let n = jy - jp;

  leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = ((n + 1) % 33) - 1;
  if (leap === -1) leap = 32;

  return { leap: leap % 4 === 0 ? leap : leap, march };
}

function gregorianToJdn(gy, gm, gd) {
  const d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * ((gm + 9) % 12) + 2, 5) +
    gd -
    34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

// استفاده مستقیم از Date برای گرفتن y/m/d و سپس محاسبه‌ی jdn واقعی
function toJdnFromDate(date) {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  return gregorianToJdn(gy, gm, gd);
}

/**
 * تبدیل شیء Date (یا رشته‌ی تاریخ) میلادی به تاریخ شمسی
 * @param {Date|string} input
 * @returns {{jy:number, jm:number, jd:number}}
 */
export function toJalali(input) {
  const date = input instanceof Date ? input : new Date(input);
  const jdn = toJdnFromDate(date);
  // اصلاح: jdnToGregorianYear فقط تخمین است، پس سال دقیق میلادی را مستقیم از Date می‌گیریم
  const gy = date.getFullYear();
  const jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = gregorianToJdn(gy, 3, r.march);
  let k = jdn - jdn1f;
  let year = jy;

  if (k < 0) {
    year = jy - 1;
    const r2 = jalCal(year);
    const jdn1f2 = gregorianToJdn(gy - 1, 3, r2.march);
    k = jdn - jdn1f2;
  }

  let jm;
  let jd;
  if (k <= 185) {
    jm = 1 + div(k, 31);
    jd = (k % 31) + 1;
  } else {
    k -= 186;
    jm = 7 + div(k, 30);
    jd = (k % 30) + 1;
  }
  return { jy: year, jm, jd };
}

/** اعداد لاتین را به رقم فارسی تبدیل می‌کند */
export function toPersianDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * نمایش قابل‌خواندن تاریخ شمسی، مثل «۱۲ مهر ۱۴۰۴»
 */
export function formatJalali(input) {
  const { jy, jm, jd } = toJalali(input);
  return toPersianDigits(`${jd} ${PERSIAN_MONTHS[jm - 1]} ${jy}`);
}

/** افزودن n روز به یک تاریخ میلادی و بازگرداندن Date جدید */
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
