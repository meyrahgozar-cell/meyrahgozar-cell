import { getUser, logout, isAdmin, isSuperAdmin } from './auth.js';
import { initThemeToggle } from './theme.js';
import { el } from './utils.js';

const ROOT = new URL('../', import.meta.url).href;

const MEMBER_NAV = [
  { href: 'dashboard.html',    label: 'داشبورد',          icon: 'dashboard' },
  { href: 'invitations.html',  label: 'دعوت‌نامه‌ها',      icon: 'mail' },
  { href: 'minutes.html',      label: 'صورت‌جلسات',       icon: 'file-text' },
  { href: 'suggestions.html',  label: 'درخواست و پیشنهاد', icon: 'send' },
  { href: 'password.html',     label: 'تغییر رمز عبور',   icon: 'lock' }
];

const ADMIN_NAV = [
  { href: 'admin/import.html',    label: 'ایمپورت اکسل',  icon: 'upload' },
  { href: 'admin/database.html',  label: 'مدیریت دیتابیس', icon: 'database' }
];

const SUPER_NAV = [
  { href: 'admin/users.html',     label: 'مدیریت کاربران', icon: 'users' },
  { href: 'admin/audit.html',     label: 'گزارش فعالیت',  icon: 'activity' }
];

const icon = (name) => el('i', { class: `i i-${name}`, 'aria-hidden': 'true' });

function currentPage() {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 2] === 'admin') {
    return 'admin/' + parts[parts.length - 1];
  }
  return parts[parts.length - 1] || 'index.html';
}

function navLink(n, current) {
  const active = n.href === current;
  return el('a', {
    href: ROOT + n.href,
    class: 'side-link' + (active ? ' active' : ''),
    'aria-current': active ? 'page' : null
  },
    icon(n.icon),
    el('span', {}, n.label)
  );
}

export function renderLayout() {
  const user = getUser();
  const current = currentPage();
  const admin = isAdmin(user);
  const superA = isSuperAdmin(user);

  /* ---- Header ---- */
  const headerHost = document.getElementById('appHeader');
  if (headerHost) {
    headerHost.innerHTML = '';
    headerHost.appendChild(el('header', { class: 'app-header' },
      el('div', { class: 'inner' },
        el('button', {
          class: 'burger-btn',
          type: 'button',
          id: 'burgerBtn',
          'aria-label': 'منو',
          'aria-expanded': 'false',
          'aria-controls': 'sideDrawer'
        },
          el('span', { class: 'burger-line' }),
          el('span', { class: 'burger-line' }),
          el('span', { class: 'burger-line' })
        ),
        el('a', { class: 'brand', href: ROOT + (user ? 'dashboard.html' : 'index.html') },
          el('img', { src: ROOT + 'assets/logo.svg', alt: '' }),
          el('span', {},
            el('span', { class: 'brand-name' }, 'تعاونی مسکن مپنا هوایی'),
            el('small', {}, 'سامانه اعضا')
          )
        ),
        el('div', { class: 'header-actions' },
          el('button', { class: 'theme-toggle', type: 'button', 'data-theme-toggle': '', 'aria-label': 'تغییر تم' },
            el('i', { class: 'i theme-icon', 'aria-hidden': 'true' })
          ),
          user ? el('div', { class: 'user-chip' },
            el('span', { class: 'avatar' }, (user.first_name || '?').charAt(0)),
            el('span', { class: 'name' }, `${user.first_name || ''} ${user.last_name || ''}`)
          ) : null,
          user ? el('button', { class: 'btn btn-ghost btn-sm btn-logout', type: 'button', onclick: logout, 'aria-label': 'خروج' },
            icon('log-out'),
            el('span', { class: 'btn-label' }, 'خروج')
          ) : null
        )
      )
    ));
  }

  /* ---- Sidebar drawer ---- */
  let drawer = document.getElementById('sideDrawer');
  if (!drawer) {
    drawer = el('aside', { id: 'sideDrawer', class: 'side-drawer', 'aria-hidden': 'true' });
    document.body.appendChild(drawer);
  }
  drawer.innerHTML = '';

  const sections = [];

  /* Member section */
  sections.push(
    el('div', { class: 'side-section' },
      el('div', { class: 'side-section-title' }, 'منوی اصلی'),
      ...MEMBER_NAV.map(n => navLink(n, current))
    )
  );

  if (admin) {
    sections.push(
      el('div', { class: 'side-section side-section-admin' },
        el('div', { class: 'side-section-title' }, 'مدیریت'),
        ...ADMIN_NAV.map(n => navLink(n, current))
      )
    );
  }

  if (superA) {
    sections.push(
      el('div', { class: 'side-section side-section-super' },
        el('div', { class: 'side-section-title' }, 'سوپرادمین'),
        ...SUPER_NAV.map(n => navLink(n, current))
      )
    );
  }

  drawer.append(
    el('div', { class: 'side-head' },
      el('span', { class: 'side-head-title' }, 'منو'),
      el('button', { class: 'side-close', type: 'button', id: 'sideClose', 'aria-label': 'بستن' },
        el('i', { class: 'i i-x', 'aria-hidden': 'true' })
      )
    ),
    el('nav', { class: 'side-nav', 'aria-label': 'ناوبری' }, ...sections)
  );

  /* Overlay */
  let overlay = document.getElementById('sideOverlay');
  if (!overlay) {
    overlay = el('div', { id: 'sideOverlay', class: 'side-overlay' });
    document.body.appendChild(overlay);
  }

  const openDrawer = () => {
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    const btn = document.getElementById('burgerBtn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-open');
  };
  const closeDrawer = () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    const btn = document.getElementById('burgerBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
  };

  const burger = document.getElementById('burgerBtn');
  if (burger) burger.onclick = openDrawer;
  const closeBtn = document.getElementById('sideClose');
  if (closeBtn) closeBtn.onclick = closeDrawer;
  overlay.onclick = closeDrawer;

  /* Close on nav click (mobile) */
  drawer.querySelectorAll('.side-link').forEach(a => {
    a.addEventListener('click', () => { if (window.innerWidth < 900) closeDrawer(); });
  });

  /* Footer */
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

