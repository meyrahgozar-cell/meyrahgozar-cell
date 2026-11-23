// ---------------------------------------------------------------------------
// hub.js — overview: headline numbers, three slices, leaderboard, activity.
// ---------------------------------------------------------------------------
import { h, clamp, download } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { go } from '../core/nav.js';
import { avatar, kpi, traitChip, scoreChip, sectionHead, emptyState, sparkPath, deltaPill, miniBars } from '../ui/bits.js';
import { sparkline, radar, bars, chartBox, distribution } from '../ui/charts.js';
import { fmtScore, fmtPct, relTime, fmtNum, timeOfDay } from '../core/format.js';
import { sfx } from '../ui/sounds.js';
import { toast } from '../ui/overlay.js';
import { polarise, normalise, scoreColor } from '../core/math.js';

export function hubView() {
  const o = store.cube.overview();
  const cov = store.coverage();
  const root = h('div', { class: 'view__inner' });

  if (!store.people.length || !store.traits.length) {
    root.appendChild(
      h('div', { class: 'page-head' },
        h('div', { class: 'page-head__left' },
          h('div', { class: 'eyebrow' }, 'TRIAD /// 3D MATRIX'),
          h('h1', { class: 'page-title' }, 'Empty', h('em', { class: 'accent' }, 'cube'))
        )
      ),
      emptyState({
        iconName: 'cube',
        title: 'No dimensions yet',
        text: 'Install the trait library and add people to start building the cube.',
        action: h('div', { class: 'flex gap-2' },
          h('button', { class: 'btn btn--primary', onClick: () => bus.emit('action:install-library') }, icon('wand', { size: 14 }), 'Install traits'),
          h('button', { class: 'btn', onClick: () => bus.emit('action:new-person') }, icon('plus', { size: 14 }), 'Add person'),
          h('button', { class: 'btn btn--ghost', onClick: () => store.resetDemo('full').then(() => bus.emit(EV.DATA_CHANGED, { reason: 'demo' })) }, 'Load demo cube')
        )
      })
    );
    return root;
  }

  // ------------------------------------------------------------------- hero
  const hero = h('div', { class: 'hero' });
  const hue = new Date().getHours();
  const lede = o.ranked[0];
  const heroContent = h('div', { class: 'hero__content' },
    h('div', { class: 'hero__kicker' },
      h('span', { class: 'pill pill--accent pill--dot' }, 'live cube'),
      h('span', { class: 'eyebrow' }, `${timeOfDay()} · ${store.mode} source`)
    ),
    h('h1', { class: 'hero__title' },
      `Three dimensions,`,
      h('br'),
      h('em', { class: 'glow-text' }, 'one truth.')
    ),
    h('div', { class: 'hero__text' },
      `${store.people.length} people scored against ${store.traits.length} traits by ${o.activeRankers} rankers. `,
      `${fmtPct(cov.pct, 1)} of the cube is filled — ${fmtNum(cov.possible - cov.actual, 0)} cells still dark.`
    ),
    h('div', { class: 'hero__stats' },
      heroStat(String(store.scores.length), 'cells'),
      heroStat(fmtScore(o.mean), 'mean'),
      heroStat(fmtScore(o.sd), 'spread'),
      heroStat(lede ? lede.person.fullName.split(' ')[0] : '—', 'leads')
    ),
    h('div', { class: 'flex gap-2 wrap' },
      h('button', { class: 'btn btn--primary btn--lg', onClick: () => { sfx.play('clink2'); go('matrix'); } }, icon('cube', { size: 15 }), 'Open the stacks'),
      h('button', { class: 'btn btn--lg', onClick: () => go('deck') }, icon('layers', { size: 15 }), 'Rate 20 cards'),
      h('button', { class: 'btn btn--lg btn--ghost', onClick: () => bus.emit('action:ai-brief') }, icon('ai', { size: 15 }), 'AI brief')
    )
  );

  const art = h('div', { class: 'hero__art' });
  const topRows = o.ranked.slice(0, 6);
  art.appendChild(h('div', { class: 'glass', style: { padding: '16px', width: '100%', maxWidth: '320px' } },
    h('div', { class: 'eyebrow mb-3' }, 'composite leaderboard'),
    ...topRows.map((row, i) => h('div', { class: 'flex items-center gap-2 mb-2' },
      h('span', { class: 'mono dim', style: { width: '14px' } }, String(i + 1)),
      avatar(row.person, { size: 'sm' }),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'tiny truncate', style: { color: 'var(--ink)' } }, row.person.fullName),
        h('div', { class: 'mt-2', style: { height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,.08)', overflow: 'hidden' } },
          h('div', { style: { width: `${clamp(row.score / 10, 0, 1) * 100}%`, height: '100%', background: scoreColor(clamp(row.score / 10, 0, 1), 1), borderRadius: '2px' } })
        )
      ),
      h('span', { class: 'mono tiny' }, fmtScore(row.score))
    ))
  ));
  hero.append(heroContent, art);
  root.appendChild(hero);

  // --------------------------------------------------------------- kpi strip
  const kpis = h('div', { class: 'grid grid--4', style: { marginTop: 'var(--s-4)' } },
    kpi({ label: 'Cube fill', value: fmtPct(cov.pct, 1), unit: '', iconName: 'grid', accent: true, foot: h('span', { class: 'dim' }, `${cov.actual} / ${cov.possible}`) }),
    kpi({ label: 'Consensus mean', value: fmtScore(o.mean), unit: '/10', iconName: 'scale', foot: h('span', { class: 'dim' }, `sd ${fmtScore(o.sd)}`) }),
    kpi({ label: 'Rankers active', value: String(o.activeRankers), unit: `/ ${store.people.length}`, iconName: 'users', foot: h('span', { class: 'dim' }, `${store.people.length - o.activeRankers} silent`) }),
    kpi({ label: 'Most contested', value: o.mostPolarizing[0] ? fmtScore(o.mostPolarizing[0].sd) : '—', unit: 'sd', iconName: 'bolt', foot: o.mostPolarizing[0] ? h('span', { class: 'dim' }, `${store.cube.traitById.get(o.mostPolarizing[0].traitId)?.name || ''} / ${store.cube.personById.get(o.mostPolarizing[0].targetId)?.fullName?.split(' ')[0] || ''}`) : null })
  );
  root.appendChild(kpis);

  // ------------------------------------------------------------- three slices
  root.appendChild(h('div', { style: { marginTop: 'var(--s-6)' } },
    sectionHead('Three slices of the same cube', {
      iconName: 'cube',
      actions: h('button', { class: 'btn btn--sm btn--ghost', onClick: () => go('matrix') }, 'Open matrix', icon('arrowRight', { size: 12 }))
    }),
    h('div', { class: 'grid grid--3' },
      sliceCard({
        title: 'Trait stacks',
        sub: 'property base',
        body: 'One stack per trait. Each table ranks every person against every other person on that single dimension.',
        accent: 'var(--accent)',
        iconName: 'layers',
        stat: `${store.traits.length} layers`,
        onClick: () => go('matrix', { mode: 'trait' })
      }),
      sliceCard({
        title: 'Ranker stacks',
        sub: 'people base · given',
        body: 'One stack per ranker. Each table is everything that person handed out: targets × traits.',
        accent: 'var(--accent-2)',
        iconName: 'user',
        stat: `${store.people.length} layers`,
        onClick: () => go('matrix', { mode: 'ranker' })
      }),
      sliceCard({
        title: 'Target stacks',
        sub: 'people base · received',
        body: 'One stack per person being scored. Each table is everything the group said about them.',
        accent: 'var(--accent-3)',
        iconName: 'target',
        stat: `${store.people.length} layers`,
        onClick: () => go('matrix', { mode: 'target' })
      })
    )
  ));

  // ------------------------------------------------------- leaderboard + feed
  const lb = chartBox({
    title: 'Weighted composite',
    iconName: 'analytics',
    height: 300,
    actions: h('span', { class: 'chart__sub' }, 'polarity adjusted'),
    body: bars(o.ranked.slice(0, 9).map(r => ({
      label: r.person.fullName,
      value: Number(r.score.toFixed(2)),
      ghost: o.mean,
      icon: avatar(r.person, { size: 'sm' })
    })), {
      max: 10,
      colorFor: row => scoreColor(clamp(row.value / 10, 0, 1), 1),
      onClick: row => go('people', { focus: store.people.find(p => p.fullName === row.label)?.id })
    })
  });
  const contested = chartBox({
    title: 'Contested cells',
    iconName: 'bolt',
    height: 300,
    actions: h('span', { class: 'chart__sub' }, 'spread of opinion'),
    body: h('div', { class: 'list' },
      ...o.mostPolarizing.slice(0, 8).map(p => {
        const trait = store.cube.traitById.get(p.traitId);
        const person = store.cube.personById.get(p.targetId);
        return h('div', { class: 'list-row pointer', onClick: () => { store.select({ traitId: p.traitId, personId: p.targetId }); go('matrix', { mode: 'trait', id: p.traitId }); } },
          avatar(person, { size: 'sm' }),
          h('div', { class: 'list-row__main' },
            h('b', {}, person?.fullName || '—'),
            h('span', {}, `${trait?.name || '—'} · n=${p.n}`)
          ),
          scoreChip(p.mean, trait),
          h('span', { class: 'pill pill--warn' }, `±${fmtScore(p.sd)}`)
        );
      })
    )
  });
  root.appendChild(h('div', { class: 'grid grid--2', style: { marginTop: 'var(--s-5)' } }, lb.el, contested.el));

  // ----------------------------------------------------------- people + feed
  const people = chartBox({
    title: 'People snapshot',
    iconName: 'users',
    height: null,
    actions: h('button', { class: 'btn btn--sm btn--ghost', onClick: () => go('people') }, 'All people', icon('arrowRight', { size: 12 })),
    body: h('div', { class: 'grid grid--auto-sm' },
      ...o.ranked.slice(0, 6).map(row => {
        const profile = store.cube.personProfile(row.person.id);
        return h('div', { class: 'person-card', onClick: () => go('people', { focus: row.person.id }) },
          h('div', { class: 'person-card__top' },
            avatar(row.person),
            h('div', { class: 'person-card__id' },
              h('b', {}, row.person.fullName),
              h('span', {}, row.person.jobTitle || row.person.department || 'person')
            ),
            h('div', { class: 'person-card__score' }, h('b', {}, fmtScore(row.score)), h('span', {}, '/10'))
          ),
          h('div', { class: 'person-card__bars' },
            ...profile.traitRows.slice(0, 3).map(tr => h('div', { class: 'person-card__bar' },
              h('span', {}, tr.trait.name),
              h('i', {}, h('span', { style: { display: 'block', height: '100%', width: `${clamp(tr.receivedMean / 10, 0, 1) * 100}%`, background: tr.trait.color, borderRadius: '2px' } })),
              h('em', {}, fmtScore(tr.receivedMean))
            ))
          ),
          h('div', { class: 'person-card__foot' },
            h('span', { class: 'pill' }, `${profile.receivedCount} received`),
            h('span', { class: 'pill' }, `${fmtPct(profile.coverage)} rated`)
          )
        );
      })
    )
  });

  const activity = chartBox({
    title: 'Cube telemetry',
    iconName: 'pulse',
    body: h('div', { class: 'timeline' },
      ...(store.activity.length ? store.activity.slice(0, 8) : [{ kind: 'load', text: 'Cube loaded', at: new Date().toISOString() }]).map(a =>
        h('div', { class: 'timeline__item' }, h('span', {}, relTime(a.at)), h('b', {}, a.text))
      )
    )
  });

  root.appendChild(h('div', { class: 'grid grid--2', style: { marginTop: 'var(--s-5)' } }, people.el, activity.el));

  // -------------------------------------------------------------- distribution
  const dist = chartBox({
    title: 'Score distribution',
    iconName: 'chart',
    height: 180,
    body: distribution({ values: store.scores.map(s => s.value), bins: 12, height: 160 }),
    foot: h('div', { class: 'flex items-center gap-3 wrap' },
      h('span', { class: 'tiny dim' }, 'every cell in the cube'),
      h('div', { class: 'flex gap-2' },
        deltaPill(o.mean - 5, { suffix: ' vs midpoint' })
      )
    )
  });
  root.appendChild(h('div', { style: { marginTop: 'var(--s-5)' } }, dist.el));

  return root;
}

