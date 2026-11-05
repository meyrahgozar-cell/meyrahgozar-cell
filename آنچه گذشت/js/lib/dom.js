/* Tiny DOM helpers — no framework, no build step. */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function html(strings, ...values) {
  return strings.reduce((out, str, i) => out + str + (i < values.length ? values[i] ?? '' : ''), '');
}

export function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export function frag(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content;
}

export function on(root, type, selector, handler, opts) {
  if (typeof selector === 'function') {
    root.addEventListener(type, selector, handler);
    return () => root.removeEventListener(type, selector, handler);
  }
  const fn = (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, fn, opts);
  return () => root.removeEventListener(type, fn, opts);
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const icon = (name, cls = '') =>
  `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function debounce(fn, wait = 250) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function throttle(fn, wait = 100) {
  let last = 0, timer = null;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) { last = now; fn(...args); }
    else if (!timer) {
      timer = setTimeout(() => { timer = null; last = Date.now(); fn(...args); }, remaining);
    }
  };
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Highlight a search needle inside already-escaped text. */
export function highlight(text, needle) {
  const safe = esc(text);
  if (!needle) return safe;
  const n = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${n})`, 'ig'), '<mark style="background:var(--accent-soft);color:inherit;border-radius:3px;padding:0 1px">$1</mark>');
}

/** Auto-grow a textarea to fit its content. */
export function autoGrow(node, max = 260) {
  const resize = () => {
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, max)}px`;
  };
  node.addEventListener('input', resize);
  resize();
  return resize;
}

export function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function scrollToTop(smooth = true) {
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
}
