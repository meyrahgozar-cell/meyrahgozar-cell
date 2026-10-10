// Labels, aliases and defaults for the tables the admin tools know about.

export const TABLE_LABELS = {
  members: 'اعضا', payments: 'پرداخت‌ها', obligations: 'تعهدات', suggestions: 'پیشنهادها',
  import_configs: 'پیکربندی‌ها', audit_log: 'گزارش تغییرات'
};

export const ROLE_LABELS = { member: 'عضو', admin: 'ادمین', superadmin: 'سوپرادمین' };

export const COL_LABELS = {
  id: 'شناسه', first_name: 'نام', last_name: 'نام خانوادگی', national_id: 'کد ملی', mobile: 'موبایل', email: 'ایمیل',
  password_initial: 'رمز اولیه', parent_company: 'شرکت مادر', membership_status: 'وضعیت عضویت', cooperative: 'تعاونی',
  total_paid: 'جمع پرداختی', debt: 'مانده بدهی', score: 'امتیاز', created_at: 'تاریخ ثبت', role: 'نقش',
  member_id: 'عضو', amount: 'مبلغ', payment_date: 'تاریخ واریز', due_date: 'سررسید', description: 'توضیحات',
  full_name: 'نام', content: 'متن', name: 'نام', table_name: 'جدول', mapping: 'نگاشت', options: 'تنظیمات',
  updated_at: 'ویرایش', actor_id: 'کاربر', actor_name: 'نام کاربر', action: 'عملیات', target_table: 'جدول',
  details: 'جزئیات', member_name: 'نام عضو', member_national_id: 'کد ملی عضو', last_login_at: 'آخرین ورود'
};
export const colLabel = (c) => COL_LABELS[c] || c;

// Extra header spellings found in the cooperative's own Excel files (db column -> headers)
export const ALIASES = {
  first_name: ['نام'], last_name: ['نام خانوادگی'], national_id: ['کد ملی', 'کدملی', 'شماره ملی'],
  mobile: ['شماره موبایل', 'موبایل', 'تلفن همراه'], email: ['ایمیل فردی', 'ایمیل'],
  password_initial: ['پسورد اولیه', 'پسورد', 'رمز عبور', 'رمز اولیه'], parent_company: ['شرکت مادر'],
  membership_status: ['وضعیت عضویت', 'وضعیت'], cooperative: ['تعاونی', 'تعاونی (۱ یا ۲)', 'تعاونی (1 یا 2)'],
  total_paid: ['جمع پرداختی‌ها', 'جمع پرداختی', 'جمع پرداختی ها'], debt: ['میزان بدهی', 'بدهی', 'مانده بدهی'],
  score: ['امتیاز'], amount: ['مبلغ', 'مبلغ واریزی', 'مبلغ تعهد'],
  payment_date: ['تاریخ واریز', 'تاریخ'], due_date: ['سررسید', 'تاریخ سررسید', 'تاریخ'],
  description: ['توضیحات', 'شرح'], role: ['نقش']
};

// Sheet names the old workbooks used -> table
export const SHEET_TABLES = {
  members: ['members', 'اعضا', 'اعضأ', 'sheet1'], payments: ['payments', 'پرداخت‌ها', 'پرداخت', 'واریزها'],
  obligations: ['obligations', 'تعهدات', 'تعهد', 'سررسیدها'], suggestions: ['suggestions', 'پیشنهادها'],
  import_configs: ['import_configs'], audit_log: ['audit_log']
};

// Columns that identify "the same row" when comparing a file with the database
export const IMPORT_KEYS = {
  members: ['national_id'], payments: ['member_id', 'amount', 'payment_date'],
  obligations: ['member_id', 'amount', 'due_date'], suggestions: ['id'], import_configs: ['name'], audit_log: ['id']
};

// Columns shown on small screens / default order for dedicated pages
export const PRIMARY_COLS = {
  members: ['last_name', 'national_id', 'role', 'score'], payments: ['member_name', 'amount', 'payment_date'],
  obligations: ['member_name', 'amount', 'due_date'], suggestions: ['full_name', 'content', 'created_at'],
  import_configs: ['name', 'table_name', 'updated_at'], audit_log: ['created_at', 'actor_name', 'action', 'target_table']
};

// Postgres types -> editor kinds
export function kindOf(col) {
  const t = (col.type || '').toLowerCase();
  if (/^(bigint|integer|smallint|numeric|real|double)/.test(t)) return 'num';
  if (t === 'date') return 'date';
  if (t.startsWith('timestamp')) return 'datetime';
  if (t === 'boolean') return 'bool';
  if (t.startsWith('json')) return 'json';
  return 'text';
}