function heroStat(value, label) {
  return h('div', { class: 'hero__stat' }, h('b', {}, value), h('span', {}, label));
}

function sliceCard({ title, sub, body, accent, iconName, stat, onClick }) {
  const el = h('div', {
    class: 'glass panel--pad-lg shine',
    style: { cursor: 'pointer', '--accent': accent, position: 'relative', overflow: 'hidden' },
    onClick
  },
    h('div', { class: 'flex items-center justify-between mb-3' },
      h('div', { class: 'flex items-center gap-2' },
        h('span', { style: { color: accent } }, icon(iconName, { size: 18 })),
        h('span', { class: 'eyebrow' }, sub)
      ),
      h('span', { class: 'pill' }, stat)
    ),
    h('h3', { style: { fontSize: '20px', marginBottom: '6px' } }, title),
    h('p', { class: 'small', style: { color: 'var(--ink-4)' } }, body),
    h('div', { class: 'mt-4 flex items-center gap-2' },
      h('span', { class: 'mono tiny', style: { color: accent } }, 'open stack'),
      icon('arrowRight', { size: 13, cls: 'accent' })
    )
  );
  el.style.setProperty('--accent', accent);
  el.querySelector('.icon.accent')?.setAttribute('style', `color:${accent}`);
  return el;
}
