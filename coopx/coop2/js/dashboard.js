import { requireAuth } from './auth.js';
import { renderLayout } from './layout.js';
import { getPayments, getObligations, getAllMembersScores, getMe } from './data.js';
import { formatJalali } from './jalali.js';
import { $, faNum, formatMoney, el } from './utils.js';

const user = requireAuth();
if (user) {
  renderLayout();
  init().catch(err => console.error(err)).finally(() => $('#statsGrid')?.classList.add('is-ready'));
}

async function init() {
  $('#userName').textContent = `${user.first_name} ${user.last_name}`;

  const [member, payments, obligations, members] = await Promise.all([
    getMe(),
    getPayments(),
    getObligations(),
    getAllMembersScores()
  ]);

  if (member) {
    $('#statPaid').textContent  = formatMoney(member.total_paid);
    $('#statDebt').textContent  = formatMoney(member.debt);
    $('#statScore').textContent = faNum(member.score);
    const rank = members.findIndex(m => m.id === user.id) + 1;
    $('#statRank').textContent = rank > 0 ? faNum(rank) : '—';
  }

  renderPayments(payments);
  renderObligations(obligations);
  renderScoreboard(members, user.id);
}

function renderPayments(rows) {
  const tbody = $('#paymentsTable tbody');
  $('#payCount').textContent = faNum(rows.length) + ' ردیف';
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">پرداختی ثبت نشده است.</td></tr>';
    return;
  }
  rows.forEach((r, i) => {
    tbody.appendChild(el('tr', {},
      el('td', { class: 'num' }, faNum(i + 1)),
      el('td', { class: 'num' }, formatMoney(r.amount)),
      el('td', {}, formatJalali(r.payment_date, { long: true })),
      el('td', {}, r.description || '—')
    ));
  });
}

function renderObligations(rows) {
  const tbody = $('#obligationsTable tbody');
  $('#oblCount').textContent = faNum(rows.length) + ' ردیف';
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">تعهدی ثبت نشده است.</td></tr>';
    return;
  }
  const today = new Date();
  rows.forEach((r, i) => {
    const overdue = new Date(r.due_date) < today;
    const pill = overdue
      ? '<span class="pill pill-over">سررسید گذشته</span>'
      : '<span class="pill pill-due">در انتظار پرداخت</span>';
    tbody.appendChild(el('tr', {},
      el('td', { class: 'num' }, faNum(i + 1)),
      el('td', { class: 'num' }, formatMoney(r.amount)),
      el('td', {}, formatJalali(r.due_date, { long: true })),
      el('td', {}, r.description || '—'),
      el('td', { html: pill })
    ));
  });
}

function renderScoreboard(members, myId) {
  const tbody = $('#scoreboardTable tbody');
  $('#membersCount').textContent = faNum(members.length) + ' عضو';
  tbody.innerHTML = '';
  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">اطلاعاتی موجود نیست.</td></tr>';
    return;
  }
  let myRow = null;
  members.forEach((m, idx) => {
    const isMe = m.id === myId;
    const tr = el('tr', { class: isMe ? 'is-me' : '' },
      el('td', {}, faNum(idx + 1)),
      el('td', {}, `${m.first_name} ${m.last_name}`),
      el('td', {}, faNum(m.score))
    );
    if (isMe) myRow = tr;
    tbody.appendChild(tr);
  });
  if (myRow) requestAnimationFrame(() => {
    // centre my row inside the scoreboard only (scrollIntoView would also jump the whole page)
    const wrap = myRow.closest('.scoreboard-wrap');
    if (wrap) wrap.scrollTop = Math.max(0, myRow.offsetTop - (wrap.clientHeight - myRow.offsetHeight) / 2);
  });
}