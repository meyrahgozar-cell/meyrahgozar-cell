import {
  fetchAllMembersFull,
  fetchAllPayments,
  fetchAllObligations,
  bulkUpsertMembers,
  bulkInsertPayments,
  bulkInsertObligations,
  supabase
} from './supabase-client.js';
import { getUser } from './auth.js';

const MEMBER_FIELDS = [
  'first_name', 'last_name', 'national_id', 'mobile', 'email',
  'password_initial', 'parent_company', 'membership_status',
  'cooperative', 'total_paid', 'debt', 'score'
];

const FIELD_LABELS = {
  first_name: 'نام', last_name: 'نام خانوادگی', national_id: 'کد ملی',
  mobile: 'موبایل', email: 'ایمیل', password_initial: 'پسورد',
  parent_company: 'شرکت مادر', membership_status: 'وضعیت',
  cooperative: 'تعاونی', total_paid: 'جمع پرداختی', debt: 'بدهی', score: 'امتیاز'
};

function eq(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

async function writeAudit(action, target_table, details) {
  try {
    const u = getUser();
    await supabase.from('audit_log').insert({
      actor_id: u?.id || null,
      actor_name: u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : null,
      action,
      target_table,
      details
    });
  } catch (e) {
    console.warn('audit_log failed', e);
  }
}

export async function compareWithDatabase(parsed) {
  const [dbMembers, dbPayments, dbObligations] = await Promise.all([
    fetchAllMembersFull(),
    fetchAllPayments(),
    fetchAllObligations()
  ]);

  const memberByNid = new Map();
  dbMembers.forEach(m => memberByNid.set(String(m.national_id), m));

  const members = { new: [], changed: [], missing: [], errors: [], skipped: 0 };
  const excelNids = new Set();

  parsed.members.forEach((row, i) => {
    const sourceRow = i + 2;
    if (!row.national_id || row.national_id.length !== 10) {
      members.errors.push({ row: sourceRow, reason: 'کد ملی نامعتبر', data: row });
      return;
    }
    if (!row.first_name || !row.last_name) {
      members.errors.push({ row: sourceRow, reason: 'نام یا نام خانوادگی خالی', data: row });
      return;
    }
    excelNids.add(row.national_id);
    const before = memberByNid.get(row.national_id);
    if (!before) {
      members.new.push({ sourceRow, row });
      return;
    }
    const diffs = [];
    MEMBER_FIELDS.forEach(f => {
      if (f === 'national_id') return;
      if (!(f in row)) return;
      if (!eq(row[f], before[f])) {
        diffs.push({ field: f, label: FIELD_LABELS[f] || f, before: before[f], after: row[f] });
      }
    });
    if (diffs.length) {
      members.changed.push({ sourceRow, before, after: row, diffs });
    }
  });

  // missing only meaningful when full file (no selective change marks)
  const selective = parsed.meta?.changeFilter?.members?.selective;
  if (!selective) {
    dbMembers.forEach(m => {
      if (!excelNids.has(String(m.national_id))) {
        members.missing.push(m);
      }
    });
  }

  const payKey = p => `${p.member_id}|${p.amount}|${p.payment_date}`;
  const existingPay = new Set(dbPayments.map(payKey));
  const payments = { new: [], duplicates: [], errors: [] };
  const seenPay = new Set();

  for (const p of parsed.payments) {
    if (!p.national_id || !p.amount || !p.payment_date) {
      payments.errors.push({ row: '—', reason: 'داده ناقص', data: p });
      continue;
    }
    const mem = memberByNid.get(p.national_id);
    const memberId = mem?.id;
    if (!memberId && !parsed.members.some(m => m.national_id === p.national_id)) {
      payments.errors.push({ row: '—', reason: 'عضو یافت نشد: ' + p.national_id, data: p });
      continue;
    }
    const key = `${memberId || p.national_id}|${p.amount}|${p.payment_date}`;
    if (seenPay.has(key) || (memberId && existingPay.has(payKey({ member_id: memberId, amount: p.amount, payment_date: p.payment_date })))) {
      payments.duplicates.push(p);
      continue;
    }
    seenPay.add(key);
    payments.new.push({ ...p, member_id: memberId });
  }

  const oblKey = o => `${o.member_id}|${o.amount}|${o.due_date}`;
  const existingObl = new Set(dbObligations.map(oblKey));
  const obligations = { new: [], duplicates: [], errors: [] };
  const seenObl = new Set();

  for (const o of parsed.obligations) {
    if (!o.national_id || !o.amount || !o.due_date) {
      obligations.errors.push({ row: '—', reason: 'داده ناقص', data: o });
      continue;
    }
    const mem = memberByNid.get(o.national_id);
    const memberId = mem?.id;
    if (!memberId && !parsed.members.some(m => m.national_id === o.national_id)) {
      obligations.errors.push({ row: '—', reason: 'عضو یافت نشد: ' + o.national_id, data: o });
      continue;
    }
    const key = `${memberId || o.national_id}|${o.amount}|${o.due_date}`;
    if (seenObl.has(key) || (memberId && existingObl.has(oblKey({ member_id: memberId, amount: o.amount, due_date: o.due_date })))) {
      obligations.duplicates.push(o);
      continue;
    }
    seenObl.add(key);
    obligations.new.push({ ...o, member_id: memberId });
  }

  return { members, payments, obligations, memberByNid, changeFilter: parsed.meta?.changeFilter || {} };
}

export async function applyChanges(report) {
  const result = {
    members: { inserted: 0, updated: 0 },
    payments: { inserted: 0 },
    obligations: { inserted: 0 },
    errors: [],
    log: []
  };

  try {
    if (report.members.new.length) {
      const rows = report.members.new.map(x => {
        const { _change, ...rest } = x.row;
        return { ...rest, role: 'member' };
      });
      const inserted = await bulkUpsertMembers(rows);
      result.members.inserted = inserted.length;
      inserted.forEach(m => report.memberByNid.set(String(m.national_id), m));
      result.log.push({ type: 'insert', table: 'members', count: inserted.length, ids: inserted.map(m => m.id) });
    }
  } catch (e) {
    result.errors.push({ section: 'اعضا (جدید)', message: e.message });
  }

  try {
    if (report.members.changed.length) {
      const rows = report.members.changed.map(x => ({
        national_id: x.after.national_id,
        ...Object.fromEntries(x.diffs.map(d => [d.field, d.after]))
      }));
      const updated = await bulkUpsertMembers(rows);
      result.members.updated = updated.length;
      result.log.push({
        type: 'update',
        table: 'members',
        count: updated.length,
        changes: report.members.changed.map(x => ({
          national_id: x.after.national_id,
          diffs: x.diffs
        }))
      });
    }
  } catch (e) {
    result.errors.push({ section: 'اعضا (بروزرسانی)', message: e.message });
  }

  const resolveId = (nid) => report.memberByNid.get(String(nid))?.id;

  try {
    const payRows = report.payments.new
      .map(p => ({
        member_id: p.member_id || resolveId(p.national_id),
        amount: p.amount,
        payment_date: p.payment_date,
        description: p.description || null
      }))
      .filter(p => p.member_id);
    if (payRows.length) {
      const ins = await bulkInsertPayments(payRows);
      result.payments.inserted = ins.length;
      result.log.push({ type: 'insert', table: 'payments', count: ins.length });
    }
  } catch (e) {
    result.errors.push({ section: 'پرداخت‌ها', message: e.message });
  }

  try {
    const oblRows = report.obligations.new
      .map(o => ({
        member_id: o.member_id || resolveId(o.national_id),
        amount: o.amount,
        due_date: o.due_date,
        description: o.description || null
      }))
      .filter(o => o.member_id);
    if (oblRows.length) {
      const ins = await bulkInsertObligations(oblRows);
      result.obligations.inserted = ins.length;
      result.log.push({ type: 'insert', table: 'obligations', count: ins.length });
    }
  } catch (e) {
    result.errors.push({ section: 'تعهدات', message: e.message });
  }

  await writeAudit('excel_import', 'members', {
    inserted_members: result.members.inserted,
    updated_members: result.members.updated,
    inserted_payments: result.payments.inserted,
    inserted_obligations: result.obligations.inserted,
    change_filter: report.changeFilter || null,
    log: result.log,
    errors: result.errors
  });

  return result;
}
