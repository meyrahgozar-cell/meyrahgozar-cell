import { boot } from './boot.js';
import { createGrid } from '../grid.js';
import { $ } from '../utils.js';

const user = await boot('admin');
if (user) {
  const g = createGrid($('#view'), {
    table: 'payments', user, withMember: true, exportName: 'payments', orderBy: { col: 'id', dir: 'desc' },
    columns: [
      { key: 'member_name', label: 'عضو' },
      { key: 'member_national_id', label: 'کد ملی', mono: true, hideSm: true },
      { key: 'amount', label: 'مبلغ (ریال)', kind: 'money' },
      { key: 'payment_date', label: 'تاریخ واریز', kind: 'date' },
      { key: 'description', label: 'توضیحات', trunc: true, hideSm: true, muted: true }
    ],
    exportColumns: [{ key: 'member_national_id', label: 'کد ملی' }, { key: 'member_name', label: 'عضو' }, { key: 'amount', label: 'مبلغ' }, { key: 'payment_date', label: 'تاریخ واریز' }, { key: 'description', label: 'توضیحات' }],
    fields: [
      { key: 'member_id', label: 'عضو', kind: 'member', required: true, wide: true },
      { key: 'amount', label: 'مبلغ (ریال)', kind: 'num', required: true },
      { key: 'payment_date', label: 'تاریخ واریز', kind: 'jdate', required: true },
      { key: 'description', label: 'توضیحات', kind: 'longtext', rows: 3 }
    ],
    rowTitle: (r) => 'پرداخت ' + (r.member_name || ''), addTitle: 'پرداخت جدید',
    onLoad: (st) => { $('#cnt').textContent = st.total.toLocaleString('fa-IR'); }
  });
  const q = new URLSearchParams(location.search).get('q');
  if (q) { const i = document.querySelector('.gsearch input'); i.value = q; i.dispatchEvent(new Event('input')); }
}
