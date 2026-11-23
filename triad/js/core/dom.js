// ---------------------------------------------------------------------------
// dom.js — tiny hyperscript + utilities. No framework, no build step.
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  if (typeof tag === 'function') return tag(props || {}, children);
  const isSvg = tag.startsWith('svg:') || tag === 'svg' || tag === 'path' || tag === 'g' ||
    tag === 'circle' || tag === 'line' || tag === 'rect' || tag === 'polygon' ||
    tag === 'text' || tag === 'defs' || tag === 'linearGradient' || tag === 'stop' ||
    tag === 'radialGradient' || tag === 'filter' || tag === 'feGaussianBlur' || tag === 'clipPath';
  const name = tag.startsWith('svg:') ? tag.slice(4) : tag;
  const el = isSvg ? document.createElementNS(SVG_NS, name) : document.createElement(name);

  if (props && (typeof props !== 'object' || Array.isArray(props) || props instanceof Node)) {
    children.unshift(props);
    props = null;
  }

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') {
        const cls = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
        if (isSvg) el.setAttribute('class', cls); else el.className = cls;
      } else if (key === 'style' && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          if (v === null || v === undefined) continue;
          if (k.startsWith('--')) el.style.setProperty(k, String(v));
          else el.style[k] = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : String(v);
        }
      } else if (key === 'dataset') {
        for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) el.dataset[k] = String(v);
      } else if (key === 'html') {
        el.innerHTML = value;
      } else if (key === 'text') {
        el.textContent = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'ref' && typeof value === 'function') {
        value(el);
      } else if (key === 'attrs' && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) el.setAttribute(k, v);
      } else if (key in el && !isSvg && typeof value !== 'string') {
        try { el[key] = value; } catch { el.setAttribute(key, value); }
      } else if (key in el && !isSvg && BOOL_PROPS.has(key)) {
        el[key] = Boolean(value);
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }

  append(el, children);
  return el;
}

const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'lineHeight', 'fontWeight', 'zoom']);
const BOOL_PROPS = new Set(['disabled', 'checked', 'selected', 'readOnly', 'multiple', 'required', 'autofocus', 'hidden']);

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

export function delegate(root, selector, type, handler) {
  const listener = (event) => {
    const match = event.target.closest ? event.target.closest(selector) : null;
    if (match && root.contains(match)) handler(event, match);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

export function once(target, type, timeout = 400) {
  return new Promise(resolve => {
    let done = false;
    const fire = (e) => { if (done) return; done = true; cleanup(); resolve(e); };
    const timer = setTimeout(() => fire(null), timeout);
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(type, fire);
      target.removeEventListener('transitionend', fire);
    };
    target.addEventListener(type, fire, { once: true });
    target.addEventListener('transitionend', fire, { once: true });
  });
}

// ------------------------------------------------------------------ numbers
export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const round = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;
export const sum = arr => arr.reduce((a, b) => a + b, 0);
export const avg = arr => (arr.length ? sum(arr) / arr.length : 0);

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function debounce(fn, wait = 200) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function throttle(fn, wait = 80) {
  let last = 0, timer;
  return (...args) => {
    const now = performance.now();
    if (now - last >= wait) { last = now; fn(...args); }
    else { clearTimeout(timer); timer = setTimeout(() => { last = performance.now(); fn(...args); }, wait - (now - last)); }
  };
}

export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function rafLoop(fn) {
  let alive = true;
  const tick = (t) => { if (!alive) return; fn(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return () => { alive = false; };
}

// ------------------------------------------------------------------ animate
const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function animate(duration, onUpdate, { ease = easeOutCubic, reduced = prefersReduced() } = {}) {
  if (reduced) { onUpdate(1); return Promise.resolve(); }
  return new Promise(resolve => {
    const start = performance.now();
    const step = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      onUpdate(ease(t), t);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

export const easeOutCubic = t => 1 - (1 - t) ** 3;
export const easeInOutCubic = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutExpo = t => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
export const easeOutBack = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

export async function countUp(node, to, { duration = 700, from = 0, decimals = 0, suffix = '' } = {}) {
  let current = from;
  await animate(duration, (e) => {
    current = lerp(from, to, e);
    node.textContent = current.toFixed(decimals) + suffix;
  });
  node.textContent = Number(to).toFixed(decimals) + suffix;
}

export async function flip(el, mutate, { duration = 380, className = 'flipping' } = {}) {
  const first = el.getBoundingClientRect();
  mutate();
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / Math.max(last.width, 1);
  const sy = first.height / Math.max(last.height, 1);
  if (!dx && !dy && sx === 1 && sy === 1) return;
  el.classList.add(className);
  el.style.transformOrigin = 'top left';
  el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  await nextFrame();
  el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
  el.style.transform = '';
  setTimeout(() => {
    el.style.transition = '';
    el.classList.remove(className);
    el.style.transformOrigin = '';
  }, duration + 40);
}

// -------------------------------------------------------------------- misc
export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand && document.execCommand('copy');
  ta.remove();
  return Promise.resolve(Boolean(ok));
}

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '—';
}

export function hashString(str) {
  let hval = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hval ^= str.charCodeAt(i);
    hval = Math.imul(hval, 16777619);
  }
  return hval >>> 0;
}

export function seededRandom(seed) {
  let s = typeof seed === 'string' ? hashString(seed) : (seed | 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function pick(arr, rnd = Math.random) {
  return arr[Math.floor(rnd() * arr.length)];
}

export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function sortBy(list, keyFn, dir = 'asc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = keyFn(a), bv = keyFn(b);
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * sign;
    return ((av ?? 0) - (bv ?? 0)) * sign;
  });
}

export function pointerDrag(el, { onStart, onMove, onEnd, axis = 'both', cursor = true } = {}) {
  let state = null;
  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('[data-no-drag]')) return;
    state = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, t: performance.now(), moved: false };
    el.setPointerCapture?.(e.pointerId);
    if (cursor) el.classList.add('is-dragging');
    onStart?.(state, e);
  };
  const move = (e) => {
    if (!state || e.pointerId !== state.id) return;
    state.dx = e.clientX - state.x;
    state.dy = e.clientY - state.y;
    state.vx = e.movementX || 0;
    state.vy = e.movementY || 0;
    state.x = e.clientX;
    state.y = e.clientY;
    if (Math.abs(state.dx) + Math.abs(state.dy) > 3) state.moved = true;
    if (axis === 'x') state.dy = 0;
    if (axis === 'y') state.dx = 0;
    onMove?.(state, e);
  };
  const up = (e) => {
    if (!state || e.pointerId !== state.id) return;
    const s = state;
    state = null;
    if (cursor) el.classList.remove('is-dragging');
    onEnd?.(s, e);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('lostpointercapture', up);
  };
}

export function inViewport(el, margin = 40) {
  const r = el.getBoundingClientRect();
  return r.bottom > -margin && r.top < window.innerHeight + margin;
}

export function trapFocus(container, onEscape) {
  const sel = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
  const handler = (e) => {
    if (e.key === 'Escape') { onEscape?.(); return; }
    if (e.key !== 'Tab') return;
    const items = $$(sel, container).filter(n => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}
