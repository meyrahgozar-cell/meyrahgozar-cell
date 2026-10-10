import { boot } from './boot.js';
import { rpc } from '../api.js';
import { isSuper } from '../auth.js';
import { el, $ } from '../utils.js';
import { fmtNum, fmtDateTime, toast, errText } from '../ui.js';

const ACTIONS = { login: 'ورود', insert: 'افزودن', update: 'ویرایش', delete: 'حذف', apply: 'اعمال فایل', sql: 'اجرای SQL', sql_error: 'خطای SQL',
  role: 'تغییر نقش', transfer: 'انتقال مدیریت', revoke: 'قطع نشست', empty: 'خالی‌سازی', backup: 'پشتیبان' };
const icon = (n) => el('i', { class: `i i-${n}`, 'aria-hidden': 'true' });

const user = await boot('admin');
if (user) {
  try {
    const d = await rpc('admin_overview');
    const tile = (cls, ic, label, val, sub) => el('div', { class: 'stile ' + cls }, el('div', { class: 'lbl' }, icon(ic), label), el('div', { class: 'val' }, val), sub ? el('div', { class: 'sub' }, sub) : null);
    const tiles = [
      tile('', 'users', 'اعضا', fmtNum(d.members), `${fmtNum(d.admins)} ادمین`),
      tile('ok', 'wallet', 'جمع پرداختی اعضا', fmtNum(d.total_paid), 'ریال'),
      tile('warn', 'receipt', 'جمع بدهی اعضا', fmtNum(d.debt), 'ریال'),
      tile('aqua', 'wallet', 'پرداخت‌های ثبت‌شده', fmtNum(d.payments.count), `${fmtNum(d.payments.sum)} ریال`),
      tile('gold', 'calendar-clock', 'تعهدات', fmtNum(d.obligations.count), `${fmtNum(d.obligations.sum)} ریال`),
      tile('', 'inbox', 'پیشنهادها', fmtNum(d.suggestions))
    ];
    if (isSuper(user)) tiles.push(tile('ok', 'key', 'نشست‌های فعال', fmtNum(d.sessions)));
    $('#tiles').replaceChildren(...tiles);

    const sug = d.latest_suggestions || [];
    $('#sugList').replaceChildren(...(sug.length ? sug.map((s) => el('div', { class: 'row' }, el('span', { class: 'tx' }, `${s.full_name || '—'}: ${s.content}`), el('small', {}, fmtDateTime(s.created_at)))) : [el('div', { class: 'row' }, 'موردی نیست')]));

    if (isSuper(user)) {
      $('#auditPanel').hidden = false;
      const a = d.recent_audit || [];
      $('#auditList').replaceChildren(...(a.length ? a.map((x) => el('div', { class: 'row' }, el('span', { class: 'tx' }, `${x.actor_name || '—'} · ${ACTIONS[x.action] || x.action}${x.target_table ? ' · ' + x.target_table : ''}`), el('small', {}, fmtDateTime(x.created_at)))) : [el('div', { class: 'row' }, 'موردی نیست')]));
    }
  } catch (e) { toast(errText(e), 'error'); }
}
