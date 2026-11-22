/** مربی هوشمند: گفت‌وگوی فارسی روی داده‌ی واقعی کاربر (BMI، روند، کالری، شانس جایزه). */
import { state, store } from '../store.js';
import {
  h, icon, fmt, faDigits, money, avatarTone, initials, toast,
} from '../utils.js';
import { pageHead, sectionHead, loginPrompt, statCard } from '../ui/shell.js';
import { coachAnswer, SUGGESTED_QUESTIONS, statusFor } from '../ai.js';
import { openPledgeModal } from '../ui/join.js';
import { relativeDay } from '../jalali.js';

let messages = null;
let dirty = false;

function aiBubble(payload) {
  return h('div.msg', {},
    h('span.avatar.sm.brand', {}, icon('sparkles', 15)),
    h('div.msg-bubble', {},
      h('h4', {}, payload.title),
      ...(payload.paragraphs || []).map((p) => h('p', { style: { marginBottom: '6px' } }, p)),
      payload.list?.length ? h('ul', {}, ...payload.list.map((li) => h('li', {}, li))) : null,
      payload.cta ? h('a.btn.sm.ghost.msg-cta', { href: payload.cta.href }, payload.cta.label) : null,
    ),
  );
}

function userBubble(text) {
  return h('div.msg.me', {},
    h('span.avatar.sm', {}, 'شما'),
    h('div.msg-bubble', {}, text),
  );
}

function typingBubble() {
  return h('div.msg', { id: 'typing' },
    h('span.avatar.sm.brand', {}, icon('sparkles', 15)),
    h('div.msg-bubble', {}, h('span.typing', {}, h('i'), h('i'), h('i'))),
  );
}

