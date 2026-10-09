// Top-down three-quarter pixel renderer for the factory floor on a square grid.
// Each object shows its top face plus a south-facing front face.
// Drawn into a low-resolution buffer with integer rectangles, then scaled without smoothing.
import { JOBS, deptColor } from '../core/content.js';
import { FAMILIES, FAMILY_ID } from '../gen/data.js';
import { ZONE, footprint, ports, rotSize, objSize, inputPorts, portItem, machineTier, officeKit, statusMark } from '../sim/floor.js';
import { itemDef, itemTiles, itemSize, workSquare, isStation, hatchInner } from '../sim/cells.js';
import { shade, pixText, lineHue } from './iso.js';

export const T = 16, WALL = 22, M = 6;
// A stable label colour per material, used on input squares, belt boxes and the catalog preview
export function itemColor(id) {
  if (id == null) return '#8a929a';
  const hDeg = (id * 137.508) % 360, s = 0.62, l = 0.52;
  const f = n => { const k = (n + hDeg / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}

export function makeView(fl, S) { return { fl, S, W: fl.w * T + M * 2, H: fl.h * T + WALL + M * 2 + 4, ox: M, oy: WALL + M }; }
export const tileXY = (v, x, y) => [v.ox + x * T, v.oy + y * T];
export const tileCenter = (v, x, y) => [v.ox + x * T, v.oy + y * T];
export function screenToTile(v, px, py) { return [Math.floor((px - v.ox) / T), Math.floor((py - v.oy) / T)]; }

// ---------- primitives
const R = (c, x, y, w, h, col) => { if (!col || w <= 0 || h <= 0) return; c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const frame = (c, x, y, w, h, col) => { R(c, x, y, w, 1, col); R(c, x, y + h - 1, w, 1, col); R(c, x, y, 1, h, col); R(c, x + w - 1, y, 1, h, col); };
const dither = (c, x, y, w, h, a, b) => { x = Math.round(x); y = Math.round(y); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { c.fillStyle = (i + j) % 2 ? a : b; c.fillRect(x + i, y + j, 1, 1); } };
// a block standing on the floor: (x,y) top-left of its footprint in px, w×d footprint px, hgt px tall.
// The top face is lifted by hgt; the front face fills the gap down to the footprint's front edge.
function block(c, x, y, w, d, hgt, color, opts = {}) {
  const top = opts.top || shade(color, 0.18), front = opts.front || shade(color, -0.18), line = opts.line || shade(color, -0.55);
  x = Math.round(x); y = Math.round(y); w = Math.round(w); d = Math.round(d); hgt = Math.round(hgt);
  R(c, x, y - hgt, w, d, top);
  R(c, x, y + d - hgt, w, hgt, front);
  if (opts.outline !== false) { frame(c, x, y - hgt, w, d + hgt, line); R(c, x + 1, y + d - hgt, w - 2, 1, shade(top, 0.25)); }
  return { x, y: y - hgt, w, d, hgt, frontY: y + d - hgt };
}

// ---------- static floor layer (cached by layout revision and theme)
const cache = new WeakMap();
function floorLayer(v, C) {
  const fl = v.fl, key = `${fl.rev}|${C.floor}|${C.panel}|${v.W}`;
  const hit = cache.get(fl); if (hit && hit.key === key) return hit.canvas;
  const cv = document.createElement('canvas'); cv.width = v.W; cv.height = v.H; const c = cv.getContext('2d');
  const W = fl.w * T, H = fl.h * T, x0 = v.ox, y0 = v.oy;
  // back wall: corrugated cladding, windows, skirting
  const wallC = C.dark ? '#5b6670' : '#9aa6ae';
  R(c, x0 - 3, y0 - WALL, W + 6, WALL, wallC);
  for (let x = 0; x < W + 6; x += 3) R(c, x0 - 3 + x, y0 - WALL, 1, WALL, shade(wallC, -0.14));
  for (let x = T; x < W - 2 * T; x += 3 * T) { R(c, x0 + x, y0 - WALL + 4, 2 * T - 4, 8, '#9fd0ea'); R(c, x0 + x, y0 - WALL + 4, 2 * T - 4, 1, '#d8eef8'); frame(c, x0 + x - 1, y0 - WALL + 3, 2 * T - 2, 10, shade(wallC, -0.45)); }
  R(c, x0 - 3, y0 - WALL, W + 6, 2, shade(wallC, -0.45)); R(c, x0 - 3, y0 - 2, W + 6, 2, shade(wallC, -0.35));
  // concrete floor
  const f1 = C.floor, f2 = shade(C.floor, -0.045), gl = shade(C.floor, -0.12);
  for (let y = 0; y < fl.h; y++) for (let x = 0; x < fl.w; x++) R(c, x0 + x * T, y0 + y * T, T, T, (x + y) % 2 ? f1 : f2);
  for (let x = 0; x <= fl.w; x++) R(c, x0 + x * T, y0, 1, H, gl);
  for (let y = 0; y <= fl.h; y++) R(c, x0, y0 + y * T, W, 1, gl);
  // side and front walls seen from above
  const capC = shade(wallC, -0.4);
  R(c, x0 - 3, y0 - 2, 3, H + 5, capC); R(c, x0 + W, y0 - 2, 3, H + 5, capC); R(c, x0 - 3, y0 + H, W + 6, 3, capC);
  // zones
  for (let y = 0; y < fl.h; y++) for (let x = 0; x < fl.w; x++) {
    const z = fl.zones[y * fl.w + x]; if (!z) continue;
    const px = x0 + x * T, py = y0 + y * T;
    if (z === ZONE.SAFETY) { for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { c.fillStyle = (((i + j) >> 2) & 1) ? '#f2b71f' : '#1d1d1d'; c.fillRect(px + i, py + j, 1, 1); } }
    else if (z === ZONE.STORAGE) { R(c, px + 1, py + 1, T - 1, T - 1, shade(C.floor, -0.1)); for (let i = 1; i < T; i += 3) { R(c, px + i, py + 1, 2, 1, '#a07a4a'); R(c, px + i, py + T - 1, 2, 1, '#a07a4a'); R(c, px + 1, py + i, 1, 2, '#a07a4a'); R(c, px + T - 1, py + i, 1, 2, '#a07a4a'); } }
    else if (z === ZONE.SMOKING) { dither(c, px + 1, py + 1, T - 1, T - 1, '#8b8f8c', '#a3a7a4'); R(c, px + 6, py + 7, 5, 3, '#4a4a4a'); R(c, px + 7, py + 7, 3, 1, '#6a6a6a'); R(c, px + 9, py + 6, 1, 1, '#e06030'); }
    else if (z === ZONE.CARPET) dither(c, px, py, T, T, '#4a5f8f', '#566c9e');
    else if (z === ZONE.FORKLIFT) { frame(c, px + 1, py + 1, T - 1, T - 1, '#f2b71f'); pixText(c, 'P', px + 7, py + 6, '#f2b71f'); }
  }
  cache.set(fl, { key, canvas: cv });
  return cv;
}

// ---------- sprites
function arrow(c, cx, cy, dx, dy, col) {
  // a 5-pixel chevron pointing (dx,dy)
  for (let k = 0; k < 4; k++) for (let s = -k; s <= k; s++) {
    const px = dx ? cx + dx * (2 - k) : cx + s, py = dy ? cy + dy * (2 - k) : cy + s;
    R(c, px, py, 1, 1, col);
  }
}
function portMarks(c, v, o) {
  const { w, h } = objSize(o);
  const mx = o.x + w / 2, my = o.y + h / 2;
  for (const [name, [px, py]] of Object.entries(ports(o))) {
    const [sx, sy] = tileXY(v, px, py), cx = sx + T / 2, cy = sy + T / 2;
    const dx = Math.sign(Math.round((mx - (px + 0.5)) * 2)), dy = Math.sign(Math.round((my - (py + 0.5)) * 2));
    const ax = Math.abs(mx - px - 0.5) > Math.abs(my - py - 0.5) ? dx : 0, ay = ax ? 0 : dy;
    if (/^in\d$/.test(name)) {
      // each input square: number, an arrow into the machine, and a tag in its material's colour
      const k = +name[2], it = portItem(o, k), used = it != null;
      R(c, sx + 2, sy + 2, T - 4, T - 4, used ? 'rgba(200,52,40,0.18)' : 'rgba(120,120,120,0.15)');
      arrow(c, cx, cy, ax, ay, used ? '#c83428' : '#8a929a');
      R(c, sx + 1, sy + 1, 5, 7, '#1d1d1d'); pixText(c, String(k + 1), sx + 2, sy + 2, '#ffffff');
      if (used) { R(c, sx + T - 6, sy + 1, 5, 5, '#1d1d1d'); R(c, sx + T - 5, sy + 2, 3, 3, itemColor(it)); }
    }
    else if (name === 'output') { R(c, sx + 3, sy + 3, T - 6, T - 6, 'rgba(47,138,79,0.25)'); arrow(c, cx, cy, -ax, -ay, '#2f8a4f'); }
    else if (name === 'control') { R(c, cx - 4, cy - 3, 8, 6, '#5d636a'); R(c, cx - 3, cy - 2, 6, 1, '#7d848b'); }
    else if (name === 'maint') { R(c, cx - 3, cy, 7, 1, '#c47b16'); R(c, cx, cy - 3, 1, 7, '#c47b16'); }
  }
}
// ---------- machines: one product range
// Every machine shares a chassis: the same footprint and silhouette, material hoppers over the inputs, an output
// chute, a hazard kick plate, a nameplate with the family code and Mk pips, and a status lamp. The Mk (tech tree
// generation) sets the finish and instruments, from riveted enamel (Mk I) to a cream 90s casing (Mk III) and a
// white unit with smoked glass and an LED strip (Mk IV). Each line names its tool head in the world data.
const mix = (a, b, f) => { const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return '#' + pa.map((v, k) => Math.round(v + (pb[k] - v) * f).toString(16).padStart(2, '0')).join(''); };
function finish(tier, hue) {
  switch (tier) {
    case 1: { const body = mix(hue, '#6b6f66', 0.35); return { body, deck: shade(body, -0.12), trim: shade(body, -0.5), accent: hue }; }
    case 2: { const body = mix(hue, '#7d8590', 0.2); return { body, deck: '#b9bec4', trim: shade(body, -0.5), accent: hue }; }
    case 3: return { body: '#d6cfbd', deck: '#c4bca8', trim: '#6e6656', accent: hue };
    default: return { body: '#e3e6ea', deck: '#c3c9cf', trim: '#4b535c', accent: hue };
  }
}
function disc(c, cx, cy, r, col) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) R(c, cx + x, cy + y, 1, 1, col); }
function gear(c, cx, cy, r, ang, col, teeth = 8) {
  disc(c, cx, cy, r, col); disc(c, cx, cy, Math.max(1, r - 3), shade(col, -0.25)); R(c, cx, cy, 1, 1, '#1d1d1d');
  for (let k = 0; k < teeth; k++) { const a = ang + k * Math.PI * 2 / teeth; R(c, Math.round(cx + Math.cos(a) * (r + 1)), Math.round(cy + Math.sin(a) * (r + 1)), 1, 1, col); }
}
// a line's tool head, drawn on the deck inside box (x, y, w, d); ph is an animation phase (0 when idle)
export const TOOL_HEADS = ['mould', 'gantry', 'winder', 'gears', 'roller', 'turret', 'saw', 'robotarm', 'stitcher', 'ram', 'lathe', 'welder', 'hoist', 'scope'];
const headOf = o => o.mode === 'research' ? 'robotarm' : FAMILIES[o.family]?.head;
function toolHead(c, head, x, y, w, d, ph, run, F) {
  const cx = Math.round(x + w / 2), cy = Math.round(y + d / 2), m = Math.min(w, d);
  const steel = '#9aa3ab', dark = '#2e3338', hot = '#ff8a2a', copper = '#c8752e';
  const cyc = ph % 8, bob = run ? [0, 1, 2, 3, 3, 2, 1, 0][cyc] : 0;
  switch (head) {
    case 'mould': { // injection moulding: barrel feeding a two-platen mould that opens and closes
      block(c, x + 2, cy - 2, Math.max(4, w / 2 - 6), 4, 3, steel); block(c, x + 2, cy - 5, 5, 5, 6, dark);
      const gap = run ? [3, 2, 1, 0, 0, 1, 2, 3][cyc] : 2, ph2 = Math.max(8, d - 8);
      block(c, cx - 3 - gap, cy - ph2 / 2, 4, ph2, 6, F.accent); block(c, cx + 1 + gap, cy - ph2 / 2, 4, ph2, 6, F.accent);
      R(c, cx - 7 - gap, cy - 3, 2, 2, steel); R(c, cx + 5 + gap, cy - 3, 2, 2, steel);
      if (gap >= 2) R(c, cx - 1, cy - 6, 2, 4, '#e8ecef');
      break;
    }
    case 'gantry': { // pick-and-place: green board under a gantry that sweeps across
      R(c, x + 2, y + 3, w - 4, d - 6, '#2f7d3a'); frame(c, x + 2, y + 3, w - 4, d - 6, '#1e5426');
      for (let i = x + 4; i < x + w - 5; i += 4) for (let j = y + 5; j < y + d - 5; j += 4) R(c, i, j, 2, 2, (i + j) % 3 ? '#1d1d1d' : '#d8b24a');
      const gx = Math.round(x + 3 + ((run ? cyc : 3) / 7) * (w - 9));
      block(c, gx, y + 1, 3, d - 2, 5, steel); R(c, gx, cy - 6, 3, 3, F.accent);
      break;
    }
    case 'winder': { // coil winder: a spool of copper wire turning between two cheeks
      const sw2 = Math.min(15, w - 8), sh = Math.min(9, d - 6);
      block(c, cx - sw2 / 2 - 2, cy - sh / 2 - 1, 2, sh + 2, 7, F.accent); block(c, cx + sw2 / 2, cy - sh / 2 - 1, 2, sh + 2, 7, F.accent);
      R(c, cx - sw2 / 2, cy - sh / 2 - 5, sw2, sh, copper);
      for (let i = 0; i < sw2; i++) if ((i + (run ? cyc : 0)) % 3 === 0) R(c, cx - sw2 / 2 + i, cy - sh / 2 - 5, 1, sh, shade(copper, -0.3));
      R(c, cx - sw2 / 2, cy - sh / 2 - 5, sw2, 1, shade(copper, 0.35)); R(c, cx - sw2 / 2, cy + sh / 2 - 5, sw2, 1, shade(copper, -0.45));
      R(c, cx + sw2 / 2 + 2, cy - 2, Math.max(1, x + w - cx - sw2 / 2 - 3), 1, copper);
      break;
    }
    case 'gears': { // gear cutting: two meshing gears turning
      const a = run ? cyc * Math.PI / 16 : 0, r = Math.max(3, Math.min(7, Math.floor(m / 3.4)));
      gear(c, cx - r, cy - 2, r, a, steel, 10); gear(c, cx + r - 1 + Math.ceil(r * 0.7), cy - 1 + Math.ceil(r * 0.3), Math.max(2, r - 2), -a * 1.4, F.accent, 8);
      break;
    }
    case 'roller': { // a heated roller running over a sheet
      R(c, x + 2, y + 4, w - 4, d - 8, '#2a2a2a'); for (let i = x + 3; i < x + w - 3; i += 2) R(c, i, y + 5, 1, d - 10, '#3d3d3d');
      const rx = Math.round(x + 3 + ((run ? cyc : 2) / 7) * (w - 10));
      block(c, rx, y + 2, 4, d - 4, 4, steel); if (run) R(c, rx - 2, y + 4, 2, d - 8, hot);
      break;
    }
    case 'turret': { // rotary assembly turret with four stations
      const tr = Math.max(4, Math.min(9, Math.floor(m / 2.5)));
      disc(c, cx, cy - 1, tr + 1, shade(steel, -0.35)); disc(c, cx, cy - 2, tr, steel); disc(c, cx, cy - 2, 2, dark);
      const rr = tr - 2, a0 = run ? cyc * Math.PI / 16 : 0;
      for (let k = 0; k < 4; k++) { const a = a0 + k * Math.PI / 2; R(c, Math.round(cx + Math.cos(a) * rr) - 1, Math.round(cy - 2 + Math.sin(a) * rr) - 1, 3, 3, k ? F.accent : '#e0e4e8'); }
      break;
    }
    case 'saw': { // circular saw over a plank
      R(c, x + 1, cy, w - 2, 4, '#b8874e'); R(c, x + 1, cy, w - 2, 1, '#d6a66a');
      const r = Math.max(4, Math.min(8, Math.floor(m / 2.8)));
      gear(c, cx, cy - 2, r, run ? cyc * Math.PI / 6 : 0, '#c9ced3', 12); R(c, cx - 1, cy - 2 - r - 2, 3, 2, F.accent);
      if (run && cyc % 2) { R(c, cx + r + 1, cy + 1, 1, 1, '#e6c48e'); R(c, cx + r + 3, cy, 1, 1, '#e6c48e'); }
      break;
    }
    case 'robotarm': { // robot arm assembling a board, next to a monitor
      // a motherboard on a fixture, a robot arm placing parts, and a terminal showing the job
      R(c, x + 2, cy - 1, Math.min(14, w - 4), Math.min(8, d - cy + y - 1), '#2f7d3a'); for (let i = x + 4; i < x + Math.min(14, w - 4); i += 3) R(c, i, cy + 1, 2, 2, '#1d1d1d');
      const bx3 = x + w - 6, by3 = y + d - 5; disc(c, bx3, by3, 3, dark); disc(c, bx3, by3 - 1, 2, steel);
      const sw = run ? [0, 1, 2, 3, 3, 2, 1, 0][cyc] : 1, ex = bx3 - 6 - sw * 2, ey = cy - 4;
      for (let k = 0; k <= 6; k++) R(c, Math.round(bx3 + (ex - bx3) * k / 6), Math.round(by3 - 3 + (ey - by3 + 3) * k / 6), 2, 2, F.accent);
      R(c, ex - 1, ey + 2, 3, 2, steel); R(c, ex, ey + 4, 1, 1, '#d8b24a');
      block(c, x + 2, y + 1, 10, 3, 7, '#d9dde2', { line: '#59616b' }); R(c, x + 3, y - 5, 8, 5, run && cyc % 4 < 2 ? '#5fd3ff' : '#2a7aa0'); R(c, x + 4, y - 4, 4, 1, '#d6f4ff');
      break;
    }
    case 'stitcher': { // a needle head walking a seam
      R(c, x + 2, y + 3, w - 4, d - 6, '#d9d2b8'); for (let i = x + 4; i < x + w - 4; i += 2) R(c, i, cy, 1, 1, '#7a3a2a');
      const nx = Math.round(x + 4 + ((run ? cyc : 3) / 7) * (w - 11));
      block(c, nx, cy - 4, 5, 4, 7 - bob, F.accent); R(c, nx + 2, cy - 1, 1, 2, '#e0e4e8');
      break;
    }
    case 'ram': { // stamping press: a ram coming down on a pan blank
      R(c, cx - 7, cy - 1, 14, 5, '#c9ced3'); disc(c, cx, cy + 1, 3, '#aeb5bb');
      R(c, cx - 8, cy - 12, 2, 12, dark); R(c, cx + 7, cy - 12, 2, 12, dark);
      block(c, cx - 6, cy - 3, 13, 4, 9 - bob * 2, F.accent);
      break;
    }
    case 'lathe': { // lathe: headstock, a turning chuck and a tool post
      block(c, x + 2, cy - 4, 6, 8, 6, F.accent);
      const jaw = run ? cyc % 2 : 0; R(c, x + 8, cy - 5, 3, 6, steel); R(c, x + 8, cy - 5 + jaw * 4, 3, 1, dark);
      R(c, x + 11, cy - 3, Math.max(4, w - 18), 2, '#c9ced3'); block(c, Math.min(x + w - 6, x + 15), cy + 1, 4, 3, 4, dark);
      if (run && cyc % 3 === 0) R(c, Math.min(x + w - 6, x + 15), cy - 4, 1, 1, '#ffe08a');
      break;
    }
    case 'welder': { // welding cell: an arm over a frame, with sparks
      // a steel frame on a jig, with the welding arm reaching over it
      R(c, x + 3, cy + 1, w - 6, 3, '#6d757c'); R(c, x + 3, cy - 5, 3, 9, steel); R(c, x + w - 6, cy - 5, 3, 9, steel); R(c, x + 3, cy - 5, w - 6, 2, steel);
      block(c, x + w - 9, y + 1, 5, 5, 8, dark); R(c, cx, y - 6, x + w - 9 - cx, 2, F.accent); R(c, cx - 1, y - 6, 2, cy - y + 4, F.accent); R(c, cx - 1, cy - 2, 2, 2, '#e8ecef');
      if (run && cyc % 2 === 0) for (const [sx, sy] of [[-2, 1], [2, 0], [0, 2], [3, 2], [-3, -1]]) R(c, cx + sx, cy + sy, 1, 1, cyc % 4 ? '#fff6b0' : '#9be7ff');
      break;
    }
    case 'hoist': { // a casing lowered onto a chassis
      block(c, cx - 6, cy - 2, 12, 6, 2, steel);
      block(c, cx - 5, cy - 3 - (run ? 3 - bob : 3), 10, 5, 5, '#f2f2ee', { line: '#8a8a86' });
      R(c, cx - 7, cy - 14, 14, 2, dark); R(c, cx, cy - 12, 1, 4, dark);
      break;
    }
    default: { // 'scope': a test bench with a unit under test, an oscilloscope trace and an antenna mast
      const rw = Math.min(16, w - 6); block(c, cx - rw / 2, cy - 1, rw, 6, 5, '#3a3f45'); R(c, cx - rw / 2 + 2, cy - 5, 6, 3, '#d8c27a'); R(c, cx - rw / 2 + 3 + (run ? cyc % 4 : 1), cy - 5, 1, 3, '#c83428');
      disc(c, cx + rw / 2 - 3, cy - 4, 1, '#c9ced3');
      block(c, x + 1, y + 1, 11, 4, 6, '#1d1d1d'); R(c, x + 2, y - 4, 9, 5, '#0e2a1a');
      for (let i = 0; i < 9; i++) R(c, x + 2 + i, y - 2 + Math.round(Math.sin((i + (run ? cyc * 2 : 0)) * 0.9) * 1.6), 1, 1, '#5cff8a');
      const ax2 = x + w - 4; R(c, ax2, y - 9, 1, d + 4, steel); R(c, ax2 - 3, y - 9, 7, 1, steel); R(c, ax2 - 2, y - 6, 5, 1, steel); R(c, ax2 - 1, y - 3, 3, 1, steel);
      if (run && cyc % 4 < 2) R(c, ax2, y - 10, 1, 1, '#ff4a3d');
      break;
    }
  }
}
function machine(c, v, o, t, ghost, anim) {
  const { w, h } = rotSize('machine', o.rot || 0);
  if (!ghost && !o.noPorts) portMarks(c, v, o);
  const [x, y] = tileXY(v, o.x, o.y);
  const tier = machineTier(o.family);
  const F = finish(tier, o.mode === 'research' ? '#3a6fb0' : lineHue(o.family));
  const W = w * T, D = h * T;
  const run = !ghost && !o.broken && /Running|Research \d/.test(o.status || '');
  const ph = run && anim ? Math.floor(t / 140) : 0;
  R(c, x + 2, y + 3, W - 3, D - 3, 'rgba(0,0,0,0.25)'); // shadow
  const b = block(c, x + 2, y + 2, W - 5, D - 5, 14, F.body, { line: F.trim });
  // deck
  R(c, b.x + 3, b.y + 3, b.w - 6, b.d - 6, F.deck); frame(c, b.x + 3, b.y + 3, b.w - 6, b.d - 6, shade(F.deck, -0.4));
  if (tier <= 2) for (const [rx, ry] of [[1, 1], [b.w - 2, 1], [1, b.d - 2], [b.w - 2, b.d - 2]]) R(c, b.x + rx, b.y + ry, 1, 1, shade(F.body, -0.55)); // corner bolts
  if (tier === 1) for (let i = 4; i < b.w - 4; i += 5) { R(c, b.x + i, b.y + 1, 1, 1, shade(F.body, 0.35)); R(c, b.x + i, b.y + b.d - 2, 1, 1, shade(F.body, 0.35)); } // rivets
  if (tier === 3) { R(c, b.x + 1, b.y + 1, b.w - 2, 1, F.accent); } // accent rim
  if (tier === 4) { R(c, b.x + 1, b.y + 1, b.w - 2, 1, '#ffffff'); R(c, b.x + 4, b.y + 4, b.w - 8, 1, '#3c4752'); } // highlight, glass edge
  // tool head in the middle of the deck, clear of hoppers and chute
  const tx = b.x + 13, ty = b.y + 5, tw = b.w - 26, td = b.d - (w >= h ? 19 : 22);
  if (!ghost && tw > 6 && td > 6) {
    // the tool bay: the same recessed, bolted bay on every model
    R(c, tx - 1, ty - 1, tw + 2, td + 2, '#2b3136'); frame(c, tx - 2, ty - 2, tw + 4, td + 4, tier === 4 ? '#11161b' : F.trim);
    for (let j = ty + 3; j < ty + td; j += 4) R(c, tx, j, tw, 1, '#323940');
    for (const [bx2, by2] of [[tx - 2, ty - 2], [tx + tw + 1, ty - 2], [tx - 2, ty + td + 1], [tx + tw + 1, ty + td + 1]]) R(c, bx2, by2, 1, 1, '#c9ced3');
    toolHead(c, headOf(o), tx, ty, tw, td, ph, run, F);
    if (tier >= 3) { // Mk III and IV close the bay with a window: light tint and a glint
      c.globalAlpha = tier === 4 ? 0.14 : 0.1; R(c, tx - 1, ty - 1, tw + 2, td + 2, '#bfe9ff'); c.globalAlpha = 1;
      for (let k = 0; k < 5; k++) { R(c, tx + tw - 9 + k, ty + 6 - k, 1, 1, 'rgba(255,255,255,0.7)'); R(c, tx + tw - 7 + k, ty + 6 - k, 1, 1, 'rgba(255,255,255,0.35)'); }
      R(c, tx, ty, tw, 1, 'rgba(255,255,255,0.35)');
    }
  }
  const p = ports(o);
  const clampIn = ([px, py]) => [Math.min(Math.max(px, o.x), o.x + w - 1), Math.min(Math.max(py, o.y), o.y + h - 1)];
  // a hopper over each input, tagged with that material's colour
  // (two inputs at the same corner share the square: their hoppers sit side by side)
  const byTile = new Map();
  inputPorts(o).forEach((pt, k) => { const key = clampIn(pt).join(); if (!byTile.has(key)) byTile.set(key, []); byTile.get(key).push(k); });
  for (const [key, ks] of byTile) {
    const [hx, hy] = key.split(',').map(Number), [hxp, hyp] = tileXY(v, hx, hy);
    const n = ks.length, hw = n === 1 ? T - 6 : Math.floor((T - 4) / n) - 1;
    ks.forEach((k, j) => {
      const hb = block(c, hxp + (n === 1 ? 3 : 2 + j * (hw + 1)), hyp + 2 - 14 + 3, hw, T - 7, 6, tier >= 3 ? '#a9b0b7' : '#8a929a');
      R(c, hb.x + 1, hb.y + 2, hb.w - 2, 2, '#2e3338'); R(c, hb.x + 1, hb.frontY + 1, hb.w - 2, 2, ghost ? '#3a3f44' : itemColor(portItem(o, k)));
    });
  }
  const [ex, ey] = clampIn(p.output), [exp, eyp] = tileXY(v, ex, ey);
  const ch = block(c, exp + 4, eyp + 4 - 14 + 3, T - 8, T - 9, 3, '#565c63');
  R(c, ch.x + 1, ch.y + 1, ch.w - 2, 1, '#2e3338');
  // front face: nameplate (line code + Mk pips), instruments by Mk, lamp, hazard kick plate
  const fy = b.frontY, fw = b.w;
  if (tier === 3) R(c, b.x + 1, fy + 1, fw - 2, 2, F.accent);
  for (let i = 0; i < fw - 2; i++) R(c, b.x + 1 + i, fy + 10, 1, 2, ((i >> 1) & 1) ? '#f2b71f' : '#1d1d1d');
  // nameplate in the line colour on every model
  R(c, b.x + 2, fy + 2 + (tier === 3 ? 1 : 0), 13, 7, shade(F.accent, -0.3)); R(c, b.x + 2, fy + 2 + (tier === 3 ? 1 : 0), 13, 1, shade(F.accent, 0.25));
  if (!ghost) pixText(c, FAMILIES[o.family]?.code || '', b.x + 3, fy + 3 + (tier === 3 ? 1 : 0), '#ffffff');
  for (let k = 0; k < tier; k++) R(c, b.x + 17 + k * 2, fy + 3, 1, 1, '#f2b71f'); // Mk pips
  const mx = b.x + 17, mw = fw - 17 - 10; // instrument strip
  if (!ghost && mw >= 8) {
    if (tier === 1) { // round dial and a rivet line
      disc(c, mx + 3, fy + 7, 2, '#f0ead8'); const a = run ? (ph % 6) * 0.5 - 1.2 : -1.2; R(c, Math.round(mx + 3 + Math.cos(a) * 1.6), Math.round(fy + 7 + Math.sin(a) * 1.6), 1, 1, '#c83428');
      for (let i = mx + 8; i < mx + mw; i += 4) R(c, i, fy + 5, 1, 1, shade(F.body, 0.35));
    } else if (tier === 2) { // amber counter and louvres
      R(c, mx, fy + 5, 9, 4, '#1d1d1d'); for (let k = 0; k < 3; k++) R(c, mx + 1 + k * 3, fy + 6, 2, 2, run && (ph + k) % 3 === 0 ? '#ffb02e' : '#7a4a10');
      for (let i = mx + 12; i < mx + mw - 1; i += 3) R(c, i, fy + 5, 2, 4, shade(F.body, -0.35));
    } else if (tier === 3) { // small green CRT and seams
      R(c, mx, fy + 4, 11, 5, '#1d1d1d'); R(c, mx + 1, fy + 5, 9, 3, '#0e3a1e');
      for (let k = 0; k < 3; k++) R(c, mx + 2, fy + 5 + k, run ? 2 + ((ph + k * 3) % 6) : 3, 1, '#5cff8a');
      for (let i = mx + 14; i < mx + mw; i += 7) R(c, i, fy + 3, 1, 6, shade(F.body, -0.18));
    } else { // display and LED strip
      R(c, mx, fy + 3, Math.min(14, mw - 2), 5, '#11161b'); R(c, mx + 1, fy + 4 + (run ? ph % 3 : 1), Math.min(12, mw - 4), 1, '#5fd3ff');
      for (let i = 0; i < mw - 1; i += 2) R(c, mx + i, fy + 8, 1, 1, run && ((i >> 1) + ph) % 5 === 0 ? '#ffffff' : F.accent);
    }
  }
  const lampX = b.x + fw - 7, lampY = fy + 3;
  R(c, lampX - 1, lampY - 1, 5, 5, '#1d1d1d');
  if (!ghost) R(c, lampX, lampY, 3, 3, o.broken ? (Math.floor(t / 300) % 2 ? '#ff4a3d' : '#7a1d16') : run ? (Math.floor(t / 500) % 2 ? '#5cff8a' : '#2fa858') : '#f2b71f');
  return b;
}
function office(c, v, o, st) {
  const { w, h } = rotSize('office', o.rot || 0); const [x, y] = tileXY(v, o.x, o.y), W = w * T, D = h * T;
  dither(c, x + 1, y + 1, W - 1, D - 1, '#c9b48e', '#bda780');
  // partitions on the back and side edges, leaving the door open; a clock and a window strip on the back wall
  const door = ports(o).door, [dx, dy] = tileXY(v, door[0], door[1]);
  const wallC = '#e4dccb';
  const back = block(c, x, y, W, 3, 10, wallC);
  R(c, x + 6, back.frontY + 2, W - 22, 4, 'rgba(150,200,230,0.8)'); R(c, x + 6, back.frontY + 2, W - 22, 1, '#ffffff'); frame(c, x + 5, back.frontY + 1, W - 20, 6, '#b9b3a3');
  disc(c, x + W - 9, back.frontY + 5, 2, '#f4f1e8'); R(c, x + W - 9, back.frontY + 4, 1, 2, '#1d1d1d'); R(c, x + W - 9, back.frontY + 5, 2, 1, '#1d1d1d');
  block(c, x, y + 3, 3, D - 3, 10, wallC);
  block(c, x + W - 3, y + 3, 3, D - 3, 10, wallC);
  if (dy >= y + D) { block(c, x, y + D - 3, dx - x, 3, 10, wallC); block(c, dx + T, y + D - 3, x + W - dx - T, 3, 10, wallC); }
  else block(c, x, y + D - 3, W, 3, 10, wallC);
  // nameplate by the door in the occupant's department colour
  const occ = st?.employees?.find(e => e.assign === o.id);
  if (occ) { R(c, dx - 6, y + D - 12, 5, 3, '#1d1d1d'); R(c, dx - 5, y + D - 11, 3, 1, deptColor(JOBS[occ.job]?.dept)); }
  // desk with clutter, chair, and kit by office type
  const desk = block(c, x + 8, y + 12, W - 16, 10, 7, '#8a5d34', { line: '#4a2e14' });
  deskTop(c, desk, { noPhone: false });
  chair(c, x + W / 2 - 8, y + 22, 'n');
  const kit = officeKit(o);
  if (kit.has('pc')) { block(c, x + W / 2 - 5, y + 9, 10, 5, 8, '#d9d3c0', { line: '#7a7462' }); R(c, x + W / 2 - 4, y + 2, 8, 5, '#2a6aa0'); R(c, x + W / 2 - 3, y + 3, 3, 1, '#bfe9ff'); R(c, x + W / 2 - 5, y + 15, 10, 2, '#e8e4d4'); }
  if (kit.has('files')) { const f = block(c, x + 4, y + 7, 7, 6, 11, '#8c939a'); for (let k = 0; k < 2; k++) { R(c, f.x + 1, f.frontY + 2 + k * 5, f.w - 2, 1, '#6a7178'); R(c, f.x + 3, f.frontY + 3 + k * 5, 2, 1, '#e0e4e8'); } }
  if (kit.has('cabinet')) { const s2 = block(c, x + W - 13, y + 7, 8, 6, 14, '#6f5a3c', { line: '#3a2a14' }); R(c, s2.x + 4, s2.frontY + 1, 1, 12, '#3a2a14'); R(c, s2.x + 2, s2.frontY + 6, 1, 2, '#d8c27a'); R(c, s2.x + 6, s2.frontY + 6, 1, 2, '#d8c27a'); }
  block(c, x + W - 10, y + D - 13, 5, 5, 3, '#6a4a2a'); R(c, x + W - 10, y + D - 22, 5, 6, '#3f8f3a'); R(c, x + W - 9, y + D - 24, 3, 2, '#2f6f2a'); // potted plant
  if (kit.has('plant')) { block(c, x + 5, y + D - 12, 5, 4, 4, '#a0522d'); for (const [dx, dy] of [[0, -12], [-2, -9], [3, -10], [-1, -6], [2, -5]]) R(c, x + 6 + dx, y + D - 12 + dy, 3, 3, (dx + dy) % 2 ? '#3f8f3a' : '#2f6f2a'); } // corner office: a tall fig
  if (kit.has('window')) { R(c, x + 3, y + 1, W - 6, 2, 'rgba(150,200,230,0.9)'); R(c, x + 3, y + 1, W - 6, 1, '#ffffff'); } // and a wider window
  block(c, x + 5, y + D - 11, 4, 4, 4, '#4a4f55'); R(c, x + 6, y + D - 14, 2, 1, '#f4f1e8'); // waste basket
}
function room(c, v, o) {
  const { w, h } = rotSize(o.kind, 0); const [x, y] = tileXY(v, o.x, o.y), W = w * T, D = h * T;
  const door = ports(o).door, [dx] = tileXY(v, door[0], door[1]);
  if (o.kind === 'breakroom') {
    for (let j = 0; j < D; j += 4) for (let i = 0; i < W; i += 8) R(c, x + i + ((j / 4) % 2) * 4, y + j, 8, 4, ((i + j) / 4) % 2 ? '#c79a64' : '#b98a56');
    block(c, x + W / 2 - 14, y + D / 2 - 4, 28, 12, 6, '#d8d2c4');
    for (const [cx, cy] of [[-12, -12], [6, -12], [-12, 12], [6, 12]]) block(c, x + W / 2 + cx, y + D / 2 + cy, 6, 6, 4, '#7a3b2a');
    block(c, x + W - 14, y + 4, 10, 8, 18, '#c0392b'); R(c, x + W - 12, y - 12, 6, 6, '#9fd0ea');
    block(c, x + 4, y + 4, 12, 8, 10, '#cfd3d6');
  } else {
    for (let j = 0; j < D; j += 4) for (let i = 0; i < W; i += 4) R(c, x + i, y + j, 4, 4, ((i + j) / 4) % 2 ? '#e6eef3' : '#c7d9e6');
    for (let i = 0; i < 2; i++) { block(c, x + 4 + i * 20, y + 4, 16, 12, 14, '#7fa6c4'); R(c, x + 9 + i * 20, y + 6, 6, 4, '#f4f7f9'); }
  }
  const wallC = '#e4dccb';
  block(c, x, y, W, 3, 12, wallC); block(c, x, y + 3, 3, D - 3, 12, wallC); block(c, x + W - 3, y + 3, 3, D - 3, 12, wallC);
  block(c, x, y + D - 3, dx - x, 3, 12, wallC); block(c, dx + T, y + D - 3, x + W - dx - T, 3, 12, wallC);
}
function conveyor(c, v, o, t, anim, fl) {
  const [x, y] = tileXY(v, o.x, o.y);
  const has = (dx, dy) => fl.objects.some(q => q.kind === 'conveyor' && q.x === o.x + dx && q.y === o.y + dy);
  const horiz = has(1, 0) || has(-1, 0) || !(has(0, 1) || has(0, -1));
  R(c, x + 1, y + 2, T - 2, T - 2, '#2c3034');
  R(c, x + 2, y + 2, T - 4, T - 5, '#4f565c');
  const dir = v.beltDir?.get(o.y * fl.w + o.x);
  const live = anim && dir && v.beltLive?.has(o.y * fl.w + o.x);
  const raw = live ? Math.floor(t / 90) % 4 : 0, off = dir && (dir[0] < 0 || dir[1] < 0) ? (4 - raw) % 4 : raw;
  if (horiz) { for (let i = (off % 4); i < T - 4; i += 4) R(c, x + 2 + i, y + 3, 1, T - 7, '#9aa2a8'); if (!has(0, -1)) R(c, x + 1, y + 1, T - 2, 1, '#22262a'); if (!has(0, 1)) R(c, x + 1, y + T - 3, T - 2, 2, '#22262a'); }
  else { for (let j = (off % 4); j < T - 5; j += 4) R(c, x + 3, y + 2 + j, T - 6, 1, '#9aa2a8'); if (!has(-1, 0)) R(c, x + 1, y + 1, 1, T - 2, '#22262a'); if (!has(1, 0)) R(c, x + T - 2, y + 1, 1, T - 2, '#22262a'); }
  // direction chevron, so flow never depends on motion alone; unconnected belts get a dim dash
  const cx = x + T / 2, cy = y + T / 2 - 1.5;
  if (dir) beltChevron(c, cx, cy, dir, '#f2b71f');
  else if (v.beltDir) { R(c, cx - 2, cy, 4, 1, '#6c757c'); }
}
function beltChevron(c, cx, cy, [dx, dy], col) {
  cx = Math.round(cx); cy = Math.round(cy);
  const px = -dy, py = dx, pts = [];
  for (let k = 0; k <= 2; k++) { const bx = cx + dx * (1 - k), by = cy + dy * (1 - k); pts.push([bx + px * k, by + py * k], [bx - px * k, by - py * k]); }
  for (const [x, y] of pts) R(c, x, y + 1, 1, 1, '#1d1d1d');
  for (const [x, y] of pts) R(c, x, y, 1, 1, col);
}
// a box riding a belt; (fx, fy) are fractional tile coordinates
export function beltBox(c, v, fx, fy, tag = null) {
  const [x, y] = tileXY(v, fx, fy); const bx = Math.round(x + T / 2 - 3), by = Math.round(y + T / 2 - 5);
  const color = '#c89a62';
  R(c, bx, by + 5, 6, 1, 'rgba(0,0,0,0.35)');
  const b = block(c, bx, by + 1, 6, 4, 3, color, { top: shade(color, 0.2), front: shade(color, -0.2), line: '#5a4026' });
  if (tag) R(c, b.x + 1, b.y + 1, b.w - 2, 2, tag); // label in the material's colour
}
function bin(c, v, o) {
  const [x, y] = tileXY(v, o.x, o.y); const S = 2 * T;
  const b = block(c, x + 3, y + 4, S - 6, S - 8, 12, '#6c7f8f');
  R(c, b.x + 3, b.y + 3, b.w - 6, b.d - 6, '#2c343b'); R(c, b.x + 5, b.y + 5, b.w - 10, 4, '#c89a62');
  for (let i = 0; i < b.w; i += 6) R(c, b.x + i, b.frontY + 1, 1, 10, shade('#6c7f8f', -0.4));
}
function forklift(c, v, o) {
  const { w, h } = rotSize('forklift', o.rot || 0); const [x, y] = tileXY(v, o.x, o.y);
  const W = w * T, D = h * T;
  R(c, x + 3, y + 5, W - 5, D - 5, 'rgba(0,0,0,0.25)');
  const b = block(c, x + 2, y + 6, W - 4, D - 12, 8, '#f2b71f');
  R(c, b.x + 3, b.y + 3, b.w - 6, 6, '#2a2a2a'); // seat
  block(c, x + 2, y + D - 6, W - 4, 2, 16, '#3a3a3a'); // mast
  R(c, x + 4, y + D - 3, 2, 3, '#555'); R(c, x + W - 6, y + D - 3, 2, 3, '#555'); // forks
  for (const [px, py] of [[x + 1, y + 10], [x + W - 3, y + 10], [x + 1, y + D - 10], [x + W - 3, y + D - 10]]) R(c, px, py, 2, 4, '#111');
}
function handcart(c, v, o) {
  const [x, y] = tileXY(v, o.x, o.y);
  block(c, x + 3, y + 6, T - 6, 6, 2, '#b03a2e'); R(c, x + 3, y - 4, 2, 12, '#7d2a21'); R(c, x + 3, y - 5, 6, 2, '#7d2a21');
  R(c, x + 3, y + 11, 3, 3, '#111'); R(c, x + T - 6, y + 11, 3, 3, '#111');
}
function dock(c, v, o) {
  const [x, y] = tileXY(v, o.x, o.y), W = 4 * T;
  for (let j = 0; j < T; j++) for (let i = 0; i < W; i++) { c.fillStyle = (((i + j) >> 2) & 1) ? '#f2b71f' : '#1d1d1d'; c.fillRect(x + i, y + j, 1, 1); }
  // roll-up door in the front wall
  R(c, x + 8, y + T, W - 16, 3, '#6a7178'); for (let i = 0; i < W - 16; i += 2) R(c, x + 8 + i, y + T, 1, 3, '#4a5056');
  block(c, x + 18, y + 3, 14, 10, 2, '#9a7546'); block(c, x + 19, y + 3, 12, 8, 7, '#c89a62', { top: '#dcb27a', front: '#a77d4a' });
}
function exitSign(c, v, o) {
  const [x, y] = tileXY(v, o.x, o.y);
  R(c, x + 1, y + 1, T - 2, T - 2, '#2f8a4f'); R(c, x + 2, y + T, T - 4, 3, '#1f6a3a');
  R(c, x + T / 2 - 1, y - 6, 2, 12, '#555'); R(c, x, y - 13, T, 8, '#2fa858'); frame(c, x, y - 13, T, 8, '#1f6a3a');
  pixText(c, 'EXIT', x + 1, y - 12, '#ffffff');
}
function pallet(c, x, y, stack) {
  R(c, x, y + 6, 7, 2, '#8a6a42');
  for (let k = 0; k < stack; k++) block(c, x, y + 1, 7, 5, 4 + k * 4, '#c89a62', { top: '#dcb27a', front: '#a77d4a', line: '#6e5230' });
}
function worker(c, v, e, t, moving) {
  const [sx, sy] = tileXY(v, e.px, e.py);
  const x = Math.round(sx + T / 2 - 3), y = Math.round(sy + T / 2 + 4);
  R(c, x - 1, y, 8, 2, 'rgba(0,0,0,0.25)');
  const step = moving ? Math.floor(t / 160) % 2 : 0;
  R(c, x + 1, y - 4, 2, 4 - step, '#2b2f3a'); R(c, x + 3, y - 4, 2, 3 + step, '#2b2f3a');
  const shirt = deptColor(JOBS[e.job]?.dept);
  R(c, x, y - 10, 6, 6, shirt); R(c, x + 5, y - 10, 1, 6, shade(shirt, -0.3)); R(c, x - 1, y - 9, 1, 4, shirt); R(c, x + 6, y - 9, 1, 4, shade(shirt, -0.3));
  R(c, x + 1, y - 14, 4, 4, ['#f0d2b6', '#d9a77e', '#a86e4a', '#7a4a2e'][e.id % 4]);
  R(c, x + 1, y - 15, 4, 2, ['#3a2a1a', '#1a1a1a', '#8a6a3a', '#b0b0b0', '#6a2a1a'][(e.id >> 2) % 5]);
  if (e.hat) { R(c, x, y - 16, 6, 2, '#f2b71f'); R(c, x - 1, y - 14, 8, 1, '#c99510'); }
  // carrying boxes: in the arms, on a pallet jack or on a forklift's forks
  if (e.carry?.length) {
    const box = (bx, by, col) => { const b = block(c, bx, by, 6, 4, 3, '#c89a62', { top: '#dcb27a', front: '#a77d4a', line: '#5a4026' }); R(c, b.x + 1, b.y + 1, b.w - 2, 1, col); };
    if (e.equip === 'forklift') { block(c, x - 3, y - 6, 12, 7, 4, '#f2b71f'); R(c, x + 9, y - 10, 1, 9, '#3a3a3a'); e.carry.slice(0, 4).forEach((col, k) => box(x + 10, y - 4 - k * 4, col)); }
    else if (e.equip === 'cart') { block(c, x + 6, y - 3, 7, 4, 2, '#b03a2e'); R(c, x + 6, y + 1, 2, 2, '#111'); R(c, x + 11, y + 1, 2, 2, '#111'); e.carry.slice(0, 2).forEach((col, k) => box(x + 6, y - 6 - k * 4, col)); }
    else { box(x - 1, y - 8, e.carry[0]); R(c, x - 2, y - 8, 1, 3, '#f0d2b6'); R(c, x + 6, y - 8, 1, 3, '#f0d2b6'); } // held at chest height, hands on the sides
  }
}
function bubble(c, v, e, kind) {
  const [sx, sy] = tileXY(v, e.px, e.py); const x = Math.round(sx + T / 2 + 3), y = Math.round(sy + T / 2 - 18);
  R(c, x, y, 7, 6, '#1d1d1d'); R(c, x + 1, y + 1, 5, 4, '#ffffff'); R(c, x + 1, y + 6, 1, 1, '#1d1d1d');
  if (kind === 'coffee') { R(c, x + 2, y + 2, 2, 2, '#7a4a2a'); R(c, x + 4, y + 2, 1, 1, '#7a4a2a'); }
  else if (kind === 'smoke') { R(c, x + 1, y + 3, 4, 1, '#888'); R(c, x + 4, y + 3, 1, 1, '#e06030'); }
  else if (kind === 'strike') R(c, x + 2, y + 2, 3, 2, '#c0392b');
  else if (kind === 'goof') { R(c, x + 2, y + 2, 1, 1, '#3a6fb0'); R(c, x + 4, y + 3, 1, 1, '#3a6fb0'); }
}
function badge(c, x, y, color, glyph) {
  x = Math.round(x); y = Math.round(y);
  R(c, x - 4, y - 4, 9, 9, '#1d1d1d'); R(c, x - 3, y - 3, 7, 7, color);
  const ink = glyph === 'x' ? '#ffffff' : '#1d1d1d';
  if (glyph === '!') { R(c, x, y - 2, 1, 3, ink); R(c, x, y + 2, 1, 1, ink); }
  else if (glyph === '?') { R(c, x - 1, y - 2, 3, 1, ink); R(c, x + 1, y - 1, 1, 1, ink); R(c, x, y, 1, 1, ink); R(c, x, y + 2, 1, 1, ink); }
  else for (let k = -2; k <= 2; k++) { R(c, x + k, y + k, 1, 1, ink); R(c, x + k, y - k, 1, 1, ink); }
}

// ---------- production cells: a walled room the player lays out, with hatches and furniture
function cellFloor(c, v, o, ghost = false) {
  const [x, y] = tileXY(v, o.x, o.y), W = o.cw * T, D = o.ch * T;
  if (o.kind === 'suite') {
    // office carpet: a fine two-tone weave with a border
    dither(c, x, y, W, D, '#6f7fa6', '#7889ae'); frame(c, x + 1, y + 1, W - 2, D - 2, '#5d6b8f');
  } else {
    const hue = lineHue(o.family), a = mix(hue, '#ece8dc', 0.82), b = mix(hue, '#ece8dc', 0.74);
    for (let j = 0; j < o.ch; j++) for (let i = 0; i < o.cw; i++) R(c, x + i * T, y + j * T, T, T, (i + j) % 2 ? a : b);
  }
  // work squares: footprints where the operators stand
  for (const it of o.items || []) if (isStation(it) && o.kind !== 'suite') { const [wx, wy] = workSquare(it); const px = x + wx * T, py = y + wy * T; R(c, px + 4, py + 5, 3, 6, 'rgba(160,110,0,0.45)'); R(c, px + 9, py + 5, 3, 6, 'rgba(160,110,0,0.45)'); }
  // back wall (north) with its height; side walls are thin and the front is a low glazed partition
  const wallTop = '#d8d4c8', wallFace = '#b9b3a3', wallLine = '#6e6a5f', glass = 'rgba(150,200,230,0.55)';
  const gap = (side, i) => (o.hatches || []).find(h => (side === 'n' && h.ly === -1 && h.lx === i) || (side === 's' && h.ly === o.ch && h.lx === i) || (side === 'w' && h.lx === -1 && h.ly === i) || (side === 'e' && h.lx === o.cw && h.ly === i));
  for (let i = 0; i < o.cw; i++) {
    const hz = gap('n', i); const px = x + i * T;
    if (hz) { hatchMark(c, px, y - 10, T, 10, hz, 'n'); continue; }
    R(c, px, y - 10, T, 8, wallFace); R(c, px, y - 12, T, 2, wallTop); R(c, px + 2, y - 8, T - 4, 4, glass); R(c, px, y - 2, T, 2, wallLine);
  }
  // side walls: thin with a top edge
  for (const side of ['w', 'e']) for (let j = 0; j < o.ch; j++) {
    const hz = gap(side, j), px = side === 'w' ? x - 2 : x + W - 1, py = y + j * T;
    if (hz) { hatchMark(c, side === 'w' ? x - 3 : x + W - 2, py, 5, T, hz, side); continue; }
    R(c, px, py - 10, 3, T, wallTop); R(c, px, py + T - 10, 3, 10, wallFace); R(c, side === 'w' ? px : px + 2, py - 10, 1, T + 10, wallLine);
  }
  if (!ghost) portMarks(c, v, o);
}
function cellFront(c, v, o) {
  const [x, y] = tileXY(v, o.x, o.y), D = o.ch * T;
  const gap = i => (o.hatches || []).find(h => h.ly === o.ch && h.lx === i);
  for (let i = 0; i < o.cw; i++) {
    const hz = gap(i), px = x + i * T;
    if (hz) { hatchMark(c, px, y + D - 4, T, 6, hz, 's'); continue; }
    // a low glazed partition along the front, so the room stays visible
    R(c, px, y + D - 5, T, 2, '#d8d4c8'); R(c, px, y + D - 3, T, 3, '#b9b3a3'); R(c, px, y + D, T, 1, '#6e6a5f');
  }
}
function hatchMark(c, x, y, w, h, hz, side) {
  const col = hz.role === 'door' ? '#8a5a2b' : hz.role === 'out' ? '#2f8a4f' : '#c83428';
  R(c, x, y, w, h, 'rgba(0,0,0,0.12)');
  if (side === 'n' || side === 's') { R(c, x, y, 2, h, col); R(c, x + w - 2, y, 2, h, col); R(c, x, y, w, 2, col); }
  else { R(c, x, y, w, 2, col); R(c, x, y + h - 2, w, 2, col); }
  if (hz.role === 'door') { if (side === 'n' || side === 's') R(c, x + 3, y + 2, w - 6, h - 2, '#b07a44'); else R(c, x + 1, y + 2, w - 2, h - 4, '#b07a44'); }
  else if (hz.role === 'in' && (side === 'n' || side === 's')) pixText(c, String(hz.k + 1), x + w / 2 - 1, y + (side === 'n' ? 3 : 0), '#ffffff');
}
const LOOK = {
  rack: '#8a6a3a', board: '#c9a46a', cabinet: '#7d858d', fan: '#8e979f', table: '#9a8a70', mat: '#2f3338', curtain: '#3d4349', plc: '#5f6770',
  robot: '#e0a020', terminal: '#3d4349', dryer: '#d29a2a', chiller: '#4a8ac0', tank: '#9aa3ab', scanner: '#5d6f86', oven: '#6b5a50', booth: '#a7b2bd', printer: '#e8e8e2', hoist: '#d8b024',
};
function cellItem(c, v, o, it, t, run) {
  const d = itemDef(it.t); if (!d) return;
  const { w, h } = itemSize(it);
  const x = v.ox + (o.x + it.x) * T, y = v.oy + (o.y + it.y) * T, W = w * T, D = h * T;
  const hue = lineHue(o.family);
  const ph = run ? Math.floor(t / 140) : 0;
  if (d.look === 'station') {
    // a compact cousin of the full machine: same kick plate, nameplate colour and tool head
    const F = finish(machineTier(o.family), hue);
    R(c, x + 2, y + 3, W - 3, D - 3, 'rgba(0,0,0,0.22)');
    const b = block(c, x + 1, y + 2, W - 3, D - 3, 10, F.body, { line: F.trim });
    R(c, b.x + 2, b.y + 2, b.w - 4, b.d - 4, '#2b3136');
    toolHead(c, FAMILIES[o.family]?.head, b.x + 2, b.y + 2, b.w - 4, b.d - 4, ph, run, F);
    for (let i = 0; i < b.w - 2; i++) R(c, b.x + 1 + i, b.frontY + 7, 1, 2, ((i >> 1) & 1) ? '#f2b71f' : '#1d1d1d');
    R(c, b.x + 2, b.frontY + 2, 7, 4, shade(hue, -0.3)); pixText(c, d.role, b.x + 3, b.frontY + 1, '#ffffff');
    return;
  }
  if (d.suite) return officeItem(c, v, o, it, x, y, W, D, t, run);
  const col = LOOK[d.look] || '#8a929a';
  switch (d.look) {
    case 'mat': { for (let j = 2; j < D - 2; j++) for (let i = 2; i < W - 2; i++) R(c, x + i, y + j, 1, 1, (i + j) % 3 ? col : '#454a50'); return; }
    case 'rack': { const b = block(c, x + 2, y + 3, W - 4, D - 6, 12, col); for (let k = 0; k < 3; k++) { R(c, b.x + 1, b.frontY + 1 + k * 4, b.w - 2, 1, shade(col, -0.4)); R(c, b.x + 2 + (k * 3) % (b.w - 5), b.frontY - 2 + k * 4, 4, 3, '#c89a62'); } return; }
    case 'board': { R(c, x + 2, y + 2, W - 4, 3, '#555'); const b = block(c, x + 2, y + 5, W - 4, 2, 13, col); for (let i = b.x + 2; i < b.x + b.w - 2; i += 3) R(c, i, b.frontY + 3, 1, 4, '#555'); R(c, b.x + 3, b.frontY + 8, 3, 1, '#c83428'); return; }
    case 'cabinet': { const b = block(c, x + 2, y + 3, W - 4, D - 6, 16, col); for (let k = 0; k < 4; k++) { R(c, b.x + 1, b.frontY + 2 + k * 4, b.w - 2, 1, shade(col, -0.35)); R(c, b.x + b.w / 2 - 1, b.frontY + 3 + k * 4, 2, 1, '#e0e4e8'); } return; }
    case 'fan': { const b = block(c, x + 2, y + 3, W - 4, D - 6, 8, col); const a = run ? ph * 0.8 : 0; disc(c, b.x + b.w / 2, b.y + b.d / 2, 4, '#2e3338'); for (let k = 0; k < 3; k++) R(c, Math.round(b.x + b.w / 2 + Math.cos(a + k * 2.1) * 3), Math.round(b.y + b.d / 2 + Math.sin(a + k * 2.1) * 3), 1, 1, '#c9ced3'); return; }
    case 'table': { const b = block(c, x + 1, y + 3, W - 2, D - 6, 7, col); R(c, b.x + 3, b.y + 2, 6, 3, '#e0e4e8'); R(c, b.x + b.w - 8, b.y + 2, 4, 4, hue); return; }
    case 'curtain': { R(c, x + 3, y - 8, 2, 16, '#2e3338'); R(c, x + W - 5, y - 8, 2, 16, '#2e3338'); for (let k = 0; k < 5; k++) R(c, x + 5, y - 6 + k * 3, W - 10, 1, run && (k + ph) % 2 ? '#ff7a6a' : '#c83428'); return; }
    case 'plc': { const b = block(c, x + 3, y + 4, W - 6, D - 8, 12, col); for (let k = 0; k < 4; k++) R(c, b.x + 2 + k * 2, b.frontY + 2, 1, 1, run && (k + ph) % 3 === 0 ? '#5cff8a' : '#2fa858'); R(c, b.x + 2, b.frontY + 5, b.w - 4, 3, '#1d1d1d'); return; }
    case 'robot': { disc(c, x + W / 2, y + D / 2 + 2, 5, '#3d4349'); disc(c, x + W / 2, y + D / 2 + 1, 3, col); const a = run ? Math.sin(ph * 0.6) : 0.4; const ex = Math.round(x + W / 2 + Math.cos(a) * 6), ey = Math.round(y + D / 2 - 8 + Math.sin(a) * 3); for (let k = 0; k <= 4; k++) R(c, Math.round(x + W / 2 + (ex - x - W / 2) * k / 4), Math.round(y + D / 2 - 2 + (ey - y - D / 2 + 2) * k / 4), 2, 2, col); R(c, ex - 1, ey - 1, 3, 2, '#3d4349'); return; }
    case 'terminal': { R(c, x + W / 2 - 1, y + 2, 2, D - 4, '#555'); const b = block(c, x + 2, y + 2, W - 4, 3, 10, col); R(c, b.x + 1, b.frontY + 1, b.w - 2, 6, run && ph % 4 < 2 ? '#5fd3ff' : '#2a7aa0'); return; }
    case 'dryer': case 'chiller': case 'tank': { const r = Math.min(W, D) / 2 - 2; R(c, x + W / 2 - r, y + D / 2 - 8, r * 2, 10, shade(col, -0.2)); disc(c, x + W / 2, y + D / 2 - 8, r, col); disc(c, x + W / 2, y + D / 2 - 8, Math.max(1, r - 3), shade(col, 0.25)); if (d.look === 'chiller' && run) R(c, x + W / 2 - 1, y + D / 2 - 9, 2, 2, '#bfe9ff'); return; }
    case 'scanner': { const b = block(c, x + 2, y + 3, W - 4, D - 6, 11, col); R(c, b.x + 2, b.y + 2, b.w - 4, b.d - 4, run && ph % 3 ? '#7fd4ff' : '#2a7aa0'); return; }
    case 'oven': { const b = block(c, x + 1, y + 3, W - 2, D - 5, 14, col); R(c, b.x + 3, b.frontY + 3, b.w - 6, 7, '#1d1d1d'); R(c, b.x + 4, b.frontY + 4, b.w - 8, 5, run ? (ph % 2 ? '#ff8a2a' : '#e05a1a') : '#5a2a10'); return; }
    case 'booth': { const b = block(c, x + 1, y + 2, W - 2, D - 4, 16, col, { line: '#59616b' }); c.globalAlpha = 0.35; R(c, b.x + 2, b.frontY + 1, b.w - 4, 13, '#bfe9ff'); c.globalAlpha = 1; R(c, b.x + 2, b.y + 2, b.w - 4, 2, '#e8ecef'); return; }
    case 'printer': { const b = block(c, x + 3, y + 4, W - 6, D - 8, 7, col, { line: '#8a8a86' }); R(c, b.x + 2, b.frontY + 2, b.w - 4, 2, '#1d1d1d'); if (run && ph % 3 === 0) R(c, b.x + 3, b.frontY + 4, 4, 2, '#ffffff'); return; }
    case 'hoist': { R(c, x + 2, y - 12, 2, 18, '#555'); R(c, x + 2, y - 12, W - 3, 2, col); R(c, x + W - 4, y - 10, 1, 6 + (run ? ph % 3 : 0), '#2e3338'); R(c, x + W - 6, y - 4 + (run ? ph % 3 : 0), 5, 2, '#2e3338'); return; }
    default: block(c, x + 2, y + 3, W - 4, D - 6, 8, col);
  }
}
// ---------- office furniture (premade offices and suites share these pieces)
function chair(c, x, y, facing) {
  // a swivel chair seen from behind or the side; facing is the direction the sitter looks
  R(c, x + 4, y + 11, 8, 2, 'rgba(0,0,0,0.25)'); R(c, x + 7, y + 8, 2, 4, '#3a3a3a'); R(c, x + 4, y + 11, 8, 1, '#2a2a2a');
  block(c, x + 4, y + 5, 8, 4, 2, '#3a3f55');
  if (facing === 'n') block(c, x + 4, y + 9, 8, 2, 7, '#2f3448'); else if (facing === 's') block(c, x + 4, y + 3, 8, 2, 7, '#2f3448');
  else if (facing === 'w') block(c, x + 10, y + 4, 2, 6, 7, '#2f3448'); else block(c, x + 4, y + 4, 2, 6, 7, '#2f3448');
}
function deskTop(c, b, opts = {}) {
  // papers, a phone, a mug and an in-tray on a wooden desk
  R(c, b.x + 1, b.y + 1, b.w - 2, 1, '#a57446');
  R(c, b.x + 3, b.y + 3, 6, 4, '#f4f1e8'); R(c, b.x + 4, b.y + 4, 4, 1, '#9aa3ab'); R(c, b.x + 4, b.y + 6, 3, 1, '#9aa3ab');
  if (!opts.noPhone) { R(c, b.x + b.w - 8, b.y + 3, 5, 3, '#2a2a2a'); R(c, b.x + b.w - 8, b.y + 2, 5, 1, '#3d3d3d'); }
  R(c, b.x + b.w / 2 + 1, b.y + 3, 2, 2, '#e8e8e2'); R(c, b.x + b.w / 2 + 1, b.y + 3, 2, 1, '#6a3a1a');
  R(c, b.x + 10, b.y + b.d - 4, 5, 2, '#c8a46a');
}
const FACE = ['n', 'e', 's', 'w'];
function officeItem(c, v, o, it, x, y, W, D, t, run) {
  const d = itemDef(it.t), r = (it.rot || 0) & 3, ph = run ? Math.floor(t / 300) : 0;
  switch (d.look) {
    case 'desk': {
      const b = block(c, x + 1, y + 3, W - 2, D - 5, 7, '#8a5d34', { line: '#4a2e14' });
      deskTop(c, b);
      const [wx, wy] = workSquare(it), cx = v.ox + (o.x + wx) * T, cy = v.oy + (o.y + wy) * T;
      chair(c, cx, cy, FACE[r]);
      return;
    }
    case 'ofile': { const b = block(c, x + 3, y + 3, W - 6, D - 6, 12, '#8c939a'); for (let k = 0; k < 3; k++) { R(c, b.x + 1, b.frontY + 1 + k * 4, b.w - 2, 1, '#6a7178'); R(c, b.x + b.w / 2 - 1, b.frontY + 2 + k * 4, 2, 1, '#e0e4e8'); } return; }
    case 'ostore': { const b = block(c, x + 2, y + 3, W - 4, D - 6, 15, '#6f5a3c', { line: '#3a2a14' }); R(c, b.x + b.w / 2, b.frontY + 1, 1, 13, '#3a2a14'); R(c, b.x + b.w / 2 - 2, b.frontY + 6, 1, 2, '#d8c27a'); R(c, b.x + b.w / 2 + 2, b.frontY + 6, 1, 2, '#d8c27a'); return; }
    case 'opc': {
      // a beige CRT and keyboard on a side table
      const b = block(c, x + 2, y + 5, W - 4, D - 8, 6, '#9a8a70'); block(c, b.x + 2, b.y + 1, 9, 5, 8, '#d9d3c0', { line: '#7a7462' });
      R(c, b.x + 3, b.frontY - 7, 7, 5, run && ph % 4 ? '#3aa0e0' : '#2a6aa0'); R(c, b.x + 4, b.frontY - 6, 3, 1, '#bfe9ff'); R(c, b.x + 2, b.frontY + 1, 9, 2, '#e8e4d4'); return;
    }
    case 'ofax': { const b = block(c, x + 2, y + 4, W - 4, D - 7, 9, '#d9d3c0', { line: '#7a7462' }); R(c, b.x + 2, b.y + 2, b.w - 4, 3, '#4a4f55'); R(c, b.x + 2, b.frontY + 3, 6, 2, '#f4f1e8'); if (run && ph % 3 === 0) R(c, b.x + b.w - 4, b.frontY + 2, 2, 1, '#5cff8a'); return; }
    case 'oshelf': { const b = block(c, x + 2, y + 3, W - 4, D - 6, 18, '#7a5530', { line: '#3a2a14' }); const cols = ['#c0392b', '#2f7dba', '#2d8a57', '#c99510', '#8e5bb5']; for (let k = 0; k < 3; k++) { R(c, b.x + 1, b.frontY + 5 + k * 5, b.w - 2, 1, '#3a2a14'); for (let i = 0; i < b.w - 3; i += 2) R(c, b.x + 2 + i, b.frontY + 1 + k * 5, 1, 4, cols[(i + k) % 5]); } return; }
    case 'oplant': { block(c, x + 5, y + 7, 6, 5, 4, '#a0522d'); for (const [dx, dy] of [[0, -10], [-3, -7], [3, -8], [-1, -5], [2, -4], [-4, -3], [4, -2]]) R(c, x + 7 + dx, y + 8 + dy, 3, 3, (dx + dy) % 2 ? '#3f8f3a' : '#2f6f2a'); return; }
    case 'orad': { const b = block(c, x + 2, y + 6, W - 4, 3, 9, '#e8e8e2', { line: '#9a9a94' }); for (let i = 1; i < b.w - 1; i += 2) R(c, b.x + i, b.frontY + 1, 1, 7, '#c8c8c2'); if (run) R(c, b.x + 2, b.y - 3 - (ph % 2), 1, 2, 'rgba(255,140,80,0.6)'); return; }
    case 'ocool': { const b = block(c, x + 4, y + 5, W - 8, D - 8, 10, '#e8e8e2', { line: '#9a9a94' }); R(c, b.x, b.y - 7, b.w, 7, 'rgba(120,190,240,0.85)'); R(c, b.x + 1, b.y - 7, 2, 7, 'rgba(200,235,255,0.9)'); R(c, b.x + b.w / 2 - 1, b.frontY + 3, 2, 2, '#2f7dba'); return; }
    case 'ocoffee': { const b = block(c, x + 3, y + 4, W - 6, D - 7, 11, '#3a3a3a'); R(c, b.x + 2, b.frontY + 4, b.w - 4, 4, '#1d1d1d'); R(c, b.x + 4, b.frontY + 6, 2, 2, '#e8e8e2'); R(c, b.x + 2, b.frontY + 1, 2, 1, run && ph % 2 ? '#ff4a3d' : '#7a1d16'); if (run) R(c, b.x + 4, b.y - 3 - (ph % 3), 1, 2, 'rgba(255,255,255,0.6)'); return; }
    case 'orug': { R(c, x + 2, y + 2, W - 4, D - 4, '#8a3a3a'); frame(c, x + 3, y + 3, W - 6, D - 6, '#d8b24a'); for (let j = 6; j < D - 6; j += 4) for (let i = 6; i < W - 6; i += 4) R(c, x + i, y + j, 2, 2, '#b05a4a'); return; }
    case 'opart': { const b = block(c, x + 1, y + 6, W - 2, 3, 14, '#9aa6b8', { line: '#5d6b8f' }); for (let j = 2; j < 13; j += 3) R(c, b.x + 1, b.frontY + j, b.w - 2, 1, '#8a96a8'); return; }
    case 'oserver': { const b = block(c, x + 3, y + 3, W - 6, D - 6, 18, '#2e3338'); for (let k = 0; k < 5; k++) { R(c, b.x + 1, b.frontY + 1 + k * 3, b.w - 2, 2, '#3d4349'); R(c, b.x + 2, b.frontY + 1 + k * 3, 1, 1, run && (k + ph) % 3 === 0 ? '#5cff8a' : '#2fa858'); } return; }
    case 'olamp': { R(c, x + 7, y + 6, 2, 6, '#3a3a3a'); R(c, x + 5, y + 11, 6, 2, '#2a2a2a'); R(c, x + 7, y, 6, 3, '#c99510'); R(c, x + 6, y + 2, 2, 5, '#3a3a3a'); R(c, x + 8, y + 3, 4, 3, 'rgba(255,240,160,0.35)'); return; }
  }
}
// all of a cell drawn in one go (catalog, editor ghost); drawScene interleaves the parts with other objects instead
function cellAll(c, v, o, t, anim) {
  const run = anim && /Running/.test(o.status || '');
  cellFloor(c, v, o);
  for (const it of [...(o.items || [])].sort((a, b) => (itemDef(a.t).floor ? -1 : 0) - (itemDef(b.t).floor ? -1 : 0) || (a.y + itemSize(a).h) - (b.y + itemSize(b).h))) cellItem(c, v, o, it, t, run);
  cellFront(c, v, o);
}
export function drawObject(c, v, st, o, C, t, anim, ghost = false) {
  if (o.kind === 'cell' || o.kind === 'suite') return cellAll(c, v, o, t, anim);
  switch (o.kind) {
    case 'machine': return machine(c, v, o, t, ghost, anim);
    case 'office': return office(c, v, o, st);
    case 'conveyor': return conveyor(c, v, o, t, anim, v.fl);
    case 'bin': return bin(c, v, o);
    case 'forklift': return forklift(c, v, o);
    case 'handcart': return handcart(c, v, o);
    case 'breakroom': case 'restroom': return room(c, v, o);
    case 'dock': return dock(c, v, o);
    case 'exit': return exitSign(c, v, o);
  }
}

// scaffolding, hazard tape, sparks and a tower crane over the item being built
function scaffold(c, v, o, t, anim) {
  const { w, h: hh } = objSize(o), [x, y] = tileXY(v, o.x, o.y), W = w * T, D = hh * T, top = o.kind === 'conveyor' ? 4 : 18;
  for (const [px, py] of [[x, y], [x + W - 1, y], [x, y + D - 1], [x + W - 1, y + D - 1]]) R(c, px, py - top, 1, top + 1, '#8a929a');
  for (const z of [top, Math.round(top / 2)]) { R(c, x, y - z, W, 1, '#b08a5a'); R(c, x, y + D - 1 - z, W, 1, '#b08a5a'); }
  for (let i = 0; i < W; i++) R(c, x + i, y + D, 1, 1, ((i >> 1) & 1) ? '#f2b71f' : '#1d1d1d');
  const ph = anim ? Math.floor(t / 120) : 0;
  if (anim && ph % 3 === 0) for (const [sx, sy] of [[2, -3], [-2, -1], [1, 1], [3, 0]]) R(c, x + W / 2 + sx + (ph % 5) - 2, y + D / 2 - 6 + sy, 1, 1, ph % 2 ? '#fff6b0' : '#9be7ff');
  // tower crane to the right, jib over the work, hook bobbing
  const mx = Math.min(v.W - 6, x + W + 10), base = y + D, mt = Math.max(4, y - 46);
  R(c, mx, mt, 3, base - mt, '#f2b71f'); for (let j = mt + 2; j < base; j += 4) R(c, mx, j, 3, 1, '#c99510');
  R(c, x + W / 2 - 4, mt, mx - x - W / 2 + 14, 2, '#f2b71f'); R(c, mx + 3, mt + 2, 8, 4, '#59616b');
  const hook = mt + 8 + (anim ? Math.round(4 + Math.sin(t / 400) * 4) : 6);
  R(c, x + W / 2, mt + 2, 1, hook - mt - 2, '#2e3338'); R(c, x + W / 2 - 2, hook, 5, 2, '#2e3338');
}
// the cell blueprint being edited: room outline, hatches, furniture and the item in hand
function drawEditor(c, v, E, t, C) {
  const dots = (x, y, w, hh, col) => { for (let j = 0; j < hh; j++) for (let i = (j % 2); i < w; i += 2) R(c, x + i, y + j, 1, 1, col); };
  if (E.rect) {
    const [x, y] = tileXY(v, E.rect.x, E.rect.y), W = E.rect.cw * T, D = E.rect.ch * T, col = E.ok ? '#3fbf6a' : '#e0453a';
    c.globalAlpha = 0.35; dots(x, y, W, D, col); c.globalAlpha = 1;
    frame(c, x, y, W, D, col); frame(c, x + 1, y + 1, W - 2, D - 2, col);
    return;
  }
  const d = E.draft, [x0, y0] = tileXY(v, d.x, d.y);
  cellAll(c, v, d, t, false);
  // a dashed outline round the room so it reads as a blueprint
  const ph = Math.floor(t / 150) % 4;
  for (let i = 0; i < d.cw * T; i++) { const col = ((i + ph) >> 2) % 2 ? '#1b5fd6' : '#ffffff'; R(c, x0 + i, y0 - 1, 1, 1, col); R(c, x0 + i, y0 + d.ch * T, 1, 1, col); }
  for (let j = 0; j < d.ch * T; j++) { const col = ((j + ph) >> 2) % 2 ? '#1b5fd6' : '#ffffff'; R(c, x0 - 1, y0 + j, 1, 1, col); R(c, x0 + d.cw * T, y0 + j, 1, 1, col); }
  if (E.hatchStage) {
    // where hatches can go, and the one being moved
    for (let i = 0; i < d.cw; i++) for (const ly of [-1, d.ch]) { const [px, py] = tileXY(v, d.x + i, d.y + ly); c.globalAlpha = 0.25; dots(px, py, T, T, '#1b5fd6'); c.globalAlpha = 1; }
    for (let j = 0; j < d.ch; j++) for (const lx of [-1, d.cw]) { const [px, py] = tileXY(v, d.x + lx, d.y + j); c.globalAlpha = 0.25; dots(px, py, T, T, '#1b5fd6'); c.globalAlpha = 1; }
    if (E.role && Math.floor(t / 300) % 2) { const [px, py] = tileXY(v, d.x + E.role.lx, d.y + E.role.ly); frame(c, px, py, T, T, '#f2b71f'); frame(c, px + 1, py + 1, T - 2, T - 2, '#1d1d1d'); }
  }
  if (E.tool) {
    const col = E.toolOk ? '#3fbf6a' : '#e0453a';
    for (const [ix, iy] of itemTiles(E.tool)) { const [px, py] = tileXY(v, d.x + ix, d.y + iy); c.globalAlpha = 0.45; dots(px, py, T, T, col); c.globalAlpha = 1; }
    c.globalAlpha = 0.75; cellItem(c, v, d, E.tool, t, false); c.globalAlpha = 1;
    if (isStation(E.tool)) { const [wx, wy] = workSquare(E.tool), [px, py] = tileXY(v, d.x + wx, d.y + wy); frame(c, px + 1, py + 1, T - 2, T - 2, '#f2b71f'); R(c, px + 4, py + 5, 3, 6, '#a06e00'); R(c, px + 9, py + 5, 3, 6, '#a06e00'); }
  }
  void C;
}
export function drawScene(c, v, st, opts) {
  const { C, t, anim } = opts, fl = v.fl;
  c.fillStyle = C.panel; c.fillRect(0, 0, v.W, v.H);
  c.drawImage(floorLayer(v, C), 0, 0);
  if (opts.sel && (opts.sel.kind === 'cell' || opts.sel.kind === 'suite')) { const [px, py] = tileXY(v, opts.sel.x, opts.sel.y); frame(c, px - 3, py - 13, opts.sel.cw * T + 6, opts.sel.ch * T + 16, C.focus); frame(c, px - 4, py - 14, opts.sel.cw * T + 8, opts.sel.ch * T + 18, C.focus); }
  else if (opts.sel) for (const [x, y] of footprint(opts.sel)) { const [px, py] = tileXY(v, x, y); for (let j = 0; j < T; j++) for (let i = (j % 2); i < T; i += 2) R(c, px + i, py + j, 1, 1, C.focus); }
  // painter's order: by the front edge of each footprint
  const items = [];
  const hideId = opts.editor?.hideId;
  // construction of a new site: built, being built (scaffolding) or still a blueprint
  const B = opts.build; let bIdx = null, bK = 0, bNow = null;
  if (B) { bIdx = new Map(B.order.map((id, i) => [id, i])); bK = Math.max(0, (B.p - 0.08) / 0.86) * B.order.length; }
  const bState = o => { if (!B || o.fixed || !bIdx.has(o.id)) return 'done'; const i = bIdx.get(o.id); return i < Math.floor(bK) ? 'done' : i === Math.floor(bK) ? 'now' : 'plan'; };
  const blueprint = o => items.push({ d: -95 + o.y, f: () => { for (const [x, y] of footprint(o)) { const [px, py] = tileXY(v, x, y); c.globalAlpha = 0.22; R(c, px, py, T, T, '#1b5fd6'); c.globalAlpha = 1; for (let i = 0; i < T; i += 4) { R(c, px + i, py, 2, 1, '#1b5fd6'); R(c, px, py + i, 1, 2, '#1b5fd6'); } } } });
  for (const o of fl.objects.filter(o => (o.kind === 'cell' || o.kind === 'suite') && o.id !== hideId)) {
    const bs = bState(o); if (bs === 'plan') { blueprint(o); continue; } if (bs === 'now') bNow = o;
    // a cell's floor and back walls go down first, each item sorts with everything else, the front partition last
    const run = anim && /Running/.test(o.status || '');
    items.push({ d: -90 + o.y, f: () => cellFloor(c, v, o) });
    for (const it of o.items || []) items.push({ d: itemDef(it.t)?.floor ? -89 + o.y : o.y + it.y + itemSize(it).h - 0.2, f: () => cellItem(c, v, o, it, t, run) });
    items.push({ d: o.y + o.ch - 0.05, f: () => cellFront(c, v, o) });
  }
  for (const o of fl.objects) { if (o.kind === 'cell' || o.kind === 'suite' || o.id === hideId) continue;
    const bs = bState(o); if (bs === 'plan') { blueprint(o); continue; }
    if (bs === 'now') { bNow = o; const { h: hh } = objSize(o); const f = bK - Math.floor(bK); items.push({ d: o.y + hh, f: () => { c.globalAlpha = 0.3 + 0.6 * f; drawObject(c, v, st, { ...o, status: '' }, C, t, false); c.globalAlpha = 1; } }); continue; } const { w, h } = rotSize(o.kind, o.rot || 0); const flat = o.kind === 'dock' || o.kind === 'conveyor'; items.push({ d: flat ? -100 + o.y : o.y + h - (o.kind === 'office' || o.kind === 'breakroom' || o.kind === 'restroom' ? h - 0.4 : 0), f: () => drawObject(c, v, st, o, C, t, anim) }); }
  let pal = opts.pallets || 0;
  for (let y = 0; y < fl.h && pal > 0; y++) for (let x = 0; x < fl.w && pal > 0; x++) {
    if (fl.zones[y * fl.w + x] !== ZONE.STORAGE) continue;
    for (let k = 0; k < 2 && pal > 0; k++, pal--) { const [px, py] = tileXY(v, x, y); const stack = 1 + ((x * 7 + y * 3 + k) % 3); items.push({ d: y + 0.7, f: () => pallet(c, px + 1 + k * 7, py + 5, stack) }); }
  }
  for (const b of opts.beltBoxes || []) items.push({ d: -50 + b.y, f: () => beltBox(c, v, b.x, b.y, b.color) });
  // stacks of finished boxes: at a machine's output square, or queued at the end of a belt
  for (const p of opts.piles || []) items.push({ d: p.d ?? p.y + 0.55, f: () => { for (let k = 0; k < p.n; k++) { const [x, y] = tileXY(v, p.x, p.y); const bx = Math.round(x + 3 + (k % 2) * 5), by = Math.round(y + 7 - Math.floor(k / 2) * 4 - (k === 2 ? 0 : 0)); R(c, bx, by + 5, 7, 1, 'rgba(0,0,0,0.3)'); const b = block(c, bx, by, 7, 5, 4, '#c89a62', { top: '#dcb27a', front: '#a77d4a', line: '#5a4026' }); if (p.color) R(c, b.x + 1, b.y + 1, b.w - 2, 2, p.color); } } });
  for (const w of opts.workers || []) items.push({ d: w.e.py + 0.75, f: () => { worker(c, v, w.e, t, w.moving); if (w.bubble) bubble(c, v, w.e, w.bubble); } });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.f();
  // overlays above machines: stock bars and status badges
  for (const o of fl.objects) {
    if ((o.kind !== 'machine' && o.kind !== 'cell') || B) continue;
    const { w } = objSize(o); const [x, y] = tileXY(v, o.x, o.y);
    const cx = x + (w * T) / 2, top = y - 14;
    const g = opts.gauges ? opts.gauges(o) : [];
    if (g.length) {
      const bw = 22, x0 = Math.round(cx - bw / 2), y0 = top - 3 - g.length * 3;
      R(c, x0 - 1, y0 - 1, bw + 2, g.length * 3 + 1, '#1d1d1d');
      g.forEach((gg, i) => { R(c, x0, y0 + i * 3, bw, 2, '#3a3f44'); R(c, x0, y0 + i * 3, Math.max(gg.status === 'bad' ? 0 : 1, Math.round(bw * gg.frac)), 2, gg.status === 'bad' ? '#ff4a3d' : gg.status === 'warn' ? '#f2b71f' : '#5cd68a'); });
    }
    const s = o.status || ''; let bc = null, gl = null;
    if (o.broken) { bc = '#d9342b'; gl = 'x'; } else if (statusMark(s)) { bc = '#f2b71f'; gl = statusMark(s); }
    if (bc) badge(c, cx + 17, top - 6, bc, gl);
  }
  // selection marker
  if (opts.sel) {
    const o = opts.sel, { w } = objSize(o); const [x, y] = tileXY(v, o.x, o.y);
    const ax = Math.round(x + (w * T) / 2), ay = y - ({ machine: 32, office: 16, bin: 18, forklift: 24, handcart: 12, cell: 18 }[o.kind] || 14) + (anim ? Math.floor(t / 250) % 2 : 0);
    R(c, ax - 4, ay - 7, 9, 5, '#1d1d1d'); R(c, ax - 3, ay - 2, 7, 1, '#1d1d1d'); R(c, ax - 2, ay - 1, 5, 1, '#1d1d1d'); R(c, ax - 1, ay, 3, 1, '#1d1d1d');
    R(c, ax - 3, ay - 6, 7, 4, C.focus); R(c, ax - 2, ay - 2, 5, 1, C.focus); R(c, ax - 1, ay - 1, 3, 1, C.focus);
  }
  if (opts.editor) drawEditor(c, v, opts.editor, t, C);
  if (B && bNow) scaffold(c, v, bNow, t, anim);
  // ghost
  if (opts.ghost) {
    const g = opts.ghost.spec, col = opts.ghost.ok ? '#3fbf6a' : '#e0453a';
    for (const [x, y] of footprint(g)) { const [px, py] = tileXY(v, x, y); for (let j = 0; j < T; j++) for (let i = (j % 2); i < T; i += 2) R(c, px + i, py + j, 1, 1, col); }
    c.globalAlpha = 0.6; drawObject(c, v, st, { ...g, id: -1, status: '' }, C, t, false, true); c.globalAlpha = 1;
    for (const [, [x, y]] of Object.entries(ports(g))) { const [px, py] = tileXY(v, x, y); for (let i = 0; i < T; i += 4) { R(c, px + i, py, 2, 1, col); R(c, px + i, py + T - 1, 2, 1, col); R(c, px, py + i, 1, 2, col); R(c, px + T - 1, py + i, 1, 2, col); } }
  }
  // keyboard cursor: marching dashes
  if (opts.cursor) {
    const [cx, cy] = opts.cursor, [px, py] = tileXY(v, cx, cy), ph = anim ? Math.floor(t / 120) % 4 : 0;
    for (let i = 0; i < T; i++) { const col = ((i + ph) >> 1) % 2 ? '#f2b71f' : '#1d1d1d'; R(c, px + i, py, 1, 2, col); R(c, px + i, py + T - 2, 1, 2, col); R(c, px, py + i, 2, 1, col); R(c, px + T - 2, py + i, 2, 1, col); }
  }
}

// small demo factory for the title screen
export function demoScene(canvas, C, newFloor, ZONE_) {
  const fl = newFloor(16000); let id = 100;
  const add = o => fl.objects.push({ id: id++, rot: 0, ...o });
  // a machining line feeding a lighting line by belt
  add({ kind: 'machine', family: FAMILY_ID.machining, x: 2, y: 4, status: 'Running', mode: 'produce' });
  add({ kind: 'machine', family: FAMILY_ID.lighting, x: 10, y: 4, status: 'Running', mode: 'produce' });
  for (const [x, y] of [[7, 5], [8, 5], [8, 4], [9, 4]]) add({ kind: 'conveyor', x, y });
  add({ kind: 'office', officeType: 3, x: 9, y: 9 });
  fl.zones[4 * fl.w + 1] = ZONE_.SAFETY; fl.zones[6 * fl.w + 1] = ZONE_.SAFETY;
  for (const [x, y] of [[13, 9], [13, 10]]) fl.zones[y * fl.w + x] = ZONE_.FORKLIFT;
  add({ kind: 'forklift', x: 13, y: 9 });
  const v = makeView(fl, 2);
  canvas.width = v.W * 2; canvas.height = v.H * 2;
  const lo = document.createElement('canvas'); lo.width = v.W; lo.height = v.H;
  const workers = [{ e: { id: 1, job: 'operations_1', px: 4, py: 7 }, moving: false }, { e: { id: 6, job: 'operations_1', px: 12, py: 7 }, moving: false }, { e: { id: 3, job: 'sales_1', px: 10, py: 10.4 }, moving: false }, { e: { id: 9, job: 'operations_3', px: 8, py: 7.2 }, moving: false, bubble: 'coffee' }];
  drawScene(lo.getContext('2d'), v, { floor: fl }, { C, t: 0, anim: false, pallets: 16, workers });
  const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(lo, 0, 0, canvas.width, canvas.height);
}
