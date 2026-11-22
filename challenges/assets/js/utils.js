/** ابزارهای عمومی: ساخت DOM، اعداد فارسی، اعلان، مودال، آیکون. */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export const faDigits = (value) =>
  String(value ?? '').replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

export const enDigits = (value) =>
  String(value ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

export const toFa = (n) => faDigits(n);

export function num(value, fallback = 0) {
  const n = Number(enDigits(String(value ?? '').replace(/[,\s٬]/g, '')));
  return Number.isFinite(n) ? n : fallback;
}

export function fmt(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const fixed = Number.isInteger(n) && digits === 1 ? String(n) : n.toFixed(digits);
  const [int, dec] = fixed.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return faDigits(dec ? `${withSep}٫${dec}` : withSep);
}

export const money = (value) => `${fmt(Math.round(Number(value) || 0), 0)} تومان`;

export const pct = (value, digits = 0) =>
  `${fmt(Number(value) || 0, digits)}٪`;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const round = (v, d = 1) => Number(Number(v).toFixed(d));
export const sum = (arr, pick = (x) => x) => arr.reduce((a, b) => a + (Number(pick(b)) || 0), 0);
export const avg = (arr, pick = (x) => x) =>
  arr.length ? sum(arr, pick) / arr.length : 0;
export const sortBy = (arr, pick, dir = 1) =>
  [...arr].sort((a, b) => (pick(a) > pick(b) ? dir : pick(a) < pick(b) ? -dir : 0));

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* ------------------------------------------------------------------ DOM */

const BOOL_ATTRS = new Set(['checked', 'disabled', 'readonly', 'selected', 'required', 'autofocus', 'multiple']);

/**
 * ساخت المان. مثال: h('div.card', {onClick}, h('h2', {}, 'سلام'))
 * تگ می‌تواند شامل کلاس باشد: 'button.btn.primary'
 */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = String(tag).split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');

  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = {};
  }
  props = props || {};

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = [el.className, value].filter(Boolean).join(' ');
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value' || key === 'checked') el[key] = value;
    else if (BOOL_ATTRS.has(key)) el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : value);
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (child instanceof Node) {
      el.appendChild(child);
      continue;
    }
    const text = String(child);
    // آیکون‌ها به‌صورت رشته‌ی SVG ساخته می‌شوند؛ به‌جای متن، واقعاً رندر شوند.
    if (text.trimStart().startsWith('<svg')) {
      const holder = document.createElement('span');
      holder.className = 'ic-holder';
      holder.innerHTML = text;
      el.appendChild(holder);
      continue;
    }
    el.appendChild(document.createTextNode(text));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function setChildren(node, ...children) {
  clear(node);
  appendChildren(node, children);
  return node;
}

/* ---------------------------------------------------------------- icons */

const ICONS = {
  scale: '<path d="M4 8h16l-3 5H7z"/><circle cx="12" cy="17" r="3.2"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M6 10.5V20h12v-9.5"/>',
  chart: '<path d="M4 20V6"/><path d="M4 20h16"/><path d="M8 17v-5"/><path d="M12 17V8"/><path d="M16 17v-8"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3"/><path d="M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4"/><path d="M8 21h8l-1-4H9z"/>',
  sparkles: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M18 15l.9 2.2 2.1.8-2.1.8L18 21l-.9-2.2-2.1-.8 2.1-.8z"/>',
  book: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M17 7h2v13h-2"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.5V12l3 2"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  x: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  download: '<path d="M12 4v10"/><path d="m8 11 4 4 4-4"/><path d="M5 19h14"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 16h10v4H7z"/>',
  send: '<path d="m4 12 16-7-6 16-2.5-6.5z"/>',
  flame: '<path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-2 1-3.4 2-4.5.4 1.6 1.4 2.5 2.4 2.5 1.4 0 1.6-2.4.6-7z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16"/><path d="M9 3v4"/><path d="M15 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5 6-5s6 1.8 6 5"/><path d="M16 5.5a3 3 0 0 1 0 5.8"/><path d="M17 15c2.3.4 4 2 4 4.6"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  arrow: '<path d="M20 12H4"/><path d="m9 7-5 5 5 5"/>',
  logout: '<path d="M14 5H6v14h8"/><path d="M18 12H10"/><path d="m15 9 3 3-3 3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
  search: '<circle cx="11" cy="11" r="6.6"/><path d="m20 20-3.6-3.6"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  drop: '<path d="M12 3s6 6.3 6 10.2A6 6 0 0 1 6 13.2C6 9.3 12 3 12 3z"/>',
  dumbbell: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-13.7-5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 13.7 5L20 16"/><path d="M20 20v-4h-4"/>',
  alert: '<path d="M12 4 3 20h18z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  crown: '<path d="m4 17 1-9 4.5 4L12 5l2.5 7L19 8l1 9z"/>',
  weight: '<path d="M6 20h12l2-11H4z"/><circle cx="12" cy="7" r="3"/>',
  heart: '<path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z"/>',
};

