import { requireSuper } from './auth.js';
import { renderLayout } from './layout.js';
import { fetchAllMembersAdmin, updateMemberRole, logAudit } from './supabase-client.js';
import { $, el, faNum, showMsg } from './utils.js';
import { ROLE_LABELS } from './auth.js';

const user = requireSuper();
if (user) renderLayout();

const state = { rows: [], filter: '', role: '' };

const tbody     = $('#usersTable tbody');
const countEl   = $('#userCount');
const msgEl     = $('#userMsg');
const searchEl  = $('#userSearch');
const roleEl    = $('#roleFilter');
const reloadBtn = $('#btnReload');

let searchTO;
searchEl?.addEventListener('input', () => {
  clearTimeout(searchTO);
  searchTO = setTimeout(() => { state.filter = searchEl.value.trim(); render(); }, 140);
});
roleEl?.addEventListener('change', () => { state.role = roleEl.value; render(); });
reloadBtn?.addEventListener('click', () => load().catch(console.error));

async function load() {
  showMsg(msgEl, '');
  try {
    const rows = await fetchAllMembersAdmin();
    state.rows = rows;
    render();
  } catch (err) {
    showMsg(msgEl, 'خطا: ' + err.message, 'error');
  }
}

function render() {
  const q = state.filter.toLowerCase();
  const rows = state.rows.filter(r => {
    if (state.role && (r.role || 'member') !== state.role) return false;
    if (!q) return true;
    const hay = `${r.first_name} ${r.last_name} ${r.national_id}`.toLowerCase();
    return hay.includes(q);
  });

  countEl.textContent = `${faNum(rows.length)} از ${faNum(state.rows.length)} کاربر`;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1.5rem" class="muted">کاربری برای نمایش نیست.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  rows.forEach((r, i) => {
    const role = r.role || 'member';
    const cls = role === 'superadmin' ? 'is-super' : role === 'admin' ? 'is-admin' : '';
    const tr = el('tr', {},
      el('td', { class: 'num' }, faNum(i + 1)),
      el('td', {}, `${r.first_name} ${r.last_name}`),
      el('td', { class: 'num' }, faNum(r.national_id)),
      el('td', { class: 'num' }, faNum(r.cooperative ?? '—')),
      el('td', {}, r.membership_status || '—'),
      el('td', {}, el('span', { class: 'role-chip ' + cls }, ROLE_LABELS[role] || role)),
      el('td', {}, buildActions(r))
    );
    tbody.appendChild(tr);
  });
}

function buildActions(r) {
  const wrap = el('div', { class: 'cell-actions', style: 'justify-content:flex-start;gap:.3rem;flex-wrap:wrap' });
  const role = r.role || 'member';
  const isSelf = r.id === user.id;

  const mk = (label, target, iconCls, danger) => {
    if (role === target) {
      wrap.appendChild(el('span', { class: 'chip' }, ROLE_LABELS[target]));
      return;
    }
    if (isSelf && target !== 'superadmin' && role === 'superadmin') {
      // don't allow superadmin to demote self accidentally without confirmation
    }
    wrap.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm' + (danger ? '' : ''),
      type: 'button',
      onclick: () => changeRole(r, target)
    }, el('i', { class: 'i ' + iconCls }), label));
  };

  if (role === 'member') {
    mk('تبدیل به مدیر', 'admin', 'i-shield');
  } else if (role === 'admin') {
    mk('ارتقا به مدیر ارشد', 'superadmin', 'i-crown');
    mk('لغو دسترسی مدیریت', 'member', 'i-x');
  } else if (role === 'superadmin') {
    if (!isSelf) mk('تنزل به مدیر', 'admin', 'i-shield');
  }

  return wrap;
}

async function changeRole(r, target) {
  if (r.id === user.id && target !== 'superadmin') {
    if (!confirm('شما در حال حذف دسترسی مدیر ارشد از حساب خود هستید. ادامه؟')) return;
  }
  if (!confirm(`نقش «${r.first_name} ${r.last_name}» به «${ROLE_LABELS[target]}» تغییر کند؟`)) return;
  showMsg(msgEl, '');
  try {
    await updateMemberRole(r.id, target);
    await logAudit({
      actor_id: user.id, actor_name: `${user.first_name} ${user.last_name}`,
      action: 'role-change', target_table: 'members',
      details: { member_id: r.id, from: r.role || 'member', to: target }
    });
    // if I demoted myself from superadmin, refresh session
    if (r.id === user.id && target !== 'superadmin') {
      const stored = JSON.parse(sessionStorage.getItem('mpna_user') || localStorage.getItem('mpna_user') || '{}');
      stored.role = target;
      (sessionStorage.getItem('mpna_user') ? sessionStorage : localStorage).setItem('mpna_user', JSON.stringify(stored));
    }
    showMsg(msgEl, 'نقش بروزرسانی شد.', 'ok');
    await load();
  } catch (err) {
    showMsg(msgEl, 'خطا: ' + err.message, 'error');
  }
}

load().catch(console.error);