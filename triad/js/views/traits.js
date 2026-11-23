// ---------------------------------------------------------------------------
// traits.js view — the dimensions of the cube.
// ---------------------------------------------------------------------------
import { h, clear, clamp, debounce } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store, slugifyName } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go } from '../core/nav.js';
import { avatar, traitChip, traitGlyph, scoreChip, sectionHead, emptyState, kpi, miniBars } from '../ui/bits.js';
import { bars, distribution, radar, chartBox } from '../ui/charts.js';
import { modal, drawer, confirm, toast } from '../ui/overlay.js';
import { TRAIT_CATEGORIES, TRAITS } from '../../data/traits.js';
import { fmtScore, fmtPct } from '../core/format.js';
import { scoreColor, normalise } from '../core/math.js';
import { sfx } from '../ui/sounds.js';
import { ICON_NAMES } from '../ui/icons.js';

let viewCleanups = [];
function clearViewListeners() {
  viewCleanups.forEach(fn => { try { fn(); } catch { /* noop */ } });
  viewCleanups = [];
}

export function traitsView({ params = {} } = {}) {
  clearViewListeners();
  const root = h('div', { class: 'view__inner' });
  let category = 'all';
  let query = '';

  const head = h('div', { class: 'page-head' },
    h('div', { class: 'page-head__left' },
      h('div', { class: 'eyebrow' }, 'dimensions'),
      h('h1', { class: 'page-title' }, 'Traits', h('span', { class: 'sup' }, String(store.traits.length).padStart(2, '0')))
    ),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn--sm', onClick: () => openTraitEditor() }, icon('plus', { size: 13 }), 'Trait'),
      h('button', { class: 'btn btn--sm', onClick: () => openLibrary() }, icon('wand', { size: 13 }), 'Library'),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => bus.emit('action:ai-traits') }, icon('ai', { size: 13 }), 'Generate')
    )
  );
  root.appendChild(head);

  const bar = h('div', { class: 'toolbar', style: { marginBottom: '14px' } });
  const gridHost = h('div');
  root.appendChild(bar);
  root.appendChild(gridHost);

  function buildBar() {
    clear(bar);
    const cats = store.traitCategories();
    bar.append(
      h('div', { class: 'toolbar__group' },
        h('button', { class: `chip-btn ${category === 'all' ? 'is-active' : ''}`, onClick: () => { category = 'all'; buildBar(); paint(); } }, 'All'),
        ...cats.map(c => h('button', {
          class: `chip-btn ${category === c.key ? 'is-active' : ''}`,
          style: { color: category === c.key ? c.color : '' },
          onClick: () => { category = c.key; buildBar(); paint(); }
        }, h('i', { style: { width: '6px', height: '6px', borderRadius: '2px', background: c.color } }), c.name, h('span', { class: 'dim' }, String(c.count))))
      ),
      h('div', { class: 'toolbar__spacer' }),
      h('input', {
        class: 'input', placeholder: 'Search traits…', style: { width: '180px', height: '28px' },
        onInput: debounce((e) => { query = e.target.value; paint(); }, 140)
      }),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => openLibrary() }, icon('database', { size: 12 }), 'Install library')
    );
  }

  function pool() {
    let list = store.traits;
    if (category !== 'all') list = list.filter(t => t.category === category);
    if (query) list = list.filter(t => `${t.name} ${t.key} ${t.category} ${t.description || ''}`.toLowerCase().includes(query.toLowerCase()));
    return list;
  }

  function paint() {
    const list = pool();
    clear(gridHost);
    if (!store.traits.length) {
      gridHost.appendChild(emptyState({
        iconName: 'spark', title: 'No traits yet',
        text: 'Traits are the stacks of the property-based view. Install the 96-trait library or write your own.',
        action: h('div', { class: 'flex gap-2' },
          h('button', { class: 'btn btn--primary', onClick: () => openLibrary() }, icon('wand', { size: 13 }), 'Install library'),
          h('button', { class: 'btn', onClick: () => openTraitEditor() }, icon('plus', { size: 13 }), 'New trait'))
      }));
      return;
    }

    const totalWeight = store.traits.reduce((a, t) => a + Number(t.weight || 1), 0);
    const rated = store.traits.filter(t => (store.cube.traitStats.get(t.id)?.n || 0) > 0).length;
    gridHost.appendChild(h('div', { class: 'grid grid--4 mb-4' },
      kpi({ label: 'Dimensions', value: String(store.traits.length), iconName: 'spark', accent: true, foot: h('span', { class: 'dim' }, `${store.traitCategories().length} categories`) }),
      kpi({ label: 'Rated', value: `${rated}/${store.traits.length}`, iconName: 'check', foot: h('span', { class: 'dim' }, 'have at least one cell') }),
      kpi({ label: 'Total weight', value: fmtScore(totalWeight), iconName: 'scale', foot: h('span', { class: 'dim' }, 'composite influence') }),
      kpi({ label: 'Polarity flips', value: String(store.traits.filter(t => t.polarity === -1).length), iconName: 'bolt', foot: h('span', { class: 'dim' }, 'cost dimensions') })
    ));

    const grid = h('div', { class: 'grid grid--auto' });
    for (const trait of list) {
      const s = store.cube.traitStats.get(trait.id);
      const lb = store.cube.traitLeaderboard(trait.id);
      const card = h('article', {
        class: `trait-card ${store.selection.traitId === trait.id ? 'is-selected' : ''}`,
        style: { '--trait-color': trait.color },
        onClick: () => { store.select({ traitId: trait.id, personId: null }); openTrait(trait); }
      },
        h('div', { class: 'trait-card__head' },
          traitGlyph(trait),
          h('div', { class: 'trait-card__name' },
            h('b', {}, trait.name),
            h('span', {}, `${trait.category} · ×${Number(trait.weight).toFixed(1)}${trait.polarity === -1 ? ' · inverted' : ''}`)
          ),
          h('span', { class: 'mono tiny', style: { color: trait.color } }, fmtScore(s?.mean))
        ),
        h('div', { class: 'trait-card__desc' }, trait.description || '—'),
        h('div', { class: 'trait-card__mini' },
          s && s.n ? miniBars(Array.from({ length: 12 }, (_, i) => {
            const row = store.cube.traitLeaderboard(trait.id)[i];
            return row?.mean || 0;
          }), { width: 220, height: 26, color: trait.color }) : null
        ),
        h('div', { class: 'trait-card__stats' },
          h('span', {}, h('b', {}, String(s?.n ?? 0)), ' cells'),
          h('span', {}, 'sd ', h('b', {}, fmtScore(s?.sd))),
          h('span', {}, 'top ', h('b', {}, lb[0]?.person.fullName.split(' ')[0] || '—'))
        )
      );
      grid.appendChild(card);
    }
    gridHost.appendChild(grid);
  }

  function openTrait(trait) {
    const s = store.cube.traitStats.get(trait.id);
    const lb = store.cube.traitLeaderboard(trait.id);
    const body = h('div', { class: 'grid gap-4' },
      h('div', { class: 'flex items-center gap-3' },
        traitGlyph(trait, 46),
        h('div', { class: 'grow' },
          h('h2', { style: { fontSize: '22px' } }, trait.name),
          h('div', { class: 'mono tiny dim' }, `${trait.category} · weight ×${Number(trait.weight).toFixed(1)}`)
        ),
        h('div', { style: { textAlign: 'right' } },
          h('div', { class: 'display', style: { fontSize: '32px', color: trait.color } }, fmtScore(s?.mean)),
          h('div', { class: 'eyebrow' }, 'mean')
        )
      ),
      h('p', { class: 'small muted' }, trait.description || ''),
      h('div', { class: 'info-grid' },
        h('div', { class: 'info-cell' }, h('span', {}, 'cells'), h('b', {}, String(s?.n ?? 0))),
        h('div', { class: 'info-cell' }, h('span', {}, 'spread'), h('b', {}, fmtScore(s?.sd))),
        h('div', { class: 'info-cell' }, h('span', {}, 'min'), h('b', {}, fmtScore(s?.min))),
        h('div', { class: 'info-cell' }, h('span', {}, 'max'), h('b', {}, fmtScore(s?.max)))
      ),
      sectionHead('Leaderboard', { count: `${lb.length} people`, iconName: 'star' }),
      bars(lb.slice(0, 10).map(r => ({
        label: r.person.fullName,
        value: Number((r.mean || 0).toFixed(2)),
        ghost: s?.mean,
        icon: avatar(r.person, { size: 'sm' })
      })), { max: 10, colorFor: row => scoreColor(clamp(row.value / 10, 0, 1), 1) }),
      sectionHead('Distribution', { iconName: 'chart' }),
      distribution({ values: store.scores.filter(x => x.traitId === trait.id).map(x => x.value), bins: 10, height: 100 }),
      h('div', { class: 'flex gap-2 wrap' },
        h('button', { class: 'btn btn--sm', onClick: () => { d.close(); go('matrix', { mode: 'trait', id: trait.id }); } }, icon('layers', { size: 12 }), 'Open stack'),
        h('button', { class: 'btn btn--sm', onClick: () => { d.close(); go('deck', { trait: trait.id }); } }, icon('play', { size: 12 }), 'Rate this trait'),
        h('div', { style: { flex: 1 } }),
        h('button', { class: 'btn btn--sm', onClick: () => { d.close(); openTraitEditor(trait); } }, icon('pencil', { size: 12 }), 'Edit'),
        h('button', {
          class: 'btn btn--sm btn--danger',
          onClick: async () => {
            const ok = await confirm({ title: `Delete ${trait.name}?`, text: 'Every cell in this stack is deleted too.', confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            await store.deleteTrait(trait.id);
            d.close();
            paint();
            toast({ kind: 'ok', text: 'Trait removed' });
          }
        }, icon('trash', { size: 12 }))
      )
    );
    const d = drawer({ title: 'Trait', iconName: trait.icon || 'spark', body });
  }

  function openTraitEditor(trait = null) {
    const editing = Boolean(trait);
    const name = h('input', { class: 'input', value: trait?.name || '', placeholder: 'Trait name', autofocus: 'true' });
    const cat = h('select', { class: 'select' },
      ...TRAIT_CATEGORIES.map(c => h('option', { value: c.key, selected: trait?.category === c.key }, c.name))
    );
    const desc = h('textarea', { class: 'textarea', placeholder: 'What does a high score mean?' }, trait?.description || '');
    const weight = h('input', { type: 'range', min: 0.2, max: 2, step: 0.1, value: trait?.weight ?? 1 });
    weight.style.setProperty('--fill', `${((Number(trait?.weight ?? 1) - 0.2) / 1.8) * 100}%`);
    const weightOut = h('span', { class: 'mono tiny' }, `×${Number(trait?.weight ?? 1).toFixed(1)}`);
    weight.addEventListener('input', () => {
      weightOut.textContent = `×${Number(weight.value).toFixed(1)}`;
      weight.style.setProperty('--fill', `${((Number(weight.value) - 0.2) / 1.8) * 100}%`);
    });
    const polarity = h('select', { class: 'select' },
      h('option', { value: '1', selected: trait?.polarity !== -1 }, 'Higher is better'),
      h('option', { value: '-1', selected: trait?.polarity === -1 }, 'Higher is worse (cost)')
    );
    const color = h('input', { type: 'color', value: trait?.color || '#5ef2d6', style: { width: '46px', height: '32px', background: 'none', border: '1px solid var(--line)', borderRadius: '8px' } });
    const err = h('div', { class: 'hint', style: { color: 'var(--bad)' } });

    const m = modal({
      title: editing ? 'Edit trait' : 'New trait',
      iconName: 'spark',
      size: 'sm',
      body: h('div', { class: 'grid gap-3' },
        h('div', { class: 'field' }, h('label', {}, 'Name'), name),
        h('div', { class: 'grid grid--2 gap-3' },
          h('div', { class: 'field' }, h('label', {}, 'Category'), cat),
          h('div', { class: 'field' }, h('label', {}, 'Colour'), color)
        ),
        h('div', { class: 'field' }, h('label', {}, 'Description'), desc),
        h('div', { class: 'field' }, h('label', {}, 'Weight in composite'), h('div', { class: 'flex items-center gap-3' }, weight, weightOut)),
        h('div', { class: 'field' }, h('label', {}, 'Polarity'), polarity),
        err
      ),
      footer: h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
        h('button', {
          class: 'btn btn--primary',
          onClick: async () => {
            err.textContent = '';
            if (!name.value.trim()) { err.textContent = 'Name required'; return; }
            try {
              const payload = {
                name: name.value.trim(),
                key: slugifyName(name.value),
                category: cat.value,
                description: desc.value.trim(),
                color: color.value,
                weight: Number(weight.value),
                polarity: Number(polarity.value)
              };
              if (editing) await store.updateTrait(trait.id, payload);
              else await store.addTrait(payload);
              m.close();
              paint();
              sfx.play('glass');
              toast({ kind: 'ok', text: editing ? 'Trait updated' : 'Trait created' });
            } catch (e) { err.textContent = e.message; }
          }
        }, editing ? 'Save' : 'Create')
      )
    });
  }

  function openLibrary() {
    const existing = new Set(store.traits.map(t => t.key));
    const chosen = new Set(TRAITS.filter(t => !existing.has(t.key)).map(t => t.key));
    let cat = 'all';
    const listHost = h('div', { class: 'grid gap-2', style: { maxHeight: '46vh', overflowY: 'auto', paddingRight: '4px' } });
    const tabs = h('div', { class: 'flex gap-2 wrap mb-2' });

    function paintList() {
      clear(tabs);
      tabs.append(
        h('button', { class: `chip-btn ${cat === 'all' ? 'is-active' : ''}`, onClick: () => { cat = 'all'; paintList(); paintRows(); } }, 'All', h('span', { class: 'dim' }, String(TRAITS.length))),
        ...TRAIT_CATEGORIES.map(c => h('button', {
          class: `chip-btn ${cat === c.key ? 'is-active' : ''}`,
          onClick: () => { cat = c.key; paintList(); paintRows(); }
        }, h('i', { style: { width: '6px', height: '6px', borderRadius: '2px', background: c.color } }), c.name))
      );
    }
    function paintRows() {
      clear(listHost);
      const pool = TRAITS.filter(t => cat === 'all' || t.category === cat);
      for (const t of pool) {
        const exists = existing.has(t.key);
        const active = chosen.has(t.key);
        listHost.appendChild(h('button', {
          class: `list-row ${exists ? '' : 'pointer'}`,
          style: { width: '100%', textAlign: 'left', opacity: exists ? 0.45 : 1 },
          onClick: () => {
            if (exists) return;
            if (chosen.has(t.key)) chosen.delete(t.key); else chosen.add(t.key);
            paintRows();
          }
        },
          h('div', { class: 'trait-card__glyph', style: { '--trait-color': t.color, width: '26px', height: '26px' } }, icon(t.icon, { size: 13 })),
          h('div', { class: 'list-row__main' }, h('b', {}, t.name), h('span', {}, exists ? 'already installed' : t.category)),
          exists ? icon('check', { size: 13, cls: 'accent' }) : h('div', { class: `switch ${active ? 'is-on' : ''}`, style: { width: '28px', height: '16px', background: active ? 'var(--accent-soft)' : '', borderColor: active ? 'var(--accent-line)' : '' } })
        ));
      }
    }
    paintList();
    paintRows();

    const m = modal({
      title: 'Trait library',
      iconName: 'database',
      size: 'md',
      body: h('div', {},
        h('div', { class: 'flex items-center justify-between mb-3' },
          h('span', { class: 'small muted' }, `${chosen.size} selected of ${TRAITS.length} available`),
          h('div', { class: 'flex gap-2' },
            h('button', { class: 'btn btn--sm btn--ghost', onClick: () => { TRAITS.forEach(t => { if (!existing.has(t.key)) chosen.add(t.key); }); paintRows(); } }, 'All'),
            h('button', { class: 'btn btn--sm btn--ghost', onClick: () => { chosen.clear(); paintRows(); } }, 'None')
          )
        ),
        tabs,
        listHost
      ),
      footer: h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
        h('button', {
          class: 'btn btn--primary',
          onClick: async () => {
            const toInstall = TRAITS.filter(t => chosen.has(t.key) && !existing.has(t.key));
            if (!toInstall.length) { m.close(); return; }
            m.close();
            let n = 0;
            for (const t of toInstall) {
              try {
                await store.addTrait({ key: t.key, name: t.name, category: t.category, description: t.description, icon: t.icon, color: t.color, polarity: t.polarity, weight: t.weight, isCore: t.core });
                n++;
              } catch (e) { if (!String(e.message).includes('already')) console.warn(e); }
            }
            paint();
            sfx.play('milestone');
            toast({ kind: 'ok', text: `${n} traits installed` });
          }
        }, `Install ${chosen.size}`)
      )
    });
  }

  viewCleanups.push(bus.on('action:new-trait', () => openTraitEditor()));
  viewCleanups.push(bus.on('action:install-library', () => openLibrary()));
  buildBar();
  paint();
  if (params.focus) {
    const trait = store.cube.traitById.get(params.focus);
    if (trait) setTimeout(() => openTrait(trait), 60);
  }
  const off = bus.on(EV.DATA_CHANGED, debounce(() => {
    if (!document.body.contains(root)) { off(); return; }
    buildBar();
    paint();
  }, 250));
  return root;
}
