/** گزارش کلی: جدول کامل، شانس‌ها، شبیه‌سازی و قرعه‌کشی جایزه. */
import { state, store } from '../store.js';
import { CONFIG } from '../config.js';
import {
  h, icon, fmt, money, faDigits, toast, modal, confirmDialog, avatarTone, initials, downloadFile, csvEscape,
} from '../utils.js';
import { pageHead, sectionHead, statCard } from '../ui/shell.js';
import { statusFor } from '../ai.js';
import { drawWinner, simulate, equalSplit } from '../lottery.js';
import { formatJalali } from '../jalali.js';

const TICKET_TONES = ['brand', 'sky', 'gold', 'violet', 'rose', 'mint'];

function leaderboard(board, round) {
  return h('div.table-wrap', {},
    h('table.data', {},
      h('thead', {}, h('tr', {},
        h('th', {}, '#'),
        h('th', {}, 'شرکت‌کننده'),
        h('th.num', {}, 'وزن شروع'),
        h('th.num', {}, 'وزن فعلی'),
        h('th.num', {}, 'تعهد پایان ماه'),
        h('th.num', {}, 'کاهش'),
        h('th.num', {}, 'BMI'),
        h('th', {}, 'پیشرفت'),
        h('th', {}, 'وضعیت'),
        h('th.num', {}, 'بلیت'),
        h('th', {}, 'سهم'),
      )),
      h('tbody', {}, ...board.map((row) => {
        const status = statusFor(row);
        const delta = row.current - row.start;
        return h('tr', { class: row.userId === state.sessionUser?.id ? 'me' : '' },
          h('td', {}, h('span', { class: `rank-pill ${row.rank === 1 ? 'gold' : row.rank === 2 ? 'silver' : row.rank === 3 ? 'bronze' : ''}` }, faDigits(row.rank))),
          h('td', {},
            h('div.cell-user', {},
              h('span', { class: `avatar sm ${avatarTone(row.userId)}` }, initials(row.name)),
              h('div', {}, h('strong', {}, row.name), h('small', {}, row.city || '—')),
            ),
          ),
          h('td.num', {}, fmt(row.start)),
          h('td.num', {}, h('strong', {}, fmt(row.current))),
          h('td.num', {}, h('span.badge.gold', {}, fmt(row.promised))),
          h('td.num', {}, h('span', { class: `delta ${delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat'}` }, `${delta > 0 ? '+' : ''}${fmt(Math.abs(delta))}`)),
          h('td.num', {}, row.bmi ? fmt(row.bmi) : '—'),
          h('td', {}, h('div.progress.thin', {}, h('span', { style: { width: `${Math.min(100, row.progress)}%` } }))),
          h('td', {}, h('span', { class: `badge ${status.tone}` }, status.label)),
          h('td.num', {}, h('span.badge.violet', {}, faDigits(row.chance))),
          h('td', {}, h('span', { class: `badge ${row.paid ? 'brand' : 'muted'}` }, row.paid ? 'پرداخت‌شده' : 'در انتظار')),
        );
      })),
    ),
    h('div.table-note', {}, `مبنای رتبه‌بندی: درصد پیشرفت نسبت به تعهد. دوره‌ی ${round.title}.`),
  );
}

