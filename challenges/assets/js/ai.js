/**
 * موتور تحلیل هوشمند «مربی ترازو».
 * همه‌ی محاسبات در مرورگر و روی داده‌ی واقعی کاربر انجام می‌شود:
 * BMI، BMR، TDEE، روند کاهش، پیش‌بینی پایان ماه، کیفیت اندازه‌گیری،
 * ریسک‌ها، توصیه‌ها و پاسخ‌گویی به پرسش‌های فارسی.
 */
import { CONFIG } from './config.js';
import { daysBetween, formatTime, relativeDay, toJalali, fromJalali } from './jalali.js';
import { avg, clamp, faDigits, round, sum } from './utils.js';

/* ------------------------------------------------------------- formulas */

export const bmiValue = (weightKg, heightCm) => {
  const h = Number(heightCm) / 100;
  if (!h || !weightKg) return null;
  return Number((Number(weightKg) / (h * h)).toFixed(1));
};

export function bmiBand(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { label: 'نامشخص', tone: 'muted' };
  }
  const band = CONFIG.bmi.bands.find((b) => value <= b.max) || CONFIG.bmi.bands.at(-1);
  return { label: band.label, tone: band.tone };
}

export function idealRange(heightCm) {
  const h = Number(heightCm) / 100;
  if (!h) return null;
  return {
    min: Number((CONFIG.bmi.safeMin * h * h).toFixed(1)),
    max: Number((CONFIG.bmi.safeMax * h * h).toFixed(1)),
  };
}

export function bmr({ gender, weight, heightCm, age }) {
  if (!weight || !heightCm || !age) return null;
  const base = 10 * Number(weight) + 6.25 * Number(heightCm) - 5 * Number(age);
  return Math.round(base + (gender === 'male' ? 5 : -161));
}

export function activityFactor(level) {
  return CONFIG.activityLevels.find((a) => a.value === level)?.factor || 1.375;
}

export const tdeeValue = (profile, weight) => {
  const b = bmr({
    gender: profile?.gender,
    weight,
    heightCm: profile?.height_cm,
    age: ageFromBirthYear(profile?.birth_year),
  });
  return b ? Math.round(b * activityFactor(profile?.activity_level)) : null;
};

export function ageFromBirthYear(birthYear) {
  if (!birthYear) return null;
  const { jy } = toJalali(new Date());
  const age = jy - Number(birthYear);
  return age > 0 && age < 120 ? age : null;
}

/* ------------------------------------------------------------- helpers */

function linearTrend(points) {
  if (points.length < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };
  const n = points.length;
  const mx = avg(points, (p) => p.x);
  const my = avg(points, (p) => p.y);
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    ssTot += (p.y - my) ** 2;
    ssRes += (p.y - (intercept + slope * p.x)) ** 2;
  }
  return { slope, intercept, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = avg(values);
  return Math.sqrt(avg(values, (v) => (v - m) ** 2));
}

function longestStreak(dayIndexes) {
  const set = new Set(dayIndexes);
  let best = 0;
  let current = 0;
  const max = Math.max(0, ...dayIndexes);
  for (let i = 0; i <= max; i += 1) {
    if (set.has(i)) {
      current += 1;
      best = Math.max(best, current);
    } else current = 0;
  }
  return best;
}

/* -------------------------------------------------------------- analysis */

/**
 * تحلیل کامل یک شرکت‌کننده در یک دوره.
 * @param {object} args {profile, pledge, entries, round, now}
 */
