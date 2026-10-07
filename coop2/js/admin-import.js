import { requireAuth } from './js_auth.js';
import { renderLayout } from './js_layout.js';
import { parseExcel } from './js_excel-parser.js';
import { compareWithDatabase, applyChanges } from './js_importer.js';
import { $, el, faNum, formatMoney, setBtnLoading, showMsg, escapeHtml } from './js_utils.js';
import { formatJalali } from './js_jalali.js';

const user = requireAuth();
if (user) renderLayout();

const state = {
  parsed: null,
  report: null,
  activeTab: 'members'
};

const stepUpload = $('#stepUpload');
const stepPreview = $('#stepPreview');
const stepResult = $('#stepResult');
stepUpload.dataset.step = '1';
stepPreview.dataset.step = '2';
stepResult.dataset.step = '3';

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const uploadMsg = $('#uploadMsg');
const previewBadge = $('#previewBadge');
const diffSummary = $('#diffSummary');
const diffPanels = $('#diffPanels');
const applyBtn = $('#applyImport');
const cancelBtn = $('#cancelImport');
const applyMsg = $('#applyMsg');
const resultBody = $('#resultBody');

/* ---------- Dropzone ---------- */
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
['dragenter', 'dragover'].forEach(ev => {
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('is-drag'); });
});
['dragleave', 'drop'].forEach(ev => {
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('is-drag'); });
});
dropzone.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files?.[0];
  if (f) handleFile(f);
});
fileInput.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) handleFile(f);
});

/* ---------- Tabs ---------- */
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  state.activeTab = tab.dataset.tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.panel === state.activeTab);
  });
});

/* ---------- Expand row ---------- */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.row-expand-btn');
  if (!btn) return;
  const row = btn.closest('tr');
  const detail = row.nextElementSibling;
  if (!detail || !detail.classList.contains('diff-detail-row')) return;
  const isOpen = !detail.hidden;
  detail.hidden = isOpen;
  btn.textContent = isOpen ? 'مشاهده جزئیات' : 'بستن جزئیات';
});

/* ---------- Handlers ---------- */
async function handleFile(file) {
  showMsg(uploadMsg, '');
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    showMsg(uploadMsg, 'فقط فایل‌های xlsx یا xls پذیرفته می‌شوند.', 'error');
    return;
  }
  try {
    showMsg(uploadMsg, 'در حال خواندن فایل…', 'warn');
    const parsed = await parseExcel(file);
    if (!parsed.members.length && !parsed.payments.length && !parsed.obligations.length) {
      showMsg(uploadMsg, 'هیچ داده‌ای در فایل یافت نشد. نام شیت‌ها و هدرها را بررسی کنید.', 'error');
      return;
    }
    state.parsed = parsed;
    showMsg(uploadMsg, `فایل خوانده شد — ${faNum(parsed.members.length)} عضو، ${faNum(parsed.payments.length)} پرداخت، ${faNum(parsed.obligations.length)} تعهد.`, 'ok');

    showMsg(uploadMsg, 'در حال مقایسه با دیتابیس…', 'warn');
    const report = await compareWithDatabase(parsed);
    state.report = report;

    stepUpload.hidden = false;
    stepPreview.hidden = false;
    stepResult.hidden = true;
    renderReport(report);
    previewBadge.textContent = 'تحلیل کامل شد';
    setTimeout(() => stepPreview.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  } catch (err) {
    console.error(err);
    showMsg(uploadMsg, 'خطا در پردازش فایل: ' + (err.message || err), 'error');
  }
}

function renderReport(report) {
  // Summary
  diffSummary.innerHTML = '';
  const cards = [
    { key: 'new',     label: 'رکورد جدید',         count: report.members.new.length + report.payments.new.length + report.obligations.new.length },
    { key: 'changed', label: 'رکورد تغییر یافته',  count: report.members.changed.length },
    { key: 'missing', label: 'غایب در اکسل',        count: report.members.missing.length },
    { key: 'error',   label: 'خطا / نیاز به اصلاح', count:
      report.members.errors.length + report.payments.errors.length + report.obligations.errors.length +
      report.payments.duplicates.length + report.obligations.duplicates.length }
  ];
  cards.forEach(c => {
    diffSummary.appendChild(el('div', { class: 'diff-card ' + c.key },
      el('span', { class: 'label' }, c.label),
      el('span', { class: 'value' }, faNum(c.count))
    ));
  });

  // Panels
  diffPanels.innerHTML = '';
  diffPanels.appendChild(panelMembers(report.members));
  diffPanels.appendChild(panelPayments(report.payments));
  diffPanels.appendChild(panelObligations(report.obligations));

  // Active tab
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === state.activeTab));
}

