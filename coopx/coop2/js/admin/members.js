import { boot, genPassword } from './boot.js';
import { createGrid } from '../grid.js';
import { rpc } from '../api.js';
import { isSuper } from '../auth.js';
import { el, $ } from '../utils.js';
import { openSheet, toast, errText, confirmBox } from '../ui.js';
import { ROLE_LABELS } from '../profiles.js';

const user = await boot('admin');
if (user) {
  const sup = isSuper(user);
  const canTouch = (row) => sup || row.role === 'member' || row.id === user.id;
  const showPassword = (pw) => {
    const box = el('input', { type: 'text', value: pw, readonly: '', class: 'ltr', style: 'font-size:1.1rem;text-align:center;letter-spacing:.05em' });
    const sh = openSheet({ title: 'رمز جدید', size: 'sm', body: box,
      footer: [el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => sh.close() }, 'بستن'),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(pw); toast('کپی شد', 'ok'); } catch { box.select(); } } }, el('i', { class: 'i i-copy' }), 'کپی')] });
    box.select();
  };

  createGrid($('#view'), {
    table: 'members', user, exportName: 'members', orderBy: { col: 'id', dir: 'asc' }, sheetSize: 'lg',
    columns: [
      { key: 'last_name', label: 'نام', render: (r) => `${r.first_name} ${r.last_name}` },
      { key: 'national_id', label: 'کد ملی', mono: true },
      { key: 'mobile', label: 'موبایل', mono: true, hideSm: true },
      { key: 'membership_status', label: 'وضعیت', hideSm: true },
      { key: 'role', label: 'نقش', kind: 'role' },
      { key: 'score', label: 'امتیاز', kind: 'num', hideSm: true },
      { key: 'total_paid', label: 'پرداختی', kind: 'money', hideSm: true },
      { key: 'debt', label: 'بدهی', kind: 'money', hideSm: true }
    ],
    exportColumns: ['first_name', 'last_name', 'national_id', 'mobile', 'email', 'password_initial', 'parent_company', 'membership_status', 'cooperative', 'total_paid', 'debt', 'score', 'role']
      .map((k) => ({ key: k, label: { first_name: 'نام', last_name: 'نام خانوادگی', national_id: 'کد ملی', mobile: 'شماره موبایل', email: 'ایمیل', password_initial: 'پسورد اولیه', parent_company: 'شرکت مادر', membership_status: 'وضعیت عضویت', cooperative: 'تعاونی', total_paid: 'جمع پرداختی‌ها', debt: 'میزان بدهی', score: 'امتیاز', role: 'نقش' }[k] })),
    filters: [{ key: 'role', def: '', options: [{ value: '', label: 'همه' }, { value: 'member', label: 'عضو' }, { value: 'admin', label: 'ادمین' }, { value: 'superadmin', label: 'سوپرادمین' }] }],
    fields: [
      { key: 'first_name', label: 'نام', required: true }, { key: 'last_name', label: 'نام خانوادگی', required: true },
      { key: 'national_id', label: 'کد ملی', required: true, ltr: true, maxlength: 10 }, { key: 'mobile', label: 'موبایل', ltr: true },
      { key: 'email', label: 'ایمیل', ltr: true, wide: true }, { key: 'password_initial', label: 'رمز اولیه', ltr: true, required: true },
      { key: 'parent_company', label: 'شرکت مادر', wide: true }, { key: 'membership_status', label: 'وضعیت عضویت', def: 'فعال' },
      { key: 'cooperative', label: 'تعاونی', kind: 'num' }, { key: 'score', label: 'امتیاز', kind: 'num', def: 0 },
      { key: 'total_paid', label: 'جمع پرداختی', kind: 'num', def: 0 }, { key: 'debt', label: 'مانده بدهی', kind: 'num', def: 0 },
      { key: 'role', label: 'نقش', kind: 'select', def: 'member', show: () => sup,
        options: [{ value: 'member', label: ROLE_LABELS.member }, { value: 'admin', label: ROLE_LABELS.admin }],
        canEdit: (row) => !row || (row.role !== 'superadmin' && row.id !== user.id) }
    ],
    perm: {
      add: true,
      edit: (row) => canTouch(row),
      remove: (row) => row.role !== 'superadmin' && row.id !== user.id && (sup || row.role === 'member')
    },
    rowTitle: (r) => `${r.first_name} ${r.last_name}`,
    actions: [
      { label: 'رمز جدید', icon: 'key', show: (r) => canTouch(r), run: async (r, ctx) => {
        if (!(await confirmBox({ title: 'رمز جدید', text: `برای «${r.first_name} ${r.last_name}» رمز تازه ساخته شود؟`, ok: 'بساز' }))) return;
        const pw = genPassword();
        try { await rpc('db_update', { p_table: 'members', p_id: r.id, p_patch: { password_initial: pw } }); ctx.close(); ctx.reload(); showPassword(pw); }
        catch (e) { toast(errText(e), 'error'); } } },
      { label: 'پرداخت‌ها', icon: 'wallet', run: (r) => { location.href = 'payments.html?q=' + encodeURIComponent(r.national_id); } },
      { label: 'تعهدات', icon: 'calendar-clock', run: (r) => { location.href = 'obligations.html?q=' + encodeURIComponent(r.national_id); } }
    ],
    onLoad: (st) => { $('#cnt').textContent = st.total.toLocaleString('fa-IR'); }
  });
}
