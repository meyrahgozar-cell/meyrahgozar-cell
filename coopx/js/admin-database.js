import { requireAdmin } from './auth.js';
import { renderLayout } from './layout.js';
import {
  fetchAllMembersAdmin, fetchAllPayments, fetchAllObligations,
  fetchAllSuggestions, updateRow, insertRow, deleteRow, logAudit
} from './supabase-client.js';
import { $, el, faNum, setBtnLoading, showMsg, toISODate } from './utils.js';
import { formatJalali } from './jalali.js';
import { parseExcel } from './excel-parser.js';
import { exportRows } from './excel-export.js';
import {
  diffRows, MEMBER_FIELDS, PAYMENT_FIELDS, OBLIGATION_FIELDS,
  SUGGESTION_FIELDS, FIELD_LABELS
} from './importer.js';

const user = requireAdmin();
if (user) renderLayout();

/* ---------- Schema per table ---------- */
const SCHEMA = {
  members: {
    label: 'اعضا',
    key: 'id',
    pk: 'id',
    columns: [
      { key: 'id', label: 'شناسه', readOnly: true, hideInTable: true },
      { key: 'first_name', label: 'نام' },
      { key: 'last_name', label: 'نام خانوادگی' },
      { key: 'national_id', label: 'کد ملی' },
      { key: 'mobile', label: 'موبایل' },
      { key: 'email', label: 'ایمیل' },
      { key: 'password_initial', label: 'پسورد' },
      { key: 'parent_company', label: 'شرکت مادر' },
      { key: 'membership_status', label: 'وضعیت' },
      { key: 'cooperative', label: 'تعاونی', type: 'number' },
      { key: 'total_paid', label: 'جمع پرداختی', type: 'number' },
      { key: 'debt', label: 'بدهی', type: 'number' },
      { key: 'score', label: 'امتیاز', type: 'number' },
      { key: 'role', label: 'نقش', type: 'select', options: ['member', 'admin', 'superadmin'], hideInTable: false }
    ],
    compareFields: MEMBER_FIELDS,
    excelKey: 'national_id',
    excelKeyAlias: 'national_id'
  },
  payments: {
    label: 'پرداخت‌ها',
    key: 'id',
    pk: 'id',
    columns: [
      { key: 'id', label: 'شناسه', readOnly: true, hideInTable: true },
      { key: 'member_id', label: 'عضو', type: 'number' },
      { key: 'amount', label: 'مبلغ', type: 'number' },
      { key: 'payment_date', label: 'تاریخ واریز', type: 'date' },
      { key: 'description', label: 'توضیحات' }
    ],
    compareFields: PAYMENT_FIELDS,
    excelKey: 'national_id',
    excelKeyAlias: 'national_id'
  },
  obligations: {
    label: 'تعهدات',
    key: 'id',
    pk: 'id',
    columns: [
      { key: 'id', label: 'شناسه', readOnly: true, hideInTable: true },
      { key: 'member_id', label: 'عضو', type: 'number' },
      { key: 'amount', label: 'مبلغ', type: 'number' },
      { key: 'due_date', label: 'سررسید', type: 'date' },
      { key: 'description', label: 'توضیحات' }
    ],
    compareFields: OBLIGATION_FIELDS,
    excelKey: 'national_id',
    excelKeyAlias: 'national_id'
  },
  suggestions: {
    label: 'پیشنهادات',
    key: 'id',
    pk: 'id',
    columns: [
      { key: 'id', label: 'شناسه', readOnly: true, hideInTable: true },
      { key: 'member_id', label: 'عضو', type: 'number' },
      { key: 'full_name', label: 'نام کامل' },
      { key: 'content', label: 'متن' },
      { key: 'created_at', label: 'زمان', readOnly: true, hideInTable: true }
    ],
    compareFields: SUGGESTION_FIELDS,
    excelKey: 'id',
    excelKeyAlias: 'id'
  }
};