function panelShell(name, active, content) {
  return el('div', { class: 'tab-panel' + (active ? ' active' : ''), 'data-panel': name }, content);
}

function section(title, emptyText, node) {
  return el('div', { style: 'margin-bottom:1.25rem' },
    el('h3', { style: 'font-size:1rem;margin:.25rem 0 .6rem' }, title),
    node || el('div', { class: 'muted', style: 'font-size:.9rem' }, emptyText)
  );
}

/* ---------- Members panel ---------- */
function panelMembers(rep) {
  const wrap = el('div', {});

  // new
  wrap.appendChild(section(`اعضای جدید (${faNum(rep.new.length)})`, 'موردی نیست.', rep.new.length ? tableMembersNew(rep.new) : null));
  // changed
  wrap.appendChild(section(`اعضای تغییر یافته (${faNum(rep.changed.length)})`, 'موردی نیست.', rep.changed.length ? tableMembersChanged(rep.changed) : null));
  // missing
  wrap.appendChild(section(`در دیتابیس موجود ولی در اکسل غایب (${faNum(rep.missing.length)})`, 'موردی نیست.', rep.missing.length ? tableMembersMissing(rep.missing) : null));
  // errors
  wrap.appendChild(section(`خطاها (${faNum(rep.errors.length)})`, 'موردی نیست.', rep.errors.length ? tableErrors(rep.errors, ['first_name','last_name','national_id']) : null));

  return panelShell('members', state.activeTab === 'members', wrap);
}

function tableMembersNew(rows) {
  const tbl = el('table', { class: 'table diff-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'ردیف'), el('th', {}, 'نام'), el('th', {}, 'نام خانوادگی'),
      el('th', {}, 'کد ملی'), el('th', {}, 'موبایل'), el('th', {}, 'تعاونی'),
      el('th', {}, 'وضعیت'), el('th', {}, 'امتیاز')
    )),
    el('tbody', {}, ...rows.map(x => el('tr', { class: 'row-new' },
      el('td', { class: 'num' }, faNum(x.sourceRow)),
      el('td', {}, x.row.first_name || '—'),
      el('td', {}, x.row.last_name || '—'),
      el('td', { class: 'num' }, faNum(x.row.national_id)),
      el('td', { class: 'num' }, faNum(x.row.mobile || '—')),
      el('td', { class: 'num' }, faNum(x.row.cooperative)),
      el('td', {}, x.row.membership_status || '—'),
      el('td', { class: 'num' }, faNum(x.row.score))
    )))
  );
  return el('div', { class: 'table-wrap' }, tbl);
}

function tableMembersChanged(rows) {
  const tbody = el('tbody', {});
  rows.forEach(x => {
    const id = 'mem-' + x.before.id;
    const mainRow = el('tr', { class: 'row-changed' },
      el('td', { class: 'num' }, faNum(x.sourceRow)),
      el('td', {}, x.after.first_name || x.before.first_name || '—'),
      el('td', {}, x.after.last_name || x.before.last_name || '—'),
      el('td', { class: 'num' }, faNum(x.after.national_id)),
      el('td', { class: 'num' }, faNum(x.diffs.length) + ' تغییر'),
      el('td', {}, el('button', { class: 'row-expand-btn', type: 'button' }, 'مشاهده جزئیات'))
    );
    const detailRow = el('tr', { class: 'diff-detail-row', hidden: true },
      el('td', { colspan: 6 },
        el('div', { class: 'diff-detail-inner' },
          el('div', { class: 'diff-details' },
            ...x.diffs.map(d => el('div', { class: 'diff-line' },
              el('span', { class: 'k' }, d.label + ':'),
              el('span', { class: 'before' }, displayVal(d.field, d.before)),
              el('span', { class: 'arrow' }, '←'),
              el('span', { class: 'after' }, displayVal(d.field, d.after))
            ))
          )
        )
      )
    );
    tbody.appendChild(mainRow);
    tbody.appendChild(detailRow);
  });

  const tbl = el('table', { class: 'table diff-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'ردیف'), el('th', {}, 'نام'), el('th', {}, 'نام خانوادگی'),
      el('th', {}, 'کد ملی'), el('th', {}, 'تغییرات'), el('th', {}, '')
    )),
    tbody
  );
  return el('div', { class: 'table-wrap' }, tbl);
}

