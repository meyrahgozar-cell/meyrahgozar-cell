import { getUser, logout } from './auth.js';
import { initThemeToggle } from './theme.js';
import { el } from './utils.js';

// Project root, independent of page depth (root pages and /admin/ pages)
const ROOT = new URL('../', import.meta.url).href;

const NAV = [
  { href: 'dashboard.html',    label: 'داشبورد',            short: 'داشبورد',      icon: 'dashboard' },
  { href: 'invitations.html',  label: 'دعوت‌نامه‌ها',        short: 'دعوت‌نامه‌ها',  icon: 'mail' },
  { href: 'minutes.html',      label: 'صورت‌جلسات',         short: 'صورت‌جلسات',   icon: 'file-text' },
  { href: 'suggestions.html',  label: 'درخواست و پیشنهاد',   short: 'پیشنهاد',      icon: 'send' },
  { href: 'admin/import.html', label: 'ایمپورت اکسل',       short: 'ایمپورت',      icon: 'upload', admin: true }
];

const icon = (name) => el('i', { class: `i i-${name}`, 'aria-hidden': 'true' });

export function renderLayout() {
  const user = getUser();
  const current = location.pathname.split('/').pop() || 'index.html';

  const headerHost = document.getElementById('appHeader');
  if (headerHost) {
    headerHost.innerHTML = '';
    headerHost.appendChild(el('header', { class: 'app-header' },
      el('div', { class: 'inner' },
        el('a', { class: 'brand', href: ROOT + (user ? 'dashboard.html' : 'index.html') },
          el('img', { src: ROOT + 'assets/logo.svg', alt: '' }),
          el('span', {},
            el('span', { class: 'brand-name' }, 'تعاونی مسکن مپنا هوایی'),
            el('small', {}, 'سامانه اعضا')
          )
        ),
        el('nav', { class: 'nav', 'aria-label': 'ناوبری اصلی' },
          ...NAV.map(n => {
            const active = n.href.split('/').pop() === current;
            return el('a', {
              href: ROOT + n.href,
              class: active ? 'active' : '',
              'aria-current': active ? 'page' : null,
              'data-admin': n.admin ? '' : null
            },
              icon(n.icon),
              el('span', { class: 'nav-full' }, n.label),
              el('span', { class: 'nav-short' }, n.short)
            );
          })
        ),
        el('div', { class: 'header-actions' },
          el('button', { class: 'theme-toggle', type: 'button', 'data-theme-toggle': '', 'aria-label': 'تغییر تم' },
            el('i', { class: 'i theme-icon', 'aria-hidden': 'true' })
          ),
          user ? el('div', { class: 'user-chip' },
            el('span', { class: 'avatar' }, (user.first_name || '?').charAt(0)),
            el('span', { class: 'name' }, `${user.first_name} ${user.last_name}`)
          ) : null,
          user ? el('button', { class: 'btn btn-ghost btn-sm btn-logout', type: 'button', onclick: logout, 'aria-label': 'خروج' },
            icon('log-out'),
            el('span', { class: 'btn-label' }, 'خروج')
          ) : null
        )
      )
    ));
  }

  const footerHost = document.getElementById('appFooter');
  if (footerHost) {
    footerHost.innerHTML = '';
    footerHost.appendChild(el('footer', { class: 'app-footer' },
      el('div', { class: 'inner' },
        el('span', {}, `© ${new Date().getFullYear()} تعاونی مسکن مپنا هوایی`),
        el('span', { class: 'tiny' }, 'پشتیبانی: Mani.alir1990@gmail.com')
      )
    ));
  }

  initThemeToggle();
}
