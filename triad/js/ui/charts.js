// ---------------------------------------------------------------------------
// charts.js — dependency-free visualisations: radar, bars, 3D scatter,
// gauges, donuts, heat grids, distributions, treemaps, line charts.
// ---------------------------------------------------------------------------
import { h, clamp, sum, rafLoop, pointerDrag } from '../core/dom.js';
import { scoreColor, stats, normalise } from '../core/math.js';
import { icon } from './icons.js';
import { fmtScore, fmtPct } from '../core/format.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    el.setAttribute(k, String(v));
  }
  return el;
};

// ------------------------------------------------------------------- radar
export function radar({ labels = [], series = [], size = 260, max = 10, showAxis = true } = {}) {
  const pad = 34;
  const r = (size - pad * 2) / 2;
  const cx = size / 2, cy = size / 2;
  const n = Math.max(labels.length, 3);
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i, t) => [cx + Math.cos(ang(i)) * r * t, cy + Math.sin(ang(i)) * r * t];

  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
  const defs = svg('defs');
  series.forEach((s, si) => {
    const grad = svg('radialGradient', { id: `radarGrad${si}-${Math.random().toString(36).slice(2, 7)}` });
    grad.append(
      svg('stop', { offset: '0%', 'stop-color': s.color || 'var(--accent)', 'stop-opacity': '0.42' }),
      svg('stop', { offset: '100%', 'stop-color': s.color || 'var(--accent)', 'stop-opacity': '0.06' })
    );
    defs.appendChild(grad);
    s._gradId = grad.id;
  });
  root.appendChild(defs);

  // rings
  for (let ring = 1; ring <= 4; ring++) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(point(i, ring / 4).join(','));
    root.appendChild(svg('polygon', {
      points: pts.join(' '), class: 'radar-grid', 'stroke-dasharray': ring === 4 ? '0' : '2 3'
    }));
  }

  // axes + labels
  for (let i = 0; i < n; i++) {
    const [x, y] = point(i, 1);
    root.appendChild(svg('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'radar-axis' }));
    if (showAxis) {
      const [lx, ly] = point(i, 1.14);
      const text = svg('text', {
        x: lx, y: ly, class: 'radar-label',
        'text-anchor': lx > cx + 4 ? 'start' : lx < cx - 4 ? 'end' : 'middle',
        'dominant-baseline': 'middle'
      });
      text.textContent = String(labels[i] || '').slice(0, 13);
      root.appendChild(text);
    }
  }

  // series
  series.forEach((s) => {
    const values = s.values || [];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = clamp(Number(values[i] ?? 0) / max, 0, 1);
      pts.push(point(i, Math.max(v, 0.02)));
    }
    root.appendChild(svg('polygon', {
      points: pts.map(p => p.join(',')).join(' '),
      fill: `url(#${s._gradId})`,
      stroke: s.color || 'var(--accent)',
      'stroke-width': s.width || 1.4,
      'stroke-linejoin': 'round',
      opacity: s.opacity ?? 1
    }));
    if (s.dots !== false) {
      pts.forEach(([x, y]) => root.appendChild(svg('circle', {
        cx: x, cy: y, r: 2.1, fill: s.color || 'var(--accent)', stroke: '#06100d', 'stroke-width': '0.8'
      })));
    }
  });

  return root;
}

