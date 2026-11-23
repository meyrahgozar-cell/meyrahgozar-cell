// ---------------------------------------------------------------------------
// shell.js — rail, topbar, statusbar, dock and global shortcuts.
// ---------------------------------------------------------------------------
import { h, clear, clamp, download, debounce } from '../core/dom.js';
import { icon } from './icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { routeMeta, ROUTES } from '../core/router.js';
import { sfx } from './sounds.js';
import { ACCENTS } from '../core/config.js';
import { openPalette } from './palette.js';
import { openAuth, openAccount } from './authui.js';
import { toast, modal, confirm, popover } from './overlay.js';
import { avatar, traitChip, scoreChip, kpi, emptyState, miniBars } from './bits.js';
import { fmtScore, fmtPct, relTime } from '../core/format.js';
import { radar } from './charts.js';

let routerRef = null;

export function setRouter(router) { routerRef = router; }

// ---------------------------------------------------------------------- rail
export function mountRail() {
  const rail = document.getElementById('rail');
  clear(rail);
  rail.append(
    h('button', {
      class: 'rail__logo',
      title: 'TRIAD /// command palette (⌘K)',
      onClick: () => openPalette({ router: routerRef })
    },
      svgLogo()
    ),
    h('nav', { class: 'rail__nav' },
      ...ROUTES.map((key, i) => {
        const meta = routeMeta[key];
        return h('a', {
          class: 'rail__link',
          href: `#/${key}`,
          dataset: { route: key },
          title: `${meta.title} · ${meta.hint} (${i + 1})`
        }, icon(meta.icon, { size: 19 }), h('span', {}, meta.title));
      })
    ),
    h('div', { class: 'rail__sep' }),
    h('div', { class: 'rail__foot' },
      h('button', { class: 'rail__link', title: 'Command palette (⌘K)', onClick: () => openPalette({ router: routerRef }) },
        icon('terminal', { size: 18 }), h('span', {}, 'Cmd')),
      h('button', {
        class: 'rail__link', id: 'rail-account', title: 'Account',
        onClick: () => (store.session ? openAccount() : openAuth('signin'))
      },
        icon(store.session ? 'user' : 'login', { size: 18 }),
        h('span', {}, store.session ? 'You' : 'Sign in')
      )
    )
  );
  markActiveRoute(location.hash.replace(/^#\/?/, '').split('?')[0] || 'hub');
}

function svgLogo() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  const p1 = document.createElementNS(NS, 'path');
  p1.setAttribute('d', 'M16 3l11 6.3v13.4L16 29 5 22.7V9.3z');
  const p2 = document.createElementNS(NS, 'path');
  p2.setAttribute('d', 'M16 3v26M5 9.3l22 13.4M27 9.3L5 22.7');
  p2.setAttribute('opacity', '.45');
  p2.setAttribute('stroke-width', '.8');
  svg.append(p1, p2);
  return svg;
}

export function markActiveRoute(name) {
  document.querySelectorAll('.rail__link[data-route]').forEach(el => {
    el.classList.toggle('is-active', el.dataset.route === name);
  });
}

// -------------------------------------------------------------------- topbar
export function mountTopbar() {
  const bar = document.getElementById('topbar');
  clear(bar);

  const title = h('div', { class: 'topbar__title' },
    h('h1', {}, icon('cube', { size: 16 }), h('span', { id: 'topbar-title' }, 'Hub')),
    h('span', { class: 'topbar__crumb', id: 'topbar-crumb' }, 'overview')
  );

  const search = h('div', {
    class: 'search', role: 'button', tabindex: '0',
    onClick: () => openPalette({ router: routerRef }),
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') openPalette({ router: routerRef }); }
  },
    icon('search', { size: 14 }),
    h('input', { placeholder: 'Search people, traits, actions', readOnly: 'true', tabindex: '-1' }),
    h('span', { class: 'kbd' }, '⌘K')
  );

  const modePill = h('button', {
    class: 'mode-pill', dataset: { mode: store.mode },
    title: 'Data source',
    onClick: (e) => openSourceMenu(e.currentTarget)
  }, h('i'), h('span', {}, store.mode === 'cloud' ? 'Cloud cube' : 'Local cube'));

  const aiPill = h('button', {
    class: 'mode-pill',
    title: 'AI status',
    onClick: () => routerRef?.go('lab')
  }, icon('ai', { size: 12 }), h('span', {}, 'AI'));

  const dockBtn = h('button', {
    class: 'btn btn--icon btn--sm btn--ghost',
    title: 'Toggle inspector (D)',
    onClick: () => toggleDock()
  }, icon('columns', { size: 15 }));

  const userChip = h('button', {
    class: 'user-chip',
    onClick: () => (store.session ? openAccount() : openAuth('signin'))
  },
    avatar(store.session ? { fullName: store.session.user.email, slug: store.session.user.email, metadata: { hue: 168 } } : { fullName: 'Guest', slug: 'guest', metadata: { hue: 200 } }, { size: 'sm' }),
    h('div', { class: 'user-chip__meta' },
      h('b', {}, store.session ? (store.profile?.display_name || store.session.user.email.split('@')[0]) : 'Guest'),
      h('span', {}, store.session ? store.mode : 'local only')
    )
  );

  bar.append(title, h('div', { class: 'topbar__spacer' }), search, modePill, aiPill, dockBtn, userChip);

  bus.on(EV.DB_STATUS, ({ mode }) => {
    modePill.dataset.mode = mode;
    modePill.querySelector('span').textContent = mode === 'cloud' ? 'Cloud cube' : 'Local cube';
  });
  bus.on(EV.SESSION, () => { mountTopbar(); mountRail(); mountStatus(); renderDock(); });
  bus.on(EV.AI_STATUS, () => { mountAiPill(aiPill); });
  mountAiPill(aiPill);
}

function mountAiPill(pill) {
  import('./ai.js').then(({ hasKey }) => {
    clear(pill);
    pill.append(icon('ai', { size: 12 }), h('span', {}, hasKey() ? 'AI ready' : 'AI off'));
    pill.style.color = hasKey() ? 'var(--accent)' : '';
  }).catch(() => {});
}

function openSourceMenu(anchor) {
  popover(anchor, [
    { label: 'Data source' },
    { text: `Local cube (${store.people.length}p · ${store.scores.length} cells)`, iconName: 'database', onClick: () => store.setSource('local').then(() => refreshAll()) },
    { text: 'Cloud cube (Supabase)', iconName: 'cloud', onClick: () => store.setSource('cloud').then(() => refreshAll()) },
    { text: 'Auto', iconName: 'refresh', onClick: () => store.setSource('auto').then(() => refreshAll()) },
    { separator: true },
    { text: 'Push local → cloud', iconName: 'upload', onClick: () => bus.emit('action:push-cloud') },
    { text: 'Pull cloud → local', iconName: 'download', onClick: () => bus.emit('action:pull-cloud') },
    { text: 'Database console', iconName: 'terminal', onClick: () => bus.emit('action:db-console') }
  ], { width: 250 });
}

export function refreshAll() {
  mountTopbar();
  mountStatus();
  renderDock();
  bus.emit(EV.DATA_CHANGED, { reason: 'refresh' });
}

// ----------------------------------------------------------------- statusbar
export function mountStatus() {
  const bar = document.getElementById('statusbar');
  if (!bar) return;
  clear(bar);
  const cov = store.coverage();
  bar.append(
    h('div', { class: 'statusbar__item statusbar__live' }, h('i'), h('b', {}, store.mode)),
    h('div', { class: 'statusbar__sep' }),
    h('div', { class: 'statusbar__item' }, icon('users', { size: 11 }), h('b', {}, String(store.people.length)), 'people'),
    h('div', { class: 'statusbar__sep' }),
    h('div', { class: 'statusbar__item' }, icon('layers', { size: 11 }), h('b', {}, String(store.traits.length)), 'traits'),
    h('div', { class: 'statusbar__sep' }),
    h('div', { class: 'statusbar__item' }, icon('grid', { size: 11 }), h('b', {}, `${store.scores.length}`), 'cells'),
    h('div', { class: 'statusbar__sep' }),
    h('div', { class: 'statusbar__item' }, icon('target', { size: 11 }), h('b', {}, fmtPct(cov.pct)), 'coverage'),
    h('div', { class: 'statusbar__spacer' }),
    h('div', { class: 'statusbar__item' }, h('span', { id: 'status-saved' }, store.lastSavedAt ? `saved ${relTime(store.lastSavedAt)}` : 'idle')),
    h('button', {
      class: `statusbar__btn ${store.prefs.sound ? 'is-on' : ''}`, title: 'Sound (S)',
      onClick: () => { store.setPref('sound', !store.prefs.sound); sfx.setEnabled(!store.prefs.sound); mountStatus(); }
    }, icon(store.prefs.sound ? 'volume' : 'volumeOff', { size: 12 })),
    h('button', {
      class: `statusbar__btn ${store.prefs.haptics ? 'is-on' : ''}`, title: 'Haptics (H)',
      onClick: () => { store.setPref('haptics', !store.prefs.haptics); sfx.setHaptics(!store.prefs.haptics); mountStatus(); }
    }, icon('vibrate', { size: 12 })),
    h('button', { class: 'statusbar__btn', title: 'Shortcuts (?)', onClick: showShortcuts }, icon('keyboard', { size: 12 }))
  );
}

// ---------------------------------------------------------------------- dock
export function renderDock() {
  const dock = document.getElementById('dock');
  if (!dock) return;
  clear(dock);
  const app = document.getElementById('app');
  if (app.classList.contains('dock-closed')) return;

  const head = h('div', { class: 'dock__head' },
    h('h3', {}, 'Inspector'),
    h('button', { class: 'modal__x', title: 'Close', onClick: () => toggleDock(false) }, icon('x', { size: 15 }))
  );
  const bodyEl = h('div', { class: 'dock__body' });
  dock.append(h('div', { class: 'dock__inner' }, head, bodyEl));

  const sel = store.selection;
  const trait = sel.traitId ? store.cube.traitById.get(sel.traitId) : null;
  const person = sel.personId ? store.cube.personById.get(sel.personId) : null;

  if (person) bodyEl.appendChild(personInspector(person));
  else if (trait) bodyEl.appendChild(traitInspector(trait));
  else bodyEl.appendChild(cubeInspector());
}

function cubeInspector() {
  const o = store.cube.overview();
  const wrap = h('div', { class: 'grid gap-4' });
  wrap.append(
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'cube state'),
      h('div', { class: 'info-grid' },
        h('div', { class: 'info-cell' }, h('span', {}, 'fill'), h('b', {}, fmtPct(o.fill))),
        h('div', { class: 'info-cell' }, h('span', {}, 'mean'), h('b', {}, fmtScore(o.mean))),
        h('div', { class: 'info-cell' }, h('span', {}, 'spread'), h('b', {}, fmtScore(o.sd))),
        h('div', { class: 'info-cell' }, h('span', {}, 'rankers'), h('b', {}, String(o.activeRankers)))
      )
    ),
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'leader'),
      o.top
        ? h('div', { class: 'list-row' },
          avatar(o.top.person, { size: 'sm' }),
          h('div', { class: 'list-row__main' }, h('b', {}, o.top.person.fullName), h('span', {}, 'weighted composite')),
          scoreChip(o.top.score, { min: 0, max: 10, polarity: 1 })
        )
        : h('div', { class: 'hint' }, 'No data yet')
    ),
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'most contested'),
      ...o.mostPolarizing.slice(0, 4).map(p => h('div', { class: 'list-row' },
        traitChip(store.cube.traitById.get(p.traitId), {}),
        h('div', { class: 'list-row__main' }, h('b', {}, store.cube.personById.get(p.targetId)?.fullName || '—'), h('span', {}, `sd ${fmtScore(p.sd)}`))
      ))
    ),
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'quick actions'),
      h('button', { class: 'btn btn--sm full', onClick: () => routerRef?.go('deck') }, icon('layers', { size: 13 }), 'Start deck'),
      h('button', { class: 'btn btn--sm full', onClick: () => routerRef?.go('matrix') }, icon('cube', { size: 13 }), 'Open stacks'),
      h('button', { class: 'btn btn--sm full', onClick: () => bus.emit('action:ai-key') }, icon('ai', { size: 13 }), 'AI settings')
    )
  );
  return wrap;
}

