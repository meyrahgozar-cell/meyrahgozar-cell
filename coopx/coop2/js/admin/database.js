// Advanced database tools (superadmin): overview, schema, SQL console, backup, sessions, audit, clean-up.
import { boot } from './boot.js';
import { createGrid } from '../grid.js';
import { rpc } from '../api.js';
import { el, $ } from '../utils.js';
import { openSheet, toast, errText, confirmBox, fmtDateTime, fmtNum, downloadBlob } from '../ui.js';
import { exportSheets } from '../excel.js';
import { TABLE_LABELS, ROLE_LABELS } from '../profiles.js';

const icon = (n) => el('i', { class: `i i-${n}`, 'aria-hidden': 'true' });
const user = await boot('superadmin');

const TABS = [['overview', 'نمای کلی'], ['schema', 'ساختار'], ['sql', 'SQL'], ['backup', 'پشتیبان'], ['sessions', 'نشست‌ها'], ['audit', 'گزارش تغییرات'], ['clean', 'پاکسازی']];
const ACTIONS = { login: 'ورود', insert: 'افزودن', update: 'ویرایش', delete: 'حذف', apply: 'اعمال فایل', sql: 'SQL', sql_error: 'خطای SQL', role: 'تغییر نقش', transfer: 'انتقال مدیریت', revoke: 'قطع نشست', empty: 'خالی‌سازی', backup: 'پشتیبان' };
const bytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const tag = (txt, cls = '') => el('span', { class: 'tag ' + cls }, txt);

