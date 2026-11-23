// ---------------------------------------------------------------------------
// router.js — hash router with scroll restoration and view transitions.
// ---------------------------------------------------------------------------
import { bus, EV } from './bus.js';

const ROUTES = ['hub', 'matrix', 'deck', 'people', 'traits', 'insights', 'compare', 'lab', 'settings'];

export const routeMeta = {
  hub: { title: 'Hub', icon: 'grid', hint: 'Overview of the cube' },
  matrix: { title: 'Matrix', icon: 'cube', hint: 'Three slices of the cube' },
  deck: { title: 'Deck', icon: 'layers', hint: 'Rapid scoring' },
  people: { title: 'People', icon: 'users', hint: 'Rankers and targets' },
  traits: { title: 'Traits', icon: 'spark', hint: 'Dimensions of the cube' },
  insights: { title: 'Insights', icon: 'analytics', hint: 'Aggregates and outliers' },
  compare: { title: 'Compare', icon: 'split', hint: 'Head to head' },
  lab: { title: 'AI Lab', icon: 'ai', hint: 'Models, prompts, verdicts' },
  settings: { title: 'Settings', icon: 'gear', hint: 'Sound, haptics, data' }
};

export class Router {
  constructor(root) {
    this.root = root;
    this.current = null;
    this.params = new URLSearchParams();
    this.renderers = new Map();
    this.cache = new Map();
    this.onBeforeNavigate = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  register(name, fn) { this.renderers.set(name, fn); }

  start() { this.resolve(true); }

  parse() {
    const raw = location.hash.replace(/^#\/?/, '') || 'hub';
    const [path, query] = raw.split('?');
    const [name, ...rest] = path.split('/');
    this.params = new URLSearchParams(query || '');
    return { name: ROUTES.includes(name) ? name : 'hub', rest, query: this.params };
  }

  async resolve(first = false) {
    const { name, rest, query } = this.parse();
    if (name === this.current && !first) {
      bus.emit(EV.ROUTE, { name, rest, query, same: true });
      return;
    }
    this.onBeforeNavigate?.(name);
    const previous = this.current;
    this.current = name;
    document.body.dataset.route = name;
    bus.emit(EV.ROUTE, { name, rest, query, previous });

    const render = this.renderers.get(name);
    if (!render) return;
    const view = this.root;
    view.classList.add('route-leaving');
    await new Promise(r => setTimeout(r, 90));
    view.innerHTML = '';
    try {
      const node = await render({ rest, query, params: Object.fromEntries(query.entries()) });
      if (node) view.appendChild(node);
    } catch (err) {
      console.error(`[router:${name}]`, err);
      const box = document.createElement('div');
      box.className = 'route-error';
      box.innerHTML = `<div class="route-error__code">500</div><div class="route-error__msg"></div>`;
      box.querySelector('.route-error__msg').textContent = err.message || 'View failed';
      view.appendChild(box);
    }
    view.classList.remove('route-leaving');
    view.classList.add('route-entering');
    setTimeout(() => view.classList.remove('route-entering'), 420);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  go(name, params = {}) {
    const q = new URLSearchParams(params).toString();
    const target = `#/${name}${q ? `?${q}` : ''}`;
    if (location.hash === target) { this.resolve(); return; }
    location.hash = target;
  }

  setQuery(params = {}, { replace = false } = {}) {
    const q = new URLSearchParams(params).toString();
    const target = `#/${this.current || 'hub'}${q ? `?${q}` : ''}`;
    if (replace) history.replaceState(null, '', target);
    else location.hash = target;
  }

  getParam(key, fallback = null) {
    return this.params.get(key) ?? fallback;
  }
}

export { ROUTES };