function personInspector(person) {
  const profile = store.cube.personProfile(person.id);
  const comp = store.cube.composite(person.id);
  const inf = store.cube.influence(person.id);
  const rows = profile.traitRows.slice().sort((a, b) => b.receivedMean - a.receivedMean).slice(0, 7);
  const series = [{ values: rows.map(r => r.receivedMean || 0), color: 'var(--accent)' }];
  return h('div', { class: 'grid gap-4' },
    h('div', { class: 'flex items-center gap-3' },
      avatar(person, { size: 'lg' }),
      h('div', { class: 'grow' },
        h('div', { class: 'strong' }, person.fullName),
        h('div', { class: 'mono tiny dim' }, person.jobTitle || person.department || 'person')
      ),
      scoreChip(comp.score)
    ),
    h('div', { class: 'flex gap-2 wrap' },
      h('span', { class: 'pill' }, `${profile.receivedCount} received`),
      h('span', { class: 'pill' }, `${profile.givenCount} given`),
      h('span', { class: 'pill' }, `align ${fmtScore(inf.alignment, 2)}`)
    ),
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'received profile'),
      rows.length ? radar({ labels: rows.map(r => r.trait.name), series, size: 240, max: 10 }) : h('div', { class: 'hint' }, 'No ratings yet')
    ),
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'top dimensions'),
      ...rows.slice(0, 5).map(r => h('div', { class: 'list-row' },
        traitChip(r.trait, {}),
        h('div', { class: 'grow' }),
        scoreChip(r.receivedMean, r.trait)
      ))
    ),
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'actions'),
      h('button', { class: 'btn btn--sm full', onClick: () => routerRef?.go('matrix', { mode: 'target', id: person.id }) }, icon('target', { size: 13 }), 'Target stack'),
      h('button', { class: 'btn btn--sm full', onClick: () => routerRef?.go('matrix', { mode: 'ranker', id: person.id }) }, icon('user', { size: 13 }), 'Ranker stack'),
      h('button', { class: 'btn btn--sm full', onClick: () => routerRef?.go('compare', { a: person.id }) }, icon('split', { size: 13 }), 'Compare')
    )
  );
}

