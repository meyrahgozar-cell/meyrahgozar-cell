import { requireAdmin, getUser } from './auth.js';
import { renderLayout } from './layout.js';
import { supabase } from './supabase/client.js';
import { $, el, faNum, formatMoney, setBtnLoading, showMsg, escapeHtml } from './utils.js';
import { downloadTableTemplate } from './excel-parser.js';

const user = requireAdmin();
if (user) renderLayout();

const TABLES = {
  members: {
    label: 'اعضا',
    pk: 'id',
    columns: ['id','first_name','last_name','national_id','mobile','email','password_initial','parent_company','membership_status','cooperative','total_paid','debt','score','role','created_at'],
    editable: ['first_name','last_name','national_id','mobile','email','password_initial','parent_company','membership_status','cooperative','total_paid','debt','score','role'],
    labels: {
      id:'شناسه', first_name:'نام', last_name:'نام‌خانوادگی', national_id:'کد ملی',
      mobile:'موبایل', email:'ایمیل', password_initial:'رمز اولیه', parent_company:'شرکت مادر',
      membership_status:'وضعیت', cooperative:'تعاونی', total_paid:'جمع پرداختی', debt:'بدهی',
      score:'امتیاز', role:'نقش', created_at:'تاریخ ایجاد'
    }
  },
  payments: {
    label: 'پرداخت‌ها',
    pk: 'id',
    columns: ['id','member_id','amount','payment_date','description','created_at'],
    editable: ['member_id','amount','payment_date','description'],
    labels: {
      id:'شناسه', member_id:'شناسه عضو', amount:'مبلغ', payment_date:'تاریخ پرداخت',
      description:'توضیحات', created_at:'تاریخ ثبت'
    }
  },
  obligations: {
    label: 'تعهدات',
    pk: 'id',
    columns: ['id','member_id','amount','due_date','description','created_at'],
    editable: ['member_id','amount','due_date','description'],
    labels: {
      id:'شناسه', member_id:'شناسه عضو', amount:'مبلغ', due_date:'سررسید',
      description:'توضیحات', created_at:'تاریخ ثبت'
    }
  },
  suggestions: {
    label: 'پیشنهادات',
    pk: 'id',
    columns: ['id','member_id','full_name','content','created_at'],
    editable: ['member_id','full_name','content'],
    labels: {
      id:'شناسه', member_id:'شناسه عضو', full_name:'نام', content:'متن', created_at:'تاریخ'
    }
  },
  import_configs: {
    label: 'تنظیمات ایمپورت',
    pk: 'id',
    columns: ['id','name','table_name','mapping','options','updated_at'],
    editable: ['name','table_name','mapping','options'],
    labels: {
      id:'شناسه', name:'نام', table_name:'جدول', mapping:'نگاشت', options:'گزینه‌ها', updated_at:'به‌روزرسانی'
    }
  },
  audit_log: {
    label: 'گزارش فعالیت',
    pk: 'id',
    columns: ['id','actor_id','actor_name','action','target_table','details','created_at'],
    editable: [],
    labels: {
      id:'شناسه', actor_id:'شناسه عامل', actor_name:'نام عامل', action:'عملیات',
      target_table:'جدول', details:'جزئیات', created_at:'تاریخ'
    }
  }
};

const state = {
  table: 'members',
  rows: [],
  filtered: [],
  compareReport: null
};

const tableSelect = $('#tableSelect');
const searchInput = $('#searchInput');
const dataTable = $('#dataTable');
const rowCount = $('#rowCount');
const dbMsg = $('#dbMsg');
const btnRefresh = $('#btnRefresh');
const btnExport = $('#btnExport');
const btnAdd = $('#btnAdd');
const editModal = $('#editModal');
const editForm = $('#editForm');
const modalTitle = $('#modalTitle');
const modalMsg = $('#modalMsg');
const compareDrop = $('#compareDrop');
const compareFile = $('#compareFile');
const compareResult = $('#compareResult');
const compareActions = $('#compareActions');
const compareMsg = $('#compareMsg');
const cfgName = $('#cfgName');
const cfgCols = $('#cfgCols');
const cfgMsg = $('#cfgMsg');
const cfgList = $('#cfgList');

