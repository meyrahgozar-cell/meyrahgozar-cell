// ---------------------------------------------------------------------------
// overlay.js — toast, modal, drawer, popover, confirm. One escape stack.
// ---------------------------------------------------------------------------
import { h, clear, trapFocus, uid, clamp } from '../core/dom.js';
import { icon } from './icons.js';
import { bus, EV } from '../core/bus.js';
import { sfx } from './sounds.js';

const stack = [];

function pushCloser(fn) { stack.push(fn); }
function popCloser(fn) {
  const idx = stack.lastIndexOf(fn);
  if (idx >= 0) stack.splice(idx, 1);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top) { e.preventDefault(); top(); }
});

// --------------------------------------------------------------------- toast
export function toast(input = {}) {
  const opts = typeof input === 'string' ? { text: input } : input;
  const root = document.getElementById('toast-root');
  if (!root) return { close() {} };
  const kind = opts.kind || 'info';
  const icons = { ok: 'check', warn: 'warning', error: 'warning', info: 'info' };
  const el = h('div', { class: `toast toast--${kind}`, role: 'alert' },
    h('span', { class: 'toast__icon' }, icon(icons[kind] || 'info', { size: 16 })),
    h('div', { class: 'toast__body' },
      opts.title ? h('b', {}, opts.title) : null,
      h('span', {}, opts.text || '')
    ),
    opts.action ? h('button', {
      class: 'btn btn--sm btn--ghost',
      onClick: () => { opts.action.onClick?.(); close(); }
    }, opts.action.label) : null
  );
  root.appendChild(el);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 240);
  };
  const duration = opts.duration ?? (kind === 'error' ? 5200 : 3200);
  if (duration > 0) setTimeout(close, duration);
  if (kind === 'error') sfx.play('error');
  else if (kind === 'ok') sfx.play('glassSoft');
  return { close, el };
}

export function toastBus() {
  bus.on(EV.TOAST, (payload) => toast(payload));
}

// --------------------------------------------------------------------- modal
export function modal({
  title = '', iconName = null, body = null, footer = null, size = 'md',
  onClose = null, dismissible = true, className = '', flush = false
} = {}) {
  const root = document.getElementById('modal-root');
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' });
  const panelClass = `modal modal--${size} ${className}`.trim();

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    overlay.classList.add('is-closing');
    setTimeout(() => { overlay.remove(); onClose?.(result); }, 170);
    popCloser(escapeClose);
  };

  const escapeClose = () => { if (dismissible) close(); };

  const head = h('div', { class: 'modal__head' },
    h('div', { class: 'modal__title' },
      iconName ? icon(iconName, { size: 17 }) : null,
      h('h2', {}, title)
    ),
    dismissible ? h('button', {
      class: 'modal__x', 'aria-label': 'Close', onClick: () => close()
    }, icon('x', { size: 16 })) : null
  );

  const bodyEl = h('div', { class: `modal__body ${flush ? 'modal__body--flush' : ''}` });
  if (body) bodyEl.appendChild(body instanceof Node ? body : h('div', {}, body));

  const panel = h('div', { class: panelClass }, head, bodyEl);
  if (footer) {
    const foot = h('div', { class: 'modal__foot' });
    foot.appendChild(footer instanceof Node ? footer : h('div', {}, footer));
    panel.appendChild(foot);
  }
  overlay.appendChild(panel);

  if (dismissible) {
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close();
    });
  }
  root.appendChild(overlay);
  const untrap = trapFocus(overlay, escapeClose);
  pushCloser(escapeClose);
  sfx.play('whooshBack', { gain: 0.5 });
  setTimeout(() => {
    const focusTarget = panel.querySelector('[autofocus],input,textarea,select,button.btn--primary') || panel;
    focusTarget.focus?.();
  }, 60);

  return {
    el: panel,
    body: bodyEl,
    close: (result) => { untrap(); close(result); },
    setBody(node) { clear(bodyEl); bodyEl.appendChild(node); },
    setFooter(node) {
      let foot = panel.querySelector('.modal__foot');
      if (!foot) { foot = h('div', { class: 'modal__foot' }); panel.appendChild(foot); }
      clear(foot);
      foot.appendChild(node);
    }
  };
}

