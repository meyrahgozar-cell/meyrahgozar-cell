// ---------------------------------------------------------------------------
// bits.js — small reusable UI atoms shared by every view.
// ---------------------------------------------------------------------------
import { h, initials, clamp } from '../core/dom.js';
import { icon } from './icons.js';
import { gradientFor, hueFor, fmtScore, fmtPct } from '../core/format.js';
import { scoreColor, polarise, normalise } from '../core/math.js';

export function avatar(person, { size = null, cls = '' } = {}) {
  const name = person?.fullName || person?.name || '—';
  const seed = person?.slug || person?.id || name;
  const hue = person?.metadata?.hue ?? hueFor(seed);
  const bg = `linear-gradient(135deg, hsl(${hue} 72% 62%), hsl(${(hue + 58) % 360} 74% 50%))`;
  const el = h('div', {
    class: `avatar ${size === 'sm' ? 'avatar--sm' : size === 'lg' ? 'avatar--lg' : size === 'xl' ? 'avatar--xl' : ''} ${cls}`.trim(),
    style: { '--avatar-bg': bg },
    title: name
  }, initials(name));
  if (person?.avatarUrl) {
    const img = h('img', { src: person.avatarUrl, alt: name, loading: 'lazy' });
    img.addEventListener('error', () => img.remove());
    el.appendChild(img);
  }
  return el;
}

