import { requireSuperAdmin, getUser } from './auth.js';
import { renderLayout } from './layout.js';
import { supabase } from './supabase/client.js';
import { $, el, faNum, showMsg, escapeHtml } from './utils.js';

const user = requireSuperAdmin();
if (user) renderLayout();

const state = { rows: [], filtered: [] };
const searchInput = $('#searchInput');
const roleFilter = $('#roleFilter');
const tbody = $('#usersTable tbody');
const rowCount = $('#rowCount');
const pageMsg = $('#pageMsg');

const ROLE_LABELS = { member: 'عضو', admin: 'ادمین', superadmin: 'سوپرادمین' };

async function load() {
  showMsg(pageMsg, 'در حال بارگذاری…', 'warn');
  try {
    const { data, error } = await supabase.from('members')
      .select('id, first_name, last_name, national_id, mobile, membership_status, role')
      .order('id', { ascending: true });
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
  const role = roleFilter.value;
  state.filtered = state.rows.filter(r => {
    if (role && (r.role || 'member') !== role) return false;
    if (!q) return true;
    const blob = `${r.first_name} ${r.last_name} ${r.national_id} ${r.mobile || ''} ${r.role || ''}`.toLowerCase();
    return blob.includes(q);
  });
  render();
}

function render() {
  tbody.innerHTML = '';
  if (!state.filtered.length) {
    tbody.appendChild(el('tr', {}, el('td', { class: 'empty', colspan: 6 }, 'موردی یافت نشد')));
  } else {
    state.filtered.forEach(r => {
      const role = r.role || 'member';
      const tr = el('tr');
      tr.append(
        el('td', {}, `${r.first_name || ''} ${r.last_name || ''}`),
        el('td', { class: 'num' }, faNum(r.national_id)),
        el('td', { class: 'num' }, faNum(r.mobile || '—')),
        el('td', {}, r.membership_status || '—'),
        el('td', {},
          el('select', {
            class: 'role-select',
            value: role,
            onchange: (e) => changeRole(r, e.target.value)
          },
            el('option', { value: 'member', selected: role === 'member' ? '' : null }, 'عضو'),
            el('option', { value: 'admin', selected: role === 'admin' ? '' : null }, 'ادمین'),
            el('option', { value: 'superadmin', selected: role === 'superadmin' ? '' : null }, 'سوپرادمین')
          )
        ),
        el('td', {}, '')
      );
      // set selected properly
      const sel = tr.querySelector('select');
      if (sel) sel.value = role;
      tbody.appendChild(tr);
    });
  }
  rowCount.textContent = faNum(state.filtered.length) + ' نفر';
}

async function changeRole(member, newRole) {
  if (member.id === getUser()?.id && newRole !== 'superadmin') {
    showMsg(pageMsg, 'نمی‌توانید نقش خود را از سوپرادمین تغییر دهید', 'error');
    applyFilter();
    return;
  }
  try {
    const { error } = await supabase.from('members').update({ role: newRole }).eq('id', member.id);
    if (error) throw error;
    member.role = newRole;
    showMsg(pageMsg, `نقش ${member.first_name} به «${ROLE_LABELS[newRole]}» تغییر کرد`, 'ok');
    try {
      await supabase.from('audit_log').insert({
        actor_id: getUser()?.id,
        actor_name: `${getUser()?.first_name || ''} ${getUser()?.last_name || ''}`.trim(),
        action: 'role_change',
        target_table: 'members',
        details: { member_id: member.id, role: newRole }
      });
    } catch {}
  } catch (e) {
    showMsg(pageMsg, e.message || 'خطا', 'error');
    applyFilter();
  }
}

searchInput.addEventListener('input', applyFilter);
roleFilter.addEventListener('change', applyFilter);
$('#btnRefresh').addEventListener('click', load);
load();
