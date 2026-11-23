// ---------------------------------------------------------------------------
// fx.js — ambient particle field, pointer tilt, score pops, confetti sparks.
// ---------------------------------------------------------------------------
import { h, clamp, rafLoop } from '../core/dom.js';
import { sfx } from './sounds.js';

let canvas = null;
let ctx = null;
let particles = [];
let stopLoop = null;
let pointer = { x: 0.5, y: 0.5 };

export function initFx() {
  canvas = document.getElementById('fx');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  buildParticles();
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth;
    pointer.y = e.clientY / window.innerHeight;
  }, { passive: true });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  stopLoop = rafLoop(step);
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function buildParticles() {
  const count = clamp(Math.round((window.innerWidth * window.innerHeight) / 26000), 24, 90);
  particles = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: 0.3 + Math.random() * 0.7,
    vx: (Math.random() - 0.5) * 0.00012,
    vy: (Math.random() - 0.5) * 0.00012,
    r: 0.6 + Math.random() * 1.7,
    hue: Math.random() > 0.6 ? 'accent-2' : 'accent'
  }));
}

let t = 0;
function step(now) {
  if (!ctx) return;
  t += 0.004;
  const w = window.innerWidth, hh = window.innerHeight;
  ctx.clearRect(0, 0, w, hh);

  for (const p of particles) {
    p.x += p.vx + Math.sin(t + p.z * 4) * 0.00012;
    p.y += p.vy + Math.cos(t + p.z * 3) * 0.00012;
    if (p.x < -0.05) p.x = 1.05;
    if (p.x > 1.05) p.x = -0.05;
    if (p.y < -0.05) p.y = 1.05;
    if (p.y > 1.05) p.y = -0.05;

    const px = p.x * w + (pointer.x - 0.5) * 26 * p.z;
    const py = p.y * hh + (pointer.y - 0.5) * 26 * p.z;
    const alpha = 0.10 + p.z * 0.24;

    const grad = ctx.createRadialGradient(px, py, 0, px, py, p.r * 8);
    grad.addColorStop(0, `rgba(94,242,214,${alpha})`);
    grad.addColorStop(1, 'rgba(94,242,214,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, p.r * 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(210,255,246,${alpha * 1.4})`;
    ctx.beginPath();
    ctx.arc(px, py, p.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // connective lines for nearby particles (only a shallow sample)
  ctx.lineWidth = 0.5;
  for (let i = 0; i < particles.length; i += 2) {
    const a = particles[i];
    for (let j = i + 1; j < Math.min(i + 6, particles.length); j++) {
      const b = particles[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 0.12) {
        ctx.strokeStyle = `rgba(94,242,214,${(1 - d / 0.12) * 0.06})`;
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * hh);
        ctx.lineTo(b.x * w, b.y * hh);
        ctx.stroke();
      }
    }
  }
}

export function stopFx() {
  stopLoop?.();
  stopLoop = null;
}

// ------------------------------------------------------------------ tilt
export function applyTilt(el, { max = 6, scale = 1.01 } = {}) {
  const state = { rx: 0, ry: 0, trx: 0, try_: 0, active: false };
  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1);
    const py = clamp((e.clientY - r.top) / r.height, 0, 1);
    state.trx = (0.5 - py) * max * 2;
    state.try_ = (px - 0.5) * max * 2;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    if (!state.active) { state.active = true; requestAnimationFrame(loop); }
  };
  const onLeave = () => {
    state.trx = 0; state.try_ = 0;
    el.style.transform = '';
  };
  function loop() {
    state.rx += (state.trx - state.rx) * 0.14;
    state.ry += (state.try_ - state.ry) * 0.14;
    el.style.transform = `perspective(800px) rotateX(${state.rx.toFixed(2)}deg) rotateY(${state.ry.toFixed(2)}deg) scale(${scale})`;
    if (Math.abs(state.trx - state.rx) < 0.05 && Math.abs(state.try_ - state.ry) < 0.05) {
      state.active = false;
      if (!state.trx && !state.try_) el.style.transform = '';
      return;
    }
    requestAnimationFrame(loop);
  }
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
  return () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); };
}

export function magnetic(el, strength = 8) {
  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    el.style.transform = `translate(${clamp(dx, -1, 1) * strength}px, ${clamp(dy, -1, 1) * strength}px)`;
  };
  const onLeave = () => { el.style.transform = ''; };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
}

export function scorePop(x, y, value) {
  const el = h('div', { class: 'score-pop', style: { left: `${x}px`, top: `${y}px` } }, value);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 760);
}

export function flashScreen() {
  const el = h('div', { class: 'feedback-flash' });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 400);
}

export function sparkleBurst(cx = window.innerWidth / 2, cy = window.innerHeight / 2, count = 26) {
  const layer = h('canvas', { class: 'spark-layer' });
  layer.width = window.innerWidth;
  layer.height = window.innerHeight;
  document.body.appendChild(layer);
  const c = layer.getContext('2d');
  const parts = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 2 + Math.random() * 6;
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.4, life: 1, r: 1 + Math.random() * 2.4, hue: 150 + Math.random() * 90 };
  });
  const stop = rafLoop(() => {
    c.clearRect(0, 0, layer.width, layer.height);
    let alive = 0;
    for (const p of parts) {
      if (p.life <= 0) continue;
      alive++;
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.14; p.vx *= 0.99; p.life -= 0.014;
      c.fillStyle = `hsla(${p.hue}, 90%, 68%, ${clamp(p.life, 0, 1)})`;
      c.beginPath();
      c.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      c.fill();
    }
    if (!alive) { stop(); layer.remove(); }
  });
  sfx.play('sparkle', { gain: 0.5 });
}

export function pulseElement(el) {
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
    { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }
  );
}
