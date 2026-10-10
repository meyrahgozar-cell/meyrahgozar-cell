// Reusable data grid + record sheet on top of the db_* functions.
import { el } from './utils.js';
import { rpc } from './api.js';
import { openSheet, confirmBox, toast, errText, field, debounce, fmtDate, fmtDateTime, fmtNum } from './ui.js';
import { colLabel, ROLE_LABELS } from './profiles.js';
import { parseDateLoose } from './jalali.js';
import { asciiDigits } from './importer.js';
import { exportSheets } from './excel.js';

const icon = (n) => el('i', { class: `i i-${n}`, 'aria-hidden': 'true' });
const isBlank = (v) => v == null || String(v).trim() === '';

// ------------------------------------------------------------ member picker
export function memberPicker(initial) {
  let value = initial ? initial.id : null;
  let label = initial ? initial.label : '';
  const wrap = el('div', { class: 'picker' });
  const input = el('input', { type: 'text', placeholder: 'جستجوی نام یا کد ملی…', autocomplete: 'off' });
  const list = el('div', { class: 'picker-list' }); list.hidden = true;
  const chosen = el('div', { class: 'picker-sel' });

  const draw = () => {
    wrap.innerHTML = '';
    if (value != null) {
      chosen.innerHTML = '';
      chosen.append(el('span', {}, label), el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'تغییر', onclick: () => { value = null; label = ''; draw(); input.focus(); } }, icon('x')));
      wrap.append(chosen);
    } else wrap.append(input, list);
  };
  const search = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 1) { list.hidden = true; return; }
    try {
      const r = await rpc('db_select', { p_table: 'members', p_opts: { search: q, limit: 8, order: { col: 'last_name', dir: 'asc' } } });
      list.innerHTML = '';
      if (!r.rows.length) list.append(el('div', { class: 'picker-item', style: 'cursor:default;color:var(--muted)' }, 'نتیجه‌ای نیست'));
      r.rows.forEach((m) => list.append(el('button', {
        class: 'picker-item', type: 'button',
        onclick: () => { value = m.id; label = `${m.first_name} ${m.last_name} · ${m.national_id}`; draw(); }
      }, el('span', {}, `${m.first_name} ${m.last_name}`), el('small', {}, m.national_id))));
      list.hidden = false;
    } catch (e) { toast(errText(e), 'error'); }
  }, 250);
  input.addEventListener('input', search);
  draw();
  return { node: wrap, get: () => value };
}

// ------------------------------------------------------------ cells
function cell(col, row) {
  if (col.render) { const r = col.render(row); return r instanceof Node ? r : document.createTextNode(String(r ?? '—')); }
  const v = row[col.key];
  switch (col.kind) {
    case 'money': case 'num': return document.createTextNode(fmtNum(v));
    case 'date': return document.createTextNode(fmtDate(v));
    case 'datetime': return document.createTextNode(fmtDateTime(v));
    case 'bool': return document.createTextNode(v ? '✓' : '—');
    case 'role': return el('span', { class: 'tag ' + (v || 'member') }, ROLE_LABELS[v] || v || '—');
    case 'json': return document.createTextNode(v == null ? '—' : JSON.stringify(v).slice(0, 80));
    default: return document.createTextNode(v == null || v === '' ? '—' : String(v));
  }
}
const tdClass = (c) => [c.kind === 'money' ? 'money' : c.kind === 'num' ? 'num' : '', c.mono || c.kind === 'isodate' ? 'mono' : '', c.trunc ? 'trunc' : '', c.hideSm ? 'hide-sm' : '', c.muted ? 'muted' : ''].filter(Boolean).join(' ');

