/** داده‌ی نمایشی برای زمانی که جدول‌های Supabase ساخته نشده‌اند. */
import { currentRoundRange, fromJalali, jalaliISO, MONTHS, toJalali, pad2 } from './jalali.js';
import { CONFIG } from './config.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE = [
  { name: 'نیلوفر رضایی', gender: 'female', height: 165, birth: 1372, start: 78.4, drop: 4.6, activity: 'light', tone: 'brand' },
  { name: 'امیر کاظمی', gender: 'male', height: 179, birth: 1368, start: 96.2, drop: 6.2, activity: 'moderate', tone: 'sky' },
  { name: 'سارا محمدی', gender: 'female', height: 160, birth: 1375, start: 71.5, drop: 3.4, activity: 'sedentary', tone: 'rose' },
  { name: 'محمد حسینی', gender: 'male', height: 183, birth: 1365, start: 104.8, drop: 5.0, activity: 'active', tone: 'gold' },
  { name: 'الهام نوری', gender: 'female', height: 168, birth: 1370, start: 82.9, drop: 4.0, activity: 'light', tone: 'violet' },
  { name: 'رضا شریفی', gender: 'male', height: 176, birth: 1363, start: 92.1, drop: 3.2, activity: 'moderate', tone: 'mint' },
  { name: 'مریم احمدی', gender: 'female', height: 158, birth: 1378, start: 68.2, drop: 2.8, activity: 'sedentary', tone: 'gold' },
  { name: 'حسین پارسا', gender: 'male', height: 181, birth: 1366, start: 99.4, drop: 5.4, activity: 'light', tone: 'sky' },
];

