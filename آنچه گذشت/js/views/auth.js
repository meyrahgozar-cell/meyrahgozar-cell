/* ورود، ساخت گنجینه، پیوند جادویی و بازیابی رمز. */
import { esc, icon, qs, qsa } from '../lib/dom.js';
import { toast, openModal } from '../lib/ui.js';
import { signIn, signUp, magicLink, requestPasswordReset } from '../services/auth.js';
import { CONFIG } from '../config.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function mountAuth(container, { onAuthenticated, onLocalVault }) {
  container.innerHTML = `
  <div class="auth">
    <section class="auth__art">
      <div class="auth__brand">
        <span class="brand__mark"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="17" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="32" r="5" fill="currentColor"/><path d="M32 8v6M32 50v6M8 32h6M50 32h6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span>
        <span class="brand__text"><strong>ریل</strong><em>${esc(CONFIG.tagline)}</em></span>
      </div>

      <div>
        <h1 class="auth__headline">زندگی‌ات،<br>روی <em>نوار</em>.</h1>
        <p class="auth__lede">دفتر خاطرات نیست؛ یک مستند است — روزها، آدم‌ها، اتاق‌ها، نور. یک عکس برای هر قاب، در ۷۲۰ پیکسل، خصوصی و امن.</p>
        <ul class="auth__bullets">
          <li>${icon('camera')}<div><strong>هر قاب یک عکس دارد</strong><span>عکس را بکش داخل؛ به ۷۲۰ پیکسل کوچک می‌شود و اطلاعات مکانی‌اش پاک.</span></div></li>
          <li>${icon('chart')}<div><strong>شکل سال‌هایت را ببین</strong><span>حال‌وهوا، پیوستگی، مکان‌ها و ریتم — همه از روایت خودت.</span></div></li>
          <li>${icon('shield')}<div><strong>خصوصی از پایه</strong><span>امنیت سطح‌ردیف؛ فقط حساب خودت می‌تواند قاب‌هایت را بخواند.</span></div></li>
          <li>${icon('cloud-off')}<div><strong>بدون اینترنت هم کار می‌کند</strong><span>آنتی‌نداری؟ قاب در گنجینهٔ دستگاه می‌ماند و منتظرت می‌شود.</span></div></li>
        </ul>
      </div>

      <div class="auth__foot">
        ${icon('lock', 'ico--sm')}<span>عکس‌هایت هرگز با کیفیت کامل جایی نمی‌روند.</span>
      </div>
    </section>

    <section class="auth__panel">
      <div class="authcard">
        <div class="authcard__head">
          <h2 id="authTitle">خوش برگشتی</h2>
          <p id="authSub">وارد شو تا روایتت باز شود.</p>
        </div>

        <div class="authcard__tabs" role="tablist">
          <button data-mode="signin" class="is-on" role="tab">ورود</button>
          <button data-mode="signup" role="tab">ساخت گنجینه</button>
        </div>

        <div id="authError" hidden></div>
        <div id="authOk" hidden></div>

        <form id="authForm" novalidate>
          <label class="field">
            <span class="field__label">ایمیل</span>
            <input class="input input--lg" type="email" name="email" autocomplete="email" placeholder="you@example.com" required />
          </label>
          <label class="field" id="passwordField">
            <span class="field__label">گذرواژه</span>
            <div class="inputgroup">
              <input class="input input--lg" type="password" name="password" autocomplete="current-password" placeholder="دست‌کم ۸ کاراکتر" />
              <button class="icon-btn" type="button" id="pwToggle" style="position:absolute;inset-inline-start:4px" aria-label="نمایش گذرواژه">${icon('eye')}</button>
            </div>
            <div class="pw-meter" id="pwMeter" hidden><span></span><span></span><span></span><span></span></div>
          </label>
          <label class="field" id="nameField" hidden>
            <span class="field__label">نامت</span>
            <input class="input input--lg" type="text" name="displayName" autocomplete="name" placeholder="روایت تو را چه صدا کند؟" />
          </label>

          <div class="spread" style="margin-top:-6px" id="forgotRow">
            <span></span>
            <button type="button" class="linkbtn" id="forgotBtn">گذرواژه را فراموش کردی؟</button>
          </div>

          <button class="btn btn--primary btn--lg btn--block" type="submit" id="submitBtn">
            ${icon('arrow-left')}<span id="submitLabel">ورود</span>
          </button>
        </form>

        <div class="authcard__alt">یا</div>

        <button class="btn btn--outline btn--block" type="button" id="magicBtn">${icon('sparkles')}یک پیوند جادویی برایم بفرست</button>
        <button class="linkbtn" type="button" id="localBtn" style="justify-self:center;font-size:var(--fs-2xs);color:var(--faint)">
          بدون حساب ادامه بده — گنجینهٔ محلی روی همین دستگاه
        </button>

        <p class="authcard__legal">با ادامه، داستان خودت را برای خودت نگه می‌داری. بدون ردیابی، بدون تبلیغ، بدون شخص سوم.<br>عکس‌ها به ۷۲۰ پیکسل کوچک می‌شوند و خصوصی ذخیره می‌شوند.</p>
      </div>
    </section>
  </div>`;

  let mode = 'signin';
  const form = qs('#authForm', container);
  const emailInput = qs('input[name=email]', container);
  const pwInput = qs('input[name=password]', container);
  const errBox = qs('#authError', container);
  const okBox = qs('#authOk', container);
  const submitBtn = qs('#submitBtn', container);
  const submitLabel = qs('#submitLabel', container);

  const showError = (msg) => {
    errBox.hidden = false;
    errBox.className = 'err';
    errBox.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`;
    okBox.hidden = true;
  };
  const showOk = (msg) => {
    okBox.hidden = false;
    okBox.className = 'okmsg';
    okBox.textContent = msg;
    errBox.hidden = true;
  };
  const clearMsg = () => { errBox.hidden = true; okBox.hidden = true; };
  const busy = (state, label) => {
    submitBtn.disabled = state;
    submitLabel.textContent = label;
  };

  function setMode(next) {
    mode = next;
    clearMsg();
    qsa('.authcard__tabs button', container).forEach((b) => b.classList.toggle('is-on', b.dataset.mode === next));
    qs('#authTitle', container).textContent = next === 'signin' ? 'خوش برگشتی' : 'روایت را آغاز کن';
    qs('#authSub', container).textContent = next === 'signin'
      ? 'وارد شو تا روایتت باز شود.'
      : 'یک حساب، یک عمر قاب.';
    qs('#nameField', container).hidden = next === 'signin';
    qs('#forgotRow', container).style.visibility = next === 'signin' ? 'visible' : 'hidden';
    qs('#pwMeter', container).hidden = next === 'signin';
    submitLabel.textContent = next === 'signin' ? 'ورود' : 'گنجینه‌ام را بساز';
    pwInput.autocomplete = next === 'signin' ? 'current-password' : 'new-password';
    pwInput.value = '';
  }

  qsa('.authcard__tabs button', container).forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  qs('#pwToggle', container).addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    qs('#pwToggle', container).setAttribute('aria-label', show ? 'پنهان کردن گذرواژه' : 'نمایش گذرواژه');
    qs('#pwToggle', container).style.opacity = show ? '1' : '.6';
  });

  pwInput.addEventListener('input', () => {
    const v = pwInput.value;
    const score = [v.length >= 8, /[A-Z]/.test(v), /[0-9]/.test(v), /[^A-Za-z0-9]/.test(v)].filter(Boolean).length;
    qsa('#pwMeter span', container).forEach((s, i) => s.classList.toggle('on', i < score));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg();
    const email = emailInput.value.trim();
    const password = pwInput.value;
    const displayName = qs('input[name=displayName]', container).value.trim();

    if (!EMAIL_RE.test(email)) { showError('این نشانی ایمیل درست به نظر نمی‌رسد.'); emailInput.focus(); return; }
    if (password.length < 8) { showError('گذرواژه باید دست‌کم ۸ کاراکتر باشد.'); pwInput.focus(); return; }

    busy(true, mode === 'signin' ? 'در حال ورود…' : 'در حال ساخت…');
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const session = await signUp(email, password, displayName);
        if (!session) {
          showOk('ایمیلت را ببین و حسابت را تأیید کن، بعد وارد شو.');
          busy(false, 'گنجینه‌ام را بساز');
          setMode('signin');
          return;
        }
      }
      onAuthenticated();
    } catch (err) {
      showError(err.message || 'ورود ممکن نشد.');
      busy(false, mode === 'signin' ? 'ورود' : 'گنجینه‌ام را بساز');
    }
  });

  qs('#magicBtn', container).addEventListener('click', async () => {
    clearMsg();
    const email = emailInput.value.trim();
    if (!EMAIL_RE.test(email)) { showError('اول ایمیلت را بنویس — پیوند همان‌جا فرستاده می‌شود.'); emailInput.focus(); return; }
    try {
      await magicLink(email);
      showOk(`پیوند جادویی به ${email} فرستاده شد. همان‌جا بازش کن تا وارد شوی.`);
    } catch (err) { showError(err.message); }
  });

  qs('#forgotBtn', container).addEventListener('click', () => {
    const email = emailInput.value.trim();
    openModal({
      title: 'بازیابی گذرواژه',
      subtitle: 'یک پیوند امن برایت ایمیل می‌شود.',
      size: 'sm',
      body: `<label class="field"><span class="field__label">ایمیل</span>
        <input class="input" type="email" id="resetEmail" value="${esc(email)}" placeholder="you@example.com" /></label>
        <div id="resetMsg" style="margin-top:10px"></div>`,
      actions: [
        { label: 'بی‌خیال', onClick: (close) => close() },
        {
          label: 'بفرست',
          variant: 'primary',
          onClick: async (close, modal) => {
            const target = qs('#resetEmail', modal).value.trim();
            if (!EMAIL_RE.test(target)) { qs('#resetMsg', modal).innerHTML = '<div class="err">این ایمیل درست به نظر نمی‌رسد.</div>'; return true; }
            try {
              await requestPasswordReset(target);
              qs('#resetMsg', modal).innerHTML = `<div class="okmsg">پیوند به ${esc(target)} فرستاده شد. صندوقت را ببین.</div>`;
              toast('پیوند بازیابی فرستاده شد', { type: 'success' });
              setTimeout(close, 1200);
              return true;
            } catch (err) {
              qs('#resetMsg', modal).innerHTML = `<div class="err">${esc(err.message)}</div>`;
              return true;
            }
          },
        },
      ],
    });
  });

  qs('#localBtn', container).addEventListener('click', () => {
    localStorage.setItem('reel.localvault.v1', '1');
    onLocalVault();
  });

  emailInput.focus();
}