/* ---------- Load ---------- */
async function loadTable() {
  state.table = tableSelect.value;
  showMsg(dbMsg, 'در حال بارگذاری…', 'warn');
  try {
    const { data, error } = await supabase.from(state.table).select('*').order(TABLES[state.table].pk, { ascending: true }).limit(2000);
    if (error) throw error;
    state.rows = data || [];
    applyFilter();
    showMsg(dbMsg, '', '');
  } catch (e) {
    state.rows = [];
    applyFilter();
    showMsg(dbMsg, e.message || 'خطا در بارگذاری', 'error');
  }
  loadConfigs();
}

function applyFilter() {
  const q = (searchInput.value || '').trim().toLowerCase();
  if (!q) {
    state.filtered = state.rows;
  } else {
    state.filtered = state.rows.filter(r =>
      Object.values(r).some(v => v != null && String(v).toLowerCase().includes(q))
    );
  }
  renderTable();
}

function renderTable() {
  const meta = TABLES[state.table];
  const cols = meta.columns;
  const thead = dataTable.querySelector('thead');
  const tbody = dataTable.querySelector('tbody');

  thead.innerHTML = '';
  const hr = el('tr');
  cols.forEach(c => hr.appendChild(el('th', {}, meta.labels[c] || c)));
  if (meta.editable.length) hr.appendChild(el('th', {}, ''));
  thead.appendChild(hr);

  tbody.innerHTML = '';
  if (!state.filtered.length) {
    tbody.appendChild(el('tr', {}, el('td', { class: 'empty', colspan: cols.length + 1 }, 'داده‌ای یافت نشد')));
  } else {
    state.filtered.forEach(row => {
      const tr = el('tr');
      cols.forEach(c => {
        let val = row[c];
        if (val != null && typeof val === 'object') val = JSON.stringify(val);
        if (c === 'amount' || c === 'total_paid' || c === 'debt') val = formatMoney(val);
        else if (typeof val === 'number' && c !== 'id' && c !== 'member_id' && c !== 'cooperative' && c !== 'score') val = faNum(val);
        else if (val == null) val = '—';
        else val = String(val);
        tr.appendChild(el('td', { title: String(row[c] ?? '') }, val));
      });
      if (meta.editable.length) {
        const acts = el('td', {},
          el('div', { class: 'db-row-actions' },
            el('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'ویرایش', onclick: () => openEdit(row) },
              el('i', { class: 'i i-edit', 'aria-hidden': 'true' })
            ),
            el('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'حذف', onclick: () => deleteRow(row) },
              el('i', { class: 'i i-trash', 'aria-hidden': 'true' })
            )
          )
        );
        tr.appendChild(acts);
      }
      tbody.appendChild(tr);
    });
  }
  rowCount.textContent = faNum(state.filtered.length) + ' ردیف';
}

/* ---------- Edit / Add ---------- */
function openEdit(row) {
  const meta = TABLES[state.table];
  const isNew = !row;
  modalTitle.textContent = isNew ? 'افزودن ردیف' : 'ویرایش ردیف';
  editForm.innerHTML = '';
  editForm.dataset.pk = isNew ? '' : String(row[meta.pk]);
  showMsg(modalMsg, '');

  meta.editable.forEach(c => {
    const val = isNew ? '' : (row[c] ?? '');
    const display = typeof val === 'object' ? JSON.stringify(val) : String(val);
    editForm.appendChild(
      el('label', { class: 'field' },
        el('span', {}, meta.labels[c] || c),
        el('input', {
          type: 'text',
          name: c,
          value: display,
          autocomplete: 'off'
        })
      )
    );
  });
  editModal.hidden = false;
}

function closeModal() {
  editModal.hidden = true;
}

