// Compare a table from a file with the database and describe every difference.
// Pure functions (no DOM, no network) so the same code can be tested in Node.
import { COL_LABELS, ALIASES } from './profiles.js';
import { parseDateLoose } from './jalali.js';

const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
export const asciiDigits = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
export const normHeader = (s) => asciiDigits(String(s ?? '')).normalize('NFKC')
  .replace(/[\u200c\u200e\u200f]/g, '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s_\-]+/g, ' ').trim().toLowerCase();
const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
const lbl = (c) => COL_LABELS[c] || c;

// ---------------------------------------------------------------- value coercion
const ok = (value) => ({ ok: true, value });
const bad = (error) => ({ ok: false, error });

export function coerce(value, col) {
  if (isBlank(value)) return ok(null);
  const type = (col.type || '').toLowerCase();
  if (/^(bigint|integer|smallint|numeric|real|double)/.test(type)) {
    let n;
    if (typeof value === 'number') n = value;
    else if (typeof value === 'boolean' || value instanceof Date) return bad('عدد نامعتبر');
    else {
      const s = asciiDigits(value).replace(/[,٬،\s\u00a0]/g, '').replace(/٫/g, '.');
      if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return bad('عدد نامعتبر');
      n = Number(s);
    }
    if (!Number.isFinite(n)) return bad('عدد نامعتبر');
    if (/^(bigint|integer|smallint)$/.test(type)) {
      if (!Number.isInteger(n)) { if (Math.abs(n - Math.round(n)) < 1e-9) n = Math.round(n); else return bad('عدد صحیح نیست'); }
      if (!Number.isSafeInteger(n)) return bad('عدد بیش از حد بزرگ');
    }
    return ok(n);
  }
  if (type === 'date') { const d = parseDateLoose(value); return d ? ok(d) : bad('تاریخ نامعتبر'); }
  if (type.startsWith('timestamp')) {
    if (value instanceof Date) return isNaN(value) ? bad('زمان نامعتبر') : ok(value.toISOString());
    const d = parseDateLoose(value);
    if (d && /^\s*[\d۰-۹]{4}\D+[\d۰-۹]{1,2}\D+[\d۰-۹]{1,2}\s*$/.test(String(value))) return ok(d + 'T00:00:00');
    const t = new Date(String(value));
    return isNaN(t) ? bad('زمان نامعتبر') : ok(t.toISOString());
  }
  if (type === 'boolean') {
    const s = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'بله', 'آری'].includes(s) || value === true) return ok(true);
    if (['false', '0', 'no', 'n', 'خیر', 'نه'].includes(s) || value === false) return ok(false);
    return bad('مقدار بله/خیر نامعتبر');
  }
  if (type.startsWith('json')) {
    if (typeof value === 'object') return ok(value);
    try { return ok(JSON.parse(String(value))); } catch { return bad('JSON نامعتبر'); }
  }
  let s = value instanceof Date ? (parseDateLoose(value) || '') : String(value).trim();
  if (col.name === 'national_id') {
    const d = asciiDigits(s).replace(/\D/g, '');
    if (!d) return ok(null);
    if (d.length > 10) return bad('کد ملی بیش از ۱۰ رقم');
    return ok(d.padStart(10, '0'));
  }
  if (col.name === 'mobile') {
    let d = asciiDigits(s).replace(/\D/g, '');
    if (d.length === 10 && d[0] === '9') d = '0' + d;
    return ok(d || null);
  }
  if (col.name === 'email') s = s.toLowerCase();
  return ok(s);
}

// ---------------------------------------------------------------- mapping
// file column -> table column ("member_id"), or a lookup into the referenced table ("member_id@national_id")
export function lookupTargets(table, tables) {
  const out = [];
  for (const c of table.columns) {
    if (!c.fk) continue;
    const ref = tables.find((t) => t.name === c.fk.table);
    if (!ref) continue;
    for (const rc of ref.columns) {
      if (rc.unique && !rc.pk) out.push({ key: `${c.name}@${rc.name}`, col: c.name, refTable: ref.name, ref: rc.name, label: `${lbl(c.name)} ← ${lbl(rc.name)}` });
    }
  }
  return out;
}

