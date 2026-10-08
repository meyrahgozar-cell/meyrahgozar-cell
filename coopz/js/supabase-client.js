import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: false }
});

export async function findMemberByCredentials(nationalId, password) {
  const { data, error } = await supabase
    .from('members').select('*')
    .eq('national_id', nationalId)
    .eq('password_initial', password)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMemberById(id) {
  const { data, error } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPayments(memberId) {
  const { data, error } = await supabase.from('payments').select('*')
    .eq('member_id', memberId).order('payment_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getObligations(memberId) {
  const { data, error } = await supabase.from('obligations').select('*')
    .eq('member_id', memberId).order('due_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getAllMembersScores() {
  const { data, error } = await supabase.from('members')
    .select('id, first_name, last_name, score, national_id')
    .order('score', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveSuggestion(payload) {
  const { data, error } = await supabase.from('suggestions').insert(payload).select().maybeSingle();
  if (error) throw error;
  return data;
}

/* --------- Import helpers --------- */
export async function fetchAllMembersFull() {
  const { data, error } = await supabase.from('members').select('*');
  if (error) throw error;
  return data || [];
}
export async function fetchAllPayments() {
  const { data, error } = await supabase.from('payments').select('*');
  if (error) throw error;
  return data || [];
}
export async function fetchAllObligations() {
  const { data, error } = await supabase.from('obligations').select('*');
  if (error) throw error;
  return data || [];
}

export async function bulkUpsertMembers(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from('members')
    .upsert(rows, { onConflict: 'national_id' }).select();
  if (error) throw error;
  return data || [];
}
export async function bulkUpsertMembersById(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from('members')
    .upsert(rows, { onConflict: 'id' }).select();
  if (error) throw error;
  return data || [];
}
export async function bulkInsertPayments(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from('payments').insert(rows).select();
  if (error) throw error;
  return data || [];
}
export async function bulkInsertObligations(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from('obligations').insert(rows).select();
  if (error) throw error;
  return data || [];
}

/** Change password: verifies current password_initial then updates it */
export async function changePassword(memberId, currentPassword, newPassword) {
  const { data: member, error: fetchErr } = await supabase
    .from('members')
    .select('id, password_initial')
    .eq('id', memberId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!member) throw new Error('کاربر یافت نشد');
  if (member.password_initial !== currentPassword) {
    throw new Error('رمز فعلی نادرست است');
  }
  const { error } = await supabase
    .from('members')
    .update({ password_initial: newPassword })
    .eq('id', memberId);
  if (error) throw error;
  return true;
}