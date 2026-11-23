// ---------------------------------------------------------------------------
// deck.js — swipe-to-score deck. Smoother, spring-based, keyboard aware.
// ---------------------------------------------------------------------------
import { h, clamp, clear, pointerDrag, nextFrame, easeOutCubic } from '../core/dom.js';
import { icon } from './icons.js';
import { avatar, traitChip } from './bits.js';
import { sfx } from './sounds.js';
import { fmtScore } from '../core/format.js';
import { scoreColor, normalise } from '../core/math.js';

export function createDeck({ cube, rankerId, traitIds = null, limit = 40, onlyUnrated = true, onRate, onSkip, onFinish }) {
  const ranker = cube.personById.get(rankerId) || cube.people[0];
  const queue = [];
  const traits = traitIds?.length ? cube.traits.filter(t => traitIds.includes(t.id)) : cube.traits;
  for (const trait of traits) {
    for (const person of cube.people) {
      if (person.id === rankerId) continue;
      if (onlyUnrated && cube.hasCell(trait.id, rankerId, person.id)) continue;
      queue.push({ trait, person });
    }
  }
  // interleave traits so the session varies
  const seeded = mulberry(queue.length + rankerId.length);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(seeded() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  const cards = queue.slice(0, limit);

  let index = 0;
  let rated = 0;
  let skipped = 0;
  let value = 6;
  const history = [];

  const root = h('div', { class: 'deck-stage' });
  const cardsLayer = h('div', { class: 'deck-cards' });
  root.appendChild(cardsLayer);
  const emptyLayer = h('div', { class: 'deck-empty', style: { display: 'none' } });
  root.appendChild(emptyLayer);

  const progress = h('div', { class: 'deck-progress' }, h('i', { style: { width: '0%' } }));
  const controls = h('div', { class: 'deck-controls' },
    h('button', { class: 'deck-btn deck-btn--no', title: 'Skip / low (←)', onClick: () => act('skip') }, icon('x', { size: 22 })),
    h('button', { class: 'deck-btn deck-btn--undo', title: 'Undo (U)', onClick: () => undo() }, icon('rotate', { size: 18 })),
    h('button', { class: 'deck-btn deck-btn--yes', title: 'Commit score (→)', onClick: () => act('commit') }, icon('check', { size: 22 }))
  );

  const meta = h('div', { class: 'deck-card__meta' });

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function current() { return cards[index]; }

  function buildCard(card, depth = 0) {
    const { trait, person } = card;
    const hue = person.metadata?.hue ?? 160;
    const el = h('div', {
      class: 'deck-card',
      dataset: { depth: String(depth) },
      style: { '--card-hue': `hsla(${hue}, 78%, 58%, .5)` }
    });
    el.style.zIndex = String(100 - depth);
    el.style.transform = `scale(${1 - depth * 0.05}) translateY(${depth * 14}px)`;
    el.style.opacity = depth > 2 ? '0' : String(1 - depth * 0.2);

    const dial = h('div', { class: 'deck-card__dial' });
    const dialSvg = buildDial(value);
    const valueEl = h('div', { class: 'deck-card__value' }, h('span', {}, fmtScore(value)), h('small', {}, '/ 10'));
    dial.append(dialSvg, valueEl);

    const range = h('input', {
      type: 'range', min: 0, max: 10, step: 0.5, value,
      onInput: (e) => {
        value = Number(e.target.value);
        valueEl.firstChild.textContent = fmtScore(value);
        updateDial(dialSvg, value);
        e.target.style.setProperty('--fill', `${value * 10}%`);
        if (Math.round(value * 2) % 2 === 0) sfx.haptic('tick');
      }
    });
    range.style.setProperty('--fill', `${value * 10}%`);

    el.append(
      h('div', { class: 'deck-card__glow' }),
      h('div', { class: 'deck-stamp deck-stamp--yes' }, 'rate'),
      h('div', { class: 'deck-stamp deck-stamp--no' }, 'skip'),
      h('div', { class: 'deck-card__body' },
        h('div', { class: 'deck-card__top' },
          h('div', { class: 'deck-card__person' },
            avatar(person, { size: 'lg' }),
            h('div', {},
              h('h3', {}, person.fullName),
              h('span', {}, person.jobTitle || person.department || 'person')
            )
          ),
          h('span', { class: 'pill' }, `${index + 1}/${cards.length}`)
        ),
        h('div', { class: 'deck-card__trait' },
          traitChip(trait, { lg: true }),
          h('div', { class: 'deck-card__question' }, `How much ${trait.name.toLowerCase()} does ${person.fullName.split(' ')[0]} show?`)
        ),
        dial,
        h('div', { class: 'deck-card__slider' }, range),
        h('div', { class: 'deck-card__meta' },
          h('span', {}, `ranker · ${ranker.fullName.split(' ')[0]}`),
          h('span', {}, trait.category)
        )
      )
    );

    if (depth === 0) {
      pointerDrag(el, {
        onStart: () => {
          el.classList.add('is-moving');
        },
        onMove: (s) => {
          const rot = s.dx * 0.05;
          el.style.transform = `translate(${s.dx}px, ${s.dy}px) rotate(${rot}deg)`;
          const yes = s.dx > 30, no = s.dx < -30;
          el.classList.toggle('is-yes', yes);
          el.classList.toggle('is-no', no);
          if (Math.abs(s.dx) > 90 && !s._buzzed) {
            s._buzzed = true;
            sfx.haptic('swipe');
          }
        },
        onEnd: (s) => {
          el.classList.remove('is-moving');
          const threshold = 90;
          if (s.dx > threshold) { fling(el, 1, () => act('commit')); }
          else if (s.dx < -threshold) { fling(el, -1, () => act('skip')); }
          else {
            el.style.transform = '';
            el.classList.remove('is-yes', 'is-no');
            sfx.play('release', { gain: 0.4 });
          }
        }
      });
    }
    return el;
  }

  function buildDial(v) {
    const size = 190;
    const r = size / 2 - 7;
    const c = 2 * Math.PI * r;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', 'dialGrad');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '1'); grad.setAttribute('y2', '1');
    ['#ff4d6d', '#ffe066', '#5ef2d6'].forEach((color, i) => {
      const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop.setAttribute('offset', `${i * 50}%`);
      stop.setAttribute('stop-color', color);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', String(size / 2));
    track.setAttribute('cy', String(size / 2));
    track.setAttribute('r', String(r));
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', 'rgba(255,255,255,0.07)');
    track.setAttribute('stroke-width', '10');
    svg.appendChild(track);

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    arc.setAttribute('cx', String(size / 2));
    arc.setAttribute('cy', String(size / 2));
    arc.setAttribute('r', String(r));
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', 'url(#dialGrad)');
    arc.setAttribute('stroke-width', '10');
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('stroke-dasharray', String(c));
    arc.setAttribute('stroke-dashoffset', String(c * (1 - clamp(v / 10, 0, 1))));
    arc.dataset.c = String(c);
    svg.appendChild(arc);

    // tick marks
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 1.5 + Math.PI * 0.75;
      const x1 = size / 2 + Math.cos(a) * (r - 14);
      const y1 = size / 2 + Math.sin(a) * (r - 14);
      const x2 = size / 2 + Math.cos(a) * (r - 18);
      const y2 = size / 2 + Math.sin(a) * (r - 18);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', 'rgba(255,255,255,0.22)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }
    return svg;
  }

  function updateDial(svg, v) {
    const arc = svg.querySelector('circle[stroke-dasharray]');
    if (!arc) return;
    const c = Number(arc.dataset.c || 1);
    arc.setAttribute('stroke-dashoffset', String(c * (1 - clamp(v / 10, 0, 1))));
  }

  function paint() {
    clear(cardsLayer);
    const visible = cards.slice(index, index + 3);
    if (!visible.length) {
      showEmpty();
      return;
    }
    visible.forEach((card, depth) => {
      const el = buildCard(card, depth);
      cardsLayer.appendChild(el);
    });
    updateProgress();
    const c = current();
    if (c) {
      const hue = c.person.metadata?.hue ?? 160;
      root.style.setProperty('--card-hue', `hsla(${hue}, 78%, 58%, .5)`);
    }
  }

  function showEmpty() {
    clear(emptyLayer);
    emptyLayer.style.display = 'grid';
    emptyLayer.append(
      icon('check', { size: 44 }),
      h('h3', {}, rated || skipped ? 'Deck cleared' : 'Nothing queued'),
      h('p', {}, rated
        ? `${rated} scores written, ${skipped} skipped.`
        : 'Every card for this ranker is already scored.'),
      h('div', { class: 'flex gap-2' },
        h('button', { class: 'btn btn--primary', onClick: () => onFinish?.({ rated, skipped }) }, 'Summary'),
        h('button', { class: 'btn', onClick: () => { index = 0; rated = 0; skipped = 0; paint(); } }, icon('refresh', { size: 13 }), 'Restart')
      )
    );
    onFinish?.({ rated, skipped, done: true });
    sfx.play('milestone', { gain: 0.6 });
  }

  function updateProgress() {
    const pct = cards.length ? (index / cards.length) * 100 : 100;
    progress.firstElementChild.style.width = `${pct}%`;
  }

  async function fling(el, dir, done) {
    el.style.transition = 'transform 340ms cubic-bezier(.2,.8,.2,1), opacity 300ms';
    el.style.transform = `translate(${dir * window.innerWidth * 1.2}px, -40px) rotate(${dir * 26}deg)`;
    el.style.opacity = '0';
    sfx.play('swipe', { gain: 0.5, dir: dir > 0 ? 'right' : 'left' });
    sfx.haptic('light');
    await new Promise(r => setTimeout(r, 200));
    done();
  }

  async function act(kind) {
    const card = current();
    if (!card) return;
    if (kind === 'commit') {
      const committed = value;
      history.push({ card, value: committed });
      rated++;
      await onRate?.({ traitId: card.trait.id, rankerId, targetId: card.person.id, value: committed });
      sfx.play('glass');
      sfx.haptic('commit');
      ripple();
    } else {
      skipped++;
      history.push({ card, value: null });
      onSkip?.(card);
      sfx.play('whooshBack', { gain: 0.3 });
    }
    index++;
    paint();
    const next = current();
    if (next) value = cube.value(next.trait.id, rankerId, next.person.id) ?? 6;
    updateProgress();
  }

  function ripple() {
    const ring = h('div', { class: 'deck-ripple', style: { left: '50%', top: '58%' } });
    root.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
  }

  function undo() {
    const last = history.pop();
    if (!last) { sfx.play('error', { gain: 0.4 }); return; }
    index = Math.max(0, index - 1);
    if (last.value === null) skipped = Math.max(0, skipped - 1);
    else rated = Math.max(0, rated - 1);
    onRate?.({ traitId: last.card.trait.id, rankerId, targetId: last.card.person.id, value: last.value, undo: true });
    paint();
    sfx.play('whooshBack', { gain: 0.4 });
  }

  function onKey(e) {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); act('commit'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); act('skip'); }
    else if (e.key.toLowerCase() === 'u') undo();
    else if (e.key === 'ArrowUp') { value = clamp(value + 0.5, 0, 10); rerenderTop(); }
    else if (e.key === 'ArrowDown') { value = clamp(value - 0.5, 0, 10); rerenderTop(); }
  }

  function rerenderTop() {
    const top = cardsLayer.querySelector('.deck-card');
    if (!top) return;
    const valueEl = top.querySelector('.deck-card__value span');
    if (valueEl) valueEl.textContent = fmtScore(value);
    const range = top.querySelector('input[type=range]');
    if (range) { range.value = String(value); range.style.setProperty('--fill', `${value * 10}%`); }
    const svg = top.querySelector('.deck-card__dial svg');
    if (svg) updateDial(svg, value);
    sfx.play('tick', { gain: 0.4 });
  }

  document.addEventListener('keydown', onKey);
  paint();

  const wrap = h('div', {},
    root,
    progress,
    controls
  );

  return {
    el: wrap,
    root,
    get stats() { return { index, rated, skipped, total: cards.length }; },
    next: () => act('commit'),
    skip: () => act('skip'),
    undo,
    destroy() { document.removeEventListener('keydown', onKey); }
  };
}
