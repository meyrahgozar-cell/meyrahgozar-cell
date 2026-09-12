// ============================================
// Config - Supabase & App Settings
// Replace with your own Supabase project values
// ============================================

const SUPABASE_URL = 'https://bpskhcnglurihcwvbffs.supabase.co'; // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_bNK5VJhP_DcFDrMSfEKgJg_zmxGgD6B';

// Telegram for receipt submission
const TELEGRAM_NUMBER = '+989308779454';
const TELEGRAM_LINK = `https://t.me/+989308779454`; // or https://t.me/username if preferred

// App defaults
const APP_NAME = 'برنج‌فروشی طلایی';
const CURRENCY = 'تومان';

// Export for modules (browser global for simplicity in modular vanilla)
window.APP_CONFIG = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TELEGRAM_NUMBER,
  TELEGRAM_LINK,
  APP_NAME,
  CURRENCY
};