function poolBox(board) {
  const pool = store.poolForRound();
  const paid = board.filter((b) => b.paid);
  const eligible = board.filter((b) => b.compliant && b.paid);
  const totalChance = eligible.reduce((a, b) => a + b.chance, 0);
  const fee = store.round?.fee || CONFIG.defaultFee;
  const pending = board.length - paid.length;

  return h('div.pool-box', {},
    h('div.row-between.wrap', {},
      h('div', {},
        h('div.prize-label', {}, icon('trophy', 15), 'استخر جایزه‌ی این دوره'),
        h('div.pool-amount', {}, money(pool)),
        h('div.small.muted', {}, `${faDigits(paid.length)} سهم از ${faDigits(board.length)} شرکت‌کننده پرداخت شده • سهم هر نفر ${money(fee)}`),
      ),
      h('div.center', {},
        h('div.badge.lg.gold', {}, icon('crown', 14), `${faDigits(eligible.length)} نفر واجد شرایط`),
        h('div.tiny.muted.mt-4', {}, `${faDigits(totalChance)} بلیت در قرعه‌کشی`),
      ),
    ),
    h('div.pool-split', {},
      h('div', {}, h('span', {}, 'سهم مساوی بین واجدین'), h('strong', {}, money(equalSplit(pool, eligible.length)))),
      h('div', {}, h('span', {}, 'شانس مساوی هر نفر'), h('strong', {}, eligible.length ? `${faDigits(Math.round(100 / eligible.length))}٪` : '—')),
      h('div', {}, h('span', {}, 'پرداخت‌های در انتظار'), h('strong', {}, faDigits(pending))),
      h('div', {}, h('span', {}, 'مجموع کیلوهای تعهد'), h('strong', {}, `${fmt(board.reduce((a, b) => a + b.promiseKg, 0))} کیلو`)),
    ),
  );
}

