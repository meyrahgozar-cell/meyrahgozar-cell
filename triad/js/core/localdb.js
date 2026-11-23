// ---------------------------------------------------------------------------
// localdb.js — offline-first store. Same surface as RemoteAdapter, backed by
// localStorage. Lets the whole app work before any SQL has been run.
// ---------------------------------------------------------------------------
import { STORAGE } from './config.js';
import { demoCube, demoRelations } from './seed.js';
import { uuid } from './dom.js';

function read() {
  try {
    const raw = localStorage.getItem(STORAGE.local);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.people)) return null;
    return parsed;
  } catch { return null; }
}

function write(db) {
  try {
    localStorage.setItem(STORAGE.local, JSON.stringify(db));
    return true;
  } catch (err) {
    console.warn('[localdb] write failed', err);
    return false;
  }
}

export class LocalAdapter {
  constructor() {
    this.name = 'local';
    this.supported = true;
    this.db = null;
  }

  ensure() {
    if (this.db) return this.db;
    let db = read();
    if (!db) {
      const cube = demoCube();
      db = {
        people: cube.people,
        traits: cube.traits,
        scores: cube.scores,
        relations: demoRelations(cube.people),
        events: [],
        aiRuns: [],
        createdAt: new Date().toISOString(),
        version: 1
      };
      write(db);
    }
    this.db = db;
    return db;
  }

  async probe() {
    const db = this.ensure();
    return {
      ok: true,
      missing: [],
      counts: { [ 'people']: db.people.length, ['mtx_traits']: db.traits.length, ['mtx_scores']: db.scores.length }
    };
  }

  async loadAll() {
    const db = this.ensure();
    return {
      people: db.people,
      traits: db.traits,
      scores: db.scores,
      relations: db.relations || []
    };
  }

  async upsertScore(score) {
    const db = this.ensure();
    const idx = db.scores.findIndex(s =>
      s.traitId === score.traitId && s.rankerId === score.rankerId && s.targetId === score.targetId);
    const now = new Date().toISOString();
    if (idx >= 0) {
      db.scores[idx] = { ...db.scores[idx], ...score, updatedAt: now };
      write(db);
      return db.scores[idx];
    }
    const row = {
      id: uuid('score'),
      confidence: 0.75,
      source: 'manual',
      ...score,
      createdAt: now,
      updatedAt: now
    };
    db.scores.push(row);
    write(db);
    return row;
  }

  async deleteScore(id) {
    const db = this.ensure();
    db.scores = db.scores.filter(s => s.id !== id);
    write(db);
    return true;
  }

  async bulkUpsertScores(rows) {
    const db = this.ensure();
    const map = new Map(db.scores.map(s => [`${s.traitId}|${s.rankerId}|${s.targetId}`, s]));
    for (const row of rows) {
      const key = `${row.traitId}|${row.rankerId}|${row.targetId}`;
      const existing = map.get(key);
      map.set(key, {
        id: existing?.id || uuid('score'),
        confidence: 0.75,
        source: 'import',
        ...existing,
        ...row,
        updatedAt: new Date().toISOString()
      });
    }
    db.scores = [...map.values()];
    write(db);
    return rows;
  }

  async insertPerson(person) {
    const db = this.ensure();
    const row = {
      id: person.id || uuid('person'),
      status: 'active',
      tags: [],
      metadata: {},
      createdAt: new Date().toISOString(),
      ...person
    };
    db.people.push(row);
    write(db);
    return row;
  }

  async updatePerson(id, patch) {
    const db = this.ensure();
    const idx = db.people.findIndex(p => p.id === id);
    if (idx < 0) throw new Error('Person not found');
    db.people[idx] = { ...db.people[idx], ...patch, updatedAt: new Date().toISOString() };
    write(db);
    return db.people[idx];
  }

  async deletePerson(id) {
    const db = this.ensure();
    db.people = db.people.filter(p => p.id !== id);
    db.scores = db.scores.filter(s => s.rankerId !== id && s.targetId !== id);
    db.relations = (db.relations || []).filter(r => r.personId !== id && r.otherId !== id);
    write(db);
    return true;
  }

  async insertTrait(trait) {
    const db = this.ensure();
    const row = {
      id: trait.id || uuid('trait'),
      min: 0, max: 10, polarity: 1, weight: 1, isCore: false,
      color: '#5ef2d6', icon: 'spark', category: 'general',
      sortOrder: db.traits.length,
      createdAt: new Date().toISOString(),
      ...trait
    };
    db.traits.push(row);
    write(db);
    return row;
  }

  async updateTrait(id, patch) {
    const db = this.ensure();
    const idx = db.traits.findIndex(t => t.id === id);
    if (idx < 0) throw new Error('Trait not found');
    db.traits[idx] = { ...db.traits[idx], ...patch };
    write(db);
    return db.traits[idx];
  }

  async deleteTrait(id) {
    const db = this.ensure();
    db.traits = db.traits.filter(t => t.id !== id);
    db.scores = db.scores.filter(s => s.traitId !== id);
    write(db);
    return true;
  }

  async logEvent(kind, label, payload = {}) {
    const db = this.ensure();
    db.events = [{ id: uuid('ev'), kind, label, payload, at: new Date().toISOString() }, ...(db.events || [])].slice(0, 400);
    write(db);
  }

  async logAiRun(run) {
    const db = this.ensure();
    db.aiRuns = [{ id: uuid('run'), at: new Date().toISOString(), ...run }, ...(db.aiRuns || [])].slice(0, 200);
    write(db);
  }

  async savePrefs() { return false; }
  async loadPrefs() { return null; }

  async replaceAll({ people, traits, scores, relations = [] }) {
    const db = this.ensure();
    db.people = people;
    db.traits = traits;
    db.scores = scores;
    db.relations = relations;
    write(db);
    this.db = db;
    return true;
  }

  async resetDemo(preset = 'full') {
    const cube = preset === 'empty'
      ? { people: [], traits: [], scores: [] }
      : demoCube();
    this.db = {
      people: cube.people,
      traits: cube.traits,
      scores: cube.scores,
      relations: demoRelations(cube.people),
      events: [],
      aiRuns: [],
      version: 1
    };
    write(this.db);
    return this.db;
  }

  stats() {
    const db = this.ensure();
    const bytes = new Blob([JSON.stringify(db)]).size;
    return {
      people: db.people.length,
      traits: db.traits.length,
      scores: db.scores.length,
      bytes
    };
  }
}

export const local = new LocalAdapter();