function tableMembersMissing(rows) {
  const tbl = el('table', { class: 'table diff-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'نام'), el('th', {}, 'نام خانوادگی'),
      el('th', {}, 'کد ملی'), el('th', {}, 'وضعیت'), el('th', {}, 'امتیاز')
    )),
    el('tbody', {}, ...rows.map(m => el('tr', { class: 'row-missing' },
      el('td', {}, m.first_name || '—'),
      el('td', {}, m.last_name || '—'),
      el('td', { class: 'num' }, faNum(m.national_id)),
      el('td', {}, m.membership_status || '—'),
      el('td', { class: 'num' }, faNum(m.score))
    )))
  );
  return el('div', { class: 'table-wrap' }, tbl);
}

/* ---------- Payments panel ---------- */
function panelPayments(rep) {
  const wrap = el('div', {});
  wrap.appendChild(section(`پرداخت‌های جدید (${faNum(rep.new.length)})`, 'موردی نیست.', rep.new.length ? tablePaymentsNew(rep.new) : null));
  wrap.appendChild(section(`تکراری‌ها (${faNum(rep.duplicates.length)})`, 'موردی نیست.', rep.duplicates.length ? tablePaymentsDup(rep.duplicates) : null));
  wrap.appendChild(section(`خطاها (${faNum(rep.errors.length)})`, 'موردی نیست.', rep.errors.length ? tableErrors(rep.errors, ['national_id','amount','payment_date']) : null));
  return panelShell('payments', state.activeTab === 'payments', wrap);
}

function tablePaymentsNew(rows) {
  const tbl = el('table', { class: 'table diff-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'), el('th', {}, 'کد ملی'), el('th', {}, 'مبلغ'),
      el('th', {}, 'تاریخ واریز'), el('th', {}, 'توضیحات')
    )),
    el('tbody', {}, ...rows.map((p, i) => el('tr', { class: 'row-new' },
      el('td', { class: 'num' }, faNum(i + 1)),
      el('td', { class: 'num' }, faNum(p.national_id)),
      el('td', { class: 'num' }, formatMoney(p.amount)),
      el('td', {}, formatJalali(p.payment_date, { long: true })),
      el('td', {}, p.description || '—')
    )))
  );
  return el('div', { class: 'table-wrap' }, tbl);
}

function tablePaymentsDup(rows) {
  const tbl = el('table', { class: 'table diff-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'), el('th', {}, 'کد ملی'), el('th', {}, 'مبلغ'),
      el('th', {}, 'تاریخ'), el('th', {}, 'وضعیت')
    )),
    el('tbody', {}, ...rows.map((p, i) => el('tr', { class: 'row-error' },
      el('td', { class: 'num' }, faNum(i + 1)),
      el('td', { class: 'num' }, faNum(p.national_id)),
      el('td', { class: 'num' }, formatMoney(p.amount)),
      el('td', {}, formatJalali(p.payment_date, { long: true })),
      el('td', {}, el('span', { class: 'status-chip error' }, 'تکراری — نادیده گرفته می‌شود'))
    )))
  );
  return el('div', { class: 'table-wrap' }, tbl);
}

/* ---------- Obligations panel ---------- */
function panelObligations(rep) {
  const wrap = el('div', {});
  wrap.appendChild(section(`تعهدات جدید (${faNum(rep.new.length)})`, 'موردی نیست.', rep.new.length ? tableOblNew(rep.new) : null));
  wrap.appendChild(section(`تکراری‌ها (${faNum(rep.duplicates.length)})`, 'موردی نیست.', rep.duplicates.length ? tableOblDup(rep.duplicates) : null));
  wrap.appendChild(section(`خطاها (${faNum(rep.errors.length)})`, 'موردی نیست.', rep.errors.length ? tableErrors(rep.errors, ['national_id','amount','due_date']) : null));
  return panelShell('obligations', state.activeTab === 'obligations', wrap);
}

function tableOblNew(rows) {
  const tbl = el('table', { class: 'table diff-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'), el('th', {}, 'کد ملی'), el('th', {}, 'مبلغ'),
      el('th', {}, 'سررسید'), el('th', {}, 'توضیحات')
    )),
    el('tbody', {}, ...rows.map((p, i) => el('tr', { class: 'row-new' },
      el('td', { class: 'num' }, faNum(i + 1)),
      el('td', { class: 'num' }, faNum(p.national_id)),
      el('td', { class: 'num' }, formatMoney(p.amount)),
      el('td', {}, formatJalali(p.due_date, { long: true })),
      el('td', {}, p.description || '—')
    )))
  );
  return el('div', { class: 'table-wrap' }, tbl);
}