export function analyze({ profile, pledge, entries = [], round, now = new Date() }) {
  const empty = { hasData: false };
  if (!pledge || !profile) return empty;

  const sorted = [...entries].sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));
  const start = pledge.start_weight;
  const promised = pledge.promised_weight;
  const promiseKg = Number(pledge.promise_kg ?? Math.max(0, start - promised));
  const latest = sorted.at(-1);
  const current = latest ? Number(latest.weight) : Number(start);
  const height = Number(profile.height_cm) || null;

  const startDate = round ? new Date(`${round.starts_on}T00:00:00`) : new Date(sorted[0]?.entry_date || now);
  const endDate = round ? new Date(`${round.ends_on}T00:00:00`) : now;
  const todayIdx = clamp(daysBetween(startDate, now), 0, 40);
  const totalDays = Math.max(1, daysBetween(startDate, endDate));
  const daysLeft = Math.max(0, daysBetween(now, endDate));
  const daysElapsed = Math.max(1, Math.min(totalDays, todayIdx + 1));

  const points = sorted.map((e) => ({
    x: daysBetween(startDate, new Date(`${e.entry_date}T00:00:00`)),
    y: Number(e.weight),
    entry: e,
  }));
  const trend = linearTrend(points);
  const slopePerDay = trend.slope;
  const ratePerWeek = slopePerDay * 7;
  const projectedFinal = Number((current + slopePerDay * daysLeft).toFixed(1));
  const lost = Number((start - current).toFixed(1));
  const remaining = Number((current - promised).toFixed(1));
  const progressBase = start - promised;
  const progress = progressBase > 0 ? clamp((lost / progressBase) * 100, 0, 999) : 0;

  const bmi = bmiValue(current, height);
  const bmiStart = bmiValue(start, height);
  const ideal = idealRange(height);
  const band = bmiBand(bmi);
  const age = ageFromBirthYear(profile.birth_year);
  const bmrValue = bmr({ gender: profile.gender, weight: current, heightCm: height, age });
  const tdee = tdeeValue(profile, current);

  // کالری لازم برای رسیدن به تعهد
  const kcalPerKg = 7700;
  const neededPerDay = daysLeft > 0 ? (remaining * kcalPerKg) / daysLeft : null;
  const floor = profile.gender === 'male' ? 1500 : 1200;
  const calorieTarget = tdee
    ? Math.max(floor, Math.round((tdee - (neededPerDay || 400)) / 10) * 10)
    : null;

  const recent = points.filter((p) => p.x >= todayIdx - 6);
  const recentTrend = linearTrend(recent);
  const mood = recentTrend.slope < -0.02 ? 'down' : recentTrend.slope > 0.02 ? 'up' : 'flat';

  const daySet = points.map((p) => p.x);
  const adherence = clamp((daySet.length / daysElapsed) * 100, 0, 100);
  const streak = longestStreak(daySet);
  const lastEntryDays = latest ? daysBetween(new Date(`${latest.entry_date}T00:00:00`), now) : null;

  const morningEmpty = sorted.filter((e) => e.stomach === 'empty' && Number(e.measure_hour) <= 10).length;
  const fullStomach = sorted.filter((e) => e.stomach === 'full').length;
  const hours = sorted.map((e) => Number(e.measure_hour)).filter((h) => Number.isFinite(h));
  const hourSpread = hours.length ? Math.max(...hours) - Math.min(...hours) : 0;
  const weights = sorted.map((e) => Number(e.weight));
  const noise = stdDev(weights.slice(-8));
  const quality = sorted.length
    ? clamp(
      100 - fullStomach * 8 - (hourSpread > 3 ? 18 : hourSpread > 1 ? 8 : 0) - (noise > 1.2 ? 18 : noise > 0.7 ? 9 : 0),
      10,
      100,
    )
    : 0;

  const risks = [];
  const push = (level, text) => risks.push({ level, text });

  if (bmi && bmi < CONFIG.bmi.safeMin) push('high', 'شاخص توده بدنی شما پایین‌تر از محدوده‌ی سالم است؛ ادامه‌ی کاهش وزن توصیه نمی‌شود.');
  if (bmi && bmi >= 35) push('high', 'BMI بالای ۳۵ نیاز به پیگیری پزشک دارد؛ برنامه‌ی کاهش وزن را با نظر متخصص پیش ببرید.');
  if (promiseKg > start * 0.08) push('medium', 'تعهد شما بیش از ۸٪ وزن بدن در یک ماه است؛ چنین شیبی به‌سختی پایدار می‌ماند.');
  if (pledge.target_bmi && pledge.target_bmi < CONFIG.bmi.safeMin) push('high', 'BMI هدف شما کمتر از ۱۸٫۵ است و برای سلامتی مناسب نیست.');
  if (ratePerWeek < -(current * 0.012)) push('medium', 'سرعت کاهش وزن شما بیش از ۱٪ وزن بدن در هفته است؛ ممکن است عضله از دست برود.');
  if (adherence < 55 && points.length >= 3) push('medium', 'کمتر از نیمی از روزها وزن ثبت شده؛ تحلیل روند دقیق نیست.');
  if (hourSpread > 3) push('low', 'ساعت اندازه‌گیری شما متغیر است؛ همیشه در ساعت ثابت وزن کنید.');
  if (fullStomach > 2) push('low', 'چند ثبت با معده‌ی پر انجام شده؛ برای مقایسه، حالت ناشتا را انتخاب کنید.');
  if (lastEntryDays !== null && lastEntryDays >= 3) push('medium', `آخرین ثبت شما ${relativeDay(new Date(`${latest.entry_date}T00:00:00`))} بوده است.`);
  if (daysLeft <= 7 && remaining > 0 && ratePerWeek >= 0) push('high', 'در روزهای پایانی، روند فعلی شما را به تعهد نمی‌رساند.');

  const tips = [];
  if (tdee) {
    tips.push({
      icon: 'flame',
      title: 'سقف کالری امروز',
      text: `برای رسیدن به تعهد، حدود ${Math.max(floor, Math.round((tdee - neededPerDay) / 10) * 10)} کالری در روز مناسب است (TDEE شما ${tdee} کالری است).`,
    });
  }
  tips.push({
    icon: 'dumbbell',
    title: 'پروتئین و حفظ عضله',
    text: `روزانه حدود ${Math.round(current * 1.6)} گرم پروتئین (۱٫۶ گرم به ازای هر کیلو) و دو جلسه تمرین قدرتی در هفته را در برنامه بگذارید.`,
  });
  tips.push({
    icon: 'scale',
    title: 'پروتکل درست اندازه‌گیری',
    text: 'صبح، بعد از بیدار شدن و دستشویی، با معده‌ی خالی، لباس سبک و همان ترازو. همین شرایط را هر روز تکرار کنید.',
  });
  tips.push({
    icon: 'drop',
    title: 'آب و خواب',
    text: '۲ تا ۲٫۵ لیتر آب و ۷ تا ۸ ساعت خواب، نوسان وزن آب بدن را کم و اشتها را کنترل می‌کند.',
  });
  if (mood === 'flat') {
    tips.push({
      icon: 'refresh',
      title: 'شکستن فلات',
      text: '۷ تا ۱۰ روز روند ثابت مانده است. ۱۵۰۰ قدم به پیاده‌روی روزانه اضافه کنید یا کالری را ۱۰٪ کم کنید؛ یک روز بازخورد (refeed) هم کمک می‌کند.',
    });
  }
  if (mood === 'up') {
    tips.push({
      icon: 'alert',
      title: 'افزایش وزن اخیر',
      text: 'روند ۷ روز اخیر صعودی است. نمک، کربوهیدرات و خواب را بررسی کنید؛ اگر سه هفته ادامه یافت، کالری را بازبینی کنید.',
    });
  }

  let score = 60;
  score += clamp(lost / Math.max(0.5, promiseKg), 0, 1) * 22;
  score += (adherence / 100) * 10;
  score += ((quality - 60) / 40) * 8;
  if (mood === 'down') score += 6;
  if (mood === 'up') score -= 8;
  if (risks.some((r) => r.level === 'high')) score -= 10;
  const finalScore = Math.round(clamp(score, 5, 100));

  return {
    hasData: true,
    profile,
    pledge,
    entries: sorted,
    latest,
    lastEntryDays,
    start,
    current,
    promised,
    promiseKg,
    height,
    bmi,
    bmiStart,
    band,
    ideal,
    bmiDelta: bmi && bmiStart ? Number((bmi - bmiStart).toFixed(1)) : null,
    age,
    bmr: bmrValue,
    tdee,
    calorieTarget,
    deficit: neededPerDay ? Math.round(neededPerDay) : null,
    lost,
    remaining,
    progress,
    daysLeft,
    daysElapsed,
    totalDays,
    slopePerDay,
    ratePerWeek,
    projectedFinal,
    onTrack: projectedFinal <= promised + 0.05,
    mood,
    adherence,
    streak,
    quality,
    hourSpread,
    noise,
    risks,
    tips,
    score: finalScore,
    points,
    chance: Math.max(1, Math.round(promiseKg)),
    compliant: current <= promised + 0.0001,
    projectionGap: Number((projectedFinal - promised).toFixed(1)),
  };
}

