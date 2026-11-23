// ---------------------------------------------------------------------------
// insights.js view — the aggregate layer: every statistic the cube can produce.
// ---------------------------------------------------------------------------
import { h, clear, clamp, download } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go } from '../core/nav.js';
import { avatar, traitChip, scoreChip, sectionHead, kpi, gradeBadge, emptyState, miniBars } from '../ui/bits.js';
import { bars, radar, scatter3d, heatGrid, distribution, treemap, donut, chartBox, agreementGrid, lineChart } from '../ui/charts.js';
import { fmtScore, fmtPct, fmtNum } from '../core/format.js';
import { reliabilityGrade, scoreColor, normalise, polarise } from '../core/math.js';
import { sfx } from '../ui/sounds.js';
import { toast, modal } from '../ui/overlay.js';
import { oneShot, buildContext, contextToPrompt, hasKey, renderMarkdownLite } from '../ui/ai.js';

let scatter = null;

export function insightsView() {
  const root = h('div', { class: 'view__inner' });
  scatter?.destroy();
  scatter = null;

  if (!store.scores.length) {
    root.appendChild(emptyState({
      iconName: 'analytics', title: 'No signal yet',
      text: 'Insights need ratings. Start a deck or fill a matrix slice.',
      action: h('button', { class: 'btn btn--primary', onClick: () => go('deck') }, icon('layers', { size: 13 }), 'Open deck')
    }));
    return root;
  }

  const o = store.cube.overview();
  const cov = store.coverage();

  root.appendChild(h('div', { class: 'page-head' },
    h('div', { class: 'page-head__left' },
      h('div', { class: 'eyebrow' }, 'aggregate layer'),
      h('h1', { class: 'page-title' }, 'Insights', h('span', { class: 'sup' }, fmtPct(cov.pct, 0)))
    ),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn--sm', onClick: () => narrate() }, icon('ai', { size: 13 }), 'Narrate'),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => downloadJSON() }, icon('download', { size: 13 }), 'Export'),
      h('button', { class: 'btn btn--sm btn--ghost', onClick: () => go('compare') }, icon('split', { size: 13 }), 'Compare')
    )
  ));

  root.appendChild(h('div', { class: 'grid grid--4 mb-4' },
    kpi({ label: 'Cells', value: String(o.cells), iconName: 'grid', accent: true, foot: h('span', { class: 'dim' }, `of ${fmtNum(o.possible, 0)} possible`) }),
    kpi({ label: 'Consensus mean', value: fmtScore(o.mean), iconName: 'scale', foot: h('span', { class: 'dim' }, `median ${fmtScore(o.median)}`) }),
    kpi({ label: 'Dispersion', value: fmtScore(o.sd), iconName: 'pulse', foot: h('span', { class: 'dim' }, `range ${fmtScore(o.max - o.min)}`) }),
    kpi({ label: 'Contested pairs', value: String(o.mostPolarizing.length), iconName: 'bolt', foot: h('span', { class: 'dim' }, 'sd > 1.2') })
  ));

  // ----------------------------------------------------------- composite bars
  const composite = chartBox({
    title: 'Weighted composite ranking',
    iconName: 'analytics',
    height: 330,
    actions: h('span', { class: 'chart__sub' }, 'polarity-aware'),
    body: bars(o.ranked.map(r => ({
      label: r.person.fullName,
      value: Number(r.score.toFixed(2)),
      ghost: o.mean,
      icon: avatar(r.person, { size: 'sm' })
    })), {
      max: 10,
      colorFor: row => scoreColor(clamp(row.value / 10, 0, 1), 1),
      onClick: row => {
        const person = store.people.find(p => p.fullName === row.label);
        if (person) go('people', { focus: person.id });
      }
    })
  });

  // ------------------------------------------------------------- scatter 3D
  const embed = store.cube.embedPeople();
  const scatterChart = chartBox({
    title: 'Trait-space embedding',
    iconName: 'cube',
    height: 330,
    actions: h('span', { class: 'chart__sub' }, '3 components'),
    body: h('div', { style: { height: '100%' } })
  });
  scatter = scatter3d({
    points: embed.map(e => ({
      x: e.x, y: e.y, z: e.z,
      label: e.person.fullName,
      meta: `comp ${fmtScore(store.cube.composite(e.person.id).score)}`,
      color: `hsl(${e.person.metadata?.hue ?? 160} 78% 60%)`
    })),
    height: 300,
    axisLabels: ['PC1', 'PC2', 'PC3'],
    onPick: (p) => {
      const person = store.people.find(x => x.fullName === p.label);
      if (person) go('people', { focus: person.id });
    }
  });
  scatter.host = scatterChart.body;
  scatterChart.body.appendChild(scatter.el);

  root.appendChild(h('div', { class: 'grid grid--2 mb-4' }, composite.el, scatterChart.el));

  // ------------------------------------------------------------ consensus grid
  const heat = chartBox({
    title: 'Consensus heatmap',
    iconName: 'grid',
    actions: h('div', { class: 'flex gap-2 items-center' },
      h('div', { class: 'heat-legend' }, h('span', {}, '0'), h('div', { class: 'heat-legend__bar' }), h('span', {}, '10'))
    ),
    body: h('div', { style: { overflowX: 'auto', padding: '4px' } },
      heatGrid({
        rows: store.people,
        cols: store.traits.slice(0, 14),
        value: (p, t) => store.cube.consensusOf(t.id, p.id)?.mean ?? null,
        cellSize: 22
      })
    ),
    foot: h('span', { class: 'tiny dim' }, 'mean score per person × trait, all rankers combined')
  });
  root.appendChild(h('div', { style: { marginBottom: 'var(--s-4)' } }, heat.el));

  // ---------------------------------------------------------- ranker agreement
  const agree = chartBox({
    title: 'Ranker agreement',
    iconName: 'network',
    actions: h('span', { class: 'chart__sub' }, 'pearson r'),
    body: h('div', { style: { maxHeight: '420px', overflow: 'auto' } },
      agreementGrid({ cube: store.cube, onPick: (a, b, ag) => toast({ kind: 'info', title: `${a.fullName} ↔ ${b.fullName}`, text: `r=${ag.r.toFixed(2)} over ${ag.n} shared cells` }) })
    ),
    foot: h('div', { class: 'legend' },
      h('div', { class: 'legend__item' }, h('i', { class: 'legend__swatch', style: { background: 'var(--bad)' } }), 'opposed'),
      h('div', { class: 'legend__item' }, h('i', { class: 'legend__swatch', style: { background: 'var(--s2)' } }), 'independent'),
      h('div', { class: 'legend__item' }, h('i', { class: 'legend__swatch', style: { background: 'var(--good)' } }), 'aligned')
    )
  });

  const polarChart = chartBox({
    title: 'Polarisation index',
    iconName: 'bolt',
    body: h('div', { class: 'list' },
      ...o.mostPolarizing.map(p => {
        const trait = store.cube.traitById.get(p.traitId);
        const person = store.cube.personById.get(p.targetId);
        return h('div', { class: 'list-row pointer', onClick: () => { go('matrix', { mode: 'trait', id: p.traitId }); } },
          avatar(person, { size: 'sm' }),
          h('div', { class: 'list-row__main' }, h('b', {}, person?.fullName || '—'), h('span', {}, trait?.name || '—')),
          h('span', { class: 'pill pill--warn' }, `sd ${fmtScore(p.sd)}`),
          scoreChip(p.mean, trait)
        );
      })
    ),
    foot: h('span', { class: 'tiny dim' }, 'high spread = the group does not agree on this cell')
  });
  root.appendChild(h('div', { class: 'grid grid--2 mb-4' }, agree.el, polarChart.el));

  // ------------------------------------------------------------- trait strips
  const traitCards = h('div', { class: 'grid grid--3' });
  for (const trait of store.traits.slice(0, 9)) {
    const s = store.cube.traitStats.get(trait.id);
    const lb = store.cube.traitLeaderboard(trait.id);
    traitCards.appendChild(h('div', { class: 'chart', style: { '--trait-color': trait.color } },
      h('div', { class: 'chart__head' },
        h('div', { class: 'chart__title' }, traitChip(trait, {})),
        h('span', { class: 'chart__sub' }, `sd ${fmtScore(s?.sd)}`)
      ),
      h('div', { class: 'chart__body', style: { height: '110px', padding: '10px' } },
        distribution({ values: store.scores.filter(x => x.traitId === trait.id).map(x => x.value), bins: 10, height: 80 })
      ),
      h('div', { class: 'chart__foot' },
        h('span', { class: 'tiny dim' }, `top · ${lb[0]?.person.fullName.split(' ')[0] || '—'}`),
        h('span', { class: 'mono tiny', style: { color: trait.color } }, fmtScore(s?.mean))
      )
    ));
  }
  root.appendChild(h('div', { style: { marginBottom: 'var(--s-4)' } },
    sectionHead('Trait distributions', { count: `${store.traits.length}`, iconName: 'chart' }),
    traitCards
  ));

  // --------------------------------------------------------------- coverage
  const coverageChart = chartBox({
    title: 'Cube coverage',
    iconName: 'target',
    body: h('div', { style: { padding: '10px' } },
      donut({
        segments: [
          { label: 'filled', value: cov.actual, color: 'var(--accent)' },
          { label: 'dark', value: Math.max(cov.possible - cov.actual, 0), color: 'rgba(255,255,255,0.1)' }
        ],
        centerValue: fmtPct(cov.pct, 0),
        centerLabel: 'filled'
      })
    ),
    foot: h('span', { class: 'tiny dim' }, `${fmtNum(cov.actual, 0)} of ${fmtNum(cov.possible, 0)} cells`)
  });

  const weights = chartBox({
    title: 'Weight mass',
    iconName: 'scale',
    body: treemap({
      items: store.traits.map(t => ({
        label: t.name,
        value: Number(t.weight || 1) * (store.cube.traitStats.get(t.id)?.n || 1),
        onClick: () => go('matrix', { mode: 'trait', id: t.id })
      })),
      height: 220
    }),
    foot: h('span', { class: 'tiny dim' }, 'area = weight × ratings collected')
  });

  const disputes = chartBox({
    title: 'Dispute queue',
    iconName: 'gavel',
    body: h('div', { class: 'list' },
      ...store.cube.disputedCells(8).map(d => {
        const trait = store.cube.traitById.get(d.traitId);
        const target = store.cube.personById.get(d.targetId);
        const high = store.cube.personById.get(d.high?.rankerId);
        const low = store.cube.personById.get(d.low?.rankerId);
        return h('div', { class: 'list-row' },
          avatar(target, { size: 'sm' }),
          h('div', { class: 'list-row__main' },
            h('b', {}, target?.fullName || '—'),
            h('span', {}, `${trait?.name} · ${high?.fullName?.split(' ')[0]} ${fmtScore(d.high?.value)} vs ${low?.fullName?.split(' ')[0]} ${fmtScore(d.low?.value)}`)
          ),
          h('span', { class: 'pill pill--bad' }, `Δ ${fmtScore(d.gap)}`)
        );
      })
    )
  });

  root.appendChild(h('div', { class: 'grid grid--3', style: { marginBottom: 'var(--s-4)' } }, coverageChart.el, weights.el, disputes.el));

  // ------------------------------------------------------------- table of all
  const table = h('table', { class: 'vs-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'person'), h('th', {}, 'composite'), h('th', {}, 'received'), h('th', {}, 'given'),
      h('th', {}, 'polarisation'), h('th', {}, 'alignment'), h('th', {}, 'grade')
    )),
    h('tbody', {},
      ...o.ranked.map(r => {
        const profile = store.cube.personProfile(r.person.id);
        const inf = store.cube.influence(r.person.id);
        const rel = reliabilityGrade({ n: profile.receivedCount, sd: profile.polarization });
        return h('tr', { class: 'pointer', onclick: () => go('people', { focus: r.person.id }) },
          h('td', {}, h('div', { class: 'flex items-center gap-2' }, avatar(r.person, { size: 'sm' }), r.person.fullName)),
          h('td', {}, h('div', { class: 'vs-bar' },
            h('i', { style: { width: `${clamp(r.score / 10, 0, 1) * 100}%`, background: scoreColor(clamp(r.score / 10, 0, 1), 0.9) } }),
            h('span', {}, fmtScore(r.score))
          )),
          h('td', { class: 'mono' }, fmtScore(profile.receivedMean)),
          h('td', { class: 'mono' }, fmtScore(profile.givenMean)),
          h('td', { class: 'mono' }, fmtScore(profile.polarization)),
          h('td', { class: 'mono' }, fmtScore(inf.alignment, 2)),
          h('td', {}, gradeBadge(rel))
        );
      })
    )
  );
  root.appendChild(chartBox({ title: 'Full table', iconName: 'list', body: table, foot: h('span', { class: 'tiny dim' }, 'click a row to open the person') }).el);

  // ------------------------------------------------------------------- AI
  async function narrate() {
    const ctx = buildContext(store.cube);
    const prompt = 'Write the executive brief for this cube in 5 sentences. Lead with the strongest signal, name the most contested pair, state the biggest coverage gap, and end with one recommendation.';
    const m = modal({
      title: 'Cube brief',
      iconName: 'ai',
      size: 'md',
      body: h('div', { class: 'grid gap-3' },
        h('div', { class: 'ai-typing' }, h('i'), h('i'), h('i')),
        h('div', { class: 'msg__bubble', id: 'narrate-out' }, '…')
      )
    });
    const out = m.body.querySelector('#narrate-out');
    out.textContent = '';
    try {
      if (!hasKey()) toast({ kind: 'warn', text: 'No key — using the offline analyst' });
      const res = await oneShot({
        prompt, kind: 'narrative', context: contextToPrompt(ctx), stream: true,
        onDelta: (chunk) => {
          if (chunk) { out.textContent += chunk; out.scrollTop = out.scrollHeight; }
        }
      });
      out.innerHTML = renderMarkdownLite(res.text || '(empty)');
      sfx.play('chime');
    } catch (err) {
      out.textContent = `Failed: ${err.message}`;
      toast({ kind: 'error', text: err.message });
    }
  }

  function downloadJSON() {
    const data = store.cube.exportJSON();
    download(`triad-insights-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    sfx.play('chime', { gain: 0.5 });
    toast({ kind: 'ok', text: 'Exported cube JSON' });
  }

  return root;
}
