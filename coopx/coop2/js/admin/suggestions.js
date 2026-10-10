import { boot } from './boot.js';
import { createGrid } from '../grid.js';
import { $ } from '../utils.js';

const user = await boot('admin');
if (user) {
  createGrid($('#view'), {
    table: 'suggestions', user, withMember: true, exportName: 'suggestions', orderBy: { col: 'id', dir: 'desc' },
    columns: [
      { key: 'full_name', label: 'نام' },
      { key: 'content', label: 'متن', trunc: true },
      { key: 'created_at', label: 'تاریخ', kind: 'datetime', hideSm: true }
    ],
    fields: [
      { key: 'full_name', label: 'نام', ro: true },
      { key: 'created_at', label: 'تاریخ', kind: 'datetime', ro: true },
      { key: 'content', label: 'متن', kind: 'longtext', ro: true, rows: 8, wide: true }
    ],
    perm: { add: false, edit: false, remove: true },
    rowTitle: (r) => r.full_name || 'پیشنهاد',
    onLoad: (st) => { $('#cnt').textContent = st.total.toLocaleString('fa-IR'); }
  });
}
