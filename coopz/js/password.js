import { requireAuth } from './auth.js';
import { renderLayout } from './layout.js';
import { changePassword } from './supabase-client.js';
import { $, setBtnLoading, showMsg, bindPassToggles } from './utils.js';

const user = requireAuth();
if (user) renderLayout();

bindPassToggles();

const form = $('#passForm');
const btn = $('#passBtn');
const msg = $('#passMsg');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg(msg, '');

  const current = $('#currentPass').value;
  const next = $('#newPass').value;
  const confirm = $('#confirmPass').value;

  if (!current) {
    showMsg(msg, 'رمز فعلی را وارد کنید.', 'error');
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
  if (next === current) {
    showMsg(msg, 'رمز جدید باید با رمز فعلی متفاوت باشد.', 'error');
    return;
  }

  setBtnLoading(btn, true);
  try {
    await changePassword(user.id, current, next);
    showMsg(msg, 'رمز با موفقیت تغییر کرد. از این پس با رمز جدید وارد شوید.', 'ok');
    form.reset();
    document.querySelectorAll('.pass-toggle').forEach(t => {
      t.classList.remove('is-shown');
      t.setAttribute('aria-label', 'نمایش رمز');
    });
    ['currentPass', 'newPass', 'confirmPass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.type = 'password';
    });
  } catch (err) {
    showMsg(msg, err.message || 'خطا در تغییر رمز', 'error');
  } finally {
    setBtnLoading(btn, false);
  }
});
