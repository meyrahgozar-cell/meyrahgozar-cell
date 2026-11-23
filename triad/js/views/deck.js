// ---------------------------------------------------------------------------
// deck.js view — rapid pairwise scoring.
// ---------------------------------------------------------------------------
import { h, clear, clamp, debounce } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go } from '../core/nav.js';
import { avatar, traitChip, sectionHead, emptyState, kpi, pill } from '../ui/bits.js';
import { createDeck } from '../ui/deck.js';
import { modal, toast } from '../ui/overlay.js';
import { fmtScore, fmtPct } from '../core/format.js';
import { sfx } from '../ui/sounds.js';
import { scoreColor, normalise } from '../core/math.js';
import { sparkline } from '../ui/charts.js';

let deckInstance = null;

export function deckView({ params = {} } = {}) {
  deckInstance?.destroy();
  deckInstance = null;
  const root = h('div', { class: 'view__inner' });

  if (!store.people.length || !store.traits.length) {
    root.appendChild(emptyState({
      iconName: 'layers', title: 'Nothing to rate',
      text: 'Add people and traits to build a deck.',
      action: h('button', { class: 'btn btn--primary', onClick: () => bus.emit('action:install-library') }, 'Install traits')
    }));
    return root;
  }

  let rankerId = params.ranker || store.deckSession?.rankerId || store.people[0].id;
  if (!store.people.some(p => p.id === rankerId)) rankerId = store.people[0].id;
  let selectedTraits = params.trait ? [params.trait] : (store.deckSession?.traitIds || store.traits.slice(0, 8).map(t => t.id));
  let limit = 40;
  let onlyUnrated = true;

  const head = h('div', { class: 'page-head' },
    h('div', { class: 'page-head__left' },
      h('div', { class: 'eyebrow' }, 'rapid scoring · swipe or keys'),
      h('h1', { class: 'page-title' }, 'Deck', h('span', { class: 'sup' }, '◀ ▶'))
    ),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn--sm', onClick: () => openRankerPicker() }, icon('user', { size: 12 }), 'Ranker'),
      h('button', { class: 'btn btn--sm', onClick: () => openTraitPicker() }, icon('spark', { size: 12 }), 'Traits'),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => go('matrix') }, icon('cube', { size: 12 }), 'Matrix')
    )
  );
  root.appendChild(head);

  const shell = h('div', { class: 'deck-shell' });
  const stageHost = h('div');
  const side = h('div', { class: 'deck-side' });
  shell.append(stageHost, side);
  root.appendChild(shell);

  function ranker() { return store.cube.personById.get(rankerId); }

  function build() {
    clear(stageHost);
    clear(side);
    deckInstance?.destroy();
    const rankerPerson = ranker();
    const cards = createDeck({
      cube: store.cube,
      rankerId,
      traitIds: selectedTraits,
      limit,
      onlyUnrated,
      onRate: async ({ traitId, rankerId: rk, targetId, value, undo }) => {
        try {
          if (value === null || value === undefined) return;
          await store.setScore({ traitId, rankerId: rk, targetId, value, source: 'deck' });
          store.setDeckSession({ rankerId, traitIds: selectedTraits, at: new Date().toISOString(), lastValue: value });
          updateSide();
        } catch (err) { toast({ kind: 'error', text: err.message }); }
      },
      onFinish: (stats) => {
        if (stats?.done) showSummary(stats);
      }
    });
    deckInstance = cards;
    stageHost.appendChild(cards.el);
    buildSide();
    updateSide();
  }

  function buildSide() {
    const rankerPerson = ranker();
    const profile = store.cube.personProfile(rankerId);
    const remaining = store.traits.reduce((acc, t) => acc + store.people.filter(p => p.id !== rankerId && !store.cube.hasCell(t.id, rankerId, p.id)).length, 0);

    side.append(
      h('div', { class: 'glass panel' },
        h('div', { class: 'flex items-center gap-3' },
          avatar(rankerPerson, { size: 'lg' }),
          h('div', { class: 'grow', style: { minWidth: 0 } },
            h('div', { class: 'strong truncate' }, rankerPerson.fullName),
            h('div', { class: 'mono tiny dim' }, 'session ranker')
          ),
          h('button', { class: 'btn btn--icon btn--sm btn--ghost', title: 'Switch ranker', onClick: openRankerPicker }, icon('refresh', { size: 13 }))
        ),
        h('div', { class: 'divider', style: { margin: '12px 0' } }),
        h('div', { class: 'grid grid--2 gap-2' },
          miniStat(String(profile.givenCount), 'given'),
          miniStat(String(remaining), 'queued'),
          miniStat(fmtScore(profile.givenMean), 'your mean'),
          miniStat(fmtPct(profile.coverage), 'coverage')
        )
      ),
      h('div', { class: 'glass panel' },
        h('div', { class: 'eyebrow mb-2' }, 'deck options'),
        h('div', { class: 'set-row' },
          h('div', { class: 'set-row__main' }, h('b', {}, 'Only unrated'), h('span', {}, 'skip cells you already scored')),
          h('button', {
            class: 'switch', role: 'switch', 'aria-checked': String(onlyUnrated),
            onClick: (e) => { onlyUnrated = !onlyUnrated; e.currentTarget.setAttribute('aria-checked', String(onlyUnrated)); build(); }
          })
        ),
        h('div', { class: 'set-row' },
          h('div', { class: 'set-row__main' }, h('b', {}, 'Session size'), h('span', {}, `${limit} cards`)),
          h('input', {
            type: 'range', min: 10, max: 120, step: 10, value: limit, style: { width: '110px' },
            onInput: (e) => { limit = Number(e.target.value); e.target.style.setProperty('--fill', `${((limit - 10) / 110) * 100}%`); build(); }
          })
        ),
        h('div', { class: 'flex gap-2 mt-3' },
          h('button', { class: 'btn btn--sm full', onClick: openTraitPicker }, `${selectedTraits.length} traits`)
        )
      ),
      h('div', { class: 'glass panel' },
        h('div', { class: 'eyebrow mb-2' }, 'per-trait progress'),
        h('div', { class: 'deck-stack-list' },
          ...store.traits.slice(0, 10).map(t => {
            const total = store.people.length - 1;
            const done = store.people.filter(p => p.id !== rankerId && store.cube.hasCell(t.id, rankerId, p.id)).length;
            return h('div', { class: 'deck-stack-list__row', title: `${t.name}: ${done}/${total}` },
              traitChip(t, {}),
              h('div', { class: 'deck-stack-list__bar' }, h('i', { style: { width: `${(done / Math.max(total, 1)) * 100}%`, background: t.color } })),
              h('span', { class: 'mono' }, `${done}/${total}`)
            );
          })
        )
      )
    );
  }

  function updateSide() {
    const row = side.querySelector('.grid--2');
    if (!row) return;
    const profile = store.cube.personProfile(rankerId);
    const remaining = store.traits.reduce((acc, t) => acc + store.people.filter(p => p.id !== rankerId && !store.cube.hasCell(t.id, rankerId, p.id)).length, 0);
    row.children[0].querySelector('b').textContent = String(profile.givenCount);
    row.children[1].querySelector('b').textContent = String(remaining);
    row.children[2].querySelector('b').textContent = fmtScore(profile.givenMean);
    row.children[3].querySelector('b').textContent = fmtPct(profile.coverage);
  }

  function miniStat(value, label) {
    return h('div', { class: 'info-cell' }, h('span', {}, label), h('b', {}, value));
  }

  function openRankerPicker() {
    const m = modal({
      title: 'Who is rating?',
      iconName: 'user',
      size: 'sm',
      body: h('div', { class: 'axis-picker' },
        ...store.people.map(p => h('button', {
          class: `axis-picker__item ${p.id === rankerId ? 'is-active' : ''}`,
          onClick: () => { rankerId = p.id; m.close(); build(); }
        },
          avatar(p, { size: 'sm' }),
          h('b', {}, p.fullName),
          h('span', { class: 'mono' }, `${store.cube.personProfile(p.id).givenCount} given`)
        ))
      )
    });
  }

  function openTraitPicker() {
    const chosen = new Set(selectedTraits);
    let modalRef = null;
    const byCat = new Map();
    for (const t of store.traits) {
      if (!byCat.has(t.category)) byCat.set(t.category, []);
      byCat.get(t.category).push(t);
    }
    const body = h('div', { class: 'grid gap-4' },
      ...Array.from(byCat.entries()).map(([cat, traits]) => h('div', {},
        h('div', { class: 'eyebrow mb-2' }, cat),
        h('div', { class: 'flex gap-2 wrap' },
          ...traits.map(t => {
            const active = chosen.has(t.id);
            return h('button', {
              class: `chip-btn ${active ? 'is-active' : ''}`,
              style: active ? { borderColor: t.color, color: t.color } : null,
              onClick: (e) => {
                if (chosen.has(t.id)) chosen.delete(t.id); else chosen.add(t.id);
                e.currentTarget.classList.toggle('is-active');
                if (chosen.has(t.id)) { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.color = t.color; }
                else { e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = ''; }
              }
            }, icon(t.icon || 'spark', { size: 12 }), t.name);
          })
        )
      ))
    );
    modalRef = modal({
      title: 'Traits in this deck',
      iconName: 'spark',
      size: 'md',
      body,
      footer: h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn', onClick: () => { selectedTraits = store.traits.map(t => t.id); modalRef.close(); build(); } }, 'Select all'),
        h('button', { class: 'btn btn--primary', onClick: () => { selectedTraits = [...chosen]; modalRef.close(); build(); } }, 'Apply')
      )
    });
  }

  function showSummary(stats) {
    modal({
      title: 'Session complete',
      iconName: 'check',
      size: 'sm',
      body: h('div', { class: 'grid gap-3' },
        h('div', { class: 'grid grid--2 gap-2' },
          h('div', { class: 'info-cell' }, h('span', {}, 'written'), h('b', {}, String(stats.rated))),
          h('div', { class: 'info-cell' }, h('span', {}, 'skipped'), h('b', {}, String(stats.skipped)))
        ),
        h('p', { class: 'small muted' }, 'The cube, the consensus views and every aggregate just moved.')
      ),
      footer: h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn', onClick: () => go('insights') }, 'See insights'),
        h('button', { class: 'btn btn--primary', onClick: () => { build(); } }, 'Another pass')
      )
    });
    sfx.play('milestone');
  }

  build();

  const off = bus.on(EV.DATA_CHANGED, debounce((p) => {
    if (!document.body.contains(root)) { off(); return; }
    if (p?.reason === 'score') updateSide();
  }, 400));
  bus.once(EV.ROUTE, () => { deckInstance?.destroy(); });

  return root;
}