/* ---------------------------------------------------------------- status */

export function statusFor(row) {
  if (!row?.hasData) return { key: 'nodata', label: 'بدون ثبت', tone: 'muted' };
  if (row.compliant) return { key: 'done', label: 'به تعهد رسید', tone: 'brand' };
  if (row.onTrack) return { key: 'ontrack', label: 'در مسیر تعهد', tone: 'sky' };
  if (row.daysLeft <= 7) return { key: 'risk', label: 'در خطر', tone: 'danger' };
  return { key: 'behind', label: 'عقب‌تر از برنامه', tone: 'gold' };
}

/* ------------------------------------------------------------- coach chat */

const INTENTS = [
  { key: 'plateau', words: ['ثابت', 'گیر', 'پلاتو', 'کاهش نمی', 'پیشرفت نمی', 'استپ'] },
  { key: 'goal', words: ['چقدر', 'مانده', 'تا هدف', 'تا تعهد', 'چند کیلو', 'برسم'] },
  { key: 'calorie', words: ['کالری', 'غذا', 'رژیم', 'بخورم', 'وعده', 'پروتئین'] },
  { key: 'exercise', words: ['ورزش', 'تمرین', 'پیاده', 'قدم', 'باشگاه', 'حرکت'] },
  { key: 'water', words: ['آب', 'کم‌آبی', 'نوشیدنی'] },
  { key: 'sleep', words: ['خواب', 'استرس', 'خسته'] },
  { key: 'prize', words: ['جایزه', 'شانس', 'برنده', 'قرعه', 'پول', 'سهم'] },
  { key: 'bmi', words: ['bmi', 'بی‌ام‌آی', 'بی ام آی', 'شاخص', 'توده بدنی', 'قد'] },
  { key: 'measure', words: ['ساعت', 'ناشتا', 'معده', 'اندازه', 'ترازو', 'ثبت'] },
  { key: 'report', words: ['گزارش', 'پیشرفت', 'آمار', 'روند'] },
  { key: 'start', words: ['شروع', 'چطور', 'چگونه', 'راهنما', 'قانون'] },
  { key: 'motivation', words: ['انگیزه', 'خسته', 'بی‌خیال', 'ناامید', 'ولش'] },
];

