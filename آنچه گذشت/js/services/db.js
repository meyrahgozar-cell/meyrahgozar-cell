/**
 * The vault. One API, two interchangeable engines:
 *   • cloud — Supabase Postgres + Storage (used when signed in and schema is deployed)
 *   • local — IndexedDB on this device (offline mode, no account needed)
 * Nothing in the UI needs to know which is active.
 */
import { CONFIG } from '../config.js';
import { sb } from './client.js';
import { state } from '../state.js';
import { idb } from './localdb.js';
import { uid } from '../lib/dom.js';
import { htmlToText } from '../lib/richtext.js';
import { toISODate, wordCount } from '../lib/format.js';

const T = CONFIG.tables;
export const useCloud = () => Boolean(state.session && state.schemaReady);

/* ── normalisation ─────────────────────────────────────────── */
export function emptyEntry(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: '',
    body: '',
    body_text: '',
    happened_on: toISODate(),
    happened_at: '',
    mood: '',
    energy: 3,
    rating: 0,
    weather: '',
    location: '',
    people: [],
    tags: [],
    photos: [],
    cover_url: '',
    favorite: false,
    pinned: false,
    thread_id: null,
    word_count: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function normalizeEntry(row) {
  if (!row) return null;
  return {
    ...emptyEntry(),
    ...row,
    people: Array.isArray(row.people) ? row.people : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    photos: Array.isArray(row.photos) ? row.photos.filter(Boolean) : [],
    favorite: !!row.favorite,
    pinned: !!row.pinned,
    rating: row.rating ?? 0,
    energy: row.energy ?? 3,
  };
}

function toRow(entry, userId) {
  const text = entry.body_text || htmlToText(entry.body);
  return {
    id: entry.id,
    user_id: userId,
    title: (entry.title || '').slice(0, 240),
    body: entry.body || '',
    body_text: text.slice(0, 60000),
    happened_on: entry.happened_on || toISODate(),
    happened_at: entry.happened_at || null,
    mood: entry.mood || null,
    energy: entry.energy ?? null,
    rating: entry.rating || null,
    weather: entry.weather || null,
    location: entry.location || null,
    people: Array.isArray(entry.people) ? entry.people.slice(0, 40) : [],
    tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 30) : [],
    photos: Array.isArray(entry.photos) ? entry.photos : [],
    cover_url: entry.cover_url || null,
    favorite: !!entry.favorite,
    pinned: !!entry.pinned,
    thread_id: entry.thread_id || null,
    word_count: entry.word_count || wordCount(text),
    updated_at: new Date().toISOString(),
  };
}

/* ── schema probe ──────────────────────────────────────────── */
const withTimeout = (promise, ms, label = 'request') => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
]);

/**
 * Is the cloud schema deployed? Only a clean response proves the tables exist —
 * a stalled or failed request must never be mistaken for a working vault.
 */
export async function probeCloudSchema() {
  try {
    const { error } = await withTimeout(sb.from(T.entries).select('id').limit(1), 6000, 'schema probe');
    if (!error) return { ready: true };
    const msg = `${error.code || ''} ${error.message || ''}`;
    if (/PGRST205|42P01|does not exist|could not find the table/i.test(msg)) {
      return { ready: false, reason: 'missing-tables', error: error.message };
    }
    // 42501 / permission denied means the table is there but RLS is guarding it.
    if (/42501|permission denied|row-level security/i.test(msg)) return { ready: true };
    return { ready: false, reason: 'unreachable', error: error.message };
  } catch (err) {
    return { ready: false, reason: 'unreachable', error: err?.message };
  }
}

