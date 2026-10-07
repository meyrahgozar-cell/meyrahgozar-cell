import { initThemeToggle } from './theme.js';
import { findMemberByCredentials } from './supabase-client.js';
import { saveUser, getUser } from './auth.js';
import { $, setBtnLoading, showMsg, faNum } from './utils.js';

initThemeToggle();

if (getUser()) location.replace('dashboard.html');

const form = $('#loginForm');
const btn = $('#loginBtn');
const msg = $('#authMsg');
const passToggle = $('#passToggle');
const passInput = $('#password');
const yearEl = $('#year');
if (yearEl) yearEl.textContent = faNum(new Date().getFullYear());

const ni = $('#nationalId');
ni.addEventListener('input', () => { ni.value = ni.value.replace(/\D/g, '').slice(0, 10); });

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
    const member = await findMemberByCredentials(nationalId, password);
    if (!member) {
      showMsg(msg, 'کد ملی یا رمز عبور نادرست است.', 'error');
      setBtnLoading(btn, false);
      return;
    }
    if (member.membership_status === 'انصرافی اولیه') {
      showMsg(msg, 'عضویت شما لغو شده است. با پشتیبانی تماس بگیرید.', 'error');
      setBtnLoading(btn, false);
      return;
    }
    saveUser(member, $('#remember').checked);
    showMsg(msg, 'ورود موفق. در حال انتقال…', 'ok');
    setTimeout(() => location.href = 'dashboard.html', 400);
  } catch (err) {
    console.error(err);
    showMsg(msg, 'خطا در ارتباط با سرور.', 'error');
    setBtnLoading(btn, false);
  }
});