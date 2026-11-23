// ---------------------------------------------------------------------------
// api.js — Supabase adapter. Talks REST through supabase-js, maps snake_case
// database rows to the camelCase shapes the app uses.
// ---------------------------------------------------------------------------
import { TABLES } from './config.js';
import { supabaseClient } from './auth.js';

const mapPerson = (row) => ({
  id: row.id,
  fullName: row.full_name,
  slug: row.slug,
  jobTitle: row.job_title,
  department: row.department,
  status: row.status,
  bio: row.bio,
  avatarUrl: row.avatar_url,
  email: row.email,
  phone: row.phone,
  managerId: row.manager_id,
  userId: row.user_id,
  tags: row.tags || [],
  metadata: row.metadata || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const unmapPerson = (p) => {
  const row = {};
  if (p.fullName !== undefined) row.full_name = p.fullName;
  if (p.slug !== undefined) row.slug = p.slug;
  if (p.jobTitle !== undefined) row.job_title = p.jobTitle;
  if (p.department !== undefined) row.department = p.department;
  if (p.bio !== undefined) row.bio = p.bio;
  if (p.avatarUrl !== undefined) row.avatar_url = p.avatarUrl;
  if (p.email !== undefined && p.email) row.email = p.email;
  if (p.phone !== undefined) row.phone = p.phone;
  if (p.managerId !== undefined) row.manager_id = p.managerId || null;
  if (p.userId !== undefined) row.user_id = p.userId || null;
  if (p.tags !== undefined) row.tags = p.tags || [];
  if (p.metadata !== undefined) row.metadata = p.metadata || {};
  return row;
};

const mapTrait = (row) => ({
  id: row.id,
  key: row.key,
  name: row.name,
  category: row.category,
  description: row.description,
  icon: row.icon,
  color: row.color,
  min: Number(row.min_value ?? 0),
  max: Number(row.max_value ?? 10),
  polarity: Number(row.polarity ?? 1),
  weight: Number(row.weight ?? 1),
  isCore: Boolean(row.is_core),
  sortOrder: row.sort_order ?? 0,
  ownerId: row.owner_id,
  metadata: row.metadata || {},
  createdAt: row.created_at
});

const unmapTrait = (t) => {
  const row = {};
  if (t.key !== undefined) row.key = t.key;
  if (t.name !== undefined) row.name = t.name;
  if (t.category !== undefined) row.category = t.category;
  if (t.description !== undefined) row.description = t.description;
  if (t.icon !== undefined) row.icon = t.icon;
  if (t.color !== undefined) row.color = t.color;
  if (t.min !== undefined) row.min_value = t.min;
  if (t.max !== undefined) row.max_value = t.max;
  if (t.polarity !== undefined) row.polarity = t.polarity;
  if (t.weight !== undefined) row.weight = t.weight;
  if (t.isCore !== undefined) row.is_core = t.isCore;
  if (t.sortOrder !== undefined) row.sort_order = t.sortOrder;
  if (t.metadata !== undefined) row.metadata = t.metadata || {};
  return row;
};

const mapScore = (row) => ({
  id: row.id,
  traitId: row.trait_id,
  rankerId: row.ranker_person_id,
  targetId: row.target_person_id,
  value: Number(row.value),
  confidence: Number(row.confidence ?? 0.75),
  note: row.note,
  source: row.source,
  updatedAt: row.updated_at,
  createdAt: row.created_at
});

// ---------------------------------------------------------------------------
export class RemoteAdapter {
  constructor() {
    this.name = 'cloud';
    this.supported = Boolean(supabaseClient());
    this.counts = {};
  }

  get client() { return supabaseClient(); }

  async probe() {
    const c = this.client;
    if (!c) return { ok: false, reason: 'supabase-js missing', missing: Object.values(TABLES).filter(t => t.startsWith('mtx_')) };
    const missing = [];
    const counts = {};
    for (const table of [TABLES.traits, TABLES.scores, TABLES.people, TABLES.models, TABLES.relations]) {
      try {
        const { count, error } = await c.from(table).select('*', { count: 'exact', head: true });
        if (error) { missing.push(table); counts[table] = null; }
        else counts[table] = count ?? 0;
      } catch {
        missing.push(table);
        counts[table] = null;
      }
    }
    this.counts = counts;
    return { ok: missing.length === 0, missing, counts };
  }

  async loadAll() {
    const c = this.client;
    if (!c) throw new Error('Supabase client unavailable');

    const [peopleRes, traitsRes, scoresRes, relRes] = await Promise.all([
      c.from(TABLES.people).select('*').order('full_name', { ascending: true }).limit(2000),
      c.from(TABLES.traits).select('*').order('sort_order', { ascending: true }).limit(1000),
      c.from(TABLES.scores).select('*').limit(50000),
      c.from(TABLES.relations).select('*').limit(5000).then(r => r).catch(() => ({ data: [], error: null }))
    ]);

    if (peopleRes.error) throw new Error(`people: ${peopleRes.error.message}`);
    if (traitsRes.error) throw new Error(`traits: ${traitsRes.error.message}`);
    if (scoresRes.error) throw new Error(`scores: ${scoresRes.error.message}`);

    return {
      people: (peopleRes.data || []).filter(p => p.full_name).map(mapPerson),
      traits: (traitsRes.data || []).map(mapTrait),
      scores: (scoresRes.data || []).map(mapScore),
      relations: (relRes.data || []).map(r => ({
        id: r.id, personId: r.person_id, otherId: r.other_id, kind: r.kind, weight: Number(r.weight)
      }))
    };
  }

  async upsertScore(score) {
    const c = this.client;
    const session = (await c.auth.getSession()).data.session;
    const row = {
      trait_id: score.traitId,
      ranker_person_id: score.rankerId,
      target_person_id: score.targetId,
      value: score.value,
      confidence: score.confidence ?? 0.75,
      note: score.note ?? null,
      source: score.source || 'manual',
      created_by: session?.user?.id || null
    };
    const { data, error } = await c.from(TABLES.scores)
      .upsert(row, { onConflict: 'trait_id,ranker_person_id,target_person_id' })
      .select().single();
    if (error) throw error;
    return mapScore(data);
  }

  async deleteScore(id) {
    const { error } = await this.client.from(TABLES.scores).delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  async insertPerson(person) {
    const { data, error } = await this.client.from(TABLES.people).insert(unmapPerson(person)).select().single();
    if (error) throw error;
    return mapPerson(data);
  }

  async updatePerson(id, patch) {
    const { data, error } = await this.client.from(TABLES.people).update(unmapPerson(patch)).eq('id', id).select().single();
    if (error) throw error;
    return mapPerson(data);
  }

  async deletePerson(id) {
    const { error } = await this.client.from(TABLES.people).delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  async insertTrait(trait) {
    const { data, error } = await this.client.from(TABLES.traits).insert(unmapTrait(trait)).select().single();
    if (error) throw error;
    return mapTrait(data);
  }

  async updateTrait(id, patch) {
    const { data, error } = await this.client.from(TABLES.traits).update(unmapTrait(patch)).eq('id', id).select().single();
    if (error) throw error;
    return mapTrait(data);
  }

  async deleteTrait(id) {
    const { error } = await this.client.from(TABLES.traits).delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  async bulkUpsertScores(rows) {
    if (!rows.length) return [];
    const c = this.client;
    const session = (await c.auth.getSession()).data.session;
    const payload = rows.map(s => ({
      trait_id: s.traitId,
      ranker_person_id: s.rankerId,
      target_person_id: s.targetId,
      value: s.value,
      confidence: s.confidence ?? 0.75,
      note: s.note ?? null,
      source: s.source || 'import',
      created_by: session?.user?.id || null
    }));
    const chunkSize = 400;
    const out = [];
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const { data, error } = await c.from(TABLES.scores)
        .upsert(chunk, { onConflict: 'trait_id,ranker_person_id,target_person_id' })
        .select();
      if (error) throw error;
      out.push(...(data || []).map(mapScore));
    }
    return out;
  }

  async syncModels(models) {
    if (!models.length) return 0;
    const rows = models.map(m => ({
      id: m.id,
      canonical_slug: m.canonical_slug || null,
      name: m.name,
      provider: m.provider || String(m.id).split('/')[0],
      description: m.description || null,
      context_length: m.context_length || null,
      max_completion_tokens: m.top_provider?.max_completion_tokens || m.max_completion_tokens || null,
      architecture: m.architecture || {},
      pricing: m.pricing || {},
      supported_parameters: m.supported_parameters || [],
      default_parameters: m.default_parameters || {},
      top_provider: m.top_provider || {},
      modality: m.architecture?.modality || null,
      input_modalities: m.architecture?.input_modalities || [],
      output_modalities: m.architecture?.output_modalities || [],
      reasoning: m.reasoning || null,
      hugging_face_id: m.hugging_face_id || null,
      knowledge_cutoff: m.knowledge_cutoff || null,
      endpoints: m.endpoints || [],
      is_free: true,
      is_moderated: Boolean(m.top_provider?.is_moderated),
      is_curated: Boolean(m.is_curated),
      is_active: true,
      last_synced_at: new Date().toISOString(),
      raw: m
    }));
    const { error } = await this.client.from(TABLES.models).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    return rows.length;
  }

  async loadModels() {
    const { data, error } = await this.client.from(TABLES.models).select('*').eq('is_free', true).order('name');
    if (error) return [];
    return (data || []).map(r => ({ ...r.raw, ...r, is_curated: r.is_curated, from_db: true }));
  }

  async logAiRun(run) {
    try {
      const c = this.client;
      const session = (await c.auth.getSession()).data.session;
      await c.from(TABLES.aiRuns).insert({
        user_id: session?.user?.id || null,
        kind: run.kind || 'chat',
        model_slug: run.model,
        prompt: (run.prompt || '').slice(0, 20000),
        response: (run.response || '').slice(0, 40000),
        reasoning: (run.reasoning || '').slice(0, 20000),
        status: run.status || 'ok',
        tokens_in: run.tokensIn || 0,
        tokens_out: run.tokensOut || 0,
        latency_ms: run.latency || null,
        error: run.error || null,
        context: run.context || {}
      });
    } catch { /* telemetry is best-effort */ }
  }

  async logEvent(kind, label, payload = {}) {
    try {
      const c = this.client;
      const session = (await c.auth.getSession()).data.session;
      await c.from(TABLES.events).insert({
        user_id: session?.user?.id || null, kind, label, payload
      });
    } catch { /* ignore */ }
  }

  async savePrefs(prefs) {
    const c = this.client;
    const session = (await c.auth.getSession()).data.session;
    if (!session?.user) return false;
    await c.from(TABLES.prefs).upsert({ user_id: session.user.id, prefs }, { onConflict: 'user_id' });
    return true;
  }

  async loadPrefs() {
    const c = this.client;
    const session = (await c.auth.getSession()).data.session;
    if (!session?.user) return null;
    const { data } = await c.from(TABLES.prefs).select('prefs').eq('user_id', session.user.id).maybeSingle();
    return data?.prefs || null;
  }

  async exportCube() {
    const { data, error } = await this.client.rpc('mtx_export_cube');
    if (error) throw error;
    return data;
  }
}

export const remote = new RemoteAdapter();
