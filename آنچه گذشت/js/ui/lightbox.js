/* نمایشگر تمام‌صفحهٔ عکس با پیمایش کلیدی. */
import { esc, icon } from '../lib/dom.js';
import { fa, fmtDate } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { downloadBlob } from '../lib/images.js';
import { toast } from '../lib/ui.js';

let layer = null;
let index = 0;
let items = [];

export function openLightbox(photos, start = 0) {
  items = photos.filter((p) => p.src);
  if (!items.length) { toast('عکسی برای نمایش نیست', { type: 'info' }); return; }
  index = Math.max(0, Math.min(start, items.length - 1));
  closeLightbox();

  layer = document.createElement('div');
  layer.className = 'lightbox';
  layer.innerHTML = `
    <div class="lightbox__bar">
      <span id="lbCount">${fa(index + 1)} / ${fa(items.length)}</span>
      <span style="opacity:.5">·</span>
      <span id="lbDate" class="truncate"></span>
      <div style="margin-inline-start:auto;display:flex;gap:4px">
        <button class="icon-btn" data-act="download" title="ذخیره">${icon('download')}</button>
        <button class="icon-btn" data-act="frame" title="باز کردن قاب">${icon('reel')}</button>
        <button class="icon-btn" data-act="close" title="بستن (Esc)">${icon('close')}</button>
      </div>
    </div>
    <div class="lightbox__stage">
      <button class="lightbox__nav lightbox__nav--prev" data-act="prev" aria-label="قبلی">${icon('chevron-right', 'ico--lg')}</button>
      <img class="lightbox__img" id="lbImg" alt="" />
      <button class="lightbox__nav lightbox__nav--next" data-act="next" aria-label="بعدی">${icon('chevron-left', 'ico--lg')}</button>
    </div>
    <div class="lightbox__foot">
      <div class="grow">
        <p class="lightbox__cap" id="lbCap"></p>
        <p class="lightbox__meta" id="lbMeta"></p>
      </div>
      <button class="btn btn--sm" data-act="frame2" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.16);color:#f2ede4">${icon('reel')}باز کردن قاب</button>
    </div>`;

  document.body.appendChild(layer);
  document.body.style.overflow = 'hidden';
  paint();

  layer.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) { if (e.target === layer || e.target.classList.contains('lightbox__stage')) closeLightbox(); return; }
    if (act === 'close') closeLightbox();
    if (act === 'prev') step(-1);
    if (act === 'next') step(1);
    if (act === 'download') download();
    if (act === 'frame' || act === 'frame2') {
      const item = items[index];
      closeLightbox();
      navigate(`/frame/${item.entryId}`);
    }
  });

  document.addEventListener('keydown', onKey, true);
}

function paint() {
  const item = items[index];
  const img = document.getElementById('lbImg');
  img.src = item.src;
  img.alt = item.caption || '';
  document.getElementById('lbCount').textContent = `${fa(index + 1)} / ${fa(items.length)}`;
  document.getElementById('lbDate').textContent = fmtDate(item.date, 'long');
  document.getElementById('lbCap').textContent = item.caption || '';
  document.getElementById('lbMeta').textContent = [item.title, item.location].filter(Boolean).join(' · ');
  document.querySelector('.lightbox__nav--prev').style.visibility = items.length > 1 ? 'visible' : 'hidden';
  document.querySelector('.lightbox__nav--next').style.visibility = items.length > 1 ? 'visible' : 'hidden';
}

function step(dir) {
  index = (index + dir + items.length) % items.length;
  paint();
}

async function download() {
  const item = items[index];
  try {
    const res = await fetch(item.src);
    const blob = await res.blob();
    downloadBlob(blob, `${(item.title || 'reel').replace(/[^\w-]+/g, '-').toLowerCase()}-${index + 1}.webp`);
    toast('عکس ذخیره شد', { type: 'success' });
  } catch {
    window.open(item.src, '_blank', 'noopener');
  }
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); step(-1); }
  if (e.key === 'd') download();
}

export function closeLightbox() {
  if (!layer) return;
  layer.remove();
  layer = null;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKey, true);
}