function detectIntent(question) {
  const q = String(question || '').toLowerCase();
  for (const intent of INTENTS) {
    if (intent.words.some((w) => q.includes(w))) return intent.key;
  }
  return 'summary';
}

const faKg = (n) => `${Math.abs(Number(n) || 0).toFixed(1).replace('.', '٫').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])} کیلوگرم`;

/**
 * پاسخ مربی به یک پرسش فارسی، بر اساس تحلیل داده‌ی همان کاربر.
 */
export function coachAnswer(question, ctx) {
  const { analysis: a, board = [], profile, round } = ctx || {};
  const intent = detectIntent(question);

  if (!a?.hasData) {
    return {
      title: 'اول داده‌ات را کامل کنیم',
      paragraphs: [
        'برای تحلیل دقیق، باید قد، سال تولد، جنسیت و وزن شروع را در پروفایل ثبت کنی و تعهد این ماه را مشخص کنی.',
      ],
      list: ['پروفایل ← شرایط BMI را کامل کن', 'ثبت وزن ← اولین وزن امروز را ثبت کن', 'بعد دوباره از من بپرس'],
      cta: { label: 'تکمیل پروفایل', href: '#/profile' },
    };
  }

  const name = profile?.full_name?.split(' ')[0] || 'دوست من';
  const gapText = a.remaining > 0
    ? `${faKg(a.remaining)} تا تعهد ${a.promised} کیلویی مانده`
    : `${faKg(Math.abs(a.remaining))} پایین‌تر از تعهدت هستی`;

  switch (intent) {
    case 'plateau':
      return {
        title: 'چرا وزن ثابت مانده؟',
        paragraphs: [
          `روند ۷ روز اخیر تو ${a.mood === 'flat' ? 'تقریباً صاف' : a.mood === 'up' ? 'کمی صعودی' : 'نزولی'} است و شیب کلی ماه ${(-a.ratePerWeek).toFixed(2)} کیلو در هفته است.`,
          'ثابت ماندن چند روزه طبیعی است؛ وزن آب بدن، نمک و خواب می‌تواند تا ۱ کیلو نوسان بسازد. مهم روند ۱۰ روزه است، نه یک عدد.',
        ],
        list: [
          'همیشه ناشتا و در ساعت ثابت وزن کن (کیفیت ثبت فعلی: ' + a.quality + ' از ۱۰۰).',
          'پروتئین را به ۱٫۶ گرم به ازای هر کیلو وزن برسان و دو جلسه تمرین قدرتی اضافه کن.',
          a.mood === 'flat' ? '۱۵۰۰ تا ۲۰۰۰ قدم به پیاده‌روی روزانه اضافه کن یا کالری را ۱۰٪ کم کن.' : 'کالری را با TDEE فعلی تنظیم کن و وعده‌های بیرون‌ازخانه را نصف کن.',
          'خواب زیر ۶ ساعت، هورمون گرسنگی را بالا می‌برد؛ هدف ۷ تا ۸ ساعت.',
        ],
        cta: { label: 'دیدن گزارش شخصی', href: '#/report' },
      };
    case 'goal':
      return {
        title: 'فاصله تا تعهد پایان ماه',
        paragraphs: [
          `${name}، ${gapText}. ${a.daysLeft} روز تا پایان دوره باقی است.`,
          a.onTrack
            ? `با شیب فعلی، پیش‌بینی می‌شود پایان ماه حدود ${a.projectedFinal} کیلو باشی؛ یعنی تعهدت محقق می‌شود.`
            : `با شیب فعلی، پایان ماه حدود ${a.projectedFinal} کیلو می‌شوی؛ برای رسیدن به ${a.promised} کیلو باید روزی ${a.deficit ? Math.round(a.deficit) : '—'} کالری کسری بسازی.`,
        ],
        list: [
          `کاهش لازم: ${a.remaining > 0 ? faKg(a.remaining) : 'صفر — به تعهد رسیده‌ای'}`,
          `سرعت فعلی: ${Math.abs(a.ratePerWeek).toFixed(2)} کیلو در هفته`,
          `سهم شانس قرعه‌کشی: ${a.chance} بلیت (به ازای هر کیلو تعهد)`,
        ],
        cta: { label: 'ثبت وزن امروز', href: '#/log' },
      };
    case 'calorie': {
      const target = a.calorieTarget;
      return {
        title: 'برنامه‌ی کالری و غذا',
        paragraphs: [
          `BMR تو ${a.bmr} کالری و TDEE (با فعالیت فعلی) ${a.tdee} کالری در روز است.`,
          target
            ? `برای رسیدن به تعهد، روزانه حدود ${target} کالری هدف خوبی است؛ کمتر از ${faDigits(profile?.gender === 'male' ? 1500 : 1200)} کالری نرو.`
            : 'برای محاسبه‌ی دقیق، قد، سال تولد و سطح فعالیت را در پروفایل کامل کن.',
        ],
        list: [
          `پروتئین: حدود ${Math.round(a.current * 1.6)} گرم در روز (تخم‌مرغ، مرغ، ماست یونانی، حبوبات).`,
          'نصف بشقاب سبزیجات، یک‌چهارم پروتئین، یک‌چهارم کربوهیدرات کامل (برنج قهوه‌ای، نان سبوس‌دار).',
          'نوشیدنی شیرین و میان‌وعده‌های بسته‌بندی‌شده بیشترین کالری پنهان را دارند.',
          'یک روز در هفته آزاد ولی کنترل‌شده (نه پرخوری) به پایبندی کمک می‌کند.',
        ],
        cta: { label: 'محاسبه‌ی دقیق در پروفایل', href: '#/profile' },
      };
    }
    case 'exercise':
      return {
        title: 'حرکت و تمرین',
        paragraphs: [
          `در ماه ${a.lost > 0 ? faKg(a.lost) + ' کاهش داشته‌ای' : 'هنوز کاهش ثبت‌شده‌ای نداری'}؛ ترکیب پیاده‌روی و تمرین قدرتی بهترین نتیجه را می‌دهد.`,
          'هدف واقع‌بینانه: ۷ تا ۱۰ هزار قدم روزانه و ۲ تا ۳ جلسه تمرین قدرتی در هفته.',
        ],
        list: [
          'پیاده‌روی ۳۰ دقیقه بعد از غذا، قند خون را بهتر کنترل می‌کند.',
          'تمرین قدرتی با وزن بدن (اسکات، شنا، پلانک) برای حفظ عضله در دوره‌ی کسری کالری کافی است.',
          'روزهای پرشدت، ۳۰۰ تا ۵۰۰ کالری بیشتر آب و پروتئین لازم داری.',
          'درد مفصلی یا بیماری زمینه‌ای داری؟ قبل از شروع با پزشک مشورت کن.',
        ],
      };
    case 'water':
      return {
        title: 'آب و نوسان وزن',
        paragraphs: [
          'کم‌آبی باعث می‌شود بدن آب را نگه دارد و ترازو عدد بالاتری نشان دهد؛ این چربی نیست.',
          `برای وزن ${a.current} کیلو، روزانه حدود ${(a.current * 0.03).toFixed(1)} لیتر مایعات (شامل آب و چای کم‌شیرین) مناسب است.`,
        ],
        list: ['یک لیوان آب قبل از هر وعده', 'نمک را کم کن تا ورم صبحگاهی کمتر شود', 'قبل از وزن‌کشی، آب زیاد ننوش'],
      };
    case 'sleep':
      return {
        title: 'خواب، استرس و اشتها',
        paragraphs: [
          'کم‌خوابی هورمون گرلین (گرسنگی) را بالا و لپتین (سیری) را پایین می‌آورد؛ نتیجه‌اش ریزه‌خواری و توقف کاهش وزن است.',
          'هدف ۷ تا ۸ ساعت خواب شبانه و یک ساعت بدون موبایل قبل از خواب.',
        ],
        list: ['کافئین بعد از ساعت ۴ عصر را قطع کن', '۱۰ دقیقه پیاده‌روی عصرگاهی استرس را کم می‌کند', 'زمان خواب ثابت، مهم‌تر از طول خواب است'],
      };
    case 'prize': {
      const pool = sum(board.filter((b) => b.paid), (b) => b.feeAmount || 0);
      const eligible = board.filter((b) => b.compliant);
      const chances = sum(eligible, (b) => b.chance);
      return {
        title: 'جایزه و شانس بردن',
        paragraphs: [
          `استخر جایزه‌ی این دوره ${pool.toLocaleString('fa-IR')} تومان است و فقط بین افرادی تقسیم می‌شود که در پایان ماه به وزن تعهد رسیده باشند.`,
          `الان ${eligible.length} نفر به تعهد رسیده‌اند و مجموع بلیت‌های آن‌ها ${chances} است. سهم تو ${a.chance} بلیت است (هر کیلو تعهد = یک بلیت).`,
        ],
        list: [
          'بلیت‌ها بر اساس کیلوگرم تعهدِ کاهش وزن است، نه وزن فعلی.',
          'قرعه‌کشی با الگوریتم قابل بازبینی و بذر ثابت انجام می‌شود؛ نتیجه در گزارش کلی ثبت می‌شود.',
          'هرچه تعهد واقع‌بینانه‌تر و بزرگ‌تر باشد، شانس بیشتر — ولی نرسیدن به تعهد یعنی حذف از قرعه‌کشی.',
        ],
        cta: { label: 'مشاهده‌ی گزارش کلی', href: '#/overall' },
      };
    }
    case 'bmi':
      return {
        title: 'شاخص توده بدنی (BMI)',
        paragraphs: [
          `BMI فعلی تو ${a.bmi} است (${a.band.label}). محدوده‌ی سالم برای قد ${a.height} سانتی‌متر: ${a.ideal?.min} تا ${a.ideal?.max} کیلوگرم.`,
          a.bmiStart ? `از ابتدای دوره ${Math.abs(a.bmiDelta)} واحد ${a.bmiDelta < 0 ? 'کاهش' : 'افزایش'} داشته‌ای.` : '',
        ].filter(Boolean),
        list: [
          'BMI فقط یک شاخص غربالگری است؛ توزیع چربی و دور کمر هم مهم است.',
          'BMI هدف زیر ۱۸٫۵ در برنامه پذیرفته نمی‌شود.',
          'اگر BMI بالای ۳۵ است، برنامه را با پزشک تنظیم کن.',
        ],
        cta: { label: 'ویرایش شرایط BMI', href: '#/profile' },
      };
    case 'measure':
      return {
        title: 'درست وزن کردن',
        paragraphs: [
          `کیفیت ثبت‌های تو ${a.quality} از ۱۰۰ است. مهم‌ترین عامل، تکرار همان شرایط است: صبح، ناشتا، همان ترازو.`,
          a.hourSpread > 1 ? `ساعت اندازه‌گیری‌هایت ${a.hourSpread} ساعت اختلاف دارد؛ این می‌تواند تا نیم کیلو خطا ایجاد کند.` : 'ساعت اندازه‌گیری‌هایت منظم است؛ عالی.',
        ],
        list: [
          'بعد از بیدار شدن و دستشویی، با معده‌ی خالی وزن کن.',
          'لباس سبک و ثابت بپوش و ترازو را روی سطح سخت بگذار.',
          'در برنامه، ساعت و وضعیت معده را ثبت کن تا تحلیل دقیق‌تر شود.',
          'روزی یک‌بار کافی است؛ چند بار وزن کردن فقط نویز اضافه می‌کند.',
        ],
        cta: { label: 'ثبت وزن', href: '#/log' },
      };
    case 'report':
      return {
        title: 'خلاصه‌ی پیشرفت تو',
        paragraphs: [
          `از ${a.start} به ${a.current} کیلو رسیده‌ای (${a.lost > 0 ? faKg(a.lost) + ' کاهش' : 'بدون کاهش ثبت‌شده'}). پیشرفت نسبت به تعهد: ${Math.round(a.progress)}٪.`,
          `میانگین ثبت: ${Math.round(a.adherence)}٪ روزها، امتیاز پایبندی ${a.score} از ۱۰۰.`,
        ],
        list: [
          `${a.entries.length} ثبت وزن در این دوره`,
          `پیش‌بینی پایان ماه: ${a.projectedFinal} کیلو`,
          `وضعیت: ${a.onTrack ? 'در مسیر تعهد' : 'عقب‌تر از برنامه'}`,
        ],
        cta: { label: 'گزارش کامل شخصی', href: '#/report' },
      };
    case 'start':
      return {
        title: 'چطور شروع کنم؟',
        paragraphs: [
          '۱) ثبت‌نام کن و پروفایل را با قد، سال تولد و وزن شروع کامل کن. ۲) BMI هدف را انتخاب کن؛ برنامه محدوده‌ی سالم را پیشنهاد می‌دهد. ۳) تعهد وزن پایان ماه و شروع وزن را ثبت کن و سهم اشتراک را پرداخت کن.',
        ],
        list: [
          'هر روز صبح، ناشتا، وزن را با ساعت و وضعیت معده ثبت کن.',
          'پایان ماه، هرکس به وزن تعهد رسیده باشد وارد قرعه‌کشی می‌شود.',
          'استخر جایزه فقط به برنده‌ی قرعه‌کشی تعلق می‌گیرد؛ شانس هر نفر به اندازه‌ی کیلوهای تعهد است.',
        ],
        cta: { label: 'دیدن قوانین', href: '#/rules' },
      };
    case 'motivation':
      return {
        title: 'یک قدم کوچک، دوباره',
        paragraphs: [
          `${name}، تو ${a.entries.length} بار وزن کردی و ${a.lost > 0 ? faKg(a.lost) + ' کم کردی' : 'شروع کردی'}. همین ثبات از هر رژیم سخت‌گیرانه‌ای ارزشمندتر است.`,
          'هدف امروز را کوچک کن: یک وعده‌ی سالم، ۲۰ دقیقه پیاده‌روی، و ثبت وزن فردا صبح.',
        ],
        list: ['عادت‌ها را کوچک و تکرارپذیر نگه دار', 'پیشرفت را هفتگی بسنج، نه ساعتی', 'بهترین روزهایت را در گزارش ببین'],
      };
    default:
      return {
        title: `خلاصه‌ی وضعیت ${name}`,
        paragraphs: [
          `وزن فعلی ${a.current} کیلو، تعهد پایان ماه ${a.promised} کیلو. ${gapText}.`,
          `BMI ${a.bmi} (${a.band.label}) • پیشرفت ${Math.round(a.progress)}٪ • ${a.daysLeft} روز باقی مانده.`,
        ],
        list: [
          a.onTrack ? 'روند فعلی برای رسیدن به تعهد کافی است؛ همین مسیر را ادامه بده.' : 'برای رسیدن به تعهد، کسری کالری روزانه را جدی بگیر و ثبت‌ها را کامل کن.',
          `امتیاز پایبندی: ${a.score} از ۱۰۰`,
          `شانس قرعه‌کشی: ${a.chance} بلیت`,
        ],
        cta: { label: 'گزارش شخصی', href: '#/report' },
      };
  }
}

export const SUGGESTED_QUESTIONS = [
  'وضعیت من تا پایان ماه چطور است؟',
  'چرا وزنم ثابت مانده؟',
  'روزی چند کالری بخورم؟',
  'برای رسیدن به تعهد چه کنم؟',
  'چقدر شانس بردن جایزه دارم؟',
  'BMI من چطور است؟',
];