const state = {
  table: 'members',
  rows: [],
  filter: '',
  editing: null,      // {mode:'edit'|'create', row, id}
  pendingImport: null // { rows, report }
};

const tabsEl        = $('#tableTabs');
const wrapEl        = $('#dbTableWrap');
const countEl       = $('#dbCount');
const msgEl         = $('#dbMsg');
const searchEl      = $('#dbSearch');
const reloadBtn     = $('#btnReload');
const exportBtn     = $('#btnExport');
const importBtn     = $('#btnImport');
const newBtn        = $('#btnNew');
const fileInput     = $('#dbFileInput');
const previewPanel  = $('#previewPanel');
const previewBadge  = $('#previewBadge');
const diffSummary   = $('#diffSummary');
const diffDetail    = $('#diffDetail');
const cancelBtn     = $('#cancelImport');
const applyBtn      = $('#applyImport');
const applyMsg      = $('#applyMsg');

const modal         = $('#dbModal');
const modalTitle    = $('#modalTitle');
const modalForm     = $('#modalForm');
const modalSave     = $('#modalSave');

/* ---------- Tabs ---------- */
tabsEl.addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  state.table = t.dataset.table;
  tabsEl.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  state.filter = '';
  if (searchEl) searchEl.value = '';
  load().catch(console.error);
});

/* ---------- Search ---------- */
let searchTO;
searchEl?.addEventListener('input', () => {
  clearTimeout(searchTO);
  searchTO = setTimeout(() => { state.filter = searchEl.value.trim(); render(); }, 140);
});

reloadBtn?.addEventListener('click', () => load().catch(console.error));

/* ---------- Load & render ---------- */
async function load() {
  showMsg(msgEl, '');
  wrapEl.innerHTML = '<div style="padding:1.5rem;text-align:center" class="muted">در حال بارگذاری…</div>';
  let rows;
  try {
    if (state.table === 'members') rows = await fetchAllMembersAdmin();
    else if (state.table === 'payments') rows = await fetchAllPayments();
    else if (state.table === 'obligations') rows = await fetchAllObligations();
    else rows = await fetchAllSuggestions();
  } catch (err) {
    showMsg(msgEl, 'خطا در بارگذاری: ' + err.message, 'error');
    return;
  }
  state.rows = rows;
  render();
}

function render() {
  const schema = SCHEMA[state.table];
  const cols = schema.columns;
  const q = state.filter.toLowerCase();
  const rows = q
    ? state.rows.filter(r => cols.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)))
    : state.rows;

  if (!rows.length) {
    wrapEl.innerHTML = '<div style="padding:1.5rem;text-align:center" class="muted">ردیفی برای نمایش نیست.</div>';
    countEl.textContent = '';
    return;
  }

  const table = el('table', { class: 'db-table' });
  const thead = el('thead');
  const trh = el('tr');
  cols.forEach(c => trh.appendChild(el('th', {}, c.label)));
  trh.appendChild(el('th', { style: 'width:100px' }, ''));
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = el('tbody');
  rows.forEach(r => {
    const tr = el('tr', { 'data-id': r[schema.pk] });
    cols.forEach(c => {
      let v = r[c.key];
      if (c.key === 'role') {
        const cls = v === 'superadmin' ? 'is-super' : v === 'admin' ? 'is-admin' : '';
        tr.appendChild(el('td', {}, el('span', { class: 'role-chip ' + cls },
          v === 'superadmin' ? 'مدیر ارشد' : v === 'admin' ? 'مدیر' : 'عضو'
        )));
        return;
      }
      if (c.type === 'date' || (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) && c.key.endsWith('_date'))) {
        v = formatJalali(v, { long: true });
      } else if (v == null || v === '') {
        v = '—';
      } else if (c.type === 'number' && (c.key === 'amount' || c.key === 'total_paid' || c.key === 'debt')) {
        v = faNum(Number(v).toLocaleString('en-US'));
      } else {
        v = String(v);
      }
      tr.appendChild(el('td', { title: String(r[c.key] ?? '') }, v));
    });

    const actions = el('td', { class: 'cell-actions' });
    actions.appendChild(el('button', {
      class: 'icon-btn is-sm', type: 'button', title: 'ویرایش',
      onclick: (e) => { e.stopPropagation(); openEdit(r); }
    }, el('i', { class: 'i i-edit' })));
    actions.appendChild(el('button', {
      class: 'icon-btn is-sm is-danger', type: 'button', title: 'حذف',
      onclick: (e) => { e.stopPropagation(); removeRow(r); }
    }, el('i', { class: 'i i-trash' })));
    tr.appendChild(actions);

    tr.addEventListener('click', () => openEdit(r));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapEl.innerHTML = '';
  wrapEl.appendChild(table);
  countEl.textContent = `${faNum(rows.length)} ردیف`;
}