function tableOblDup(rows) {
  const tbl = el('table', { class: 'table diff-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'), el('th', {}, 'کد ملی'), el('th', {}, 'مبلغ'),
      el('th', {}, 'سررسید'), el('th', {}, 'وضعیت')
    )),
    el('tbody', {}, ...rows.map((p, i) => el('tr', { class: 'row-error' },
      el('td', { class: 'num' }, faNum(i + 1)),
      el('td', { class: 'num' }, faNum(p.national_id)),
      el('td', { class: 'num' }, formatMoney(p.amount)),
      el('td', {}, formatJalali(p.due_date, { long: true })),
      el('td', {}, el('span', { class: 'status-chip error' }, 'تکراری — نادیده گرفته می‌شود'))
    )))
  );
  return el('div', { class: 'table-wrap' }, tbl);
}

/* ---------- Errors ---------- */
function tableErrors(rows, fields) {
  const tbl = el('table', { class: 'table diff-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'ردیف'), el('th', {}, 'علت'),
      ...fields.map(f => el('th', {}, fieldLabel(f)))
    )),
    el('tbody', {}, ...rows.map(x => el('tr', { class: 'row-error' },
      el('td', { class: 'num' }, faNum(x.row)),
      el('td', {}, x.reason),
      ...fields.map(f => el('td', {}, String(x.data?.[f] ?? '—')))
    )))
  );
  return el('div', { class: 'table-wrap' }, tbl);
}

/* ---------- Helpers ---------- */
function fieldLabel(f) {
  const labels = {
    first_name: 'نام', last_name: 'نام خانوادگی', national_id: 'کد ملی',
    mobile: 'موبایل', email: 'ایمیل', password_initial: 'پسورد',
    parent_company: 'شرکت مادر', membership_status: 'وضعیت',
    cooperative: 'تعاونی', total_paid: 'جمع پرداختی', debt: 'بدهی', score: 'امتیاز',
    amount: 'مبلغ', payment_date: 'تاریخ', due_date: 'سررسید', description: 'توضیحات'
  };
  return labels[f] || f;
}

function displayVal(field, v) {
  if (v == null || v === '') return '—';
  if (field === 'total_paid' || field === 'debt' || field === 'amount') return formatMoney(v);
  return String(v);
}

/* ---------- Cancel / Apply ---------- */
cancelBtn.addEventListener('click', () => {
  state.parsed = null;
  state.report = null;
  stepPreview.hidden = true;
  stepResult.hidden = true;
  fileInput.value = '';
  showMsg(uploadMsg, 'عملیات لغو شد.', 'warn');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

applyBtn.addEventListener('click', async () => {
  if (!state.report) return;
  showMsg(applyMsg, '');
  setBtnLoading(applyBtn, true);
  try {
    const res = await applyChanges(state.report);
    renderResult(res);
    stepResult.hidden = false;
    setTimeout(() => stepResult.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    showMsg(applyMsg, 'عملیات با موفقیت انجام شد.', 'ok');
  } catch (err) {
    console.error(err);
    showMsg(applyMsg, 'خطا در اعمال تغییرات: ' + (err.message || err), 'error');
  } finally {
    setBtnLoading(applyBtn, false);
  }
});

function renderResult(res) {
  resultBody.innerHTML = '';
  const ok = (res.errors || []).length === 0;

  const box = el('div', { class: 'result-box ' + (ok ? 'ok' : 'error') },
    el('h3', {}, ok ? '✅ همه تغییرات با موفقیت اعمال شد' : '⚠️ عملیات با خطا مواجه شد'),
    el('ul', { class: 'result-list' },
      el('li', {}, `اعضای جدید: ${faNum(res.members?.inserted || 0)}`),
      el('li', {}, `اعضای بروزرسانی‌شده: ${faNum(res.members?.updated || 0)}`),
      el('li', {}, `پرداخت‌های جدید: ${faNum(res.payments?.inserted || 0)}`),
      el('li', {}, `تعهدات جدید: ${faNum(res.obligations?.inserted || 0)}`)
    )
  );
  resultBody.appendChild(box);

  if ((res.errors || []).length) {
    resultBody.appendChild(el('div', { class: 'result-box error' },
      el('h3', {}, 'خطاها'),
      el('ul', { class: 'result-list' },
        ...res.errors.map(e => el('li', {}, `${e.section}: ${escapeHtml(e.message)}`))
      )
    ));
  }

  resultBody.appendChild(el('div', { style: 'margin-top:1rem' },
    el('button', { class: 'btn btn-ghost', onclick: () => location.reload() }, 'شروع مجدد')
  ));
}