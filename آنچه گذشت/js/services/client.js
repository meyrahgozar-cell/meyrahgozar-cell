import { CONFIG } from '../config.js';

const lib = window.supabase;
if (!lib?.createClient) {
  throw new Error('Supabase client library failed to load.');
}

/**
 * One client, one dedicated session slot.
 * `storageKey` is deliberately app-specific: the same Supabase project can power
 * several unrelated products without any of them reading or overwriting the
 * others' sessions, and every table/bucket here is namespaced with `reel_`.
 */
export const sb = lib.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: {
    storageKey: CONFIG.authStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: { 'x-client-info': 'reel-web/1.0' },
  },
  db: { schema: 'public' },
});

export const isConfigured = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);
