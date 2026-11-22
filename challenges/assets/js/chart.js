/** نمودارهای SVG بدون کتابخانه: خطی، ستونی، حلقه‌ی پیشرفت. */
import { faDigits } from './utils.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  return el;
}

function niceDomain(values) {
  if (!values.length) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  return { min: min - pad, max: max + pad };
}

/**
 * @param {object} opts {points:[{x,y,label,title}], target, height, unit, goalLabel}
 */
export function lineChart({ points, target = null, height = 260, unit = 'کیلو', labels = [] }) {
  const W = 820;
  const H = height;
  const pad = { top: 24, right: 22, bottom: 34, left: 46 };
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart-svg',
    role: 'img',
    'aria-label': 'نمودار روند وزن',
  });

  if (!points.length) {
    const t = svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chart-empty' });
    t.textContent = 'هنوز داده‌ای برای نمودار نیست';
    svg.appendChild(t);
    return svg;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  const { min: yMin, max: yMax } = niceDomain(target !== null ? [...ys, target] : ys);

  const sx = (x) => pad.left + ((x - xMin) / (xMax - xMin || 1)) * (W - pad.left - pad.right);
  const sy = (y) => pad.top + (1 - (y - yMin) / (yMax - yMin || 1)) * (H - pad.top - pad.bottom);

  // خطوط شبکه
  for (let i = 0; i <= 4; i += 1) {
    const value = yMin + ((yMax - yMin) * i) / 4;
    const y = sy(value);
    svg.appendChild(svgEl('line', { x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: 'chart-grid' }));
    const label = svgEl('text', { x: W - pad.right + 4, y: y + 4, class: 'chart-axis', 'text-anchor': 'start' });
    label.textContent = faDigits(value.toFixed(1));
    svg.appendChild(label);
  }

  // تعهد
  if (target !== null) {
    const y = sy(target);
    svg.appendChild(svgEl('line', {
      x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: 'chart-target',
    }));
    const label = svgEl('text', { x: pad.left + 6, y: y - 7, class: 'chart-target-label' });
    label.textContent = `تعهد: ${faDigits(target)} ${unit}`;
    svg.appendChild(label);
  }

  // ناحیه و خط
  const coords = points.map((p) => [sx(p.x), sy(p.y)]);
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L${coords.at(-1)[0]},${H - pad.bottom} L${coords[0][0]},${H - pad.bottom} Z`;

  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: 'lineFill', x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'var(--brand)', 'stop-opacity': '0.35' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'var(--brand)', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(svgEl('path', { d: areaPath, fill: 'url(#lineFill)' }));
  svg.appendChild(svgEl('path', { d: path, class: 'chart-line' }));

  // نقاط
  const step = Math.max(1, Math.ceil(points.length / 26));
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    const cx = sx(p.x);
    const cy = sy(p.y);
    const dot = svgEl('circle', { cx, cy, r: 3.6, class: 'chart-dot' });
    const title = svgEl('title');
    title.textContent = p.title || `${p.label || ''} — ${p.y} ${unit}`;
    dot.appendChild(title);
    svg.appendChild(dot);
    if (i === points.length - 1) {
      svg.appendChild(svgEl('circle', { cx, cy, r: 7, class: 'chart-dot-halo' }));
      const label = svgEl('text', { x: cx, y: cy - 12, class: 'chart-last-label', 'text-anchor': 'middle' });
      label.textContent = faDigits(p.y);
      svg.appendChild(label);
    }
  });

  // برچسب‌های محور افقی
  const marks = labels.length ? labels : points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 5)) === 0);
  marks.forEach((p) => {
    const text = svgEl('text', {
      x: sx(p.x), y: H - 10, class: 'chart-axis', 'text-anchor': 'middle',
    });
    text.textContent = p.label || '';
    svg.appendChild(text);
  });

  return svg;
}

export function barChart({ items, height = 200, unit = '' }) {
  const W = 820;
  const H = height;
  const pad = { top: 22, right: 16, bottom: 36, left: 40 };
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
  if (!items.length) return svg;

  const values = items.map((i) => i.value);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const zeroY = pad.top + (H - pad.top - pad.bottom) / 2;
  const scale = (H - pad.top - pad.bottom) / 2 / maxAbs;
  svg.appendChild(svgEl('line', { x1: pad.left, x2: W - pad.right, y1: zeroY, y2: zeroY, class: 'chart-grid' }));

  const slot = (W - pad.left - pad.right) / items.length;
  const barW = Math.min(38, slot * 0.55);
  items.forEach((item, i) => {
    const x = pad.left + slot * i + slot / 2;
    const h = Math.abs(item.value) * scale;
    const y = item.value >= 0 ? zeroY - h : zeroY;
    const rect = svgEl('rect', {
      x: x - barW / 2,
      y,
      width: barW,
      height: Math.max(2, h),
      rx: 6,
      class: item.value < 0 ? 'chart-bar good' : 'chart-bar bad',
    });
    const title = svgEl('title');
    title.textContent = `${item.label}: ${item.value} ${unit}`;
    rect.appendChild(title);
    svg.appendChild(rect);

    const label = svgEl('text', { x, y: H - 14, class: 'chart-axis', 'text-anchor': 'middle' });
    label.textContent = item.label;
    svg.appendChild(label);

    const val = svgEl('text', {
      x, y: item.value >= 0 ? y - 6 : y + h + 14, class: 'chart-axis strong', 'text-anchor': 'middle',
    });
    val.textContent = faDigits(item.value);
    svg.appendChild(val);
  });
  return svg;
}

export function progressRing(percent, { size = 92, stroke = 9, label = '', sub = '' } = {}) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const wrap = document.createElement('div');
  wrap.className = 'ring';
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'ring-svg' });
  svg.appendChild(svgEl('circle', {
    cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, class: 'ring-track',
  }));
  const arc = svgEl('circle', {
    cx: size / 2,
    cy: size / 2,
    r,
    fill: 'none',
    'stroke-width': stroke,
    class: 'ring-arc',
    'stroke-linecap': 'round',
    'stroke-dasharray': `${c}`,
    'stroke-dashoffset': `${c}`,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  });
  svg.appendChild(arc);
  wrap.appendChild(svg);
  const inner = document.createElement('div');
  inner.className = 'ring-label';
  inner.innerHTML = `<strong>${faDigits(label)}</strong>${sub ? `<span>${sub}</span>` : ''}`;
  wrap.appendChild(inner);
  requestAnimationFrame(() => {
    arc.style.strokeDashoffset = `${c - (p / 100) * c}`;
  });
  return wrap;
}
