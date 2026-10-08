import { requireSuperAdmin } from './auth.js';
import { renderLayout } from './layout.js';
import { supabase } from './supabase/client.js';
import { $, el, faNum, showMsg } from './utils.js';

const user = requireSuperAdmin();
if (user) renderLayout();

const state = { rows: [], filtered: [] };
const searchInput = $('#searchInput');
const tbody = $('#auditTable tbody');
const rowCount = $('#rowCount');
const pageMsg = $('#pageMsg');

async function load() {
  showMsg(pageMsg, 'در حال بارگذاری…', 'warn');
  try {
    const { data, error } = await supabase.from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    state.rows = data || [];
    applyFilter();
    showMsg(pageMsg, '', '');
  } catch (e) {
    state.rows = [];
    applyFilter();
    showMsg(pageMsg, e.message || 'خطا', 'error');
  }
}

function applyFilter() {
  const q = (searchInput.value || '').trim().toLowerCase();
  state.filtered = q
    ? state.rows.filter(r => {
        const blob = `${r.actor_name || ''} ${r.action || ''} ${r.target_table || ''} ${JSON.stringify(r.details || {})}`.toLowerCase();
        return blob.includes(q);
      })
    : state.rows;
  render();
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('fa-IR');
  } catch { return iso; }
}

function render() {
  tbody.innerHTML = '';
  if (!state.filtered.length) {
    tbody.appendChild(el('tr', {}, el('td', { class: 'empty', colspan: 5 }, 'موردی یافت نشد')));
  } else {
    state.filtered.forEach(r => {
      let details = '';
      if (r.details) {
        try {
          details = typeof r.details === 'string' ? r.details : JSON.stringify(r.details);
          if (details.length > 80) details = details.slice(0, 80) + '…';
        } catch { details = '—'; }
      }
      tbody.appendChild(el('tr', {},
        el('td', {}, fmtTime(r.created_at)),
        el('td', {}, r.actor_name || '—'),
        el('td', {}, r.action || '—'),
        el('td', {}, r.target_table || '—'),
        el('td', { title: typeof r.details === 'object' ? JSON.stringify(r.details) : String(r.details || '') }, details || '—')
      ));
    });
  }
  rowCount.textContent = faNum(state.filtered.length) + ' مورد';
}

searchInput.addEventListener('input', applyFilter);
$('#btnRefresh').addEventListener('click', load);
load();
