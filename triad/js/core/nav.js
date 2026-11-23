// ---------------------------------------------------------------------------
// nav.js — navigation helpers usable from any view without prop drilling.
// ---------------------------------------------------------------------------
let router = null;

export function setNavRouter(r) { router = r; }

export function go(name, params = {}) {
  if (router) router.go(name, params);
  else {
    const q = new URLSearchParams(params).toString();
    location.hash = `#/${name}${q ? `?${q}` : ''}`;
  }
}

export function setQuery(params = {}, opts = {}) {
  if (router) router.setQuery(params, opts);
}

export function currentRoute() {
  return location.hash.replace(/^#\/?/, '').split('?')[0] || 'hub';
}

export function routeParam(key, fallback = null) {
  const raw = location.hash.split('?')[1] || '';
  const params = new URLSearchParams(raw);
  return params.get(key) ?? fallback;
}

export function reload() {
  router?.resolve();
}