// -------------------------------------------------------------------- drawer
export function drawer({ title = '', iconName = null, body = null, footer = null, side = 'right', onClose = null } = {}) {
  const overlay = h('div', { class: 'overlay', style: { background: 'rgba(3,5,9,0.48)' } });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 180ms';
    setTimeout(() => { overlay.remove(); onClose?.(); }, 200);
    popCloser(close);
  };
  const panel = h('aside', { class: `drawer ${side === 'left' ? 'drawer--left' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'drawer__head' },
      h('div', { class: 'modal__title' }, iconName ? icon(iconName) : null, h('h2', { style: { fontSize: '15px' } }, title)),
      h('button', { class: 'modal__x', 'aria-label': 'Close', onClick: close }, icon('x', { size: 16 }))
    ),
    h('div', { class: 'drawer__body' }, body || ''),
    footer ? h('div', { class: 'drawer__foot' }, footer) : null
  );
  overlay.appendChild(panel);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
  document.getElementById('modal-root').appendChild(overlay);
  pushCloser(close);
  sfx.play('whooshBack', { gain: 0.4 });
  return { el: panel, body: panel.querySelector('.drawer__body'), close };
}

// ------------------------------------------------------------------- confirm
export function confirm({
  title = 'Confirm', text = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, iconName = 'warning'
} = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({
      title,
      iconName,
      size: 'sm',
      body: h('div', { class: 'flex flex-col gap-3' },
        h('p', { class: 'small', style: { color: 'var(--ink-3)' } }, text)
      ),
      footer: h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn', onClick: () => { answered = true; m.close(); resolve(false); } }, cancelLabel),
        h('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
          onClick: () => { answered = true; m.close(); resolve(true); }
        }, confirmLabel)
      ),
      onClose: () => { if (!answered) resolve(false); }
    });
    m.el.querySelector('.btn:last-child')?.focus();
  });
}

// ------------------------------------------------------------------ popover
let activePopover = null;

export function closePopover() {
  if (activePopover) { activePopover.remove(); activePopover = null; }
}

export function popover(anchor, items, { align = 'end', width = null } = {}) {
  closePopover();
  const el = h('div', { class: 'popover', role: 'menu' });
  if (width) el.style.minWidth = `${width}px`;
  for (const item of items) {
    if (!item) continue;
    if (item.separator) { el.appendChild(h('div', { class: 'popover__sep' })); continue; }
    if (item.label) { el.appendChild(h('div', { class: 'popover__label' }, item.label)); continue; }
    el.appendChild(h('button', {
      class: `popover__item ${item.danger ? 'popover__item--danger' : ''}`,
      role: 'menuitem',
      onClick: (e) => {
        e.stopPropagation();
        closePopover();
        item.onClick?.();
      }
    },
      item.iconName ? icon(item.iconName, { size: 14 }) : null,
      item.text,
      item.kbd ? h('span', { class: 'kbd' }, item.kbd) : null
    ));
  }
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const pw = el.offsetWidth, ph = el.offsetHeight;
  let left = align === 'end' ? r.right - pw : r.left;
  left = clamp(left, 8, window.innerWidth - pw - 8);
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  activePopover = el;
  const dismiss = (e) => {
    if (!el.contains(e.target)) { closePopover(); document.removeEventListener('pointerdown', dismiss); }
  };
  setTimeout(() => document.addEventListener('pointerdown', dismiss), 0);
  sfx.play('pop', { gain: 0.5 });
  return el;
}

// ----------------------------------------------------------------- hovercard
let hoverTimer = null;
export function showHovercard(target, content, { delay = 240 } = {}) {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    const card = document.getElementById('hovercard');
    if (!card) return;
    clear(card);
    card.appendChild(content instanceof Node ? content : h('div', {}, content));
    const r = target.getBoundingClientRect();
    const cw = 260, ch = card.offsetHeight || 120;
    let left = r.left + r.width / 2 - cw / 2;
    left = clamp(left, 10, window.innerWidth - cw - 10);
    let top = r.top - ch - 10;
    if (top < 10) top = r.bottom + 10;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.classList.add('is-on');
  }, delay);
}

export function hideHovercard() {
  clearTimeout(hoverTimer);
  document.getElementById('hovercard')?.classList.remove('is-on');
}

// -------------------------------------------------------------------- sheet
export function sheetRoot() {
  return document.getElementById('modal-root');
}

export function routeProgress() {
  const bar = h('div', { class: 'route-progress', style: { width: '0%', opacity: '1' } });
  document.body.appendChild(bar);
  requestAnimationFrame(() => { bar.style.width = '70%'; });
  return {
    done() {
      bar.style.width = '100%';
      setTimeout(() => { bar.style.opacity = '0'; setTimeout(() => bar.remove(), 300); }, 160);
    }
  };
}

export function busyOverlay(label = 'Working') {
  const overlay = h('div', { class: 'overlay', style: { backdropFilter: 'blur(4px)' } },
    h('div', { class: 'glass', style: { padding: '20px 26px', display: 'grid', justifyItems: 'center', gap: '12px' } },
      h('div', { class: 'ai-typing' }, h('i'), h('i'), h('i')),
      h('div', { class: 'eyebrow' }, label)
    )
  );
  document.getElementById('modal-root').appendChild(overlay);
  return { close: () => overlay.remove() };
}

export { pushCloser, popCloser, uid };