async function saveEdit(e) {
  e.preventDefault();
  const meta = TABLES[state.table];
  const pkVal = editForm.dataset.pk;
  const payload = {};
  meta.editable.forEach(c => {
    const input = editForm.querySelector(`[name="${c}"]`);
    if (!input) return;
    let v = input.value.trim();
    if (v === '') { payload[c] = null; return; }
    if (['amount','total_paid','debt','score','cooperative','member_id'].includes(c)) {
      const n = Number(String(v).replace(/[,٬]/g, ''));
      payload[c] = isNaN(n) ? null : n;
    } else if (c === 'mapping' || c === 'options' || c === 'details') {
      try { payload[c] = JSON.parse(v); } catch { payload[c] = v; }
    } else {
      payload[c] = v;
    }
  });

  const btn = $('#modalSave');
  setBtnLoading(btn, true);
  try {
    if (pkVal) {
      const { error } = await supabase.from(state.table).update(payload).eq(meta.pk, pkVal);
      if (error) throw error;
      await logAudit('update', state.table, { id: pkVal, ...payload });
    } else {
      const { error } = await supabase.from(state.table).insert(payload);
      if (error) throw error;
      await logAudit('insert', state.table, payload);
    }
    closeModal();
    await loadTable();
    showMsg(dbMsg, 'ذخیره شد', 'ok');
  } catch (err) {
    showMsg(modalMsg, err.message || 'خطا', 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

async function deleteRow(row) {
  const meta = TABLES[state.table];
  if (!confirm(`حذف ردیف ${row[meta.pk]}؟`)) return;
  try {
    const { error } = await supabase.from(state.table).delete().eq(meta.pk, row[meta.pk]);
    if (error) throw error;
    await logAudit('delete', state.table, { id: row[meta.pk] });
    await loadTable();
    showMsg(dbMsg, 'حذف شد', 'ok');
  } catch (e) {
    showMsg(dbMsg, e.message || 'خطا در حذف', 'error');
  }
}

/* ---------- Export Excel ---------- */
function exportExcel() {
  const meta = TABLES[state.table];
  const rows = state.filtered.length ? state.filtered : state.rows;
  if (!rows.length) {
    showMsg(dbMsg, 'داده‌ای برای خروجی نیست', 'warn');
    return;
  }
  const wsData = [meta.columns.map(c => meta.labels[c] || c)];
  rows.forEach(r => {
    wsData.push(meta.columns.map(c => {
      const v = r[c];
      if (v != null && typeof v === 'object') return JSON.stringify(v);
      return v ?? '';
    }));
  });
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, meta.label);
  XLSX.writeFile(wb, `${state.table}_${new Date().toISOString().slice(0,10)}.xlsx`);
  showMsg(dbMsg, 'فایل اکسل دانلود شد', 'ok');
}

/* ---------- Compare from Excel ---------- */
function setupCompare() {
  compareDrop.addEventListener('click', () => compareFile.click());
  compareDrop.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); compareFile.click(); }
  });
  ['dragenter','dragover'].forEach(ev => compareDrop.addEventListener(ev, e => { e.preventDefault(); compareDrop.classList.add('is-drag'); }));
  ['dragleave','drop'].forEach(ev => compareDrop.addEventListener(ev, e => { e.preventDefault(); compareDrop.classList.remove('is-drag'); }));
  compareDrop.addEventListener('drop', e => {
    const f = e.dataTransfer.files?.[0];
    if (f) handleCompareFile(f);
  });
  compareFile.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) handleCompareFile(f);
  });
}

