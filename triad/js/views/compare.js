// ---------------------------------------------------------------------------
// compare.js view — head to head: two people across every trait.
// ---------------------------------------------------------------------------
import { h, clear, clamp } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go } from '../core/nav.js';
import { avatar, traitChip, scoreChip, sectionHead, emptyState, kpi } from '../ui/bits.js';
import { radar, bars, chartBox, distribution } from '../ui/charts.js';
import { modal, toast } from '../ui/overlay.js';
import { fmtScore, fmtPct } from '../core/format.js';
import { scoreColor, normalise } from '../core/math.js';
import { sfx } from '../ui/sounds.js';
import { oneShot, buildContext, contextToPrompt, hasKey, renderMarkdownLite } from '../ui/ai.js';

export function compareView({ params = {} } = {}) {
  const root = h('div', { class: 'view__inner' });
  if (store.people.length < 2) {
    root.appendChild(emptyState({ iconName: 'split', title: 'Need two people', text: 'Comparison needs at least two people in the cube.', action: h('button', { class: 'btn btn--primary', onClick: () => bus.emit('action:new-person') }, 'Add person') }));
    return root;
  }
  let aId = params.a || store.people[0].id;
  let bId = params.b || store.people[1].id;
  if (!store.cube.personById.has(aId)) aId = store.people[0].id;
  if (!store.cube.personById.has(bId)) bId = store.people.find(p => p.id !== aId).id;

  const head = h('div', { class: 'page-head' },
    h('div', { class: 'page-head__left' },
      h('div', { class: 'eyebrow' }, 'head to head'),
      h('h1', { class: 'page-title' }, 'Compare')
    ),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn--sm', onClick: () => askVerdict() }, icon('ai', { size: 13 }), 'AI verdict'),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => swap() }, icon('refresh', { size: 13 }), 'Swap')
    )
  );
  root.appendChild(head);

  const duel = h('div', { class: 'grid grid--2 gap-4 mb-4' });
  const chartHost = h('div');
  const tableHost = h('div');
  root.appendChild(duel);
  root.appendChild(chartHost);
  root.appendChild(tableHost);

  const a = store.cube.personById.get(aId);
  const b = store.cube.personById.get(bId);

  function picker(person, side) {
    return h('button', {
      class: 'glass panel pointer',
      style: { textAlign: 'left', display: 'flex', alignItems: 'center', gap: '14px' },
      onClick: () => choosePerson(side)
    },
      avatar(person, { size: 'xl' }),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'eyebrow' }, side === 'a' ? 'person A' : 'person B'),
        h('div', { class: 'display', style: { fontSize: '22px' } }, person.fullName),
        h('div', { class: 'mono tiny dim' }, `${person.jobTitle || '—'} · ${person.department || '—'}`)
      ),
      icon('chevronDown', { size: 15 })
    );
  }

  function paint() {
    const a = store.cube.personById.get(aId);
    const b = store.cube.personById.get(bId);
    clear(duel);
    duel.append(picker(a, 'a'), picker(b, 'b'));

    const compA = store.cube.composite(aId).score;
    const compB = store.cube.composite(bId).score;
    const profA = store.cube.personProfile(aId);
    const profB = store.cube.personProfile(bId);
    const rec = store.cube.reciprocity(aId, bId);
    const agree = store.cube.agreement(aId, bId);

    duel.appendChild(h('div', { class: 'grid grid--2 gap-4', style: { gridColumn: '1 / -1' } },
      h('div', { class: 'grid grid--2 gap-2' },
        kpi({ label: 'Composite A', value: fmtScore(compA), iconName: 'scale', accent: compA >= compB }),
        kpi({ label: 'Composite B', value: fmtScore(compB), iconName: 'scale', accent: compB > compA })
      ),
      h('div', { class: 'grid grid--2 gap-2' },
        kpi({ label: 'Agreement', value: fmtScore(agree.r, 2), iconName: 'network', foot: h('span', { class: 'dim' }, `${agree.n} shared cells`) }),
        kpi({ label: 'Reciprocity', value: fmtPct(rec.balance), iconName: 'split', foot: h('span', { class: 'dim' }, `mean gap ${fmtScore(rec.meanGap)}`) })
      )
    ));

    clear(chartHost);
    const traitNames = store.traits.slice(0, 10);
    const radarChart = radar({
      labels: traitNames.map(t => t.name),
      series: [
        { values: traitNames.map(t => store.cube.consensusOf(t.id, aId)?.mean || 0), color: 'var(--accent)' },
        { values: traitNames.map(t => store.cube.consensusOf(t.id, bId)?.mean || 0), color: 'var(--accent-3)' }
      ],
      size: 320
    });
    chartHost.appendChild(h('div', { class: 'grid grid--2', style: { marginBottom: 'var(--s-4)' } },
      chartBox({
        title: 'Profile overlay',
        iconName: 'radar',
        actions: h('div', { class: 'legend' },
          h('div', { class: 'legend__item' }, h('i', { class: 'legend__swatch', style: { background: 'var(--accent)' } }), a.fullName.split(' ')[0]),
          h('div', { class: 'legend__item' }, h('i', { class: 'legend__swatch', style: { background: 'var(--accent-3)' } }), b.fullName.split(' ')[0])
        ),
        body: h('div', { style: { display: 'grid', placeItems: 'center', height: '340px' } }, radarChart)
      }).el,
      chartBox({
        title: 'Reciprocity',
        iconName: 'split',
        actions: h('span', { class: 'chart__sub' }, 'A→B vs B→A'),
        body: h('div', { style: { padding: '8px' } },
          h('div', { class: 'list' },
            ...rec.rows.slice(0, 10).map(row => h('div', { class: 'list-row' },
              traitChip(row.trait, {}),
              h('div', { class: 'grow' }),
              scoreChip(row.ab, row.trait),
              h('span', { class: 'dim tiny' }, '↔'),
              scoreChip(row.ba, row.trait),
              h('span', { class: `pill ${row.gap !== null && Math.abs(row.gap) >= 1.5 ? 'pill--warn' : ''}` }, row.gap === null ? '—' : `${row.gap > 0 ? '+' : ''}${fmtScore(row.gap)}`)
            ))
          )
        ),
        foot: h('span', { class: 'tiny dim' }, `${rec.asymmetries.length} asymmetric traits`)
      }).el
    ));

    clear(tableHost);
    const rows = store.traits.map(t => {
      const ca = store.cube.consensusOf(t.id, aId);
      const cb = store.cube.consensusOf(t.id, bId);
      return {
        trait: t,
        a: ca?.mean ?? null, aSd: ca?.sd ?? 0,
        b: cb?.mean ?? null, bSd: cb?.sd ?? 0,
        winner: ca && cb ? (ca.mean > cb.mean ? 'a' : cb.mean > ca.mean ? 'b' : 'tie') : null
      };
    });

    tableHost.appendChild(chartBox({
      title: 'Trait by trait',
      iconName: 'list',
      actions: h('span', { class: 'chart__sub' }, `${rows.filter(r => r.winner === 'a').length} – ${rows.filter(r => r.winner === 'b').length}`),
      body: h('div', { style: { maxHeight: '460px', overflowY: 'auto' } },
        h('table', { class: 'vs-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'trait'), h('th', {}, a.fullName.split(' ')[0]), h('th', {}, b.fullName.split(' ')[0]), h('th', {}, 'edge')
          )),
          h('tbody', {},
            ...rows.map(row => h('tr', {},
              h('td', {}, traitChip(row.trait, {})),
              h('td', {}, h('div', { class: 'vs-bar' },
                h('i', { style: { width: `${clamp((row.a || 0) / 10, 0, 1) * 100}%`, background: 'rgba(94,242,214,.5)' } }),
                h('span', {}, row.a === null ? '—' : fmtScore(row.a))
              )),
              h('td', {}, h('div', { class: 'vs-bar' },
                h('i', { style: { width: `${clamp((row.b || 0) / 10, 0, 1) * 100}%`, background: 'rgba(181,123,255,.5)' } }),
                h('span', {}, row.b === null ? '—' : fmtScore(row.b))
              )),
              h('td', {}, row.winner === 'tie' ? h('span', { class: 'pill' }, 'tie') : row.winner ? h('span', { class: `pill ${row.winner === 'a' ? 'pill--accent' : ''}` }, row.winner === 'a' ? a.fullName.split(' ')[0] : b.fullName.split(' ')[0]) : h('span', { class: 'pill' }, '—'))
            ))
          )
        )
      )
    }).el);
  }

  function choosePerson(side) {
    const m = modal({
      title: `Pick person ${side.toUpperCase()}`,
      iconName: 'users',
      size: 'sm',
      body: h('div', { class: 'axis-picker' },
        ...store.people.map(p => h('button', {
          class: 'axis-picker__item',
          onClick: () => {
            if (side === 'a') aId = p.id; else bId = p.id;
            if (aId === bId) {
              const other = store.people.find(x => x.id !== aId);
              if (other) { if (side === 'a') bId = other.id; else aId = other.id; }
            }
            m.close();
            paint();
            sfx.play('pop');
          }
        }, avatar(p, { size: 'sm' }), h('b', {}, p.fullName), h('span', { class: 'mono' }, fmtScore(store.cube.composite(p.id).score))))
      )
    });
  }

  function swap() {
    [aId, bId] = [bId, aId];
    paint();
    sfx.play('whoosh', { gain: 0.4 });
  }

  async function askVerdict() {
    const a = store.cube.personById.get(aId);
    const b = store.cube.personById.get(bId);
    const ctx = buildContext(store.cube);
    const prompt = `Compare ${a.fullName} and ${b.fullName}. For each trait in DATA, say who is ahead and by how much, then give a final verdict naming the two deciding traits. Be decisive and numeric. 200 words max.`;
    const m = modal({
      title: 'AI verdict',
      iconName: 'ai',
      size: 'md',
      body: h('div', { class: 'grid gap-3' },
        h('div', { class: 'ai-typing' }, h('i'), h('i'), h('i')),
        h('div', { class: 'msg__bubble' }, '…')
      )
    });
    const out = m.body.querySelector('.msg__bubble');
    out.textContent = '';
    try {
      const res = await oneShot({
        prompt, kind: 'compare', context: contextToPrompt(ctx), stream: true,
        onDelta: (chunk) => { if (chunk) out.textContent += chunk; }
      });
      out.innerHTML = renderMarkdownLite(res.text || '(empty)');
      sfx.play('chime');
    } catch (err) {
      out.textContent = `Failed: ${err.message}`;
      if (!hasKey()) toast({ kind: 'warn', text: 'Add an OpenRouter key in AI Lab' });
    }
  }

  paint();
  const off = bus.on(EV.DATA_CHANGED, () => {
    if (!document.body.contains(root)) { off(); return; }
    paint();
  });
  return root;
}
