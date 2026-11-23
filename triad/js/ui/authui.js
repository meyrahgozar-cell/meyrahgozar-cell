// ---------------------------------------------------------------------------
// authui.js — sign-in / sign-up / magic link + account drawer.
// ---------------------------------------------------------------------------
import { h, clear } from '../core/dom.js';
import { icon } from './icons.js';
import { modal, drawer, toast, confirm } from './overlay.js';
import { signIn, signUp, magicLink, signOut, supabaseClient, currentSession, ensureProfile } from '../core/auth.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { sfx } from './sounds.js';
import { avatar } from './bits.js';

let currentTab = 'signin';

export function openAuth(tab = 'signin') {
  currentTab = tab;
  const body = h('div', { class: 'auth-panel' });
  const m = modal({
    title: 'Cloud session',
    iconName: 'lock',
    size: 'sm',
    body,
    footer: null
  });

  function render() {
    clear(body);
    const tabs = h('div', { class: 'auth-tabs' },
      h('button', { class: currentTab === 'signin' ? 'is-active' : '', onClick: () => { currentTab = 'signin'; render(); } }, 'Sign in'),
      h('button', { class: currentTab === 'signup' ? 'is-active' : '', onClick: () => { currentTab = 'signup'; render(); } }, 'Create account'),
      h('button', { class: currentTab === 'magic' ? 'is-active' : '', onClick: () => { currentTab = 'magic'; render(); } }, 'Magic link')
    );
    body.appendChild(tabs);

    const email = h('input', { class: 'input', type: 'email', placeholder: 'you@domain.com', autocomplete: 'email', autofocus: 'true' });
    const password = h('input', { class: 'input', type: 'password', placeholder: '••••••••', autocomplete: 'current-password' });
    const name = h('input', { class: 'input', type: 'text', placeholder: 'Display name', autocomplete: 'name' });
    const submit = h('button', { class: 'btn btn--primary full' }, 'Sign in');

    const err = h('div', { class: 'hint', style: { color: 'var(--bad)', minHeight: '14px' } });

    async function go() {
      err.textContent = '';
      submit.setAttribute('aria-disabled', 'true');
      submit.textContent = 'Working…';
      try {
        if (currentTab === 'magic') {
          if (!email.value.trim()) throw new Error('Email required');
          await magicLink(email.value.trim());
          toast({ kind: 'ok', title: 'Link sent', text: 'Check your inbox to finish signing in.' });
          m.close();
          return;
        }
        if (!email.value.trim() || !password.value) throw new Error('Email and password required');
        if (currentTab === 'signup') {
          const res = await signUp(email.value.trim(), password.value, name.value.trim());
          if (!res.session) {
            toast({ kind: 'ok', title: 'Account created', text: 'Confirm your email, then sign in.' });
            currentTab = 'signin';
            render();
            return;
          }
          toast({ kind: 'ok', title: 'Welcome', text: 'Cloud session active.' });
        } else {
          await signIn(email.value.trim(), password.value);
          toast({ kind: 'ok', title: 'Signed in', text: 'Writes now go to the cloud cube.' });
        }
        const session = await currentSession();
        store.setSession(session);
        if (session?.user) await ensureProfile(session.user, name.value.trim());
        bus.emit(EV.TOAST, { kind: 'ok', text: 'Session started' });
        m.close();
        await store.load();
        bus.emit(EV.DATA_CHANGED, { reason: 'auth' });
      } catch (e) {
        err.textContent = e.message || 'Failed';
        sfx.play('error');
      } finally {
        submit.removeAttribute('aria-disabled');
        submit.textContent = currentTab === 'signup' ? 'Create account' : currentTab === 'magic' ? 'Send link' : 'Sign in';
      }
    }

    submit.addEventListener('click', go);
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

    body.append(
      currentTab === 'signup' ? h('div', { class: 'field' }, h('label', {}, 'Display name'), name) : null,
      h('div', { class: 'field' }, h('label', {}, 'Email'), email),
      currentTab !== 'magic' ? h('div', { class: 'field' }, h('label', {}, 'Password'), password) : null,
      err,
      submit,
      h('div', { class: 'auth-note' },
        icon('info', { size: 13 }),
        h('span', {}, currentTab === 'magic'
          ? 'A one-time link is emailed to you. No password needed.'
          : 'Signing in unlocks writes to the shared cloud cube. Reads work without an account.')
      )
    );
    submit.textContent = currentTab === 'signup' ? 'Create account' : currentTab === 'magic' ? 'Send link' : 'Sign in';
  }

  render();
  return m;
}

export function openAccount() {
  const session = store.session;
  const body = h('div', { class: 'grid gap-4' });
  if (session?.user) {
    body.append(
      h('div', { class: 'flex items-center gap-3' },
        avatar({ fullName: session.user.email, slug: session.user.email, metadata: { hue: 168 } }, { size: 'lg' }),
        h('div', {},
          h('div', { class: 'strong' }, session.user.email),
          h('div', { class: 'mono tiny dim' }, `uid ${session.user.id.slice(0, 8)}…`)
        )
      ),
      h('div', { class: 'info-grid' },
        h('div', { class: 'info-cell' }, h('span', {}, 'source'), h('b', {}, store.mode)),
        h('div', { class: 'info-cell' }, h('span', {}, 'writes'), h('b', {}, store.canWrite ? 'enabled' : 'read-only')),
        h('div', { class: 'info-cell' }, h('span', {}, 'cells'), h('b', {}, String(store.scores.length)))
      ),
      h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn', onClick: () => { d.close(); openAuth('signin'); } }, icon('refresh', { size: 13 }), 'Re-authenticate'),
        h('button', {
          class: 'btn btn--danger',
          onClick: async () => {
            const ok = await confirm({ title: 'Sign out?', text: 'Local preferences stay on this device.', confirmLabel: 'Sign out', danger: true, iconName: 'logout' });
            if (!ok) return;
            await signOut();
            store.setSession(null);
            d.close();
            await store.load();
            toast({ kind: 'info', text: 'Signed out — local mode' });
          }
        }, icon('logout', { size: 13 }), 'Sign out')
      )
    );
  } else {
    body.append(
      h('div', { class: 'empty' },
        icon('lock', { size: 28 }),
        h('b', {}, 'No cloud session'),
        h('p', {}, 'You are working in local mode. Sign in to write into the shared cube.')
      ),
      h('button', { class: 'btn btn--primary full', onClick: () => { d.close(); openAuth('signin'); } }, icon('login', { size: 14 }), 'Sign in')
    );
  }
  const d = drawer({ title: 'Account', iconName: 'user', body, side: 'right' });
  return d;
}

export function installAuthBus() {
  bus.on('action:auth', () => openAuth('signin'));
  bus.on('action:account', () => openAccount());
}
