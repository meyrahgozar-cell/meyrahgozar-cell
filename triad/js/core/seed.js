// ---------------------------------------------------------------------------
// seed.js — deterministic demo cube used by local mode and the demo deck.
// ---------------------------------------------------------------------------

import { uuid, seededRandom, clamp } from './dom.js';
import { TRAITS, TRAIT_CATEGORIES } from '../../data/traits.js';

const PEOPLE = [
  { name: 'Adler Voss', role: 'Systems Architect', dept: 'Platform', tags: ['architect', 'calm'] },
  { name: 'Brontë Mara', role: 'Product Lead', dept: 'Product', tags: ['product', 'decisive'] },
  { name: 'Cyrus Ilan', role: 'Staff Engineer', dept: 'Platform', tags: ['engineer'] },
  { name: 'Dalia Ren', role: 'Design Director', dept: 'Design', tags: ['design', 'taste'] },
  { name: 'Emil Sarto', role: 'Data Scientist', dept: 'Insights', tags: ['data', 'skeptic'] },
  { name: 'Farah Nouri', role: 'Engineering Manager', dept: 'Platform', tags: ['manager'] },
  { name: 'Gideon Pike', role: 'Security Lead', dept: 'Security', tags: ['security', 'direct'] },
  { name: 'Hana Ito', role: 'Research Engineer', dept: 'Labs', tags: ['research', 'curious'] },
  { name: 'Ivo Lenz', role: 'Growth Strategist', dept: 'Growth', tags: ['growth', 'bold'] },
  { name: 'Juno Adeyemi', role: 'Operations Lead', dept: 'Ops', tags: ['ops', 'steady'] },
  { name: 'Kai Sørensen', role: 'Staff Designer', dept: 'Design', tags: ['design', 'maker'] },
  { name: 'Lior Ashkenazi', role: 'AI Engineer', dept: 'Labs', tags: ['ai', 'builder'] }
];

const RAW_SCORE = new Map();

function deterministic(traitKey, rankerSlug, targetSlug) {
  const key = `${traitKey}|${rankerSlug}|${targetSlug}`;
  if (RAW_SCORE.has(key)) return RAW_SCORE.get(key);
  const rnd = seededRandom(key);
  const traitIdx = TRAITS.findIndex(t => t.key === traitKey);
  const rankerIdx = PEOPLE.findIndex(p => slugify(p.name) === rankerSlug);
  const targetIdx = PEOPLE.findIndex(p => slugify(p.name) === targetSlug);
  const value = clamp(
    5.7 +
    ((rankerIdx % 3) - 1) * 0.55 +
    ((targetIdx % 4) - 1.5) * 0.34 +
    ((traitIdx % 5) - 2) * 0.16 +
    (rnd() - 0.5) * 4.2,
    0.4, 9.9
  );
  RAW_SCORE.set(key, Math.round(value * 10) / 10);
  return RAW_SCORE.get(key);
}

export function slugify(str) {
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function demoPeople() {
  return PEOPLE.map((p, i) => ({
    id: `demo-person-${i}`,
    fullName: p.name,
    slug: slugify(p.name),
    jobTitle: p.role,
    department: p.dept,
    status: 'active',
    bio: null,
    avatarUrl: null,
    tags: p.tags,
    email: `${slugify(p.name)}@triad.local`,
    metadata: { seed: slugify(p.name), hue: (i * 37) % 360 },
    isDemo: true
  }));
}

export function demoTraitEntries({ count = 24 } = {}) {
  const chosen = TRAITS.slice(0, count);
  return chosen.map((t, i) => ({
    id: `demo-trait-${i}`,
    key: t.key,
    name: t.name,
    category: t.category,
    description: t.description,
    icon: t.icon,
    color: t.color,
    min: 0,
    max: 10,
    polarity: t.polarity,
    weight: t.weight,
    isCore: t.core,
    sortOrder: i,
    isDemo: true
  }));
}

export function demoCube({ traits = 24 } = {}) {
  const people = demoPeople();
  const traitRows = demoTraitEntries({ count: traits });
  const scores = [];
  for (const trait of traitRows) {
    for (const ranker of people) {
      for (const target of people) {
        if (ranker.id === target.id) continue;
        const value = deterministic(trait.key, ranker.slug, target.slug);
        const rnd = seededRandom(`c|${trait.key}|${ranker.slug}|${target.slug}`);
        scores.push({
          id: `demo-score-${scores.length}`,
          traitId: trait.id,
          rankerId: ranker.id,
          targetId: target.id,
          value,
          confidence: Math.round((0.55 + rnd() * 0.42) * 100) / 100,
          note: null,
          source: 'demo',
          updatedAt: new Date(Date.now() - Math.floor(rnd() * 12) * 86400000).toISOString()
        });
      }
    }
  }
  return { people, traits: traitRows, scores };
}

// A partial cube: only some rankers finished some traits — closer to reality,
// used by the "sparse" demo preset.
export function sparseDemoCube() {
  const cube = demoCube({ traits: 18 });
  const rnd = seededRandom('sparse-v1');
  return { ...cube, scores: cube.scores.filter(() => rnd() > 0.32) };
}

export function demoRelations(people) {
  const out = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const rnd = seededRandom(`rel|${people[i].slug}|${people[j].slug}`);
      if (rnd() < 0.24) out.push({ id: `rel-${i}-${j}`, personId: people[i].id, otherId: people[j].id, kind: 'peer', weight: 1 });
    }
  }
  return out;
}

export const DEMO_CATEGORIES = TRAIT_CATEGORIES;

export function buildDeckFromCube(cube, { rankerId, traitIds = null, limit = 40, onlyUnrated = true }) {
  const traits = traitIds ? cube.traits.filter(t => traitIds.includes(t.id)) : cube.traits;
  const items = [];
  for (const trait of traits) {
    for (const target of cube.people) {
      if (target.id === rankerId) continue;
      if (onlyUnrated && cube.hasCell(trait.id, rankerId, target.id)) continue;
      items.push({ trait, person: target, key: `${trait.id}|${target.id}` });
    }
  }
  const rnd = seededRandom(`deck|${rankerId}|${items.length}`);
  return items.sort(() => rnd() - 0.5).slice(0, limit);
}

export function syntheticId(kind, index) { return uuid(kind); }
