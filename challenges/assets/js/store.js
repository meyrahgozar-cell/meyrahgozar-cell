/** فروشگاه مرکزی: وضعیت برنامه، احراز هویت، خواندن/نوشتن داده و محاسبات مشترک. */
import { CONFIG } from './config.js';
import { createSupabaseDb, createDemoDb, isMissingTable } from './db.js';
import {
  currentRoundRange, jalaliISO, pad2, toJalali, formatJalali,
} from './jalali.js';
import { analyze } from './ai.js';
import { chancesFor, drawWinner } from './lottery.js';
import { hashString, sum, uid } from './utils.js';

const state = {
  ready: false,
  backend: 'demo',
  backendNote: '',
  sessionUser: null,
  profile: null,
  round: null,
  rounds: [],
  profiles: [],
  pledges: [],
  entries: [],
  payments: [],
  settlements: [],
  loading: false,
  error: null,
};

const listeners = new Set();

async function safe(promise, fallback = []) {
  try {
    return await promise;
  } catch (err) {
    console.warn('[tarazoo] data:', err?.message || err);
    return fallback;
  }
}

function synthRound(range) {
  return {
    id: `local-${range.key}`,
    local: true,
    round_key: range.key,
    title: range.title,
    starts_on: `${range.jy}-${pad2(range.jm)}-01`,
    ends_on: `${range.jy}-${pad2(range.jm)}-${pad2(range.days)}`,
    fee: CONFIG.defaultFee,
    status: 'running',
    prize_pool: 0,
    seed: hashString(range.key),
  };
}

