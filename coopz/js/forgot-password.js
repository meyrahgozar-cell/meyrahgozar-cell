import { initThemeToggle } from './theme.js';
import { resetPasswordByIdentity } from './supabase-client.js';
import { $, setBtnLoading, showMsg, faNum } from './utils.js';

initThemeToggle();

const form = $('#fpForm');
const btn = $('#fpBtn');
const msg = $('#fpMsg');
const ni = $('#fpNationalId');
const mob = $('#fpMobile');

ni?.addEventListener('input', () => {
  ni.value = ni.value.replace(/\D/g, '').slice(0, 10);
});
mob?.addEventListener('input', () => {
  mob.value = mob.value.replace(/\D/g, '').slice(0, 11);
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg(msg, '');

  const nationalId = ni.value.trim();
  const mobile = mob.value.trim();
  const next = $('#fpNewPass').value;
  const confirm = $('#fpConfirm').value;

  if (!/^\d{10}$/.test(nationalId)) {
    showMsg(msg, 'کد ملی باید ۱۰ رقم باشد.', 'error');
    return;
  }
  if (mobile.length < 10) {
    showMsg(msg, 'شماره موبایل را کامل وارد کنید.', 'error');
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
    await resetPasswordByIdentity(nationalId, mobile, next);
    showMsg(msg, 'رمز با موفقیت تغییر کرد. در حال انتقال به صفحه ورود…', 'ok');
    setTimeout(() => { location.href = 'index.html'; }, 1200);
  } catch (err) {
    showMsg(msg, err.message || 'خطا در بازیابی رمز', 'error');
    setBtnLoading(btn, false);
  }
});
