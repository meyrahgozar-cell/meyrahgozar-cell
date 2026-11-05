/* Toasts, dialogs, popovers, lightbox-free overlays. */
import { esc, icon, qs, uid } from './dom.js';

const overlayRoot = () => document.getElementById('overlay');
const toastsRoot = () => document.getElementById('toasts');
let openLayers = 0;

function lockScroll() {
  openLayers += 1;
  document.body.style.overflow = 'hidden';
}
function unlockScroll() {
  openLayers = Math.max(0, openLayers - 1);
  if (!openLayers) document.body.style.overflow = '';
}

/* ── toast ─────────────────────────────────────────────────── */
export function toast(message, { type = 'info', title = '', action = null, timeout = 4200 } = {}) {
  const root = toastsRoot();
  if (!root) return () => {};
  const icons = { success: 'check', error: 'alert', info: 'info' };
  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.innerHTML = `
    ${icon(icons[type] || 'info')}
    <div class="toast__body">
      ${title ? `<div class="toast__title">${esc(title)}</div>` : ''}
      <div class="toast__msg">${esc(message)}</div>
    </div>
    ${action ? `<button class="toast__action" type="button">${esc(action.label)}</button>` : ''}
  `;
  root.appendChild(node);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 220);
  };
  if (action) {
    node.querySelector('.toast__action').addEventListener('click', () => { close(); action.onClick?.(); });
  }
  const timer = timeout ? setTimeout(close, timeout) : null;
  node.addEventListener('mouseenter', () => timer && clearTimeout(timer));
  return close;
}

/* ── modal ─────────────────────────────────────────────────── */
export function openModal({
  title = '', subtitle = '', body = '', size = '',
  actions = [], onMount = null, dismissible = true, className = '',
} = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="modal ${size ? 'modal--' + size : ''} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__head">
        <div class="grow">
          ${title ? `<h2>${esc(title)}</h2>` : ''}
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn modal__close" type="button" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <div class="modal__body">${body}</div>
      ${actions.length ? `<div class="modal__foot">
        ${actions.map((a, i) => `<button class="btn ${a.variant ? 'btn--' + a.variant : ''}" data-idx="${i}" type="button">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}
      </div>` : ''}
    </div>`;
  overlayRoot().appendChild(wrap);
  lockScroll();

  const modal = wrap.querySelector('.modal');
  const close = () => {
    wrap.remove();
    unlockScroll();
    document.removeEventListener('keydown', onKey, true);
    dismissibleListeners();
  };
  const dismissibleListeners = () => {};

  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);

  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && dismissible) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  wrap.querySelectorAll('.modal__foot .btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const action = actions[Number(b.dataset.idx)];
      if (!action) return;
      b.disabled = true;
      try {
        const keep = await action.onClick?.(close, modal);
        if (!keep) b.disabled = false;
      } catch (err) {
        b.disabled = false;
        toast(err.message || 'چیزی اشتباه شد', { type: 'error' });
      }
    });
  });

  onMount?.(modal, close);
  requestAnimationFrame(() => {
    const focusable = modal.querySelector('[autofocus], input:not([type=hidden]), textarea, button.btn--primary, button.btn--solid');
    focusable?.focus?.();
  });
  return { root: modal, close };
}

export function confirmDialog({
  title = 'مطمئنی؟', message = '', confirmLabel = 'تأیید',
  cancelLabel = 'Cancel', danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const { close } = openModal({
      title,
      size: 'sm',
      body: `<p style="color:var(--muted);font-size:var(--fs-sm);line-height:1.6">${message}</p>`,
      actions: [
        { label: cancelLabel, onClick: (c) => { settled = true; c(); resolve(false); } },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: (c) => { settled = true; c(); resolve(true); } },
      ],
      onMount: (modal) => {
        modal.addEventListener('click', (e) => {
          if (e.target.closest('[data-close]')) setTimeout(() => { if (!settled) resolve(false); }, 0);
        });
      },
    });
    const observer = new MutationObserver(() => {
      if (!document.body.contains(document.querySelector('.overlay')) && !settled) { settled = true; resolve(false); observer.disconnect(); }
    });
    observer.observe(overlayRoot(), { childList: true });
    void close;
  });
}

