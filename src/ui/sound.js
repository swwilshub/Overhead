// Synthesized sound effects (WebAudio, no audio files) plus an optional factory ambience.
// Effects are short (under 1.5 s). The ambience only plays while the clock runs and can be switched off.
import { prefs } from './dom.js';

let ctx = null, master = null, noiseBuf = null;
const last = {}; let lastAny = 0;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master.disconnect(); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  master.gain.value = 0.55 * (prefs.volume ?? 0.6);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// browsers only start audio after the viewer interacts; wake the context on the first gesture
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }, { passive: true });

// ---- building blocks
function tone(type, f, t, dur, vol = 0.3, opts = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  if (opts.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = opts.vib; lg.gain.value = opts.vibDepth || f * 0.03; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o.connect(g);
  if (opts.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = opts.lp; node = g.connect(f2); node.connect(opts.dest || master); }
  else g.connect(opts.dest || master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(t, dur, vol = 0.3, { type = 'bandpass', f = 1200, q = 1, to, dest } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(dest || master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const bell = (t, f, dur, vol) => { tone('sine', f, t, dur, vol); tone('sine', f * 2.76, t, dur * 0.5, vol * 0.35); tone('sine', f * 5.4, t, dur * 0.25, vol * 0.15); };

// ---- the effects
const RECIPES = {
  click: t => { tone('square', 1400, t, 0.03, 0.08, { lp: 3000 }); },
  ok: t => { tone('triangle', 784, t, 0.07, 0.16); tone('triangle', 1175, t + 0.06, 0.1, 0.14); },
  error: t => { tone('sawtooth', 140, t, 0.22, 0.18, { lp: 900, vib: 30, vibDepth: 20 }); },
  place: t => { tone('sine', 140, t, 0.16, 0.45, { to: 55 }); noise(t, 0.08, 0.25, { type: 'lowpass', f: 600 }); tone('square', 900, t + 0.01, 0.025, 0.05, { lp: 2000 }); },
  paint: t => { noise(t, 0.22, 0.12, { type: 'highpass', f: 2500, to: 4000 }); },
  belt: t => { tone('square', 600, t, 0.02, 0.07, { lp: 1800 }); tone('square', 450, t + 0.04, 0.02, 0.06, { lp: 1800 }); },
  cash: t => { noise(t, 0.05, 0.25, { f: 3000, q: 4 }); tone('square', 220, t, 0.05, 0.08, { lp: 900 }); bell(t + 0.06, 1568, 0.6, 0.22); bell(t + 0.06, 2093, 0.5, 0.12); },
  order: t => { tone('square', 1000, t, 0.03, 0.08, { lp: 2500 }); noise(t + 0.03, 0.12, 0.1, { f: 2500, q: 2, to: 1200 }); tone('triangle', 660, t + 0.14, 0.08, 0.1); },
  memo: t => { noise(t, 0.12, 0.14, { f: 3500, q: 1.5, to: 2000 }); bell(t + 0.1, 1318, 0.35, 0.13); },
  alert: t => { for (let i = 0; i < 2; i++) { tone('square', 988, t + i * 0.28, 0.12, 0.12, { lp: 2400 }); tone('square', 740, t + i * 0.28 + 0.13, 0.12, 0.12, { lp: 2400 }); } },
  payday: t => { [1047, 1319, 1568, 1760, 2093, 2637].forEach((f, i) => { tone('triangle', f, t + i * 0.055, 0.12, 0.12); noise(t + i * 0.055, 0.03, 0.06, { f: 6000, q: 6 }); }); },
  ship: t => { tone('sawtooth', 233, t, 0.35, 0.1, { lp: 1100, attack: 0.03 }); tone('sawtooth', 294, t, 0.35, 0.08, { lp: 1100, attack: 0.03 }); tone('sawtooth', 233, t + 0.42, 0.22, 0.09, { lp: 1100, attack: 0.02 }); tone('sawtooth', 294, t + 0.42, 0.22, 0.07, { lp: 1100, attack: 0.02 }); },
  delivery: t => { for (let i = 0; i < 3; i++) tone('square', 1046, t + i * 0.22, 0.12, 0.08, { lp: 2500 }); noise(t, 0.6, 0.05, { type: 'lowpass', f: 200 }); },
  breakdown: t => { noise(t, 0.18, 0.4, { f: 900, q: 8 }); tone('square', 320, t, 0.06, 0.15, { lp: 1500 }); tone('sawtooth', 300, t + 0.05, 0.7, 0.16, { to: 60, lp: 700 }); noise(t + 0.2, 0.9, 0.12, { type: 'highpass', f: 3000, to: 1500 }); },
  repair: t => { for (let i = 0; i < 6; i++) noise(t + i * 0.06, 0.03, 0.22, { f: 2200 + i * 150, q: 10 }); tone('triangle', 880, t + 0.4, 0.15, 0.12); },
  fanfare: t => { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, t + i * 0.11, i === 3 ? 0.55 : 0.16, 0.18)); tone('triangle', 1319, t + 0.44, 0.5, 0.08); },
  research: t => { [784, 988, 1175, 1568, 1976].forEach((f, i) => { tone('sine', f, t + i * 0.07, 0.5, 0.11); tone('sine', f * 1.005, t + i * 0.07 + 0.02, 0.4, 0.05); }); },
  accident: t => { tone('sine', 90, t, 0.25, 0.5, { to: 40 }); noise(t, 0.2, 0.3, { type: 'lowpass', f: 400 }); for (let i = 0; i < 3; i++) { tone('square', 880, t + 0.3 + i * 0.3, 0.14, 0.12, { lp: 2500 }); tone('square', 587, t + 0.44 + i * 0.3, 0.14, 0.12, { lp: 2500 }); } },
  whistle: t => { tone('sine', 2100, t, 0.35, 0.14, { vib: 24, vibDepth: 60 }); tone('sine', 2100, t + 0.45, 0.6, 0.14, { vib: 24, vibDepth: 60 }); },
  bell: t => { bell(t, 523, 1.3, 0.2); bell(t + 0.35, 392, 1.3, 0.16); },
  hire: t => { tone('triangle', 784, t, 0.12, 0.15); tone('triangle', 1047, t + 0.1, 0.3, 0.15); },
  retool: t => { for (let i = 0; i < 4; i++) noise(t + i * 0.08, 0.04, 0.2, { f: 1800, q: 8 }); tone('sawtooth', 120, t, 0.4, 0.1, { to: 240, lp: 800 }); },
  start: t => { noise(t, 0.05, 0.25, { type: 'lowpass', f: 500 }); tone('sawtooth', 70, t + 0.03, 0.45, 0.13, { to: 110, lp: 400, attack: 0.08 }); },
  stop: t => { tone('sawtooth', 110, t, 0.35, 0.12, { to: 50, lp: 400 }); noise(t + 0.25, 0.06, 0.2, { type: 'lowpass', f: 500 }); },
  tick: t => { tone('square', 2400, t, 0.012, 0.03, { lp: 5000 }); },
  bump: t => { tone('square', 180, t, 0.05, 0.08, { lp: 600 }); },
};
export const SOUND_NAMES = Object.keys(RECIPES);
export const sfxLog = []; // most recent sounds played (read by the automated tests)
// Higher number wins when several events land in the same moment.
const PRIORITY = { fanfare: 9, research: 9, accident: 9, breakdown: 8, whistle: 8, alert: 7, payday: 6, bell: 6, cash: 5, hire: 5, ship: 4, delivery: 4, repair: 4, memo: 3, retool: 3, order: 3, place: 3, error: 3, start: 3, stop: 3, ok: 2, paint: 2, belt: 2, click: 1, tick: 0, bump: 0 };
const COOLDOWN = { ship: 2500, delivery: 2500, memo: 900, repair: 1500, payday: 2500, tick: 25, paint: 120, belt: 60 };

export function sfx(name) {
  if (!prefs.sfx || !RECIPES[name]) return;
  if ((name === 'tick' || name === 'bump') && !prefs.cursorTicks) return;
  const now = performance.now();
  if (now - (last[name] || 0) < (COOLDOWN[name] ?? 120)) return;
  if (PRIORITY[name] <= 2 && now - lastAny < 60) return;
  const a = audio(); if (!a) return;
  last[name] = now; lastAny = now; sfxLog.push(name); if (sfxLog.length > 80) sfxLog.shift();
  try { RECIPES[name](a.currentTime + 0.01); } catch { /* audio unavailable */ }
}
// play only the most important of a batch (used when the clock fast-forwards)
export function sfxBatch(names) {
  if (!names.length) return;
  const best = [...new Set(names)].sort((a, b) => (PRIORITY[b] ?? 0) - (PRIORITY[a] ?? 0));
  sfx(best[0]);
  if (best[1] && (PRIORITY[best[1]] ?? 0) >= 4) setTimeout(() => sfx(best[1]), 450);
}

// ---- factory ambience: a low hum plus machine thumps, scaled by running machines
let amb = null;
export function ambience(running, active) {
  const want = prefs.sfx && prefs.ambience && active && running > 0;
  if (!want) { if (amb) { const a = amb; amb = null; a.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); setTimeout(() => { try { a.osc.forEach(o => o.stop()); clearInterval(a.timer); a.gain.disconnect(); } catch { /* stopped */ } }, 900); } return; }
  const a = audio(); if (!a) return;
  if (!amb) {
    const gain = a.createGain(); gain.gain.value = 0.0001; gain.connect(master);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(gain);
    const osc = [55, 110, 82.5].map((f, i) => { const o = a.createOscillator(); o.type = i === 1 ? 'sawtooth' : 'sine'; o.frequency.value = f; const g = a.createGain(); g.gain.value = [0.5, 0.08, 0.2][i]; o.connect(g).connect(lp); o.start(); return o; });
    amb = { gain, osc, n: 0, timer: setInterval(() => {
      if (!amb || !ctx) return; const t = ctx.currentTime + 0.02;
      for (let k = 0; k < Math.min(3, amb.n); k++) { const tt = t + k * 0.13; tone('sine', 95 + k * 12, tt, 0.12, 0.05 * amb.level, { to: 60, dest: amb.gain }); noise(tt + 0.05, 0.08, 0.03 * amb.level, { type: 'highpass', f: 2500, dest: amb.gain }); }
    }, 520) };
  }
  amb.n = running; amb.level = Math.min(1, 0.35 + running * 0.12);
  amb.gain.gain.setTargetAtTime(0.18 * amb.level, ctx.currentTime, 0.4);
}
