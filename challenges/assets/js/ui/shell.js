/** پوسته‌ی برنامه: نوار بالا، ناوبری، فوتر، تم و اعلان وضعیت پایگاه‌داده. */
import { CONFIG } from '../config.js';
import { state, store } from '../store.js';
import {
  h, icon, initials, avatarTone, faDigits, money, modal, toast,
} from '../utils.js';
import { currentRoundRange, formatJalali } from '../jalali.js';

export const NAV = [
  { key: 'home', href: '#/', label: 'خانه', icon: 'home' },
  { key: 'log', href: '#/log', label: 'ثبت وزن', icon: 'scale' },
  { key: 'coach', href: '#/coach', label: 'مربی هوشمند', icon: 'sparkles' },
  { key: 'report', href: '#/report', label: 'گزارش من', icon: 'chart' },
  { key: 'overall', href: '#/overall', label: 'گزارش کلی', icon: 'trophy' },
  { key: 'profile', href: '#/profile', label: 'پروفایل', icon: 'user' },
  { key: 'rules', href: '#/rules', label: 'قوانین', icon: 'book' },
];

const MOBILE_NAV = ['home', 'log', 'coach', 'report', 'overall'];
const MOBILE_LABELS = {
  home: 'خانه', log: 'ثبت وزن', coach: 'مربی', report: 'گزارش من', overall: 'رقابت', profile: 'من',
};

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem('weightchallenge.theme', theme);
}

export function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  renderShell(currentActive());
}

function currentActive() {
  return document.body.dataset.route || 'home';
}

function brandBlock() {
  return h('a.brand', { href: '#/' },
    h('span.brand-mark', { html: icon('weight', 22) }),
    h('span.brand-text', {},
      h('span.brand-name', {}, CONFIG.appName),
      h('span.brand-sub', {}, CONFIG.appTagline),
    ),
  );
}

function userMenu() {
  if (!state.profile) {
    return h('a.btn.primary.sm', { href: '#/auth' }, icon('lock', 15), 'ورود / ثبت‌نام');
  }
  const p = state.profile;
  const pop = h('div.menu-pop');
  const toggle = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.menu-pop.open').forEach((n) => { if (n !== pop) n.classList.remove('open'); });
    pop.classList.toggle('open');
  };
  document.addEventListener('click', () => pop.classList.remove('open'));

  const item = (href, ic, label) => h('a.menu-item', { href, onClick: () => pop.classList.remove('open') },
    h('span', { html: icon(ic, 16) }), label);

  pop.append(
    h('div', { style: { padding: '8px 10px' } },
      h('div.strong', {}, p.full_name || 'کاربر'),
      h('div.tiny.muted', {}, state.sessionUser?.email || ''),
    ),
    h('div.menu-sep'),
    item('#/profile', 'user', 'پروفایل و شرایط BMI'),
    item('#/report', 'chart', 'گزارش شخصی'),
    item('#/rules', 'book', 'قوانین و جایزه'),
    h('div.menu-sep'),
    h('button.menu-item', {
      onClick: async () => {
        pop.classList.remove('open');
        await store.signOut();
        toast('از حساب خارج شدی.', 'info');
        location.hash = '#/';
      },
    }, h('span', { html: icon('logout', 16) }), 'خروج از حساب'),
  );

  return h('div.menu-wrap', {},
    h('button.user-chip', { onClick: toggle, 'aria-label': 'منوی کاربر' },
      h('span.avatar', { class: `avatar ${avatarTone(p.id)}` }, initials(p.full_name)),
      h('span.user-chip-name', {}, (p.full_name || 'کاربر').split(' ')[0]),
      h('span', { html: icon('menu', 15) }),
    ),
    pop,
  );
}