if (user) {
  let tab = new URLSearchParams(location.search).get('tab') || 'overview';
  if (!TABS.some((t) => t[0] === tab)) tab = 'overview';
  let schema = null;
  const seg = el('div', { class: 'seg', style: 'margin-bottom:.8rem' });
  const pane = el('div');
  $('#view').replaceChildren(seg, pane);

  const getSchema = async (force) => { if (!schema || force) schema = await rpc('db_schema'); return schema; };
  const drawSeg = () => { seg.replaceChildren(...TABS.map(([k, label]) => el('button', { type: 'button', class: k === tab ? 'on' : '', onclick: () => { tab = k; drawSeg(); draw(); } }, label))); };

  async function draw() {
    pane.replaceChildren(el('div', { class: 'loading-line' }));
    try { await VIEWS[tab](); } catch (e) { pane.replaceChildren(el('div', { class: 'warnbox' }, icon('alert-triangle'), el('span', {}, errText(e)))); }
  }

  const VIEWS = {
    // ---------------------------------------------------------------- overview
    async overview() {
      const s = await getSchema(true);
      const total = s.tables.reduce((a, t) => a + t.rows, 0), size = s.tables.reduce((a, t) => a + t.size, 0);
      pane.replaceChildren(
        el('div', { class: 'tiles' },
          el('div', { class: 'stile' }, el('div', { class: 'lbl' }, icon('database'), 'جدول‌ها'), el('div', { class: 'val' }, fmtNum(s.tables.length))),
          el('div', { class: 'stile ok' }, el('div', { class: 'lbl' }, icon('table'), 'کل ردیف‌ها'), el('div', { class: 'val' }, fmtNum(total))),
          el('div', { class: 'stile aqua' }, el('div', { class: 'lbl' }, icon('hard-drive'), 'حجم'), el('div', { class: 'val' }, bytes(size).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]))),
          el('div', { class: 'stile gold' }, el('div', { class: 'lbl' }, icon('terminal'), 'توابع API'), el('div', { class: 'val' }, fmtNum(s.functions.length)))),
        el('div', { class: 'panel' }, el('div', { class: 'gscroll' }, el('table', { class: 'gt' },
          el('thead', {}, el('tr', {}, ...['جدول', 'ردیف', 'ستون', 'حجم', 'RLS'].map((h) => el('th', {}, h)))),
          el('tbody', {}, ...s.tables.map((t) => el('tr', { style: 'cursor:default' },
            el('td', { class: 'mono' }, t.name), el('td', { class: 'num' }, fmtNum(t.rows)), el('td', { class: 'num' }, fmtNum(t.columns.length)),
            el('td', { class: 'mono' }, bytes(t.size)), el('td', {}, tag(t.rls ? 'on' : 'off', t.rls ? 'ok' : 'bad')))))))),
        el('div', { class: 'panel' }, el('dl', { class: 'kv' }, el('dt', {}, 'نسخه'), el('dd', { class: 'ltr' }, s.version.split(' on ')[0]))));
    },

    // ---------------------------------------------------------------- schema
    async schema() {
      const s = await getSchema(true);
      const flags = (c) => [c.pk ? tag('PK', 'admin') : null, c.unique && !c.pk ? tag('UQ') : null, c.fk ? tag(`FK → ${c.fk.table}.${c.fk.column}`, 'warn') : null, c.identity ? tag('identity') : null].filter(Boolean);
      pane.replaceChildren(...s.tables.map((t) => el('details', { class: 'tbl-card' },
        el('summary', {}, el('span', { class: 'mono' }, t.name), el('span', { class: 'meta' }, tag(fmtNum(t.rows) + ' ردیف'), tag(bytes(t.size)), tag('RLS ' + (t.rls ? 'on' : 'off'), t.rls ? 'ok' : 'bad'))),
        el('div', { class: 'inner' },
          el('div', { class: 'gscroll', style: 'max-height:none' }, el('table', { class: 'mini' },
            el('thead', {}, el('tr', {}, ...['ستون', 'نوع', 'خالی؟', 'پیش‌فرض', ''].map((h) => el('th', {}, h)))),
            el('tbody', {}, ...t.columns.map((c) => el('tr', {}, el('td', { class: 'mono' }, c.name), el('td', { class: 'mono' }, c.type), el('td', {}, c.nullable ? 'بله' : 'خیر'),
              el('td', { class: 'mono' }, c.default || '—'), el('td', {}, el('div', { style: 'display:flex;gap:.25rem;flex-wrap:wrap' }, ...flags(c)))))))),
          el('table', { class: 'mini' }, el('thead', {}, el('tr', {}, el('th', {}, 'قیدها'), el('th', {}, ''))),
            el('tbody', {}, ...t.constraints.map((c) => el('tr', {}, el('td', { class: 'mono' }, `${c.name} [${c.type}]`), el('td', { class: 'mono' }, c.def))))),
          el('table', { class: 'mini' }, el('thead', {}, el('tr', {}, el('th', {}, 'ایندکس‌ها'))),
            el('tbody', {}, ...t.indexes.map((i) => el('tr', {}, el('td', { class: 'mono' }, i.def)))))))));
    },

    // ---------------------------------------------------------------- SQL console
    async sql() {
      const s = await getSchema();
      const HKEY = 'coop2_sql_history';
      const hist = () => { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch { return []; } };
      const ta = el('textarea', { class: 'code', rows: 7, spellcheck: 'false', placeholder: 'select * from members limit 20;' });
      const out = el('div', { class: 'res-wrap' });
      const histBox = el('div', { class: 'keybox' });
      const snippets = [
        ['جدول‌ها', "select table_name from information_schema.tables where table_schema = 'public' order by 1"],
        ['شمارش ردیف‌ها', s.tables.map((t) => `select '${t.name}' as tbl, count(*)::int as n from public.${t.name}`).join('\nunion all\n')],
        ['ادمین‌ها', "select id, first_name, last_name, national_id, role, last_login_at from public.members where role <> 'member' order by role desc, id"],
        ['اعضای بدهکار', 'select id, first_name, last_name, national_id, debt from public.members where debt > 0 order by debt desc limit 50']
      ];
      const drawHist = () => histBox.replaceChildren(...hist().map((q) => el('button', { class: 'chip', type: 'button', title: q, onclick: () => { ta.value = q; ta.focus(); } }, q.replace(/\s+/g, ' ').slice(0, 38) + (q.length > 38 ? '…' : ''))));
      const run = async () => {
        const q = ta.value.trim(); if (!q) return;
        const writes = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|vacuum)\b/i.test(q) || !/^\s*(select|with|values|table|show|explain)\b/i.test(q);
        if (writes && !(await confirmBox({ title: 'اجرای دستور', text: 'این دستور می‌تواند داده یا ساختار پایگاه داده را تغییر دهد. اجرا شود؟', ok: 'اجرا', danger: true }))) return;
        runBtn.disabled = true; out.replaceChildren(el('div', { class: 'loading-line' }));
        try {
          const r = await rpc('db_sql', { p_sql: q });
          localStorage.setItem(HKEY, JSON.stringify([q, ...hist().filter((x) => x !== q)].slice(0, 12))); drawHist();
          if (!r.ok) { out.replaceChildren(el('div', { class: 'res-meta' }, tag('خطا', 'bad'), el('span', {}, `${r.ms} ms`)), el('div', { class: 'res-err' }, `${r.error}\n[${r.sqlstate}]`)); return; }
          const meta = el('div', { class: 'res-meta' }, tag('موفق', 'ok'), el('span', {}, `${fmtNum(r.rowcount)} ردیف`), el('span', {}, `${r.ms} ms`));
          if (!r.columns.length) { out.replaceChildren(meta); if (writes) schema = null; return; }
          const rows = r.rows.slice(0, 500);
          const cell = (v) => (v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));
          out.replaceChildren(meta, el('div', { class: 'gscroll' }, el('table', { class: 'gt' },
            el('thead', {}, el('tr', {}, ...r.columns.map((c) => el('th', {}, c)))),
            el('tbody', {}, ...rows.map((row) => el('tr', { style: 'cursor:default' }, ...r.columns.map((c) => el('td', { class: 'mono trunc' }, cell(row[c])))))))),
            r.rowcount > 500 ? el('div', { class: 'muted', style: 'margin-top:.3rem;font-size:.78rem' }, `۵۰۰ ردیف اول از ${fmtNum(r.rowcount)}`) : null);
        } catch (e) { out.replaceChildren(el('div', { class: 'res-err' }, errText(e))); } finally { runBtn.disabled = false; }
      };
      const runBtn = el('button', { class: 'btn btn-primary', type: 'button', onclick: run }, icon('play'), 'اجرا');
      ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
      drawHist();
      pane.replaceChildren(el('div', { class: 'panel' },
        el('div', { class: 'keybox', style: 'margin-bottom:.6rem' }, ...snippets.map(([l, q]) => el('button', { class: 'chip', type: 'button', onclick: () => { ta.value = q; ta.focus(); } }, l))),
        ta, el('div', { class: 'gtool', style: 'margin-top:.5rem' }, runBtn, el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { ta.value = ''; out.replaceChildren(); } }, icon('eraser'), 'پاک'), el('span', { class: 'spacer' }), el('span', { class: 'muted ltr hide-sm', style: 'font-size:.75rem' }, 'Ctrl + Enter')),
        out, hist().length ? el('div', { style: 'margin-top:.8rem' }, histBox) : null));
    },

    // ---------------------------------------------------------------- backup
    async backup() {
      const doBackup = async (kind, btn) => {
        btn.disabled = true;
        try {
          toast('در حال تهیه پشتیبان…');
          const [b, metaTables] = await Promise.all([rpc('db_backup'), rpc('db_tables')]);
          const stamp = new Date().toISOString().slice(0, 10);
          if (kind === 'json') downloadBlob(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), `coop2-backup-${stamp}.json`);
          else {
            const sheets = metaTables.map((t) => {
              const names = t.columns.map((c) => c.name);
              return { name: t.name, headers: names, rows: (b.tables[t.name] || []).map((r) => names.map((n) => (r[n] != null && typeof r[n] === 'object' ? JSON.stringify(r[n]) : r[n]))) };
            });
            await exportSheets(`coop2-backup-${stamp}`, sheets);
          }
          toast('پشتیبان آماده شد', 'ok');
        } catch (e) { toast(errText(e), 'error'); } finally { btn.disabled = false; }
      };
      const xb = el('button', { class: 'btn btn-primary', type: 'button', onclick: () => doBackup('xlsx', xb) }, icon('file-spreadsheet'), 'اکسل (همه جدول‌ها)');
      const jb = el('button', { class: 'btn', type: 'button', onclick: () => doBackup('json', jb) }, icon('download'), 'JSON');
      pane.replaceChildren(el('div', { class: 'panel' }, el('div', { class: 'adm-actions' }, xb, jb)));
    },

    // ---------------------------------------------------------------- sessions
    async sessions() {
      const list = await rpc('db_sessions');
      const revoke = async (s) => {
        if (!(await confirmBox({ title: 'قطع نشست', text: `نشست «${s.name}» قطع شود؟`, ok: 'قطع کن', danger: true }))) return;
        try { await rpc('db_revoke_session', { p_id: s.id }); toast('قطع شد', 'ok'); draw(); } catch (e) { toast(errText(e), 'error'); }
      };
      pane.replaceChildren(el('div', { class: 'panel' }, el('div', { class: 'gtool', style: 'margin-bottom:.5rem' }, tag(fmtNum(list.length) + ' نشست فعال'), el('span', { class: 'spacer' }), el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'بازخوانی', onclick: draw }, icon('refresh'))),
        el('div', { class: 'gscroll' }, el('table', { class: 'gt' },
          el('thead', {}, el('tr', {}, ...['کاربر', 'نقش', 'شروع', 'آخرین فعالیت', 'انقضا', ''].map((h, i) => el('th', { class: i > 1 && i < 5 && i !== 3 ? 'hide-sm' : '' }, h)))),
          el('tbody', {}, ...list.map((s) => el('tr', { style: 'cursor:default' },
            el('td', {}, s.name, s.current ? ' ' : '', s.current ? tag('شما', 'ok') : null), el('td', {}, tag(ROLE_LABELS[s.role] || s.role, s.role)),
            el('td', { class: 'hide-sm' }, fmtDateTime(s.created_at)), el('td', {}, fmtDateTime(s.last_seen_at)), el('td', { class: 'hide-sm' }, fmtDateTime(s.expires_at)),
            el('td', {}, s.current ? null : el('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'قطع', onclick: () => revoke(s) }, icon('x'))))))))));
    },

    // ---------------------------------------------------------------- audit
    async audit() {
      const host = el('div'); pane.replaceChildren(host);
      createGrid(host, {
        table: 'audit_log', user, export: true, bulk: false, orderBy: { col: 'id', dir: 'desc' }, exportName: 'audit-log', sheetSize: 'lg',
        columns: [
          { key: 'created_at', label: 'زمان', kind: 'datetime' },
          { key: 'actor_name', label: 'کاربر' },
          { key: 'action', label: 'عملیات', render: (r) => tag(ACTIONS[r.action] || r.action, /delete|empty|error|revoke/.test(r.action) ? 'bad' : /role|transfer|sql/.test(r.action) ? 'warn' : '') },
          { key: 'target_table', label: 'جدول', mono: true, hideSm: true },
          { key: 'details', label: 'جزئیات', kind: 'json', trunc: true, hideSm: true, muted: true }
        ],
        exportColumns: [{ key: 'id', label: 'id' }, { key: 'created_at', label: 'created_at' }, { key: 'actor_name', label: 'actor_name' }, { key: 'action', label: 'action' }, { key: 'target_table', label: 'target_table' }, { key: 'details', label: 'details' }],
        filters: [{ key: 'action', def: '', options: [{ value: '', label: 'همه' }, ...['login', 'insert', 'update', 'delete', 'apply', 'sql', 'role', 'transfer'].map((a) => ({ value: a, label: ACTIONS[a] }))] }],
        fields: [
          { key: 'created_at', label: 'زمان', kind: 'datetime', ro: true }, { key: 'actor_name', label: 'کاربر', ro: true },
          { key: 'action', label: 'عملیات', ro: true }, { key: 'target_table', label: 'جدول', ro: true, ltr: true },
          { key: 'details', label: 'جزئیات', kind: 'json', ro: true, wide: true, rows: 10 }
        ],
        perm: { add: false, edit: false, remove: false }, rowTitle: (r) => `${ACTIONS[r.action] || r.action} · ${r.actor_name || ''}`
      });
    },

    // ---------------------------------------------------------------- clean-up
    async clean() {
      const s = await getSchema(true);
      const names = ['payments', 'obligations', 'suggestions', 'import_configs', 'members'];
      const rows = names.map((n) => s.tables.find((t) => t.name === n)).filter(Boolean);
      const empty = async (t) => {
        const label = t.name === 'members' ? 'اعضای عادی (نقش member)' : (TABLE_LABELS[t.name] || t.name);
        if (!(await confirmBox({ title: 'خالی‌سازی', text: `همه‌ی «${label}» حذف شود؟ این کار برگشت‌پذیر نیست.`, ok: 'حذف', danger: true, phrase: t.name }))) return;
        try { const r = await rpc('db_empty_table', { p_table: t.name }); toast(`${fmtNum(r.deleted)} ردیف حذف شد`, 'ok'); draw(); } catch (e) { toast(errText(e), 'error'); }
      };
      pane.replaceChildren(el('div', { class: 'panel' }, el('div', { class: 'alist' }, ...rows.map((t) => el('div', { class: 'row' },
        el('span', { class: 'tx' }, `${TABLE_LABELS[t.name] || t.name}${t.name === 'members' ? ' (فقط نقش member)' : ''} · ${fmtNum(t.rows)} ردیف`),
        el('button', { class: 'btn btn-sm btn-danger', type: 'button', disabled: t.rows ? null : '', onclick: () => empty(t) }, icon('trash'), 'خالی‌سازی'))))));
    }
  };

  drawSeg(); draw();
}
