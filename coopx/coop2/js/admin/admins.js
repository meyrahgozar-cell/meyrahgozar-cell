import { boot, genPassword } from './boot.js';
import { createGrid, memberPicker } from '../grid.js';
import { rpc } from '../api.js';
import { el, $ } from '../utils.js';
import { openSheet, toast, errText, confirmBox, field } from '../ui.js';

const user = await boot('superadmin');
if (user) {
  const icon = (n) => el('i', { class: `i i-${n}`, 'aria-hidden': 'true' });
  let grid;
  const setRole = async (id, role) => { await rpc('admin_set_role', { p_member_id: id, p_role: role }); grid.reload(); };

  const addAdmin = () => {
    const mp = memberPicker(null);
    const go = el('button', { class: 'btn btn-primary', type: 'button' }, icon('check'), 'ادمین شود');
    const sh = openSheet({ title: 'ادمین جدید', size: 'sm', body: field('عضو', mp.node, { wide: true, group: true }),
      footer: [el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => sh.close() }, 'انصراف'), go] });
    go.addEventListener('click', async () => {
      const id = mp.get(); if (id == null) { toast('عضو را انتخاب کنید', 'error'); return; }
      try { await setRole(id, 'admin'); toast('انجام شد', 'ok'); sh.close(); } catch (e) { toast(errText(e), 'error'); }
    });
  };

  grid = createGrid($('#view'), {
    table: 'members', user, export: false, bulk: false, orderBy: { col: 'role', dir: 'desc' },
    baseFilters: [{ col: 'role', op: 'in', val: ['admin', 'superadmin'] }],
    toolbarExtra: [el('button', { class: 'btn btn-primary', type: 'button', onclick: addAdmin }, icon('plus'), el('span', { class: 'lbl' }, 'ادمین جدید'))],
    columns: [
      { key: 'last_name', label: 'نام', render: (r) => `${r.first_name} ${r.last_name}` },
      { key: 'national_id', label: 'کد ملی', mono: true },
      { key: 'role', label: 'نقش', kind: 'role' },
      { key: 'last_login_at', label: 'آخرین ورود', kind: 'datetime', hideSm: true }
    ],
    fields: [
      { key: 'first_name', label: 'نام', ro: true }, { key: 'last_name', label: 'نام خانوادگی', ro: true },
      { key: 'national_id', label: 'کد ملی', ro: true, ltr: true }, { key: 'mobile', label: 'موبایل', ro: true, ltr: true },
      { key: 'last_login_at', label: 'آخرین ورود', kind: 'datetime', ro: true }
    ],
    perm: { add: false, edit: false, remove: false },
    rowTitle: (r) => `${r.first_name} ${r.last_name}`,
    actions: [
      { label: 'رمز جدید', icon: 'key', show: (r) => r.role === 'admin' || r.id === user.id, run: async (r, ctx) => {
        if (!(await confirmBox({ title: 'رمز جدید', text: `برای «${r.first_name} ${r.last_name}» رمز تازه ساخته شود؟`, ok: 'بساز' }))) return;
        const pw = genPassword();
        try { await rpc('db_update', { p_table: 'members', p_id: r.id, p_patch: { password_initial: pw } }); ctx.close();
          const box = el('input', { type: 'text', value: pw, readonly: '', class: 'ltr', style: 'font-size:1.1rem;text-align:center' });
          const sh = openSheet({ title: 'رمز جدید', size: 'sm', body: box, footer: [el('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(pw); toast('کپی شد', 'ok'); } catch { box.select(); } } }, icon('copy'), 'کپی'), el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => sh.close() }, 'بستن')] });
          box.select();
        } catch (e) { toast(errText(e), 'error'); } } },
      { label: 'حذف دسترسی', icon: 'x', show: (r) => r.role === 'admin', run: async (r, ctx) => {
        if (!(await confirmBox({ title: 'حذف دسترسی', text: `«${r.first_name} ${r.last_name}» دیگر ادمین نباشد؟`, ok: 'تأیید', danger: true }))) return;
        try { await setRole(r.id, 'member'); toast('انجام شد', 'ok'); ctx.close(); } catch (e) { toast(errText(e), 'error'); } } },
      { label: 'انتقال مدیریت', icon: 'shield', show: (r) => r.role === 'admin', run: async (r, ctx) => {
        if (!(await confirmBox({ title: 'انتقال مدیریت', text: `سوپرادمین به «${r.first_name} ${r.last_name}» منتقل و نقش شما ادمین می‌شود.`, ok: 'انتقال', danger: true, phrase: 'انتقال' }))) return;
        try { await setRole(r.id, 'superadmin'); ctx.close(); toast('انجام شد', 'ok'); setTimeout(() => location.replace('../dashboard.html'), 600); } catch (e) { toast(errText(e), 'error'); } } }
    ],
    onLoad: (st) => { $('#cnt').textContent = st.total.toLocaleString('fa-IR'); }
  });
}
