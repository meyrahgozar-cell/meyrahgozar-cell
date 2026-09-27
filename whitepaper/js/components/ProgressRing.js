/* ============================================================
   کاغذ سفید — حلقه پیشرفت SVG
   ============================================================ */

import { toFa } from '../core/utils.js';

export function ProgressRing({
  percent = 0,
  size = 64,
  stroke = 6,
  color = 'var(--accent)',
  showLabel = true,
  labelSuffix = '٪',
} = {}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;

  return `
    <svg class="progress-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${toFa(p)} درصد">
      <circle
        cx="${size/2}" cy="${size/2}" r="${r}"
        fill="none"
        stroke="var(--border-subtle)"
        stroke-width="${stroke}"
      />
      <circle
        class="progress-ring__fill"
        cx="${size/2}" cy="${size/2}" r="${r}"
        fill="none"
        stroke="${color}"
        stroke-width="${stroke}"
        stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 ${size/2} ${size/2})"
        style="filter: drop-shadow(0 0 6px ${color}40);"
      />
      ${showLabel ? `
        <text
          x="${size/2}" y="${size/2}"
          text-anchor="middle" dominant-baseline="central"
          fill="var(--text-primary)"
          font-size="${size/4.2}"
          font-weight="700"
          font-family="var(--font)"
        >${toFa(p)}${labelSuffix}</text>
      ` : ''}
    </svg>
  `;
}