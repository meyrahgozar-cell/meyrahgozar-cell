/* قطعه‌های مشترک ظاهری که در چند نما استفاده می‌شوند. */
import { MOODS } from '../config.js';
import { esc, icon } from '../lib/dom.js';
import { excerptFromHtml, fa, fmtDate, relTime, plural } from '../lib/format.js';
import { coverOf, db } from '../services/db.js';
import { navigate } from '../lib/router.js';
import { menu, toast, confirmDialog } from '../lib/ui.js';
import { bus } from '../state.js';

export const moodOf = (slug) => MOODS.find((m) => m.slug === slug) || null;

export const moodColor = (slug) => moodOf(slug)?.color || 'var(--faint)';
export const moodLabel = (slug) => moodOf(slug)?.label || '';

export function moodDot(slug, size = 8) {
  if (!slug) return '';
  return `<span class="mood-dot" style="background:${moodColor(slug)};width:${size}px;height:${size}px"></span>`;
}

export function tagChips(tags = [], max = 3) {
  if (!tags.length) return '';
  const shown = tags.slice(0, max);
  return `<div class="chips">${shown.map((t) => `<a class="tagchip" href="#/timeline?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}${tags.length > max ? `<span class="tagchip" style="opacity:.6">+${fa(tags.length - max)}</span>` : ''}</div>`;
}

