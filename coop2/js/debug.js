/* =========================================================
   Debug Console Overlay — v4 (no module marker check)
   ========================================================= */
(function () {
  'use strict';

  var MAX = 300;
  var logs = [];
  var unread = 0;
  var fab = null, panel = null, list = null, badge = null, opened = false;

  var orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };

  function str(a) {
    if (a instanceof Error) return a.stack || a.message || String(a);
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a, null, 2); } catch (e) { return String(a); }
    }
    return String(a);
  }

  function push(level, args) {
    var parts = [], i;
    for (i = 0; i < args.length; i++) parts.push(str(args[i]));
    var msg = parts.join(' ');
    logs.push({ level: level, msg: msg, time: new Date() });
    if (logs.length > MAX) logs.shift();
    if ((level === 'error' || level === 'warn') && !opened) { unread++; updateBadge(); }
    if (list) render();
  }

  var levels = ['log', 'warn', 'error', 'info'];
  for (var li = 0; li < levels.length; li++) {
    (function (k) {
      console[k] = function () {
        var args = Array.prototype.slice.call(arguments);
        try { orig[k].apply(console, args); } catch (e) {}
        push(k, args);
      };
    })(levels[li]);
  }

  window.addEventListener('error', function (e) {
    var loc = e.filename ? ' @ ' + e.filename + ':' + e.lineno + ':' + e.colno : '';
    push('error', ['[Uncaught] ' + (e.message || String(e.error || '')) + loc]);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var m = (r && (r.stack || r.message)) || String(r);
    push('error', ['[Promise] ' + m]);
  });

  function injectCSS() {
    if (document.getElementById('dbgStyle')) return;
    var css =
      '#dbgFab{position:fixed;bottom:16px;left:16px;z-index:2147483646;' +
        'width:54px;height:54px;border-radius:50%;border:0;' +
        'background:linear-gradient(135deg,#8b5cf6,#22d3ee);color:#fff;' +
        'font-size:22px;cursor:pointer;display:flex;align-items:center;' +
        'justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.45)}' +
      '#dbgFab .dbg-badge{position:absolute;top:-4px;right:-4px;' +
        'background:#f87171;color:#fff;font:700 11px/1 system-ui,sans-serif;' +
        'min-width:20px;height:20px;border-radius:999px;padding:0 5px;' +
        'display:none;align-items:center;justify-content:center}' +
      '#dbgFab .dbg-badge.on{display:flex}' +
      '#dbgPanel{position:fixed;top:0;left:0;right:0;bottom:0;' +
        'z-index:2147483647;background:#0f1117;color:#e8ecf6;' +
        'display:none;flex-direction:column;' +
        'font:13px/1.55 system-ui,-apple-system,Tahoma,sans-serif}' +
      '#dbgPanel.open{display:flex}' +
      '.dbg-head{display:flex;justify-content:space-between;align-items:center;' +
        'gap:8px;flex-wrap:wrap;padding:10px 14px;background:#161923;' +
        'border-bottom:1px solid #262c3d}' +
      '.dbg-title{font-weight:800;font-size:15px;direction:rtl}' +
      '.dbg-actions{display:flex;gap:6px;flex-wrap:wrap}' +
      '.dbg-btn{padding:7px 13px;border:1px solid #384156;border-radius:10px;' +
        'background:#1c202c;color:#e8ecf6;font:inherit;font-size:13px;cursor:pointer}' +
      '.dbg-btn.primary{background:linear-gradient(135deg,#8b5cf6,#22d3ee);' +
        'border-color:transparent;color:#fff;font-weight:700}' +
      '.dbg-info{padding:8px 14px;background:#14161f;' +
        'border-bottom:1px solid #262c3d;font-size:12px;display:grid;' +
        'gap:4px;direction:rtl;word-break:break-all}' +
      '.dbg-info b{color:#a78bfa}' +
      '.dbg-list{flex:1;overflow-y:auto;padding:8px;' +
        'font:12px/1.65 Menlo,Consolas,monospace;direction:ltr;' +
        '-webkit-user-select:text;user-select:text}' +
      '.dbg-row{padding:8px 10px;margin-bottom:6px;border-radius:8px;' +
        'background:#1c202c;border-left:3px solid #384156;' +
        'word-break:break-word;white-space:pre-wrap}' +
      '.dbg-row.dbg-error{border-left-color:#f87171;' +
        'background:rgba(248,113,113,.10);color:#fca5a5}' +
      '.dbg-row.dbg-warn{border-left-color:#fbbf24;' +
        'background:rgba(251,191,36,.10);color:#fcd34d}' +
      '.dbg-row.dbg-info{border-left-color:#60a5fa;' +
        'background:rgba(96,165,250,.10);color:#93c5fd}' +
      '.dbg-time{color:#7c85a0;font-size:11px;margin-right:6px}' +
      '.dbg-level{display:inline-block;font-size:10px;font-weight:700;' +
        'padding:1px 6px;border-radius:4px;background:rgba(255,255,255,.08);' +
        'text-transform:uppercase;margin-right:6px}' +
      '.dbg-empty{text-align:center;color:#7c85a0;padding:40px 20px;direction:rtl}';
    var s = document.createElement('style');
    s.id = 'dbgStyle';
    s.type = 'text/css';
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  function ensureUI() {
    if (fab) return;
    injectCSS();
    fab = document.createElement('button');
    fab.id = 'dbgFab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Debug Console');
    fab.innerHTML = '\uD83D\uDC1E<span class="dbg-badge"></span>';
    fab.addEventListener('click', toggle);
    (document.body || document.documentElement).appendChild(fab);
    badge = fab.querySelector('.dbg-badge');

    panel = document.createElement('div');
    panel.id = 'dbgPanel';
    panel.innerHTML =
      '<div class="dbg-head">' +
        '<span class="dbg-title">\uD83D\uDC1E Debug Console</span>' +
        '<div class="dbg-actions">' +
          '<button class="dbg-btn primary" data-dbg="copy">Copy All</button>' +
          '<button class="dbg-btn" data-dbg="clear">Clear</button>' +
          '<button class="dbg-btn" data-dbg="reload">Reload</button>' +
          '<button class="dbg-btn" data-dbg="close">Close</button>' +
        '</div>' +
      '</div>' +
      '<div class="dbg-info">' +
        '<div>Theme: <b id="dbgThemeVal">-</b></div>' +
        '<div>URL: <b id="dbgUrlVal">-</b></div>' +
        '<div>Viewport: <b id="dbgSizeVal">-</b></div>' +
        '<div>Errors: <b id="dbgErrCount">0</b></div>' +
      '</div>' +
      '<div class="dbg-list" id="dbgList"></div>';
    (document.body || document.documentElement).appendChild(panel);
    list = panel.querySelector('#dbgList');

    panel.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== panel && !t.getAttribute) t = t.parentNode;
      if (!t || !t.getAttribute) return;
      var act = t.getAttribute('data-dbg');
      if (act === 'copy') copyAll();
      else if (act === 'clear') { logs.length = 0; unread = 0; updateBadge(); render(); }
      else if (act === 'close') toggle();
      else if (act === 'reload') location.reload();
    });
    updateInfo();
    render();
  }

  function updateInfo() {
    if (!panel) return;
    var themeEl = panel.querySelector('#dbgThemeVal');
    if (themeEl) themeEl.textContent = document.documentElement.getAttribute('data-theme') || 'none';
    var urlEl = panel.querySelector('#dbgUrlVal');
    if (urlEl) urlEl.textContent = location.pathname;
    var sizeEl = panel.querySelector('#dbgSizeVal');
    if (sizeEl) sizeEl.textContent = window.innerWidth + 'x' + window.innerHeight;
    var ec = panel.querySelector('#dbgErrCount');
    if (ec) { var c = 0, i; for (i = 0; i < logs.length; i++) if (logs[i].level === 'error') c++; ec.textContent = String(c); }
  }

  function updateBadge() {
    if (!badge) return;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.className = unread > 0 ? 'dbg-badge on' : 'dbg-badge';
  }

  function render() {
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!logs.length) {
      var empty = document.createElement('div');
      empty.className = 'dbg-empty';
      empty.textContent = 'No messages yet.';
      list.appendChild(empty);
    } else {
      for (var i = 0; i < logs.length; i++) {
        var l = logs[i];
        var row = document.createElement('div');
        row.className = 'dbg-row dbg-' + l.level;
        var time = document.createElement('span');
        time.className = 'dbg-time';
        time.textContent = l.time.toLocaleTimeString();
        var lvl = document.createElement('span');
        lvl.className = 'dbg-level';
        lvl.textContent = l.level;
        var msg = document.createElement('span');
        msg.textContent = l.msg;
        row.appendChild(time); row.appendChild(lvl); row.appendChild(msg);
        list.appendChild(row);
      }
      list.scrollTop = list.scrollHeight;
    }
    updateInfo();
  }

  function toggle() {
    ensureUI();
    opened = !opened;
    panel.className = opened ? 'open' : '';
    if (opened) { unread = 0; updateBadge(); render(); }
  }

  function copyAll() {
    var text = '', i;
    for (i = 0; i < logs.length; i++) {
      var l = logs[i];
      text += '[' + l.time.toLocaleTimeString() + '] [' + l.level.toUpperCase() + '] ' + l.msg + '\n';
    }
    if (!text) text = '(empty)';
    var info = '=== DEBUG INFO ===\n' +
      'Theme: ' + (document.documentElement.getAttribute('data-theme') || 'none') + '\n' +
      'URL: ' + location.href + '\n' +
      'Protocol: ' + location.protocol + '\n' +
      'Viewport: ' + window.innerWidth + 'x' + window.innerHeight + '\n' +
      'UA: ' + navigator.userAgent + '\n' +
      'Time: ' + new Date().toISOString() + '\n==================\n\n';
    var full = info + text;
    function done() {
      var btn = panel.querySelector('[data-dbg="copy"]');
      if (btn) { var old = btn.textContent; btn.textContent = 'Copied!'; setTimeout(function(){ btn.textContent = old; }, 1400); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(full).then(done, function () { fallback(full, done); });
    } else { fallback(full, done); }
  }

  function fallback(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0.01';
    document.body.appendChild(ta); ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (ok && cb) cb();
  }

  window.__dbg = {
    push: push,
    toggle: toggle,
    clear: function () { logs.length = 0; unread = 0; updateBadge(); render(); }
  };

  function init() {
    ensureUI();
    push('info', ['Debug ready | theme=' + (document.documentElement.getAttribute('data-theme') || 'none') +
      ' | proto=' + location.protocol + ' | vp=' + window.innerWidth + 'x' + window.innerHeight]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();