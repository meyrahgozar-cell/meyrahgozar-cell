// ---------------------------------------------------------------------------
// format.js — display helpers shared by every view.
// ---------------------------------------------------------------------------
import { hashString } from './dom.js';

export function relTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const units = [
    [1000, 's'], [60, 'm'], [60, 'h'], [24, 'd'], [7, 'w'], [4.345, 'mo'], [12, 'y']
  ];
  let value = abs / 1000;
  let unit = 's';
  for (let i = 1; i < units.length; i++) {
    if (value < units[i][0]) break;
    value /= units[i][0];
    unit = units[i][1];
  }
  if (unit === 's' && value < 8) return 'now';
  const rounded = value < 10 ? Math.round(value) : Math.round(value);
  return `${rounded}${unit}${diff < 0 ? ' ahead' : ''}`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(digits);
}

export function fmtPct(v, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return `${(Number(v) * 100).toFixed(digits)}%`;
}

export function fmtScore(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '·';
  return Number(v).toFixed(digits).replace(/\.0$/, '');
}

export function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function fmtDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function hueFor(seed) {
  return hashString(String(seed || 'seed')) % 360;
}

export function gradientFor(seed) {
  const h = hueFor(seed);
  return `linear-gradient(135deg, hsl(${h} 80% 62%), hsl(${(h + 62) % 360} 78% 52%))`;
}

export function rgbaFromSeed(seed, alpha = 0.2) {
  const h = hueFor(seed);
  return `hsla(${h}, 78%, 60%, ${alpha})`;
}

export function pluralize(n, word, suffix = 's') {
  return `${n} ${word}${n === 1 ? '' : suffix}`;
}

export function titleCase(str = '') {
  return String(str).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function truncate(str = '', len = 40) {
  return str.length > len ? `${str.slice(0, len - 1)}…` : str;
}

export function compactNumber(v) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);
}

export function timeOfDay() {
  const h = new Date().getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

export function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