// ------------------------------------------------------------ the grid
export function createGrid(host, cfg) {
  const user = cfg.user;
  const allowed = (op, row) => {
    const p = cfg.perm && cfg.perm[op];
    if (p === undefined) return true;
    if (typeof p === 'function') return row === undefined ? true : !!p(row, user);   // no row: the capability exists in general
    return !!p;
  };
  const st = { page: 0, size: cfg.pageSize || 25, search: '', sort: { ...(cfg.orderBy || { col: 'id', dir: 'asc' }) }, chips: {}, rows: [], total: 0, sel: new Set() };
  let reqId = 0;

  // chips (server filters)
  (cfg.filters || []).forEach((f) => { st.chips[f.key] = f.def ?? ''; });

  const searchInput = el('input', { type: 'search', placeholder: 'جستجو…', 'aria-label': 'جستجو', value: '' });
  const bar = el('div', { class: 'loading-line', hidden: true });
  const tbody = el('tbody'), thead = el('thead');
  const count = el('span');
  const pageInfo = el('b');
  const prev = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'قبلی', onclick: () => { if (st.page > 0) { st.page--; load(); } } }, icon('chevron-right'));
  const next = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'بعدی', onclick: () => { if ((st.page + 1) * st.size < st.total) { st.page++; load(); } } }, icon('chevron-left'));
  const sizeSel = el('select', { 'aria-label': 'تعداد در صفحه', onchange: () => { st.size = +sizeSel.value; st.page = 0; load(); } },
    ...[25, 50, 100].map((n) => el('option', { value: n, selected: n === st.size ? '' : null }, String(n))));
  const bulk = el('div', { class: 'gbulk', hidden: true });
  const scroll = el('div', { class: 'gscroll' }, el('table', { class: 'gt' }, thead, tbody));

  const chipBox = el('div', { class: 'chips' });
  const drawChips = () => {
    chipBox.innerHTML = '';
    (cfg.filters || []).forEach((f) => f.options.forEach((o) => {
      chipBox.append(el('button', { class: 'chip' + (st.chips[f.key] === o.value ? ' on' : ''), type: 'button',
        onclick: () => { st.chips[f.key] = o.value; st.page = 0; drawChips(); load(); } }, o.label));
    }));
  };

  const toolbar = el('div', { class: 'gtool' },
    el('div', { class: 'gsearch' }, icon('search'), searchInput),
    chipBox,
    el('span', { class: 'spacer' }),
    ...(cfg.toolbarExtra || []),
    allowed('add') && cfg.fields ? el('button', { class: 'btn btn-primary', type: 'button', onclick: () => openRecord(null) }, icon('plus'), el('span', { class: 'lbl' }, 'افزودن')) : null,
    cfg.export !== false ? el('button', { class: 'btn', type: 'button', onclick: () => doExport() }, icon('download'), el('span', { class: 'lbl' }, 'اکسل')) : null,
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'بازخوانی', onclick: () => load() }, icon('refresh')));

  host.innerHTML = '';
  host.append(el('div', { class: 'grid' }, toolbar, bar, bulk, scroll,
    el('div', { class: 'gpager' }, el('span', {}, count), el('div', { class: 'pg' }, prev, pageInfo, next, el('span', { class: 'sel-wrap' }, sizeSel)))));

  searchInput.addEventListener('input', debounce(() => { st.search = searchInput.value.trim(); st.page = 0; load(); }, 300));

  const columns = () => cfg.columns;
  const filtersNow = () => {
    const f = [...(cfg.baseFilters || [])];
    (cfg.filters || []).forEach((d) => { const v = st.chips[d.key]; if (v !== '' && v != null) f.push(d.build ? d.build(v) : { col: d.key, op: 'eq', val: v }); });
    if (cfg.extraFilters) f.push(...cfg.extraFilters());
    return f;
  };
  const query = (extra = {}) => ({
    search: st.search || undefined, filters: filtersNow(), order: st.sort,
    with_member: !!cfg.withMember, limit: st.size, offset: st.page * st.size, ...extra
  });

  function drawHead() {
    thead.innerHTML = '';
    const tr = el('tr');
    if (allowed('remove') && cfg.bulk !== false) {
      const all = el('input', { type: 'checkbox', 'aria-label': 'انتخاب همه', onchange: () => {
        st.rows.forEach((r) => { if (allowed('remove', r)) (all.checked ? st.sel.add(r.id) : st.sel.delete(r.id)); }); drawBody(); drawBulk(); } });
      tr.append(el('th', { class: 'cb' }, all));
    }
    columns().forEach((c) => {
      const sortable = c.sort !== false;
      const on = st.sort.col === c.key;
      tr.append(el('th', { class: (c.hideSm ? 'hide-sm ' : '') + (on ? 'sorted ' + st.sort.dir : '') },
        sortable ? el('button', { type: 'button', onclick: () => {
          st.sort = { col: c.key, dir: on && st.sort.dir === 'asc' ? 'desc' : 'asc' }; st.page = 0; drawHead(); load(); } },
          c.label, on ? icon(st.sort.dir === 'asc' ? 'chevron-down' : 'chevron-down') : null) : c.label));
    });
    thead.append(tr);
  }

  function drawBody() {
    tbody.innerHTML = '';
    const span = columns().length + (allowed('remove') && cfg.bulk !== false ? 1 : 0);
    if (!st.rows.length) { tbody.append(el('tr', {}, el('td', { class: 'empty', colspan: span }, 'موردی نیست'))); return; }
    st.rows.forEach((row) => {
      const tr = el('tr', { tabindex: 0, class: (st.sel.has(row.id) ? 'sel ' : '') + (cfg.rowClass ? cfg.rowClass(row) || '' : '') });
      if (allowed('remove') && cfg.bulk !== false) {
        if (allowed('remove', row)) {
          const cb = el('input', { type: 'checkbox', 'aria-label': 'انتخاب', onclick: (e) => e.stopPropagation(), onchange: () => {
            cb.checked ? st.sel.add(row.id) : st.sel.delete(row.id); tr.classList.toggle('sel', cb.checked); drawBulk(); } });
          cb.checked = st.sel.has(row.id);
          tr.append(el('td', { class: 'cb' }, cb));
        } else tr.append(el('td', { class: 'cb' }));
      }
      columns().forEach((c) => tr.append(el('td', { class: tdClass(c) }, cell(c, row))));
      tr.addEventListener('click', () => openRecord(row));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') openRecord(row); });
      tbody.append(tr);
    });
  }

  function drawBulk() {
    bulk.hidden = st.sel.size === 0;
    bulk.innerHTML = '';
    if (!st.sel.size) return;
    bulk.append(el('span', {}, `${st.sel.size.toLocaleString('fa-IR')} مورد انتخاب شد`), el('span', { class: 'spacer', style: 'flex:1' }),
      el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: removeSelected }, icon('trash'), 'حذف'),
      el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => { st.sel.clear(); drawBody(); drawBulk(); } }, 'لغو'));
  }

  async function load() {
    const id = ++reqId;
    bar.hidden = false;
    try {
      const r = await rpc('db_select', { p_table: cfg.table, p_opts: query() });
      if (id !== reqId) return;
      st.rows = r.rows; st.total = r.total;
      if (st.page > 0 && !st.rows.length && st.total > 0) { st.page = Math.max(0, Math.ceil(st.total / st.size) - 1); return load(); }
      drawBody(); drawBulk();
      count.textContent = `${st.total.toLocaleString('fa-IR')} مورد`;
      const pages = Math.max(1, Math.ceil(st.total / st.size));
      pageInfo.textContent = `${(st.page + 1).toLocaleString('fa-IR')} / ${pages.toLocaleString('fa-IR')}`;
      prev.disabled = st.page === 0; next.disabled = st.page + 1 >= pages;
      if (cfg.onLoad) cfg.onLoad(st);
    } catch (e) {
      if (id !== reqId) return;
      tbody.innerHTML = ''; tbody.append(el('tr', {}, el('td', { class: 'empty', colspan: columns().length + 1 }, errText(e))));
    } finally { if (id === reqId) bar.hidden = true; }
  }

  async function fetchAll(extra = {}) {
    const out = []; let off = 0;
    for (;;) {
      const r = await rpc('db_select', { p_table: cfg.table, p_opts: query({ limit: 2000, offset: off, ...extra }) });
      out.push(...r.rows); off += r.rows.length;
      if (!r.rows.length || off >= r.total) break;
    }
    return out;
  }

  async function doExport() {
    try {
      toast('در حال تهیه فایل…');
      const rows = await fetchAll();
      const cols = (cfg.exportColumns || columns().map((c) => ({ key: c.key, label: c.label }))).filter((c) => c.key !== '_actions');
      const body = rows.map((r) => cols.map((c) => { const v = r[c.key]; return v != null && typeof v === 'object' ? JSON.stringify(v) : v; }));
      const kind = await exportSheets(`${cfg.exportName || cfg.table}-${new Date().toISOString().slice(0, 10)}`, [{ name: cfg.exportName || cfg.table, headers: cols.map((c) => c.label), rows: body }]);
      toast(kind === 'xlsx' ? 'فایل اکسل آماده شد' : 'فایل CSV آماده شد', 'ok');
    } catch (e) { toast(errText(e), 'error'); }
  }

  async function removeSelected() {
    const ids = [...st.sel];
    if (!(await confirmBox({ title: 'حذف', text: `${ids.length.toLocaleString('fa-IR')} مورد حذف شود؟`, ok: 'حذف', danger: true }))) return;
    try {
      const r = await rpc('db_delete', { p_table: cfg.table, p_ids: ids });
      toast(`${r.deleted.toLocaleString('fa-IR')} مورد حذف شد`, 'ok'); st.sel.clear(); load(); if (cfg.onChange) cfg.onChange();
    } catch (e) { toast(errText(e), 'error'); }
  }

  // ---------------------------------------------------------- record sheet
  function openRecord(row) {
    const adding = !row;
    const editable = adding ? allowed('add') : allowed('edit', row);
    if (!cfg.fields) return;
    const inputs = {};
    const grid = el('div', { class: 'form-grid' });

    for (const f of cfg.fields) {
      if (f.show && !f.show(row, user)) continue;
      if (adding && f.hideAdd) continue;
      const ro = !editable || f.ro || (!adding && f.roEdit) || (f.canEdit && !f.canEdit(row, user));
      const v = row ? row[f.key] : (f.def !== undefined ? f.def : null);
      let ctl, get;
      if (f.kind === 'member') {
        const mp = memberPicker(row && row.member_id != null ? { id: row.member_id, label: `${row.member_name || ''} · ${row.member_national_id || ''}` } : null);
        if (ro) { ctl = el('div', { class: 'picker-sel' }, el('span', {}, row ? `${row.member_name || ''} · ${row.member_national_id || ''}` : '—')); get = () => (row ? row.member_id : null); }
        else { ctl = mp.node; get = () => mp.get(); }
      } else if (f.kind === 'select') {
        ctl = el('select', { disabled: ro ? '' : null }, ...f.options.map((o) => el('option', { value: o.value, selected: String(v ?? '') === String(o.value) ? '' : null }, o.label)));
        get = () => (ctl.value === '' ? null : ctl.value);
      } else if (f.kind === 'bool') {
        ctl = el('input', { type: 'checkbox', disabled: ro ? '' : null }); ctl.checked = !!v; get = () => ctl.checked;
      } else if (f.kind === 'longtext' || f.kind === 'json') {
        ctl = el('textarea', { rows: f.rows || 4, disabled: ro ? '' : null, class: f.kind === 'json' ? 'code' : (f.ltr ? 'ltr' : '') });
        ctl.value = v == null ? '' : (f.kind === 'json' ? JSON.stringify(v, null, 2) : String(v)); get = () => ctl.value;
      } else if (f.kind === 'date') {
        ctl = el('input', { type: 'date', disabled: ro ? '' : null, class: 'ltr' }); ctl.value = v || ''; get = () => ctl.value;
      } else if (f.kind === 'jdate') {
        ctl = el('input', { type: 'text', inputmode: 'numeric', placeholder: '۱۴۰۴/۰۱/۰۱', disabled: ro ? '' : null, class: 'ltr' });
        ctl.value = v ? fmtDate(v) : ''; get = () => ctl.value;
      } else {
        ctl = el('input', { type: 'text', disabled: ro ? '' : null, maxlength: f.maxlength || null, placeholder: f.placeholder || null,
          inputmode: f.kind === 'num' ? 'numeric' : null, class: (f.ltr || f.kind === 'num') ? 'ltr' : '' });
        ctl.value = v == null ? '' : (f.kind === 'datetime' ? fmtDateTime(v) : String(v)); get = () => ctl.value;
      }
      inputs[f.key] = { f, get, ctl, ro };
      grid.append(field(f.label || colLabel(f.key), ctl, { wide: f.wide || f.kind === 'longtext' || f.kind === 'json', required: f.required, group: f.kind === 'member' }));
    }

    const readValues = () => {
      const out = {}, errors = [];
      for (const [key, { f, get, ro }] of Object.entries(inputs)) {
        if (ro) continue;
        let raw = get(), val;
        switch (f.kind) {
          case 'num': {
            if (isBlank(raw)) val = null;
            else { const n = Number(asciiDigits(raw).replace(/[,٬،\s]/g, '')); if (!Number.isFinite(n)) { errors.push(`${f.label}: عدد نامعتبر`); continue; } val = n; }
            break; }
          case 'jdate': { if (isBlank(raw)) val = null; else { val = parseDateLoose(raw); if (!val) { errors.push(`${f.label}: تاریخ نامعتبر`); continue; } } break; }
          case 'date': val = isBlank(raw) ? null : raw; break;
          case 'json': { if (isBlank(raw)) val = null; else { try { val = JSON.parse(raw); } catch { errors.push(`${f.label}: JSON نامعتبر`); continue; } } break; }
          case 'bool': val = !!raw; break;
          case 'member': val = raw == null ? null : Number(raw); break;
          default: val = isBlank(raw) ? null : String(raw).trim();
        }
        if (f.required && val == null) { errors.push(`${f.label} الزامی است`); continue; }
        out[key] = val;
      }
      return { out, errors };
    };

    const save = el('button', { class: 'btn btn-primary', type: 'button' }, icon('save'), 'ذخیره');
    const foot = [];
    if (!adding && allowed('remove', row)) foot.push(el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
      if (!(await confirmBox({ title: 'حذف', text: cfg.rowTitle ? `«${cfg.rowTitle(row)}» حذف شود؟` : 'این مورد حذف شود؟', ok: 'حذف', danger: true }))) return;
      try { await rpc('db_delete', { p_table: cfg.table, p_ids: [row.id] }); toast('حذف شد', 'ok'); sh.close(); load(); if (cfg.onChange) cfg.onChange(); }
      catch (e) { toast(errText(e), 'error'); } } }, icon('trash'), 'حذف'));
    if (!adding) (cfg.actions || []).forEach((a) => { if (!a.show || a.show(row, user)) foot.push(el('button', { class: 'btn', type: 'button', onclick: () => a.run(row, { close: () => sh.close(), reload: load }) }, a.icon ? icon(a.icon) : null, a.label)); });
    foot.push(el('span', { class: 'spacer' }));
    foot.push(el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => sh.close() }, editable ? 'انصراف' : 'بستن'));
    if (editable) foot.push(save);

    const title = adding ? (cfg.addTitle || 'افزودن') : (cfg.rowTitle ? cfg.rowTitle(row) : 'ویرایش');
    const sh = openSheet({ title, body: grid, footer: foot, size: cfg.sheetSize || 'md' });

    save.addEventListener('click', async () => {
      const { out, errors } = readValues();
      if (errors.length) { toast(errors[0], 'error'); return; }
      let payload = out;
      if (cfg.beforeSave) { try { payload = cfg.beforeSave(out, row, adding ? 'add' : 'edit') || out; } catch (e) { toast(e.message, 'error'); return; } }
      save.disabled = true;
      try {
        if (adding) {
          const row2 = {}; for (const [k, v] of Object.entries(payload)) if (v != null) row2[k] = v;
          await rpc('db_insert', { p_table: cfg.table, p_row: row2 });
        } else {
          const patch = {};
          for (const [k, v] of Object.entries(payload)) {
            const old = row[k] ?? null;
            const same = typeof v === 'object' && v !== null ? JSON.stringify(v) === JSON.stringify(old) : String(v ?? '') === String(old ?? '');
            if (!same) patch[k] = v;
          }
          if (!Object.keys(patch).length) { sh.close(); return; }
          await rpc('db_update', { p_table: cfg.table, p_id: row.id, p_patch: patch });
        }
        toast('ذخیره شد', 'ok'); sh.close(); load(); if (cfg.onChange) cfg.onChange();
      } catch (e) { toast(errText(e), 'error'); save.disabled = false; }
    });
  }

  drawChips(); drawHead(); load();
  return { reload: load, fetchAll, query, openAdd: () => openRecord(null), state: st, setChip(k, v) { st.chips[k] = v; st.page = 0; drawChips(); load(); }, redrawHead: drawHead };
}
