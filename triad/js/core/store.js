// ---------------------------------------------------------------------------
// store.js — one state object, one adapter, one cube. Every view reads here.
// ---------------------------------------------------------------------------
import { bus, EV } from './bus.js';
import { Cube, cellKey } from './math.js';
import { remote } from './api.js';
import { local } from './localdb.js';
import { STORAGE, DEFAULT_PREFS, ACCENTS, TABLES } from './config.js';
import { currentSession } from './auth.js';
import { uuid, debounce, round } from './dom.js';
import { TRAITS, TRAIT_CATEGORIES } from '../../data/traits.js';
import { demoCube, demoRelations } from './seed.js';

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch { return { ...fallback }; }
};

const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
};

class Store {
  constructor() {
    this.mode = 'local';
    this.sourcePreference = 'auto';
    this.people = [];
    this.traits = [];
    this.scores = [];
    this.relations = [];
    this.cube = new Cube();
    this.session = null;
    this.profile = null;
    this.probe = { ok: false, missing: [], counts: {} };
    this.loading = true;
    this.error = null;
    this.readOnly = false;
    this.selection = { mode: 'trait', stackId: null, traitId: null, personId: null };
    this.filters = { query: '', department: 'all', category: 'all', minCoverage: 0 };
    this.deckSession = null;
    this.activity = [];
    this.compact = false;
    this.prefs = readJSON(STORAGE.prefs, DEFAULT_PREFS);
    this.undoStack = [];
    this.lastSavedAt = null;
    this.aiKey = '';
    this.aiModel = '';
  }

  get adapter() { return this.mode === 'cloud' ? remote : local; }
  get isCloud() { return this.mode === 'cloud'; }
  get canWrite() { return this.mode === 'local' || Boolean(this.session?.user); }

  // ------------------------------------------------------------------ boot
  async init() {
    this.applyPrefs();
    this.session = await currentSession().catch(() => null);
    if (this.session?.user) this.profile = await this.loadProfileSafe();
    await this.load();
    this.loading = false;
    bus.emit(EV.DATA_LOADED, this.snapshot());
    return this;
  }

  async loadProfileSafe() {
    try {
      const { myProfile } = await import('./auth.js');
      return await myProfile();
    } catch { return null; }
  }

