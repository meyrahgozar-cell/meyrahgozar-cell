// ---------------------------------------------------------------------------
// math.js — the scoring engine.
//
// The dataset is a cube:  traits x rankers x targets.
// Three ways to slice it (the three site views):
//   trait  -> stack per trait, table = rankers(rows) x targets(cols)
//   ranker -> stack per ranker, table = targets(rows) x traits(cols)
//   target -> stack per target, table = rankers(rows) x traits(cols)
// ---------------------------------------------------------------------------

import { clamp, sum, avg, round } from './dom.js';

export const cellKey = (traitId, rankerId, targetId) => `${traitId}|${rankerId}|${targetId}`;

export function stats(values) {
  const n = values.length;
  if (!n) return { n: 0, sum: 0, mean: 0, median: 0, min: 0, max: 0, sd: 0, variance: 0, range: 0, q1: 0, q3: 0, iqr: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = sum(values);
  const mean = total / n;
  const variance = n > 1 ? sum(values.map(v => (v - mean) ** 2)) / (n - 1) : 0;
  const q = (p) => {
    const pos = (n - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
  };
  const q1 = q(0.25), q3 = q(0.75);
  return {
    n, sum: total, mean,
    median: q(0.5), min: sorted[0], max: sorted[n - 1],
    sd: Math.sqrt(variance), variance, range: sorted[n - 1] - sorted[0],
    q1, q3, iqr: q3 - q1
  };
}

export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = avg(xs.slice(0, n)), my = avg(ys.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

export function spearman(xs, ys) {
  const rank = (arr) => {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(arr.length);
    idx.forEach(([, i], r) => { out[i] = r + 1; });
    return out;
  };
  return pearson(rank(xs), rank(ys));
}

export function normalise(value, min, max) {
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// A score stores the raw value; polarity decides which end is "good".
export function polarise(value, trait) {
  const min = trait?.min ?? 0, max = trait?.max ?? 10;
  return trait?.polarity === -1 ? max - value + min : value;
}

export function pct(value, trait) {
  const min = trait?.min ?? 0, max = trait?.max ?? 10;
  return clamp(normalise(value, min, max), 0, 1);
}

// ---------------------------------------------------------------------------
// Cube accessor: wraps people/traits/scores with memoised slices.
// ---------------------------------------------------------------------------
export class Cube {
  constructor({ people = [], traits = [], scores = [] } = {}) {
    this.people = people;
    this.traits = traits;
    this.scores = scores;
    this.personById = new Map(people.map(p => [p.id, p]));
    this.traitById = new Map(traits.map(t => [t.id, t]));
    this.index = new Map();
    this.version = 0;
    this._memo = new Map();
    this.reindex(scores);
  }

  reindex(scores = this.scores) {
    this.scores = scores;
    this.index.clear();
    for (const s of scores) this.index.set(cellKey(s.traitId, s.rankerId, s.targetId), s);
    this.version++;
    this._memo.clear();
    this._buildAggregates();
  }

  setData({ people, traits, scores }) {
    if (people) { this.people = people; this.personById = new Map(people.map(p => [p.id, p])); }
    if (traits) { this.traits = traits; this.traitById = new Map(traits.map(t => [t.id, t])); }
    this.reindex(scores || this.scores);
  }

  memo(key, factory) {
    if (this._memo.has(key)) return this._memo.get(key);
    const value = factory();
    this._memo.set(key, value);
    return value;
  }

  get(traitId, rankerId, targetId) {
    return this.index.get(cellKey(traitId, rankerId, targetId)) || null;
  }

  value(traitId, rankerId, targetId, fallback = null) {
    const cell = this.get(traitId, rankerId, targetId);
    return cell ? Number(cell.value) : fallback;
  }

  hasCell(traitId, rankerId, targetId) {
    return this.index.has(cellKey(traitId, rankerId, targetId));
  }

  // ------------------------------------------------------------- aggregates
  _buildAggregates() {
    const consensus = new Map();   // `${trait}|${target}` -> {values[], mean, sd, n}
    const traitValues = new Map();
    const rankerValues = new Map();
    const targetValues = new Map();

    for (const s of this.scores) {
      const v = Number(s.value);
      if (!Number.isFinite(v)) continue;
      const ck = `${s.traitId}|${s.targetPersonId ?? s.targetId}`;
      let bucket = consensus.get(ck);
      if (!bucket) { bucket = { values: [], total: 0 }; consensus.set(ck, bucket); }
      bucket.values.push(v);
      bucket.total += v;

      if (!traitValues.has(s.traitId)) traitValues.set(s.traitId, []);
      traitValues.get(s.traitId).push(v);
      const rk = s.rankerPersonId ?? s.rankerId;
      const tk = s.targetPersonId ?? s.targetId;
      if (!rankerValues.has(rk)) rankerValues.set(rk, []);
      rankerValues.get(rk).push(v);
      if (!targetValues.has(tk)) targetValues.set(tk, []);
      targetValues.get(tk).push(v);
    }

    this.consensus = new Map();
    for (const [ck, bucket] of consensus) {
      const s = stats(bucket.values);
      this.consensus.set(ck, { mean: s.mean, sd: s.sd, n: s.n, min: s.min, max: s.max, median: s.median });
    }

    this.traitStats = new Map([...traitValues].map(([k, v]) => [k, stats(v)]));
    this.rankerStats = new Map([...rankerValues].map(([k, v]) => [k, stats(v)]));
    this.targetStats = new Map([...targetValues].map(([k, v]) => [k, stats(v)]));
  }

  consensusOf(traitId, targetId) {
    return this.consensus.get(`${traitId}|${targetId}`) || null;
  }

  // Weighted composite of consensus per target, honouring trait weights+polarity.
  composite(targetId, traitPool = this.traits) {
    return this.memo(`composite:${targetId}:${traitPool.length}:${this.version}`, () => {
      let wsum = 0, total = 0, covered = 0;
      for (const t of traitPool) {
        const c = this.consensusOf(t.id, targetId);
        if (!c) continue;
        covered++;
        const w = Number(t.weight ?? 1);
        total += polarise(c.mean, t) * w;
        wsum += w;
      }
      return { score: wsum ? total / wsum : 0, weight: wsum, covered, total: traitPool.length };
    });
  }

  // How far a ranker sits from consensus, per trait (bias map).
  rankerBias(rankerId) {
    return this.memo(`bias:${rankerId}:${this.version}`, () => {
      const rows = [];
      for (const t of this.traits) {
        const mine = [];
        const others = [];
        for (const s of this.scores) {
          if (s.traitId !== t.id) continue;
          const r = s.rankerPersonId ?? s.rankerId;
          (r === rankerId ? mine : others).push(Number(s.value));
        }
        if (!mine.length) continue;
        rows.push({
          trait: t,
          rankerMean: avg(mine),
          groupMean: others.length ? avg(others) : avg(mine),
          delta: others.length ? avg(mine) - avg(others) : 0,
          cells: mine.length
        });
      }
      return rows;
    });
  }

  // Per-person view of how they score others vs how others score them.
  personProfile(personId) {
    return this.memo(`profile:${personId}:${this.version}`, () => {
      const given = this.scores.filter(s => (s.rankerPersonId ?? s.rankerId) === personId);
      const received = this.scores.filter(s => (s.targetPersonId ?? s.targetId) === personId);
      const traitRows = this.traits.map(t => {
        const g = given.filter(s => s.traitId === t.id).map(s => Number(s.value));
        const r = received.filter(s => s.traitId === t.id).map(s => Number(s.value));
        const gs = stats(g), rs = stats(r);
        return {
          trait: t, givenMean: gs.mean, givenN: gs.n, receivedMean: rs.mean,
          receivedN: rs.n, spread: rs.sd, gap: gs.mean - rs.mean
        };
      }).filter(r => r.givenN || r.receivedN);

      const recvAll = received.map(s => Number(s.value));
      const traitSpread = traitRows.filter(r => r.receivedN > 1).map(r => r.spread);
      return {
        person: this.personById.get(personId),
        given, received, traitRows,
        givenCount: given.length,
        receivedCount: received.length,
        givenMean: avg(given.map(s => Number(s.value))),
        receivedMean: avg(recvAll),
        generosity: avg(given.map(s => Number(s.value))) - avg(this.scores.map(s => Number(s.value))),
        polarization: avg(traitSpread),
        coverage: this.people.length > 1
          ? given.length / ((this.people.length - 1) * Math.max(this.traits.length, 1))
          : 0,
        consistency: traitRows.length
          ? 1 - clamp(stats(traitRows.map(r => r.spread)).mean / 4, 0, 1)
          : 0
      };
    });
  }

  // Agreement between two rankers over shared cells.
  agreement(a, b) {
    return this.memo(`agree:${a}:${b}:${this.version}`, () => {
      const mapA = new Map(), mapB = new Map();
      for (const s of this.scores) {
        const tid = `${s.traitId}|${s.targetPersonId ?? s.targetId}`;
        const r = s.rankerPersonId ?? s.rankerId;
        if (r === a) mapA.set(tid, Number(s.value));
        if (r === b) mapB.set(tid, Number(s.value));
      }
      const xs = [], ys = [];
      for (const [k, v] of mapA) if (mapB.has(k)) { xs.push(v); ys.push(mapB.get(k)); }
      if (xs.length < 2) return { n: xs.length, r: 0, rho: 0, mae: 0, overlap: 0 };
      return {
        n: xs.length,
        r: pearson(xs, ys),
        rho: spearman(xs, ys),
        mae: avg(xs.map((v, i) => Math.abs(v - ys[i]))),
        overlap: xs.length
      };
    });
  }

  // Who inflates/underscores relative to consensus.
  influence(rankerId) {
    return this.memo(`influence:${rankerId}:${this.version}`, () => {
      const xs = [], ys = [];
      for (const s of this.scores) {
        const r = s.rankerPersonId ?? s.rankerId;
        if (r !== rankerId) continue;
        const c = this.consensusOf(s.traitId, s.targetPersonId ?? s.targetId);
        if (c) { xs.push(Number(s.value)); ys.push(c.mean); }
      }
      return {
        n: xs.length,
        alignment: pearson(xs, ys),
        generosity: xs.length ? avg(xs) - avg(ys) : 0
      };
    });
  }

  // Reciprocity: A->B vs B->A across traits.
  reciprocity(a, b) {
    return this.memo(`recip:${a}:${b}:${this.version}`, () => {
      const rows = this.traits.map(t => {
        const ab = this.value(t.id, a, b);
        const ba = this.value(t.id, b, a);
        return { trait: t, ab, ba, gap: ab !== null && ba !== null ? ab - ba : null };
      }).filter(r => r.ab !== null || r.ba !== null);
      const gaps = rows.filter(r => r.gap !== null).map(r => Math.abs(r.gap));
      return {
        rows,
        meanGap: avg(gaps),
        balance: rows.length ? 1 - clamp(avg(gaps) / 5, 0, 1) : 0,
        asymmetries: rows.filter(r => r.gap !== null && Math.abs(r.gap) >= 1.5)
      };
    });
  }

  // Matrix slices ----------------------------------------------------------
  traitMatrix(traitId) {
    return this.memo(`tm:${traitId}:${this.version}`, () => {
      const t = this.traitById.get(traitId);
      return {
        rows: this.people,
        cols: this.people,
        value: (r, c) => (r.id === c.id ? null : this.value(traitId, r.id, c.id)),
        cell: (r, c) => (r.id === c.id ? null : this.get(traitId, r.id, c.id)),
        trait: t
      };
    });
  }

  rankerMatrix(rankerId) {
    return this.memo(`rm:${rankerId}:${this.version}`, () => ({
      rows: this.people.filter(p => p.id !== rankerId),
      cols: this.traits,
      value: (r, c) => this.value(c.id, rankerId, r.id),
      cell: (r, c) => this.get(c.id, rankerId, r.id)
    }));
  }

  targetMatrix(targetId) {
    return this.memo(`tgm:${targetId}:${this.version}`, () => ({
      rows: this.people.filter(p => p.id !== targetId),
      cols: this.traits,
      value: (r, c) => this.value(c.id, r.id, targetId),
      cell: (r, c) => this.get(c.id, r.id, targetId)
    }));
  }

  stackMatrix(mode, axisId) {
    if (mode === 'trait') return this.traitMatrix(axisId);
    if (mode === 'ranker') return this.rankerMatrix(axisId);
    return this.targetMatrix(axisId);
  }

  // Summary stats for the dashboard ---------------------------------------
  overview() {
    return this.memo(`overview:${this.version}`, () => {
      const values = this.scores.map(s => Number(s.value)).filter(Number.isFinite);
      const s = stats(values);
      const possible = this.people.length * Math.max(this.people.length - 1, 0) * this.traits.length;
      const composites = this.people.map(p => ({ person: p, ...this.composite(p.id) }));
      const ranked = [...composites].sort((a, b) => b.score - a.score);
      const polar = [];
      for (const [ck, c] of this.consensus) {
        if (c.n < 2) continue;
        const [traitId, targetId] = ck.split('|');
        polar.push({ traitId, targetId, sd: c.sd, n: c.n, mean: c.mean });
      }
      polar.sort((a, b) => b.sd - a.sd);
      return {
        cells: this.scores.length,
        possible,
        fill: possible ? this.scores.length / possible : 0,
        mean: s.mean,
        sd: s.sd,
        min: s.min,
        max: s.max,
        median: s.median,
        ranked,
        top: ranked[0] || null,
        bottom: ranked[ranked.length - 1] || null,
        mostPolarizing: polar.slice(0, 6),
        mostAgreed: [...polar].sort((a, b) => a.sd - b.sd).slice(0, 6),
        activeRankers: new Set(this.scores.map(s2 => s2.rankerPersonId ?? s2.rankerId)).size
      };
    });
  }

  // Leaderboard for one trait.
  traitLeaderboard(traitId, { includeUnrated = false } = {}) {
    const trait = this.traitById.get(traitId);
    if (!trait) return [];
    return this.people.map(p => {
      const c = this.consensusOf(traitId, p.id);
      const own = this.value(traitId, p.id, p.id);
      return {
        person: p,
        mean: c?.mean ?? null,
        sd: c?.sd ?? 0,
        n: c?.n ?? 0,
        self: own,
        weighted: c ? polarise(c.mean, trait) : null
      };
    }).filter(r => includeUnrated || r.n > 0)
      .sort((a, b) => (b.weighted ?? -1) - (a.weighted ?? -1));
  }

  // All pairwise agreements, for the network/heatmap views.
  agreementMatrix() {
    return this.memo(`agreeMatrix:${this.version}`, () => {
      const n = this.people.length;
      const matrix = Array.from({ length: n }, () => new Array(n).fill(null));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = this.agreement(this.people[i].id, this.people[j].id);
          matrix[i][j] = matrix[j][i] = a.n >= 2 ? a.r : null;
        }
      }
      return matrix;
    });
  }

  // Simple 3D embedding (trait-space) for the scatter view — PCA-like via
  // power iteration on the centred score matrix, no dependencies.
  embedPeople() {
    return this.memo(`embed:${this.version}`, () => {
      const dims = this.traits.length;
      if (!dims || !this.people.length) return [];
      const rows = this.people.map(p => this.traits.map(t => {
        const c = this.consensusOf(t.id, p.id);
        return c ? normalise(polarise(c.mean, t), t.min, t.max) : 0.5;
      }));
      const centre = new Array(dims).fill(0);
      for (const row of rows) row.forEach((v, i) => { centre[i] += v / rows.length; });
      const centred = rows.map(row => row.map((v, i) => v - centre[i]));

      const powerIteration = (matrix, exclude = []) => {
        let vec = new Array(dims).fill(0).map((_, i) => Math.sin(i + 1) + 0.001);
        for (let iter = 0; iter < 24; iter++) {
          const next = new Array(dims).fill(0);
          for (const row of matrix) {
            const dot = row.reduce((a, v, i) => a + v * vec[i], 0);
            row.forEach((v, i) => { next[i] += v * dot; });
          }
          exclude.forEach(i => { next[i] = 0; });
          const norm = Math.hypot(...next) || 1;
          vec = next.map(v => v / norm);
        }
        return vec;
      };

      const axisX = powerIteration(centred);
      const axisY = powerIteration(centred, []);
      const axisZ = powerIteration(centred, []);
      const project = (axis) => {
        const raw = centred.map(row => row.reduce((a, v, i) => a + v * axis[i], 0));
        const s = stats(raw);
        return raw.map(v => (s.max === s.min ? 0.5 : (v - s.min) / (s.max - s.min)));
      };
      const xs = project(axisX), ys = project(axisY), zs = project(axisZ);
      return this.people.map((p, i) => ({ person: p, x: xs[i], y: ys[i], z: zs[i] }));
    });
  }

  // Cells with the widest disagreement (for the disputes panel).
  disputedCells(limit = 12) {
    const rows = [];
    for (const [ck, c] of this.consensus) {
      if (c.n < 2) continue;
      const [traitId, targetId] = ck.split('|');
      const vals = [];
      for (const s of this.scores) {
        if (s.traitId === traitId && (s.targetPersonId ?? s.targetId) === targetId) {
          vals.push({ rankerId: s.rankerPersonId ?? s.rankerId, value: Number(s.value) });
        }
      }
      vals.sort((a, b) => b.value - a.value);
      rows.push({
        traitId, targetId, sd: c.sd, mean: c.mean, n: c.n,
        high: vals[0], low: vals[vals.length - 1],
        gap: vals.length ? vals[0].value - vals[vals.length - 1].value : 0
      });
    }
    return rows.sort((a, b) => b.gap - a.gap).slice(0, limit);
  }

  exportJSON() {
    return {
      exported_at: new Date().toISOString(),
      version: 3,
      traits: this.traits,
      people: this.people,
      scores: this.scores
    };
  }
}

// Colour ramp: value -> colour, used by heatmaps and 3D layers.
export function scoreColor(t, alpha = 1) {
  const stops = [
    [0.00, [255, 77, 109]],
    [0.28, [255, 154, 84]],
    [0.52, [255, 224, 102]],
    [0.74, [126, 242, 170]],
    [1.00, [94, 242, 214]]
  ];
  const v = clamp(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (v >= a && v <= b) {
      const k = (v - a) / (b - a || 1);
      const c = ca.map((ch, j) => Math.round(ch + (cb[j] - ch) * k));
      return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
    }
  }
  return `rgba(94,242,214,${alpha})`;
}

export function scoreColorHex(t) {
  const rgba = scoreColor(t, 1);
  const m = rgba.match(/rgba\((\d+),(\d+),(\d+)/);
  if (!m) return '#5ef2d6';
  return '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('');
}

export function divergenceColor(delta, scale = 3) {
  const t = clamp(Math.abs(delta) / scale, 0, 1);
  return delta >= 0 ? `rgba(94,242,214,${0.15 + t * 0.65})` : `rgba(255,77,109,${0.15 + t * 0.65})`;
}

export function formatDelta(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${round(n, digits)}`;
}

export function confidenceLabel(c) {
  if (c >= 0.85) return 'firm';
  if (c >= 0.65) return 'solid';
  if (c >= 0.45) return 'soft';
  return 'thin';
}

export function reliabilityGrade({ n, sd }) {
  const consistency = 1 - clamp((sd || 0) / 4, 0, 1);
  const volume = clamp(n / 6, 0, 1);
  const score = consistency * 0.65 + volume * 0.35;
  if (score > 0.82) return { grade: 'A', score };
  if (score > 0.68) return { grade: 'B', score };
  if (score > 0.52) return { grade: 'C', score };
  if (score > 0.36) return { grade: 'D', score };
  return { grade: 'E', score };
}
