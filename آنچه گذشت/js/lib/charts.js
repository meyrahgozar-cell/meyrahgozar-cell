/* Hand-drawn canvas charts — no chart library. */
import { qs } from './dom.js';

const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function themeOf(node) {
  const cs = getComputedStyle(node);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim();
  return {
    ink: pick('--ink', '#eee'),
    muted: pick('--muted', '#999'),
    faint: pick('--faint', '#777'),
    accent: pick('--accent', '#4fcf9f'),
    line: pick('--line', 'rgba(255,255,255,.1)'),
    surface3: pick('--surface-3', '#222'),
    display: pick('--font-sans', 'sans-serif'),
  };
}

let tipEl = null;
function tooltip(text, x, y) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    document.body.appendChild(tipEl);
  }
  tipEl.textContent = text;
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${y}px`;
  tipEl.hidden = false;
}
function hideTip() { if (tipEl) tipEl.hidden = true; }

function mount(canvas, draw) {
  let raf = 0;
  const render = (progress = 1) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = DPR();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    draw(ctx, rect.width, rect.height, themeOf(canvas), progress);
  };

  const start = () => {
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 620);
      render(easeOut(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  const ro = new ResizeObserver(() => render(1));
  ro.observe(canvas.parentElement || canvas);
  start();
  const redraw = () => render(1);
  canvas.__redraw = redraw;
  return { redraw, start };
}

export function barChart(canvas, { items = [], valueKey = 'value', labelKey = 'label', suffix = '' } = {}) {
  const geo = [];
  const chart = mount(canvas, (ctx, w, h, t, p) => {
    geo.length = 0;
    const padL = 4; const padR = 4; const padB = 22; const padT = 10;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const max = Math.max(1, ...items.map((d) => d[valueKey]));
    const n = Math.max(items.length, 1);
    const slot = innerW / n;
    const bw = Math.max(3, Math.min(28, slot * 0.52));

    ctx.strokeStyle = t.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + innerH + 0.5);
    ctx.lineTo(w - padR, padT + innerH + 0.5);
    ctx.stroke();

    items.forEach((d, i) => {
      const v = d[valueKey];
      const bh = (v / max) * innerH * p;
      const x = padL + slot * i + (slot - bw) / 2;
      const y = padT + innerH - bh;
      geo.push({ x: x + bw / 2, y, w: slot, d });

      const isMax = v === max && v > 0;
      ctx.fillStyle = v === 0 ? t.surface3 : (isMax ? t.accent : hexA(t.accent, 0.42));
      roundRect(ctx, x, y, bw, Math.max(bh, v > 0 ? 2 : 1.5), Math.min(4, bw / 2));
      ctx.fill();

      if (n <= 14 || i % Math.ceil(n / 12) === 0) {
        ctx.fillStyle = t.faint;
        ctx.font = `500 10px ${t.display}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(d[labelKey]).slice(0, 3), clampText(x + bw / 2, 10, w - 10), h - 6);
      }
    });
  });

  const move = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const hit = geo.find((g) => Math.abs(g.x - x) < g.w / 2);
    if (!hit) { hideTip(); return; }
    tooltip(`${hit.d[labelKey]} · ${hit.d[valueKey]}${suffix}`, r.left + hit.x, r.top + hit.y);
  };
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseleave', hideTip);
  return chart;
}

