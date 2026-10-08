// Small shared helpers: seeded RNG, calendar, formatting.
import { ECONOMY } from '../gen/data.js';

// Mulberry32 — tiny deterministic PRNG. State is a uint32 kept in game state so saves replay.
export function rngNext(st) {
  st.rng = (st.rng + 0x6D2B79F5) >>> 0;
  let t = st.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rand = (st, a = 1, b) => (b === undefined ? rngNext(st) * a : a + rngNext(st) * (b - a));
export const randInt = (st, a, b) => Math.floor(a + rngNext(st) * (b - a + 1));
export const pick = (st, arr) => arr[Math.floor(rngNext(st) * arr.length)];
export const chance = (st, p) => rngNext(st) < p;
export function gauss(st, mean = 0, sd = 1) {
  const u = Math.max(1e-9, rngNext(st)), v = rngNext(st);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---- Calendar. Game time is integer minutes since midnight on January 1 of the world's start year.
export const EPOCH = Date.UTC(ECONOMY.startYear, 0, 1);
export const MIN_PER_DAY = 1440;
export function dateOf(t) { return new Date(EPOCH + t * 60000); }
export function dayIndex(t) { return Math.floor(t / MIN_PER_DAY); }
export function minuteOfDay(t) { return ((t % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY; }
export function weekday(t) { return dateOf(t).getUTCDay(); } // 0 Sun..6 Sat
export function isWorkday(t) { const w = weekday(t); return w >= 1 && w <= 5; }
export function monthKey(t) { const d = dateOf(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }
export function monthLabel(key) { return `${MONTHS[key % 12]} ${Math.floor(key / 12)}`; }
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function fmtDate(t, opts = {}) {
  const d = dateOf(t);
  const s = `${DAYS[d.getUTCDay()].slice(0, opts.long ? 9 : 3)} ${MONTHS[d.getUTCMonth()].slice(0, opts.long ? 9 : 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  return s;
}
export function fmtTime(t) {
  const m = minuteOfDay(t); let h = Math.floor(m / 60); const mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
}
export function fmtShortDate(t) { const d = dateOf(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; }

// ---- Number formatting
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const USD2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('en-US');
export const money = v => (v < 0 ? '−' + USD.format(-v) : USD.format(v));
export const money2 = v => (v < 0 ? '−' + USD2.format(-v) : USD2.format(v));
export const num = v => NUM.format(Math.round(v));
export const pct = v => `${Math.round(v * 100)}%`;
export function moneyShort(v) {
  const a = Math.abs(v), s = v < 0 ? '−$' : '$';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return s + Math.round(a / 1e3) + 'k';
  return s + Math.round(a);
}
export const plural = (n, w, p = w + 's') => `${num(n)} ${n === 1 ? w : p}`;
