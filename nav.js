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
  const isCoach = path.includes("coach");

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
    .hql-glass-nav a .nav-badge {
      position: absolute;
      top: 4px;
      left: 50%;
      transform: translateX(12px);
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ff4d6d;
      box-shadow: 0 0 8px rgba(255, 77, 109, 0.85);
      display: none;
    }
    .hql-glass-nav a.has-badge .nav-badge { display: block; }
    .hql-glass-nav a {
      position: relative;
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
  
    
    .hql-coach-word {
      flex: 1 1 0;
      min-width: 0;
      max-width: 100%;
      margin: 0 8px;
      direction: rtl;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .header .hql-coach-word,
    .hql-top-row .hql-coach-word {
      flex: 1 1 0;
      min-width: 0;
    }
    .hql-coach-word-inner {
      border-radius: 12px;
      padding: 6px 10px;
      background: linear-gradient(
        160deg,
        rgba(255, 255, 255, 0.12) 0%,
        rgba(255, 255, 255, 0.04) 50%,
        rgba(20, 16, 40, 0.4) 100%
      );
      border: 1px solid rgba(180, 120, 255, 0.32);
      -webkit-backdrop-filter: blur(10px) saturate(1.3);
      backdrop-filter: blur(10px) saturate(1.3);
      box-shadow: 0 0 12px rgba(180, 76, 255, 0.18);
      animation: hqlCoachGlow 3.6s ease-in-out infinite;
      transition: padding 0.25s ease;
    }
    .hql-coach-word-label {
      font-size: 9px;
      font-weight: 800;
      color: rgba(200, 180, 255, 0.9);
      text-shadow: 0 0 10px rgba(180, 76, 255, 0.45);
      line-height: 1.2;
      margin-bottom: 1px;
    }
    .hql-coach-word-text {
      font-size: 11px;
      font-weight: 600;
      line-height: 1.35;
      color: var(--text, #f2f4ff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .hql-coach-word.is-open .hql-coach-word-text {
      white-space: pre-wrap;
      overflow: visible;
      text-overflow: unset;
    }
    .hql-coach-word.is-open .hql-coach-word-inner {
      padding: 8px 12px;
    }
    /* وقتی جا نیست — فقط برچسب کوچک */
    .hql-coach-word.is-tight .hql-coach-word-text {
      display: none;
    }
    .hql-coach-word.is-tight .hql-coach-word-label {
      font-size: 10px;
      margin: 0;
      text-align: center;
    }
    .hql-coach-word.is-tight.is-open .hql-coach-word-text {
      display: block;
      white-space: pre-wrap;
      margin-top: 4px;
    }
    .hql-coach-word.hql-coach-word-page {
      display: block;
      margin: 0 0 10px;
      max-width: 100%;
    }
    @keyframes hqlCoachGlow {
      0%, 100% {
        box-shadow: 0 0 8px rgba(180, 76, 255, 0.12), 0 0 16px rgba(0, 240, 255, 0.05);
        border-color: rgba(180, 120, 255, 0.25);
      }
      50% {
        box-shadow: 0 0 18px rgba(180, 76, 255, 0.5), 0 0 32px rgba(0, 240, 255, 0.18);
        border-color: rgba(200, 160, 255, 0.55);
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
    <a href="coach.html" class="${isCoach ? "active" : ""}" data-nav="coach" id="hqlNavCoach">
      <span class="ico">🪵</span>
      <span>چوب استاد</span>
      <span class="nav-badge" aria-label="پیام جدید"></span>
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

  window.hqlNavSetCoachBadge = function (on) {
    const link = document.getElementById("hqlNavCoach");
    if (!link) return;
    link.classList.toggle("has-badge", !!on);
  };

  window.hqlNavSetAdmin = function (isAdmin) {
    try { sessionStorage.setItem("hql_is_admin", isAdmin ? "1" : "0"); } catch (_) {}
    setAdminNavVisible(!!isAdmin);
  };

  // اگر قبلاً ادمین بوده‌ایم در این تب
  try {
    if (sessionStorage.getItem("hql_is_admin") === "1") setAdminNavVisible(true);
  } catch (_) {}

  setTimeout(async () => {
    try {
      const client = window.__hqlDb;
      if (!client || !client.auth) return;
      const { data: sess } = await client.auth.getSession();
      const uid = sess && sess.session && sess.session.user && sess.session.user.id;
      if (!uid) return;
      const { data } = await client.from("coach_notes")
        .select("created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!data || !data.length) return;
      const latest = new Date(data[0].created_at).getTime();
      const seen = Number(localStorage.getItem("hql_coach_seen_at") || 0);
      if (typeof window.hqlNavSetCoachBadge === "function") {
        window.hqlNavSetCoachBadge(latest > seen);
      }
    } catch (e) {}
  }, 900);



  // ---- سخن استاد (هفتگی، همه صفحات) ----
  async function hqlLoadCoachWord() {
    try {
      const client = window.__hqlDb || window.db;
      if (!client || !client.from) return;
      const { data, error } = await client
        .from("site_messages")
        .select("key, body")
        .eq("key", "coach_weekly_word")
        .maybeSingle();
      if (error || !data || !data.body) return;
      const text = String(data.body || "").trim();
      if (!text) return;

      let wrap = document.getElementById("hqlCoachWord");
      if (wrap) {
        const tx = wrap.querySelector(".hql-coach-word-text");
        if (tx) tx.textContent = text;
        return;
      }

      wrap = document.createElement("div");
      wrap.id = "hqlCoachWord";
      wrap.className = "hql-coach-word";
      wrap.setAttribute("role", "button");
      wrap.setAttribute("tabindex", "0");
      wrap.title = "سخن استاد — برای خواندن کامل بزن";
      wrap.innerHTML =
        '<div class="hql-coach-word-inner">' +
        '<div class="hql-coach-word-label">سخن استاد</div>' +
        '<div class="hql-coach-word-text"></div>' +
        "</div>";
      wrap.querySelector(".hql-coach-word-text").textContent = text;

      wrap.addEventListener("click", function (e) {
        e.stopPropagation();
        wrap.classList.toggle("is-open");
      });

      function markTight(el) {
        requestAnimationFrame(function () {
          try {
            if (el.offsetWidth > 0 && el.offsetWidth < 72) el.classList.add("is-tight");
          } catch (_) {}
        });
      }

      // ۱) خانه: بین HQL و دکمه‌ها
      const header = document.querySelector("header.header, .header");
      const brand = header && header.querySelector(".brand");
      const actions = header && header.querySelector(".header-actions");
      if (header && brand && actions) {
        header.insertBefore(wrap, actions);
        markTight(wrap);
        return;
      }

      // ۲) ردیف عنوان مشترک (.hql-top-row): بین عنوان و دکمه‌ها / انتهای ردیف
      const topRow = document.querySelector(".hql-top-row");
      if (topRow) {
        const utils = topRow.querySelector(".top-utils");
        if (utils) topRow.insertBefore(wrap, utils);
        else topRow.appendChild(wrap);
        markTight(wrap);
        return;
      }

      // ۳) fallback
      wrap.classList.add("hql-coach-word-page");
      const title = document.querySelector(".page-title, h1.page-title");
      const page = document.querySelector(".page, #app");
      if (title && title.parentNode) title.parentNode.insertBefore(wrap, title.nextSibling);
      else if (page) page.insertBefore(wrap, page.firstChild);
      else document.body.insertBefore(wrap, document.body.firstChild);

    } catch (e) {}
  }

  setTimeout(hqlLoadCoachWord, 600);
  window.hqlReloadCoachWord = hqlLoadCoachWord;

})();
