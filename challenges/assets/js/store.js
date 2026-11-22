/**
 * فروشگاه مرکزی: وضعیت برنامه، احراز هویت و محاسبات مشترک.
 *
 * داده روی اسکیمای موجود پروژه سوار می‌شود:
 *   profiles      → نام، قد، سن، جنسیت، مدیر، نمایش عمومی BMI
 *   user_weights  → همه‌ی وزن‌های ثبت‌شده (وزن فعلی و وزن شروع)
 *   daily_logs    → وضعیت معده‌ی هر ثبت وزن
 *   app_settings  → سهم اشتراک (challenge_fee)
 * فقط دفتر چالش (تعهد، پرداخت، تسویه) در جدول‌های challenge_* ذخیره می‌شود.
 */
import { CONFIG } from './config.js';
import { createSupabaseDb, isMissingTable } from './db.js';
import {
  currentRoundRange, jalaliMonthLength, fromJalali, jalaliISO,
  MONTHS, pad2, toJalali, formatJalali,
} from './jalali.js';
import { analyze, bmiValue } from './ai.js';
import { chancesFor, drawWinner } from './lottery.js';
import { faDigits, hashString, sum } from './utils.js';

const STOMACH_STATES = ['empty', 'light', 'full'];

const state = {
  ready: false,
  backend: 'offline',
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
  settings: [],
  weights: [],
  loading: false,
  error: null,
};

const listeners = new Set();

async function safe(promise, fallback = []) {
  try {
    return await promise;
  } catch (err) {
    console.warn('[challenge] data:', err?.message || err);
    return fallback;
  }
}

const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** profiles ردیف موجود → شکل داخلی برنامه */
function normalizeProfile(row) {
  if (!row) return null;
  const age = row.age_years == null ? null : Number(row.age_years);
  const { jy } = toJalali(new Date());
  return {
    ...row,
    full_name: row.display_name || '',
    age_years: age,
    birth_year: age ? jy - age : null,
    activity_level: 'light',
    city: '',
    target_bmi: null,
    role: row.is_admin ? 'admin' : 'member',
    bmi_public: row.bmi_public !== false,
  };
}

/** بازه‌ی یک ماه شمسی از کلید آن (مثل 1405-09) */
function rangeForKey(key) {
  const current = currentRoundRange();
  if (!key || key === current.key) return current;
  const [jy, jm] = String(key).split('-').map(Number);
  if (!jy || !jm || jm < 1 || jm > 12) return null;
  const days = jalaliMonthLength(jy, jm);
  return {
    key,
    title: `${MONTHS[jm - 1]} ${faDigits(jy)}`,
    jy,
    jm,
    start: fromJalali(jy, jm, 1, 0),
    end: fromJalali(jy, jm, days, 23),
    startISO: `${jy}-${pad2(jm)}-01`,
    endISO: `${jy}-${pad2(jm)}-${pad2(days)}`,
    days,
  };
}