async function handleCompareFile(file) {
  showMsg(compareMsg, 'در حال خواندن…', 'warn');
  compareResult.hidden = true;
  compareActions.hidden = true;
  state.compareReport = null;

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });
    if (!raw.length) throw new Error('شیت خالی است');

    const meta = TABLES[state.table];
    const labelToCol = {};
    Object.entries(meta.labels).forEach(([k, v]) => { labelToCol[v] = k; labelToCol[k] = k; });

    const excelRows = raw.map(r => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        const key = labelToCol[String(k).trim()] || String(k).trim();
        if (meta.columns.includes(key) || meta.editable.includes(key)) out[key] = v;
      }
      return out;
    });

    // Fetch current DB rows
    const { data: dbRows, error } = await supabase.from(state.table).select('*');
    if (error) throw error;
    const dbMap = new Map();
    (dbRows || []).forEach(r => {
      const key = r[meta.pk] != null ? String(r[meta.pk]) :
        (r.national_id ? String(r.national_id) : null);
      if (key) dbMap.set(key, r);
    });

    const report = { new: [], changed: [], same: [], unmatched: [] };
    const matchKey = meta.pk === 'id' && excelRows.some(r => r.id != null) ? 'id' :
      (excelRows.some(r => r.national_id) ? 'national_id' : meta.pk);

    excelRows.forEach((ex, idx) => {
      const key = ex[matchKey] != null ? String(ex[matchKey]) : null;
      if (!key) {
        report.unmatched.push({ row: idx + 2, data: ex, reason: 'کلید شناسایی ندارد' });
        return;
      }
      const db = dbMap.get(key);
      if (!db) {
        report.new.push({ key, data: ex });
        return;
      }
      const diffs = {};
      let hasDiff = false;
      meta.editable.forEach(c => {
        if (!(c in ex)) return;
        let a = ex[c];
        let b = db[c];
        if (a != null && typeof a === 'object') a = JSON.stringify(a);
        if (b != null && typeof b === 'object') b = JSON.stringify(b);
        if (String(a ?? '') !== String(b ?? '')) {
          diffs[c] = { from: b, to: a };
          hasDiff = true;
        }
      });
      if (hasDiff) report.changed.push({ key, data: ex, diffs, db });
      else report.same.push({ key });
      dbMap.delete(key);
    });

    state.compareReport = { report, excelRows, matchKey, meta };
    renderCompareReport(report);
    showMsg(compareMsg, '', '');
  } catch (e) {
    showMsg(compareMsg, e.message || 'خطا در خواندن فایل', 'error');
  }
}

function renderCompareReport(report) {
  compareResult.hidden = false;
  compareResult.innerHTML = '';
  compareResult.appendChild(el('div', { class: 'compare-summary' },
    el('span', { class: 'badge' }, `جدید: ${faNum(report.new.length)}`),
    el('span', { class: 'badge' }, `تغییر یافته: ${faNum(report.changed.length)}`),
    el('span', { class: 'badge' }, `بدون تغییر: ${faNum(report.same.length)}`),
    el('span', { class: 'badge' }, `بدون کلید: ${faNum(report.unmatched.length)}`)
  ));

  if (report.changed.length || report.new.length) {
    const tbl = el('table', { class: 'table diff-table' });
    const th = el('tr', {},
      el('th', {}, 'وضعیت'),
      el('th', {}, 'کلید'),
      el('th', {}, 'جزئیات')
    );
    tbl.appendChild(el('thead', {}, th));
    const tb = el('tbody');
    report.new.forEach(n => {
      tb.appendChild(el('tr', { class: 'row-new' },
        el('td', {}, 'جدید'),
        el('td', {}, n.key),
        el('td', {}, escapeHtml(JSON.stringify(n.data).slice(0, 120)))
      ));
    });
    report.changed.forEach(c => {
      const detail = Object.entries(c.diffs).map(([k, d]) =>
        `${TABLES[state.table].labels[k] || k}: ${d.from ?? '—'} → ${d.to ?? '—'}`
      ).join(' | ');
      tb.appendChild(el('tr', { class: 'row-changed' },
        el('td', {}, 'تغییر'),
        el('td', {}, c.key),
        el('td', {}, detail)
      ));
    });
    report.unmatched.forEach(u => {
      tb.appendChild(el('tr', { class: 'row-error' },
        el('td', {}, 'خطا'),
        el('td', {}, `ردیف ${u.row}`),
        el('td', {}, u.reason)
      ));
    });
    tbl.appendChild(tb);
    compareResult.appendChild(el('div', { class: 'table-wrap' }, tbl));
  }

  if (report.new.length || report.changed.length) {
    compareActions.hidden = false;
  }
}

