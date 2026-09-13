// =========================================================
// احراز هویت — ثبت‌نام، ورود، خروج، تشخیص نقش کاربر
// =========================================================
import { supabase } from "./supabase-client.js";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (error) {
    console.error(error);
    return null;
  }
  return data;
}

export async function signUp({ fullName, phone, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });
  if (error) throw error;
  // پروفایل دیگر اینجا insert نمی‌شود — یک تریگر در دیتابیس (handle_new_user
  // در schema.sql) به‌محض ساخته‌شدن کاربر، ردیف profiles را خودش می‌سازد.
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

/** کاربر باید وارد شده باشد؛ در غیر این صورت به صفحه‌ی ورود هدایت می‌شود */
export async function guardCustomer() {
  const session = await getSession();
  if (!session) {
    window.location.href = "auth.html";
    return null;
  }
  return getProfile();
}

/** فقط ادمین اجازه‌ی ورود به صفحه را دارد */
export async function guardAdmin() {
  const profile = await guardCustomer();
  if (!profile) return null;
  if (profile.role !== "admin") {
    window.location.href = "dashboard.html";
    return null;
  }
  return profile;
}
