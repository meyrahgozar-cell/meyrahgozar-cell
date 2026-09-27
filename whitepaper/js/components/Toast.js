/* ============================================================
   کاغذ سفید — توست (پیام‌های گذرا)
   ============================================================ */

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export const Toast = {
  show(message, type = 'info', duration = 3200) {
    const root = document.getElementById('toast-root');
    if (!root) return;

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
      <span class="toast-msg">${message}</span>
    `;
    root.appendChild(el);

    const remove = () => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 220);
    };

    const timer = setTimeout(remove, duration);
    el.addEventListener('click', () => { clearTimeout(timer); remove(); });
  },

  success(m, d) { this.show(m, 'success', d); },
  error(m, d)   { this.show(m, 'error', d); },
  warning(m, d) { this.show(m, 'warning', d); },
  info(m, d)    { this.show(m, 'info', d); },
};