export function autoMap(headers, table, targets = []) {
  const map = {}, taken = new Set();
  const aliasesOf = (name) => [COL_LABELS[name], ...(ALIASES[name] || [])].filter(Boolean).map(normHeader);
  for (const pass of [0, 1]) {
    for (const h of headers) {
      if (map[h]) continue;
      const nh = normHeader(h);
      for (const c of table.columns) {
        if (taken.has(c.name)) continue;
        const cand = pass === 0 ? [normHeader(c.name)] : aliasesOf(c.name);
        if (cand.includes(nh)) { map[h] = c.name; taken.add(c.name); break; }
      }
    }
  }
  for (const h of headers) {
    if (map[h]) continue;
    const nh = normHeader(h);
    for (const t of targets) {
      if (taken.has(t.col)) continue;
      if ([normHeader(t.ref), ...aliasesOf(t.ref)].includes(nh)) { map[h] = t.key; taken.add(t.col); break; }
    }
  }
  headers.forEach((h) => { if (!(h in map)) map[h] = null; });
  return map;
}

// ---------------------------------------------------------------- comparison helpers
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((kk) => [kk, x[kk]])) : x));
function equal(a, b, col) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const type = (col.type || '').toLowerCase();
  if (/^(bigint|integer|smallint|numeric|real|double)/.test(type)) return Number(a) === Number(b);
  if (type.startsWith('json')) return canon(a) === canon(b);
  if (type.startsWith('timestamp')) return new Date(a).getTime() === new Date(b).getTime();
  if (type === 'boolean') return !!a === !!b;
  return String(a).trim() === String(b).trim();
}
const keyOf = (vals, keys) => {
  const parts = keys.map((k) => vals[k]);
  return parts.some((p) => p == null) ? null : parts.map((p) => String(p)).join('\u0001');
};

// ---------------------------------------------------------------- the plan
/*
  opts: { table, rows: [{ header: value }], mapping, keys, mode: 'upsert'|'insert'|'update',
          deleteMissing, blankClears, existing: [dbRows], lookupMaps: { 'member_id@national_id': { value: [ids] } },
          targets: lookupTargets(...), firstRow: 2 }
*/
export function buildPlan(opts) {
  const { table, rows, mapping, keys = [], mode = 'upsert', deleteMissing = false, blankClears = false,
          existing = [], lookupMaps = {}, targets = [], firstRow = 2 } = opts;
  const colMeta = Object.fromEntries(table.columns.map((c) => [c.name, c]));
  const tgt = Object.fromEntries(targets.map((t) => [t.key, t]));

  const direct = [], lookups = [];
  for (const [h, t] of Object.entries(mapping)) {
    if (!t) continue;
    if (t.includes('@')) { if (tgt[t]) lookups.push({ header: h, ...tgt[t] }); }
    else if (colMeta[t]) direct.push({ header: h, col: t });
  }
  const mappedCols = new Set([...direct.map((d) => d.col), ...lookups.map((l) => l.col)]);
  const required = table.columns.filter((c) => !c.nullable && c.default == null && !c.identity);
  const missingRequired = required.filter((c) => !mappedCols.has(c.name)).map((c) => c.name);
  const badKeys = keys.filter((k) => !mappedCols.has(k));

  const index = new Map();
  for (const r of existing) {
    const k = keyOf(r, keys);
    if (k == null) continue;
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(r);
  }

  const items = [];
  const seen = new Map();
  const fileKeys = new Set();
  const summary = { new: 0, changed: 0, same: 0, skipped: 0, error: 0, dup: 0, missing: 0 };

  rows.forEach((raw, i) => {
    const n = firstRow + i;
    const vals = {}, errors = [], show = {};
    for (const d of direct) {
      const r = coerce(raw[d.header], colMeta[d.col]);
      if (!r.ok) errors.push(`${lbl(d.col)}: ${r.error} («${String(raw[d.header]).slice(0, 30)}»)`);
      else vals[d.col] = r.value;
    }
    for (const l of lookups) {
      const refCol = { name: l.ref, type: 'text' };
      const r = coerce(raw[l.header], refCol);
      if (!r.ok) { errors.push(`${lbl(l.ref)}: ${r.error}`); continue; }
      if (r.value == null) { vals[l.col] = null; continue; }
      const found = (lookupMaps[l.key] || {})[r.value] || [];
      if (found.length === 0) errors.push(`${lbl(l.ref)} «${r.value}» در ${l.refTable} پیدا نشد`);
      else if (found.length > 1) errors.push(`${lbl(l.ref)} «${r.value}» چند بار در ${l.refTable} هست`);
      else { vals[l.col] = found[0]; show[l.col] = r.value; }
    }
    const key = badKeys.length ? null : keyOf(vals, keys);
    const item = { n, status: '', key, values: vals, show, existingId: null, diffs: [], errors };
    items.push(item);

    if (errors.length) { item.status = 'error'; summary.error++; return; }
    if (keys.length && key == null) { item.errors.push('مقدار کلید خالی است'); item.status = 'error'; summary.error++; return; }
    if (key != null) {
      if (seen.has(key)) { item.errors.push(`تکراری در فایل (ردیف ${seen.get(key)})`); item.status = 'dup'; summary.dup++; return; }
      seen.set(key, n); fileKeys.add(key);
    }
    const found = key == null ? [] : (index.get(key) || []);
    if (found.length > 1) { item.errors.push('چند رکورد مشابه در پایگاه داده'); item.status = 'error'; summary.error++; return; }
    if (found.length === 0) {
      if (mode === 'update') { item.status = 'skipped'; item.note = 'در پایگاه داده نیست'; summary.skipped++; return; }
      const lacking = required.filter((c) => vals[c.name] == null).map((c) => lbl(c.name));
      if (lacking.length) { item.errors.push('الزامی: ' + lacking.join('، ')); item.status = 'error'; summary.error++; return; }
      item.status = 'new'; summary.new++; return;
    }
    const ex = found[0];
    item.existingId = ex.id;
    const keySet = new Set(keys);
    for (const c of mappedCols) {
      if (keySet.has(c) || colMeta[c].identity || colMeta[c].pk) continue;
      const nv = vals[c];
      if (nv == null && !blankClears) continue;
      if (!equal(ex[c], nv, colMeta[c])) item.diffs.push({ col: c, before: ex[c] ?? null, after: nv });
    }
    if (mode === 'insert') { item.status = 'skipped'; item.note = 'از قبل وجود دارد'; summary.skipped++; return; }
    if (item.diffs.length) { item.status = 'changed'; summary.changed++; } else { item.status = 'same'; summary.same++; }
  });

  const missing = [];
  if (!badKeys.length && keys.length) {
    for (const [k, list] of index) {
      if (!fileKeys.has(k)) for (const r of list) missing.push({ id: r.id, key: k.split('\u0001').join(' · '), row: r });
    }
    summary.missing = missing.length;
  }
  const unmapped = Object.entries(mapping).filter(([, t]) => !t).map(([h]) => h);
  return { items, missing, summary, unmapped, missingRequired, badKeys, mode, deleteMissing };
}