/* ── popover menu ──────────────────────────────────────────── */
let activeMenu = null;
export function closeMenu() {
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
}
export function menu(anchor, items) {
  closeMenu();
  const node = document.createElement('div');
  node.className = 'menu';
  node.setAttribute('role', 'menu');
  node.innerHTML = items.map((item, i) => {
    if (item === '-') return '<div class="menu__sep"></div>';
    if (item.label && item.heading) return `<div class="menu__label">${esc(item.label)}</div>`;
    return `<button class="menu__item ${item.danger ? 'menu__item--danger' : ''}" data-i="${i}" type="button" role="menuitem">
      ${item.icon ? icon(item.icon) : ''}${esc(item.label)}${item.hint ? `<span style="margin-left:auto;font-size:10px;color:var(--faint)">${esc(item.hint)}</span>` : ''}
    </button>`;
  }).join('');
  document.body.appendChild(node);
  activeMenu = node;

  const r = anchor.getBoundingClientRect();
  const w = node.offsetWidth; const h = node.offsetHeight;
  let left = r.right - w;
  let top = r.bottom + 6;
  if (left < 8) left = 8;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;

  node.addEventListener('click', (e) => {
    const btn = e.target.closest('.menu__item');
    if (!btn) return;
    const item = items[Number(btn.dataset.i)];
    closeMenu();
    item?.onSelect?.();
  });

  const away = (e) => {
    if (!node.contains(e.target) && !anchor.contains(e.target)) { closeMenu(); cleanup(); }
  };
  const onKey = (e) => { if (e.key === 'Escape') { closeMenu(); cleanup(); } };
  const cleanup = () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', onKey); };
  setTimeout(() => { document.addEventListener('mousedown', away); document.addEventListener('keydown', onKey); }, 0);
  return node;
}

/* ── bottom sheet ──────────────────────────────────────────── */
export function openSheet({ title = '', body = '', onMount = null, className = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.style.alignItems = 'end';
  wrap.style.padding = '0';
  wrap.innerHTML = `
    <div class="sheet ${className}" role="dialog" aria-modal="true">
      <div class="sheet__handle"></div>
      ${title ? `<div class="modal__head" style="border:0;padding-bottom:4px">
        <div class="grow"><h2>${esc(title)}</h2></div>
        <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
      </div>` : ''}
      <div class="modal__body">${body}</div>
    </div>`;
  overlayRoot().appendChild(wrap);
  lockScroll();
  const close = () => { wrap.remove(); unlockScroll(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  onMount?.(wrap.querySelector('.sheet'), close);
  return { root: wrap.querySelector('.sheet'), close };
}

/* ── form field builders ───────────────────────────────────── */
export const field = (label, control, { hint = '', iconName = '' } = {}) => `
  <label class="field">
    <span class="field__label">${iconName ? icon(iconName) : ''}${esc(label)}</span>
    ${control}
    ${hint ? `<span class="field__foot">${esc(hint)}</span>` : ''}
  </label>`;

export function menuButton(triggerHtml, items, { className = '', title = 'More', stop = true } = {}) {
  const id = 'mb-' + uid().slice(0, 8);
  setTimeout(() => {
    const btn = qs(`[data-mb="${id}"]`);
    btn?.addEventListener('click', (e) => {
      if (stop) { e.preventDefault(); e.stopPropagation(); }
      menu(btn, items);
    });
  }, 0);
  return `<button class="icon-btn ${className}" data-mb="${id}" title="${esc(title)}" aria-label="${esc(title)}" type="button">${triggerHtml}</button>`;
}