function chancesPanel(board) {
  const paidEligible = board.filter((b) => b.compliant && b.paid);
  const allEligible = paidEligible;
  const unreached = board.filter((b) => b.compliant && !b.paid);
  const total = allEligible.reduce((a, b) => a + b.chance, 0);

  const strip = h('div.ticket-strip', {},
    ...allEligible.map((row, i) => h('i', {
      style: { width: `${(row.chance / (total || 1)) * 100}%`, background: `var(--${TICKET_TONES[i % TICKET_TONES.length]})` },
      title: `${row.name}: ${row.chance} بلیت`,
    })),
  );

  const list = h('div.chance-list', {},
    ...(allEligible.length
      ? [...allEligible].sort((a, b) => b.chance - a.chance).map((row) => h('div.chance-row', {},
        h('span', { style: { width: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.name),
        h('div.chance-bar', {}, h('span', { style: { width: `${(row.chance / total) * 100}%` } })),
        h('span.chance-num', {}, `${faDigits(row.chance)} بلیت • ${faDigits(Math.round((row.chance / total) * 100))}٪`),
        row.paid ? null : h('span.badge.gold.tiny', {}, 'پرداخت نشده'),
      ))
      : [h('p.muted.small', {}, 'هیچ شرکت‌کننده‌ای هنوز به وزن تعهد نرسیده است.')]),
  );

  const simHost = h('div');
  const simBtn = h('button.btn.ghost.sm', {
    onClick: () => {
      const results = simulate(board.map((b) => ({ id: b.userId, name: b.name, chance: b.chance, compliant: b.compliant && b.paid })), 5000);
      simHost.replaceChildren(
        h('div.table-wrap.mt-12', {},
          h('table.data', { style: { minWidth: '420px' } },
            h('thead', {}, h('tr', {}, h('th', {}, 'شرکت‌کننده'), h('th.num', {}, 'بلیت'), h('th.num', {}, 'برد در ۵۰۰۰ شبیه‌سازی'), h('th.num', {}, 'احتمال'))),
            h('tbody', {}, ...results.sort((a, b) => b.wins - a.wins).map((r) => h('tr', {},
              h('td', {}, r.name),
              h('td.num', {}, faDigits(r.chance)),
              h('td.num', {}, faDigits(r.wins)),
              h('td.num', {}, `${faDigits(r.share.toFixed(1))}٪`),
            ))),
          ),
        ),
      );
    },
  }, icon('refresh', 15), 'شبیه‌سازی ۵۰۰۰ قرعه‌کشی');

  return h('div.card', {},
    h('div.card-head', {},
      h('div', {},
        h('h3.card-title', {}, icon('trophy', 18), 'بلیت‌ها و شانس بردن'),
        h('p.card-sub', {}, 'هر کیلوگرم کاهش تعهد = یک بلیت. فقط کسانی که به تعهد رسیده‌اند وارد قرعه‌کشی می‌شوند.'),
      ),
      h('span.badge.gold', {}, `${faDigits(total)} بلیت`),
    ),
    strip,
    h('div.small.muted.mt-8', {},
      `${faDigits(allEligible.length)} نفر واجد شرایط (تعهد + پرداخت تأییدشده)`,
      unreached.length ? ` • ${faDigits(unreached.length)} نفر به تعهد رسیده‌اند ولی سهمشان تأیید نشده` : '',
    ),
    list,
    h('div.row.gap-8.mt-16', {}, simBtn),
    simHost,
  );
}

export function openLotteryReveal(draw, pool, { official = false } = {}) {
  const names = draw.eligible.map((r) => r.name);
  const nameEl = h('div.winner-name', { style: { opacity: '0.6' } }, '…');
  const chanceEl = h('div.small.muted', {}, '');
  const body = h('div.lottery-stage', {},
    h('span.badge.gold', {}, icon('trophy', 13), 'قرعه‌کشی'),
    nameEl,
    chanceEl,
    h('div', { style: { width: '100%' } },
      h('div.row-between.tiny.muted.mb-8', {}, h('span', {}, 'استخر جایزه'), h('strong', { style: { color: 'var(--gold)' } }, money(pool))),
      h('div.ticket-strip', {}, ...draw.tickets.map((t, i) => h('i', {
        style: { width: `${(t.chance / (draw.total || 1)) * 100}%`, background: `var(--${TICKET_TONES[i % TICKET_TONES.length]})` },
      }))),
    ),
    h('div.tiny.muted', {}, `بذر قرعه‌کشی: ${draw.seed} — نتیجه با همین بذر قابل بازتولید است.`),
  );

  const m = modal({
    title: official ? 'نتیجه‌ی رسمی قرعه‌کشی' : 'پیش‌نمایش قرعه‌کشی',
    subtitle: official ? 'این نتیجه در تاریخچه‌ی دوره ثبت شد.' : 'این فقط پیش‌نمایش است و چیزی ثبت نمی‌شود.',
    width: 520,
    body,
    footer: h('button.btn.primary', { onClick: () => m.close() }, 'بستن'),
  });

  let i = 0;
  const timer = setInterval(() => {
    if (!document.body.contains(nameEl)) { clearInterval(timer); return; }
    nameEl.textContent = names[i % Math.max(1, names.length)] || '—';
    i += 1;
  }, 85);

  setTimeout(() => {
    clearInterval(timer);
    if (draw.winner) {
      nameEl.textContent = draw.winner.name;
      nameEl.style.opacity = '1';
      chanceEl.textContent = `${faDigits(draw.winner.chance)} بلیت از ${faDigits(draw.total)} بلیت • جایزه ${money(pool)}`;
    } else {
      nameEl.textContent = 'برنده‌ای وجود ندارد';
      chanceEl.textContent = 'هیچ شرکت‌کننده‌ای به تعهد خود نرسید.';
    }
  }, 1900);
}

function historyPanel() {
  const rounds = store.settledRounds();
  if (!rounds.length) {
    return h('div.card', {}, h('div.empty', {},
      h('div.empty-ic', { html: icon('trophy', 24) }),
      h('strong', {}, 'هنوز دوره‌ای تسویه نشده'),
      h('p', {}, 'در پایان ماه، مدیر دوره نتیجه را ثبت می‌کند و برنده‌ی جایزه اینجا نمایش داده می‌شود.'),
    ));
  }
  return h('div.stack', {}, ...rounds.map((round) => {
    const winner = store.profileById(round.winner_user_id);
    const settlements = store.settlementsFor(round.id);
    const totalChance = settlements.filter((s) => s.compliant).reduce((a, b) => a + Number(b.chance || 0), 0);
    const compliant = settlements.filter((s) => s.compliant).length;
    return h('div.card', {},
      h('div.row-between.wrap.mb-12', {},
        h('div', {},
          h('h3.card-title', {}, icon('trophy', 17), `دوره‌ی ${round.title}`),
          h('div.small.muted', {},
            `${formatJalali(new Date(`${round.starts_on}T00:00:00`), { long: true })} تا ${formatJalali(new Date(`${round.ends_on}T00:00:00`), { long: true })}`,
          ),
        ),
        h('div.row.gap-12', {},
          h('div.center', {}, h('div.strong', { style: { color: 'var(--gold)' } }, money(round.prize_pool)), h('div.tiny.muted', {}, 'جایزه')),
          h('span.badge.lg.gold', {}, icon('crown', 13), winner?.full_name || 'بدون برنده'),
        ),
      ),
      h('div.row.gap-16.wrap.small.muted.mb-12', {},
        h('span', {}, `${faDigits(settlements.length)} شرکت‌کننده`),
        h('span', {}, `${faDigits(compliant)} نفر به تعهد رسیدند`),
        h('span', {}, `${faDigits(totalChance)} بلیت`),
        round.seed ? h('span', { class: 'mono' }, `seed: ${round.seed}`) : null,
      ),
      h('div.table-wrap', {},
        h('table.data', { style: { minWidth: '560px' } },
          h('thead', {}, h('tr', {},
            h('th', {}, 'شرکت‌کننده'), h('th.num', {}, 'وزن نهایی'), h('th.num', {}, 'تعهد'), h('th.num', {}, 'بلیت'), h('th', {}, 'وضعیت'), h('th', {}, 'نتیجه'),
          )),
          h('tbody', {}, ...settlements.map((s) => {
            const name = store.profileById(s.user_id)?.full_name || 'کاربر';
            return h('tr', { class: s.won ? 'me' : '' },
              h('td', {}, name),
              h('td.num', {}, s.final_weight ? fmt(s.final_weight) : '—'),
              h('td.num', {}, s.promised_weight ? fmt(s.promised_weight) : '—'),
              h('td.num', {}, faDigits(s.chance)),
              h('td', {}, h('span', { class: `badge ${s.compliant ? 'brand' : 'muted'}` }, s.compliant ? 'به تعهد رسید' : 'نرسید')),
              h('td', {}, s.won ? h('span.badge.gold', {}, '🏆 برنده') : h('span.muted', {}, '—')),
            );
          })),
        ),
      ),
    );
  }));
}

function adminPanel(board) {
  const pending = board.filter((b) => !b.paid);
  const settled = store.round?.status === 'settled';
  const eligible = board.filter((b) => b.compliant && b.paid);

  const previewBtn = h('button.btn.ghost', {
    onClick: () => {
      const draw = drawWinner(board.map((b) => ({ id: b.userId, name: b.name, chance: b.chance, compliant: b.compliant && b.paid })), `preview-${Date.now()}`);
      openLotteryReveal(draw, store.poolForRound());
    },
  }, icon('trophy', 16), 'پیش‌نمایش قرعه‌کشی');

  const settleBtn = h('button.btn.gold', {
    onClick: async () => {
      if (!eligible.length) return toast('هیچ شرکت‌کننده‌ای به تعهد نرسیده؛ قرعه‌کشی معنا ندارد.', 'warn');
      const ok = await confirmDialog(
        `دوره بسته شود؟ ${eligible.length} نفر واجد شرایط با ${eligible.reduce((a, b) => a + b.chance, 0)} بلیت در قرعه‌کشی شرکت می‌کنند و نتیجه ثبت می‌شود.`,
        { title: 'تسویه و قرعه‌کشی رسمی', okText: 'بله، قرعه‌کشی کن' },
      );
      if (!ok) return;
      try {
        const { draw, pool } = await store.settleRound();
        openLotteryReveal(draw, pool, { official: true });
      } catch (err) {
        toast(err.message || 'تسویه ناموفق بود.', 'error');
      }
    },
  }, icon('crown', 16), 'تسویه و قرعه‌کشی رسمی');

  return h('div.stack', {},
    h('div.card', {},
      h('div.card-head', {},
        h('div', {}, h('h3.card-title', {}, icon('lock', 18), 'پنل مدیر دوره'),
          h('p.card-sub', {}, 'تأیید پرداخت‌ها، پیش‌نمایش و تسویه‌ی رسمی.')),
        h('span.badge.gold', {}, 'فقط مدیر'),
      ),
      settled
        ? h('div.alert.success', {}, h('span', { html: icon('check', 18) }), h('div', {}, 'این دوره تسویه شده است. برای دوره‌ی جدید، ماه شمسی بعدی به‌صورت خودکار دوره‌ی جدید می‌سازد.'))
        : h('div.alert.warn', {},
          h('span', { html: icon('alert', 18) }),
          h('div', {},
            h('strong', {}, 'قبل از تسویه مطمئن شو: '),
            'همه‌ی وزن‌های پایانی ثبت شده‌اند و پرداخت‌های واقعی تأیید شده‌اند. نتیجه‌ی قرعه‌کشی با بذر ثابت و قابل بازتولید ثبت می‌شود.',
          ),
        ),
      h('div.row.gap-8.mt-12', {}, previewBtn, settled ? null : settleBtn),
    ),
    h('div.card', {},
      h('div.card-head', {},
        h('div', {}, h('h3.card-title', {}, icon('wallet', 18), 'پرداخت‌های در انتظار تأیید')),
        h('span.badge.gold', {}, faDigits(pending.length)),
      ),
      pending.length
        ? h('div.entry-list', {}, ...pending.map((row) => h('div.entry-row', {},
          h('span', { class: `avatar sm ${avatarTone(row.userId)}` }, initials(row.name)),
          h('div.grow', {},
            h('div.strong', {}, row.name),
            h('div.tiny.muted', {}, row.paymentStatus === 'pending'
              ? `ثبت‌شده در انتظار تأیید • ${row.payment?.ref || 'بدون کد پیگیری'}`
              : 'هنوز پرداختی ثبت نشده'),
          ),
          h('button.btn.sm.primary', {
            onClick: async () => {
              try {
                await store.confirmPayment(row.userId);
                toast(`پرداخت ${row.name} تأیید شد.`, 'success');
              } catch (err) {
                toast(err.message || 'تأیید ناموفق بود.', 'error');
              }
            },
          }, icon('check', 14), 'تأیید'),
        )))
        : h('p.small.muted', {}, 'همه‌ی پرداخت‌ها تأیید شده‌اند.'),
    ),
    state.backend === 'demo'
      ? h('div.card', {},
        h('div.card-head', {}, h('h3.card-title', {}, icon('info', 18), 'حالت نمایشی')),
        h('p.small.muted', {}, 'داده‌ها در همین مرورگر ذخیره می‌شوند. برای اجرای واقعی، فایل supabase/schema.sql را در پروژه‌ی Supabase اجرا کنید.'),
        h('button.btn.danger.sm.mt-8', {
          onClick: async () => {
            if (await confirmDialog('داده‌ی نمایشی بازنشانی شود؟', { danger: true, okText: 'بازنشانی' })) {
              await store.resetDemo();
              toast('بازنشانی شد.', 'info');
              location.hash = '#/';
            }
          },
        }, icon('refresh', 15), 'بازنشانی داده‌ی نمایشی'),
      )
      : null,
  );
}

export async function render(root) {
  const round = store.round;
  const board = store.board();
  const me = store.myAnalysis();

  root.append(pageHead(
    'گزارش کلی چالش',
    `دوره‌ی ${round.title} • ${faDigits(board.length)} شرکت‌کننده • ${formatJalali(new Date(), { long: true })}`,
    [
      h('button.btn.ghost', {
        onClick: () => {
          const rows = [['رتبه', 'نام', 'شهر', 'وزن شروع', 'وزن فعلی', 'تعهد پایان ماه', 'کاهش', 'BMI', 'پیشرفت٪', 'بلیت', 'پرداخت']];
          board.forEach((r) => rows.push([
            r.rank, r.name, r.city || '', r.start, r.current, r.promised,
            (r.start - r.current).toFixed(1), r.bmi || '', Math.round(r.progress), r.chance, r.paid ? 'پرداخت‌شده' : 'در انتظار',
          ]));
          downloadFile(`tarazoo-board-${round.round_key || 'round'}.csv`, rows.map((row) => row.map(csvEscape).join(',')).join('\n'));
          toast('فایل CSV جدول دانلود شد.', 'success');
        },
      }, icon('download', 16), 'خروجی CSV'),
      h('a.btn.primary', { href: '#/rules' }, icon('book', 16), 'قوانین جایزه'),
    ],
  ));

  if (round.status === 'settled') {
    const winner = store.profileById(round.winner_user_id);
    root.append(
      h('div.card.mb-16', { style: { borderColor: 'color-mix(in srgb, var(--gold) 40%, transparent)', background: 'linear-gradient(135deg, var(--gold-soft), transparent 70%)' } },
        h('div.row-between.wrap', {},
          h('div.row.gap-12', {},
            h('span.avatar.lg.gold', {}, '🏆'),
            h('div', {},
              h('div.strong', { style: { fontSize: '18px' } }, `برنده‌ی دوره: ${winner?.full_name || '—'}`),
              h('div.small.muted', {}, `جایزه ${money(round.prize_pool)} • تسویه‌شده در ${formatJalali(round.settled_at || new Date(), { long: true })}`),
            ),
          ),
          h('span.badge.gold.lg', {}, icon('crown', 14), 'نتیجه‌ی رسمی'),
        ),
      ),
    );
  }

  root.append(h('div.mb-16', {}, poolBox(board)));

  root.append(
    h('div.dash-strip.mb-16', {},
      statCard({ label: 'شرکت‌کننده‌ها', value: faDigits(board.length), iconName: 'users', foot: `${faDigits(board.filter((b) => b.paid).length)} پرداخت‌شده` }),
      statCard({ label: 'به تعهد رسیده', value: faDigits(board.filter((b) => b.compliant).length), iconName: 'check', foot: 'واجد شرایط جایزه' }),
      statCard({ label: 'کاهش جمعی', value: fmt(board.reduce((a, b) => a + Math.max(0, b.lost), 0)), unit: 'کیلو', iconName: 'flame', foot: 'مجموع کاهش ثبت‌شده', footTone: 'down' }),
      statCard({
        label: 'وضعیت من',
        value: me ? `${fmt(me.current)} کیلو` : '—',
        iconName: 'user',
        foot: me ? (me.remaining > 0 ? `${fmt(me.remaining)} کیلو تا تعهد` : 'به تعهد رسیده‌ام') : 'وارد نشده‌ام',
      }),
    ),
  );

  /* ------------------------------------------------------------------ tabs */
  const content = h('div');
  const tabs = [
    { key: 'board', label: 'جدول کامل', render: () => leaderboard(board, round) },
    { key: 'chances', label: 'بلیت و شانس', render: () => chancesPanel(board) },
    { key: 'history', label: 'تاریخچه و برندگان', render: () => historyPanel() },
    store.isAdmin ? { key: 'admin', label: 'پنل مدیر', render: () => adminPanel(board) } : null,
  ].filter(Boolean);

  const tabBar = h('div.tabs.mb-16');
  const buttons = tabs.map((tab, i) => h('button', {
    class: i === 0 ? 'active' : '',
    onClick: (e) => {
      [...tabBar.children].forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      content.replaceChildren(tabs[i].render());
    },
  }, tab.label));
  tabBar.append(...buttons);
  content.append(tabs[0].render());

  root.append(h('div', {}, tabBar, content));

  /* ------------------------------------------------------------- footnote */
  root.append(
    h('div.alert.info.mt-24', {},
      h('span', { html: icon('info', 18) }),
      h('div', {},
        h('strong', {}, 'چطور برنده انتخاب می‌شود؟ '),
        'مجموع سهم‌های پرداخت‌شده استخر جایزه را می‌سازد. کسانی که در پایان ماه به وزن تعهد رسیده باشند وارد قرعه‌کشی می‌شوند؛ '
        + 'هر کیلوگرم کاهش تعهد یک بلیت است و برنده به‌صورت تصادفی با بلیت‌های وزنی انتخاب می‌شود. نتیجه با بذر ثابت ثبت می‌شود تا قابل بازبینی باشد.',
      ),
    ),
  );
}