export function icon(name, size = 18, extraClass = '') {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="ic ${extraClass}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* ---------------------------------------------------------------- toast */

export function toast(message, type = 'info', ms = 3600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const tones = { info: 'info', success: 'check', error: 'alert', warn: 'alert' };
  const node = h(
    `div.toast.toast-${type}`,
    {},
    h('span.toast-ic', { html: icon(tones[type] || 'info', 18) }),
    h('span.toast-text', {}, message),
    h('button.toast-close', { 'aria-label': 'بستن', onClick: () => node.remove() }, '×'),
  );
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 260);
  }, ms);
}

/* ---------------------------------------------------------------- modal */

export function modal({ title, subtitle, body, footer, width = 560, onClose }) {
  const root = document.getElementById('modal-root');
  const overlay = h('div.modal-overlay');
  const panel = h('div.modal-panel', { style: { maxWidth: `${width}px` } });
  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 180);
    onClose?.();
  };
  panel.append(
    h('div.modal-head', {},
      h('div', {},
        h('h3', {}, title || ''),
        subtitle ? h('p.muted.small', {}, subtitle) : null,
      ),
      h('button.icon-btn', { 'aria-label': 'بستن', onClick: close, html: icon('x', 18) }),
    ),
    h('div.modal-body', {}, body),
    footer ? h('div.modal-foot', {}, footer) : null,
  );
  overlay.append(panel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  return { close, panel, overlay };
}

export function confirmDialog(message, { title = 'تأیید', okText = 'تأیید', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: h('p', {}, message),
      width: 440,
      onClose: () => resolve(false),
      footer: [
        h('button.btn.ghost', { onClick: () => { resolve(false); m.close(); } }, 'انصراف'),
        h(`button.btn.${danger ? 'danger' : 'primary'}`, {
          onClick: () => { resolve(true); m.close(); },
        }, okText),
      ],
    });
  });
}

/* -------------------------------------------------------------- helpers */

export function field(label, control, hint) {
  return h('label.field', {},
    h('span.field-label', {}, label),
    control,
    hint ? h('span.field-hint', {}, hint) : null,
  );
}

export function selectEl(options, value, onInput, extra = {}) {
  const sel = h('select.input', { ...extra, onChange: (e) => onInput?.(e.target.value) });
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = String(opt.value);
    o.textContent = opt.label;
    if (String(opt.value) === String(value)) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

export function downloadFile(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff', content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const prefersReducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function initials(name) {
  const parts = String(name || '؟').trim().split(/\s+/);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
}

export function avatarTone(seed) {
  const tones = ['brand', 'sky', 'gold', 'violet', 'rose', 'mint'];
  return tones[hashString(String(seed)) % tones.length];
}

/**
 * مولد شبه‌تصادفی قطعی (mulberry32).
 * با بذر ثابت، قرعه‌کشی هر بار همان نتیجه را می‌دهد.
 */
export function mulberry32(seed) {
  let a = Number(seed) || 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