/* ── photo URLs ────────────────────────────────────────────── */
const signedCache = (() => {
  try { return JSON.parse(localStorage.getItem('reel.signed.v1') || '{}'); } catch { return {}; }
})();
let persistTimer = null;
function persistSigned() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const keys = Object.keys(signedCache);
    if (keys.length > 400) {
      keys.sort((a, b) => signedCache[a].exp - signedCache[b].exp)
        .slice(0, keys.length - 400)
        .forEach((k) => delete signedCache[k]);
    }
    try { localStorage.setItem('reel.signed.v1', JSON.stringify(signedCache)); } catch { /* full */ }
  }, 600);
}

async function signedUrls(paths = []) {
  const unique = [...new Set(paths.filter(Boolean))];
  const out = {};
  const now = Date.now();
  const missing = [];
  unique.forEach((p) => {
    const hit = signedCache[p];
    if (hit && hit.exp > now + 60_000) out[p] = hit.url;
    else missing.push(p);
  });
  if (!missing.length) return out;

  const { data, error } = await sb.storage.from(CONFIG.bucket).createSignedUrls(missing, 60 * 60 * 24 * 6);
  if (error) throw error;
  (data || []).forEach((row) => {
    if (!row.signedUrl) return;
    out[row.path] = row.signedUrl;
    signedCache[row.path] = { url: row.signedUrl, exp: Date.now() + 6 * 24 * 3600 * 1000 - 3_600_000 };
  });
  persistSigned();
  return out;
}

const localUrlCache = new Map();
async function localPhotoUrl(key) {
  if (!key) return '';
  if (localUrlCache.has(key)) return localUrlCache.get(key);
  const row = await idb.get('media', key);
  if (!row?.blob) return '';
  const url = URL.createObjectURL(row.blob);
  localUrlCache.set(key, url);
  return url;
}

/** Attach display URLs to every photo across a batch of entries (one round trip). */
export async function hydratePhotos(entries = []) {
  const list = entries.filter(Boolean);
  if (!list.length) return entries;
  if (useCloud()) {
    const paths = [];
    list.forEach((e) => (e.photos || []).forEach((p) => { if (p?.path) paths.push(p.path); }));
    if (!paths.length) return entries;
    let map = {};
    try { map = await signedUrls(paths); } catch (err) { console.warn('signed url failed', err); }
    list.forEach((e) => (e.photos || []).forEach((p) => {
      p.src = map[p.path] || p.src || '';
    }));
  } else {
    await Promise.all(list.map(async (e) => {
      await Promise.all((e.photos || []).map(async (p) => {
        p.src = p.localKey ? await localPhotoUrl(p.localKey) : (p.src || '');
      }));
    }));
  }
  return entries;
}

export function coverOf(entry) {
  if (!entry) return '';
  const photos = entry.photos || [];
  if (entry.cover_url) {
    const chosen = photos.find((p) => (p.path && p.path === entry.cover_url) || (p.localKey && p.localKey === entry.cover_url));
    if (chosen?.src) return chosen.src;
  }
  return photos[0]?.src || '';
}

/* ── queries: cloud ────────────────────────────────────────── */
function sanitizeTerm(term) {
  return String(term || '').replace(/[,()%\\]/g, ' ').trim().slice(0, 80);
}

async function cloudList(opts = {}) {
  const {
    limit = CONFIG.pageSize, offset = 0, search = '', mood = '', year = '',
    tag = '', threadId = '', favorite = false, pinned = false, sort = 'desc',
    from = '', to = '', withCount = false,
  } = opts;

  let q = sb.from(T.entries).select('*', withCount ? { count: 'exact' } : undefined);
  const term = sanitizeTerm(search);
  if (term) q = q.or(`title.ilike.%${term}%,body_text.ilike.%${term}%,location.ilike.%${term}%`);
  if (mood) q = q.eq('mood', mood);
  if (tag) q = q.contains('tags', [tag]);
  if (threadId) q = q.eq('thread_id', threadId);
  if (favorite) q = q.eq('favorite', true);
  if (pinned) q = q.eq('pinned', true);
  if (year) {
    q = q.gte('happened_on', `${year}-01-01`).lte('happened_on', `${year}-12-31`);
  }
  if (from) q = q.gte('happened_on', from);
  if (to) q = q.lte('happened_on', to);

  q = q.order('happened_on', { ascending: sort === 'asc' })
    .order('created_at', { ascending: sort === 'asc' })
    .range(offset, offset + Math.max(0, limit - 1));

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data || []).map(normalizeEntry), count: count ?? null };
}