function backendNoteStrip() {
  if (!state.backendNote) return null;
  return h('div.notice-strip.no-print', {},
    h('div.inner', {},
      h('span', { html: icon('info', 16) }),
      h('div.grow', {}, h('strong', {}, 'پایگاه‌داده متصل نیست: '), state.backendNote),
      h('button.btn.sm.ghost', { onClick: showSetupHelp }, 'راهنمای فعال‌سازی'),
    ),
  );
}

export function showSetupHelp() {
  modal({
    title: 'فعال‌سازی پایگاه‌داده‌ی واقعی',
    subtitle: 'یک بار فایل SQL را در Supabase اجرا کنید؛ بعد از آن داده‌ها ذخیره می‌شوند.',
    width: 660,
    body: h('div.stack', {},
      h('div.alert.info', {},
        h('span', { html: icon('info', 18) }),
        h('div', {}, 'برای اینکه چالش با داده‌ی واقعی کار کند، این سه قدم را یک بار انجام دهید.'),
      ),
      h('ol', { style: { display: 'flex', flexDirection: 'column', gap: '12px', lineHeight: '2' } },
        h('li', {}, h('strong', {}, 'ورود به داشبورد Supabase'), ' پروژه‌ی ', h('span.mono', {}, 'zlvsmjhwyzfdecfyhxal'), ' و باز کردن بخش SQL Editor.'),
        h('li', {}, h('strong', {}, 'اجرای فایل '), h('code.mono', {}, 'supabase/schema.sql'), ' که همراه پروژه است. این فایل جدول‌های چالش (', h('code.mono', {}, 'challenge_*'), ') را می‌سازد و خواندن ', h('code.mono', {}, 'profiles'), ' و ', h('code.mono', {}, 'user_weights'), ' را برای اعضا باز می‌کند.'),
        h('li', {}, h('strong', {}, 'بارگذاری دوباره‌ی صفحه'), '؛ اگر ایمیلی برای تأیید ارسال می‌شود، در Authentication → Providers آن را خاموش کنید تا ثبت‌نام فوری باشد.'),
      ),
      h('div.alert.warn', {},
        h('span', { html: icon('alert', 18) }),
        h('div', {}, 'تا زمانی که این کار انجام نشده، بخش‌های داده (جدول چالش، ثبت وزن، گزارش‌ها و قرعه‌کشی) نمایش داده نمی‌شوند.'),
      ),
    ),
    footer: h('button.btn.primary', { onClick: (e) => e.target.closest('.modal-overlay').remove() }, 'متوجه شدم'),
  });
}

export function offlinePage() {
  return h('div.page', {},
    pageHead('پایگاه‌داده در دسترس نیست', 'برای استفاده از چالش، جدول‌های Supabase باید یک بار ساخته شوند.'),
    h('div.card', {},
      h('div.empty', {},
        h('div.empty-ic', { html: icon('alert', 24) }),
        h('strong', {}, 'اتصال به Supabase برقرار نشد'),
        h('p', {}, state.backendNote || 'بررسی کنید جدول‌های چالش ساخته شده‌اند و آدرس و کلید در assets/js/config.js درست است.'),
        h('div.row.gap-8.mt-8', {},
          h('button.btn.primary', { onClick: showSetupHelp }, 'راهنمای راه‌اندازی'),
          h('button.btn.ghost', { onClick: () => location.reload() }, 'تلاش دوباره'),
        ),
      ),
    ),
  );
}