/** دوره‌ی داخلی؛ تاریخ‌ها میلادی ISO هستند تا با ثبت وزن‌ها یکی باشند */
function buildRound(key, fee) {
  const range = rangeForKey(key);
  if (!range) return null;
  return {
    id: range.key,
    local: true,
    round_key: range.key,
    title: range.title,
    starts_on: isoDate(range.start),
    ends_on: isoDate(range.end),
    starts_at: range.start,
    ends_at: range.end,
    fee,
    status: 'running',
    prize_pool: 0,
    seed: hashString(range.key),
    winner_user_id: null,
    settled_at: null,
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
    const db = createSupabaseDb();
    this.db = db;
    state.backend = 'offline';
    try {
      await db.probe();
      state.backend = 'supabase';
      state.backendNote = '';
    } catch (err) {
      if (err?.code === 'NETWORK') {
        state.backendNote = 'ارتباط با سرور Supabase برقرار نشد. اتصال اینترنت را بررسی کنید.';
      } else if (isMissingTable(err)) {
        state.backendNote = 'جدول‌های challenge_ ساخته نشده‌اند؛ فایل supabase/schema.sql را اجرا کنید.';
      } else {
        state.backendNote = `دسترسی به پایگاه‌داده ممکن نشد (${err?.status || '؟'}).`;
      }
      console.warn('[challenge] probe failed:', err);
      state.ready = true;
      this.emit();
      return state;
    }

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
    if (!db || state.backend === 'offline') return;
    state.loading = true;
    this.emit();

    const [profileRows, weightRows, logRows, settingRows, pledgeRows, paymentRows, settlementRows] = await Promise.all([
      safe(db.select(CONFIG.tables.profiles, { order: 'created_at.asc' })),
      safe(db.select(CONFIG.tables.weights, { order: 'recorded_at.asc' })),
      safe(db.select(CONFIG.tables.logs, { eq: { item_type: 'weight_stomach' }, order: 'log_date.asc' })),
      safe(db.select(CONFIG.tables.settings)),
      safe(db.select(CONFIG.tables.pledges, { order: 'created_at.asc' })),
      safe(db.select(CONFIG.tables.payments, { order: 'created_at.asc' })),
      safe(db.select(CONFIG.tables.settlements, { order: 'created_at.asc' })),
    ]);

    state.profiles = profileRows.map(normalizeProfile).filter(Boolean);
    state.settings = settingRows;
    state.weights = weightRows;

    const feeRow = settingRows.find((s) => s.key === CONFIG.feeSettingKey);
    const fee = Number(feeRow?.value) || CONFIG.defaultFee;

    /* وضعیت معده‌ی هر روز از daily_logs خوانده می‌شود */
    const stomach = new Map(logRows.map((l) => [`${l.user_id}|${l.log_date}`, Number(l.value)]));

    /* هر ثبت وزن در user_weights یک ردیف است؛ برای هر روز، آخرین ثبت می‌ماند */
    const byDay = new Map();
    for (const w of weightRows) {
      const d = new Date(w.recorded_at);
      if (Number.isNaN(d.getTime())) continue;
      const day = isoDate(d);
      const key = `${w.user_id}|${day}`;
      const entry = {
        id: w.id,
        user_id: w.user_id,
        entry_date: day,
        shamsi_date: jalaliISO(d),
        weight: Number(w.weight_kg),
        measure_hour: d.getHours(),
        stomach: STOMACH_STATES[stomach.get(key)] || 'empty',
        note: '',
        created_at: w.recorded_at,
      };
      const prev = byDay.get(key);
      if (!prev || new Date(entry.created_at) >= new Date(prev.created_at)) byDay.set(key, entry);
    }
    state.entries = [...byDay.values()].sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));

    state.pledges = pledgeRows.map((p) => {
      const profile = state.profiles.find((x) => x.id === p.user_id);
      const start = Number(p.start_weight);
      const promised = Number(p.promised_weight);
      return {
        ...p,
        round_id: p.round_key,
        start_weight: start,
        promised_weight: promised,
        promise_kg: Number(p.promise_kg ?? (start - promised)),
        target_bmi: bmiValue(promised, profile?.height_cm),
      };
    });

    state.payments = paymentRows.map((p) => ({ ...p, round_id: p.round_key, amount: Number(p.amount) }));
    state.settlements = settlementRows.map((s) => ({
      ...s,
      round_id: s.round_key,
      chance: Number(s.chance),
      final_weight: s.final_weight == null ? null : Number(s.final_weight),
      promised_weight: s.promised_weight == null ? null : Number(s.promised_weight),
    }));

    /* دوره‌ها از داده‌ی موجود ساخته می‌شوند: ماه جاری + هر دوره‌ای که سابقه دارد */
    const keys = new Set([
      currentRoundRange().key,
      ...state.pledges.map((p) => p.round_key),
      ...state.payments.map((p) => p.round_key),
      ...state.settlements.map((s) => s.round_key),
    ].filter(Boolean));

    state.rounds = [...keys].map((key) => buildRound(key, fee)).filter(Boolean).map((round) => {
      const settled = state.settlements.filter((s) => s.round_key === round.round_key);
      if (!settled.length) return round;
      return {
        ...round,
        status: 'settled',
        winner_user_id: settled.find((s) => s.won)?.user_id || null,
        prize_pool: sum(state.payments.filter((p) => p.round_key === round.round_key && p.status === 'paid'), (p) => p.amount),
      };
    });

    state.round = state.rounds.find((r) => r.round_key === currentRoundRange().key)
      || buildRound(currentRoundRange().key, fee);

    state.profile = state.sessionUser
      ? state.profiles.find((p) => p.id === state.sessionUser.id) || null
      : null;

    state.loading = false;
    this.emit();
  },

  get isLoggedIn() {
    return Boolean(state.sessionUser && state.profile);
  },

  get isAdmin() {
    return Boolean(state.profile?.is_admin);
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
    const u = state.sessionUser;
    const existing = await safe(this.db.select(CONFIG.tables.profiles, { eq: { id: u.id } }));
    if (!existing.length) {
      const fullName = u.name || u.email?.split('@')[0] || 'کاربر';
      try {
        await this.db.insert(CONFIG.tables.profiles, { id: u.id, display_name: fullName });
      } catch (err) {
        console.warn('[challenge] profile create failed', err);
      }
    }
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

  /* --------------------------------------------------------- profile */

  /** فقط ستون‌هایی که در profiles وجود دارند ذخیره می‌شوند. */
  async saveProfile(patch) {
    const u = this.requireUser();
    const row = { updated_at: new Date().toISOString() };
    if (patch.full_name !== undefined) row.display_name = String(patch.full_name).trim();
    if (patch.height_cm !== undefined) row.height_cm = patch.height_cm;
    if (patch.gender !== undefined) row.gender = patch.gender;
    if (patch.birth_year !== undefined) {
      const { jy } = toJalali(new Date());
      const age = jy - Number(patch.birth_year);
      row.age_years = age > 0 && age < 120 ? age : null;
    }
    if (patch.bmi_public !== undefined) row.bmi_public = Boolean(patch.bmi_public);

    await this.db.update(CONFIG.tables.profiles, row, { id: u.id });
    await this.reload();
    return state.profile;
  },

  /* ---------------------------------------------------------- pledge */

  async savePledge({ startWeight, promisedWeight }) {
    const u = this.requireUser();
    const round = state.round;
    const start = Number(startWeight);
    const promised = Number(promisedWeight);
    if (!(start > 0) || !(promised > 0)) throw new Error('وزن‌ها را درست وارد کن.');
    if (promised >= start) throw new Error('وزن تعهد باید کمتر از وزن شروع باشد.');

    const row = {
      user_id: u.id,
      round_key: round.round_key,
      start_weight: start,
      promised_weight: promised,
      promise_kg: Number((start - promised).toFixed(1)),
      created_at: new Date().toISOString(),
    };
    const saved = await this.db.upsert(CONFIG.tables.pledges, row, 'user_id,round_key');
    await this.reload();
    return saved[0] || row;
  },

  /* ---------------------------------------------------------- entries */

  async saveEntry({ date = new Date(), weight, hour, stomach = 'empty' }) {
    const u = this.requireUser();
    const iso = isoDate(date);
    const value = Number(weight);
    if (!(value > 20 && value < 400)) throw new Error('وزن وارد‌شده معتبر نیست.');

    const stamp = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(hour) || 8, 0, 0);
    const existing = state.entries.find((e) => e.user_id === u.id && e.entry_date === iso);

    if (existing) {
      await this.db.update(CONFIG.tables.weights, { weight_kg: value, recorded_at: stamp.toISOString() }, { id: existing.id });
    } else {
      await this.db.insert(CONFIG.tables.weights, {
        user_id: u.id,
        weight_kg: value,
        recorded_at: stamp.toISOString(),
      });
    }

    await this.saveStomach(u.id, iso, stomach);
    await this.reload();
  },

  /** وضعیت معده در daily_logs ذخیره می‌شود (بدون جدول تازه). */
  async saveStomach(userId, iso, stomach) {
    const index = STOMACH_STATES.indexOf(stomach);
    const value = index < 0 ? 0 : index;
    const rows = await safe(this.db.select(CONFIG.tables.logs, {
      eq: { user_id: userId, log_date: iso, item_type: 'weight_stomach' },
    }));
    if (rows.length) {
      await this.db.update(CONFIG.tables.logs, { value, updated_at: new Date().toISOString() }, { id: rows[0].id });
    } else {
      await this.db.insert(CONFIG.tables.logs, {
        user_id: userId,
        log_date: iso,
        item_type: 'weight_stomach',
        value,
        score: 0,
      });
    }
  },

  async deleteEntry(id) {
    this.requireUser();
    const entry = state.entries.find((e) => e.id === id);
    await this.db.remove(CONFIG.tables.weights, { id });
    if (entry) {
      const meta = await safe(this.db.select(CONFIG.tables.logs, {
        eq: { user_id: entry.user_id, log_date: entry.entry_date, item_type: 'weight_stomach' },
      }));
      for (const row of meta) await safe(this.db.remove(CONFIG.tables.logs, { id: row.id }));
    }
    await this.reload();
  },

  /* --------------------------------------------------------- payments */

  async submitPayment({ method = 'کارت به کارت', ref = '' } = {}) {
    const u = this.requireUser();
    const round = state.round;
    const existing = state.payments.find((p) => p.user_id === u.id && p.round_id === round.round_key);
    if (existing) return existing;
    const row = {
      user_id: u.id,
      round_key: round.round_key,
      amount: round.fee || CONFIG.defaultFee,
      status: 'pending',
      method,
      ref: ref || `CH-${Math.floor(Math.random() * 9000 + 1000)}`,
      paid_at: null,
      created_at: new Date().toISOString(),
    };
    const saved = await this.db.insert(CONFIG.tables.payments, row);
    await this.reload();
    return saved[0] || row;
  },

  async confirmPayment(userId, roundKey = state.round?.round_key) {
    this.requireUser();
    if (!this.isAdmin) throw new Error('فقط مدیر دوره می‌تواند پرداخت را تأیید کند.');
    const existing = state.payments.find((p) => p.user_id === userId && p.round_id === roundKey);
    if (existing) {
      await this.db.update(CONFIG.tables.payments, { status: 'paid', paid_at: new Date().toISOString() }, { id: existing.id });
    } else {
      const round = state.rounds.find((r) => r.round_key === roundKey) || state.round;
      await this.db.insert(CONFIG.tables.payments, {
        user_id: userId,
        round_key: roundKey,
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

  async settleRound(roundKey = state.round?.round_key) {
    this.requireUser();
    if (!this.isAdmin) throw new Error('فقط مدیر دوره می‌تواند دوره را تسویه کند.');
    const round = state.rounds.find((r) => r.round_key === roundKey) || state.round;
    if (!round) throw new Error('دوره‌ای برای تسویه پیدا نشد.');
    if (round.status === 'settled') throw new Error('این دوره قبلاً تسویه شده است.');
    const rows = this.board(round.round_key);
    if (!rows.length) throw new Error('شرکت‌کننده‌ای برای تسویه وجود ندارد.');
    const pool = this.poolForRound(round.round_key);
    const seed = `${round.round_key}-${round.seed || 1}`;
    const draw = drawWinner(rows.map((r) => ({
      id: r.userId,
      name: r.name,
      chance: r.chance,
      // تنها کسانی که هم به تعهد رسیده‌اند و هم سهمشان تأیید شده، بلیت دارند
      compliant: r.compliant && r.paid,
    })), seed);

    const settlementRows = rows.map((r) => ({
      round_key: round.round_key,
      user_id: r.userId,
      final_weight: r.current,
      promised_weight: r.promised,
      chance: r.chance,
      compliant: r.compliant,
      won: draw.winner?.id === r.userId,
      created_at: new Date().toISOString(),
    }));

    await this.db.insert(CONFIG.tables.settlements, settlementRows);
    await this.reload();
    return { draw, pool, round };
  },

  /* ---------------------------------------------------------- selectors */

  roundById(id) {
    return state.rounds.find((r) => r.round_key === id) || state.round;
  },

  paidPayments(roundKey = state.round?.round_key) {
    return state.payments.filter((p) => p.round_id === roundKey && p.status === 'paid');
  },

  poolForRound(roundKey = state.round?.round_key) {
    const round = state.rounds.find((r) => r.round_key === roundKey);
    if (round?.status === 'settled' && round.prize_pool) return Number(round.prize_pool);
    return sum(this.paidPayments(roundKey), (p) => p.amount || 0);
  },

  myPledge(roundKey = state.round?.round_key) {
    if (!state.sessionUser) return null;
    return state.pledges.find((p) => p.user_id === state.sessionUser.id && p.round_id === roundKey) || null;
  },

  myPayment(roundKey = state.round?.round_key) {
    if (!state.sessionUser) return null;
    return state.payments.find((p) => p.user_id === state.sessionUser.id && p.round_id === roundKey) || null;
  },

  /** ثبت‌های یک کاربر در بازه‌ی دوره */
  entriesFor(userId, roundKey = state.round?.round_key) {
    const round = this.roundById(roundKey);
    const from = round?.starts_on || '';
    const to = round?.ends_on || '';
    return state.entries
      .filter((e) => e.user_id === userId
        && (!round || (String(e.entry_date) >= from && String(e.entry_date) <= to)))
      .sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));
  },

  latestEntry(userId, roundKey = state.round?.round_key) {
    return this.entriesFor(userId, roundKey).at(-1) || null;
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
  board(roundKey = state.round?.round_key) {
    const round = this.roundById(roundKey);
    if (!round) return [];
    const pledges = state.pledges.filter((p) => p.round_id === roundKey);
    const payments = state.payments.filter((p) => p.round_id === roundKey);
    const rows = pledges.map((pledge) => {
      const profile = this.profileById(pledge.user_id) || { full_name: 'شرکت‌کننده', height_cm: null, bmi_public: true };
      const entries = this.entriesFor(pledge.user_id, roundKey);
      const analysis = analyze({ profile, pledge, entries, round });
      const payment = payments.find((p) => p.user_id === pledge.user_id) || null;
      const showBmi = profile.bmi_public !== false;
      const promiseKg = Number(pledge.promise_kg ?? Math.max(0, pledge.start_weight - pledge.promised_weight));
      return {
        ...analysis,
        bmi: showBmi ? analysis.bmi : null,
        band: showBmi ? analysis.band : { label: 'خصوصی', tone: 'muted' },
        bmiHidden: !showBmi,
        userId: pledge.user_id,
        name: profile.full_name,
        city: profile.city || '',
        heightCm: profile.height_cm,
        paid: payment?.status === 'paid',
        paymentStatus: payment?.status || 'none',
        payment,
        feeAmount: payment?.amount || round.fee || CONFIG.defaultFee,
        promiseKg,
        chance: chancesFor(promiseKg),
      };
    });
    rows.sort((a, b) => (b.progress - a.progress) || (a.remaining - b.remaining));
    rows.forEach((row, i) => { row.rank = i + 1; });
    return rows;
  },

  myAnalysis() {
    if (!state.sessionUser) return null;
    return this.board().find((r) => r.userId === state.sessionUser.id) || null;
  },

  /** نقاط نمودار وزن کاربر */
  seriesFor(userId, roundKey = state.round?.round_key) {
    const round = this.roundById(roundKey);
    const entries = this.entriesFor(userId, roundKey);
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
    return [...state.rounds]
      .filter((r) => r.status === 'settled')
      .sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)));
  },

  settlementsFor(roundKey) {
    return state.settlements.filter((s) => s.round_id === roundKey);
  },

  winnerOf(roundKey) {
    const round = state.rounds.find((r) => r.round_key === roundKey);
    if (!round?.winner_user_id) return null;
    return {
      round,
      profile: this.profileById(round.winner_user_id),
      settlement: state.settlements.find((s) => s.round_id === roundKey && s.user_id === round.winner_user_id),
    };
  },

  roundLabel(round) {
    return round?.title || (round?.round_key ? round.round_key : 'دوره');
  },
};

export { state };