// -------------------------------------------------------------------- bars
export function bars(rows, {
  max = null, colorFor = null, showValue = true, suffix = '', labelWidth = '132px',
  onClick = null, ghost = null
} = {}) {
  const wrap = h('div', { class: 'bars' });
  const maxValue = max ?? Math.max(...rows.map(r => r.value || 0), 1);
  for (const row of rows) {
    const pct = clamp((row.value || 0) / (maxValue || 1), 0, 1);
    const color = colorFor ? colorFor(row) : 'var(--accent)';
    const bar = h('div', { class: 'bar-row', style: { gridTemplateColumns: `${labelWidth} minmax(0,1fr) 52px` } },
      h('div', { class: 'bar-row__label' }, row.icon || null, h('span', { class: 'name', title: row.label }, row.label)),
      h('div', { class: 'bar-row__track' },
        h('div', {
          class: 'bar-row__fill',
          style: { width: `${pct * 100}%`, '--bar-color': color }
        }),
        row.ghost !== undefined && ghost !== false
          ? h('div', { class: 'bar-row__ghost', style: { left: `${clamp(row.ghost / maxValue, 0, 1) * 100}%` } })
          : null
      ),
      h('div', { class: 'bar-row__value' }, showValue ? `${fmtScore(row.value)}${suffix}` : '')
    );
    if (onClick) {
      bar.style.cursor = 'pointer';
      bar.addEventListener('click', () => onClick(row));
    }
    wrap.appendChild(bar);
  }
  return wrap;
}

// ------------------------------------------------------------------- gauge
export function gauge({ value = 0, max = 1, label = '', size = 120, color = 'var(--accent)', thickness = 8 } = {}) {
  const r = size / 2 - thickness;
  const c = 2 * Math.PI * r;
  const pct = clamp(value / (max || 1), 0, 1);
  const wrap = h('div', { class: 'gauge', style: { width: `${size}px`, height: `${size}px`, '--gauge-color': color } });
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  s.appendChild(svg('circle', { cx: size / 2, cy: size / 2, r, class: 'gauge__track', 'stroke-width': thickness }));
  const arc = svg('circle', {
    cx: size / 2, cy: size / 2, r, class: 'gauge__arc', 'stroke-width': thickness,
    'stroke-dasharray': `${c}`, 'stroke-dashoffset': `${c * (1 - pct)}`
  });
  s.appendChild(arc);
  wrap.appendChild(s);
  wrap.appendChild(h('div', { class: 'gauge__text' },
    h('b', {}, `${Math.round(pct * 100)}`),
    h('span', {}, label || '%')
  ));
  return wrap;
}

// ------------------------------------------------------------------- donut
export function donut({ segments = [], size = 108, thickness = 10, centerLabel = '', centerValue = '' } = {}) {
  const r = size / 2 - thickness;
  const c = 2 * Math.PI * r;
  const total = sum(segments.map(s => s.value)) || 1;
  const wrap = h('div', { class: 'donut-wrap' });
  const donutEl = h('div', { class: 'donut', style: { width: `${size}px`, height: `${size}px` } });
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  s.appendChild(svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'rgba(255,255,255,0.06)', 'stroke-width': thickness }));
  let offset = 0;
  segments.forEach((seg) => {
    const frac = seg.value / total;
    const el = svg('circle', {
      cx: size / 2, cy: size / 2, r, fill: 'none',
      stroke: seg.color || 'var(--accent)', 'stroke-width': thickness,
      'stroke-dasharray': `${c * frac} ${c}`,
      'stroke-dashoffset': `${-offset}`,
      'stroke-linecap': 'butt',
      transform: `rotate(-90 ${size / 2} ${size / 2})`
    });
    el.appendChild(svg('title')).textContent = `${seg.label}: ${Math.round(frac * 100)}%`;
    s.appendChild(el);
    offset += c * frac;
  });
  donutEl.appendChild(s);
  donutEl.appendChild(h('div', { class: 'donut__center' },
    h('b', {}, centerValue || `${segments.length}`),
    h('span', {}, centerLabel || 'total')
  ));
  wrap.appendChild(donutEl);
  wrap.appendChild(h('div', { class: 'donut__legend' },
    ...segments.map(seg => h('div', {},
      h('i', { style: { background: seg.color || 'var(--accent)' } }),
      h('span', {}, seg.label),
      h('b', {}, String(Math.round((seg.value / total) * 100)) + '%')
    ))
  ));
  return wrap;
}