function traitInspector(trait) {
  const lb = store.cube.traitLeaderboard(trait.id).slice(0, 8);
  const s = store.cube.traitStats.get(trait.id);
  return h('div', { class: 'grid gap-4' },
    h('div', { class: 'flex items-center gap-3' },
      traitChip(trait, { lg: true }),
      h('div', { class: 'grow' }),
      scoreChip(s?.mean ?? null, trait)
    ),
    h('div', { class: 'info-grid' },
      h('div', { class: 'info-cell' }, h('span', {}, 'mean'), h('b', {}, fmtScore(s?.mean))),
      h('div', { class: 'info-cell' }, h('span', {}, 'spread'), h('b', {}, fmtScore(s?.sd))),
      h('div', { class: 'info-cell' }, h('span', {}, 'n'), h('b', {}, String(s?.n ?? 0))),
      h('div', { class: 'info-cell' }, h('span', {}, 'weight'), h('b', {}, `×${Number(trait.weight).toFixed(1)}`))
    ),
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'leaderboard'),
      ...lb.map((row, i) => h('div', { class: 'list-row' },
        h('span', { class: 'mono dim', style: { width: '16px' } }, String(i + 1)),
        avatar(row.person, { size: 'sm' }),
        h('div', { class: 'list-row__main' }, h('b', {}, row.person.fullName), h('span', {}, `${row.n} raters · sd ${fmtScore(row.sd)}`)),
        scoreChip(row.mean, trait)
      ))
    ),
    h('div', { class: 'dock__section' },
      h('div', { class: 'eyebrow' }, 'actions'),
      h('button', { class: 'btn btn--sm full', onClick: () => routerRef?.go('matrix', { mode: 'trait', id: trait.id }) }, icon('layers', { size: 13 }), 'Trait stack'),
      h('button', { class: 'btn btn--sm full', onClick: () => routerRef?.go('deck', { trait: trait.id }) }, icon('play', { size: 13 }), 'Rate this trait')
    )
  );
}