export function renderShell(activeKey) {
  if (activeKey) document.body.dataset.route = activeKey;
  const topbar = document.getElementById('topbar');
  const mobileNav = document.getElementById('mobile-nav');
  const footer = document.getElementById('footer');

  topbar.hidden = false;
  footer.hidden = false;

  const navItems = NAV.map((item) =>
    h('a.nav-link', { href: item.href, class: item.key === activeKey ? 'active' : '' },
      h('span', { html: icon(item.icon, 17) }), item.label,
    ),
  );

  topbar.replaceChildren(
    h('div.topbar-inner', {},
      brandBlock(),
      h('nav.main-nav', {}, ...navItems),
      h('div.topbar-actions', {},
        h('span.badge.gold.hide-sm', { title: 'استخر جایزه‌ی این دوره' },
          h('span', { html: icon('trophy', 13) }),
          money(store.poolForRound()),
        ),
        h('button.icon-btn', {
          title: 'تغییر تم',
          'aria-label': 'تغییر تم',
          html: icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun', 18),
          onClick: toggleTheme,
        }),
        userMenu(),
      ),
    ),
    ...[backendNoteStrip()].filter(Boolean),
  );

  mobileNav.hidden = false;
  mobileNav.replaceChildren(
    h('div.mobile-nav-inner', {},
      ...MOBILE_NAV.map((key) => {
        const item = NAV.find((n) => n.key === key);
        return h('a.mobile-link', { href: item.href, class: key === activeKey ? 'active' : '' },
          h('span', { html: icon(item.icon, 21) }), MOBILE_LABELS[key] || item.label,
        );
      }),
      h('a.mobile-link', { href: '#/profile', class: activeKey === 'profile' ? 'active' : '' },
        h('span', { html: icon('user', 21) }), 'من'),
    ),
  );

  const range = currentRoundRange();
  footer.replaceChildren(
    h('div.footer-inner', {},
      h('div.row.gap-8', {},
        h('span.brand-mark', { style: { width: '30px', height: '30px', borderRadius: '9px' }, html: icon('weight', 17) }),
        h('div', {},
          h('div.strong', { style: { color: 'var(--text-2)' } }, `${CONFIG.appName} — ${CONFIG.appTagline}`),
          h('div.tiny', {}, `دوره‌ی ${range.title} • ${formatJalali(range.start, { long: true })} تا ${formatJalali(range.end, { long: true })}`),
        ),
      ),
      h('div.footer-links', {},
        h('a', { href: '#/rules' }, 'قوانین و جوایز'),
        h('a', { href: '#/overall' }, 'گزارش کلی'),
        h('a', { href: '#/coach' }, 'مربی هوشمند'),
        h('span.badge', { class: state.backend === 'supabase' ? 'brand' : 'gold' },
          state.backend === 'supabase' ? 'متصل به Supabase' : 'متصل نیست',
        ),
      ),
    ),
  );
}

export function pageHead(title, subtitle, actions = []) {
  return h('div.page-head', {},
    h('div', {},
      h('h1.page-title', {}, title),
      subtitle ? h('p.page-sub', {}, subtitle) : null,
    ),
    actions.length ? h('div.page-actions', {}, ...actions) : null,
  );
}

export function sectionHead(title, iconName, action = null) {
  return h('div.section-head', {},
    h('h2.section-title', {},
      iconName ? h('span', { html: icon(iconName, 18) }) : null,
      title,
    ),
    action,
  );
}

export function statCard({ label, value, unit, foot, footTone, iconName }) {
  return h('div.stat', {},
    h('div.stat-label', {}, iconName ? h('span', { html: icon(iconName, 14) }) : null, label),
    h('div.stat-value', {}, value, unit ? h('small', {}, unit) : null),
    foot ? h('div.stat-foot', { class: `stat-foot ${footTone || ''}` }, foot) : null,
  );
}

export function loginPrompt(root, message = 'برای استفاده از این بخش وارد حساب خود شو.') {
  root.append(
    pageHead('ورود لازم است', ''),
    h('div.card', { style: { maxWidth: '520px', margin: '0 auto' } },
      h('div.empty', {},
        h('div.empty-ic', { html: icon('lock', 24) }),
        h('strong', {}, 'دسترسی محدود'),
        h('p', {}, message),
        h('div.row.gap-8.mt-8', {},
          h('a.btn.primary', { href: '#/auth' }, 'ورود / ثبت‌نام'),
          h('a.btn.ghost', { href: '#/' }, 'بازگشت به خانه'),
        ),
      ),
    ),
  );
}