// --------------------------------------------------------------- distribution
export function distribution({ values = [], bins = 10, height = 90, color = 'var(--accent)' }) {
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const idx = clamp(Math.floor((Number(v) / 10) * bins), 0, bins - 1);
    counts[idx]++;
  }
  const max = Math.max(...counts, 1);
  const wrap = h('div', { class: 'dist', style: { height: `${height}px` } });
  counts.forEach((count, i) => {
    const b = h('div', { class: 'dist__bin', title: `${(i * (10 / bins)).toFixed(1)}–${((i + 1) * (10 / bins)).toFixed(1)} · ${count}` },
      h('i', { style: { height: `${Math.max((count / max) * 100, 2)}%`, background: scoreColor(i / (bins - 1), 1) } })
    );
    wrap.appendChild(b);
  });
  return wrap;
}

// ------------------------------------------------------------------- heatgrid
export function heatGrid({ rows = [], cols = [], value, cellSize = 26, showLabels = true }) {
  const wrap = h('div', {
    class: 'heatgrid',
    style: {
      gridTemplateColumns: `${showLabels ? 'minmax(70px,110px)' : ''} repeat(${cols.length}, minmax(${cellSize}px, 1fr))`,
      gap: '2px'
    }
  });
  if (showLabels) wrap.appendChild(h('div'));
  for (const col of cols) {
    wrap.appendChild(h('div', { class: 'heatgrid__label', style: { justifyContent: 'center', fontSize: '8px' }, title: col.fullName || col.name },
      (col.fullName || col.name || '').slice(0, 8)
    ));
  }
  for (const row of rows) {
    if (showLabels) wrap.appendChild(h('div', { class: 'heatgrid__label', title: row.fullName || row.name },
      (row.fullName || row.name || '').slice(0, 14)
    ));
    for (const col of cols) {
      const v = value(row, col);
      const t = v === null || v === undefined ? null : normalise(Number(v), 0, 10);
      const cell = h('div', {
        class: 'heatgrid__cell',
        style: t === null ? { background: 'rgba(255,255,255,0.025)' } : { background: scoreColor(t, 0.88) },
        title: v === null || v === undefined ? 'unrated' : fmtScore(v)
      }, t === null ? '' : fmtScore(v, 0));
      wrap.appendChild(cell);
    }
  }
  return wrap;
}

// -------------------------------------------------------------------- treemap
export function treemap({ items = [], height = 220 }) {
  const wrap = h('div', { class: 'treemap', style: { height: `${height}px` } });
  const total = sum(items.map(i => i.value)) || 1;
  // squarified-ish slice and dice
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const rects = [];
  let x = 0, y = 0, w = 100, hgt = 100;
  let remaining = total;
  const split = (list, area) => {
    if (!list.length) return;
    if (list.length === 1) { rects.push({ item: list[0], x, y, w, h: hgt }); return; }
    const half = sum(list.map(i => i.value)) / 2;
    let acc = 0, idx = 0;
    for (; idx < list.length - 1; idx++) {
      if (acc + list[idx].value > half) break;
      acc += list[idx].value;
    }
    const a = list.slice(0, Math.max(idx, 1));
    const b = list.slice(Math.max(idx, 1));
    const frac = sum(a.map(i => i.value)) / area;
    if (w >= hgt) {
      const aw = w * frac;
      const px = x, py = y, pw = aw, ph = hgt;
      const saveX = x, saveW = w;
      x = px; y = py; w = pw; hgt = ph;
      split(a, area * frac);
      const bx = px + pw, bw = saveW - pw;
      x = bx; y = py; w = bw; hgt = ph;
      split(b, area * (1 - frac));
      x = saveX; w = saveW;
    } else {
      const ah = hgt * frac;
      const saveY = y, saveH = hgt;
      const px = x, pw = w;
      x = px; y = saveY; w = pw; hgt = ah;
      split(a, area * frac);
      y = saveY + ah; hgt = saveH - ah; x = px; w = pw;
      split(b, area * (1 - frac));
      y = saveY; hgt = saveH;
    }
  };
  split(sorted, total);
  for (const r of rects) {
    const t = clamp((r.item.value - Math.min(...items.map(i => i.value))) / ((Math.max(...items.map(i => i.value)) - Math.min(...items.map(i => i.value))) || 1), 0, 1);
    const cell = h('div', {
      class: 'treemap__cell',
      style: {
        left: `calc(${r.x}% + 2px)`, top: `calc(${r.y}% + 2px)`,
        width: `calc(${r.w}% - 4px)`, height: `calc(${r.h}% - 4px)`,
        background: scoreColor(t, 0.92)
      },
      title: `${r.item.label}: ${fmtScore(r.item.value)}`
    },
      h('b', {}, r.item.label),
      h('span', {}, fmtScore(r.item.value))
    );
    cell.addEventListener('click', () => r.item.onClick?.());
    wrap.appendChild(cell);
  }
  return wrap;
}

