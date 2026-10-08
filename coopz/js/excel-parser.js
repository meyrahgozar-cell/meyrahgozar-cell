import { toISODate } from './utils.js';

/**
 * نگاشت هدرهای فارسی به فیلدهای داخلی
 */
const HEADER_MAP = {
  members: {
    'نام': 'first_name',
    'نام خانوادگی': 'last_name',
    'کد ملی': 'national_id',
    'شماره موبایل': 'mobile',
    'موبایل': 'mobile',
    'ایمیل فردی': 'email',
    'ایمیل': 'email',
    'پسورد اولیه': 'password_initial',
    'پسورد': 'password_initial',
    'رمز عبور': 'password_initial',
    'شرکت مادر': 'parent_company',
    'وضعیت عضویت': 'membership_status',
    'وضعیت': 'membership_status',
    'تعاونی': 'cooperative',
    'تعاونی (۱ یا ۲)': 'cooperative',
    'جمع پرداختی‌ها': 'total_paid',
    'جمع پرداختی': 'total_paid',
    'میزان بدهی': 'debt',
    'بدهی': 'debt',
    'امتیاز': 'score'
  },
  payments: {
    'کد ملی': 'national_id',
    'مبلغ': 'amount',
    'مبلغ واریزی': 'amount',
    'تاریخ واریز': 'payment_date',
    'تاریخ': 'payment_date',
    'توضیحات': 'description',
    'شرح': 'description'
  },
  obligations: {
    'کد ملی': 'national_id',
    'مبلغ': 'amount',
    'مبلغ تعهد': 'amount',
    'سررسید': 'due_date',
    'تاریخ سررسید': 'due_date',
    'تاریخ': 'due_date',
    'توضیحات': 'description',
    'شرح': 'description'
  }
};

function normalizeKey(k) {
  return String(k ?? '').trim().replace(/\s+/g, ' ').replace(/\u200c/g, '\u200c');
}

function mapRow(row, sheetKey) {
  const map = HEADER_MAP[sheetKey];
  const out = {};
  for (const [rawK, rawV] of Object.entries(row)) {
    const key = normalizeKey(rawK);
    const field = map[key] || map[key.replace(/\u200c/g, '')];
    if (field) out[field] = rawV;
  }
  return out;
}

function toNumber(v) {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/[,٬\s]/g, '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function toStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return toISODate(v);
}

/**
 * خواندن فایل اکسل و تبدیل به داده نرمال‌شده
 */
export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });

        const result = {
          members: [],
          payments: [],
          obligations: [],
          meta: { sheets: wb.SheetNames }
        };

        // Members
        const mSheet = pickSheet(wb, ['Members', 'اعضا', 'اعضأ', 'Sheet1']);
        if (mSheet) {
          const rows = XLSX.utils.sheet_to_json(mSheet, { defval: '' });
          result.members = rows.map(r => {
            const o = mapRow(r, 'members');
            return {
              first_name: toStr(o.first_name),
              last_name: toStr(o.last_name),
              national_id: toStr(o.national_id).replace(/\D/g, '').slice(0, 10),
              mobile: toStr(o.mobile).replace(/\D/g, ''),
              email: toStr(o.email),
              password_initial: toStr(o.password_initial),
              parent_company: toStr(o.parent_company),
              membership_status: toStr(o.membership_status) || 'فعال',
              cooperative: toNumber(o.cooperative) || 1,
              total_paid: toNumber(o.total_paid),
              debt: toNumber(o.debt),
              score: toNumber(o.score)
            };
          }).filter(m => m.national_id);
        }

        // Payments
        const pSheet = pickSheet(wb, ['Payments', 'پرداخت‌ها', 'پرداخت', 'واریزها']);
        if (pSheet) {
          const rows = XLSX.utils.sheet_to_json(pSheet, { defval: '' });
          result.payments = rows.map(r => {
            const o = mapRow(r, 'payments');
            return {
              national_id: toStr(o.national_id).replace(/\D/g, '').slice(0, 10),
              amount: toNumber(o.amount),
              payment_date: toDate(o.payment_date),
              description: toStr(o.description)
            };
          }).filter(p => p.national_id && p.amount && p.payment_date);
        }

        // Obligations
        const oSheet = pickSheet(wb, ['Obligations', 'تعهدات', 'تعهد', 'سررسیدها']);
        if (oSheet) {
          const rows = XLSX.utils.sheet_to_json(oSheet, { defval: '' });
          result.obligations = rows.map(r => {
            const o = mapRow(r, 'obligations');
            return {
              national_id: toStr(o.national_id).replace(/\D/g, '').slice(0, 10),
              amount: toNumber(o.amount),
              due_date: toDate(o.due_date),
              description: toStr(o.description)
            };
          }).filter(p => p.national_id && p.amount && p.due_date);
        }

        resolve(result);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('خطا در خواندن فایل'));
    reader.readAsArrayBuffer(file);
  });
}

function pickSheet(wb, names) {
  for (const n of names) {
    if (wb.Sheets[n]) return wb.Sheets[n];
  }
  // حساس نباشیم؛ اولین شیت را برمی‌گردانیم اگر هیچ‌کدام پیدا نشد
  return null;
}
/** Build & download empty Excel templates (JS-generated, no static file) */
export function downloadImportTemplate() {
  if (typeof XLSX === 'undefined') throw new Error('XLSX not loaded');

  const membersHeaders = [
    'نام', 'نام خانوادگی', 'کد ملی', 'شماره موبایل', 'ایمیل فردی',
    'پسورد اولیه', 'شرکت مادر', 'وضعیت عضویت', 'تعاونی',
    'جمع پرداختی‌ها', 'میزان بدهی', 'امتیاز'
  ];
  const paymentsHeaders = ['کد ملی', 'مبلغ', 'تاریخ واریز', 'توضیحات'];
  const obligationsHeaders = ['کد ملی', 'مبلغ', 'سررسید', 'توضیحات'];

  const wb = XLSX.utils.book_new();

  const wsM = XLSX.utils.aoa_to_sheet([
    membersHeaders,
    ['علی', 'محمدی', '0012345678', '09121234567', 'ali@example.com', '1234', 'مپنا', 'فعال', 1, 0, 0, 0]
  ]);
  XLSX.utils.book_append_sheet(wb, wsM, 'Members');

  const wsP = XLSX.utils.aoa_to_sheet([
    paymentsHeaders,
    ['0012345678', 5000000, '2024-01-15', 'قسط اول']
  ]);
  XLSX.utils.book_append_sheet(wb, wsP, 'Payments');

  const wsO = XLSX.utils.aoa_to_sheet([
    obligationsHeaders,
    ['0012345678', 5000000, '2024-06-01', 'تعهد قسط']
  ]);
  XLSX.utils.book_append_sheet(wb, wsO, 'Obligations');

  XLSX.writeFile(wb, 'template-import.xlsx');
}

/**
 * Template for a single DB table (Persian labels preferred).
 * @param {string[]} headers - column header labels
 * @param {string} sheetName
 * @param {string} [filename]
 */
export function downloadTableTemplate(headers, sheetName = 'Sheet1', filename = 'template.xlsx') {
  if (typeof XLSX === 'undefined') throw new Error('XLSX not loaded');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
