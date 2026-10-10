import { el } from './utils.js';
import { colLabel } from './profiles.js';
import { gregorianToJalali } from './jalali.js';

const FA = (s) => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

// ---------- toasts
export function toast(msg, type = '') {
  let box = document.querySelector('.toasts');
  if (!box) { box = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(box); }
  const t = el('div', { class: 'toast' + (type ? ' ' + type : '') },
    el('i', { class: 'i i-' + (type === 'error' ? 'alert-triangle' : type === 'ok' ? 'check-circle' : 'info'), 'aria-hidden': 'true' }),
    el('span', {}, msg));
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 250); }, type === 'error' ? 5200 : 2800);
}

// ---------- sheet (bottom sheet on phones, dialog on larger screens)
export function openSheet({ title = '', body, footer, size = 'md', onClose } = {}) {
  const prevFocus = document.activeElement;
  const overlay = el('div', { class: 'sheet-overlay' });
  const closeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'بستن' }, el('i', { class: 'i i-x', 'aria-hidden': 'true' }));
  const bodyEl = el('div', { class: 'sheet-body' }, body);
  const footEl = footer ? el('div', { class: 'sheet-foot' }, footer) : null;
  const sheet = el('div', { class: 'sheet sheet-' + size, role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'sheet-head' }, el('h2', {}, title), closeBtn), bodyEl, footEl);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  document.documentElement.classList.add('no-scroll');
  requestAnimationFrame(() => overlay.classList.add('in'));

  let closed = false;
  const close = (result) => {
    if (closed) return; closed = true;
    overlay.classList.remove('in');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => {
      overlay.remove();
      if (!document.querySelector('.sheet-overlay')) document.documentElement.classList.remove('no-scroll');
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch {}
    }, 200);
    if (onClose) onClose(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && overlay === document.querySelector('.sheet-overlay:last-of-type')) { e.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  closeBtn.addEventListener('click', () => close());
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  setTimeout(() => { const f = sheet.querySelector('input:not([type=hidden]):not([disabled]), textarea, select'); if (f) f.focus(); }, 60);
  return { close, el: sheet, body: bodyEl, footer: footEl };
}

export function confirmBox({ title = 'تأیید', text = '', ok = 'تأیید', cancel = 'انصراف', danger = false, phrase = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; sh.close(); resolve(v); };
    const okBtn = el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', onclick: () => finish(true) }, ok);
    const noBtn = el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => finish(false) }, cancel);
    let input = null;
    const body = el('div', { class: 'confirm' }, el('p', {}, text));
    if (phrase) {
      input = el('input', { type: 'text', dir: 'ltr', placeholder: phrase, autocomplete: 'off' });
      okBtn.disabled = true;
      input.addEventListener('input', () => { okBtn.disabled = input.value.trim() !== phrase; });
      body.appendChild(input);
    }
    const sh = openSheet({ title, body, footer: [noBtn, okBtn], size: 'sm', onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

// ---------- small helpers
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function field(label, input, opts = {}) {
  return el(opts.group ? 'div' : 'label', { class: 'fld' + (opts.wide ? ' wide' : '') + (opts.required ? ' req' : '') },
    el('span', { class: 'fld-label' }, label), input);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  const [jy, jm, jd] = gregorianToJalali(+m[1], +m[2], +m[3]);
  return FA(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const p = (n) => String(n).padStart(2, '0');
  return FA(`${jy}/${p(jm)}/${p(jd)} · ${p(d.getHours())}:${p(d.getMinutes())}`);
}
export const fmtNum = (n) => (n == null || n === '' ? '—' : FA(Number(n).toLocaleString('en-US')));

// ---------- friendly errors
const MSG = {
  unauthorized: 'نشست شما منقضی شده است. دوباره وارد شوید.', forbidden: 'دسترسی مجاز نیست.',
  forbidden_role: 'تغییر نقش فقط برای سوپرادمین مجاز است.', forbidden_target: 'ویرایش یا حذف این کاربر برای شما مجاز نیست.',
  forbidden_table: 'دسترسی به این جدول مجاز نیست.', read_only_table: 'این جدول فقط‌خواندنی است.',
  use_transfer: 'برای تغییر سوپرادمین از «انتقال مدیریت» استفاده کنید.', protected_member: 'این کاربر قابل حذف نیست.',
  unknown_table: 'جدول نامعتبر است.', not_found: 'رکورد پیدا نشد.', bad_row: 'داده نامعتبر است.',
  empty_patch: 'تغییری وجود ندارد.', bad_content: 'متن پیام نامعتبر است.', bad_ids: 'شناسه‌ها نامعتبر است.',
  bad_ops: 'درخواست نامعتبر است.', too_many_ops: 'تعداد عملیات بیش از حد مجاز است.', empty_sql: 'دستور خالی است.',
  bad_role: 'نقش نامعتبر است.', network: 'اتصال به سرور برقرار نشد.'
};
export function errText(e) {
  if (!e) return 'خطای ناشناخته';
  const raw = String(e.message || '');
  const inner = raw.replace(/^op \d+:\s*/, '').replace(/\s*\((insert|update|delete)\)\s*$/, '');
  const prefix = /^op (\d+):/.exec(raw);
  const pre = prefix ? `ردیف عملیات ${FA(prefix[1])}: ` : '';
  const key = Object.keys(MSG).find(k => inner === k || inner.startsWith(k + ':'));
  if (key) return pre + MSG[key] + (/^(unknown_column|identity_column|immutable_column)/.test(inner) ? '' : '');
  const col = (s) => colLabel(s);
  if (/^unknown_column:/.test(inner)) return pre + 'ستون نامعتبر: ' + inner.split(':')[1].trim();
  if (/^(identity_column|immutable_column):/.test(inner)) return pre + 'این ستون قابل تغییر نیست: ' + col(inner.split(':')[1].trim());
  if (e.code === '23505') { const m = /Key \(([^)]+)\)=\(([^)]*)\)/.exec(e.detail || ''); return pre + 'مقدار تکراری' + (m ? `: ${col(m[1])} (${m[2]})` : '.'); }
  if (e.code === '23503') return pre + 'ارجاع نامعتبر است (عضو وجود ندارد یا رکوردهای وابسته دارد).';
  if (e.code === '23502') { const m = /column "([^"]+)"/.exec(inner); return pre + 'فیلد الزامی خالی است' + (m ? `: ${col(m[1])}` : '.'); }
  if (e.code === '23514') return pre + (/national_id/.test(inner) ? 'کد ملی باید ۱۰ رقم باشد.' : 'مقدار نامعتبر است.');
  if (/^22/.test(e.code || '')) return pre + 'قالب مقدار نامعتبر است.';
  return pre + inner;
}
