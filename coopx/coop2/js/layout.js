import { getUser, logout, isAdmin, isSuper, refreshUser } from './auth.js';
import { initThemeToggle } from './theme.js';
import { el } from './utils.js';
import { startBrickComets } from './fx.js';
import { ROLE_LABELS } from './profiles.js';

// Project root, independent of page depth (root pages and /admin/ pages)
const ROOT = new URL('../', import.meta.url).href;

const MEMBER_NAV = [
  { href: 'dashboard.html',   label: 'داشبورد',            icon: 'dashboard' },
  { href: 'invitations.html', label: 'دعوت‌نامه‌ها',        icon: 'mail' },
  { href: 'minutes.html',     label: 'صورت‌جلسات',         icon: 'file-text' },
  { href: 'suggestions.html', label: 'درخواست و پیشنهاد',   icon: 'send' }
];
const ADMIN_NAV = [
  { href: 'admin/index.html',       label: 'نمای کلی',  icon: 'activity' },
  { href: 'admin/members.html',     label: 'اعضا',      icon: 'users' },
  { href: 'admin/payments.html',    label: 'پرداخت‌ها', icon: 'wallet' },
  { href: 'admin/obligations.html', label: 'تعهدات',    icon: 'calendar-clock' },
  { href: 'admin/suggestions.html', label: 'پیشنهادها', icon: 'inbox' },
  { href: 'admin/data.html',        label: 'داده‌ها',   icon: 'table' }
];
const SUPER_NAV = [
  { href: 'admin/admins.html',   label: 'ادمین‌ها',   icon: 'shield' },
  { href: 'admin/database.html', label: 'پایگاه داده', icon: 'database' }
];

const icon = (name) => el('i', { class: `i i-${name}`, 'aria-hidden': 'true' });
const current = () => location.pathname;

function link(n) {
  const active = current().endsWith('/' + n.href) || current().endsWith(n.href) && n.href.includes('/');
  return el('a', { class: 'drawer-link' + (active ? ' active' : ''), href: ROOT + n.href, 'aria-current': active ? 'page' : null },
    icon(n.icon), el('span', {}, n.label));
}

export function renderLayout() {
  const user = getUser();
  startBrickComets();

  const headerHost = document.getElementById('appHeader');
  if (headerHost) {
    headerHost.innerHTML = '';

    const burger = el('button', { class: 'burger', type: 'button', 'aria-label': 'منو', 'aria-expanded': 'false', 'aria-controls': 'appDrawer' },
      el('span'), el('span'), el('span'));
    const overlay = el('div', { class: 'drawer-overlay' });
    const closeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'بستن' }, icon('x'));

    const groups = [el('div', { class: 'drawer-group' }, ...MEMBER_NAV.map(link))];
    if (isAdmin(user)) {
      const items = [el('div', { class: 'drawer-label' }, 'مدیریت'), ...ADMIN_NAV.map(link)];
      if (isSuper(user)) items.push(...SUPER_NAV.map(link));
      groups.push(el('div', { class: 'drawer-group drawer-admin' }, ...items));
    }

    const drawer = el('aside', { class: 'drawer', id: 'appDrawer', 'aria-label': 'منو' },
      el('div', { class: 'drawer-head' },
        el('img', { src: ROOT + 'assets/logo.svg', alt: '', width: 30, height: 30 }),
        el('span', { class: 'brand-name' }, 'تعاونی مسکن مپنا هوایی'),
        closeBtn),
      el('nav', { class: 'drawer-nav' }, ...groups),
      user ? el('div', { class: 'drawer-foot' },
        el('div', { class: 'drawer-user' },
          el('span', { class: 'avatar' }, (user.first_name || '?').charAt(0)),
          el('div', { style: 'min-width:0' },
            el('b', {}, `${user.first_name} ${user.last_name}`),
            el('small', {}, ROLE_LABELS[user.role] || ''))),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: logout }, icon('log-out'), 'خروج')) : null);

    const open = () => {
      drawer.classList.add('open'); overlay.classList.add('open');
      burger.setAttribute('aria-expanded', 'true'); document.documentElement.classList.add('no-scroll');
      setTimeout(() => (drawer.querySelector('.drawer-link.active') || drawer.querySelector('.drawer-link'))?.focus({ preventScroll: true }), 60);
    };
    const close = () => {
      drawer.classList.remove('open'); overlay.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      if (!document.querySelector('.sheet-overlay')) document.documentElement.classList.remove('no-scroll');
    };
    burger.addEventListener('click', () => (drawer.classList.contains('open') ? close() : open()));
    closeBtn.addEventListener('click', () => { close(); burger.focus(); });
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (!drawer.classList.contains('open')) return;
      if (e.key === 'Escape') { close(); burger.focus(); }
      if (e.key === 'Tab') {                                   // keep focus inside the drawer
        const f = Array.from(drawer.querySelectorAll('a[href], button:not([disabled])'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    headerHost.append(
      el('header', { class: 'app-header' },
        el('div', { class: 'inner' },
          burger,
          el('a', { class: 'brand', href: ROOT + (user ? 'dashboard.html' : 'index.html') },
            el('img', { src: ROOT + 'assets/logo.svg', alt: '' }),
            el('span', { class: 'brand-name' }, 'تعاونی مسکن مپنا هوایی')),
          el('div', { class: 'header-actions' },
            el('button', { class: 'theme-toggle', type: 'button', 'data-theme-toggle': '', 'aria-label': 'تغییر تم' },
              el('i', { class: 'i theme-icon', 'aria-hidden': 'true' })),
            user ? el('div', { class: 'user-chip' },
              el('span', { class: 'avatar' }, (user.first_name || '?').charAt(0)),
              el('span', { class: 'name' }, `${user.first_name} ${user.last_name}`)) : null))),
      overlay, drawer);
  }

  const footerHost = document.getElementById('appFooter');
  if (footerHost) {
    footerHost.innerHTML = '';
    footerHost.appendChild(el('footer', { class: 'app-footer' },
      el('div', { class: 'inner' },
        el('span', {}, `© ${new Date().getFullYear()} تعاونی مسکن مپنا هوایی`),
        el('span', { class: 'tiny' }, 'پشتیبانی: Mani.alir1990@gmail.com'))));
  }

  initThemeToggle();

  // roles can change while a session is open (e.g. superadmin transfer): re-check once per page
  if (user) refreshUser().then((u) => { if (u && u.role !== user.role) location.reload(); }).catch(() => {});
}
