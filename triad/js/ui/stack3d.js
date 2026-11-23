// ---------------------------------------------------------------------------
// stack3d.js — the three-dimensional stack of tables.
//
//   A stack is an ordered set of 2D tables sharing one axis:
//     trait  mode: one layer per trait,   table = rankers x targets
//     ranker mode: one layer per ranker,  table = targets x traits
//     target mode: one layer per target,  table = rankers x traits
//
//   Engine: CSS 3D for the plates (cheap, crisp text) + canvas heatmaps.
//   Motion: spring-free critically-damped smoothing with drag inertia.
// ---------------------------------------------------------------------------
import { h, clamp, lerp, pointerDrag, rafLoop } from '../core/dom.js';
import { scoreColor, normalise } from '../core/math.js';
import { icon } from './icons.js';
import { sfx } from './sounds.js';
import { bus, EV } from '../core/bus.js';

const DEFAULTS = {
  rotX: -20,
  rotY: -16,
  zoom: 1,
  spread: 1,
  spacing: 58,
  layerWidth: 380,
  maxLayers: 14
};

export function createStack(container, config = {}) {
  const state = {
    ...DEFAULTS,
    rotX: config.rotX ?? DEFAULTS.rotX,
    rotY: config.rotY ?? DEFAULTS.rotY,
    zoom: config.zoom ?? DEFAULTS.zoom,
    spread: 1,
    targetRotX: config.rotX ?? DEFAULTS.rotX,
    targetRotY: config.rotY ?? DEFAULTS.rotY,
    targetZoom: 1,
    targetSpread: 1,
    vx: 0,
    vy: 0,
    dragging: false,
    exploded: false,
    focused: 0,
    mode: config.mode || 'trait',
    layers: [],
    dirty: true,
    hoverIndex: -1
  };

  const items = config.items || [];
  const opts = {
    onFocus: null,
    onOpen: null,
    showLabels: true,
    maxLayers: config.maxLayers ?? DEFAULTS.maxLayers,
    ...config
  };

  // ------------------------------------------------------------------- shell
  const shell = h('div', { class: 'stack-shell', tabindex: '0', 'aria-label': '3D stack of tables' });
  const hud = h('div', { class: 'stack-hud' });
  const hudLeft = h('div', { class: 'stack-hud__left' });
  const hudRight = h('div', { class: 'stack-hud__right' });
  hud.append(hudLeft, hudRight);

  const canvas = h('div', { class: 'stack-canvas' });
  const stage = h('div', { class: 'stack-stage' });
  const ground = h('div', { class: 'stack-ground' });
  canvas.appendChild(stage);
  stage.appendChild(ground);

  const focusbar = h('div', { class: 'stack-focusbar', style: { display: 'none' } });
  const gizmo = buildGizmo();
  const depthRail = h('div', { class: 'stack-depth' });
  const legend = h('div', { class: 'stack-legend' },
    h('span', {}, 'low'), h('div', { class: 'stack-legend__bar' }), h('span', {}, 'high')
  );
  canvas.append(focusbar, gizmo, depthRail, legend);

  const foot = h('div', { class: 'stack-foot' },
    h('div', { class: 'stack-foot__hint' },
      h('span', {}, h('kbd', { class: 'kbd' }, 'drag'), 'orbit'),
      h('span', {}, h('kbd', { class: 'kbd' }, 'wheel'), 'depth'),
      h('span', {}, h('kbd', { class: 'kbd' }, 'dbl'), 'open')
    ),
    h('div', { class: 'toolbar__spacer' }),
    h('div', { class: 'stack-fan' })
  );

  shell.append(hud, canvas, foot);
  container.appendChild(shell);

  // controls -------------------------------------------------------------
  const ctlSpread = h('button', {
    class: 'btn btn--sm btn--ghost', title: 'Explode / collapse stack (E)',
    onClick: () => toggleExplode()
  }, icon('expand', { size: 13 }), h('span', {}, 'Explode'));

  const ctlReset = h('button', {
    class: 'btn btn--sm btn--ghost', title: 'Reset camera (R)',
    onClick: () => resetCamera()
  }, icon('rotate', { size: 13 }), h('span', {}, 'Reset'));

  const ctlFlat = h('button', {
    class: 'btn btn--sm btn--ghost', title: 'Flat grid (G)',
    onClick: () => opts.onFlat?.()
  }, icon('grid', { size: 13 }), h('span', {}, 'Grid'));

  foot.querySelector('.stack-fan').append(ctlSpread, ctlReset, ctlFlat);

  // -------------------------------------------------------------- dimensions
  let dims = { w: 380, h: 260 };
  function measure() {
    const rect = canvas.getBoundingClientRect();
    const w = clamp(Math.round(rect.width * 0.42), 210, Math.round(opts.layerWidth || 400));
    const ratio = 0.66;
    dims = { w, h: Math.round(w * ratio) };
    shell.style.setProperty('--lw', `${dims.w}px`);
    shell.style.setProperty('--lh', `${dims.h}px`);
    ground.style.setProperty('--lw', `${dims.w}px`);
    ground.style.setProperty('--lh', `${dims.h}px`);
    for (const layer of state.layers) {
      layer.el.style.setProperty('--lw', `${dims.w}px`);
      layer.el.style.setProperty('--lh', `${dims.h}px`);
      drawLayer(layer);
    }
    state.dirty = true;
  }

  // ------------------------------------------------------------------ layers
  function buildLayers() {
    for (const layer of state.layers) layer.el.remove();
    state.layers = [];
    const count = Math.min(items.length, opts.maxLayers);
    for (let i = 0; i < count; i++) {
      const item = items[i];
      const el = h('div', { class: 'layer', dataset: { index: i } });
      const plate = h('div', { class: 'layer__plate' });
      const cv = h('canvas');
      const veil = h('div', { class: 'layer__veil' });
      const index = h('div', { class: 'layer__index' }, String(i + 1).padStart(2, '0'));
      const label = h('div', { class: 'layer__label' },
        h('div', { class: 'layer__name' }, item.name || '—'),
        h('div', { class: 'layer__sub' }, item.sub || '')
      );
      const axis = h('div', { class: 'layer__axis' },
        h('b', {}, item.axis || ''),
        h('span', {}, item.axisSub || '')
      );
      plate.append(cv, veil, index, label);
      el.append(axis, plate);
      stage.appendChild(el);
      state.layers.push({ el, canvas: cv, plate, item, index: i });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        focusIndex(i, true);
      });
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        opts.onOpen?.(item, i);
        sfx.play('whoosh');
      });
      el.addEventListener('pointerenter', () => { state.hoverIndex = i; state.dirty = true; });
      el.addEventListener('pointerleave', () => { if (state.hoverIndex === i) { state.hoverIndex = -1; state.dirty = true; } });
    }
    buildDepthRail();
    measure();
    applyLayerLayout();
    updateHud();
  }

  function buildDepthRail() {
    depthRail.innerHTML = '';
    const n = state.layers.length;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      depthRail.appendChild(h('div', {
        class: `stack-depth__tick ${i === state.focused ? 'is-active' : ''}`,
        title: state.layers[i].item.name,
        onClick: () => focusIndex(i, true)
      }));
    }
  }

  function syncDepthRail() {
    [...depthRail.children].forEach((el, i) => el.classList.toggle('is-active', i === state.focused));
  }

  // ------------------------------------------------------------------ canvas
  function drawLayer(layer) {
    const { canvas: cv, item } = layer;
    if (!cv || !item) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = dims.w, hgt = dims.h;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hgt * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);

    const matrix = item.matrix;
    if (!matrix) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, 0, w, hgt);
      return;
    }

    // background
    const bg = ctx.createLinearGradient(0, 0, w, hgt);
    bg.addColorStop(0, 'rgba(9,14,22,1)');
    bg.addColorStop(1, 'rgba(6,10,16,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, hgt);

    const rows = matrix.rows || [];
    const cols = matrix.cols || [];
    const padT = 16, padL = 16, padR = 10, padB = 24;
    const cw = Math.max(2, (w - padL - padR) / Math.max(cols.length, 1));
    const chh = Math.max(2, (hgt - padT - padB) / Math.max(rows.length, 1));
    const gap = cols.length > 18 ? 0.6 : 1.6;

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cols.length; c++) {
        const value = matrix.value ? matrix.value(rows[r], cols[c]) : null;
        const x = padL + c * cw;
        const y = padT + r * chh;
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
          ctx.fillStyle = 'rgba(255,255,255,0.025)';
          ctx.fillRect(x + gap, y + gap, Math.max(cw - gap * 2, 0.8), Math.max(chh - gap * 2, 0.8));
          continue;
        }
        const range = item.range || { min: 0, max: 10 };
        const t = normalise(Number(value), range.min, range.max);
        ctx.fillStyle = scoreColor(t, 0.92);
        ctx.fillRect(x + gap, y + gap, Math.max(cw - gap * 2, 0.8), Math.max(chh - gap * 2, 0.8));
      }
    }

    // grid guides
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, hgt - padB);
    ctx.lineTo(w - padR, hgt - padB);
    ctx.stroke();

    // corner ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.moveTo(w - 12, hgt - 12); ctx.lineTo(w - 6, hgt - 12);
    ctx.moveTo(w - 12, hgt - 12); ctx.lineTo(w - 12, hgt - 6);
    ctx.stroke();

    // label gutter
    if (opts.showLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '6.5px ui-monospace, monospace';
      ctx.textAlign = 'left';
      const step = Math.max(1, Math.floor(rows.length / 8));
      for (let r = 0; r < rows.length; r += step) {
        const y = padT + r * chh + chh * 0.7;
        ctx.fillText((rows[r].fullName || rows[r].name || '').slice(0, 12), 2, y);
      }
    }
  }

  // ------------------------------------------------------------------ layout
  function layerTransform(index) {
    const n = state.layers.length;
    const mid = (n - 1) / 2;
    const rel = index - mid;
    const spacing = DEFAULTS.spacing * state.spread;
    const z = -rel * spacing;
    const drift = state.exploded ? 0 : rel * -3;
    const y = state.exploded ? rel * 4 : 0;
    const tilt = state.exploded ? rel * 0.6 : 0;
    return `translate3d(${drift}px, ${y}px, ${z}px) rotateZ(${tilt}deg)`;
  }

  function applyLayerLayout() {
    state.layers.forEach((layer, i) => {
      layer.el.style.transform = layerTransform(i);
      const active = i === state.focused;
      layer.el.classList.toggle('is-focused', active && state.layers.length > 1);
      layer.el.classList.toggle('is-dimmed', state.layers.length > 2 && !active && state.exploded);
      layer.el.style.opacity = active ? '1' : state.exploded ? '0.82' : '1';
    });
  }

  function stageTransform() {
    return `rotateX(${state.rotX.toFixed(2)}deg) rotateY(${state.rotY.toFixed(2)}deg) scale(${state.zoom.toFixed(3)})`;
  }

  function updateHud() {
    if (!hudLeft.children.length || hudLeft.dataset.count !== String(items.length)) {
      hudLeft.innerHTML = '';
      hudLeft.dataset.count = String(items.length);
      hudLeft.append(
        metric(String(items.length).padStart(2, '0'), 'layers'),
        metric(state.mode === 'trait' ? 'ranker × target' : state.mode === 'ranker' ? 'target × trait' : 'ranker × trait', 'table axes'),
        metric(state.layers.length ? String(state.layers[0].item.rows || 0) : '0', 'rows')
      );
      hudRight.innerHTML = '';
      hudRight.append(
        h('span', { class: 'pill pill--dot' }, `${state.mode}-based`),
        h('span', { class: 'pill' }, `${state.focused + 1} / ${items.length}`)
      );
    } else {
      const pills = hudRight.querySelectorAll('.pill');
      if (pills[1]) pills[1].textContent = `${state.focused + 1} / ${items.length}`;
    }
  }

  function metric(value, label) {
    return h('div', { class: 'stack-hud__metric' }, h('b', { class: 'tnum' }, value), h('span', {}, label));
  }

  // ------------------------------------------------------------------ motion
  function focusIndex(index, emit = false) {
    if (index < 0 || index >= state.layers.length) return;
    state.focused = index;
    syncDepthRail();
    applyLayerLayout();
    updateHud();
    showFocusbar();
    state.dirty = true;
    sfx.play('focus', { gain: 0.7 });
    sfx.haptic('focus');
    if (emit) {
      opts.onFocus?.(state.layers[index].item, index);
      bus.emit(EV.STACK_FOCUS, { mode: state.mode, id: state.layers[index].item.id, index });
    }
  }

  function showFocusbar() {
    const layer = state.layers[state.focused];
    if (!layer || state.layers.length < 2) { focusbar.style.display = 'none'; return; }
    focusbar.innerHTML = '';
    focusbar.style.display = 'flex';
    focusbar.append(
      h('div', { class: 'stack-focusbar__title' },
        h('b', {}, layer.item.name || '—'),
        h('span', {}, layer.item.sub || `${state.focused + 1} / ${items.length}`)
      ),
      h('button', { class: 'btn btn--sm btn--primary', onClick: () => opts.onOpen?.(layer.item, state.focused) },
        icon('expand', { size: 12 }), 'Open'),
      h('div', { class: 'flex gap-1' },
        h('button', { class: 'btn btn--icon btn--sm btn--ghost', title: 'Previous', onClick: () => focusIndex(Math.max(0, state.focused - 1), true) }, icon('chevronLeft', { size: 13 })),
        h('button', { class: 'btn btn--icon btn--sm btn--ghost', title: 'Next', onClick: () => focusIndex(Math.min(state.layers.length - 1, state.focused + 1), true) }, icon('chevronRight', { size: 13 }))
      )
    );
  }

  function toggleExplode(force) {
    state.exploded = force ?? !state.exploded;
    state.targetSpread = state.exploded ? 2.1 : 1;
    ctlSpread.classList.toggle('is-active', state.exploded);
    ctlSpread.querySelector('span').textContent = state.exploded ? 'Collapse' : 'Explode';
    sfx.play(state.exploded ? 'riser' : 'whooshBack', { gain: 0.6 });
    sfx.haptic(state.exploded ? 'heavy' : 'light');
    applyLayerLayout();
    state.dirty = true;
  }

  function resetCamera() {
    state.targetRotX = DEFAULTS.rotX;
    state.targetRotY = DEFAULTS.rotY;
    state.targetZoom = 1;
    state.targetSpread = state.exploded ? 2.1 : 1;
    state.vx = state.vy = 0;
    sfx.play('release', { gain: 0.5 });
    state.dirty = true;
  }

  function setMode(mode) {
    state.mode = mode;
    hudLeft.dataset.count = '';
    updateHud();
  }

  // -------------------------------------------------------------- interaction
  pointerDrag(canvas, {
    onStart: () => {
      state.dragging = true;
      state.vx = state.vy = 0;
      shell.classList.add('is-dragging');
      sfx.play('tick', { gain: 0.4 });
    },
    onMove: (s) => {
      const dx = s.dx, dy = s.dy;
      s.dx = 0; s.dy = 0;
      state.targetRotY = clamp(state.targetRotY + dx * 0.35, -82, 82);
      state.targetRotX = clamp(state.targetRotX - dy * 0.3, -78, 22);
      state.vx = dx * 0.35;
      state.vy = -dy * 0.3;
      state.dirty = true;
    },
    onEnd: (s) => {
      state.dragging = false;
      shell.classList.remove('is-dragging');
      if (Math.abs(s.dx) + Math.abs(s.dy) < 4 && opts.inertia !== false) {
        // treated as a click on empty space: advance focus
        if (s.dx === 0 && s.dy === 0) return;
      }
      if (Math.abs(state.vx) + Math.abs(state.vy) > 0.2) sfx.play('swipe', { gain: 0.35, dir: state.vx > 0 ? 'right' : 'left' });
    }
  });

  canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    e.preventDefault();
    if (e.shiftKey) {
      state.targetZoom = clamp(state.targetZoom + (e.deltaY > 0 ? -0.06 : 0.06), 0.55, 1.9);
    } else {
      state.targetSpread = clamp(state.targetSpread + (e.deltaY > 0 ? -0.09 : 0.09), 0.45, 3.2);
    }
    sfx.haptic('tick');
    state.dirty = true;
  }, { passive: false });

  const onKey = (e) => {
    if (!shell.contains(document.activeElement) && document.activeElement !== shell) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { focusIndex(Math.min(state.layers.length - 1, state.focused + 1), true); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { focusIndex(Math.max(0, state.focused - 1), true); e.preventDefault(); }
    else if (e.key.toLowerCase() === 'e') { toggleExplode(); }
    else if (e.key.toLowerCase() === 'r') { resetCamera(); }
    else if (e.key === 'Enter') { opts.onOpen?.(state.layers[state.focused]?.item, state.focused); }
  };
  shell.addEventListener('keydown', onKey);

  // parallax
  const onMove = (e) => {
    if (state.dragging || opts.parallax === false) return;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    state.parallaxX = px;
    state.parallaxY = py;
    state.dirty = true;
  };
  canvas.addEventListener('pointermove', onMove);

  // ------------------------------------------------------------------- loop
  let last = performance.now();
  const stopLoop = rafLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!state.dragging) {
      // inertia
      if (Math.abs(state.vx) > 0.02 || Math.abs(state.vy) > 0.02) {
        state.targetRotY = clamp(state.targetRotY + state.vx, -82, 82);
        state.targetRotX = clamp(state.targetRotX + state.vy, -78, 22);
        state.vx *= 0.9;
        state.vy *= 0.9;
        state.dirty = true;
      }
      if (opts.parallax !== false && (state.parallaxX || state.parallaxY)) {
        state.targetRotY += (state.parallaxX * 6 + DEFAULTS.rotY - state.targetRotY) * 0.04;
        state.targetRotX += (state.parallaxY * -5 + DEFAULTS.rotX - state.targetRotX) * 0.04;
        state.dirty = true;
      }
    }

    const k = 1 - Math.exp(-dt * 9);
    const before = `${state.rotX.toFixed(2)}|${state.rotY.toFixed(2)}|${state.zoom.toFixed(3)}|${state.spread.toFixed(3)}`;
    state.rotX = lerp(state.rotX, state.targetRotX, k);
    state.rotY = lerp(state.rotY, state.targetRotY, k);
    state.zoom = lerp(state.zoom, state.targetZoom, k);
    state.spread = lerp(state.spread, state.targetSpread, k);
    const after = `${state.rotX.toFixed(2)}|${state.rotY.toFixed(2)}|${state.zoom.toFixed(3)}|${state.spread.toFixed(3)}`;
    if (before !== after) state.dirty = true;

    if (state.dirty) {
      stage.style.transform = stageTransform();
      gizmo.style.transform = `rotateX(${-state.rotX}deg) rotateY(${-state.rotY}deg)`;
      applyLayerLayout();
      state.dirty = false;
    }
  });

  // -------------------------------------------------------------------- init
  buildLayers();
  focusIndex(0, false);
  if (state.layers.length > 1) showFocusbar();
  const ro = new ResizeObserver(() => measure());
  ro.observe(canvas);

  const api = {
    el: shell,
    state,
    focusIndex,
    toggleExplode,
    resetCamera,
    setMode,
    setItems(next) {
      items.length = 0;
      items.push(...next);
      state.focused = 0;
      buildLayers();
      focusIndex(0, false);
      showFocusbar();
      updateHud();
    },
    setRotation(rx, ry) {
      state.targetRotX = rx; state.targetRotY = ry; state.dirty = true;
    },
    redraw() { state.layers.forEach(drawLayer); state.dirty = true; },
    destroy() {
      stopLoop();
      ro.disconnect();
      shell.remove();
    }
  };

  return api;
}

// ------------------------------------------------------------------ gizmo
function buildGizmo() {
  const el = h('div', { class: 'stack-gizmo' });
  const svg = h('svg', { viewBox: '-40 -40 80 80' });
  const axes = [
    { label: 'X', color: 'var(--accent)', d: 'M0 0h30' },
    { label: 'Z', color: 'var(--accent-2)', d: 'M0 0l-16 12' },
    { label: 'Y', color: 'var(--accent-3)', d: 'M0 0v-30' }
  ];
  for (const a of axes) {
    const path = h('path', { d: a.d, stroke: a.color, fill: 'none', 'stroke-width': '1.2', opacity: '0.85' });
    svg.appendChild(path);
  }
  const labels = [
    { t: 'ranker', x: 32, y: 3 },
    { t: 'trait', x: -26, y: 18 },
    { t: 'target', x: -2, y: -32 }
  ];
  for (const l of labels) {
    svg.appendChild(h('text', { x: l.x, y: l.y, 'text-anchor': 'middle' }, l.t));
  }
  el.appendChild(svg);
  return el;
}

export function mountStackInto(container, cfg) {
  return createStack(container, cfg);
}