// ---------------------------------------------------------------- scatter 3d
export function scatter3d({ points = [], height = 380, axisLabels = ['X', 'Y', 'Z'], onPick = null } = {}) {
  const el = h('div', { class: 'scatter-wrap', style: { height: `${height}px` } });
  const canvas = h('canvas');
  const tip = h('div', { class: 'scatter-tip' });
  const legend = h('div', { class: 'scatter-legend' },
    h('span', {}, 'drag to orbit'), h('span', {}, 'wheel to zoom')
  );
  el.append(canvas, tip, legend);

  let yaw = -0.6, pitch = 0.34, dist = 2.6;
  let targetYaw = yaw, targetPitch = pitch, targetDist = dist;
  let hovered = null;
  let width = 0, hgt = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let projected = [];

  function resize() {
    const r = el.getBoundingClientRect();
    width = Math.max(r.width, 100);
    hgt = Math.max(r.height, 100);
    canvas.width = width * dpr;
    canvas.height = hgt * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${hgt}px`;
  }

  function project(p, rot) {
    const [x, y, z] = [p.x - 0.5, p.y - 0.5, p.z - 0.5];
    // yaw around Y
    const cx = Math.cos(rot.yaw), sx = Math.sin(rot.yaw);
    let X = x * cx - z * sx;
    let Z = x * sx + z * cx;
    // pitch around X
    const cp = Math.cos(rot.pitch), sp = Math.sin(rot.pitch);
    const Y = y * cp - Z * sp;
    Z = y * sp + Z * cp;
    const f = 1.9 / (dist + Z * 1.4);
    return {
      sx: width / 2 + X * width * 0.42 * f,
      sy: hgt / 2 + Y * width * 0.42 * f,
      depth: Z,
      scale: f
    };
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, hgt);

    const rot = { yaw, pitch };
    // box edges
    const edges = [
      [[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]], [[0, 0, 1], [1, 0, 1]], [[0, 1, 1], [1, 1, 1]],
      [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]], [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]],
      [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]]
    ];
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    for (const [a, b] of edges) {
      const pa = project({ x: a[0], y: a[1], z: a[2] }, rot);
      const pb = project({ x: b[0], y: b[1], z: b[2] }, rot);
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }

    // floor grid
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const a = project({ x: t, y: 0, z: 0 }, rot);
      const b = project({ x: t, y: 0, z: 1 }, rot);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      const c = project({ x: 0, y: 0, z: t }, rot);
      const d = project({ x: 1, y: 0, z: t }, rot);
      ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke();
    }

    projected = points.map(p => ({ p, ...project(p, rot) })).sort((a, b) => a.depth - b.depth);

    for (const q of projected) {
      const isHover = hovered && hovered.p === q.p;
      const radius = clamp(4.4 * (q.scale / 0.9), 2.4, 8) * (isHover ? 1.5 : 1);
      const color = q.p.color || 'rgba(94,242,214,0.9)';

      // drop line to floor
      const floor = project({ x: q.p.x, y: 0, z: q.p.z }, rot);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(q.sx, q.sy);
      ctx.lineTo(floor.sx, floor.sy);
      ctx.stroke();

      const grad = ctx.createRadialGradient(q.sx, q.sy, 0, q.sx, q.sy, radius * 3);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, radius * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(3,8,10,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (isHover) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(q.p.label || '', q.sx, q.sy - radius - 7);
      }
    }

    // axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    const ax = project({ x: 1.08, y: 0, z: 0 }, rot);
    ctx.fillText(axisLabels[0], ax.sx, ax.sy);
    const ay = project({ x: 0, y: 1.08, z: 0 }, rot);
    ctx.fillText(axisLabels[1], ay.sx, ay.sy);
    const az = project({ x: 0, y: 0, z: 1.08 }, rot);
    ctx.fillText(axisLabels[2], az.sx, az.sy);
  }

  pointerDrag(el, {
    axis: 'both',
    onStart: () => { el.classList.add('is-dragging'); },
    onMove: (s) => {
      targetYaw += s.dx * 0.008;
      targetPitch = clamp(targetPitch + s.dy * 0.006, -0.2, 1.3);
      s.dx = 0; s.dy = 0;
    },
    onEnd: () => { el.classList.remove('is-dragging'); }
  });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    targetDist = clamp(targetDist + e.deltaY * 0.0016, 1.2, 5.2);
  }, { passive: false });

  el.addEventListener('pointermove', (e) => {
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bestD = 16;
    for (const q of projected) {
      const d = Math.hypot(q.sx - mx, q.sy - my);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best !== hovered) {
      hovered = best;
      if (best) {
        tip.textContent = `${best.p.label || ''} ${best.p.meta ? `· ${best.p.meta}` : ''}`;
        tip.style.left = `${clamp(best.sx + 10, 4, width - 150)}px`;
        tip.style.top = `${clamp(best.sy - 22, 4, hgt - 26)}px`;
        tip.classList.add('is-on');
      } else tip.classList.remove('is-on');
    }
  });
  el.addEventListener('click', () => { if (hovered) onPick?.(hovered.p); });

  const ro = new ResizeObserver(() => { resize(); draw(); });
  ro.observe(el);
  const stop = rafLoop(() => {
    const k = 0.12;
    const dy = (targetYaw - yaw), dp = (targetPitch - pitch), dd = (targetDist - dist);
    if (Math.abs(dy) < 0.0004 && Math.abs(dp) < 0.0004 && Math.abs(dd) < 0.0004) return;
    yaw += dy * k; pitch += dp * k; dist += dd * k;
    draw();
  });
  resize();
  requestAnimationFrame(() => draw());

  return {
    el,
    redraw(points2) { points = points2 || points; draw(); },
    destroy() { stop(); ro.disconnect(); }
  };
}

// ---------------------------------------------------------------- line chart
export function lineChart({ series = [], height = 160, yMax = null, showAxis = true, fill = true } = {}) {
  const el = h('div', { style: { height: `${height}px`, position: 'relative' } });
  const w = 320, hgt = height;
  const s = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: 'none', style: { width: '100%', height: '100%' } });
  const all = series.flatMap(x => x.values);
  const max = yMax ?? Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const pad = 6;
  const px = (i, n) => pad + (i / Math.max(n - 1, 1)) * (w - pad * 2);
  const py = (v) => hgt - pad - ((v - min) / (max - min || 1)) * (hgt - pad * 2);

  if (showAxis) {
    for (let i = 0; i <= 3; i++) {
      const y = pad + (i / 3) * (hgt - pad * 2);
      s.appendChild(svg('line', { x1: 0, y1: y, x2: w, y2: y, stroke: 'rgba(255,255,255,0.05)' }));
    }
  }

  series.forEach((ser, si) => {
    const color = ser.color || 'var(--accent)';
    const pts = ser.values.map((v, i) => [px(i, ser.values.length), py(v)]);
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    if (fill) {
      const id = `lg-${si}-${Math.random().toString(36).slice(2, 6)}`;
      const defs = svg('defs');
      const grad = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.append(
        svg('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.35' }),
        svg('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' })
      );
      defs.appendChild(grad);
      s.appendChild(defs);
      s.appendChild(svg('path', {
        d: `${d} L${w - pad},${hgt - pad} L${pad},${hgt - pad} Z`, fill: `url(#${id})`, stroke: 'none'
      }));
    }
    s.appendChild(svg('path', {
      d, fill: 'none', stroke: color, 'stroke-width': ser.width || 1.6,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));
    if (ser.dot) {
      const last = pts[pts.length - 1];
      s.appendChild(svg('circle', { cx: last[0], cy: last[1], r: 2.4, fill: color }));
    }
  });
  el.appendChild(s);
  return el;
}

