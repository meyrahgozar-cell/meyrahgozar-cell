// ---------------------------------------------------------------------------
// people.js view — roster, person editor, profile drawer.
// ---------------------------------------------------------------------------
import { h, clear, clamp, debounce } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store, slugifyName } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go } from '../core/nav.js';
import { avatar, traitChip, scoreChip, sectionHead, emptyState, kpi, gradeBadge, miniBars } from '../ui/bits.js';
import { radar, bars, distribution, chartBox, agreementGrid } from '../ui/charts.js';
import { modal, drawer, confirm, toast } from '../ui/overlay.js';
import { fmtScore, fmtPct, relTime } from '../core/format.js';
import { reliabilityGrade, scoreColor, normalise } from '../core/math.js';
import { sfx } from '../ui/sounds.js';

// view-scoped listeners; cleared when the view is rebuilt so modals never stack
let viewCleanups = [];
function clearViewListeners() {
  viewCleanups.forEach(fn => { try { fn(); } catch { /* noop */ } });
  viewCleanups = [];
}

export function peopleView({ params = {} } = {}) {
  clearViewListeners();
  const root = h('div', { class: 'view__inner' });
  let query = '';
  let dept = 'all';
  let sortKey = 'composite';

  const head = h('div', { class: 'page-head' },
    h('div', { class: 'page-head__left' },
      h('div', { class: 'eyebrow' }, 'rankers and targets'),
      h('h1', { class: 'page-title' }, 'People', h('span', { class: 'sup' }, String(store.people.length).padStart(2, '0')))
    ),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn--sm', onClick: () => openPersonEditor() }, icon('plus', { size: 13 }), 'Person'),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => go('deck') }, icon('layers', { size: 13 }), 'Rate')
    )
  );
  root.appendChild(head);

  const toolbar = h('div', { class: 'toolbar', style: { marginBottom: '14px' } });
  const gridHost = h('div');
  root.appendChild(toolbar);
  root.appendChild(gridHost);

  const searchInput = h('input', {
    class: 'input', placeholder: 'Filter people…', style: { width: '220px', height: '28px' },
    onInput: debounce((e) => { query = e.target.value; paint(); }, 140)
  });

  function buildToolbar() {
    clear(toolbar);
    toolbar.append(
      h('div', { class: 'toolbar__group' }, icon('search', { size: 13, cls: 'dim' }), searchInput),
      h('div', { class: 'toolbar__sep' }),
      h('select', {
        class: 'select', style: { height: '28px', width: '150px' },
        onChange: (e) => { dept = e.target.value; paint(); }
      },
        h('option', { value: 'all' }, 'All departments'),
        ...store.departments().map(d => h('option', { value: d }, d))
      ),
      h('div', { class: 'toolbar__sep' }),
      h('div', { class: 'seg' },
        ...[['composite', 'Rank'], ['name', 'A–Z'], ['given', 'Given'], ['received', 'Received']].map(([key, label]) =>
          h('button', {
            class: sortKey === key ? 'is-active' : '',
            onClick: (e) => {
              sortKey = key;
              [...e.currentTarget.parentElement.children].forEach(c => c.classList.remove('is-active'));
              e.currentTarget.classList.add('is-active');
              paint();
            }
          }, label))
      ),
      h('div', { class: 'toolbar__spacer' }),
      h('span', { class: 'pill' }, `${store.people.length} people`),
      h('span', { class: 'pill' }, `${store.scores.length} cells`)
    );
  }

  function rows() {
    let list = store.filteredPeople();
    if (query) list = list.filter(p => [p.fullName, p.jobTitle, p.department, ...(p.tags || [])].join(' ').toLowerCase().includes(query.toLowerCase()));
    if (dept !== 'all') list = list.filter(p => p.department === dept);
    const mapped = list.map(p => {
      const comp = store.cube.composite(p.id);
      const profile = store.cube.personProfile(p.id);
      return { person: p, comp, profile };
    });
    if (sortKey === 'composite') mapped.sort((a, b) => b.comp.score - a.comp.score);
    if (sortKey === 'name') mapped.sort((a, b) => a.person.fullName.localeCompare(b.person.fullName));
    if (sortKey === 'given') mapped.sort((a, b) => b.profile.givenCount - a.profile.givenCount);
    if (sortKey === 'received') mapped.sort((a, b) => b.profile.receivedCount - a.profile.receivedCount);
    return mapped;
  }

  function paint() {
    const data = rows();
    clear(gridHost);
    if (!data.length) {
      gridHost.appendChild(emptyState({
        iconName: 'users', title: 'No people match',
        text: 'Try a different filter, or add a new person.',
        action: h('button', { class: 'btn btn--primary', onClick: () => openPersonEditor() }, 'Add person')
      }));
      return;
    }

    const totals = data.reduce((acc, r) => {
      acc.given += r.profile.givenCount;
      acc.received += r.profile.receivedCount;
      acc.score += r.comp.score;
      return acc;
    }, { given: 0, received: 0, score: 0 });

    gridHost.appendChild(h('div', { class: 'grid grid--4 mb-4' },
      kpi({ label: 'Roster', value: String(data.length), iconName: 'users', accent: true, foot: h('span', { class: 'dim' }, `${store.departments().length} departments`) }),
      kpi({ label: 'Mean composite', value: fmtScore(totals.score / data.length), iconName: 'scale', foot: h('span', { class: 'dim' }, 'weighted consensus') }),
      kpi({ label: 'Scores given', value: String(totals.given), iconName: 'arrowUp', foot: h('span', { class: 'dim' }, 'outbound') }),
      kpi({ label: 'Scores received', value: String(totals.received), iconName: 'arrowDown', foot: h('span', { class: 'dim' }, 'inbound') })
    ));

    const cards = h('div', { class: 'grid grid--auto' });
    for (const { person, comp, profile } of data) {
      const rel = reliabilityGrade({ n: profile.receivedCount, sd: profile.polarization });
      const card = h('article', {
        class: `person-card ${store.selection.personId === person.id ? 'is-selected' : ''}`,
        onClick: () => { store.select({ personId: person.id, traitId: null }); openProfile(person); }
      },
        h('div', { class: 'person-card__top' },
          avatar(person, { size: 'lg' }),
          h('div', { class: 'person-card__id' },
            h('b', {}, person.fullName),
            h('span', {}, person.jobTitle || person.department || 'person')
          ),
          h('div', { class: 'person-card__score' }, h('b', {}, fmtScore(comp.score)), h('span', {}, '/10'))
        ),
        h('div', { class: 'flex gap-1 wrap' },
          h('span', { class: 'pill' }, `${profile.receivedCount} received`),
          h('span', { class: 'pill' }, `${profile.givenCount} given`),
          gradeBadge(rel)
        ),
        h('div', { class: 'person-card__bars' },
          ...profile.traitRows.slice().sort((a, b) => b.receivedMean - a.receivedMean).slice(0, 4).map(tr =>
            h('div', { class: 'person-card__bar' },
              h('span', { title: tr.trait.name }, tr.trait.name),
              h('i', {}, h('span', { style: { display: 'block', height: '100%', width: `${clamp(tr.receivedMean / 10, 0, 1) * 100}%`, background: tr.trait.color, borderRadius: '2px' } })),
              h('em', {}, fmtScore(tr.receivedMean))
            )
          )
        ),
        h('div', { class: 'person-card__foot' },
          h('span', { class: 'mono tiny dim' }, `${fmtPct(profile.coverage)} rated`),
          h('span', { class: 'mono tiny dim' }, `gap ${fmtScore(profile.givenMean - profile.receivedMean, 1)}`)
        )
      );
      cards.appendChild(card);
    }
    gridHost.appendChild(cards);
  }

  function openProfile(person) {
    const profile = store.cube.personProfile(person.id);
    const comp = store.cube.composite(person.id);
    const influence = store.cube.influence(person.id);
    const body = h('div', { class: 'grid gap-4' });

    const rows = profile.traitRows.slice().sort((a, b) => b.receivedMean - a.receivedMean);
    body.append(
      h('div', { class: 'flex items-center gap-3' },
        avatar(person, { size: 'xl' }),
        h('div', { class: 'grow' },
          h('h2', { style: { fontSize: '22px' } }, person.fullName),
          h('div', { class: 'mono tiny dim' }, `${person.jobTitle || '—'} · ${person.department || '—'}`),
          h('div', { class: 'flex gap-1 mt-2 wrap' }, ...(person.tags || []).map(t => h('span', { class: 'tag' }, t)))
        ),
        h('div', { style: { textAlign: 'right' } },
          h('div', { class: 'display', style: { fontSize: '34px', color: 'var(--accent)' } }, fmtScore(comp.score)),
          h('div', { class: 'eyebrow' }, 'composite')
        )
      ),
      h('div', { class: 'info-grid' },
        h('div', { class: 'info-cell' }, h('span', {}, 'received'), h('b', {}, String(profile.receivedCount))),
        h('div', { class: 'info-cell' }, h('span', {}, 'given'), h('b', {}, String(profile.givenCount))),
        h('div', { class: 'info-cell' }, h('span', {}, 'polarisation'), h('b', {}, fmtScore(profile.polarization))),
        h('div', { class: 'info-cell' }, h('span', {}, 'alignment'), h('b', {}, fmtScore(influence.alignment, 2)))
      ),
      h('div', { class: 'chart__body', style: { height: '260px' } },
        radar({
          labels: rows.slice(0, 10).map(r => r.trait.name),
          series: [{ values: rows.slice(0, 10).map(r => r.receivedMean || 0), color: 'var(--accent)' }],
          size: 260
        })
      ),
      sectionHead('Per-trait detail', { count: `${rows.length} traits`, iconName: 'layers' }),
      h('div', { class: 'list' },
        ...rows.map(r => h('div', { class: 'list-row' },
          traitChip(r.trait, {}),
          h('div', { class: 'grow' }),
          h('span', { class: 'mono tiny dim' }, `given ${fmtScore(r.givenMean)}`),
          scoreChip(r.receivedMean, r.trait),
          h('span', { class: `pill ${r.spread > 2 ? 'pill--warn' : ''}` }, `±${fmtScore(r.spread)}`)
        ))
      ),
      h('div', { class: 'flex gap-2 wrap' },
        h('button', { class: 'btn btn--sm', onClick: () => { d.close(); go('matrix', { mode: 'target', id: person.id }); } }, icon('target', { size: 12 }), 'Target stack'),
        h('button', { class: 'btn btn--sm', onClick: () => { d.close(); go('matrix', { mode: 'ranker', id: person.id }); } }, icon('user', { size: 12 }), 'Ranker stack'),
        h('button', { class: 'btn btn--sm', onClick: () => { d.close(); go('deck', { ranker: person.id }); } }, icon('layers', { size: 12 }), 'Rate as them'),
        h('button', { class: 'btn btn--sm', onClick: () => { d.close(); go('compare', { a: person.id }); } }, icon('split', { size: 12 }), 'Compare'),
        h('div', { style: { flex: 1 } }),
        h('button', { class: 'btn btn--sm', onClick: () => { d.close(); openPersonEditor(person); } }, icon('pencil', { size: 12 }), 'Edit'),
        h('button', {
          class: 'btn btn--sm btn--danger', onClick: async () => {
            const ok = await confirm({ title: `Delete ${person.fullName}?`, text: 'This removes the person and every score they gave or received.', confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            await store.deletePerson(person.id);
            d.close();
            paint();
            toast({ kind: 'ok', text: 'Person removed' });
          }
        }, icon('trash', { size: 12 }))
      )
    );

    const d = drawer({ title: 'Profile', iconName: 'user', body });
  }

  function openPersonEditor(person = null) {
    const editing = Boolean(person);
    const name = h('input', { class: 'input', value: person?.fullName || '', placeholder: 'Full name', autofocus: 'true' });
    const role = h('input', { class: 'input', value: person?.jobTitle || '', placeholder: 'Role' });
    const department = h('input', { class: 'input', value: person?.department || '', placeholder: 'Department', list: 'dept-list' });
    const email = h('input', { class: 'input', value: person?.email || '', placeholder: 'email (optional)' });
    const bio = h('textarea', { class: 'textarea', placeholder: 'Short bio' }, person?.bio || '');
    const tags = h('input', { class: 'input', value: (person?.tags || []).join(', '), placeholder: 'tags, comma separated' });
    const err = h('div', { class: 'hint', style: { color: 'var(--bad)' } });

    const m = modal({
      title: editing ? 'Edit person' : 'New person',
      iconName: 'user',
      size: 'sm',
      body: h('div', { class: 'grid gap-3' },
        h('datalist', { id: 'dept-list' }, ...store.departments().map(d => h('option', { value: d }))),
        h('div', { class: 'field' }, h('label', {}, 'Name'), name),
        h('div', { class: 'grid grid--2 gap-3' },
          h('div', { class: 'field' }, h('label', {}, 'Role'), role),
          h('div', { class: 'field' }, h('label', {}, 'Department'), department)
        ),
        h('div', { class: 'field' }, h('label', {}, 'Email'), email),
        h('div', { class: 'field' }, h('label', {}, 'Tags'), tags),
        h('div', { class: 'field' }, h('label', {}, 'Bio'), bio),
        err
      ),
      footer: h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn', onClick: () => m.close() }, 'Cancel'),
        h('button', {
          class: 'btn btn--primary',
          onClick: async () => {
            err.textContent = '';
            if (!name.value.trim()) { err.textContent = 'Name is required'; return; }
            try {
              const payload = {
                fullName: name.value.trim(),
                jobTitle: role.value.trim() || null,
                department: department.value.trim() || null,
                email: email.value.trim() || null,
                bio: bio.value.trim() || null,
                tags: tags.value.split(',').map(t => t.trim()).filter(Boolean)
              };
              if (editing) await store.updatePerson(person.id, payload);
              else await store.addPerson({ ...payload, slug: slugifyName(payload.fullName) });
              m.close();
              paint();
              sfx.play('glass');
              toast({ kind: 'ok', text: editing ? 'Person updated' : 'Person added' });
            } catch (e) {
              err.textContent = e.message;
            }
          }
        }, editing ? 'Save' : 'Create')
      )
    });
  }

  viewCleanups.push(bus.on('action:new-person', () => openPersonEditor()));
  buildToolbar();
  paint();
  if (params.focus) {
    const person = store.cube.personById.get(params.focus);
    if (person) setTimeout(() => openProfile(person), 60);
  }

  const off = bus.on(EV.DATA_CHANGED, debounce(() => {
    if (!document.body.contains(root)) { off(); return; }
    buildToolbar();
    paint();
  }, 250));
  return root;
}
