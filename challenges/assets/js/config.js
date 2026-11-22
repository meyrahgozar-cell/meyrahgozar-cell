/**
 * تنظیمات پایه‌ی برنامه.
 * کلیدها همان کلید عمومی (publishable) پروژه‌ی Supabase هستند و برای اجرا در مرورگر امن‌اند.
 */
export const CONFIG = {
  appName: 'چالش کاهش وزن',
  appTagline: 'رقابت گروهی ماهانه',
  supabaseUrl: 'https://zlvsmjhwyzfdecfyhxal.supabase.co',
  supabaseKey: 'sb_publishable_dwpPjAJGmMQbwXdqLeeQ4Q_CSEca0cm',
  // جدول‌های موجود پروژه که چالش روی آن‌ها سوار می‌شود
  tables: {
    profiles: 'profiles',
    weights: 'user_weights',
    logs: 'daily_logs',
    settings: 'app_settings',
    pledges: 'challenge_pledges',
    payments: 'challenge_payments',
    settlements: 'challenge_settlements',
  },
  feeSettingKey: 'challenge_fee',
  defaultFee: 250000,
  currency: 'تومان',
  measurementHours: [
    '۰۶:۰۰', '۰۷:۰۰', '۰۸:۰۰', '۰۹:۰۰', '۱۰:۰۰', '۱۱:۰۰', '۱۲:۰۰',
    '۱۳:۰۰', '۱۴:۰۰', '۱۵:۰۰', '۱۶:۰۰', '۱۷:۰۰', '۱۸:۰۰', '۱۹:۰۰',
    '۲۰:۰۰', '۲۱:۰۰', '۲۲:۰۰', '۲۳:۰۰',
  ],
  stomachStates: [
    { value: 'empty', label: 'ناشتا / معده خالی', hint: 'بهترین حالت برای مقایسه' },
    { value: 'light', label: 'سبک (میان‌وعده)', hint: 'تا حدی قابل مقایسه' },
    { value: 'full', label: 'پر (بعد از غذا)', hint: 'برای مقایسه دقیق مناسب نیست' },
  ],
  genders: [
    { value: 'female', label: 'زن' },
    { value: 'male', label: 'مرد' },
  ],
  activityLevels: [
    { value: 'sedentary', label: 'کم‌تحرک (کار نشسته)', factor: 1.2 },
    { value: 'light', label: 'تحرک سبک (۱–۲ روز ورزش)', factor: 1.375 },
    { value: 'moderate', label: 'تحرک متوسط (۳–۵ روز ورزش)', factor: 1.55 },
    { value: 'active', label: 'پرتحرک (۶–۷ روز ورزش)', factor: 1.725 },
    { value: 'athlete', label: 'ورزشکار حرفه‌ای', factor: 1.9 },
  ],
  bmi: {
    safeMin: 18.5,
    safeMax: 24.9,
    bands: [
      { max: 18.4, label: 'کمبود وزن', tone: 'sky' },
      { max: 24.9, label: 'وزن نرمال', tone: 'brand' },
      { max: 29.9, label: 'اضافه وزن', tone: 'gold' },
      { max: 34.9, label: 'چاقی درجه ۱', tone: 'gold' },
      { max: 39.9, label: 'چاقی درجه ۲', tone: 'danger' },
      { max: 99, label: 'چاقی درجه ۳', tone: 'danger' },
    ],
  },
};