export function seedDemoDb() {
  const now = new Date();
  const range = currentRoundRange(now);
  const rand = mulberry32(20261122);
  const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const demoUserId = 'demo-user-0001';

  const profiles = [];
  const pledges = [];
  const entries = [];
  const payments = [];
  const rounds = [];
  const settlements = [];

  const roundId = 'demo-round-current';
  rounds.push({
    id: roundId,
    round_key: range.key,
    title: range.title,
    starts_on: iso(range.start),
    ends_on: iso(range.end),
    fee: CONFIG.defaultFee,
    status: 'running',
    prize_pool: 0,
    seed: 20261122,
    created_at: new Date().toISOString(),
  });

  const participants = [
    ...PEOPLE.map((p, i) => ({
      id: `demo-${i + 1}`,
      email: `member${i + 1}@tarazoo.app`,
      ...p,
    })),
    {
      id: demoUserId,
      email: CONFIG.demo.email,
      name: 'کاربر آزمایشی',
      gender: 'female',
      height: 166,
      birth: 1374,
      start: 80.6,
      drop: 4.2,
      activity: 'light',
      tone: 'brand',
      isDemo: true,
    },
  ];

  // دوره‌ی نمایشی از ۱۳ روز پیش شروع شده و ۱۶ روز دیگر تمام می‌شود تا داده‌ی نمونه کامل باشد.
  const demoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
  const demoEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 16);
  rounds[0].starts_on = iso(demoStart);
  rounds[0].ends_on = iso(demoEnd);
  const totalDemoDays = 14;

  participants.forEach((p, idx) => {
    profiles.push({
      id: p.id,
      full_name: p.name,
      gender: p.gender,
      height_cm: p.height,
      birth_year: p.birth,
      activity_level: p.activity,
      city: idx % 3 === 0 ? 'تهران' : idx % 3 === 1 ? 'اصفهان' : 'شیراز',
      role: idx === 0 || p.isDemo ? 'admin' : 'member',
      avatar_tone: p.tone,
      created_at: new Date().toISOString(),
    });

    const promised = Number((p.start - p.drop).toFixed(1));
    const pace = 0.72 + rand() * 0.42;
    const achieved = Number(Math.min(p.drop * pace, p.drop * 0.98).toFixed(1));
    const current = Number((p.start - achieved).toFixed(1));

    pledges.push({
      id: `pledge-${p.id}`,
      user_id: p.id,
      round_id: roundId,
      start_weight: p.start,
      promised_weight: promised,
      target_bmi: Number(((promised) / ((p.height / 100) ** 2)).toFixed(1)),
      promise_kg: Number(p.drop.toFixed(1)),
      created_at: new Date().toISOString(),
    });

    // ورودی‌های روزانه با نویز واقع‌گرایانه
    const entryDays = [];
    for (let d = 1; d <= totalDemoDays; d += rand() > 0.82 ? 2 : 1) entryDays.push(d);
    if (entryDays[entryDays.length - 1] !== totalDemoDays) entryDays.push(totalDemoDays);

    entryDays.forEach((d, i) => {
      const t = (d - 1) / (totalDemoDays - 1);
      const base = p.start - (p.start - current) * Math.min(1, t * (0.94 + rand() * 0.12));
      const noise = (rand() - 0.5) * 0.5;
      const weight = Number(Math.max(40, base + noise).toFixed(1));
      const date = new Date(demoStart);
      date.setDate(date.getDate() + (d - 1));
      date.setHours(8, 0, 0, 0);
      const hour = [6, 7, 7, 8, 8, 9][Math.floor(rand() * 6)];
      entries.push({
        id: `entry-${p.id}-${d}`,
        user_id: p.id,
        round_id: roundId,
        entry_date: iso(date),
        shamsi_date: jalaliISO(date),
        weight,
        measure_hour: i === entryDays.length - 1 ? 8 : hour,
        stomach: rand() > 0.12 ? 'empty' : 'light',
        note: '',
        created_at: date.toISOString(),
      });
    });

    const paid = !(idx === 2 || idx === 6);
    payments.push({
      id: `pay-${p.id}`,
      user_id: p.id,
      round_id: roundId,
      amount: CONFIG.defaultFee,
      status: paid ? 'paid' : 'pending',
      method: paid ? 'کارت به کارت' : '—',
      ref: paid ? `TRZ-${1000 + idx}` : '',
      paid_at: paid ? new Date(now.getTime() - (idx + 1) * 86400000).toISOString() : null,
      created_at: new Date().toISOString(),
    });
  });

  const paidCount = payments.filter((p) => p.status === 'paid').length;
  rounds[0].prize_pool = paidCount * CONFIG.defaultFee;

  // ماه گذشته (تسویه‌شده) برای نمایش تاریخچه
  const prevJm = range.jm === 1 ? 12 : range.jm - 1;
  const prevJy = range.jm === 1 ? range.jy - 1 : range.jy;
  const prevId = 'demo-round-prev';
  rounds.push({
    id: prevId,
    round_key: `${prevJy}-${pad2(prevJm)}`,
    title: `${MONTHS[prevJm - 1]} ${prevJy}`,
    starts_on: iso(fromJalali(prevJy, prevJm, 1)),
    ends_on: iso(fromJalali(prevJy, prevJm, 30)),
    fee: CONFIG.defaultFee,
    status: 'settled',
    prize_pool: 7 * CONFIG.defaultFee,
    seed: 771122,
    winner_user_id: 'demo-2',
    settled_at: iso(range.start),
    created_at: new Date().toISOString(),
  });

  [
    { user: 'demo-2', promised: 6, chance: 6, compliant: true, won: true },
    { user: 'demo-1', promised: 4, chance: 4, compliant: true, won: false },
    { user: 'demo-5', promised: 4, chance: 4, compliant: true, won: false },
    { user: 'demo-3', promised: 3, chance: 3, compliant: false, won: false },
    { user: 'demo-4', promised: 5, chance: 5, compliant: false, won: false },
  ].forEach((s, i) => {
    settlements.push({
      id: `settle-${prevId}-${i}`,
      round_id: prevId,
      user_id: s.user,
      final_weight: 0,
      promised_weight: 0,
      chance: s.chance,
      compliant: s.compliant,
      won: s.won,
      created_at: new Date().toISOString(),
    });
  });

  const users = participants.map((p) => ({
    id: p.id,
    email: p.email,
    password: p.isDemo ? CONFIG.demo.password : 'demo1234',
    name: p.name,
  }));

  return {
    version: 5,
    createdAt: new Date().toISOString(),
    users,
    tables: {
      weight_profiles: profiles,
      weight_rounds: rounds,
      weight_pledges: pledges,
      weight_entries: entries,
      weight_payments: payments,
      weight_settlements: settlements,
      weight_notes: [],
    },
  };
}
