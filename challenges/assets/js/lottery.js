/** قرعه‌کشی وزنی: هر کیلوگرم تعهد = یک بلیت، فقط بین کسانی که به تعهد رسیده‌اند. */
import { hashString } from './utils.js';
import { mulberry32 } from './demo-data.js';

export function chancesFor(promiseKg) {
  const kg = Number(promiseKg) || 0;
  return Math.max(1, Math.round(kg));
}

/**
 * @param {Array} rows [{id, name, chance, compliant}]
 * @param {string|number} seed
 */
export function drawWinner(rows, seed) {
  const eligible = rows.filter((r) => r.compliant && r.chance > 0);
  const total = eligible.reduce((a, b) => a + Number(b.chance), 0);
  const rand = mulberry32(hashString(String(seed)));
  const roll = rand() * total;
  let cursor = 0;
  let winner = null;
  const tickets = eligible.map((row) => {
    const from = cursor;
    cursor += Number(row.chance);
    const isWinner = !winner && roll < cursor;
    if (isWinner) winner = row;
    return { ...row, from, to: cursor, isWinner };
  });
  return { winner: winner || eligible.at(-1) || null, eligible, tickets, total, roll, seed: String(seed) };
}

/** شبیه‌سازی مونت‌کارلو برای نمایش عادلانه بودن شانس‌ها */
export function simulate(rows, runs = 4000) {
  const eligible = rows.filter((r) => r.compliant && r.chance > 0);
  const total = eligible.reduce((a, b) => a + Number(b.chance), 0);
  if (!total) return [];
  const counts = new Map(eligible.map((r) => [r.id, 0]));
  const rand = mulberry32(982451653);
  for (let i = 0; i < runs; i += 1) {
    let roll = rand() * total;
    let picked = eligible.at(-1);
    for (const row of eligible) {
      roll -= Number(row.chance);
      if (roll < 0) { picked = row; break; }
    }
    counts.set(picked.id, (counts.get(picked.id) || 0) + 1);
  }
  return eligible.map((row) => ({
    ...row,
    wins: counts.get(row.id) || 0,
    share: ((counts.get(row.id) || 0) / runs) * 100,
  }));
}

/** سهم هر نفر در صورت تقسیم مساوی استخر بین واجدین شرایط */
export function equalSplit(pool, eligibleCount) {
  if (!eligibleCount) return 0;
  return Math.floor(pool / eligibleCount);
}