/* ── queries: local ────────────────────────────────────────── */
async function localAll(opts = {}) {
  const all = (await idb.all('entries')).map(normalizeEntry);
  return filterLocal(all, opts);
}

function filterLocal(all, opts = {}) {
  const {
    search = '', mood = '', year = '', tag = '', threadId = '', favorite = false,
    pinned = false, sort = 'desc', from = '', to = '',
  } = opts;
  const term = String(search || '').trim().toLowerCase();
  let rows = all.filter((e) => {
    if (mood && e.mood !== mood) return false;
    if (year && !String(e.happened_on).startsWith(String(year))) return false;
    if (tag && !e.tags.includes(tag)) return false;
    if (threadId && e.thread_id !== threadId) return false;
    if (favorite && !e.favorite) return false;
    if (pinned && !e.pinned) return false;
    if (from && e.happened_on < from) return false;
    if (to && e.happened_on > to) return false;
    if (term) {
      const hay = `${e.title} ${e.body_text} ${e.location} ${(e.tags || []).join(' ')} ${(e.people || []).join(' ')}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
  rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const cmp = a.happened_on === b.happened_on
      ? String(a.created_at).localeCompare(String(b.created_at))
      : String(a.happened_on).localeCompare(String(b.happened_on));
    return sort === 'asc' ? cmp : -cmp;
  });
  return rows;
}

/* ── public API ────────────────────────────────────────────── */
export const db = {
  emptyEntry,
  normalizeEntry,

  entries: {
    async list(opts = {}) {
      if (useCloud()) {
        const { rows, count } = await cloudList(opts);
        await hydratePhotos(rows);
        return { rows, count };
      }
      const rows = await localAll(opts);
      const offset = opts.offset || 0;
      const limit = opts.limit ?? CONFIG.pageSize;
      const page = rows.slice(offset, offset + limit);
      await hydratePhotos(page);
      return { rows: page, count: rows.length };
    },

    async all() {
      const rows = useCloud()
        ? (await cloudList({ limit: 2000, sort: 'desc' })).rows
        : (await idb.all('entries')).map(normalizeEntry);
      await hydratePhotos(rows);
      return rows;
    },

    async get(id) {
      if (!id) return null;
      if (useCloud()) {
        const { data, error } = await sb.from(T.entries).select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        const row = normalizeEntry(data);
        if (row) await hydratePhotos([row]);
        return row;
      }
      const row = normalizeEntry(await idb.get('entries', id));
      if (row) await hydratePhotos([row]);
      return row;
    },

    async save(entry) {
      const text = htmlToText(entry.body);
      const payload = {
        ...entry,
        id: entry.id || uid(),
        created_at: entry.created_at || new Date().toISOString(),
        body_text: text,
        word_count: wordCount(text),
        updated_at: new Date().toISOString(),
      };
      if (useCloud()) {
        const row = toRow(payload, state.user.id);
        const { data, error } = await sb.from(T.entries).upsert(row, { onConflict: 'id' }).select('*').single();
        if (error) throw error;
        const saved = normalizeEntry(data);
        await hydratePhotos([saved]);
        return saved;
      }
      await idb.put('entries', { ...payload, user_id: 'local' });
      return payload;
    },

    async remove(id) {
      if (useCloud()) {
        const entry = await this.get(id).catch(() => null);
        const paths = (entry?.photos || []).map((p) => p.path).filter(Boolean);
        const { error } = await sb.from(T.entries).delete().eq('id', id);
        if (error) throw error;
        if (paths.length) sb.storage.from(CONFIG.bucket).remove(paths).catch(() => {});
        return;
      }
      const entry = await idb.get('entries', id);
      (entry?.photos || []).forEach((p) => {
        if (p.localKey) {
          idb.del('media', p.localKey).catch(() => {});
          const url = localUrlCache.get(p.localKey);
          if (url) { URL.revokeObjectURL(url); localUrlCache.delete(p.localKey); }
        }
      });
      await idb.del('entries', id);
    },

    async removeAll() {
      if (useCloud()) {
        const all = (await this.all()).map((e) => e.id);
        for (const id of all) {
          // chunked deletes keep requests small
          await sb.from(T.entries).delete().eq('id', id);
        }
        return;
      }
      await idb.clear('entries');
      const media = await idb.all('media');
      await Promise.all(media.map((m) => idb.del('media', m.key)));
      localUrlCache.clear();
    },

    async toggleFlag(id, field) {
      const entry = await this.get(id);
      if (!entry) return null;
      entry[field] = !entry[field];
      return this.save(entry);
    },
  },

  threads: {
    async list() {
      if (useCloud()) {
        const { data, error } = await sb.from(T.threads).select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
      }
      return (await idb.all('threads')).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    },
    async save(thread) {
      const payload = {
        title: 'رشتهٔ بی‌نام',
        description: '',
        color: '',
        cover_url: '',
        created_at: new Date().toISOString(),
        ...thread,
      };
      if (!payload.id) payload.id = uid();
      if (useCloud()) {
        const { data, error } = await sb.from(T.threads)
          .upsert({ ...payload, user_id: state.user.id }, { onConflict: 'id' })
          .select('*').single();
        if (error) throw error;
        return data;
      }
      await idb.put('threads', { ...payload, user_id: 'local' });
      return payload;
    },
    async remove(id) {
      if (useCloud()) {
        const { error } = await sb.from(T.threads).delete().eq('id', id);
        if (error) throw error;
        return;
      }
      await idb.del('threads', id);
    },
  },

  profile: {
    async get() {
      if (useCloud()) {
        const { data, error } = await sb.from(T.profiles).select('*').eq('id', state.user.id).maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) return { ...data, avatar_src: await avatarSrc(data.avatar_url) };
        // first run: create the profile row
        const base = {
          id: state.user.id,
          display_name: state.user.user_metadata?.display_name || state.user.email?.split('@')[0] || 'دوست',
          bio: '',
          avatar_url: '',
        };
        const { data: made, error: insErr } = await sb.from(T.profiles).upsert(base, { onConflict: 'id' }).select('*').single();
        if (insErr) return { ...base, avatar_src: '' };
        return made;
      }
      const local = await idb.kvGet('profile', null);
      if (local) {
        return {
          ...local,
          avatar_src: local.avatar_url && !/^(https?:|data:|blob:)/.test(local.avatar_url)
            ? await localPhotoUrl(local.avatar_url)
            : (local.avatar_url || ''),
        };
      }
      const base = {
        display_name: 'دوست',
        bio: '',
        avatar_url: '',
        accent: '',
      };
      await idb.kvSet('profile', base);
      return base;
    },
    async save(patch) {
      if (useCloud()) {
        const { data, error } = await sb.from(T.profiles)
          .upsert({ id: state.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' })
          .select('*').single();
        if (error) throw error;
        return { ...data, avatar_src: await avatarSrc(data.avatar_url) };
      }
      const current = (await idb.kvGet('profile', {})) || {};
      const next = { ...current, ...patch };
      await idb.kvSet('profile', next);
      return {
        ...next,
        avatar_src: next.avatar_url && !/^(https?:|data:|blob:)/.test(next.avatar_url)
          ? await localPhotoUrl(next.avatar_url)
          : (next.avatar_url || ''),
      };
    },
  },

  photos: {
    async upload(fileOrBlob, ext = 'webp', kind = 'frames') {
      if (!useCloud()) throw new Error('برای بارگذاری عکس در گنجینهٔ ابری وارد شو.');
      const now = new Date();
      const path = `${state.user.id}/${kind}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${uid()}.${ext}`;
      const { error } = await sb.storage.from(CONFIG.bucket).upload(path, fileOrBlob, {
        contentType: fileOrBlob.type || 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });
      if (error) throw error;
      return path;
    },

    async storeLocal(blob, ext = 'webp') {
      const key = `local/${uid()}.${ext}`;
      await idb.put('media', { key, blob, type: blob.type, at: Date.now() });
      const url = URL.createObjectURL(blob);
      localUrlCache.set(key, url);
      return { key, url };
    },

    async remove(photo) {
      if (photo?.path && useCloud()) {
        await sb.storage.from(CONFIG.bucket).remove([photo.path]).catch(() => {});
        delete signedCache[photo.path];
        persistSigned();
      }
      if (photo?.localKey) {
        await idb.del('media', photo.localKey).catch(() => {});
        const url = localUrlCache.get(photo.localKey);
        if (url) { URL.revokeObjectURL(url); localUrlCache.delete(photo.localKey); }
      }
    },

    async count() {
      const all = await this.list();
      return all.length;
    },

    async list() {
      if (useCloud()) {
        const paths = [];
        let from = 0;
        const step = 100;
        for (;;) {
          const { data, error } = await sb.storage.from(CONFIG.bucket).list(`${state.user.id}/frames`, {
            limit: step, offset: from,
          });
          if (error || !data) break;
          data.forEach((f) => { if (f.id) paths.push(`${state.user.id}/frames/${f.name}`); });
          if (data.length < step) break;
          from += step;
        }
        return paths;
      }
      const media = await idb.all('media');
      return media.map((m) => m.key);
    },
  },

  async signed(path) {
    if (!path) return '';
    if (!useCloud()) return localPhotoUrl(path);
    const map = await signedUrls([path]);
    return map[path] || '';
  },

  async importLocalVault(onProgress = () => {}) {
    if (!useCloud()) throw new Error('اول وارد شو و راه‌اندازی ابری را کامل کن.');
    const rows = (await idb.all('entries')).map(normalizeEntry);
    let done = 0;
    for (const entry of rows) {
      const photos = [];
      for (const photo of entry.photos || []) {
        if (photo.path) { photos.push(photo); continue; }
        if (!photo.localKey) continue;
        const media = await idb.get('media', photo.localKey);
        if (!media?.blob) continue;
        const path = await this.photos.upload(media.blob, media.blob.type.includes('png') ? 'png' : 'jpg');
        photos.push({ path, w: photo.w, h: photo.h, caption: photo.caption || '' });
      }
      await this.entries.save({ ...entry, photos, cover_url: photos[0]?.path || '' });
      done += 1;
      onProgress(done, rows.length);
    }
    return done;
  },

  async stats() {
    const entries = await this.entries.all();
    const threads = await this.threads.list();
    const photos = entries.reduce((n, e) => n + (e.photos?.length || 0), 0);
    const words = entries.reduce((n, e) => n + (e.word_count || 0), 0);
    return { entries: entries.length, threads: threads.length, photos, words };
  },

  async exportAll() {
    const entries = await this.entries.all();
    const threads = await this.threads.list();
    const profile = await this.profile.get();
    return { entries, threads, profile, exported_at: new Date().toISOString(), app: 'reel' };
  },
};

async function avatarSrc(path) {
  if (!path) return '';
  if (!/^(https?:|blob:|data:)/.test(path)) {
    try { return await db.signed(path); } catch { return ''; }
  }
  return path;
}

export function entrySearchText(entry) {
  return `${entry.title || ''} ${entry.body_text || ''} ${(entry.tags || []).join(' ')} ${entry.location || ''}`.toLowerCase();
}