// ------------------------------------------------------------- agreement grid
export function agreementGrid({ cube, onPick = null }) {
  const people = cube.people;
  const wrap = h('div', { style: { overflowX: 'auto' } });
  const table = h('table', { class: 'matrix', style: { '--cell': '30px', '--head-w': '118px', '--head-h': '90px' } });
  const thead = h('thead');
  const hr = h('tr');
  hr.appendChild(h('th', {}));
  for (const p of people) {
    hr.appendChild(h('th', {}, h('div', { class: 'col-head' },
      h('div', { class: 'col-head__name' }, p.fullName),
      h('div', { class: 'col-head__meta' }, '·')
    )));
  }
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = h('tbody');
  for (const a of people) {
    const tr = h('tr');
    tr.appendChild(h('th', {}, h('div', { class: 'row-head' }, h('div', { class: 'row-head__txt' }, h('b', {}, a.fullName)))));
    for (const b of people) {
      const td = h('td');
      if (a.id === b.id) {
        td.appendChild(h('div', { class: 'cell cell--diag' }));
      } else {
        const ag = cube.agreement(a.id, b.id);
        const t = clamp((ag.r + 1) / 2, 0, 1);
        const cell = h('div', {
          class: 'cell',
          style: { background: ag.n >= 2 ? scoreColor(t, 0.85) : 'rgba(255,255,255,0.02)', fontSize: '9px' },
          title: `${a.fullName} ↔ ${b.fullName}\nr=${ag.r.toFixed(2)} · n=${ag.n}`
        }, ag.n >= 2 ? (ag.r * 100).toFixed(0) : '');
        cell.addEventListener('click', () => onPick?.(a, b, ag));
        td.appendChild(cell);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ---------------------------------------------------------------- sparkline
export function sparkline(values, { width = 60, height = 22, color = 'var(--accent)', fill = false } = {}) {
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', width, height, class: 'spark' });
  if (!values.length) return s;
  const max = Math.max(...values), min = Math.min(...values);
  const px = (i) => (i / Math.max(values.length - 1, 1)) * width;
  const py = (v) => height - ((v - min) / (max - min || 1)) * height;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  if (fill) {
    s.appendChild(svg('path', { d: `${d} L${width},${height} L0,${height} Z`, fill: color, opacity: '0.15' }));
  }
  s.appendChild(svg('path', { d, fill: 'none', stroke: color, 'stroke-width': '1.4', 'stroke-linecap': 'round' }));
  return s;
}

// ------------------------------------------------------------------ chart box
export function chartBox({ title = '', iconName = 'analytics', sub = null, actions = null, body = null, height = 240, foot = null }) {
  const el = h('div', { class: 'chart' });
  el.appendChild(h('div', { class: 'chart__head' },
    h('div', { class: 'chart__title' }, icon(iconName, { size: 14 }), title),
    actions ? h('div', { class: 'flex items-center gap-1' }, actions) : (sub ? h('span', { class: 'chart__sub' }, sub) : null)
  ));
  const bodyEl = h('div', { class: 'chart__body', style: height ? { height: `${height}px`, flex: '0 0 auto' } : null });
  if (body) bodyEl.appendChild(body);
  el.appendChild(bodyEl);
  if (foot) el.appendChild(h('div', { class: 'chart__foot' }, foot));
  return { el, body: bodyEl };
}