/* ---------- Modal ---------- */
function openEdit(row) {
  state.editing = { mode: 'edit', id: row[SCHEMA[state.table].pk], row };
  buildForm(row);
}
function openCreate() {
  state.editing = { mode: 'create' };
  buildForm({});
}
function buildForm(row) {
  const schema = SCHEMA[state.table];
  modalTitle.textContent = state.editing.mode === 'create'
    ? `افزودن به ${schema.label}`
    : `ویرایش ${schema.label}`;
  modalForm.innerHTML = '';
  const grid = el('div', { class: 'field-grid' });
  schema.columns.forEach(c => {
    if (c.key === 'id' && state.editing.mode === 'create') return;
    const wrap = el('label', { class: 'field' + (c.key === 'description' || c.key === 'content' ? ' field-full' : '') });
    wrap.appendChild(el('span', {}, c.label));
    let input;
    if (c.type === 'select') {
      input = el('select', { name: c.key });
      c.options.forEach(o => input.appendChild(el('option', { value: o }, o)));
    } else if (c.key === 'description' || c.key === 'content') {
      input = el('textarea', { name: c.key, rows: 3 });
    } else {
      input = el('input', {
        type: c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text',
        name: c.key
      });
    }
    if (c.readOnly || (c.key === 'id' && state.editing.mode === 'edit')) input.disabled = true;
    input.value = row[c.key] ?? '';
    wrap.appendChild(input);
    grid.appendChild(wrap);
  });
  modalForm.appendChild(grid);
  modal.hidden = false;
}

function closeModal() { modal.hidden = true; state.editing = null; }