export async function render(root) {
  if (!store.isLoggedIn) {
    loginPrompt(root, 'مربی هوشمند با داده‌ی شخصی شما کار می‌کند؛ برای شروع وارد شو.');
    return;
  }
  const profile = state.profile;
  const round = store.round;
  const pledge = store.myPledge();
  const board = store.board();
  const me = store.myAnalysis();

  root.append(pageHead(
    'مربی هوشمند',
    'تحلیل داده‌ی وزن، BMI، روند، کالری و شانس جایزه — همه در مرورگر و روی داده‌ی خودت.',
    [h('a.btn.ghost', { href: '#/profile' }, icon('user', 16), 'شرایط BMI')],
  ));

  if (!pledge) {
    root.append(
      h('div.alert.warn.mb-16', {},
        h('span', { html: icon('alert', 18) }),
        h('div.grow', {}, 'برای تحلیل دقیق، اول تعهد این ماه و اطلاعات BMI را کامل کن.'),
        h('button.btn.sm.primary', { onClick: () => openPledgeModal() }, 'ثبت تعهد'),
      ),
    );
  }

  if (!messages) {
    messages = [{
      role: 'ai',
      payload: coachAnswer('', { analysis: me, board, profile, round }),
    }];
    dirty = true;
  }
  if (dirty) {
    messages = [{
      role: 'ai',
      payload: coachAnswer('', { analysis: me, board, profile, round }),
    }, ...messages.slice(1)];
    dirty = false;
  }

  const chatBody = h('div.chat-body');
  const input = h('textarea', {
    rows: 1,
    placeholder: 'مثلاً: چرا وزنم ثابت مانده؟ چقدر تا تعهد مانده؟',
    'aria-label': 'پرسش از مربی',
  });
  const sendBtn = h('button.btn.primary', { type: 'button', 'aria-label': 'ارسال', onClick: () => send() }, icon('send', 17));

  function paint(scroll = true) {
    chatBody.replaceChildren(...messages.map((m) => {
      if (m.role === 'user') return userBubble(m.text);
      if (m.role === 'typing') return typingBubble();
      return aiBubble(m.payload);
    }));
    if (scroll) requestAnimationFrame(() => { chatBody.scrollTop = chatBody.scrollHeight; });
  }

  function send(text) {
    const question = (text ?? input.value).trim();
    if (!question) return;
    const ctx = { analysis: me, board, profile, round };
    messages.push({ role: 'user', text: question });
    messages.push({ role: 'typing' });
    input.value = '';
    paint();
    setTimeout(() => {
      messages = messages.filter((m) => m.role !== 'typing');
      messages.push({ role: 'ai', payload: coachAnswer(question, ctx) });
      paint();
    }, 650);
  }

  input.addEventListener('keydown', (e) => {
    const softKeyboard = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !softKeyboard) {
      e.preventDefault();
      send();
    }
  });

  const suggestions = h('div.chat-suggest', {},
    ...SUGGESTED_QUESTIONS.map((q) => h('button.chip', { onClick: () => send(q) }, q)),
  );

  const chatCard = h('div.chat-card.card', {},
    h('div.chat-head', {},
      h('span.avatar.brand', {}, icon('sparkles', 18)),
      h('div.grow', {},
        h('div.strong', {}, 'مربی هوشمند'),
        h('div.tiny.muted', {}, 'تحلیل محلی بر اساس داده‌ی ثبت‌شده‌ی شما'),
      ),
      h('button.icon-btn', {
        title: 'گفت‌وگوی جدید',
        onClick: () => {
          messages = null;
          render(root);
        },
        html: icon('refresh', 17),
      }),
    ),
    chatBody,
    suggestions,
    h('div.chat-input', {}, input, sendBtn),
  );

  /* ------------------------------------------------------------ side cards */
  const status = me ? statusFor(me) : null;
  const side = h('div.coach-side', {},
    me
      ? h('div.card', {},
        h('div.card-head', {}, h('h3.card-title', {}, icon('chart', 17), 'خلاصه‌ی تحلیل')),
        h('div.kv', {},
          h('div.kv-row', {}, h('span', {}, 'وزن فعلی'), h('strong', {}, `${fmt(me.current)} کیلو`)),
          h('div.kv-row', {}, h('span', {}, 'BMI'), h('strong', { class: `tone-${me.band.tone}` }, `${fmt(me.bmi)} (${me.band.label})`)),
          h('div.kv-row', {}, h('span', {}, 'تا تعهد'), h('strong', {}, me.remaining > 0 ? `${fmt(me.remaining)} کیلو` : 'رسیده')),
          h('div.kv-row', {}, h('span', {}, 'پیش‌بینی پایان ماه'), h('strong', {}, `${fmt(me.projectedFinal)} کیلو`)),
          h('div.kv-row', {}, h('span', {}, 'سرعت هفتگی'), h('strong', {}, `${fmt(me.ratePerWeek)} کیلو`)),
          h('div.kv-row', {}, h('span', {}, 'شانس قرعه‌کشی'), h('strong', {}, `${faDigits(me.chance)} بلیت`)),
        ),
        status ? h('div.mt-12', {}, h('span', { class: `badge ${status.tone}` }, status.label)) : null,
      )
      : null,
    me?.risks?.length
      ? h('div.card', {},
        h('div.card-head', {}, h('h3.card-title', {}, icon('alert', 17), 'نکات مهم')),
        h('div.stack', {}, ...me.risks.slice(0, 4).map((r) => h('div', { class: `insight ${r.level === 'high' ? 'danger' : r.level === 'medium' ? 'warn' : ''}` },
          h('span', { html: icon('alert', 15) }),
          h('div', {}, r.text),
        ))),
      )
      : null,
    h('div.card', {},
      h('div.card-head', {}, h('h3.card-title', {}, icon('sparkles', 17), 'توصیه‌های امروز')),
      h('div.stack', {}, ...(me?.tips || []).slice(0, 3).map((t) => h('div.insight', {},
        h('span', { html: icon(t.icon, 15) }),
        h('div', {}, h('strong', {}, t.title), t.text),
      ))),
    ),
    h('div.card', {},
      h('div.card-head', {}, h('h3.card-title', {}, icon('trophy', 17), 'شانس جایزه')),
      h('p.small.muted', {}, `استخر فعلی ${money(store.poolForRound())} است و ${faDigits(board.filter((b) => b.compliant).length)} نفر به تعهد رسیده‌اند.`),
      h('div.row.gap-8.mt-8', {},
        h('a.chip', { href: '#/overall' }, icon('trophy', 14), 'جدول شانس'),
        h('a.chip', { href: '#/rules' }, icon('book', 14), 'قوانین'),
      ),
    ),
  );

  root.append(
    h('div.coach-shell.mt-16', {}, chatCard, side),
    h('div.alert.info.mt-16', {},
      h('span', { html: icon('info', 18) }),
      h('div', {}, 'این مربی یک موتور تحلیل محلی است و جایگزین پزشک یا متخصص تغذیه نیست. برای رژیم دارویی یا بیماری زمینه‌ای با پزشک مشورت کن.'),
    ),
  );

  paint();
}
