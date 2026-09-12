// =========================================================
// نوار ناوبری مشترک — بر اساس وضعیت ورود کاربر، لینک‌های درست رو نشون میده
// =========================================================
import { getSession, getProfile, signOut } from "./auth.js";

/**
 * @param {HTMLElement} container - المنتی که نوبار داخلش رندر میشه
 * @param {{active?: string, profile?: object|null}} options
 *   - active: نام لینک فعلی برای هایلایت ('home'|'products'|'dashboard'|'admin')
 *   - profile: اگر صفحه از قبل پروفایل کاربر رو داره (مثل dashboard/admin)،
 *              همینو بده تا navbar دوباره کوئری نزنه
 */
export async function renderNavbar(container, { active = "", profile: preloadedProfile } = {}) {
  let profile = preloadedProfile ?? null;

  if (preloadedProfile === undefined) {
    const session = await getSession();
    if (session) profile = await getProfile();
  }

  const isAdmin = profile?.role === "admin";
  const linkClass = (name) => `btn btn-ghost btn-sm${active === name ? " is-active" : ""}`;

  let rightLinks = `<a href="products.html" class="${linkClass("products")}">محصولات</a>`;

  if (profile) {
    rightLinks += `
      ${isAdmin ? `<a href="admin.html" class="${linkClass("admin")}">پنل مدیریت</a>` : ""}
      <a href="dashboard.html" class="${linkClass("dashboard")}">داشبورد من</a>
      <span class="text-muted nav-welcome">سلام، ${profile.full_name || ""}</span>
      <button class="btn btn-ghost btn-sm" id="nav-logout-btn">خروج</button>
    `;
  } else {
    rightLinks += `
      <a href="auth.html" class="${linkClass("login")}">ورود</a>
      <a href="auth.html#signup" class="btn btn-primary btn-sm">ثبت‌نام</a>
    `;
  }

  container.innerHTML = `
    <nav class="topbar">
      <div class="container">
        <a href="index.html" class="brand"><span class="dot">●</span> برنج قسطی</a>
        <div class="row gap-sm wrap">${rightLinks}</div>
      </div>
    </nav>
  `;

  container.querySelector("#nav-logout-btn")?.addEventListener("click", signOut);
  return profile;
}