export function lineChart(canvas, { items = [], valueKey = 'value', labelKey = 'label' } = {}) {
  const geo = [];
  const chart = mount(canvas, (ctx, w, h, t, p) => {
    geo.length = 0;
    const padL = 6; const padR = 6; const padT = 14; const padB = 22;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const max = Math.max(1, ...items.map((d) => d[valueKey]));
    const n = Math.max(items.length - 1, 1);
    const pt = (i, v) => [padL + (innerW / n) * i, padT + innerH - (v / max) * innerH * p];

    if (!items.length) return;

    const pts = items.map((d, i) => ({ ...d, pt: pt(i, d[valueKey]) }));
    geo.push(...pts.map((q) => ({ x: q.pt[0], y: q.pt[1], d: q })));

    const grad = ctx.createLinearGradient(0, padT, 0, padT + innerH);
    grad.addColorStop(0, hexA(t.accent, 0.26));
    grad.addColorStop(1, hexA(t.accent, 0));

    ctx.beginPath();
    ctx.moveTo(pts[0].pt[0], padT + innerH);
    pts.forEach((q, i) => {
      if (i === 0) ctx.lineTo(q.pt[0], q.pt[1]);
      else {
        const prev = pts[i - 1].pt;
        const cx = (prev[0] + q.pt[0]) / 2;
        ctx.bezierCurveTo(cx, prev[1], cx, q.pt[1], q.pt[0], q.pt[1]);
      }
    });
    ctx.lineTo(pts[pts.length - 1].pt[0], padT + innerH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((q, i) => {
      if (i === 0) ctx.moveTo(q.pt[0], q.pt[1]);
      else {
        const prev = pts[i - 1].pt;
        const cx = (prev[0] + q.pt[0]) / 2;
        ctx.bezierCurveTo(cx, prev[1], cx, q.pt[1], q.pt[0], q.pt[1]);
      }
    });
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.pt[0], last.pt[1], 3.4, 0, Math.PI * 2);
    ctx.fillStyle = t.accent;
    ctx.fill();
    ctx.strokeStyle = t.surface3;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = t.faint;
    ctx.font = `500 10px ${t.display}`;
    ctx.textAlign = 'center';
    const stride = Math.ceil(items.length / 6);
    items.forEach((d, i) => {
      if (i % stride === 0 || i === items.length - 1) {
        ctx.textAlign = i === 0 ? 'left' : (i === items.length - 1 ? 'right' : 'center');
        ctx.fillText(String(d[labelKey]).slice(0, 6), pt(i, 0)[0], h - 6);
      }
    });
    ctx.textAlign = 'center';
  });

  const move = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    let best = null; let dist = Infinity;
    geo.forEach((g) => { const d = Math.abs(g.x - x); if (d < dist) { dist = d; best = g; } });
    if (!best || dist > 40) { hideTip(); return; }
    tooltip(`${best.d[labelKey]} · ${best.d[valueKey]}`, r.left + best.x, r.top + best.y);
  };
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseleave', hideTip);
  return chart;
}

export function donutChart(canvas, { segments = [], centerLabel = '', centerValue = '' } = {}) {
  return mount(canvas, (ctx, w, h, t, p) => {
    const cx = w / 2; const cy = h / 2;
    const r = Math.min(w, h) / 2 - 8;
    const thickness = Math.max(12, r * 0.34);
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let angle = -Math.PI / 2;

    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(cx, cy, r - thickness / 2, 0, Math.PI * 2);
    ctx.strokeStyle = t.surface3;
    ctx.lineWidth = thickness;
    ctx.stroke();

    segments.forEach((s) => {
      const slice = (s.value / total) * Math.PI * 2 * p;
      if (slice <= 0) return;
      ctx.beginPath();
      ctx.arc(cx, cy, r - thickness / 2, angle + 0.012, angle + slice - 0.012);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.stroke();
      angle += slice;
    });

    if (centerValue) {
      ctx.textAlign = 'center';
      ctx.fillStyle = t.ink;
      ctx.font = `600 ${Math.round(r * 0.42)}px ${getComputedStyle(canvas).getPropertyValue('--font-display') || 'serif'}`;
      ctx.fillText(centerValue, cx, cy + 4);
      ctx.fillStyle = t.faint;
      ctx.font = `600 9px ${t.display}`;
      ctx.fillText(String(centerLabel).toUpperCase(), cx, cy + r * 0.38 + 8);
    }
  });
}

export function sparkline(canvas, values = []) {
  return mount(canvas, (ctx, w, h, t) => {
    if (!values.length) return;
    const max = Math.max(1, ...values);
    const step = w / Math.max(1, values.length - 1);
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = step * i;
      const y = h - 3 - (v / max) * (h - 6);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = hexA(t.accent, 0.8);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const clampText = (v, min, max) => Math.min(max, Math.max(min, v));

function hexA(color, alpha) {
  const c = String(color).trim();
  if (c.startsWith('#')) {
    const hex = c.length === 4
      ? c.slice(1).split('').map((x) => x + x).join('')
      : c.slice(1);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  if (c.startsWith('rgb')) return c.replace(/rgba?\(([^)]+)\)/, (_, inner) => {
    const parts = inner.split(',').map((s) => s.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  });
  return c;
}

/** Re-render every chart on the page after a theme change. */
export function redrawAll() {
  document.querySelectorAll('canvas.chart-canvas').forEach((c) => {
    c.__redraw?.();
  });
}

export function initCharts(root = document) {
  qs('.kpis', root);
}
