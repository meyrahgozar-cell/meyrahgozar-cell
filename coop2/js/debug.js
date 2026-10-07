/* =========================================================
   Debug Console Overlay
   ========================================================= */
(function () {
  'use strict';

  var MAX_LOGS = 250;
  var logs = [];
  var unread = 0;
  var panel, list, badge, fab;
  var original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console)
  };

  var css = `
    #dbgFab {
      position: fixed; bottom: 16px; left: 16px; z-index: 2147483646;
      width: 54px; height: 54px; border-radius: 50%; border: 0;
      background: linear-gradient(135deg, #8b5cf6, #22d3ee);
      color: #fff; font-size: 22px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 24px rgba(139,92,246,.55);
      -webkit-tap-highlight-color: transparent;
    }
    #dbgFab:active { transform: scale(.94); }
    #dbgFab .dbg-badge {
      position: absolute; top: -4px; right: -4px;
      background: #f87171; color: #fff;
      font: 700 11px/1 system-ui, sans-serif;
      min-width: 20px; height: 20px; border-radius: 999px;
      padding: 0 5px; display: none;
      align-items: center; justify-content: center;
      border: 2px solid #0f1117;
    }
    #dbgFab .dbg-badge.on { display: flex; }

    #dbgPanel {
      position: fixed; inset: 0; z-index: 2147483647;
      background: #0f1117; color: #e8ecf6;
      display: none; flex-direction: column;
      font: 13px/1.55 'Vazirmatn', system-ui, sans-serif;
    }
    #dbgPanel.open { display: flex; }

    .dbg-head {
      display: flex; justify-content: space-between; align-items: center;
      gap: 8px; flex-wrap: wrap;
      padding: 10px 14px;
      background: #161923;
      border-bottom: 1px solid #262c3d;
    }
    .dbg-title { font-weight: 800; font-size: 15px; direction: rtl; }
    .dbg-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .dbg-btn {
      padding: 7px 13px; border: 1px solid #384156; border-radius: 10px;
      background: #1c202c; color: #e8ecf6; font: inherit; font-size: 13px;
      cursor: pointer; -webkit-tap-highlight-color: transparent;
    }
    .dbg-btn:active { transform: scale(.96); }
    .dbg-btn.primary {
      background: linear-gradient(135deg, #8b5cf6, #22d3ee);
      border-color: transparent; color: #fff; font-weight: 700;
    }
    .dbg-btn.active {
      background: #fbbf24; border-color: #fbbf24; color: #1c1a17; font-weight: 700;
    }

    .dbg-info {
      padding: 8px 14px;
      background: #14161f;
      border-bottom: 1px solid #262c3d;
      font-size: 12px; display: grid; gap: 4px;
      direction: rtl; word-break: break-all;
    }
    .dbg-info b { color: #a78bfa; font-weight: 600; }
    .dbg-info .dbg-theme-dot {
      display: inline-block; width: 10px; height: 10px;
      border-radius: 50%; margin-left: 4px; vertical-align: middle;
      background: #8b5cf6; box-shadow: 0 0 8px currentColor;
    }

    .dbg-list {
      flex: 1; overflow-y: auto; padding: 8px;
      font: 12px/1.65 'SF Mono', Menlo, Consolas, monospace;
      direction: ltr;
      -webkit-user-select: text; user-select: text;
      -webkit-overflow-scrolling: touch;
    }
    .dbg-row {
      padding: 8px 10px; margin-bottom: 6px;
      border-radius: 8px;
      background: #1c202c;
      border-left: 3px solid #384156;
      word-break: break-word; white-space: pre-wrap;
    }
    .dbg-row.dbg-error { border-left-color: #f87171; background: rgba(248,113,113,.10); color: #fca5a5; }
    .dbg-row.dbg-warn  { border-left-color: #fbbf24; background: rgba(251,191,36,.10); color: #fcd34d; }
    .dbg-row.dbg-info  { border-left-color: #60a5fa; background: rgba(96,165,250,.10); color: #93c5fd; }
    .dbg-row.dbg-log   { border-left-color: #7c85a0; }
    .dbg-time { color: #7c85a0; font-size: 11px; margin-right: 6px; }
    .dbg-level {
      display: inline-block; font-size: 10px; font-weight: 700;
      padding: 1px 6px; border-radius: 4px;
      background: rgba(255,255,255,.08);
      text-transform: uppercase; margin-right: 6px;
    }
    .dbg-msg { white-space: pre-wrap; }
    .dbg-empty { text-align: center; color: #7c85a0; padding: 40px 20px; direction: rtl; }
  `;

  function injectStyle() {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function stringify(a) {
    if (a instanceof Error) return (a.stack || a.message || String(a));
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a, null, 2); }
      catch (e) { return String(a); }
    }
    return String(a);
  }

  function push(level, args) {
    var msg = args.map(stringify).join(' ');
    logs.push({ level: level, msg: msg, time: new Date() });
    if (logs.length > MAX_LOGS) logs.shift();
    if (level === 'error' || level === 'warn') {
      if (!panel || !panel.classList.contains('open')) {
        unread++;
        updateBadge();
      }
    }
    render();
  }

  ['log','warn','error','info'].forEach(function (k) {
    console[k] = function () {
      var args = Array.prototype.slice.call(arguments);
      original[k].apply(console, args);
      push(k, args);
    };
  });

  window.addEventListener('error', function (e) {
    var loc = '';
    if (e.filename) loc = ' @ ' + e.filename.split('/').pop() + ':' + e.lineno + ':' + e.colno;
    push('error', ['[Uncaught] ' + (e.message || e.error || 'Unknown') + loc]);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var msg = (r && (r.stack || r.message)) || String(r);
    push('error', ['[Unhandled Promise] ' + msg]);
  });

  function ensureUI() {
    if (fab) return;

    fab = document.createElement('button');
    fab.id = 'dbgFab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Debug Console');
    fab.innerHTML = '🐞<span class="dbg-badge"></span>';
    fab.addEventListener('click', toggle);
    document.body.appendChild(fab);
    badge = fab.querySelector('.dbg-badge');

    panel = document.createElement('div');
    panel.id = 'dbgPanel';
    panel.innerHTML =
      '<div class="dbg-head">' +
        '<span class="dbg-title">🐞 کنسول دیباگ</span>' +
        '<div class="dbg-actions">' +
          '<button class="dbg-btn primary" data-dbg="copy">کپی همه</button>' +
          '<button class="dbg-btn" data-dbg="noanim">بی‌انیمیشن</button>' +
          '<button class="dbg-btn" data-dbg="clear">پاک کردن</button>' +
          '<button class="dbg-btn" data-dbg="reload">رفرش</button>' +
          '<button class="dbg-btn" data-dbg="close">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="dbg-info">' +
        '<div>تم: <b id="dbgThemeVal">-</b> <span class="dbg-theme-dot" id="dbgThemeDot"></span></div>' +
        '<div>مسیر: <b id="dbgUrlVal">-</b></div>' +
        '<div>اندازه: <b id="dbgSizeVal">-</b></div>' +
        '<div>خطا: <b id="dbgErrCount">0</b></div>' +
      '</div>' +
      '<div class="dbg-list" id="dbgList"></div>';
    document.body.appendChild(panel);
    list = panel.querySelector('#dbgList');

    panel.addEventListener('click', function (e) {
      var t = e.target.closest('[data-dbg]');
      if (!t) return;
      var act = t.dataset.dbg;
      if (act === 'copy') copyAll();
      else if (act === 'clear') { logs.length = 0; unread = 0; updateBadge(); render(); }
      else if (act === 'close') toggle();
      else if (act === 'reload') location.reload();
      else if (act === 'noanim') toggleNoAnim(t);
    });

    updateInfo();
    render();
  }

  function toggleNoAnim(btn) {
    var root = document.documentElement;
    var isOff = root.classList.toggle('no-anim');
    try { localStorage.setItem('mpna_noanim', isOff ? '1' : '0'); } catch (e) {}
    btn.classList.toggle('active', isOff);
    push('info', ['no-anim = ' + isOff]);
  }

  function updateInfo() {
    if (!panel) return;
    var theme = document.documentElement.getAttribute('data-theme') || 'none';
    var themeEl = panel.querySelector('#dbgThemeVal');
    var dot = panel.querySelector('#dbgThemeDot');
    if (themeEl) themeEl.textContent = theme;
    if (dot) {
      if (theme === 'dark')  { dot.style.background = '#8b5cf6'; dot.style.color = '#8b5cf6'; }
      if (theme === 'light') { dot.style.background = '#fbbf24'; dot.style.color = '#fbbf24'; }
      if (theme === 'none')  { dot.style.background = '#f87171'; dot.style.color = '#f87171'; }
    }
    var urlEl = panel.querySelector('#dbgUrlVal');
    if (urlEl) urlEl.textContent = location.pathname + location.search;
    var sizeEl = panel.querySelector('#dbgSizeVal');
    if (sizeEl) sizeEl.textContent = window.innerWidth + '×' + window.innerHeight;
    var ec = panel.querySelector('#dbgErrCount');
    if (ec) ec.textContent = String(logs.filter(function(l){ return l.level === 'error'; }).length);
  }

  function updateBadge() {
    if (!badge) return;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('on', unread > 0);
  }

  function render() {
    ensureUI();
    list.innerHTML = '';
    if (!logs.length) {
      var empty = document.createElement('div');
      empty.className = 'dbg-empty';
      empty.textContent = 'هیچ پیامی ثبت نشده است.';
      list.appendChild(empty);
    } else {
      var frag = document.createDocumentFragment();
      logs.forEach(function (l) {
        var row = document.createElement('div');
        row.className = 'dbg-row dbg-' + l.level;

        var time = document.createElement('span');
        time.className = 'dbg-time';
        time.textContent = l.time.toLocaleTimeString('fa-IR');

        var lvl = document.createElement('span');
        lvl.className = 'dbg-level';
        lvl.textContent = l.level;

        var msg = document.createElement('span');
        msg.className = 'dbg-msg';
        msg.textContent = l.msg;

        row.appendChild(time);
        row.appendChild(lvl);
        row.appendChild(msg);
        frag.appendChild(row);
      });
      list.appendChild(frag);
      list.scrollTop = list.scrollHeight;
    }
    updateInfo();
  }

  function toggle() {
    ensureUI();
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      unread = 0;
      updateBadge();
      updateInfo();
      render();
      var btn = panel.querySelector('[data-dbg="noanim"]');
      if (btn) {
        var isOff = document.documentElement.classList.contains('no-anim');
        btn.classList.toggle('active', isOff);
      }
    }
  }

  function copyAll() {
    var text = logs.map(function (l) {
      return '[' + l.time.toLocaleTimeString('fa-IR') + '] [' + l.level.toUpperCase() + '] ' + l.msg;
    }).join('\n');
    if (!text) text = '(empty)';
    var info =
      '=== DEBUG INFO ===\n' +
      'Theme: ' + (document.documentElement.getAttribute('data-theme') || 'none') + '\n' +
      'No-Anim: ' + document.documentElement.classList.contains('no-anim') + '\n' +
      'URL: ' + location.href + '\n' +
      'Viewport: ' + window.innerWidth + 'x' + window.innerHeight + '\n' +
      'DPR: ' + (window.devicePixelRatio || 1) + '\n' +
      'UA: ' + navigator.userAgent + '\n' +
      'Time: ' + new Date().toISOString() + '\n' +
      '==================\n\n';
    var full = info + text;

    function done() {
      var btn = panel.querySelector('[data-dbg="copy"]');
      if (btn) {
        var old = btn.textContent;
        btn.textContent = '✔ کپی شد';
        setTimeout(function(){ btn.textContent = old; }, 1400);
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(full).then(done).catch(function () { fallback(full, done); });
    } else {
      fallback(full, done);
    }
  }

  function fallback(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '2px';
    ta.style.height = '2px';
    ta.style.opacity = '0.01';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok && cb) cb();
    else push('warn', ['کپی خودکار ممکن نبود.']);
  }

  window.__dbg = {
    logs: logs,
    toggle: toggle,
    clear: function () { logs.length = 0; unread = 0; updateBadge(); render(); },
    push: push
  };

  function init() {
    try {
      if (localStorage.getItem('mpna_noanim') === '1') {
        document.documentElement.classList.add('no-anim');
      }
    } catch (e) {}
    injectStyle();
    ensureUI();
    push('info', [
      'Debug ready | theme=' +
      (document.documentElement.getAttribute('data-theme') || 'none') +
      ' | vp=' + window.innerWidth + 'x' + window.innerHeight
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();