document.querySelectorAll('[data-close]').forEach(n => n.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

modalSave.addEventListener('click', async () => {
  if (!state.editing) return;
  const schema = SCHEMA[state.table];
  const patch = {};
  schema.columns.forEach(c => {
    if (c.readOnly) return;
    const input = modalForm.querySelector(`[name="${c.key}"]`);
    if (!input || input.disabled) return;
    let v = input.value.trim();
    if (v === '') v = null;
    else if (c.type === 'number') v = Number(v);
    patch[c.key] = v;
  });

  setBtnLoading(modalSave, true);
  try {
    if (state.editing.mode === 'edit') {
      await updateRow(state.table, state.editing.id, patch);
      await logAudit({
        actor_id: user.id, actor_name: `${user.first_name} ${user.last_name}`,
        action: 'update', target_table: state.table,
        details: { id: state.editing.id, patch }
      });
      showMsg(msgEl, 'ردیف بروزرسانی شد.', 'ok');
    } else {
      const created = await insertRow(state.table, patch);
      await logAudit({
        actor_id: user.id, actor_name: `${user.first_name} ${user.last_name}`,
        action: 'create', target_table: state.table, details: { patch }
      });
      showMsg(msgEl, 'ردیف جدید ثبت شد.', 'ok');
    }
    closeModal();
    await load();
  } catch (err) {
    showMsg(msgEl, 'خطا: ' + err.message, 'error');
  } finally {
    setBtnLoading(modalSave, false);
  }
});

/* ---------- Delete ---------- */
async function removeRow(row) {
  const schema = SCHEMA[state.table];
  const id = row[schema.pk];
  if (!confirm('این ردیف حذف شود؟ عملیات بازگشت‌پذیر نیست.')) return;
  try {
    await deleteRow(state.table, id);
    await logAudit({
      actor_id: user.id, actor_name: `${user.first_name} ${user.last_name}`,
      action: 'delete', target_table: state.table, details: { id }
    });
    showMsg(msgEl, 'ردیف حذف شد.', 'ok');
    await load();
  } catch (err) {
    showMsg(msgEl, 'خطا در حذف: ' + err.message, 'error');
  }
}

/* ---------- Create new ---------- */
newBtn.addEventListener('click', openCreate);

/* ---------- Export ---------- */
exportBtn.addEventListener('click', () => {
  const schema = SCHEMA[state.table];
  const cols = schema.columns
    .filter(c => c.key !== 'id')
    .map(c => ({
      key: c.key,
      label: c.label,
      width: c.type === 'number' ? 16 : c.key === 'content' ? 40 : 20
    }));
  try {
    exportRows(state.rows, cols, {
      filename: `${state.table}-${new Date().toISOString().slice(0,10)}.xlsx`,
      sheetName: schema.label
    });
  } catch (err) {
    showMsg(msgEl, 'خطا در خروجی: ' + err.message, 'error');
  }
});

/* ---------- Import from Excel (with diff) ---------- */
importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (f) await handleImport(f);
  fileInput.value = '';
});

async function handleImport(file) {
  showMsg(msgEl, 'در حال خواندن فایل…', 'warn');
  try {
    const parsed = await parseExcel(file);
    const key = state.table;
    let excelRows = parsed[key] || [];
    if (!excelRows.length) {
      showMsg(msgEl, `شیت «${SCHEMA[key].label}» در فایل پیدا نشد.`, 'error');
      return;
    }

    // For payments / obligations, resolve national_id -> member_id
    if (key === 'payments' || key === 'obligations') {
      const members = await fetchAllMembersAdmin();
      const byNat = new Map(members.map(m => [m.national_id, m.id]));
      excelRows = excelRows.map(r => ({ ...r, member_id: byNat.get(r.national_id) || null }))
                           .filter(r => r.member_id);
    }

    // members: keep national_id as key; suggestions: not applicable (no key column) -> skip diff
    let report;
    if (key === 'suggestions') {
      report = { new: excelRows.map((r,i)=>({ sourceRow: i+2, row: r })), changed: [], missing: [], errors: [], duplicates: [] };
    } else {
      const schema = SCHEMA[key];
      const compareFields = schema.compareFields.filter(f => f !== 'id');
      const keyField = key === 'members' ? 'national_id' : 'id';
      const mapExcelKey = (row) => key === 'members'
        ? row.national_id
        : `${row.member_id}|${row[schema.excelKeyAlias] ?? row.amount}`;
      const dbKey = (row) => key === 'members'
        ? row.national_id
        : `${row.member_id}|${row[schema.excelKeyAlias] ?? row.amount}`;

      report = diffRows(
        state.rows.map(r => key === 'members' ? r : { ...r, _ck: dbKey(r) }),
        excelRows,
        key === 'members' ? 'national_id' : '_ck',
        compareFields,
        key === 'members' ? null : (row) => `${row.member_id}|${row[schema.excelKeyAlias] ?? row.amount}`
      );
    }

    state.pendingImport = { rows: excelRows, report };
    renderImportPreview();
    previewPanel.hidden = false;
    previewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showMsg(msgEl, '', '');
  } catch (err) {
    showMsg(msgEl, 'خطا در پردازش فایل: ' + err.message, 'error');
  }
}