  async load({ silent = false } = {}) {
    this.error = null;
    try {
      this.probe = await remote.probe().catch(() => ({ ok: false, missing: [], counts: {} }));
      const remoteHasData = this.probe.ok && (this.probe.counts?.[TABLES.traits] || 0) > 0;
      const preferCloud = this.sourcePreference === 'cloud';
      const useCloud = this.sourcePreference === 'cloud'
        ? this.probe.ok
        : this.sourcePreference === 'local' ? false : remoteHasData;

      this.mode = useCloud ? 'cloud' : 'local';
      const data = await this.adapter.loadAll();
      this.people = data.people || [];
      this.traits = (data.traits || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      this.scores = data.scores || [];
      this.relations = data.relations || [];
      this.cube = new Cube({ people: this.people, traits: this.traits, scores: this.scores });
      this.readOnly = this.mode === 'cloud' && !this.session?.user;
      this.pushActivity('load', `Loaded ${this.scores.length} cells from ${this.mode}`);
      if (!silent) bus.emit(EV.DATA_CHANGED, { reason: 'load' });
      bus.emit(EV.DB_STATUS, { mode: this.mode, probe: this.probe, readOnly: this.readOnly });
    } catch (err) {
      console.error('[store] load failed', err);
      this.error = err.message;
      if (this.mode === 'cloud') {
        this.mode = 'local';
        const data = await local.loadAll();
        this.people = data.people;
        this.traits = data.traits;
        this.scores = data.scores;
        this.relations = data.relations;
        this.cube = new Cube({ people: this.people, traits: this.traits, scores: this.scores });
        bus.emit(EV.TOAST, { kind: 'warn', text: 'Cloud unreachable — local cube loaded' });
        bus.emit(EV.DATA_CHANGED, { reason: 'fallback' });
      }
    }
    return this;
  }

  async setSource(mode) {
    this.sourcePreference = mode;
    await this.load();
    bus.emit(EV.MODE_CHANGE, mode);
    bus.emit(EV.TOAST, { kind: 'ok', text: `Source: ${mode === 'auto' ? 'auto' : mode}` });
  }

  snapshot() {
    return {
      mode: this.mode,
      people: this.people,
      traits: this.traits,
      scores: this.scores,
      cube: this.cube,
      session: this.session,
      prefs: this.prefs
    };
  }

  refreshCube() {
    this.cube.setData({ people: this.people, traits: this.traits, scores: this.scores });
  }

  // ----------------------------------------------------------------- prefs
  applyPrefs() {
    const root = document.documentElement;
    const accent = ACCENTS[this.prefs.accent] || ACCENTS.aqua;
    root.style.setProperty('--accent', accent.accent);
    root.style.setProperty('--accent-2', accent.accent2);
    root.style.setProperty('--accent-3', accent.accent3);
    root.dataset.accent = this.prefs.accent;
    root.dataset.density = this.prefs.density;
    root.dataset.motion = this.prefs.motion;
    root.dataset.grain = this.prefs.grain ? 'on' : 'off';
    root.dataset.heat = this.prefs.heat;
    root.classList.toggle('reduce-motion', this.prefs.motion === 'reduced');
  }

  setPref(key, value) {
    this.prefs = { ...this.prefs, [key]: value };
    writeJSON(STORAGE.prefs, this.prefs);
    this.applyPrefs();
    bus.emit(EV.PREFS, this.prefs);
    this.savePrefsSoon();
    return this.prefs;
  }

  savePrefsSoon = debounce(() => {
    if (this.mode === 'cloud' && this.session?.user) {
      remote.savePrefs(this.prefs).catch(() => {});
    }
  }, 1200);

  resetPrefs() {
    this.prefs = { ...DEFAULT_PREFS };
    writeJSON(STORAGE.prefs, this.prefs);
    this.applyPrefs();
    bus.emit(EV.PREFS, this.prefs);
  }

  // ---------------------------------------------------------------- scores
  async setScore({ traitId, rankerId, targetId, value, confidence, note, source = 'manual' }) {
    if (traitId === null || !rankerId || !targetId) throw new Error('Incomplete cell');
    if (rankerId === targetId) throw new Error('Cannot score yourself');
    if (!this.canWrite) {
      bus.emit(EV.TOAST, { kind: 'warn', text: 'Sign in to write to the cloud cube' });
      throw new Error('read-only');
    }
    const trait = this.cube.traitById.get(traitId);
    const min = trait?.min ?? 0, max = trait?.max ?? 10;
    const clamped = round(Math.min(max, Math.max(min, Number(value))), 2);
    const key = cellKey(traitId, rankerId, targetId);
    const existing = this.cube.index.get(key);

    const optimistic = {
      id: existing?.id || uuid('score'),
      traitId, rankerId, targetId,
      value: clamped,
      confidence: confidence ?? existing?.confidence ?? 0.75,
      note: note ?? existing?.note ?? null,
      source,
      updatedAt: new Date().toISOString()
    };

    const idx = this.scores.findIndex(s => cellKey(s.traitId, s.rankerId, s.targetId) === key);
    if (idx >= 0) this.scores[idx] = optimistic; else this.scores.push(optimistic);
    this.refreshCube();
    bus.emit(EV.SCORE_SET, { score: optimistic, previous: existing || null });
    bus.emit(EV.DATA_CHANGED, { reason: 'score', silent: true });

    try {
      const saved = await this.adapter.upsertScore({
        traitId, rankerId, targetId, value: clamped,
        confidence: optimistic.confidence, note: optimistic.note, source
      });
      const savedIdx = this.scores.findIndex(s => cellKey(s.traitId, s.rankerId, s.targetId) === key);
      if (savedIdx >= 0) this.scores[savedIdx] = { ...optimistic, ...saved };
      this.refreshCube();
      this.pushUndo({
        kind: existing ? 'score-update' : 'score-create',
        payload: { traitId, rankerId, targetId, value: existing?.value ?? null, confidence: existing?.confidence ?? null, note: existing?.note ?? null }
      });
      this.lastSavedAt = new Date().toISOString();
      return saved;
    } catch (err) {
      if (existing) {
        const back = this.scores.findIndex(s => cellKey(s.traitId, s.rankerId, s.targetId) === key);
        if (back >= 0) this.scores[back] = existing;
      } else {
        this.scores = this.scores.filter(s => cellKey(s.traitId, s.rankerId, s.targetId) !== key);
      }
      this.refreshCube();
      bus.emit(EV.DATA_CHANGED, { reason: 'score-revert' });
      bus.emit(EV.TOAST, { kind: 'error', text: `Save failed: ${err.message}` });
      throw err;
    }
  }

  async setScoresBatch(rows, { source = 'manual', silent = false } = {}) {
    const clean = rows
      .filter(r => r.rankerId !== r.targetId && r.traitId && r.rankerId && r.targetId)
      .map(r => {
        const trait = this.cube.traitById.get(r.traitId);
        const min = trait?.min ?? 0, max = trait?.max ?? 10;
        return { ...r, value: round(Math.min(max, Math.max(min, Number(r.value))), 2), source };
      });
    if (!clean.length) return [];
    if (!this.canWrite) throw new Error('read-only');

    const map = new Map(this.scores.map(s => [cellKey(s.traitId, s.rankerId, s.targetId), s]));
    for (const row of clean) {
      const key = cellKey(row.traitId, row.rankerId, row.targetId);
      map.set(key, {
        id: map.get(key)?.id || uuid('score'),
        confidence: 0.75,
        ...map.get(key),
        ...row,
        updatedAt: new Date().toISOString()
      });
    }
    this.scores = [...map.values()];
    this.refreshCube();
    if (!silent) bus.emit(EV.SCORE_BULK, { count: clean.length });
    bus.emit(EV.DATA_CHANGED, { reason: 'bulk' });
    return this.adapter.bulkUpsertScores(clean);
  }

  async deleteScore(traitId, rankerId, targetId) {
    const key = cellKey(traitId, rankerId, targetId);
    const existing = this.cube.index.get(key);
    if (!existing) return false;
    this.scores = this.scores.filter(s => cellKey(s.traitId, s.rankerId, s.targetId) !== key);
    this.refreshCube();
    bus.emit(EV.DATA_CHANGED, { reason: 'score-delete' });
    if (this.mode === 'cloud') await this.adapter.deleteScore(existing.id).catch(() => {});
    this.pushUndo({ kind: 'score-delete', payload: { traitId, rankerId, targetId, value: existing.value, confidence: existing.confidence, note: existing.note } });
    return true;
  }

  // ------------------------------------------------------------------ undo
  pushUndo(entry) {
    this.undoStack.push({ ...entry, at: Date.now() });
    if (this.undoStack.length > 60) this.undoStack.shift();
    bus.emit(EV.UNDO, { size: this.undoStack.length });
  }

  get canUndo() { return this.undoStack.length > 0; }

  async undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    bus.emit(EV.UNDO, { size: this.undoStack.length });
    const { kind, payload } = entry;
    if (kind === 'score-create' || kind === 'score-update' || kind === 'score-delete') {
      if (payload.value === null || payload.value === undefined) {
        this.scores = this.scores.filter(s => cellKey(s.traitId, s.rankerId, s.targetId) !== cellKey(payload.traitId, payload.rankerId, payload.targetId));
        this.refreshCube();
        bus.emit(EV.DATA_CHANGED, { reason: 'undo' });
        return true;
      }
      const key = cellKey(payload.traitId, payload.rankerId, payload.targetId);
      const idx = this.scores.findIndex(s => cellKey(s.traitId, s.rankerId, s.targetId) === key);
      const row = {
        id: idx >= 0 ? this.scores[idx].id : uuid('score'),
        traitId: payload.traitId,
        rankerId: payload.rankerId,
        targetId: payload.targetId,
        value: payload.value,
        confidence: payload.confidence ?? 0.75,
        note: payload.note ?? null,
        source: 'undo',
        updatedAt: new Date().toISOString()
      };
      if (idx >= 0) this.scores[idx] = row; else this.scores.push(row);
      this.refreshCube();
      bus.emit(EV.DATA_CHANGED, { reason: 'undo' });
      await this.adapter.upsertScore(row).catch(() => {});
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------------- people
  async addPerson(input) {
    const base = {
      fullName: input.fullName?.trim() || 'Untitled person',
      slug: input.slug || slugifyName(input.fullName || uuid('p')),
      jobTitle: input.jobTitle || null,
      department: input.department || null,
      bio: input.bio || null,
      tags: input.tags || [],
      email: input.email || null,
      status: 'active',
      metadata: { hue: Math.floor(Math.random() * 360) }
    };
    if (!this.canWrite) throw new Error('read-only');
    const created = this.mode === 'cloud'
      ? await remote.insertPerson(base)
      : await local.insertPerson(base);
    this.people = [...this.people, created];
    this.refreshCube();
    bus.emit(EV.PEOPLE_CHANGED, { reason: 'create', person: created });
    bus.emit(EV.DATA_CHANGED, { reason: 'people' });
    return created;
  }

  async updatePerson(id, patch) {
    if (!this.canWrite) throw new Error('read-only');
    const updated = this.mode === 'cloud'
      ? await remote.updatePerson(id, patch)
      : await local.updatePerson(id, patch);
    this.people = this.people.map(p => (p.id === id ? { ...p, ...updated } : p));
    this.refreshCube();
    bus.emit(EV.PEOPLE_CHANGED, { reason: 'update', person: updated });
    bus.emit(EV.DATA_CHANGED, { reason: 'people' });
    return updated;
  }

  async deletePerson(id) {
    if (!this.canWrite) throw new Error('read-only');
    if (this.mode === 'cloud') await remote.deletePerson(id);
    else await local.deletePerson(id);
    this.people = this.people.filter(p => p.id !== id);
    this.scores = this.scores.filter(s => s.rankerId !== id && s.targetId !== id);
    this.refreshCube();
    bus.emit(EV.PEOPLE_CHANGED, { reason: 'delete', id });
    bus.emit(EV.DATA_CHANGED, { reason: 'people' });
    return true;
  }

  // ----------------------------------------------------------------- traits
  async addTrait(input) {
    const key = input.key || slugifyName(input.name || 'trait');
    if (this.traits.some(t => t.key === key)) throw new Error(`Trait "${key}" already exists`);
    const row = {
      key,
      name: input.name || key,
      category: input.category || 'general',
      description: input.description || '',
      icon: input.icon || 'spark',
      color: input.color || '#5ef2d6',
      min: input.min ?? 0,
      max: input.max ?? 10,
      polarity: input.polarity ?? 1,
      weight: input.weight ?? 1,
      isCore: Boolean(input.isCore),
      sortOrder: this.traits.length
    };
    if (!this.canWrite) throw new Error('read-only');
    const created = this.mode === 'cloud' ? await remote.insertTrait(row) : await local.insertTrait(row);
    this.traits = [...this.traits, created];
    this.refreshCube();
    bus.emit(EV.TRAITS_CHANGED, { reason: 'create', trait: created });
    bus.emit(EV.DATA_CHANGED, { reason: 'traits' });
    return created;
  }

  async updateTrait(id, patch) {
    if (!this.canWrite) throw new Error('read-only');
    const updated = this.mode === 'cloud'
      ? await remote.updateTrait(id, patch)
      : await local.updateTrait(id, patch);
    this.traits = this.traits.map(t => (t.id === id ? { ...t, ...updated } : t));
    this.refreshCube();
    bus.emit(EV.TRAITS_CHANGED, { reason: 'update', trait: updated });
    bus.emit(EV.DATA_CHANGED, { reason: 'traits' });
    return updated;
  }

  async deleteTrait(id) {
    if (!this.canWrite) throw new Error('read-only');
    if (this.mode === 'cloud') await remote.deleteTrait(id);
    else await local.deleteTrait(id);
    this.traits = this.traits.filter(t => t.id !== id);
    this.scores = this.scores.filter(s => s.traitId !== id);
    this.refreshCube();
    bus.emit(EV.TRAITS_CHANGED, { reason: 'delete', id });
    bus.emit(EV.DATA_CHANGED, { reason: 'traits' });
    return true;
  }

  async installTraitLibrary({ category = null, onlyMissing = true } = {}) {
    const pool = TRAITS.filter(t => (category ? t.category === category : true));
    const existing = new Set(this.traits.map(t => t.key));
    const toCreate = pool.filter(t => !onlyMissing || !existing.has(t.key));
    if (!toCreate.length) return 0;
    if (!this.canWrite) throw new Error('read-only');
    let createdCount = 0;
    for (const t of toCreate) {
      try {
        const created = await this.addTrait({
          key: t.key, name: t.name, category: t.category, description: t.description,
          icon: t.icon, color: t.color, polarity: t.polarity, weight: t.weight, isCore: t.core
        });
        createdCount++;
        this.traits = this.traits.map(x => (x.id === created.id ? created : x));
      } catch (err) {
        if (!String(err.message).includes('already exists')) throw err;
      }
    }
    bus.emit(EV.TOAST, { kind: 'ok', text: `${createdCount} traits installed` });
    bus.emit(EV.DATA_CHANGED, { reason: 'library' });
    return createdCount;
  }

  // ------------------------------------------------------------------ cloud
  async pushLocalToCloud() {
    if (!this.session?.user) throw new Error('Sign in first');
    if (!this.probe.ok) throw new Error('Cloud tables missing — run the schema first');
    const personMap = new Map();
    bus.emit(EV.BUSY, { on: true, label: 'Pushing cube to cloud' });
    try {
      for (const p of this.people) {
        if (p.id.startsWith('demo-')) {
          const created = await remote.insertPerson({
            fullName: p.fullName, slug: p.slug, jobTitle: p.jobTitle,
            department: p.department, bio: p.bio, tags: p.tags, metadata: p.metadata,
            email: null
          });
          personMap.set(p.id, created.id);
        } else {
          personMap.set(p.id, p.id);
        }
      }
      const traitMap = new Map();
      for (const t of this.traits) {
        if (t.id.startsWith('demo-')) {
          const created = await remote.insertTrait({
            key: t.key, name: t.name, category: t.category, description: t.description,
            icon: t.icon, color: t.color, min: t.min, max: t.max,
            polarity: t.polarity, weight: t.weight, isCore: t.isCore, sortOrder: t.sortOrder
          });
          traitMap.set(t.id, created.id);
        } else {
          traitMap.set(t.id, t.id);
        }
      }
      const rows = this.scores.map(s => ({
        traitId: traitMap.get(s.traitId),
        rankerId: personMap.get(s.rankerId),
        targetId: personMap.get(s.targetId),
        value: s.value,
        confidence: s.confidence,
        source: 'import'
      })).filter(r => r.traitId && r.rankerId && r.targetId);
      await remote.bulkUpsertScores(rows);
      this.sourcePreference = 'cloud';
      await this.load();
      bus.emit(EV.TOAST, { kind: 'ok', text: `Pushed ${rows.length} cells to cloud` });
      return rows.length;
    } finally {
      bus.emit(EV.BUSY, { on: false });
    }
  }

  async pullCloudToLocal() {
    const data = await remote.loadAll();
    await local.replaceAll(data);
    this.sourcePreference = 'local';
    await this.load();
    bus.emit(EV.TOAST, { kind: 'ok', text: 'Cloud cube copied to local' });
  }

  async importCube(json, { merge = false } = {}) {
    if (!json || !Array.isArray(json.traits) || !Array.isArray(json.scores)) {
      throw new Error('Not a TRIAD export');
    }
    if (!this.canWrite) throw new Error('read-only');
    const people = json.people || [];
    if (!merge) {
      if (this.mode === 'local') {
        await local.replaceAll({
          people: people.map(p => ({ ...p, id: p.id || uuid('person') })),
          traits: json.traits.map(t => ({ ...t, id: t.id || uuid('trait') })),
          scores: json.scores,
          relations: json.relations || []
        });
      } else {
        await this.setScoresBatch(json.scores);
      }
      await this.load();
      bus.emit(EV.TOAST, { kind: 'ok', text: 'Cube imported' });
      return true;
    }
    await this.setScoresBatch(json.scores);
    bus.emit(EV.TOAST, { kind: 'ok', text: `${json.scores.length} cells merged` });
    return true;
  }

  async resetDemo(preset = 'full') {
    await local.resetDemo(preset);
    this.sourcePreference = 'local';
    await this.load();
    bus.emit(EV.TOAST, { kind: 'ok', text: preset === 'empty' ? 'Cube cleared' : 'Demo cube rebuilt' });
  }

  // --------------------------------------------------------------- activity
  pushActivity(kind, text, meta = {}) {
    this.activity.unshift({ id: uuid('act'), kind, text, at: new Date().toISOString(), ...meta });
    if (this.activity.length > 200) this.activity.pop();
  }

  // -------------------------------------------------------------- selection
  select(patch) {
    this.selection = { ...this.selection, ...patch };
    bus.emit(EV.STACK_FOCUS, this.selection);
  }

  // --------------------------------------------------------------- derived
  get traitsById() { return this.cube.traitById; }
  get peopleById() { return this.cube.personById; }

  filteredPeople() {
    const q = this.filters.query.trim().toLowerCase();
    return this.people.filter(p => {
      if (this.filters.department !== 'all' && p.department !== this.filters.department) return false;
      if (!q) return true;
      return [p.fullName, p.jobTitle, p.department, ...(p.tags || [])]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });
  }

  filteredTraits() {
    const q = this.filters.query.trim().toLowerCase();
    return this.traits.filter(t => {
      if (this.filters.category !== 'all' && t.category !== this.filters.category) return false;
      if (!q) return true;
      return [t.name, t.key, t.category, t.description].filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }

  traitCategories() {
    const seen = new Map();
    for (const t of this.traits) {
      if (!seen.has(t.category)) {
        const preset = TRAIT_CATEGORIES.find(c => c.key === t.category);
        seen.set(t.category, { key: t.category, name: preset?.name || t.category, color: preset?.color || '#8ea1b8', count: 0 });
      }
      seen.get(t.category).count++;
    }
    return [...seen.values()].sort((a, b) => b.count - a.count);
  }

  departments() {
    return [...new Set(this.people.map(p => p.department).filter(Boolean))].sort();
  }

  coverage() {
    const possible = this.people.length * Math.max(this.people.length - 1, 0) * this.traits.length;
    return { possible, actual: this.scores.length, pct: possible ? this.scores.length / possible : 0 };
  }

  setDeckSession(session) {
    this.deckSession = session;
    writeJSON(STORAGE.deck, session || {});
    bus.emit('deck:session', session);
  }

  // ------------------------------------------------------------------- auth
  setSession(session) {
    this.session = session;
    this.readOnly = this.mode === 'cloud' && !session?.user;
    bus.emit(EV.SESSION, session);
  }
}

function slugifyName(name) {
  return String(name).toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `item-${Math.random().toString(36).slice(2, 7)}`;
}

export const store = new Store();
export { slugifyName };
export const demoFor = () => {
  const cube = demoCube();
  return { ...cube, relations: demoRelations(cube.people) };
};