export const store = {
  state,
  db: null,

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit() {
    for (const fn of listeners) {
      try { fn(state); } catch (err) { console.error(err); }
    }
  },

  /* ------------------------------------------------------------- init */

  async init() {
    let db = createSupabaseDb();
    let note = '';
    try {
      await db.probe();
      state.backend = 'supabase';
    } catch (err) {
      if (err?.code === 'NETWORK') {
        note = 'ارتباط با سرور Supabase برقرار نشد. برنامه با داده‌ی نمایشی کار می‌کند.';
      } else if (isMissingTable(err)) {
        note = 'جدول‌های weight_ ساخته نشده‌اند؛ برنامه با داده‌ی نمایشی کار می‌کند.';
      } else {
        note = `دسترسی به پایگاه‌داده ممکن نشد (${err?.status || '؟'}). برنامه با داده‌ی نمایشی کار می‌کند.`;
        console.warn('[tarazoo] probe failed:', err);
      }
      db = createDemoDb();
      state.backend = 'demo';
    }
    state.backendNote = note;
    this.db = db;

    try {
      const u = db.getSession();
      if (u) state.sessionUser = { id: u.id, email: u.email };
    } catch {
      /* ignore */
    }

    await this.reload();
    state.ready = true;
    this.emit();
    return state;
  },

  /* ------------------------------------------------------------ load */

  async reload() {
    const db = this.db;
    state.loading = true;
    this.emit();
    const [profiles, rounds, pledges, entries, payments, settlements] = await Promise.all([
      safe(db.select(`${CONFIG.prefix}profiles`, { order: 'created_at.asc' })),
      safe(db.select(`${CONFIG.prefix}rounds`, { order: 'starts_on.asc' })),
      safe(db.select(`${CONFIG.prefix}pledges`, { order: 'created_at.asc' })),
      safe(db.select(`${CONFIG.prefix}entries`, { order: 'entry_date.asc' })),
      safe(db.select(`${CONFIG.prefix}payments`, { order: 'created_at.asc' })),
      safe(db.select(`${CONFIG.prefix}settlements`, { order: 'created_at.asc' })),
    ]);

    state.profiles = profiles;
    state.rounds = rounds;
    state.pledges = pledges;
    state.entries = entries;
    state.payments = payments;
    state.settlements = settlements;

    if (state.sessionUser) {
      state.profile = profiles.find((p) => p.id === state.sessionUser.id) || null;
    } else {
      state.profile = null;
    }

    const range = currentRoundRange();
    const current = rounds.find((r) => r.round_key === range.key && r.status !== 'settled')
      || rounds.find((r) => r.round_key === range.key)
      || rounds.find((r) => r.status === 'running')
      || synthRound(range);
    state.round = current;

    state.loading = false;
    this.emit();
  },

  get isLoggedIn() {
    return Boolean(state.sessionUser && state.profile);
  },

  get isAdmin() {
    return state.profile?.role === 'admin';
  },

  get range() {
    return currentRoundRange();
  },

  get round() {
    return state.round;
  },

  get profiles() {
    return state.profiles;
  },

  requireUser() {
    if (!state.sessionUser) {
      const err = new Error('برای این کار باید وارد حساب شوی.');
      err.code = 'AUTH_REQUIRED';
      throw err;
    }
    return state.sessionUser;
  },

  /* ----------------------------------------------------------- auth */

  async afterAuth() {
    const range = currentRoundRange();
    const u = state.sessionUser;
    const existing = await safe(this.db.select(`${CONFIG.prefix}profiles`, { eq: { id: u.id } }));
    if (!existing.length) {
      const fullName = u.name || u.email?.split('@')[0] || 'کاربر ترازو';
      try {
        await this.db.upsert(`${CONFIG.prefix}profiles`, {
          id: u.id,
          full_name: fullName,
          role: 'member',
          created_at: new Date().toISOString(),
        }, 'id');
      } catch (err) {
        console.warn('[tarazoo] profile create failed', err);
      }
    }
    await this.reload();
    // اطمینان از وجود دوره‌ی ماه جاری
    if (state.round?.local) await this.ensureRound(range);
    await this.reload();
  },

  async signIn(email, password) {
    const user = await this.db.signIn(email, password);
    state.sessionUser = { id: user.id, email: user.email, name: user.user_metadata?.full_name || user.name };
    await this.afterAuth();
    return user;
  },

  async signUp(email, password, fullName) {
    const res = await this.db.signUp(email, password, { full_name: fullName });
    if (res.needsConfirm) return { needsConfirm: true, user: res.user };
    state.sessionUser = {
      id: res.user.id,
      email: res.user.email,
      name: res.user.user_metadata?.full_name || fullName,
    };
    await this.afterAuth();
    return { needsConfirm: false, user: res.user };
  },

  async signOut() {
    await this.db.signOut();
    state.sessionUser = null;
    state.profile = null;
    await this.reload();
  },

  async signInDemo() {
    const user = await this.db.signIn(CONFIG.demo.email, CONFIG.demo.password);
    state.sessionUser = { id: user.id, email: user.email, name: user.name };
    await this.afterAuth();
    return user;
  },

  /* --------------------------------------------------------- profile */

  async saveProfile(patch) {
    const u = this.requireUser();
    const row = { ...patch, id: u.id };
    const rows = await this.db.upsert(`${CONFIG.prefix}profiles`, row, 'id');
    const saved = rows[0];
    if (saved) {
      const idx = state.profiles.findIndex((p) => p.id === saved.id);
      if (idx >= 0) state.profiles[idx] = saved;
      else state.profiles.push(saved);
      state.profile = saved;
    } else {
      await this.reload();
    }
    this.emit();
    return state.profile;
  },

  /* ---------------------------------------------------------- rounds */

  async ensureRound(range = currentRoundRange()) {
    if (state.round && !state.round.local) return state.round;
    const row = {
      round_key: range.key,
      title: range.title,
      starts_on: `${range.jy}-${pad2(range.jm)}-01`,
      ends_on: `${range.jy}-${pad2(range.jm)}-${pad2(range.days)}`,
      fee: CONFIG.defaultFee,
      status: 'running',
      prize_pool: 0,
      seed: hashString(range.key),
      created_at: new Date().toISOString(),
    };
    try {
      const rows = await this.db.insert(`${CONFIG.prefix}rounds`, row);
      const created = rows[0] || { ...row, id: uid() };
      state.rounds.push(created);
      state.round = created;
      return created;
    } catch (err) {
      console.warn('[tarazoo] round create failed', err);
      return state.round;
    }
  },

  /* ---------------------------------------------------------- pledge */

  async savePledge({ startWeight, promisedWeight, targetBmi }) {
    const u = this.requireUser();
    const round = await this.ensureRound();
    const promiseKg = Number((Number(startWeight) - Number(promisedWeight)).toFixed(1));
    if (!(Number(startWeight) > 0) || !(Number(promisedWeight) > 0)) {
      throw new Error('وزن‌ها را درست وارد کن.');
    }
    if (Number(promisedWeight) >= Number(startWeight)) {
      throw new Error('وزن تعهد باید کمتر از وزن شروع باشد.');
    }
    const row = {
      user_id: u.id,
      round_id: round.id,
      start_weight: Number(startWeight),
      promised_weight: Number(promisedWeight),
      target_bmi: targetBmi ? Number(targetBmi) : null,
      promise_kg: promiseKg,
      created_at: new Date().toISOString(),
    };
    const saved = await this.db.upsert(`${CONFIG.prefix}pledges`, row, 'user_id,round_id');
    await this.reload();
    return saved[0] || row;
  },

  /* ---------------------------------------------------------- entries */

  async saveEntry({ date = new Date(), weight, hour, stomach, note = '' }) {
    const u = this.requireUser();
    const round = await this.ensureRound();
    const iso = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    const row = {
      user_id: u.id,
      round_id: round.id,
      entry_date: iso,
      shamsi_date: jalaliISO(date),
      weight: Number(weight),
      measure_hour: Number(hour),
      stomach,
      note: note || '',
      created_at: new Date().toISOString(),
    };
    if (!(row.weight > 20 && row.weight < 400)) throw new Error('وزن وارد‌شده معتبر نیست.');
    const saved = await this.db.upsert(`${CONFIG.prefix}entries`, row, 'user_id,entry_date');
    await this.reload();
    return saved[0] || row;
  },

  async deleteEntry(id) {
    this.requireUser();
    await this.db.remove(`${CONFIG.prefix}entries`, { id });
    await this.reload();
  },

  /* --------------------------------------------------------- payments */

  async submitPayment({ method = 'کارت به کارت', ref = '' } = {}) {
    const u = this.requireUser();
    const round = await this.ensureRound();
    const existing = state.payments.find((p) => p.user_id === u.id && p.round_id === round.id);
    if (existing) return existing;
    const row = {
      user_id: u.id,
      round_id: round.id,
      amount: round.fee || CONFIG.defaultFee,
      status: 'pending',
      method,
      ref: ref || `TRZ-${Math.floor(Math.random() * 9000 + 1000)}`,
      paid_at: null,
      created_at: new Date().toISOString(),
    };
    const saved = await this.db.insert(`${CONFIG.prefix}payments`, row);
    await this.reload();
    return saved[0] || row;
  },

  async confirmPayment(userId, roundId = state.round?.id) {
    this.requireUser();
    if (!this.isAdmin && state.backend !== 'demo') throw new Error('فقط مدیر دوره می‌تواند پرداخت را تأیید کند.');
    const existing = state.payments.find((p) => p.user_id === userId && p.round_id === roundId);
    if (existing) {
      await this.db.update(`${CONFIG.prefix}payments`, { status: 'paid', paid_at: new Date().toISOString() }, { id: existing.id });
    } else {
      const round = state.rounds.find((r) => r.id === roundId) || state.round;
      await this.db.insert(`${CONFIG.prefix}payments`, {
        user_id: userId,
        round_id: roundId,
        amount: round?.fee || CONFIG.defaultFee,
        status: 'paid',
        method: 'تأیید مدیر',
        ref: '',
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }
    await this.reload();
  },

  /* ------------------------------------------------------- settlement */

  async settleRound(roundId = state.round?.id) {
    const round = state.rounds.find((r) => r.id === roundId) || state.round;
    if (!round) throw new Error('دوره‌ای برای تسویه پیدا نشد.');
    if (round.status === 'settled') throw new Error('این دوره قبلاً تسویه شده است.');
    const rows = this.board(round.id);
    if (!rows.length) throw new Error('شرکت‌کننده‌ای برای تسویه وجود ندارد.');
    const pool = this.poolForRound(round.id);
    const seed = `${round.round_key || round.id}-${round.seed || 1}-${round.id}`;
    const draw = drawWinner(rows.map((r) => ({
      id: r.userId,
      name: r.name,
      chance: r.chance,
      // تنها کسانی که هم به تعهد رسیده‌اند و هم سهمشان تأیید شده، بلیت دارند
      compliant: r.compliant && r.paid,
    })), seed);

    const settlementRows = rows.map((r) => ({
      round_id: round.id,
      user_id: r.userId,
      final_weight: r.current,
      promised_weight: r.promised,
      chance: r.chance,
      compliant: r.compliant,
      won: draw.winner?.id === r.userId,
      created_at: new Date().toISOString(),
    }));

    await this.db.insert(`${CONFIG.prefix}settlements`, settlementRows);
    await this.db.update(`${CONFIG.prefix}rounds`, {
      status: 'settled',
      winner_user_id: draw.winner?.id || null,
      prize_pool: pool,
      settled_at: new Date().toISOString(),
    }, { id: round.id });
    await this.reload();
    return { draw, pool, round };
  },

  /* ---------------------------------------------------------- selectors */

  roundById(id) {
    return state.rounds.find((r) => r.id === id) || state.round;
  },

  paidPayments(roundId = state.round?.id) {
    return state.payments.filter((p) => p.round_id === roundId && p.status === 'paid');
  },

  poolForRound(roundId = state.round?.id) {
    const round = state.rounds.find((r) => r.id === roundId);
    if (round?.status === 'settled' && round.prize_pool) return Number(round.prize_pool);
    return sum(this.paidPayments(roundId), (p) => p.amount || 0);
  },

  myPledge(roundId = state.round?.id) {
    if (!state.sessionUser) return null;
    return state.pledges.find((p) => p.user_id === state.sessionUser.id && p.round_id === roundId) || null;
  },

  myPayment(roundId = state.round?.id) {
    if (!state.sessionUser) return null;
    return state.payments.find((p) => p.user_id === state.sessionUser.id && p.round_id === roundId) || null;
  },

  entriesFor(userId, roundId = state.round?.id) {
    return state.entries
      .filter((e) => e.user_id === userId && (!roundId || e.round_id === roundId))
      .sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));
  },

  latestEntry(userId, roundId = state.round?.id) {
    return this.entriesFor(userId, roundId).at(-1) || null;
  },

  profileById(id) {
    return state.profiles.find((p) => p.id === id) || null;
  },

  nameById(id) {
    return this.profileById(id)?.full_name || 'کاربر';
  },

  /**
   * جدول اصلی: یک ردیف برای هر شرکت‌کننده با وزن شروع، وزن فعلی و تعهد پایان ماه.
   */
  board(roundId = state.round?.id) {
    const round = this.roundById(roundId);
    if (!round) return [];
    const pledges = state.pledges.filter((p) => p.round_id === roundId);
    const payments = state.payments.filter((p) => p.round_id === roundId);
    const rows = pledges.map((pledge) => {
      const profile = this.profileById(pledge.user_id) || { full_name: 'شرکت‌کننده', height_cm: null };
      const entries = this.entriesFor(pledge.user_id, roundId);
      const analysis = analyze({ profile, pledge, entries, round });
      const payment = payments.find((p) => p.user_id === pledge.user_id) || null;
      return {
        ...analysis,
        userId: pledge.user_id,
        name: profile.full_name,
        city: profile.city || '',
        heightCm: profile.height_cm,
        paid: payment?.status === 'paid',
        paymentStatus: payment?.status || 'none',
        feeAmount: payment?.amount || round.fee || CONFIG.defaultFee,
        promiseKg: Number(pledge.promise_kg ?? Math.max(0, pledge.start_weight - pledge.promised_weight)),
        chance: chancesFor(pledge.promise_kg ?? Math.max(0, pledge.start_weight - pledge.promised_weight)),
      };
    });
    rows.sort((a, b) => (b.progress - a.progress) || (a.remaining - b.remaining));
    rows.forEach((row, i) => { row.rank = i + 1; });
    return rows;
  },

  myAnalysis() {
    if (!state.sessionUser) return null;
    const row = this.board().find((r) => r.userId === state.sessionUser.id);
    return row || null;
  },

  /** نقاط نمودار وزن کاربر */
  seriesFor(userId, roundId = state.round?.id) {
    const round = this.roundById(roundId);
    const entries = this.entriesFor(userId, roundId);
    if (!round || !entries.length) return [];
    const startDate = new Date(`${round.starts_on}T00:00:00`);
    return entries.map((e) => {
      const d = new Date(`${e.entry_date}T00:00:00`);
      const dayIdx = Math.round((d - startDate) / 86400000);
      return {
        x: dayIdx,
        y: Number(e.weight),
        label: formatJalali(d, { long: false }).slice(5),
        title: `${formatJalali(d, { long: true })} — ${e.weight} کیلو`,
        entry: e,
      };
    });
  },

  settledRounds() {
    return [...state.rounds].filter((r) => r.status === 'settled').sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)));
  },

  settlementsFor(roundId) {
    return state.settlements.filter((s) => s.round_id === roundId);
  },

  winnerOf(roundId) {
    const round = state.rounds.find((r) => r.id === roundId);
    if (!round?.winner_user_id) return null;
    return {
      round,
      profile: this.profileById(round.winner_user_id),
      settlement: state.settlements.find((s) => s.round_id === roundId && s.user_id === round.winner_user_id),
    };
  },

  roundLabel(round) {
    return round?.title || (round?.round_key ? round.round_key : 'دوره');
  },

  async resetDemo() {
    if (this.db.kind !== 'demo') return;
    this.db.reset();
    state.sessionUser = null;
    state.profile = null;
    await this.reload();
  },
};

export { state };
