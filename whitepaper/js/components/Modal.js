/* ============================================================
   کاغذ سفید — مودال
   ============================================================ */

export const Modal = {
  _current: null,

  open({ title = '', body = '', footer = '', size = 'md', onClose = null } = {}) {
    this.close();

    const root = document.getElementById('modal-root');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal modal-${size}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="btn-icon" data-close aria-label="بستن">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;
    root.appendChild(backdrop);
    this._current = { backdrop, onClose };

    // رویدادها
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
      if (e.target.closest('[data-close]')) this.close();
    });

    document.addEventListener('keydown', this._escHandler = (e) => {
      if (e.key === 'Escape') this.close();
    });

    // فوکوس اول
    setTimeout(() => {
      const first = backdrop.querySelector('input, textarea, select, button:not([data-close])');
      first?.focus();
    }, 60);

    return backdrop.querySelector('.modal-body');
  },

  close() {
    if (!this._current) return;
    const { backdrop, onClose } = this._current;
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 180);
    if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
    this._current = null;
    onClose?.();
  },

  /** تایید سریع */
  confirm({ title = 'تایید', message = '', confirmText = 'تایید', cancelText = 'انصراف', danger = false } = {}) {
    return new Promise((resolve) => {
      const body = document.createElement('div');
      body.innerHTML = `<p style="color:var(--text-secondary);line-height:1.8;">${message}</p>`;

      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;gap:8px;';
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.textContent = cancelText;
      const ok = document.createElement('button');
      ok.className = danger ? 'btn btn-danger' : 'btn btn-primary';
      ok.textContent = confirmText;
      footer.appendChild(cancel);
      footer.appendChild(ok);

      const wrap = document.createElement('div');
      wrap.appendChild(body);
      wrap.appendChild(footer);

      const root = document.getElementById('modal-root');
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal modal-sm">
          <div class="modal-header">
            <div class="modal-title">${title}</div>
          </div>
          <div class="modal-body"></div>
          <div class="modal-footer"></div>
        </div>
      `;
      backdrop.querySelector('.modal-body').appendChild(body);
      backdrop.querySelector('.modal-footer').appendChild(footer);
      root.appendChild(backdrop);

      const done = (v) => {
        backdrop.style.opacity = '0';
        setTimeout(() => backdrop.remove(), 180);
        resolve(v);
      };

      cancel.onclick = () => done(false);
      ok.onclick = () => done(true);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done(false); });
    });
  },
};