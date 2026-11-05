/* پالت فرمان ⌘K — فرمان‌ها به‌همراه جست‌وجوی زنده در روایت. */
import { esc, icon, qs, debounce } from '../lib/dom.js';
import { fmtDate } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { toast, confirmDialog } from '../lib/ui.js';
import { db, coverOf, useCloud } from '../services/db.js';
import { state, toggleTheme, prefs, savePrefs } from '../state.js';
import { MOODS } from '../config.js';

let node = null;
let items = [];
let active = 0;
let searchSeq = 0;

function baseCommands() {
  return [
    { group: 'ساختن', label: 'قاب تازه', hint: 'N', icon: 'plus', run: () => navigate('/write') },
    { group: 'ساختن', label: 'رشتهٔ تازه', hint: '', icon: 'threads', run: () => navigate('/threads?new=1') },
    { group: 'رفتن', label: 'نمای کلی', icon: 'home', run: () => navigate('/home') },
    { group: 'رفتن', label: 'خط زمان', icon: 'reel', run: () => navigate('/timeline') },
    { group: 'رفتن', label: 'آلبوم', icon: 'grid', run: () => navigate('/gallery') },
    { group: 'رفتن', label: 'تقویم', icon: 'calendar', run: () => navigate('/calendar') },
    { group: 'رفتن', label: 'بینش', icon: 'chart', run: () => navigate('/insights') },
    { group: 'رفتن', label: 'رشته‌ها', icon: 'threads', run: () => navigate('/threads') },
    { group: 'رفتن', label: 'مکان‌ها', icon: 'pin', run: () => navigate('/places') },
    { group: 'رفتن', label: 'تنظیمات', icon: 'settings', run: () => navigate('/settings') },
    { group: 'رفتن', label: 'راه‌اندازی ابری', icon: 'cloud', run: () => navigate('/setup') },
    { group: 'کار', label: 'تغییر پوستهٔ روشن / تاریک', icon: prefs.theme === 'dark' ? 'sun' : 'moon', run: () => { toggleTheme(); toast('پوسته عوض شد', { type: 'info' }); } },
    { group: 'کار', label: 'فهرست یا شبکه', icon: 'gridview', run: () => { savePrefs({ listView: prefs.listView === 'grid' ? 'list' : 'grid' }); navigate('/timeline'); } },
    { group: 'کار', label: 'فقط محبوب‌ها', icon: 'star', run: () => navigate('/timeline?fav=1') },
    ...MOODS.map((m) => ({ group: 'حال‌وهوا', label: `قاب‌های ${m.label}`, icon: 'filter', run: () => navigate(`/timeline?mood=${m.slug}`) })),
    ...(state.session ? [{ group: 'کار', label: 'خروج از حساب', icon: 'logout', run: async () => {
      const ok = await confirmDialog({ title: 'خارج می‌شوی؟', message: 'روایتت در گنجینهٔ ابری سالم می‌ماند.', confirmLabel: 'خروج' });
      if (ok) window.dispatchEvent(new CustomEvent('reel:signout'));
    } }] : []),
  ];
}

function paint() {
  const list = qs('.palette__list', node);
  if (!items.length) {
    list.innerHTML = `<div class="palette__group">چیزی پیدا نشد</div>
      <div style="padding:10px 12px;color:var(--faint);font-size:var(--fs-xs)">یک کلمه از یک قاب، یک برچسب یا یک مکان را امتحان کن.</div>`;
    return;
  }
  let lastGroup = '';
  list.innerHTML = items.map((item, i) => {
    const header = item.group !== lastGroup ? `<div class="palette__group">${esc(item.group)}</div>` : '';
    lastGroup = item.group;
    return `${header}
      <div class="palette__item ${i === active ? 'is-active' : ''}" data-i="${i}" role="option">
        ${item.thumb ? `<img class="palette__thumb" src="${esc(item.thumb)}" alt="" />` : icon(item.icon || 'arrow-left')}
        <strong>${esc(item.label)}</strong>
        ${item.hint ? `<em>${esc(item.hint)}</em>` : ''}
      </div>`;
  }).join('');
}

function setActive(next) {
  if (!items.length) return;
  active = (next + items.length) % items.length;
  paint();
  qs(`.palette__item[data-i="${active}"]`, node)?.scrollIntoView({ block: 'nearest' });
}

const searchEntries = debounce(async (q) => {
  const seq = ++searchSeq;
  if (!q || q.length < 1) return;
  try {
    const { rows } = await db.entries.list({ search: q, limit: 6 });
    if (seq !== searchSeq) return;
    const results = rows.map((e) => ({
      group: 'قاب‌ها',
      label: e.title || e.location || `قاب ${fmtDate(e.happened_on)}`,
      hint: fmtDate(e.happened_on, 'short'),
      thumb: coverOf(e) || '',
      run: () => navigate(`/frame/${e.id}`),
    }));
    const commands = baseCommands().filter((c) => c.label.includes(q)).slice(0, 4);
    items = [...results, ...commands];
    active = 0;
    paint();
  } catch (err) {
    console.warn(err);
  }
}, 200);

export function openPalette(initial = '') {
  if (node) { closePalette(); return; }
  items = baseCommands().slice(0, 10);
  active = 0;

  node = document.createElement('div');
  node.className = 'palette-wrap';
  node.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="جست‌وجو و فرمان‌ها">
      <div class="palette__search">
        ${icon('search')}
        <input type="text" placeholder="جست‌وجو در قاب‌ها، مکان‌ها، برچسب‌ها — یا پرش به جایی" value="${esc(initial)}" aria-label="جست‌وجو" />
        <button class="icon-btn" data-close aria-label="بستن">${icon('close')}</button>
      </div>
      <div class="palette__list" role="listbox"></div>
      <div class="palette__foot">
        <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> گشتن</span>
        <span><kbd class="kbd">↵</kbd> باز کردن</span>
        <span><kbd class="kbd">esc</kbd> بستن</span>
        <span style="margin-inline-start:auto">${useCloud() ? icon('cloud', 'ico--sm') + ' گنجینهٔ ابری' : icon('lock', 'ico--sm') + ' گنجینهٔ محلی'}</span>
      </div>
    </div>`;
  document.body.appendChild(node);
  paint();

  const input = qs('input', node);
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { items = baseCommands().slice(0, 10); active = 0; paint(); return; }
    items = baseCommands().filter((c) => c.label.includes(q)).slice(0, 8);
    active = 0;
    paint();
    searchEntries(q);
  });

  node.addEventListener('click', (e) => {
    if (e.target === node) closePalette();
    if (e.target.closest('[data-close]')) closePalette();
    const item = e.target.closest('.palette__item');
    if (item) run(items[Number(item.dataset.i)]);
  });

  node.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    if (e.key === 'Enter') { e.preventDefault(); run(items[active]); }
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });

  setTimeout(() => input.focus(), 30);
}

function run(item) {
  if (!item) return;
  closePalette();
  setTimeout(() => item.run(), 10);
}

export function closePalette() {
  node?.remove();
  node = null;
}
