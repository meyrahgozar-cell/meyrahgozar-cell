import { initThemeToggle } from './theme.js';
import { login, getUser } from './auth.js';
import { startBrickComets } from './fx.js';
import { $, setBtnLoading, showMsg, faNum } from './utils.js';

initThemeToggle();
startBrickComets();

if (getUser()) location.replace('dashboard.html');

const form = $('#loginForm');
const btn = $('#loginBtn');
const msg = $('#authMsg');
const passToggle = $('#passToggle');
const passInput = $('#password');
const yearEl = $('#year');
if (yearEl) yearEl.textContent = faNum(new Date().getFullYear());

const ni = $('#nationalId');
const toEn = (v) => v.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
ni.addEventListener('input', () => { ni.value = toEn(ni.value).replace(/\D/g, '').slice(0, 10); });

passToggle?.addEventListener('click', () => {
  passInput.type = passInput.type === 'password' ? 'text' : 'password';
  passToggle.classList.toggle('is-shown', passInput.type === 'text');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg(msg, '');
  const nationalId = ni.value.trim();
  const password = passInput.value;

  if (!/^\d{10}$/.test(nationalId)) { showMsg(msg, 'کد ملی باید ۱۰ رقم باشد.', 'error'); return; }
  if (!password) { showMsg(msg, 'رمز عبور را وارد کنید.', 'error'); return; }

  setBtnLoading(btn, true);
  try {
    const res = await login(nationalId, password, $('#remember').checked);
    if (!res.ok) {
      const text = res.error === 'invalid_credentials' ? 'کد ملی یا رمز عبور نادرست است.'
        : res.error === 'membership_cancelled' ? 'عضویت شما لغو شده است. با پشتیبانی تماس بگیرید.'
        : res.error === 'too_many_attempts' ? `تلاش‌های ناموفق زیاد بود. ${faNum(Math.ceil((res.retryAfter || 60) / 60))} دقیقه دیگر دوباره تلاش کنید.`
        : 'خطا در ارتباط با سرور.';
      showMsg(msg, text, 'error');
      setBtnLoading(btn, false);
      return;
    }
    showMsg(msg, 'ورود موفق. در حال انتقال…', 'ok');
    setTimeout(() => location.href = 'dashboard.html', 400);
  } catch (err) {
    console.error(err);
    showMsg(msg, 'خطا در ارتباط با سرور.', 'error');
    setBtnLoading(btn, false);
  }
});