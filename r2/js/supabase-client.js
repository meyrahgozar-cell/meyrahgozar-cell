// ============================================
// Supabase Client Module
// ============================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper: get current user + profile
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { user, profile };
}

// Helper: check if admin
export async function isAdmin() {
  const current = await getCurrentUser();
  return current?.profile?.role === 'admin';
}

// Auth helpers
export async function signUp(email, password, meta = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: meta }
  });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// Listen to auth changes
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
