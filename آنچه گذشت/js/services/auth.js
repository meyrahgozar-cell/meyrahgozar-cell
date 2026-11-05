import { sb } from './client.js';

export const redirectTo = () => `${window.location.origin}${window.location.pathname}`;

export async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export function onAuthChange(cb) {
  const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data?.subscription?.unsubscribe?.();
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendly(error));
  return data.session;
}

export async function signUp(email, password, displayName) {
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: redirectTo(),
      data: { display_name: displayName || email.split('@')[0] },
    },
  });
  if (error) throw new Error(friendly(error));
  return data.session;
}

export async function magicLink(email) {
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
  });
  if (error) throw new Error(friendly(error));
}

export async function requestPasswordReset(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
  if (error) throw new Error(friendly(error));
}

export async function updatePassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(friendly(error));
}

export async function updateEmail(email) {
  const { error } = await sb.auth.updateUser({ email: email.trim() }, { emailRedirectTo: redirectTo() });
  if (error) throw new Error(friendly(error));
}

export async function signOut() {
  await sb.auth.signOut({ scope: 'local' });
}

export function friendly(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'این ایمیل و گذرواژه با هم هم‌خوان نیستند.';
  if (msg.includes('email not confirmed')) return 'این ایمیل هنوز تأیید نشده — صندوق ورودی‌ات را نگاه کن.';
  if (msg.includes('user already registered') || msg.includes('already been registered')) return 'با این ایمیل قبلاً گنجینه‌ای ساخته شده — وارد شو.';
  if (msg.includes('password should be at least')) return 'گذرواژه باید دست‌کم ۸ نویسه باشد.';
  if (msg.includes('unable to validate email')) return 'این نشانی ایمیل درست به نظر نمی‌رسد.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'تلاش‌ها زیاد شد. یک دقیقه صبر کن و دوباره امتحان کن.';
  if (msg.includes('signups not allowed')) return 'ثبت‌نام تازه در این پروژه بسته است.';
  if (msg.includes('jwt') || msg.includes('token has expired')) return 'نشست‌ات منقضی شد — دوباره وارد شو.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'به گنجینه نرسیدیم. اینترنتت را بررسی کن.';
  return error?.message || 'چیزی اشتباه شد.';
}
