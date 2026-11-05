/* تاریخ شمسی، اعداد فارسی و شکل‌دهی متن. */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** هر رقم لاتین را به رقم فارسی تبدیل می‌کند. */
export function fa(value) {
  return String(value ?? '').replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

const persianDate = (options) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', options);

const P_LONG = persianDate({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const P_MEDIUM = persianDate({ day: 'numeric', month: 'long', year: 'numeric' });
const P_SHORT = persianDate({ day: 'numeric', month: 'long' });
const P_MONTH = persianDate({ month: 'long', year: 'numeric' });
const P_DAY = persianDate({ day: 'numeric' });
const P_TIME = persianDate({ hour: '2-digit', minute: '2-digit', hour12: false });

/* نام ماه‌های شمسی — برای جاهایی که فقط به نام ماه نیاز است. */
export const MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
export const MONTHS_SHORT = MONTHS;
export const DOW = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
export const DOW_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

/** YYYY-MM-DD در وقت محلی (هرگز بین منطقه‌های زمانی جابه‌جا نمی‌شود). */
export function toISODate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(iso) {
  if (!iso) return new Date(NaN);
  if (iso instanceof Date) return iso;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const dayKey = (iso) => toISODate(parseDate(iso));
export const monthKey = (iso) => String(iso).slice(0, 7);
export const yearOf = (iso) => String(iso).slice(0, 4);

/** اجزای تاریخ شمسی با رقم لاتین — برای مرتب‌سازی و گروه‌بندی. */
export function jParts(iso) {
  const d = parseDate(iso);
  if (isNaN(d)) return { year: 0, month: 0, day: 0 };
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
  }).formatToParts(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
  const get = (t) => Number((parts.find((p) => p.type === t) || {}).value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** کلید پایدار ماه شمسی: ۱۴۰۵-۰۸ */
export function jMonthKey(iso) {
  const { year, month } = jParts(iso);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export const jYear = (iso) => jParts(iso).year;
export const jMonthName = (iso) => MONTHS[(jParts(iso).month || 1) - 1] || '';

export function fmtDate(iso, style = 'medium') {
  const d = parseDate(iso);
  if (isNaN(d)) return '—';
  const { year, month, day } = jParts(d);
  const name = MONTHS[(month || 1) - 1] || '';
  const sameYear = year === jParts(new Date()).year;
  switch (style) {
    case 'short': return `${fa(day)} ${name}`;
    case 'long': return `${DOW[d.getDay()]}، ${fa(day)} ${name} ${fa(year)}`;
    case 'month': return `${name} ${fa(year)}`;
    case 'day': return fa(day);
    case 'iso': return toISODate(d);
    default: return sameYear ? `${fa(day)} ${name}` : `${fa(day)} ${name} ${fa(year)}`;
  }
}

export function fmtTime(value) {
  if (!value) return '';
  const [h, m] = String(value).split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return `${fa(String(h).padStart(2, '0'))}:${fa(String(m || 0).padStart(2, '0'))}`;
}

export function relativeDays(iso) {
  const d = parseDate(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'دیروز';
  if (diff > 1 && diff < 7) return `${fa(diff)} روز پیش`;
  if (diff > 0 && diff < 30) return `${fa(Math.floor(diff / 7))} هفته پیش`;
  if (diff > 30 && diff < 365) return `${fa(Math.floor(diff / 30))} ماه پیش`;
  if (diff < 0 && diff > -7) return `${fa(Math.abs(diff))} روز آینده`;
  return fmtDate(iso);
}

export function relTime(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (!d || isNaN(d)) return '';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return 'همین حالا';
  if (secs < 90) return 'یک دقیقه پیش';
  if (secs < 3600) return `${fa(Math.round(secs / 60))} دقیقه پیش`;
  if (secs < 86400) return `${fa(Math.round(secs / 3600))} ساعت پیش`;
  if (secs < 604800) return `${fa(Math.round(secs / 86400))} روز پیش`;
  return fmtDate(toISODate(d));
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function daysBetween(a, b) {
  const d1 = parseDate(a); const d2 = parseDate(b);
  return Math.round((d2 - d1) / 86400000);
}

export function fmtNumber(n) {
  if (n == null) return '۰';
  const v = Number(n);
  if (v >= 1_000_000) return `${fa((v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1))} میلیون`;
  if (v >= 10_000) return `${fa(Math.round(v / 1000))} هزار`;
  return v.toLocaleString('fa-IR');
}

export function wordCount(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

export function readMinutes(words) {
  return Math.max(1, Math.round(words / 190));
}

/** در فارسی شمارش جمع بسته نمی‌شود: «۳ قاب». */
export function plural(n, one) {
  return `${fa(n)} ${one}`;
}

export function initials(nameOrEmail) {
  const s = String(nameOrEmail || '').trim();
  if (!s) return 'ر';
  if (s.includes('@') && !s.includes(' ')) return s[0].toUpperCase();
  const parts = s.split(/\s+/).filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function firstName(nameOrEmail) {
  const s = String(nameOrEmail || '').trim();
  if (!s) return 'دوست';
  const base = s.includes('@') ? s.split('@')[0] : s;
  return base.split(/[\s._-]+/)[0];
}

export function timeOfDayGreeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'هنوز بیداری';
  if (h < 9) return 'صبح بخیر';
  if (h < 12) return 'پیش از ظهر';
  if (h < 14) return 'ظهر بخیر';
  if (h < 18) return 'بعدازظهر';
  if (h < 22) return 'عصر بخیر';
  return 'شب دیروقت';
}

export function excerptFromHtml(html, max = 190) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h\d|li|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + '…' : text;
}

export function moodMeta(moods, slug) {
  return moods.find((m) => m.slug === slug) || null;
}

export function clampText(s, n) {
  const v = String(s || '').trim();
  return v.length > n ? v.slice(0, n - 1) + '…' : v;
}
