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
  const isFood = path.includes("food");

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

  
    
    .hql-burn-overlay {
      position: fixed;
      inset: 0;
      z-index: 20000;
      pointer-events: none;
      overflow: hidden;
      opacity: 0;
      background: #05060a;
    }
    .hql-burn-overlay.on {
      opacity: 1;
    }
    .hql-burn-overlay .burn-bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 100% 70% at 50% 110%, rgba(255, 50, 0, 0.7), transparent 55%),
        radial-gradient(ellipse 50% 40% at 15% 100%, rgba(255, 140, 0, 0.5), transparent 50%),
        radial-gradient(ellipse 50% 40% at 85% 100%, rgba(255, 40, 0, 0.45), transparent 50%),
        linear-gradient(180deg, #05060a 0%, #1a0800 50%, #000 100%);
      animation: burnBgPulse 0.9s ease-in-out infinite alternate;
    }
    .hql-burn-overlay .burn-flame {
      position: absolute;
      bottom: -8%;
      width: 28%;
      height: 55%;
      border-radius: 50% 50% 40% 40%;
      background: radial-gradient(ellipse at 50% 80%,
        rgba(255, 250, 200, 0.95) 0%,
        rgba(255, 160, 0, 0.75) 35%,
        rgba(255, 40, 0, 0.45) 65%,
        transparent 78%);
      filter: blur(8px);
      opacity: 0;
      animation: flameLick 0.55s ease-out forwards, flameWaver 0.7s ease-in-out 0.4s infinite alternate;
    }
    .hql-burn-overlay .burn-flame.f1 { left: 8%; animation-delay: 0s, 0.4s; }
    .hql-burn-overlay .burn-flame.f2 { left: 36%; width: 32%; height: 62%; animation-delay: 0.08s, 0.35s; }
    .hql-burn-overlay .burn-flame.f3 { left: 62%; animation-delay: 0.15s, 0.5s; }
    .hql-burn-overlay .burn-smoke {
      position: absolute;
      bottom: 25%;
      width: 40%;
      height: 50%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(80, 70, 65, 0.45), transparent 70%);
      filter: blur(28px);
      opacity: 0;
      animation: smokeRise 1.1s ease-out forwards;
    }
    .hql-burn-overlay .burn-smoke.s1 { left: 5%; animation-delay: 0.12s; }
    .hql-burn-overlay .burn-smoke.s2 { left: 35%; width: 50%; animation-delay: 0.22s; }
    .hql-burn-overlay .burn-smoke.s3 { left: 55%; animation-delay: 0.18s; }
    .hql-burn-overlay .burn-ember {
      position: absolute;
      bottom: 12%;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #ffc14d;
      box-shadow: 0 0 10px 3px rgba(255, 100, 0, 0.9);
      opacity: 0;
      animation: emberFly 0.95s ease-out forwards;
    }
    .hql-burn-overlay .hql-burn-mark {
      position: absolute;
      left: 50%;
      top: 38%;
      transform: translate(-50%, -50%);
      font-size: clamp(52px, 20vw, 104px);
      font-weight: 900;
      letter-spacing: 0.1em;
      color: rgba(255, 180, 80, 0.55);
      text-shadow:
        0 0 20px rgba(255, 80, 0, 0.9),
        0 0 50px rgba(255, 40, 0, 0.7),
        0 0 80px rgba(255, 100, 0, 0.4);
      opacity: 0;
      animation: hqlBurnMark 0.9s ease-out 0.15s forwards, markFlicker 0.35s ease-in-out 0.5s infinite alternate;
      z-index: 2;
    }
    .hql-burn-overlay .burn-ash {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(1.5px 1.5px at 20% 30%, rgba(255,200,150,0.5) 50%, transparent 50%),
        radial-gradient(1px 1px at 70% 40%, rgba(255,180,100,0.4) 50%, transparent 50%),
        radial-gradient(1.5px 1.5px at 40% 60%, rgba(255,220,180,0.35) 50%, transparent 50%),
        radial-gradient(1px 1px at 85% 25%, rgba(255,160,80,0.45) 50%, transparent 50%),
        radial-gradient(1px 1px at 15% 70%, rgba(255,200,120,0.3) 50%, transparent 50%);
      background-size: 100% 100%;
      opacity: 0;
      animation: ashDrift 1s ease-out forwards;
      z-index: 1;
    }
    body.hql-burning {
      overflow: hidden !important;
      overscroll-behavior: none;
    }
    body.hql-burning .page,
    body.hql-burning #app,
    body.hql-burning .hql-glass-nav {
      transition: transform 0.85s ease, filter 0.85s ease, opacity 0.85s ease;
      filter: blur(2.5px) brightness(0.55) sepia(0.5) saturate(1.6);
      transform: scale(1.04) translateY(2%);
      opacity: 0.45;
    }
    @keyframes burnBgPulse {
      from { filter: brightness(1); }
      to { filter: brightness(1.15); }
    }
    @keyframes flameLick {
      0% { opacity: 0; transform: translateY(40%) scaleY(0.5); }
      40% { opacity: 1; }
      100% { opacity: 0.9; transform: translateY(0) scaleY(1); }
    }
    @keyframes flameWaver {
      from { transform: translateY(0) scaleX(1) scaleY(1); }
      to { transform: translateY(-4%) scaleX(1.06) scaleY(1.08); }
    }
    @keyframes smokeRise {
      0% { opacity: 0; transform: translateY(30%) scale(0.8); }
      40% { opacity: 0.7; }
      100% { opacity: 0.35; transform: translateY(-35%) scale(1.25); }
    }
    @keyframes emberFly {
      0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
      15% { opacity: 1; }
      100% { opacity: 0; transform: translate(var(--ex, 0), -120px) scale(0.2); }
    }
    @keyframes hqlBurnMark {
      0% { opacity: 0; transform: translate(-50%, -30%) scale(0.85); filter: blur(4px); }
      60% { opacity: 1; filter: blur(0); }
      100% { opacity: 0.95; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes markFlicker {
      from { opacity: 0.75; filter: brightness(1); }
      to { opacity: 1; filter: brightness(1.25); }
    }
    @keyframes ashDrift {
      0% { opacity: 0; transform: translateY(10%); }
      30% { opacity: 0.8; }
      100% { opacity: 0.4; transform: translateY(-8%); }
    }
    body.hql-food-enter {
      animation: hqlFoodEnter 0.75s ease-out;
    }
    @keyframes hqlFoodEnter {
      0% { filter: brightness(0.2) sepia(0.5) contrast(1.1); opacity: 0.45; }
      100% { filter: none; opacity: 1; }
    }
    .hql-glass-nav.nav-gesture-lock {
      touch-action: none;
    }
    body.hql-nav-touch-lock {
      overflow: hidden !important;
      overscroll-behavior: none;
      touch-action: none;
    }


  `;
  document.head.appendChild(style);
  document.body.classList.add("hql-has-nav");

  const nav = document.createElement("nav");
  nav.className = "hql-glass-nav";
  nav.setAttribute("aria-label", "ناوبری اصلی");
  nav.innerHTML = `
    <a href="index.html" class="${isIndex || isFood ? "active" : ""}" data-nav="home" id="hqlNavHome">
      <span class="ico">${isFood ? "🥗" : "🏠"}</span>
      <span>${isFood ? "تغذیه" : "خانه"}</span>
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
  
  function hqlBurnNavigate(url) {
    if (window.__hqlBurning) return;
    window.__hqlBurning = true;
    try {
      document.body.classList.add("hql-burning");
      document.body.style.overflow = "hidden";

      const old = document.getElementById("hqlBurnOverlay");
      if (old) old.remove();
      const oldCss = document.getElementById("hqlBurnCss");
      if (oldCss) oldCss.remove();

      const ov = document.createElement("div");
      ov.id = "hqlBurnOverlay";
      ov.setAttribute("style",
        "position:fixed;inset:0;z-index:2147483646;pointer-events:auto;overflow:hidden;" +
        "opacity:0;background:#05060a;will-change:opacity;transition:opacity .18s linear"
      );

      const css = document.createElement("style");
      css.id = "hqlBurnCss";
      css.textContent = `
        #hqlBurnOverlay .col{
          position:absolute;left:0;right:0;bottom:0;top:0;
          display:flex;flex-direction:column;justify-content:flex-end;
          transform:translateZ(0);
        }
        /* ستون آتش تمام‌عرض */
        #hqlBurnOverlay .flame-col{
          position:absolute;left:0;right:0;bottom:0;height:70%;
          background:
            linear-gradient(to top,
              #ff1a00 0%,
              #ff4a00 18%,
              #ff8c00 38%,
              #ffc14d 58%,
              rgba(255,200,80,.35) 72%,
              transparent 100%);
          transform-origin:50% 100%;
          transform:translateZ(0) scaleY(.25);
          will-change:transform,opacity;
          animation:hqlColUp .55s cubic-bezier(.2,.8,.2,1) forwards;
        }
        /* تکسچر آتش — نویز نقطه‌ای + رگه‌های عمودی */
        #hqlBurnOverlay .flame-tex{
          position:absolute;left:0;right:0;bottom:0;height:70%;
          opacity:0;mix-blend-mode:overlay;pointer-events:none;
          background-image:
            repeating-linear-gradient(90deg,
              rgba(0,0,0,.14) 0 2px,
              rgba(255,220,120,.12) 2px 3px,
              rgba(0,0,0,.08) 3px 5px,
              transparent 5px 9px),
            repeating-linear-gradient(0deg,
              rgba(255,80,0,.15) 0 3px,
              transparent 3px 7px),
            radial-gradient(circle at 20% 80%,rgba(255,255,200,.25) 0,transparent 12%),
            radial-gradient(circle at 50% 70%,rgba(255,200,50,.2) 0,transparent 18%),
            radial-gradient(circle at 78% 85%,rgba(255,100,0,.22) 0,transparent 14%);
          background-size:12px 100%, 100% 10px, 100% 100%, 100% 100%, 100% 100%;
          animation:hqlTex .55s ease-out .05s forwards, hqlTexShift .7s linear .4s infinite;
          will-change:opacity,background-position;
          transform:translateZ(0);
        }
        #hqlBurnOverlay .flame-tex2{
          position:absolute;left:0;right:0;bottom:0;height:65%;
          opacity:0;mix-blend-mode:soft-light;pointer-events:none;
          background:
            repeating-linear-gradient(85deg,
              transparent 0 6px,
              rgba(255,40,0,.18) 6px 7px,
              transparent 7px 14px);
          animation:hqlTex .5s ease-out .1s forwards, hqlTexShift2 .85s linear .35s infinite;
          transform:translateZ(0);
        }
        #hqlBurnOverlay .sm{
          position:absolute;left:0;right:0;bottom:28%;height:45%;
          background:radial-gradient(ellipse 100% 80% at 50% 100%,
            rgba(70,55,50,.5) 0%, transparent 70%);
          opacity:0;transform:translateZ(0) translateY(16px);
          will-change:transform,opacity;
          animation:hqlSm .8s ease-out .06s forwards;
        }
        #hqlBurnOverlay .em{
          position:absolute;bottom:20%;width:4px;height:4px;border-radius:50%;
          background:#ffe0a0;box-shadow:0 0 6px #ff6400;
          opacity:0;will-change:transform,opacity;
          animation:hqlEm .75s ease-out forwards;
        }
        /* HQL نئون */
        #hqlBurnOverlay .mk{
          position:absolute;left:50%;top:34%;z-index:5;
          transform:translate(-50%,-50%) translateZ(0);
          font:900 clamp(56px,22vw,112px)/1 system-ui,sans-serif;
          letter-spacing:.14em;
          color:#e8f0ff;
          text-shadow:
            0 0 6px #fff,
            0 0 14px #00f0ff,
            0 0 28px #00f0ff,
            0 0 48px #b44cff,
            0 0 72px #b44cff,
            0 0 2px #00f0ff;
          opacity:0;will-change:opacity,transform,text-shadow;
          animation:hqlMk .65s ease-out .1s forwards, hqlNeonPulse .45s ease-in-out .55s infinite alternate;
        }
        @keyframes hqlColUp{
          to{transform:translateZ(0) scaleY(1)}
        }
        @keyframes hqlTex{
          from{opacity:0} to{opacity:.85}
        }
        @keyframes hqlTexShift{
          from{background-position:0 0,0 0,0 0,0 0,0 0}
          to{background-position:12px 0,0 -10px,0 0,0 0,0 0}
        }
        @keyframes hqlTexShift2{
          from{background-position:0 0}
          to{background-position:20px -12px}
        }
        @keyframes hqlSm{
          0%{opacity:0;transform:translateZ(0) translateY(16px)}
          40%{opacity:.55}
          100%{opacity:.22;transform:translateZ(0) translateY(-40px)}
        }
        @keyframes hqlEm{
          0%{opacity:0;transform:translate3d(0,0,0)}
          12%{opacity:1}
          100%{opacity:0;transform:translate3d(var(--x,0),-90px,0)}
        }
        @keyframes hqlMk{
          0%{opacity:0;transform:translate(-50%,-42%) scale(.88)}
          100%{opacity:1;transform:translate(-50%,-50%) scale(1)}
        }
        @keyframes hqlNeonPulse{
          from{
            text-shadow:
              0 0 6px #fff,
              0 0 12px #00f0ff,
              0 0 24px #00f0ff,
              0 0 40px #b44cff;
          }
          to{
            text-shadow:
              0 0 10px #fff,
              0 0 22px #00f0ff,
              0 0 44px #00f0ff,
              0 0 70px #b44cff,
              0 0 96px rgba(180,76,255,.8);
          }
        }
        body.hql-burning .page,body.hql-burning #app{
          opacity:.38!important;transition:opacity .3s linear!important;
        }
      `;
      document.head.appendChild(css);

      let embers = "";
      for (let i = 0; i < 8; i++) {
        const left = 8 + Math.random() * 84;
        const delay = (0.05 + Math.random() * 0.28).toFixed(2);
        const x = ((Math.random() - 0.5) * 60).toFixed(0);
        embers += '<i class="em" style="left:' + left + "%;animation-delay:" + delay + "s;--x:" + x + 'px"></i>';
      }
      ov.innerHTML =
        '<div class="col">' +
          '<div class="flame-col"></div>' +
          '<div class="flame-tex"></div>' +
          '<div class="flame-tex2"></div>' +
          '<div class="sm"></div>' +
          embers +
        '</div>' +
        '<div class="mk">HQL</div>';
      document.body.appendChild(ov);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          ov.style.opacity = "1";
        });
      });
    } catch (err) {
      try { console.warn("burn", err); } catch (_) {}
    }
    setTimeout(function () {
      location.href = url;
    }, 850);
  }






  // ورود به تغذیه: کمی از خاکستر
  if (isFood) {
    try { document.body.classList.add("hql-food-enter"); } catch (_) {}
  }

  document.body.appendChild(nav);

  // خانه ↔ تغذیه با سوایپ عمودی روی آیتم خانه
  (function bindHomeFoodSwipe() {
    const home = document.getElementById("hqlNavHome");
    if (!home) return;

    let startY = null;
    let startX = null;
    let tracking = false;
    let locked = false;
    let moved = false;

    function lockPage() {
      locked = true;
      try {
        document.body.classList.add("hql-nav-touch-lock");
        nav.classList.add("nav-gesture-lock");
      } catch (_) {}
    }
    function unlockPage() {
      locked = false;
      try {
        document.body.classList.remove("hql-nav-touch-lock");
        nav.classList.remove("nav-gesture-lock");
      } catch (_) {}
    }

    home.addEventListener("touchstart", function (e) {
      if (!e.touches || !e.touches[0]) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
      moved = false;
    }, { passive: true });

    home.addEventListener("touchmove", function (e) {
      if (!tracking || startY == null || !e.touches || !e.touches[0]) return;
      const y = e.touches[0].clientY;
      const x = e.touches[0].clientX;
      const dy = y - startY;
      const dx = x - startX;
      // حرکت عمدتاً عمودی روی خود ناو
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 0.85) {
        moved = true;
        lockPage();
        e.preventDefault();
      }
    }, { passive: false });

    home.addEventListener("touchend", function (e) {
      if (!tracking || startY == null) return;
      tracking = false;
      const t = e.changedTouches && e.changedTouches[0];
      const dy = t ? (t.clientY - startY) : 0;
      const dx = t && startX != null ? (t.clientX - startX) : 0;
      startY = null;
      startX = null;
      unlockPage();

      // افقی زیاد = سوایپ تصادفی، نادیده
      if (Math.abs(dx) > Math.abs(dy) * 1.1) return;
      // آستانه نرم‌تر ولی نه بیش‌حساس: ~28px
      if (!moved && Math.abs(dy) < 28) return;

      // خانه → تغذیه (بالا)
      if (!isFood && dy < -28) {
        e.preventDefault();
        hqlBurnNavigate("food.html");
        return;
      }
      // تغذیه → خانه (پایین) — فقط روی خود دکمه ناو، نه pull-to-refresh صفحه
      // و فقط وقتی واقعاً روی ناو شروع شده (همین handler)
      if (isFood && dy > 32) {
        e.preventDefault();
        location.href = "index.html";
        return;
      }
    }, { passive: false });

    home.addEventListener("touchcancel", function () {
      tracking = false;
      startY = null;
      startX = null;
      unlockPage();
    }, { passive: true });

    // دسکتاپ: چرخ روی ناو، آستانه بالاتر
    let wheelAcc = 0;
    let wheelTimer = null;
    home.addEventListener("wheel", function (e) {
      e.preventDefault();
      wheelAcc += e.deltaY;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { wheelAcc = 0; }, 280);
      if (!isFood && wheelAcc < -50) {
        wheelAcc = 0;
        hqlBurnNavigate("food.html");
      } else if (isFood && wheelAcc > 55) {
        wheelAcc = 0;
        location.href = "index.html";
      }
    }, { passive: false });
  })();


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



  // ---- سخن هفته (هفتگی، همه صفحات) ----
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
      wrap.title = "سخن هفته — برای خواندن کامل بزن";
      wrap.innerHTML =
        '<div class="hql-coach-word-inner">' +
        '<div class="hql-coach-word-label">سخن هفته</div>' +
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