export function toggleDock(force) {
  const app = document.getElementById('app');
  const closed = force === undefined ? !app.classList.contains('dock-closed') : !force;
  app.classList.toggle('dock-closed', closed);
  if (!closed) renderDock();
  sfx.play(closed ? 'whooshBack' : 'whoosh', { gain: 0.35 });
}

// ------------------------------------------------------------------ shortcuts
export function installShortcuts(router) {
  const onKey = (e) => {
    const tag = document.activeElement?.tagName;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.activeElement?.isContentEditable;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette({ router }); return; }
    if (meta && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); store.undo().then(ok => { if (ok) { bus.emit(EV.DATA_CHANGED, { reason: 'undo' }); sfx.play('whooshBack', { gain: 0.4 }); } }); return; }
    if (typing) return;
    if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
    if (e.key === 'd') { toggleDock(); return; }
    if (e.key === 's') { store.setPref('sound', !store.prefs.sound); sfx.setEnabled(store.prefs.sound); mountStatus(); return; }
    if (e.key === 'h') { store.setPref('haptics', !store.prefs.haptics); sfx.setHaptics(store.prefs.haptics); mountStatus(); return; }
    if (/^[1-9]$/.test(e.key)) {
      const route = ROUTES[Number(e.key) - 1];
      if (route) router.go(route);
    }
  };
  document.addEventListener('keydown', onKey);
}

