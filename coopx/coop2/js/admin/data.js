// Database display / modification: any table, import from file with a comparison report, Excel export with saved configs.
import { boot } from './boot.js';
import { createGrid } from '../grid.js';
import { mountImport } from './import-ui.js';
import { rpc } from '../api.js';
import { el, $ } from '../utils.js';
import { openSheet, toast, errText, field, confirmBox, fmtDate } from '../ui.js';
import { exportSheets } from '../excel.js';
import { TABLE_LABELS, colLabel, kindOf } from '../profiles.js';

const icon = (n) => el('i', { class: `i i-${n}`, 'aria-hidden': 'true' });
const user = await boot('admin');

if (user) {
  const isSuper = user.role === 'superadmin';
  const qs = new URLSearchParams(location.search);
  let tables = await rpc('db_tables');
  let cur = tables.find((t) => t.name === qs.get('t')) ? qs.get('t') : tables[0].name;
  let tab = qs.get('tab') === 'import' ? 'import' : 'data';
  let grid = null, imp = null;
  const meta = () => tables.find((t) => t.name === cur);
  const view = $('#view');
  const head = el('div', { class: 'gtool', style: 'margin-bottom:.6rem' });
  const pane = el('div');
  view.replaceChildren(head, pane);

  // ------------------------------------------------------------ table → grid config
  function genericConfig(m) {
    const cols = m.columns;
    const columns = cols.map((c, i) => {
      const k = kindOf(c);
      return { key: c.name, label: c.name, kind: k === 'json' ? 'json' : undefined, mono: ['num', 'date', 'datetime'].includes(k), trunc: k === 'text' || k === 'json', hideSm: i >= 3 };
    });
    const fields = cols.map((c) => {
      const k = kindOf(c);
      const f = { key: c.name, label: c.name, ltr: true, required: !c.nullable && c.default == null && !c.identity };
      if (k === 'num') f.kind = 'num';
      else if (k === 'date') f.kind = 'date';
      else if (k === 'datetime') { f.kind = 'text'; f.ro = true; f.hideAdd = true; }
      else if (k === 'bool') f.kind = 'bool';
      else if (k === 'json') f.kind = 'json';
      else if (['content', 'description', 'details'].includes(c.name)) { f.kind = 'longtext'; f.ltr = false; }
      if (c.pk || c.identity === 'always') { f.ro = true; f.hideAdd = true; f.required = false; }
      if (m.name === 'members' && c.name === 'role') {
        f.kind = 'select'; f.ltr = false; f.options = [{ value: 'member', label: 'member' }, { value: 'admin', label: 'admin' }];
        f.show = () => isSuper; f.canEdit = (row) => !row || (row.role !== 'superadmin' && row.id !== user.id); f.def = 'member'; f.required = false;
      }
      return f;
    });
    const w = m.write;
    const touch = (row) => m.name !== 'members' || isSuper || row.role === 'member' || row.id === user.id;
    return {
      table: m.name, user, columns, fields, export: false, sheetSize: 'lg', pageSize: 50, exportName: m.name,
      orderBy: { col: 'id', dir: m.name === 'members' || m.name === 'import_configs' ? 'asc' : 'desc' },
      perm: { add: w, edit: (row) => w && touch(row), remove: (row) => w && touch(row) && !(m.name === 'members' && (row.role === 'superadmin' || row.id === user.id)) },
      rowTitle: (r) => `${m.name} #${r.id}`,
      toolbarExtra: [el('button', { class: 'btn', type: 'button', onclick: () => exportDialog(m) }, icon('download'), el('span', { class: 'lbl' }, 'خروجی اکسل'))],
      onLoad: () => {}
    };
  }

  // ------------------------------------------------------------ export dialog (+ saved configs)
  async function exportDialog(m) {
    let configs = [];
    try { configs = (await rpc('db_select', { p_table: 'import_configs', p_opts: { filters: [{ col: 'table_name', op: 'eq', val: m.name }], limit: 200, order: { col: 'name', dir: 'asc' } } })).rows.filter((c) => (c.options || {}).kind === 'export'); } catch {}
    const names = m.columns.map((c) => c.name);
    const S = { cols: new Set(names), labels: 'db', dates: 'iso', scope: 'filtered' };
    const body = el('div', { style: 'display:grid;gap:.8rem' });

    const draw = () => {
      body.innerHTML = '';
      const cfgSel = el('select', { 'aria-label': 'پیکربندی' }, el('option', { value: '' }, 'پیکربندی ذخیره‌شده…'), ...configs.map((c) => el('option', { value: c.id }, c.name)));
      cfgSel.addEventListener('change', () => {
        const c = configs.find((x) => String(x.id) === cfgSel.value); if (!c) return;
        const mp = c.mapping || {};
        S.cols = new Set((mp.columns || names).filter((n) => names.includes(n)));
        S.labels = mp.labels || 'db'; S.dates = mp.dates || 'iso'; S.scope = mp.scope || 'filtered'; draw();
      });
      const chips = names.map((n) => {
        const cb = el('input', { type: 'checkbox' }); cb.checked = S.cols.has(n);
        cb.addEventListener('change', () => { cb.checked ? S.cols.add(n) : S.cols.delete(n); });
        return el('label', { class: 'chip', style: 'cursor:pointer' }, cb, n);
      });
      const radio = (group, key, v, label) => { const r = el('input', { type: 'radio', name: group }); r.checked = S[key] === v; r.addEventListener('change', () => { S[key] = v; }); return el('label', {}, r, label); };
      body.append(
        el('div', { class: 'gtool' }, el('span', { class: 'sel-wrap' }, cfgSel),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { S.cols = new Set(names); draw(); } }, 'همه'),
          el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { S.cols = new Set(); draw(); } }, 'هیچ')),
        el('div', { class: 'keybox' }, ...chips),
        el('div', { class: 'opts' }, el('b', {}, 'عنوان ستون‌ها'), radio('lb', 'labels', 'db', 'نام ستون'), radio('lb', 'labels', 'fa', 'برچسب فارسی')),
        el('div', { class: 'opts' }, el('b', {}, 'تاریخ'), radio('dt', 'dates', 'iso', 'میلادی'), radio('dt', 'dates', 'jalali', 'شمسی')),
        el('div', { class: 'opts' }, el('b', {}, 'ردیف‌ها'), radio('sc', 'scope', 'filtered', 'نتیجه فعلی'), radio('sc', 'scope', 'all', 'همه')));
    };
    draw();

    const go = el('button', { class: 'btn btn-primary', type: 'button' }, icon('download'), 'خروجی');
    const saveBtn = el('button', { class: 'btn', type: 'button' }, icon('save'), 'ذخیره پیکربندی');
    const sh = openSheet({ title: 'خروجی اکسل · ' + m.name, size: 'md', body,
      footer: [saveBtn, el('span', { class: 'spacer' }), el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => sh.close() }, 'انصراف'), go] });

    go.addEventListener('click', async () => {
      const use = names.filter((n) => S.cols.has(n));
      if (!use.length) { toast('ستونی انتخاب نشده', 'error'); return; }
      go.disabled = true;
      try {
        toast('در حال تهیه فایل…');
        const rows = S.scope === 'all' ? await grid.fetchAll({ search: undefined, filters: [] }) : await grid.fetchAll();
        const types = Object.fromEntries(m.columns.map((c) => [c.name, c.type]));
        const out = rows.map((r) => use.map((n) => {
          const v = r[n];
          if (v != null && typeof v === 'object') return JSON.stringify(v);
          if (S.dates === 'jalali' && types[n] === 'date') return fmtDate(v);
          return v;
        }));
        const kind = await exportSheets(`${m.name}-${new Date().toISOString().slice(0, 10)}`, [{ name: m.name, headers: use.map((n) => (S.labels === 'fa' ? colLabel(n) : n)), rows: out }]);
        toast(kind === 'xlsx' ? 'فایل اکسل آماده شد' : 'فایل CSV آماده شد', 'ok'); sh.close();
      } catch (e) { toast(errText(e), 'error'); go.disabled = false; }
    });

    saveBtn.addEventListener('click', () => {
      const input = el('input', { type: 'text', placeholder: 'نام پیکربندی', maxlength: 80 });
      const ok = el('button', { class: 'btn btn-primary', type: 'button' }, icon('save'), 'ذخیره');
      const s2 = openSheet({ title: 'ذخیره پیکربندی', size: 'sm', body: field('نام', input, { wide: true }),
        footer: [el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => s2.close() }, 'انصراف'), ok] });
      ok.addEventListener('click', async () => {
        const name = input.value.trim(); if (!name) return;
        const payload = { name, table_name: m.name, mapping: { columns: names.filter((n) => S.cols.has(n)), labels: S.labels, dates: S.dates, scope: S.scope }, options: { kind: 'export' } };
        ok.disabled = true;
        try {
          const same = (await rpc('db_select', { p_table: 'import_configs', p_opts: { filters: [{ col: 'name', op: 'eq', val: name }], limit: 1 } })).rows[0];
          let saved;
          if (same) {
            if (!(await confirmBox({ title: 'جایگزینی', text: `«${name}» از قبل هست. جایگزین شود؟`, ok: 'جایگزین کن' }))) { ok.disabled = false; return; }
            saved = await rpc('db_update', { p_table: 'import_configs', p_id: same.id, p_patch: { table_name: payload.table_name, mapping: payload.mapping, options: payload.options } });
            configs = configs.filter((c) => c.id !== same.id);
          } else saved = await rpc('db_insert', { p_table: 'import_configs', p_row: payload });
          configs.push(saved); configs.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
          toast('ذخیره شد', 'ok'); s2.close(); draw();
        } catch (e) { toast(errText(e), 'error'); ok.disabled = false; }
      });
    });
  }

  // ------------------------------------------------------------ chrome
  async function refreshCounts() { try { tables = await rpc('db_tables'); drawHead(); } catch {} }

  function drawHead() {
    head.innerHTML = '';
    const tseg = el('div', { class: 'seg' }, ...tables.map((t) => el('button', { type: 'button', class: t.name === cur ? 'on' : '', onclick: () => { cur = t.name; drawHead(); drawPane(); } },
      `${TABLE_LABELS[t.name] || t.name} (${t.rows.toLocaleString('fa-IR')})`)));
    const mseg = el('div', { class: 'seg' },
      el('button', { type: 'button', class: tab === 'data' ? 'on' : '', onclick: () => { tab = 'data'; drawHead(); drawPane(); } }, 'نمایش و ویرایش'),
      meta().write ? el('button', { type: 'button', class: tab === 'import' ? 'on' : '', onclick: () => { tab = 'import'; drawHead(); drawPane(); } }, 'ورود از فایل') : null);
    head.append(tseg, el('span', { class: 'spacer' }), mseg);
  }

  function drawPane() {
    pane.innerHTML = ''; grid = null; imp = null;
    const m = meta();
    if (tab === 'import' && m.write) {
      imp = mountImport(pane, { tables, table: meta, user, onApplied: refreshCounts });
    } else {
      tab = 'data';
      const host = el('div'); pane.append(host);
      const cfg = genericConfig(m);
      cfg.onChange = refreshCounts;
      grid = createGrid(host, cfg);
    }
  }

  drawHead(); drawPane();
}
