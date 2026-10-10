// Excel in/out in the browser (SheetJS, loaded on demand). Falls back to CSV when SheetJS is unavailable.
import { downloadBlob } from './ui.js';

const ROOT = new URL('../', import.meta.url).href;
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = () => { s.remove(); reject(new Error('load ' + src)); };
    document.head.appendChild(s);
  });
}

export function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (loading) return loading;
  loading = (async () => {
    for (const src of [ROOT + 'assets/vendor/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js']) {
      try { await loadScript(src); if (window.XLSX) return window.XLSX; } catch {}
    }
    loading = null;
    throw new Error('xlsx_unavailable');
  })();
  return loading;
}

const clean = (v) => (v == null ? '' : String(v).replace(/\u200c/g, '\u200c').trim());

// -> { sheets: [{ name, headers, rows: [[...]], total }] }   (first non-empty row is the header unless headerRow is given)
export async function readWorkbook(file, { headerRow = null } = {}) {
  const XLSX = await loadXlsx();
  let wb;
  if (/\.csv$/i.test(file.name)) wb = XLSX.read(await file.text(), { type: 'string' });
  else wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const sheets = wb.SheetNames.map((name) => {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    let h = headerRow != null ? headerRow : aoa.findIndex(r => r.some(c => clean(c) !== ''));
    if (h < 0) h = 0;
    const head = (aoa[h] || []).map((c, i) => clean(c) || `ستون ${i + 1}`);
    const seen = {};
    const headers = head.map((x) => { seen[x] = (seen[x] || 0) + 1; return seen[x] > 1 ? `${x} (${seen[x]})` : x; });
    const rows = aoa.slice(h + 1).filter(r => r.some(c => clean(c) !== ''));
    return { name, headers, rows, total: rows.length, headerRow: h };
  });
  return { sheets };
}

export const rowsToObjects = (sheet) => sheet.rows.map((r) => Object.fromEntries(sheet.headers.map((h, i) => [h, r[i] ?? null])));

function toCsv(headers, rows) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '\ufeff' + [headers, ...rows].map(r => r.map(q).join(',')).join('\r\n');
}

// sheets: [{ name, headers: string[], rows: any[][] }]
export async function exportSheets(filename, sheets) {
  try {
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const used = new Set();
    for (const s of sheets) {
      const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]);
      ws['!cols'] = s.headers.map((h, i) => ({ wch: Math.min(48, Math.max(String(h).length + 2, ...s.rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2))) }));
      let name = String(s.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
      let k = 1; while (used.has(name.toLowerCase())) name = name.slice(0, 28) + '_' + (++k);
      used.add(name.toLowerCase());
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    wb.Workbook = { Views: [{ RTL: true }] };
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename + '.xlsx');
    return 'xlsx';
  } catch (e) {
    const s = sheets[0];
    downloadBlob(new Blob([toCsv(s.headers, s.rows)], { type: 'text/csv;charset=utf-8' }), filename + '.csv');
    return 'csv';
  }
}