export function entryCard(entry, { view = 'list', actions = true } = {}) {
  const cover = coverOf(entry);
  const mood = moodOf(entry.mood);
  const excerpt = excerptFromHtml(entry.body, view === 'grid' ? 120 : 170);
  const title = entry.title || excerpt || 'قاب بی‌نام';
  return `
  <article class="frame-card" data-open="${esc(entry.id)}" tabindex="0" role="link" aria-label="${esc(title)}">
    <div class="frame-card__media ${cover ? '' : 'frame-card__media--empty'}">
      ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async" />` : icon('image', 'ico--lg')}
    </div>
    <div class="frame-card__body">
      <div class="frame-card__kicker">
        ${mood ? `${moodDot(entry.mood, 6)}<span>${esc(mood.label)}</span><span style="opacity:.4">·</span>` : ''}
        <span>${esc(fmtDate(entry.happened_on, 'short'))}</span>
        ${entry.happened_at ? `<span style="opacity:.4">·</span><span>${esc(fmtTimeShort(entry.happened_at))}</span>` : ''}
        ${entry.thread_id ? `<span style="opacity:.4">·</span><span>رشته</span>` : ''}
      </div>
      <h3 class="frame-card__title">${esc(title)}</h3>
      ${excerpt && entry.title ? `<p class="frame-card__excerpt">${esc(excerpt)}</p>` : ''}
      <div class="frame-card__meta">
        ${entry.location ? `<span class="item">${icon('pin')}${esc(entry.location)}</span>` : ''}
        ${entry.photos?.length ? `<span class="item">${icon('image')}${fa(entry.photos.length)}</span>` : ''}
        ${entry.word_count ? `<span class="item">${icon('clock')}${fa(entry.word_count)} کلمه</span>` : ''}
        ${(entry.tags || []).length ? `<span class="item">${icon('tag')}${esc(entry.tags.slice(0, 2).join('، '))}</span>` : ''}
      </div>
    </div>
    <div class="frame-card__flags">
      ${entry.pinned ? `<span class="frame-card__flag frame-card__flag--pin" title="سنجاق‌شده">${icon('pinmark')}</span>` : ''}
      ${entry.favorite ? `<span class="frame-card__flag frame-card__flag--star" title="محبوب">${icon('star')}</span>` : ''}
    </div>
    ${actions ? `<button class="icon-btn frame-card__menu" data-menu="${esc(entry.id)}" aria-label="کارهای قاب" type="button">${icon('more')}</button>` : ''}
  </article>`;
}

/** ساعت را به شکل ۰۹:۳۰ برمی‌گرداند. */
function fmtTimeShort(value) {
  return fa(String(value).slice(0, 5));
}

export function entryMenu(anchor, entry) {
  menu(anchor, [
    { label: 'خواندن قاب', icon: 'reel', onSelect: () => navigate(`/frame/${entry.id}`) },
    { label: 'ویرایش', icon: 'pencil', onSelect: () => navigate(`/write/${entry.id}`) },
    '-',
    {
      label: entry.favorite ? 'برداشتن از محبوب‌ها' : 'محبوب',
      icon: 'star',
      onSelect: async () => {
        await db.entries.toggleFlag(entry.id, 'favorite');
        bus.emit('entries:changed');
        toast(entry.favorite ? 'از محبوب‌ها برداشته شد' : 'به محبوب‌ها اضافه شد', { type: 'success' });
      },
    },
    {
      label: entry.pinned ? 'برداشتن سنجاق' : 'سنجاق به بالا',
      icon: 'pinmark',
      onSelect: async () => {
        await db.entries.toggleFlag(entry.id, 'pinned');
        bus.emit('entries:changed');
        toast(entry.pinned ? 'سنجاق برداشته شد' : 'به بالای خط زمان سنجاق شد', { type: 'success' });
      },
    },
    {
      label: 'رونوشت',
      icon: 'copy',
      onSelect: async () => {
        const copy = { ...entry, id: undefined, title: entry.title ? `${entry.title} (رونوشت)` : '', created_at: undefined };
        const saved = await db.entries.save({ ...copy, id: crypto.randomUUID ? crypto.randomUUID() : entry.id });
        toast('قاب رونوشت شد', { type: 'success', action: { label: 'باز کن', onClick: () => navigate(`/write/${saved.id}`) } });
        bus.emit('entries:changed');
      },
    },
    '-',
    {
      label: 'پاک کردن قاب',
      icon: 'trash',
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: 'این قاب پاک شود؟',
          message: `«${esc(entry.title || 'قاب بی‌نام')}» و عکس‌هایش از گنجینه حذف می‌شوند. این کار بازگشت‌پذیر نیست.`,
          confirmLabel: 'پاک کن برای همیشه',
          danger: true,
        });
        if (!ok) return;
        await db.entries.remove(entry.id);
        toast('قاب پاک شد', { type: 'success' });
        bus.emit('entries:changed');
      },
    },
  ]);
}

export function emptyState({ iconName = 'reel', title = 'هنوز چیزی اینجا نیست', text = '', action = '' }) {
  return `
  <div class="empty">
    <div class="empty__icon">${icon(iconName, 'ico--lg')}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${action}
  </div>`;
}

export function skeletonCards(n = 4) {
  return `<div class="frames stagger">${Array.from({ length: n }).map(() => `
    <div class="frame-card" style="pointer-events:none">
      <div class="frame-card__media skeleton"></div>
      <div class="frame-card__body">
        <div class="skeleton" style="height:10px;width:38%"></div>
        <div class="skeleton" style="height:15px;width:72%;margin-top:6px"></div>
        <div class="skeleton" style="height:10px;width:100%;margin-top:8px"></div>
        <div class="skeleton" style="height:10px;width:84%;margin-top:5px"></div>
      </div>
    </div>`).join('')}</div>`;
}

export function statTile(label, value, hint = '', sparkId = '') {
  return `
  <div class="stat">
    <span class="stat__label">${esc(label)}</span>
    <span class="stat__value">${value}</span>
    ${hint ? `<span class="stat__hint">${esc(hint)}</span>` : ''}
    ${sparkId ? `<canvas class="stat__spark" id="${sparkId}" width="90" height="34" style="width:90px;height:34px"></canvas>` : ''}
  </div>`;
}

export function relativeStamp(entry) {
  return relTime(entry.updated_at || entry.created_at);
}

export function photosLabel(n) {
  return n ? plural(n, 'عکس') : 'بدون عکس';
}

export function sectionHead(title, sub = '', right = '') {
  return `<div class="section__head">
    <h2>${esc(title)}</h2>
    ${sub ? `<p>${esc(sub)}</p>` : ''}
    <div class="spacer"></div>
    ${right}
  </div>`;
}
