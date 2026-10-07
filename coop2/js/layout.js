import { getUser, logout } from './js_auth.js';
import { initThemeToggle } from './js_theme.js';
import { el } from './js_utils.js';

const NAV = [
  { href: 'dashboard.html', label: 'داشبورد' },
  { href: 'invitations.html', label: 'دعوت‌نامه‌ها' },
  { href: 'minutes.html', label: 'صورت‌جلسات' },
  { href: 'suggestions.html', label: 'درخواست و پیشنهاد' },
  { href: 'admin_import.html', label: 'ایمپورت اکسل' }
];

export function renderLayout() {
  const user = getUser();
  const current = location.pathname.split('/').pop() || 'index.html';

  const headerHost = document.getElementById('appHeader');
  if (headerHost) {
    headerHost.innerHTML = '';
    headerHost.appendChild(el('header', { class: 'app-header' },
      el('div', { class: 'inner' },
        el('a', { class: 'brand', href: user ? 'dashboard.html' : 'index.html' },
          el('img', { src: 'assets_logo.svg', alt: '' }),
          el('span', {},
            el('span', {}, 'تعاونی مسکن مپنا هوایی'),
            el('small', {}, 'سامانه اعضا')
          )
        ),
        el('nav', { class: 'nav' },
          ...NAV.map(n => el('a', { href: n.href, class: current === n.href ? 'active' : '' }, n.label))
        ),
        el('div', { class: 'header-actions' },
          el('button', { class: 'theme-toggle', 'data-theme-toggle': '', 'aria-label': 'تغییر تم' },
            el('span', { class: 'theme-icon' })
          ),
          user ? el('div', { class: 'user-chip' },
            el('span', { class: 'avatar' }, (user.first_name || '?').charAt(0)),
            el('span', { class: 'name' }, `${user.first_name} ${user.last_name}`)
          ) : null,
          user ? el('button', { class: 'btn btn-ghost btn-sm', onclick: logout }, 'خروج') : null
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