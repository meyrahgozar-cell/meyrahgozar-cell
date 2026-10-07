import { requireAuth } from './js_auth.js';
import { renderLayout } from './js_layout.js';
import { formatJalali } from './js_jalali.js';
import { $, el } from './js_utils.js';

requireAuth();
renderLayout();

const BASE = 'assets_pdfs_invitations_';

init().catch(err => {
  console.error(err);
  $('#pdfList').innerHTML = '<div class="pdf-item"><div class="pdf-meta"><div class="pdf-title">خطا در بارگذاری فایل‌ها</div></div></div>';
});

async function init() {
  const res = await fetch('data_invitations.json', { cache: 'no-cache' });
  const list = await res.json();
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  renderList(list);
}

function renderList(list) {
  const root = $('#pdfList');
  root.innerHTML = '';
  if (!list.length) {
    root.innerHTML = '<div class="pdf-item"><div class="pdf-meta"><div class="pdf-title">هنوز سندی بارگذاری نشده است.</div></div></div>';
    return;
  }
  list.forEach(item => {
    const a = el('a', { class: 'pdf-item', href: BASE + item.file, target: '_blank', rel: 'noopener' },
      el('div', { class: 'pdf-icon' }, 'PDF'),
      el('div', { class: 'pdf-meta' },
        el('div', { class: 'pdf-title' }, item.title || item.file),
        el('div', { class: 'pdf-sub' }, `تاریخ: ${formatJalali(item.date, { long: true })}`),
        item.desc ? el('div', { class: 'pdf-sub' }, item.desc) : null
      ),
      el('div', { class: 'pdf-actions' },
        el('span', { class: 'btn btn-primary btn-sm' }, 'دانلود')
      )
    );
    root.appendChild(a);
  });
}