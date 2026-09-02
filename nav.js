/**
 * HQL glass bottom nav — Apple-style
 * hides on inactivity, shows on touch/scroll
 */
(function () {
  if (window.__hqlNavReady) return;
  window.__hqlNavReady = true;

  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const isIndex = !path || path === "index.html" || path === "" || path.endsWith("/");
  const isReport = path.includes("report");
  const isAdmin = path.includes("admin");

  const style = document.createElement("style");
  style.textContent = `
    :root { --hql-nav-h: 64px; --hql-nav-pad: calc(var(--hql-nav-h) + 18px + env(safe-area-inset-bottom, 0px)); }
    body.hql-has-nav .page,
    body.hql-has-nav #app,
    body.hql-has-nav .page-wrap {
      padding-bottom: var(--hql-nav-pad) !important;
    }
    /* spacer so last content clears nav */
    body.hql-has-nav::after {
      content: "";
      display: block;
      height: var(--hql-nav-pad);
      pointer-events: none;
    }
    .hql-glass-nav {
      position: fixed;
      left: 50%;
      bottom: calc(10px + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%) translateY(0);
      width: min(400px, calc(100% - 24px));
      z-index: 9990;
      display: flex;
      align-items: stretch;
      gap: 4px;
      padding: 8px 10px;
      border-radius: 22px;
      background: linear-gradient(
        165deg,
        rgba(255, 255, 255, 0.14) 0%,
        rgba(255, 255, 255, 0.05) 40%,
        rgba(20, 22, 36, 0.25) 100%
      );
      border: 1px solid rgba(255, 255, 255, 0.28);
      box-shadow:
        0 8px 28px rgba(0, 0, 0, 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        inset 0 -1px 0 rgba(255, 255, 255, 0.06);
      -webkit-backdrop-filter: blur(4px) saturate(1.4);
      backdrop-filter: blur(4px) saturate(1.4);
      transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease;
      opacity: 1;
      pointer-events: auto;
      direction: rtl;
    }
    .hql-glass-nav.is-hidden {
      transform: translateX(-50%) translateY(calc(100% + 28px));
      opacity: 0;
      pointer-events: none;
    }
    .hql-glass-nav a {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 8px 6px;
      border-radius: 16px;
      text-decoration: none;
      color: rgba(240, 242, 255, 0.55);
      font-family: inherit;
      font-size: 10px;
      font-weight: 600;
      transition: background 0.2s, color 0.2s, transform 0.15s;
      -webkit-tap-highlight-color: transparent;
      min-width: 0;
    }
    .hql-glass-nav a .ico {
      font-size: 20px;
      line-height: 1;
      filter: grayscale(0.3);
      transition: filter 0.2s, transform 0.2s;
    }
    .hql-glass-nav a.active {
      color: #f0f2ff;
      background: rgba(180, 76, 255, 0.18);
      box-shadow: 0 0 16px rgba(180, 76, 255, 0.2);
    }
    .hql-glass-nav a.active .ico {
      filter: none;
      transform: scale(1.08);
    }
    .hql-glass-nav a:active {
      transform: scale(0.94);
    }
    .hql-glass-nav
    @media (min-width: 900px) {
      .hql-glass-nav {
        width: min(420px, 100%);
      }
    }
  `;
  document.head.appendChild(style);
  document.body.classList.add("hql-has-nav");

  const nav = document.createElement("nav");
  nav.className = "hql-glass-nav";
  nav.setAttribute("aria-label", "ناوبری اصلی");
  nav.innerHTML = `
    <a href="index.html" class="${isIndex ? "active" : ""}" data-nav="home">
      <span class="ico">🏠</span>
      <span>خانه</span>
    </a>
    <a href="report.html" class="${isReport ? "active" : ""}" data-nav="report">
      <span class="ico">📊</span>
      <span>گزارش</span>
    </a>
    <a href="admin.html" class="${isAdmin ? "active" : ""}" data-nav="admin" id="hqlNavAdmin">
      <span class="ico">🛡️</span>
      <span>ادمین</span>
    </a>
  `;
  document.body.appendChild(nav);

  let hideTimer = null;
  let lastY = window.scrollY || 0;

  function showNav() {
    nav.classList.remove("is-hidden");
    scheduleHide();
  }
  function hideNav() {
    nav.classList.add("is-hidden");
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideNav, 2600);
  }

  showNav();

  const bump = () => showNav();
  window.addEventListener("touchstart", bump, { passive: true });
  window.addEventListener("touchmove", bump, { passive: true });
  window.addEventListener("pointerdown", bump, { passive: true });
  window.addEventListener("mousemove", bump, { passive: true });
  window.addEventListener("keydown", bump, { passive: true });
  window.addEventListener("scroll", () => {
    const y = window.scrollY || 0;
    if (y > lastY + 8) {
      // اسکرول به پایین → مخفی
      hideNav();
      clearTimeout(hideTimer);
    } else if (y < lastY - 4) {
      showNav();
    } else {
      bump();
    }
    lastY = y;
  }, { passive: true });

  // ادمین: فقط اگر is_admin
  async function resolveAdminLink() {
    const link = document.getElementById("hqlNavAdmin");
    if (!link) return;
    try {
      if (!window.supabase && !window.db) {
        // client ممکن است بعداً آماده شود
        setTimeout(resolveAdminLink, 400);
        return;
      }
      // صفحات HQL معمولاً const db دارند
      const client = window.__hqlDb || null;
      if (!client) {
        // تلاش از طریق اسکریپت‌های صفحه
        setTimeout(async () => {
          try {
            // اگر پروفایل ادمین در sessionStorage
            const flag = sessionStorage.getItem("hql_is_admin");
            if (flag === "1") link.classList.remove("hidden-nav");
            else if (flag === "0") link.classList.add("hidden-nav");
          } catch (_) {}
        }, 300);
        return;
      }
    } catch (_) {}
  }
  resolveAdminLink();

  // API برای صفحات: پس از دانستن is_admin
  function setAdminNavVisible(show) {
    const link = document.getElementById("hqlNavAdmin");
    if (!link) return;
    link.style.display = show ? "" : "none";
  }
  // پیش‌فرض: مخفی تا لاگین + ادمین بودن مشخص شود
  setAdminNavVisible(false);

  window.hqlNavSetAdmin = function (isAdmin) {
    try { sessionStorage.setItem("hql_is_admin", isAdmin ? "1" : "0"); } catch (_) {}
    setAdminNavVisible(!!isAdmin);
  };

  // اگر قبلاً ادمین بوده‌ایم در این تب
  try {
    if (sessionStorage.getItem("hql_is_admin") === "1") setAdminNavVisible(true);
  } catch (_) {}
})();