async function applyCompare() {
  if (!state.compareReport) return;
  const { report, matchKey, meta } = state.compareReport;
  const btn = $('#compareApply');
  setBtnLoading(btn, true);
  showMsg(compareMsg, 'در حال اعمال…', 'warn');
  try {
    let applied = 0;
    for (const n of report.new) {
      const payload = { ...n.data };
      delete payload[meta.pk];
      // coerce numbers
      meta.editable.forEach(c => {
        if (['amount','total_paid','debt','score','cooperative','member_id'].includes(c) && payload[c] != null) {
          const num = Number(String(payload[c]).replace(/[,٬]/g, ''));
          payload[c] = isNaN(num) ? null : num;
        }
      });
      const { error } = await supabase.from(state.table).insert(payload);
      if (error) throw error;
      applied++;
    }
    for (const c of report.changed) {
      const payload = {};
      Object.keys(c.diffs).forEach(k => {
        let v = c.diffs[k].to;
        if (['amount','total_paid','debt','score','cooperative','member_id'].includes(k) && v != null) {
          const num = Number(String(v).replace(/[,٬]/g, ''));
          v = isNaN(num) ? null : num;
        }
        payload[k] = v;
      });
      const { error } = await supabase.from(state.table).update(payload).eq(matchKey, c.key);
      if (error) throw error;
      applied++;
    }
    await logAudit('compare_apply', state.table, { applied, new: report.new.length, changed: report.changed.length });
    showMsg(compareMsg, `${faNum(applied)} تغییر اعمال شد`, 'ok');
    compareActions.hidden = true;
    state.compareReport = null;
    await loadTable();
  } catch (e) {
    showMsg(compareMsg, e.message || 'خطا در اعمال', 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

/* ---------- Configs ---------- */
async function loadConfigs() {
  try {
    const { data } = await supabase.from('import_configs')
      .select('*').eq('table_name', state.table).order('updated_at', { ascending: false });
    cfgList.innerHTML = '';
    (data || []).forEach(cfg => {
      cfgList.appendChild(el('div', { class: 'cfg-item' },
        el('div', {},
          el('div', { class: 'cfg-item-name' }, cfg.name),
          el('div', { class: 'cfg-item-meta' }, cfg.table_name + (cfg.mapping ? ' · ' + JSON.stringify(cfg.mapping).slice(0, 60) : ''))
        ),
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: () => {
            cfgName.value = cfg.name;
            const cols = cfg.mapping?.columns || cfg.options?.columns;
            if (cols) cfgCols.value = Array.isArray(cols) ? cols.join(', ') : String(cols);
          }
        }, 'بارگذاری')
      ));
    });
  } catch {}
}

async function saveConfig() {
  const name = cfgName.value.trim();
  if (!name) { showMsg(cfgMsg, 'نام را وارد کنید', 'error'); return; }
  const cols = cfgCols.value.split(',').map(s => s.trim()).filter(Boolean);
  const btn = $('#btnSaveCfg');
  setBtnLoading(btn, true);
  try {
    const payload = {
      name,
      table_name: state.table,
      mapping: { columns: cols.length ? cols : TABLES[state.table].columns },
      options: {},
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('import_configs').upsert(payload, { onConflict: 'name' });
    if (error) throw error;
    showMsg(cfgMsg, 'ذخیره شد', 'ok');
    loadConfigs();
  } catch (e) {
    showMsg(cfgMsg, e.message || 'خطا', 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

/* ---------- Audit ---------- */
async function logAudit(action, target, details) {
  try {
    const u = getUser();
    await supabase.from('audit_log').insert({
      actor_id: u?.id || null,
      actor_name: u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : null,
      action,
      target_table: target,
      details
    });
  } catch {}
}

/* ---------- Events ---------- */
tableSelect.addEventListener('change', loadTable);
searchInput.addEventListener('input', applyFilter);
btnRefresh.addEventListener('click', loadTable);
btnExport.addEventListener('click', exportExcel);
btnAdd.addEventListener('click', () => openEdit(null));
$('#modalClose').addEventListener('click', closeModal);
$('#modalCancel').addEventListener('click', closeModal);
editForm.addEventListener('submit', saveEdit);
$('#compareCancel').addEventListener('click', () => {
  compareResult.hidden = true;
  compareActions.hidden = true;
  state.compareReport = null;
  showMsg(compareMsg, '');
});
$('#compareApply').addEventListener('click', applyCompare);
$('#btnSaveCfg').addEventListener('click', saveConfig);
setupCompare();

$('#btnCompareTemplate')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const meta = TABLES[state.table];
  const headers = meta.columns.map(c => meta.labels[c] || c);
  try {
    downloadTableTemplate(headers, meta.label, `template-${state.table}.xlsx`);
  } catch (err) {
    showMsg(compareMsg, err.message || 'خطا در ساخت قالب', 'error');
  }
});

loadTable();
