// Import wizard: file -> column mapping -> comparison report -> apply.
import { el } from '../utils.js';
import { rpc } from '../api.js';
import { readWorkbook, rowsToObjects, exportSheets } from '../excel.js';
import { buildPlan, buildOps, autoMap, lookupTargets, reportRows, coerce, normHeader } from '../importer.js';
import { openSheet, confirmBox, toast, errText, field } from '../ui.js';
import { colLabel, IMPORT_KEYS, SHEET_TABLES } from '../profiles.js';

const icon = (n) => el('i', { class: `i i-${n}`, 'aria-hidden': 'true' });
const FAN = (n) => Number(n).toLocaleString('fa-IR');
const show = (v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const STATUS_ORDER = ['changed', 'new', 'error', 'same', 'skipped', 'missing'];
const STATUS_LABEL = { new: 'جدید', changed: 'تغییر یافته', same: 'بدون تغییر', skipped: 'نادیده', error: 'خطا', missing: 'غایب در فایل' };

export function mountImport(host, ctx) {
  const S = { wb: null, file: null, sheet: null, headers: [], rows: [], mapping: {}, keys: [], opts: { mode: 'upsert', deleteMissing: false, blankClears: false },
              report: null, view: 'changed', sel: new Set(), selMissing: new Set(), result: null, busy: false };
  const table = () => ctx.table();
  const targets = () => lookupTargets(table(), ctx.tables);

  const targetOptions = () => [
    { value: '', label: '— نادیده —' },
    ...table().columns.filter((c) => c.identity !== 'always').map((c) => ({ value: c.name, label: `${colLabel(c.name)} (${c.name})` })),
    ...targets().map((t) => ({ value: t.key, label: `${t.label} [جستجو]` }))
  ];
  const mappedCols = () => [...new Set(Object.values(S.mapping).filter(Boolean).map((t) => (t.includes('@') ? t.split('@')[0] : t)))];

  function defaultKeys() {
    const mapped = mappedCols();
    let k = (IMPORT_KEYS[table().name] || []).filter((c) => mapped.includes(c));
    if (k.length !== (IMPORT_KEYS[table().name] || []).length) {
      const uniq = table().columns.find((c) => c.unique && !c.pk && mapped.includes(c.name));
      k = mapped.includes('id') ? ['id'] : uniq ? [uniq.name] : [];
    }
    return k;
  }

  // ------------------------------------------------------------------ saved configs
  async function listConfigs() {
    const r = await rpc('db_select', { p_table: 'import_configs', p_opts: { filters: [{ col: 'table_name', op: 'eq', val: table().name }], limit: 200, order: { col: 'name', dir: 'asc' } } });
    return r.rows.filter((c) => (c.options || {}).kind !== 'export');
  }
  function applyConfig(cfg) {
    const byNorm = Object.fromEntries(Object.entries(cfg.mapping || {}).map(([h, t]) => [normHeader(h), t]));
    const valid = new Set(targetOptions().map((o) => o.value));
    S.headers.forEach((h) => { const t = byNorm[normHeader(h)]; if (t !== undefined && valid.has(t || '')) S.mapping[h] = t || null; });
    const o = cfg.options || {};
    S.keys = (o.keys || []).filter((k) => mappedCols().includes(k));
    S.opts = { mode: o.mode || 'upsert', deleteMissing: !!o.deleteMissing, blankClears: !!o.blankClears };
    drawMapping();
  }
  async function saveConfig() {
    const input = el('input', { type: 'text', placeholder: 'نام پیکربندی', maxlength: 80 });
    const ok = el('button', { class: 'btn btn-primary', type: 'button' }, icon('save'), 'ذخیره');
    const sh = openSheet({ title: 'ذخیره پیکربندی', size: 'sm', body: field('نام', input, { wide: true }),
      footer: [el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => sh.close() }, 'انصراف'), ok] });
    ok.addEventListener('click', async () => {
      const name = input.value.trim(); if (!name) return;
      const payload = { name, table_name: table().name, mapping: S.mapping,
        options: { kind: 'import', keys: S.keys, ...S.opts, sheet: S.sheet && S.sheet.name, headerRow: S.sheet && S.sheet.headerRow } };
      ok.disabled = true;
      try {
        const same = (await rpc('db_select', { p_table: 'import_configs', p_opts: { filters: [{ col: 'name', op: 'eq', val: name }], limit: 1 } })).rows[0];
        if (same) {
          if (!(await confirmBox({ title: 'جایگزینی', text: `«${name}» از قبل هست. جایگزین شود؟`, ok: 'جایگزین کن' }))) { ok.disabled = false; return; }
          await rpc('db_update', { p_table: 'import_configs', p_id: same.id, p_patch: { table_name: payload.table_name, mapping: payload.mapping, options: payload.options } });
        } else await rpc('db_insert', { p_table: 'import_configs', p_row: payload });
        toast('ذخیره شد', 'ok'); sh.close(); drawMapping();
      } catch (e) { toast(errText(e), 'error'); ok.disabled = false; }
    });
  }

  // ------------------------------------------------------------------ step 1: file
  function drawFile() {
    host.innerHTML = '';
    const input = el('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: '' });
    const dz = el('div', { class: 'dz', tabindex: 0, role: 'button', 'aria-label': 'انتخاب فایل' },
      el('span', { class: 'tile' }, icon('file-spreadsheet')), el('b', {}, 'فایل اکسل یا CSV'), el('span', { class: 'muted' }, 'xlsx · xls · csv'), input);
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
    host.append(el('div', { class: 'panel' }, dz));
  }

  async function onFile(file) {
    try {
      toast('در حال خواندن فایل…');
      S.file = file; S.wb = await readWorkbook(file);
      const names = (SHEET_TABLES[table().name] || []).map(normHeader);
      const pick = S.wb.sheets.find((s) => names.includes(normHeader(s.name))) || S.wb.sheets.find((s) => s.total > 0) || S.wb.sheets[0];
      if (!pick) { toast('فایل خالی است', 'error'); return; }
      useSheet(pick, true);
    } catch (e) { toast(e.message === 'xlsx_unavailable' ? 'کتابخانه اکسل بارگذاری نشد' : 'فایل خوانده نشد', 'error'); }
  }

  function useSheet(sheet, fresh) {
    S.sheet = sheet; S.headers = sheet.headers; S.rows = rowsToObjects(sheet);
    S.mapping = autoMap(S.headers, table(), targets());
    S.keys = defaultKeys(); S.report = null; S.result = null;
    drawMapping();
  }

  // ------------------------------------------------------------------ step 2: mapping
  async function drawMapping() {
    host.innerHTML = '';
    const opts = targetOptions();
    const sheetSel = el('select', { onchange: () => useSheet(S.wb.sheets.find((s) => s.name === sheetSel.value)) },
      ...S.wb.sheets.map((s) => el('option', { value: s.name, selected: s.name === S.sheet.name ? '' : null }, `${s.name} (${FAN(s.total)})`)));

    const rowsEls = S.headers.map((h) => {
      const sel = el('select', { 'aria-label': h, onchange: () => { S.mapping[h] = sel.value || null; S.keys = S.keys.filter((k) => mappedCols().includes(k)); if (!S.keys.length) S.keys = defaultKeys(); drawMapping(); } },
        ...opts.map((o) => el('option', { value: o.value, selected: (S.mapping[h] || '') === o.value ? '' : null }, o.label)));
      const sample = S.rows.slice(0, 3).map((r) => show(r[h])).filter((x) => x !== '—').join(' ، ');
      return el('tr', {}, el('td', {}, h), el('td', { class: 'sample' }, sample || '—'), el('td', {}, el('span', { class: 'sel-wrap', style: 'display:flex' }, sel)));
    });

    const keyBox = el('div', { class: 'keybox' }, ...mappedCols().map((c) => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = S.keys.includes(c);
      cb.addEventListener('change', () => { S.keys = cb.checked ? [...S.keys, c] : S.keys.filter((k) => k !== c); });
      return el('label', { class: 'chip', style: 'cursor:pointer' }, cb, colLabel(c));
    }));
    const radio = (v, label) => { const r = el('input', { type: 'radio', name: 'mode' }); r.checked = S.opts.mode === v; r.addEventListener('change', () => { S.opts.mode = v; }); return el('label', {}, r, label); };
    const check = (k, label) => { const c = el('input', { type: 'checkbox' }); c.checked = S.opts[k]; c.addEventListener('change', () => { S.opts[k] = c.checked; }); return el('label', {}, c, label); };

    const missingReq = table().columns.filter((c) => !c.nullable && c.default == null && !c.identity && !mappedCols().includes(c.name)).map((c) => colLabel(c.name));
    const cfgSel = el('select', { 'aria-label': 'پیکربندی' }, el('option', { value: '' }, 'پیکربندی ذخیره‌شده…'));
    const cfgs = await listConfigs().catch(() => []);
    cfgs.forEach((c) => cfgSel.append(el('option', { value: c.id }, c.name)));
    cfgSel.addEventListener('change', () => { const c = cfgs.find((x) => String(x.id) === cfgSel.value); if (c) applyConfig(c); });

    host.append(el('div', { class: 'steps' },
      el('div', { class: 'panel' },
        el('div', { class: 'gtool', style: 'margin-bottom:.6rem' },
          el('b', {}, S.file.name), el('span', { class: 'sel-wrap' }, sheetSel), el('span', { class: 'spacer' }),
          el('span', { class: 'sel-wrap' }, cfgSel),
          el('button', { class: 'btn', type: 'button', onclick: saveConfig }, icon('save'), el('span', { class: 'lbl' }, 'ذخیره پیکربندی')),
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { S.wb = null; drawFile(); } }, icon('x'), el('span', { class: 'lbl' }, 'فایل دیگر'))),
        el('div', { class: 'gscroll', style: 'max-height:44vh' }, el('table', { class: 'map-table' },
          el('thead', {}, el('tr', {}, el('th', {}, 'ستون فایل'), el('th', {}, 'نمونه'), el('th', {}, 'ستون مقصد'))), el('tbody', {}, ...rowsEls)))),
      el('div', { class: 'panel' },
        el('div', { class: 'fld', style: 'margin-bottom:.7rem' }, el('span', { class: 'fld-label' }, 'کلید مقایسه'), keyBox),
        el('div', { class: 'opts' }, radio('upsert', 'ثبت و به‌روزرسانی'), radio('insert', 'فقط ثبت جدید'), radio('update', 'فقط به‌روزرسانی'),
          check('deleteMissing', 'حذف ردیف‌های غایب در فایل'), check('blankClears', 'سلول خالی مقدار را پاک کند')),
        missingReq.length ? el('div', { class: 'warnbox', style: 'margin-top:.7rem' }, icon('alert-triangle'), el('span', {}, 'ستون‌های الزامی بدون مقصد: ' + missingReq.join('، '))) : null),
      el('div', { class: 'sticky-actions' }, el('span', { class: 'muted' }, `${FAN(S.rows.length)} ردیف`),
        el('button', { class: 'btn btn-primary', type: 'button', id: 'cmpBtn', onclick: compare }, icon('search'), 'مقایسه با پایگاه داده'))));
  }

  // ------------------------------------------------------------------ step 3: compare
  async function fetchAll(name) {
    const out = []; let off = 0;
    for (;;) {
      const r = await rpc('db_select', { p_table: name, p_opts: { limit: 5000, offset: off, order: { col: 'id', dir: 'asc' } } });
      out.push(...r.rows); off += r.rows.length;
      if (!r.rows.length || off >= r.total) break;
    }
    return out;
  }
  async function compare() {
    const btn = document.getElementById('cmpBtn');
    const used = Object.values(S.mapping).filter(Boolean).map((t) => (t.includes('@') ? t.split('@')[0] : t));
    const dup = used.find((c, i) => used.indexOf(c) !== i);
    if (dup) { toast(`ستون مقصد «${colLabel(dup)}» بیش از یک بار انتخاب شده`, 'error'); return; }
    if (!used.length) { toast('هیچ ستونی انتخاب نشده', 'error'); return; }
    if (btn) { btn.disabled = true; btn.lastChild.textContent = 'در حال مقایسه…'; }
    try {
      const tb = table();
      const existing = await fetchAll(tb.name);
      const lookupMaps = {};
      for (const [h, t] of Object.entries(S.mapping)) {
        if (!t || !t.includes('@')) continue;
        const tg = targets().find((x) => x.key === t); if (!tg) continue;
        const vals = [...new Set(S.rows.map((r) => coerce(r[h], { name: tg.ref, type: 'text' }).value).filter(Boolean))];
        lookupMaps[t] = {};
        for (let i = 0; i < vals.length; i += 800) Object.assign(lookupMaps[t], await rpc('db_lookup', { p_table: tg.refTable, p_column: tg.ref, p_values: vals.slice(i, i + 800) }));
      }
      S.report = buildPlan({ table: tb, rows: S.rows, mapping: S.mapping, keys: S.keys, targets: targets(), existing, lookupMaps, mode: S.opts.mode,
        deleteMissing: S.opts.deleteMissing, blankClears: S.opts.blankClears, firstRow: (S.sheet.headerRow || 0) + 2 });
      S.sel = new Set(S.report.items.map((it, i) => (it.status === 'new' || it.status === 'changed' ? i : -1)).filter((i) => i >= 0));
      S.selMissing = new Set();
      const sm = S.report.summary;
      S.view = sm.changed ? 'changed' : sm.new ? 'new' : (sm.error + sm.dup) ? 'error' : sm.missing ? 'missing' : 'same';
      S.result = null;
      drawReport();
    } catch (e) { toast(errText(e), 'error'); if (btn) { btn.disabled = false; btn.lastChild.textContent = 'مقایسه با پایگاه داده'; } }
  }

  // ------------------------------------------------------------------ step 4: report
  function previewVals(it) {
    return Object.entries(it.values).filter(([, v]) => v != null).slice(0, 5).map(([k, v]) => `${colLabel(k)}: ${show(it.show[k] ?? v)}`).join(' ، ');
  }
  function drawReport() {
    const R = S.report, sm = R.summary;
    host.innerHTML = '';
    const counts = { new: sm.new, changed: sm.changed, same: sm.same, skipped: sm.skipped, error: sm.error + sm.dup, missing: sm.missing };
    const tiles = el('div', { class: 'rep-tiles' }, ...STATUS_ORDER.map((k) =>
      el('button', { class: `rtile ${k}` + (S.view === k ? ' on' : ''), type: 'button', onclick: () => { S.view = k; drawReport(); } },
        el('span', { class: 'l' }, STATUS_LABEL[k]), el('span', { class: 'v' }, FAN(counts[k])))));

    let list;
    if (S.view === 'missing') {
      const allow = R.deleteMissing;
      list = tbl(['', 'شناسه', 'کلید', 'اطلاعات'], R.missing.slice(0, 500).map((m) => {
        const cb = el('input', { type: 'checkbox', disabled: allow ? null : '' }); cb.checked = S.selMissing.has(m.id);
        cb.addEventListener('change', () => { cb.checked ? S.selMissing.add(m.id) : S.selMissing.delete(m.id); sync(); });
        return el('tr', { class: 'r-missing' }, el('td', {}, cb), el('td', { class: 'mono' }, String(m.id)), el('td', { class: 'mono' }, m.key),
          el('td', {}, Object.entries(m.row).filter(([k, v]) => v != null && !['password_initial', 'created_at'].includes(k)).slice(0, 5).map(([k, v]) => `${colLabel(k)}: ${show(v)}`).join(' ، ')));
      }));
      if (!allow && R.missing.length) list = el('div', {}, el('div', { class: 'muted', style: 'margin-bottom:.4rem' }, 'برای حذف، گزینه «حذف ردیف‌های غایب» را روشن کنید.'), list);
    } else {
      const wantStatus = S.view === 'error' ? ['error', 'dup'] : [S.view];
      const idxs = R.items.map((it, i) => i).filter((i) => wantStatus.includes(R.items[i].status));
      const pickable = S.view === 'new' || S.view === 'changed';
      const head = pickable ? ['', 'ردیف', 'کلید', S.view === 'changed' ? 'تغییرات' : 'مقادیر'] : ['ردیف', 'کلید', 'توضیح'];
      list = tbl(head, idxs.slice(0, 500).map((i) => {
        const it = R.items[i];
        const cls = { new: 'r-new', changed: 'r-changed', error: 'r-error', dup: 'r-dup' }[it.status] || '';
        const key = it.key ? it.key.split('\u0001').join(' · ') : '—';
        if (pickable) {
          const cb = el('input', { type: 'checkbox' }); cb.checked = S.sel.has(i);
          cb.addEventListener('change', () => { cb.checked ? S.sel.add(i) : S.sel.delete(i); sync(); });
          const body = S.view === 'changed'
            ? el('div', { class: 'diffs' }, ...it.diffs.map((d) => el('div', { class: 'd' }, el('span', { class: 'k' }, colLabel(d.col)), el('span', { class: 'old' }, show(d.before)), icon('chevron-left'), el('span', { class: 'new' }, show(d.after)))))
            : previewVals(it);
          return el('tr', { class: cls }, el('td', {}, cb), el('td', { class: 'mono' }, String(it.n)), el('td', { class: 'mono' }, key), el('td', {}, body));
        }
        return el('tr', { class: cls }, el('td', { class: 'mono' }, String(it.n)), el('td', { class: 'mono' }, key),
          el('td', { class: it.errors.length ? 'errs' : '' }, [...it.errors, it.note].filter(Boolean).join(' | ') || '—'));
      }));
      if (idxs.length > 500) list = el('div', {}, list, el('div', { class: 'muted', style: 'margin-top:.4rem' }, `۵۰۰ مورد اول از ${FAN(idxs.length)} نمایش داده شد`));
      if (!idxs.length) list = el('div', { class: 'muted', style: 'padding:.6rem' }, 'موردی نیست');
    }

    const applyBtn = el('button', { class: 'btn btn-primary', type: 'button', onclick: apply }, icon('check'), 'اعمال');
    const info = el('span', { class: 'muted' });
    const sync = () => {
      const ops = buildOps(table(), R, { include: S.sel, includeMissing: S.selMissing });
      const c = { insert: 0, update: 0, delete: 0 }; ops.forEach((o) => c[o.op]++);
      info.textContent = `${FAN(c.insert)} ثبت · ${FAN(c.update)} به‌روزرسانی · ${FAN(c.delete)} حذف`;
      applyBtn.disabled = !ops.length;
    };

    const extra = [];
    if (R.unmapped.length) extra.push(el('div', { class: 'muted' }, 'ستون‌های نادیده: ' + R.unmapped.join('، ')));
    if (R.missingRequired.length) extra.push(el('div', { class: 'errs' }, 'ستون‌های الزامی بدون مقصد: ' + R.missingRequired.map(colLabel).join('، ')));
    if (R.badKeys.length) extra.push(el('div', { class: 'errs' }, 'ستون کلید نگاشت نشده: ' + R.badKeys.map(colLabel).join('، ')));

    host.append(el('div', { class: 'steps' }, el('div', { class: 'panel' }, tiles, ...extra.map((x) => el('div', { style: 'margin-top:.5rem;font-size:.8rem' }, x)),
      el('div', { style: 'margin-top:.7rem' }, el('div', { class: 'rep-scroll' }, list)),
      S.result ? resultBox(S.result) : null,
      el('div', { class: 'sticky-actions' }, info,
        el('div', { class: 'adm-actions' },
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => drawMapping() }, icon('chevron-right'), 'بازگشت'),
          el('button', { class: 'btn', type: 'button', onclick: exportReport }, icon('download'), el('span', { class: 'lbl' }, 'گزارش اکسل')),
          applyBtn)))));
    sync();
  }

  function tbl(heads, rows) {
    return el('table', { class: 'rep' }, el('thead', {}, el('tr', {}, ...heads.map((h) => el('th', {}, h)))), el('tbody', {}, ...rows));
  }
  function resultBox(r) {
    return el('div', { class: 'warnbox', style: 'margin-top:.7rem;background:rgba(var(--success-rgb),.1);border-color:rgba(var(--success-rgb),.4)' },
      icon('check-circle'), el('span', {}, `انجام شد: ${FAN(r.inserted)} ثبت · ${FAN(r.updated)} به‌روزرسانی · ${FAN(r.deleted)} حذف`),
      el('button', { class: 'btn btn-sm', type: 'button', style: 'margin-inline-start:auto', onclick: () => compare() }, icon('refresh'), 'مقایسه مجدد'));
  }

  async function exportReport() {
    const { headers, rows } = reportRows(S.report);
    await exportSheets(`import-report-${table().name}`, [{ name: 'گزارش', headers, rows }]);
  }

  async function apply() {
    const R = S.report;
    const ops = buildOps(table(), R, { include: S.sel, includeMissing: S.selMissing });
    const c = { insert: 0, update: 0, delete: 0 }; ops.forEach((o) => c[o.op]++);
    const chunked = ops.length > 4000;
    const ok = await confirmBox({
      title: 'اعمال تغییرات', danger: c.delete > 0, phrase: c.delete > 0 ? 'حذف' : '', ok: 'اعمال',
      text: `${FAN(c.insert)} ثبت جدید، ${FAN(c.update)} به‌روزرسانی، ${FAN(c.delete)} حذف روی «${table().name}».` + (chunked ? ' (در چند مرحله انجام می‌شود)' : '') + (c.delete ? ' برای تأیید، کلمه «حذف» را بنویسید.' : '')
    });
    if (!ok) return;
    const total = { inserted: 0, updated: 0, deleted: 0 };
    try {
      for (let i = 0; i < ops.length; i += 4000) {
        const r = await rpc('db_apply', { p_table: table().name, p_ops: ops.slice(i, i + 4000), p_label: S.file ? S.file.name : null });
        total.inserted += r.inserted; total.updated += r.updated; total.deleted += r.deleted;
      }
      S.result = total; toast('تغییرات اعمال شد', 'ok');
      if (ctx.onApplied) ctx.onApplied();
      await compare();
      S.result = total; drawReport();
    } catch (e) {
      toast(errText(e), 'error');
      if (total.inserted + total.updated + total.deleted) { S.result = total; await compare(); S.result = total; drawReport(); }
    }
  }

  function reset() { S.wb = null; S.report = null; S.result = null; drawFile(); }
  drawFile();
  return { reset };
}