function renderImportPreview() {
  const { report } = state.pendingImport;
  previewBadge.textContent = 'آماده اعمال';
  diffSummary.innerHTML = '';
  [
    { key: 'new', label: 'رکورد جدید', count: report.new.length },
    { key: 'changed', label: 'تغییر یافته', count: report.changed.length },
    { key: 'missing', label: 'غایب در اکسل', count: report.missing.length },
    { key: 'error', label: 'خطا / تکراری', count: (report.errors?.length || 0) + (report.duplicates?.length || 0) }
  ].forEach(c => {
    diffSummary.appendChild(el('div', { class: 'diff-card ' + c.key },
      el('span', { class: 'label' }, c.label),
      el('span', { class: 'value' }, faNum(c.count))
    ));
  });

  diffDetail.innerHTML = '';
  if (report.changed.length) {
    const tbody = el('tbody');
    report.changed.forEach(x => {
      const tr = el('tr', { class: 'row-changed' },
        el('td', { class: 'num' }, faNum(x.sourceRow)),
        el('td', { class: 'num' }, faNum(x.before.id ?? x.before.national_id ?? '—')),
        el('td', {}, faNum(x.diffs.length) + ' تغییر')
      );
      const det = el('tr', { class: 'diff-detail-row' },
        el('td', { colspan: 3 },
          el('div', { class: 'diff-detail-inner' },
            el('div', { class: 'diff-details' },
              ...x.diffs.map(d => el('div', { class: 'diff-line' },
                el('span', { class: 'k' }, (FIELD_LABELS[d.field] || d.field) + ':'),
                el('span', { class: 'before' }, String(d.before ?? '—')),
                el('span', { class: 'arrow' }, '←'),
                el('span', { class: 'after' }, String(d.after ?? '—'))
              ))
            )
          )
        )
      );
      tbody.appendChild(tr);
      tbody.appendChild(det);
    });
    diffDetail.appendChild(el('div', { class: 'table-wrap' },
      el('table', { class: 'table diff-table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'ردیف اکسل'), el('th', {}, 'شناسه'), el('th', {}, 'تفاوت‌ها')
        )),
        tbody
      )
    ));
  } else {
    diffDetail.appendChild(el('div', { class: 'muted tiny' }, 'موردی برای نمایش در بخش تغییرات نیست.'));
  }
}

cancelBtn.addEventListener('click', () => {
  state.pendingImport = null;
  previewPanel.hidden = true;
  showMsg(msgEl, 'عملیات لغو شد.', 'warn');
});

applyBtn.addEventListener('click', async () => {
  if (!state.pendingImport) return;
  const { report } = state.pendingImport;
  const key = state.table;
  const schema = SCHEMA[key];
  setBtnLoading(applyBtn, true);
  showMsg(applyMsg, '');
  try {
    let inserted = 0, updated = 0;

    // Inserts
    for (const item of report.new) {
      const row = cleanRow(item.row, schema);
      await insertRow(key, row);
      inserted++;
    }
    // Updates
    for (const item of report.changed) {
      const patch = cleanRow(item.after, schema, true);
      await updateRow(key, item.before[schema.pk], patch);
      updated++;
    }

    await logAudit({
      actor_id: user.id, actor_name: `${user.first_name} ${user.last_name}`,
      action: 'import', target_table: key,
      details: { inserted, updated }
    });

    showMsg(applyMsg, `اعمال شد — ${faNum(inserted)} درج، ${faNum(updated)} بروزرسانی.`, 'ok');
    state.pendingImport = null;
    setTimeout(() => { previewPanel.hidden = true; load(); }, 900);
  } catch (err) {
    showMsg(applyMsg, 'خطا در اعمال: ' + err.message, 'error');
  } finally {
    setBtnLoading(applyBtn, false);
  }
});

function cleanRow(row, schema, isPatch = false) {
  const out = {};
  schema.columns.forEach(c => {
    if (c.readOnly) return;
    if (isPatch && c.key === schema.pk) return;
    if (row[c.key] !== undefined) out[c.key] = row[c.key];
  });
  return out;
}

/* ---------- Init ---------- */
load().catch(console.error);