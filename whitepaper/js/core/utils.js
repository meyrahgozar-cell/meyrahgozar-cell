/* ============================================================
   کاغذ سفید — توابع کمکی
   ============================================================ */

/** تبدیل ارقام لاتین به فارسی */
export function toFa(input) {
  if (input === null || input === undefined) return '';
  const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  return String(input).replace(/\d/g, d => fa[+d]);
}

/** تبدیل ارقام فارسی/عربی به لاتین */
export function toEn(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

/** شناسه یکتای کوتاه */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** گرفتن تاریخ شمسی از Date */
const _faDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric', month: 'long', day: 'numeric'
});
const _faDateShort = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: '2-digit', month: '2-digit', day: '2-digit'
});
const _faWeekday = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' });

export function faDate(date = new Date()) {
  return _faDate.format(new Date(date));
}
export function faDateShort(date = new Date()) {
  return _faDateShort.format(new Date(date));
}
export function faWeekday(date = new Date()) {
  return _faWeekday.format(new Date(date));
}
export function faDateTime(date = new Date()) {
  const d = new Date(date);
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return `${faDate(d)} — ${toFa(time)}`;
}

/** فاصله نسبی زمانی */
export function relativeTime(date) {
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return 'همین حالا';
  if (min < 60) return `${toFa(min)} دقیقه پیش`;
  if (hr < 24) return `${toFa(hr)} ساعت پیش`;
  if (day < 30) return `${toFa(day)} روز پیش`;
  return faDate(date);
}

/** سلام بر اساس ساعت روز */
export function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'شب بخیر';
  if (h < 12) return 'صبح بخیر';
  if (h < 17) return 'وقت بخیر';
  if (h < 21) return 'عصر بخیر';
  return 'شب بخیر';
}

/** پاکسازی متن ورودی */
export function sanitize(str = '') {
  return String(str)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** escape برای HTML */
export function esc(str = '') { return sanitize(str); }

/** debounce */
export function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/** deep clone ساده */
export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** محاسبه درصد */
export function percent(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

/** گروه‌بندی بر اساس کلید */
export function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
}

/** چیدن آرایه با معیار */
export function sortBy(arr, fn, dir = 1) {
  return [...arr].sort((a, b) => {
    const av = fn(a), bv = fn(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

/** تبدیل تاریخ به yyyy-mm-dd */
export function isoDate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}

/** فاصله بین دو تاریخ به روز */
export function daysBetween(a, b) {
  const ms = Math.abs(new Date(a) - new Date(b));
  return Math.floor(ms / 86400000);
}

/** نمایش حجم کوچک */
export function prettyBytes(n) {
  if (n < 1024) return `${toFa(n)} بایت`;
  if (n < 1024*1024) return `${toFa((n/1024).toFixed(1))} کیلوبایت`;
  return `${toFa((n/1024/1024).toFixed(2))} مگابایت`;
}

/** خواندن امن JSON */
export function safeParse(str, fallback = null) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

/** رنگی روشن‌تر/تیره‌تر کردن hex */
export function shade(hex, amt = 0.1) {
  const c = hex.replace('#','');
  const n = parseInt(c.length === 3 ? c.split('').map(x=>x+x).join('') : c, 16);
  let r = (n >> 16) + Math.round(255 * amt);
  let g = ((n >> 8) & 0xff) + Math.round(255 * amt);
  let b = (n & 0xff) + Math.round(255 * amt);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}