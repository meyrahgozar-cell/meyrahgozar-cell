/** ورود و ثبت‌نام با Supabase Auth. */
import { state, store } from '../store.js';
import { h, icon, field, toast } from '../utils.js';
import { pageHead } from '../ui/shell.js';

export async function render(root, { params } = {}) {
  const next = params?.get('next') || '/';

  if (store.isLoggedIn) {
    root.append(
      pageHead('حساب کاربری', 'شما وارد شده‌اید.'),
      h('div.card', { style: { maxWidth: '560px', margin: '0 auto' } },
        h('div.empty', {},
          h('span.avatar.lg.brand', {}, state.profile.full_name?.[0] || 'ک'),
          h('strong', {}, state.profile.full_name || 'کاربر'),
          h('p', {}, state.sessionUser?.email || ''),
          h('div.row.gap-8.mt-8', {},
            h('a.btn.primary', { href: '#/profile' }, 'پروفایل من'),
            h('a.btn.ghost', { href: '#/report' }, 'گزارش من'),
            h('a.btn.ghost', { href: '#/' }, 'خانه'),
          ),
        ),
      ),
    );
    return;
  }

  let mode = 'login';
  const errorBox = h('div');
  const nameInput = h('input.input', { type: 'text', placeholder: 'نام و نام خانوادگی', autocomplete: 'name' });
  const emailInput = h('input.input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'email', dir: 'ltr' });
  const passInput = h('input.input', { type: 'password', placeholder: 'حداقل ۶ کاراکتر', autocomplete: 'current-password' });
  const nameField = field('نام و نام خانوادگی', nameInput);
  const titleEl = h('h2', { style: { fontSize: '20px' } }, 'ورود به حساب');
  const subEl = h('p.small.muted', {}, 'برای ثبت وزن، تعهد و دیدن گزارش شخصی وارد شو.');
  const submitBtn = h('button.btn.primary.lg.block', { type: 'submit' }, icon('lock', 17), 'ورود');
  const switchBtn = h('button', { type: 'button' }, 'ثبت‌نام کن');

  function setMode(nextMode) {
    mode = nextMode;
    const signup = mode === 'signup';
    titleEl.textContent = signup ? 'ساخت حساب جدید' : 'ورود به حساب';
    subEl.textContent = signup
      ? 'با ثبت‌نام، اولین تعهد وزن خودت را ثبت کن.'
      : 'برای ثبت وزن، تعهد و دیدن گزارش شخصی وارد شو.';
    submitBtn.replaceChildren(
      h('span', { html: icon(signup ? 'user' : 'lock', 17) }),
      signup ? 'ثبت‌نام' : 'ورود',
    );
    nameField.style.display = signup ? '' : 'none';
    passInput.autocomplete = signup ? 'new-password' : 'current-password';
    switchBtn.textContent = signup ? 'وارد شو' : 'ثبت‌نام کن';
    errorBox.replaceChildren();
  }

  switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

  const form = h('form.stack', {
    onSubmit: async (e) => {
      e.preventDefault();
      errorBox.replaceChildren();
      const email = emailInput.value.trim();
      const password = passInput.value;
      if (!email || !email.includes('@')) {
        errorBox.replaceChildren(h('div.alert.danger', {}, h('span', { html: icon('alert', 17) }), h('div', {}, 'ایمیل معتبر وارد کن.')));
        return;
      }
      if (password.length < 6) {
        errorBox.replaceChildren(h('div.alert.danger', {}, h('span', { html: icon('alert', 17) }), h('div', {}, 'رمز عبور باید حداقل ۶ کاراکتر باشد.')));
        return;
      }
      if (mode === 'signup' && nameInput.value.trim().length < 3) {
        errorBox.replaceChildren(h('div.alert.danger', {}, h('span', { html: icon('alert', 17) }), h('div', {}, 'نام و نام خانوادگی را کامل وارد کن.')));
        return;
      }
      submitBtn.disabled = true;
      try {
        if (mode === 'login') {
          await store.signIn(email, password);
          toast('خوش برگشتی!', 'success');
          location.hash = `#${next}`;
        } else {
          const res = await store.signUp(email, password, nameInput.value.trim());
          if (res.needsConfirm) {
            errorBox.replaceChildren(h('div.alert.success', {},
              h('span', { html: icon('mail', 17) }),
              h('div', {}, 'حساب ساخته شد. برای تأیید به ایمیلت مراجعه کن و روی لینک تأیید بزن؛ بعد وارد شو.'),
            ));
          } else {
            toast('حساب ساخته شد. خوش آمدی!', 'success');
            location.hash = `#${next === '/' ? '/profile' : next}`;
          }
        }
      } catch (err) {
        errorBox.replaceChildren(h('div.alert.danger', {},
          h('span', { html: icon('alert', 17) }),
          h('div', {}, err.message || 'خطا در ورود.'),
        ));
      } finally {
        submitBtn.disabled = false;
      }
    },
  });

  form.append(nameField, field('ایمیل', emailInput), field('رمز عبور', passInput), errorBox, submitBtn);

  const card = h('div.card.auth-card', {},
    h('div.mb-16', {}, titleEl, subEl),
    form,
    h('div.auth-switch', {}, mode === 'login' ? 'حساب نداری؟ ' : 'حساب داری؟ ', switchBtn),
  );

  const aside = h('div.auth-aside', {},
    h('span.badge.brand', {}, icon('trophy', 13), 'چالش ماهانه'),
    h('h3', {}, 'به جمع کسانی بپیوند که هر کیلو تعهدشان یک بلیت شانس است.'),
    h('ul', {},
      ...[
        'جدول زنده‌ی وزن شروع، وزن فعلی و تعهد پایان ماه',
        'ثبت روزانه با ساعت اندازه‌گیری و وضعیت معده',
        'تحلیل BMI، کالری و روند با مربی هوشمند',
        'گزارش شخصی با نمودار و خروجی CSV',
        'استخر جایزه و قرعه‌کشی شفاف با بلیت وزنی',
      ].map((t) => h('li', {}, h('span', { html: icon('check', 15) }), t)),
    ),
    h('div.formula', {}, 'هر کیلو تعهد = یک بلیت • فقط کسانی که به تعهد برسند شانس دارند'),
  );

  setMode('login');
  root.append(pageHead('ورود و عضویت', 'حساب بساز، تعهدت را ثبت کن و چالش را شروع کن.'), h('div.auth-wrap', {}, card, aside));
}
