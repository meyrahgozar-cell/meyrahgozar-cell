// A comet of light that runs through the mortar seams of the brick-wall background.
// Geometry matches css/base.css (48x30 tile: bricks 46x14, 2px joints, running bond).

const SEAM = 15;                                  // distance between horizontal seams
const seamY = (r) => r * SEAM + 0.5;              // centre line of seam row r
const belowType = (r) => (r % 2 === 0 ? 'A' : 'B');   // joint family of the brick row under seam r
const JOINT = { A: 1, B: 22 };                    // x of the first joint in each family (period 48)

function nextJoint(x, dir) {
  // nearest joint centre strictly ahead of x, with its family
  let best = null;
  for (const type of ['A', 'B']) {
    const base = JOINT[type];
    const k = dir > 0 ? Math.floor((x - base) / 48) + 1 : Math.ceil((x - base) / 48) - 1;
    const jx = base + k * 48;
    if (best === null || (dir > 0 ? jx < best.x : jx > best.x)) best = { x: jx, type };
  }
  return best;
}

const parseRgb = (s, fallback) => {
  const m = String(s || '').match(/\d+(\.\d+)?/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : fallback;
};

export function startBrickComets() {
  if (typeof window === 'undefined' || document.querySelector('.fx-comets')) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'fx-comets';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W = 0, H = 0, dpr = 1;
  let rgbA = [94, 184, 255], rgbB = [54, 224, 214], light = false;
  const comets = [];
  canvas.__comets = comets;                       // handy for tests

  const readTheme = () => {
    const cs = getComputedStyle(document.documentElement);
    rgbA = parseRgb(cs.getPropertyValue('--brand-rgb'), rgbA);
    rgbB = parseRgb(cs.getPropertyValue('--aqua-rgb'), rgbB);
    light = document.documentElement.getAttribute('data-theme') === 'light';
  };
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  readTheme(); resize();
  window.addEventListener('resize', resize);
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const maxComets = () => Math.max(1, Math.min(3, Math.round(W / 460)));

  function spawn(delay = 0) {
    const rows = Math.max(2, Math.floor(H / SEAM));
    const r = 1 + Math.floor(Math.random() * (rows - 1));
    const dir = Math.random() < 0.5 ? 1 : -1;
    const L = 130 + Math.random() * 130;
    const x = dir > 0 ? -L * 0.2 : W + L * 0.2;
    return {
      r, dir, x, y: seamY(r), speed: 150 + Math.random() * 130, L,
      pts: [[x, seamY(r)]], vTarget: null, wait: delay, turnP: 0.3
    };
  }

  function step(c, dt) {
    if (c.wait > 0) { c.wait -= dt; return; }
    let dist = c.speed * dt;
    while (dist > 0) {
      if (c.vTarget !== null) {                           // running along a joint
        const dy = c.vTarget - c.y, move = Math.min(Math.abs(dy), dist);
        c.y += Math.sign(dy) * move; dist -= move;
        if (Math.abs(c.vTarget - c.y) < 1e-6) {
          c.y = c.vTarget; c.pts.push([c.x, c.y]); c.vTarget = null;
          c.r = Math.round((c.y - 0.5) / SEAM);
        }
      } else {                                            // running along a seam
        const nj = nextJoint(c.x, c.dir);
        const gap = Math.abs(nj.x - c.x), move = Math.min(gap, dist);
        c.x += c.dir * move; dist -= move;
        if (move === gap) {                               // reached a joint: maybe take it
          c.x = nj.x;
          const down = nj.type === belowType(c.r);
          const target = c.r + (down ? 1 : -1);
          const rows = Math.floor(H / SEAM);
          if (target >= 0 && target <= rows && Math.random() < c.turnP) {
            c.pts.push([c.x, c.y]); c.vTarget = seamY(target);
          }
        }
      }
    }
    // forget vertices that are beyond the tail
    let acc = 0;
    const pts = c.pts;
    let px = c.x, py = c.y;
    for (let i = pts.length - 1; i >= 0; i--) {
      acc += Math.hypot(px - pts[i][0], py - pts[i][1]);
      px = pts[i][0]; py = pts[i][1];
      if (acc > c.L + 40) { pts.splice(0, i); break; }
    }
  }

  const fade = (d, L) => Math.pow(Math.max(0, 1 - d / L), 1.7);

  function draw(c) {
    if (c.wait > 0) return;
    const pts = c.pts.concat([[c.x, c.y]]);
    const [r, g, b] = rgbA, [r2, g2, b2] = rgbB;
    const k = light ? 0.8 : 1;
    let d = 0;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = pts.length - 1; i > 0; i--) {
      const [x1, y1] = pts[i], [x0, y0] = pts[i - 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (!len) continue;
      const dA = d, dB = d + len; d = dB;
      let sx = x0, sy = y0, dEnd = dB;
      if (dB > c.L) { const t = (c.L - dA) / len; sx = x1 + (x0 - x1) * t; sy = y1 + (y0 - y1) * t; dEnd = c.L; }
      const g1 = ctx.createLinearGradient(x1, y1, sx, sy);
      const aA = fade(dA, c.L), aB = fade(dEnd, c.L);
      for (const [w, a, col] of [[7, 0.12, [r, g, b]], [3, 0.38, [r, g, b]], [1.4, 1, [r2 * 0.4 + 200 * 0.6, g2 * 0.4 + 240 * 0.6, b2 * 0.4 + 250 * 0.6]]]) {
        const gr = ctx.createLinearGradient(x1, y1, sx, sy);
        gr.addColorStop(0, `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${(aA * a * k).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${(aB * a * k).toFixed(3)})`);
        ctx.strokeStyle = gr; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(sx, sy); ctx.stroke();
      }
      if (dB >= c.L) break;
    }
    // head
    const hg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 10);
    hg.addColorStop(0, `rgba(235,250,255,${0.95 * k})`);
    hg.addColorStop(0.25, `rgba(${r},${g},${b},${0.55 * k})`);
    hg.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, Math.PI * 2); ctx.fill();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    while (comets.length < maxComets()) comets.push(spawn(Math.random() * 2.5));
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    for (let i = 0; i < comets.length; i++) {
      const c = comets[i];
      step(c, dt);
      const gone = c.dir > 0 ? c.x - c.L > W + 30 : c.x + c.L < -30;
      if (gone) comets[i] = spawn(0.8 + Math.random() * 3);
      else draw(c);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
}
