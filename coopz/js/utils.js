export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number'
      ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export function faNum(n) {
  if (n == null || n === '') return '—';
  return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

export function formatMoney(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  return faNum(num.toLocaleString('en-US'));
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

export function setBtnLoading(btn, loading) {
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const spin = btn.querySelector('.spinner');
  btn.disabled = !!loading;
  if (text) text.style.opacity = loading ? '0' : '1';
  if (spin) spin.hidden = !loading;
}

export function showMsg(node, text, type = '') {
  if (!node) return;
  node.textContent = text || '';
  node.className = 'auth-msg' + (type ? ' ' + type : '');
}

export function toISODate(input) {
  if (!input) return null;
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  const s = String(input).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

export function pad2(n) { return String(n).padStart(2, '0'); }

/** Wire all .pass-toggle buttons (data-toggle-for = input id) */
export function bindPassToggles(root = document) {
  root.querySelectorAll('.pass-toggle').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    // Ensure eye icons exist
    if (!btn.querySelector('.i-eye')) {
      btn.innerHTML = '<i class="i i-eye" aria-hidden="true"></i><i class="i i-eye-off" aria-hidden="true"></i>';
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-toggle-for');
      const input = id
        ? document.getElementById(id)
        : btn.closest('.input-wrap')?.querySelector('input');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('is-shown', show);
      btn.setAttribute('aria-label', show ? 'مخفی کردن رمز' : 'نمایش رمز');
    });
  });
}
