import { initThemeToggle } from './theme.js';
import { resetPasswordByIdentity } from './supabase-client.js';
import { $, setBtnLoading, showMsg, bindPassToggles } from './utils.js';

initThemeToggle();
bindPassToggles();

const form = $('#fpForm');
const btn = $('#fpBtn');
const msg = $('#fpMsg');
const ni = $('#fpNationalId');
const emailEl = $('#fpEmail');

ni?.addEventListener('input', () => {
  ni.value = ni.value.replace(/\D/g, '').slice(0, 10);
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg(msg, '');

  const nationalId = ni.value.trim();
  const email = (emailEl.value || '').trim().toLowerCase();
  const next = $('#fpNewPass').value;
  const confirm = $('#fpConfirm').value;

  if (!/^\d{10}$/.test(nationalId)) {
    showMsg(msg, 'کد ملی باید ۱۰ رقم باشد.', 'error');
    return;
  }
  if (!email || !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(email)) {
    showMsg(msg, 'ایمیل معتبر وارد کنید.', 'error');
    return;
  }
  if (next.length < 4) {
    showMsg(msg, 'رمز جدید حداقل ۴ کاراکتر باشد.', 'error');
    return;
  }
  if (next !== confirm) {
    showMsg(msg, 'رمز جدید و تکرار آن یکسان نیستند.', 'error');
    return;
  }

  setBtnLoading(btn, true);
  try {
    await resetPasswordByIdentity(nationalId, email, next);
    showMsg(msg, 'رمز با موفقیت تغییر کرد. در حال انتقال به صفحه ورود…', 'ok');
    setTimeout(() => { location.href = 'index.html'; }, 1200);
  } catch (err) {
    showMsg(msg, err.message || 'خطا در بازیابی رمز', 'error');
    setBtnLoading(btn, false);
  }
});