export function traitGlyph(trait, size = 32) {
  return h('div', {
    class: 'trait-card__glyph',
    style: { '--trait-color': trait?.color || 'var(--accent)', width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.28)}px` }
  }, icon(trait?.icon || 'spark', { size: Math.round(size * 0.5) }));
}

export function traitChip(trait, { lg = false, weight = false } = {}) {
  if (!trait) return h('span', { class: 'tag' }, '—');
  return h('span', {
    class: `trait-chip ${lg ? 'trait-chip--lg' : ''}`,
    style: { '--trait-color': trait.color || 'var(--accent)' }
  },
    icon(trait.icon || 'spark', { size: lg ? 14 : 11 }),
    trait.name,
    weight ? h('span', { class: 'trait-chip__w' }, `×${Number(trait.weight ?? 1).toFixed(1)}`) : null
  );
}

export function scoreChip(value, trait, { max = null } = {}) {
  if (value === null || value === undefined) {
    return h('span', { class: 'score-chip', style: { color: 'var(--ink-4)' } }, '—');
  }
  const t = trait ? normalise(Number(value), trait.min ?? 0, trait.max ?? 10) : clamp(Number(value) / (max || 10), 0, 1);
  const color = scoreColor(t, 1);
  return h('span', {
    class: 'score-chip',
    style: { '--chip-bg': scoreColor(t, 0.16), '--chip-line': scoreColor(t, 0.4), '--chip-ink': color }
  }, fmtScore(value));
}

export function gradeBadge(reliability) {
  const score = reliability?.score ?? 0;
  const tone = score > 0.82 ? 'premium' : score > 0.68 ? 'good' : score > 0.52 ? 'ok' : score > 0.36 ? 'warn' : 'bad';
  const label = reliability?.grade || '—';
  return h('span', { class: 'grade', dataset: { tone }, title: `reliability ${fmtPct(score)}` }, label);
}

export function deltaPill(delta, { digits = 1, suffix = '' } = {}) {
  if (delta === null || delta === undefined || Number.isNaN(Number(delta))) {
    return h('span', { class: 'pill' }, '—');
  }
  const v = Number(delta);
  const up = v > 0.05, down = v < -0.05;
  const cls = up ? 'pill--good' : down ? 'pill--bad' : '';
  return h('span', { class: `pill ${cls}` },
    icon(up ? 'arrowUp' : down ? 'arrowDown' : 'minus', { size: 10 }),
    `${v >= 0 ? '+' : ''}${v.toFixed(digits)}${suffix}`
  );
}

export function kpi({ label, value, unit = '', foot = null, spark = null, accent = false, iconName = null }) {
  const el = h('div', { class: `kpi ${accent ? 'kpi--accent' : ''}` },
    h('div', { class: 'kpi__label' },
      h('span', { class: 'flex items-center gap-1' }, iconName ? icon(iconName, { size: 11 }) : null, label),
      spark ? null : null
    ),
    h('div', { class: 'kpi__value' }, h('span', { class: 'tnum' }, String(value)), unit ? h('small', {}, unit) : null),
    foot ? h('div', { class: 'kpi__foot' }, foot) : null
  );
  if (spark) {
    const svg = h('svg', { class: 'kpi__spark', viewBox: '0 0 100 40', preserveAspectRatio: 'none' });
    svg.appendChild(h('path', { d: spark, fill: 'none', stroke: 'var(--accent)', 'stroke-width': '1.4', opacity: '0.8' }));
    el.appendChild(svg);
  }
  return el;
}

export function sparkPath(values, width = 100, height = 40, pad = 2) {
  if (!values.length) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function emptyState({ iconName = 'spark', title = 'Nothing here', text = '', action = null }) {
  return h('div', { class: 'empty' },
    icon(iconName, { size: 30 }),
    h('b', {}, title),
    text ? h('p', {}, text) : null,
    action || null
  );
}

export function switchRow({ title, text = '', checked = false, onChange = null }) {
  const sw = h('button', {
    class: 'switch',
    role: 'switch',
    'aria-checked': String(Boolean(checked)),
    'aria-label': title
  });
  sw.addEventListener('click', () => {
    const next = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(next));
    onChange?.(next);
  });
  return h('div', { class: 'set-row' },
    h('div', { class: 'set-row__main' }, h('b', {}, title), text ? h('span', {}, text) : null),
    h('div', { class: 'set-row__ctl' }, sw)
  );
}

export function seg(options, value, onChange, { className = '' } = {}) {
  const wrap = h('div', { class: `seg ${className}`.trim() });
  for (const opt of options) {
    const val = typeof opt === 'string' ? opt : opt.value;
    const label = typeof opt === 'string' ? opt : opt.label;
    wrap.appendChild(h('button', {
      class: value === val ? 'is-active' : '',
      onClick: () => {
        [...wrap.children].forEach(c => c.classList.remove('is-active'));
        const btn = [...wrap.children].find(c => c.textContent === label);
        btn?.classList.add('is-active');
        onChange?.(val);
      }
    }, label));
  }
  return wrap;
}

export function sliderRow({ label, value, min = 0, max = 1, step = 0.01, format = null, onChange }) {
  const out = h('span', { class: 'mono tiny muted' }, format ? format(value) : String(value));
  const input = h('input', {
    type: 'range', min, max, step, value,
    onInput: (e) => {
      const v = Number(e.target.value);
      const pct = ((v - min) / (max - min)) * 100;
      e.target.style.setProperty('--fill', `${pct}%`);
      out.textContent = format ? format(v) : String(v);
      onChange?.(v);
    }
  });
  input.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
  return h('div', { class: 'set-row' },
    h('div', { class: 'set-row__main' }, h('b', {}, label)),
    h('div', { class: 'set-row__ctl', style: { minWidth: '180px' } }, input, out)
  );
}

export function field(label, control, hint = null) {
  return h('div', { class: 'field' },
    h('label', {}, label),
    control,
    hint ? h('div', { class: 'hint' }, hint) : null
  );
}

export function infoCell(label, value) {
  return h('div', { class: 'info-cell' }, h('span', {}, label), h('b', {}, value));
}

export function notchedScore(value, trait, segments = 10) {
  const t = trait ? normalise(Number(value), trait.min ?? 0, trait.max ?? 10) : clamp(Number(value) / 10, 0, 1);
  const on = Math.round(t * segments);
  const wrap = h('div', { class: 'notch', title: String(value) });
  for (let i = 0; i < segments; i++) {
    wrap.appendChild(h('i', { class: i < on ? 'on' : '', style: i < on ? { background: scoreColor(i / (segments - 1), 1) } : null }));
  }
  return wrap;
}

export function sectionHead(title, { count = null, actions = null, iconName = null } = {}) {
  return h('div', { class: 'section-head' },
    h('div', { class: 'section-head__title' },
      iconName ? icon(iconName, { size: 15, cls: 'accent' }) : null,
      h('h2', {}, title),
      count !== null ? h('span', { class: 'count' }, count) : null
    ),
    actions ? h('div', { class: 'section-head__actions' }, actions) : null
  );
}

export function tag(text, { color = null } = {}) {
  return h('span', { class: 'tag', style: color ? { color, borderColor: 'currentColor' } : null }, text);
}

export function iconBtn(name, { title = '', onClick, cls = '', size = 15, active = false } = {}) {
  return h('button', {
    class: `btn btn--icon btn--ghost btn--sm ${active ? 'is-active' : ''} ${cls}`.trim(),
    title, 'aria-label': title || name,
    onClick
  }, icon(name, { size }));
}

export function segmentedToolbar(items) {
  const wrap = h('div', { class: 'toolbar' });
  for (const item of items) {
    if (item === '|') { wrap.appendChild(h('div', { class: 'toolbar__sep' })); continue; }
    if (item === '->') { wrap.appendChild(h('div', { class: 'toolbar__spacer' })); continue; }
    wrap.appendChild(h('button', {
      class: `chip-btn ${item.active ? 'is-active' : ''}`,
      title: item.title || item.label,
      onClick: item.onClick
    }, item.iconName ? icon(item.iconName, { size: 13 }) : null, item.label || null));
  }
  return wrap;
}

export function miniBars(values, { width = 90, height = 22, color = 'var(--accent)' } = {}) {
  const svg = h('svg', { viewBox: `0 0 ${width} ${height}`, width, height, preserveAspectRatio: 'none' });
  const max = Math.max(...values, 1);
  const bw = width / Math.max(values.length, 1);
  values.forEach((v, i) => {
    const bh = clamp(v / max, 0.02, 1) * (height - 2);
    svg.appendChild(h('rect', {
      x: i * bw + 0.6, y: height - bh, width: Math.max(bw - 1.2, 0.8), height: bh,
      rx: 1, fill: color, opacity: 0.35 + 0.65 * (v / max)
    }));
  });
  return svg;
}

export function pill(text, kind = '') {
  return h('span', { class: `pill ${kind ? `pill--${kind}` : ''}` }, text);
}

export function dot(kind = 'ok') {
  return h('span', { class: 'statusbar__live', style: { display: 'inline-flex', alignItems: 'center' } }, h('i', { style: { background: `var(--${kind})`, boxShadow: `0 0 8px var(--${kind})` } }));
}