export function showShortcuts() {
  const rows = [
    ['⌘K / Ctrl K', 'command palette'],
    ['1 … 9', 'jump to route'],
    ['D', 'toggle inspector'],
    ['S / H', 'sound / haptics'],
    ['E', 'explode stack'],
    ['R', 'reset camera'],
    ['← →', 'move between layers / cards'],
    ['+ / −', 'nudge a focused cell'],
    ['Enter', 'open focused cell or layer'],
    ['⌘Z', 'undo last score'],
    ['?', 'this panel']
  ];
  modal({
    title: 'Keyboard',
    iconName: 'keyboard',
    size: 'sm',
    body: h('div', { class: 'list' },
      ...rows.map(([k, label]) => h('div', { class: 'list-row' },
        h('span', { class: 'kbd', style: { minWidth: '74px', justifyContent: 'center' } }, k),
        h('div', { class: 'list-row__main' }, h('b', {}, label))
      ))
    )
  });
}

export function installShellBus() {
  bus.on('action:toggle-dock', () => toggleDock());
  bus.on('action:toggle-sound', () => { store.setPref('sound', !store.prefs.sound); sfx.setEnabled(store.prefs.sound); mountStatus(); });
  bus.on('action:toggle-haptics', () => { store.setPref('haptics', !store.prefs.haptics); sfx.setHaptics(store.prefs.haptics); mountStatus(); });
  bus.on('action:cycle-accent', () => {
    const keys = Object.keys(ACCENTS);
    const next = keys[(keys.indexOf(store.prefs.accent) + 1) % keys.length];
    store.setPref('accent', next);
    toast({ kind: 'info', text: `Accent · ${ACCENTS[next].name}` });
  });
  bus.on(EV.PREFS, () => mountStatus());
  bus.on(EV.SCORE_SET, debounce(() => mountStatus(), 400));
  bus.on(EV.ROUTE, ({ name }) => {
    markActiveRoute(name);
    const meta = routeMeta[name] || routeMeta.hub;
    const title = document.getElementById('topbar-title');
    const crumb = document.getElementById('topbar-crumb');
    if (title) title.textContent = meta.title;
    if (crumb) crumb.textContent = meta.hint;
    renderDock();
  });
  bus.on('action:undo', () => store.undo());
}
