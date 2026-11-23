// ---------------------------------------------------------------------------
// auth.js — Supabase auth wrapper (email/password + magic link).
// ---------------------------------------------------------------------------
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { bus, EV } from './bus.js';

let client = null;

export function supabaseClient() {
  if (client) return client;
  const lib = window.supabase;
  if (!lib || !lib.createClient) {
    console.warn('[auth] supabase-js not loaded');
    return null;
  }
  client = lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'triad.auth.v1'
    },
    global: { headers: { 'x-application-name': 'triad-matrix' } },
    db: { schema: 'public' }
  });
  return client;
}

export async function currentSession() {
  const c = supabaseClient();
  if (!c) return null;
  const { data, error } = await c.auth.getSession();
  if (error) return null;
  return data.session || null;
}

export async function signIn(email, password) {
  const c = supabaseClient();
  if (!c) throw new Error('Auth unavailable');
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email, password, displayName) {
  const c = supabaseClient();
  if (!c) throw new Error('Auth unavailable');
  const { data, error } = await c.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split('@')[0] } }
  });
  if (error) throw error;
  if (data.session) await ensureProfile(data.session.user, displayName);
  return data;
}

export async function magicLink(email) {
  const c = supabaseClient();
  if (!c) throw new Error('Auth unavailable');
  const redirect = `${location.origin}${location.pathname}`;
  const { error } = await c.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect, shouldCreateUser: true }
  });
  if (error) throw error;
  return true;
}

export async function signOut() {
  const c = supabaseClient();
  if (!c) return;
  await c.auth.signOut();
  bus.emit(EV.SESSION, null);
}

export function onAuthChange(handler) {
  const c = supabaseClient();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((event, session) => {
    bus.emit(EV.AUTH_STATE, { event, session });
    handler(event, session);
  });
  return () => data?.subscription?.unsubscribe?.();
}

export async function ensureProfile(user, displayName) {
  const c = supabaseClient();
  if (!c || !user) return null;
  try {
    const { data: existing } = await c.from('profiles').select('id,username,display_name').eq('id', user.id).maybeSingle();
    if (existing) return existing;
    const base = (displayName || user.email?.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || `user${Math.floor(Math.random() * 9999)}`;
    const { data, error } = await c.from('profiles').insert({
      id: user.id,
      username: `${base}${Math.floor(Math.random() * 99)}`,
      display_name: displayName || user.user_metadata?.display_name || base
    }).select().maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function myProfile() {
  const c = supabaseClient();
  if (!c) return null;
  const session = await currentSession();
  if (!session?.user) return null;
  const { data } = await c.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  return data || null;
}