// ops for db_apply from the (possibly narrowed) selection
export function buildOps(table, report, { include = null, includeMissing = null } = {}) {
  const idCols = new Set(table.columns.filter((c) => c.identity === 'always').map((c) => c.name));
  const ops = [];
  report.items.forEach((it, idx) => {
    if (include && !include.has(idx)) return;
    if (it.status === 'new') {
      const row = {};
      for (const [k, v] of Object.entries(it.values)) if (v != null && !idCols.has(k)) row[k] = v;
      ops.push({ op: 'insert', row });
    } else if (it.status === 'changed') {
      const patch = {};
      for (const d of it.diffs) patch[d.col] = d.after;
      ops.push({ op: 'update', id: it.existingId, patch });
    }
  });
  if (report.deleteMissing) {
    for (const m of report.missing) if (!includeMissing || includeMissing.has(m.id)) ops.push({ op: 'delete', id: m.id });
  }
  return ops;
}

// the discrepancy report as table rows (for download)
export function reportRows(report) {
  const names = { new: 'جدید', changed: 'تغییر یافته', same: 'بدون تغییر', skipped: 'نادیده', error: 'خطا', dup: 'تکراری' };
  const rows = report.items.map((it) => [
    it.n, names[it.status] || it.status, it.key ? it.key.split('\u0001').join(' · ') : '',
    it.diffs.map((d) => `${lbl(d.col)}: ${d.before ?? '—'} → ${d.after ?? '—'}`).join(' | '),
    [...it.errors, it.note].filter(Boolean).join(' | ')
  ]);
  for (const m of report.missing) rows.push(['—', 'غایب در فایل', m.key, '', `شناسه ${m.id}`]);
  return { headers: ['ردیف فایل', 'وضعیت', 'کلید', 'تغییرات', 'توضیح'], rows };
}
