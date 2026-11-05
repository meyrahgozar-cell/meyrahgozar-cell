/* Hash router — tiny, dependency-free, supports params and query strings. */

const routes = [];
let fallback = () => {};
let guard = null;
let currentCtx = { path: '/', params: {}, query: {} };
let started = false;

function compile(pattern) {
  const keys = [];
  const regex = new RegExp('^' + pattern
    .replace(/\//g, '\\/')
    .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { regex, keys, pattern };
}

export function route(pattern, handler, meta = {}) {
  routes.push({ ...compile(pattern), handler, meta });
}

export function setFallback(handler) { fallback = handler; }
export function setGuard(fn) { guard = fn; }

export function parse(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '') || '/';
  const [pathRaw, queryRaw = ''] = raw.split('?');
  const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`;
  const query = {};
  new URLSearchParams(queryRaw).forEach((v, k) => { query[k] = v; });
  return { path: path.replace(/\/+$/, '') || '/', query, raw };
}

export function navigate(path, { replace = false, silent = false } = {}) {
  const target = `#${path.startsWith('/') ? path : '/' + path}`;
  if (replace) {
    const url = window.location.pathname + window.location.search + target;
    window.history.replaceState(null, '', url);
    if (!silent) render();
  } else if (window.location.hash === target) {
    render();
  } else {
    window.location.hash = target;
  }
}

export function current() { return currentCtx; }

export function render() {
  const { path, query, raw } = parse();
  if (guard) {
    const redirect = guard(path);
    if (redirect && redirect !== path) { navigate(redirect, { replace: true }); return; }
  }
  for (const r of routes) {
    const m = path.match(r.regex);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    currentCtx = { path, params, query, raw, meta: r.meta };
    try { r.handler(currentCtx); }
    catch (err) { console.error('[router]', err); fallback(currentCtx, err); }
    return;
  }
  currentCtx = { path, params: {}, query, raw, meta: {} };
  fallback(currentCtx);
}

export function start() {
  if (started) return;
  started = true;
  window.addEventListener('hashchange', render);
  render();
}

export function pathFor(name) {
  const found = routes.find((r) => r.pattern === name);
  return found ? found.pattern : '/';
}
