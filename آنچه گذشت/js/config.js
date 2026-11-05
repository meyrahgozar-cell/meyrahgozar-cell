/**
 * ریل — پیکربندی
 * کلید publishable برای یک اپ استاتیک امن است: همهٔ جدول‌ها با
 * row level security محافظت می‌شوند و این کلید فقط ردیف‌های کاربر واردشده را می‌بیند.
 */
export const CONFIG = {
  appName: 'ریل',
  tagline: 'مستندی از یک زندگی',
  supabaseUrl: 'https://zlvsmjhwyzfdecfyhxal.supabase.co',
  supabaseKey: 'sb_publishable_dwpPjAJGmMQbwXdqLeeQ4Q_CSEca0cm',
  bucket: 'reel-media',
  // کلید مستقل احراز هویت تا این اپ هرگز نشست هیچ اپ دیگری را نخواند یا بازنویسی نکند.
  authStorageKey: 'reel.auth.v1',
  tables: {
    entries: 'reel_entries',
    threads: 'reel_threads',
    profiles: 'reel_profiles',
    aiRuns: 'reel_ai_runs',
  },
  ai: {
    // تابع لبهٔ Supabase که متن را با OpenRouter اصلاح می‌کند.
    endpoint: 'https://zlvsmjhwyzfdecfyhxal.supabase.co/functions/v1/diary',
    freeModel: 'openrouter/free',
  },
  image: {
    maxEdge: 720,
    quality: 0.86,
    thumbEdge: 720,
  },
  pageSize: 12,
  localDb: 'reel-vault-v1',
  demoSeeds: true,
};

/** چهار سطح اصلاح متن — از کمترین دخالت تا بازآفرینی. */
export const AI_LEVELS = [
  {
    level: 1,
    name: 'اصلاح ضروری',
    short: 'کم‌ترین تغییر',
    hint: 'فقط غلط‌های املایی، نیم‌فاصله و نشانه‌گذاری. حتی یک کلمه هم جابه‌جا نمی‌شود.',
  },
  {
    level: 2,
    name: 'ویرایش',
    short: 'ویرایش روان',
    hint: 'جمله‌ها مرتب و روان می‌شوند؛ هیچ مفهوم یا جزئیاتی اضافه نمی‌شود.',
  },
  {
    level: 3,
    name: 'گسترش',
    short: 'ویرایش و افزودن',
    hint: 'متن ویرایش می‌شود و جزئیات تازه‌ای هم به آن اضافه می‌شود — هم‌راستا با حال‌وهوای نوشته.',
  },
  {
    level: 4,
    name: 'آفرینش',
    short: 'تخیل و تکمیل',
    hint: 'متن را بازمی‌آفریند: تصویر می‌سازد، ادامه می‌دهد و روایت را کامل می‌کند.',
  },
];

export const MOODS = [
  { slug: 'radiant',    label: 'درخشان',    color: 'var(--mood-radiant)',    hex: '#e9b949' },
  { slug: 'content',    label: 'خشنود',     color: 'var(--mood-content)',    hex: '#6fbf8f' },
  { slug: 'calm',       label: 'آرام',      color: 'var(--mood-calm)',       hex: '#6fa8c7' },
  { slug: 'reflective', label: 'درون‌نگر',  color: 'var(--mood-reflective)', hex: '#9d8ec9' },
  { slug: 'tender',     label: 'لطیف',      color: 'var(--mood-tender)',     hex: '#d98ba8' },
  { slug: 'restless',   label: 'بی‌قرار',   color: 'var(--mood-restless)',   hex: '#d98a5f' },
  { slug: 'heavy',      label: 'سنگین',     color: 'var(--mood-heavy)',      hex: '#7e8a9a' },
  { slug: 'fierce',     label: 'سرکش',      color: 'var(--mood-fierce)',     hex: '#cf6a6a' },
];

export const WEATHER = ['صاف', 'آفتابی', 'ابری', 'بارانی', 'طوفانی', 'برفی', 'مه‌آلود', 'بادی', 'گرم', 'سرد'];

export const PROMPTS = [
  'امروز بوی چه چیزی را داشت؟',
  'امروز متوجه چه کسی شدی، و چرا؟',
  'یک چیز کوچک را که خوب پیش رفت توصیف کن.',
  'اخیراً دربارهٔ چه چیزی نظرت عوض شد؟',
  'دربارهٔ اتاقی که در آن نشسته‌ای بنویس.',
  'چه چیزی را با خود حمل می‌کنی که می‌توانی زمین بگذاری؟',
  'نور ساعت چهار بعدازظهر چه می‌کرد؟',
  'گفت‌وگویی را ثبت کن که نمی‌خواهی فراموش کنی.',
  'خودِ جوان‌ترت در چه چیزی درست می‌اندیشید؟',
  'یک چیز را نام ببر که می‌خواهی ده سال بعد یادت باشد.',
  'صدای صبح معمولی‌ات چیست؟',
  'جایی را توصیف کن که دیگر وجود ندارد.',
  'این هفته چه طعمی بوی خانه می‌داد؟',
  'اخیراً چه کسی با تو مهربان بوده؟',
  'منتظر چه چیزی هستی، حتی کمی؟',
];

export const ACCENTS = [
  { slug: 'aurora', label: 'شفق',  hex: '#4fcf9f' },
  { slug: 'amber',  label: 'کهربا', hex: '#e7bb76' },
  { slug: 'rose',   label: 'گل سرخ', hex: '#f08ba1' },
  { slug: 'violet', label: 'بنفش', hex: '#a895f7' },
  { slug: 'ocean',  label: 'اقیانوس', hex: '#74b9f0' },
  { slug: 'clay',   label: 'گِل', hex: '#d9906f' },
];

export const AVATAR_MAX = 512;
