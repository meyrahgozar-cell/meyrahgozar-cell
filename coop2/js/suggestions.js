import { requireAuth } from './js_auth.js';
import { renderLayout } from './js_layout.js';
import { CONFIG } from './js_config.js';
import { saveSuggestion } from './js_supabase-client.js';
import { $, faNum, setBtnLoading, showMsg, escapeHtml } from './js_utils.js';

const user = requireAuth();
if (user) renderLayout();

const form = $('#suggestionForm');
const ta = $('#suggestionText');
const counter = $('#charCount');
const btn = $('#sendBtn');
const msg = $('#suggMsg');

ta?.addEventListener('input', () => { counter.textContent = faNum(ta.value.length); });

form?.addEventListener('reset', () => {
  setTimeout(() => { counter.textContent = '۰'; showMsg(msg, ''); }, 0);
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = ta.value.trim();
  if (!text) { showMsg(msg, 'لطفاً متن پیام را وارد کنید.', 'error'); return; }
  if (!user) { showMsg(msg, 'ابتدا وارد شوید.', 'error'); return; }

  setBtnLoading(btn, true);
  showMsg(msg, '');
  const fullName = `${user.first_name} ${user.last_name}`;

  try {
    await saveSuggestion({ member_id: user.id, full_name: fullName, content: text });
  } catch (err) { console.error('Supabase error:', err); }

  try { downloadDocx(fullName, text); } catch (err) { console.warn(err); }

  const subject = encodeURIComponent(`درخواست/پیشنهاد از ${fullName}`);
  const body = encodeURIComponent(
    `نام و نام خانوادگی: ${fullName}\n` +
    `کد ملی: ${user.national_id}\n` +
    `تاریخ: ${new Date().toLocaleString('fa-IR')}\n\n` +
    `متن پیام:\n${text}`
  );
  const mailto = `mailto:${CONFIG.adminEmail}?subject=${subject}&body=${body}`;

  setBtnLoading(btn, false);
  showMsg(msg, 'پیام شما ثبت شد. برای ارسال نهایی، پنجره ایمیل باز می‌شود.', 'ok');
  setTimeout(() => { window.location.href = mailto; }, 400);
});

function downloadDocx(fullName, text) {
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40" dir="rtl" lang="fa">
    <head><meta charset="utf-8"><title>درخواست</title></head>
    <body style="font-family:Tahoma;direction:rtl">
      <h2>درخواست / پیشنهاد</h2>
      <p><b>نام و نام خانوادگی:</b> ${escapeHtml(fullName)}</p>
      <p><b>تاریخ:</b> ${new Date().toLocaleString('fa-IR')}</p>
      <hr/>
      <p style="white-space:pre-wrap">${escapeHtml(text)}</p>
    </body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = fullName.replace(/\s+/g, '_');
  a.download = `درخواست_${safe}_${Date.now()}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}