// Isometric pixel-art renderer. Everything is drawn into a low-resolution buffer with
// integer scanline fills and Bresenham lines, then scaled up without smoothing.
import { ITEMS, RECIPES, FAMILIES, FAMILY_ID } from '../gen/data.js';
import { JOBS, deptColor } from '../core/content.js';
import { ZONE, footprint, ports, rotSize, links, officeKit } from '../sim/floor.js';

export const HW = 10, HH = 5, WALL = 28, MARGIN = 14;

// ---------- palette helpers
const hex = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const shade = (c, f) => toHex(hex(c).map(v => f >= 0 ? v + (255 - v) * f : v * (1 + f)));
const tones = c => ({ top: shade(c, 0.22), left: c, right: shade(c, -0.25), line: shade(c, -0.55) });
// a production line's colour (nameplates, cell floors) from the world data
export const lineHue = fam => FAMILIES[fam]?.hue || '#3f8f5a';

// ---------- view geometry
export function makeView(fl, S) {
  const W = (fl.w + fl.h) * HW + MARGIN * 2, H = (fl.w + fl.h) * HH + WALL + MARGIN * 2 + 10;
  return { fl, S, W, H, ox: fl.h * HW + MARGIN, oy: WALL + MARGIN };
}
export const iso = (v, x, y, z = 0) => [v.ox + (x - y) * HW, v.oy + (x + y) * HH - z];
export function screenToTile(v, px, py) {
  const u = (px - v.ox) / HW, w = (py - v.oy) / HH;
  return [Math.floor((u + w) / 2), Math.floor((w - u) / 2)];
}

// ---------- primitives (integer pixels only)
function fillPoly(c, pts, color) {
  c.fillStyle = color;
  let minY = Infinity, maxY = -Infinity; for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.ceil(minY); y < Math.ceil(maxY); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + (yc - y0) / (y1 - y0) * (x1 - x0));
    }
    if (xs.length < 2) continue;
    const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs));
    if (b > a) c.fillRect(a, y, b - a, 1);
  }
}
function fillPolyPat(c, pts, fn) {
  let minY = Infinity, maxY = -Infinity; for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.ceil(minY); y < Math.ceil(maxY); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + (yc - y0) / (y1 - y0) * (x1 - x0)); }
    if (xs.length < 2) continue;
    const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs));
    for (let x = a; x < b; x++) { const col = fn(x, y); if (col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); } }
  }
}
export function line(c, x0, y0, x1, y1, color, dash) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, i = 0;
  for (;;) {
    c.fillStyle = dash ? dash(i) : color; c.fillRect(x0, y0, 1, 1); i++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
const quad = (v, x, y, w, d, z) => [iso(v, x, y, z), iso(v, x + w, y, z), iso(v, x + w, y + d, z), iso(v, x, y + d, z)];
// a box with three shaded faces and a dark silhouette
export function box(c, v, x, y, w, d, z, hgt, color, opts = {}) {
  const t = opts.tones || tones(color);
  const A0 = iso(v, x, y + d, z), B0 = iso(v, x + w, y + d, z), C0 = iso(v, x + w, y, z);
  const A1 = iso(v, x, y + d, z + hgt), B1 = iso(v, x + w, y + d, z + hgt), C1 = iso(v, x + w, y, z + hgt), D1 = iso(v, x, y, z + hgt);
  if (hgt > 0) { fillPoly(c, [A0, B0, B1, A1], t.left); fillPoly(c, [B0, C0, C1, B1], t.right); }
  fillPoly(c, [D1, C1, B1, A1], t.top);
  if (opts.outline !== false) {
    const L = t.line;
    line(c, ...A1, ...D1, L); line(c, ...D1, ...C1, L); line(c, ...C1, ...C0, L); line(c, ...C0, ...B0, L); line(c, ...B0, ...A0, L); line(c, ...A0, ...A1, L);
    line(c, ...B0, ...B1, shade(t.right, -0.2)); line(c, ...A1, ...B1, shade(t.top, 0.15)); line(c, ...B1, ...C1, shade(t.top, 0.15));
  }
  return { A0, B0, C0, A1, B1, C1, D1 };
}
const tile = (v, x, y) => quad(v, x, y, 1, 1, 0);

// ---------- 3x5 pixel font
const GLYPHS = { B: '110101110101110', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', A: '010101111101101', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', W: '101101111111101', X: '101101010101101', '$': '011110010011110' };
export function pixText(c, text, x, y, color) {
  let cx = Math.round(x);
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') { c.fillStyle = color; c.fillRect(cx + (i % 3), Math.round(y) + Math.floor(i / 3), 1, 1); }
    cx += 4;
  }
}

// ---------- floor layer (cached; redrawn when the layout or theme changes)
const floorCache = new WeakMap();
function floorLayer(v, C) {
  const fl = v.fl, key = `${fl.rev}|${C.floor}|${v.W}|${C.panel}`;
  const hit = floorCache.get(fl);
  if (hit && hit.key === key) return hit.canvas;
  const cv = document.createElement('canvas'); cv.width = v.W; cv.height = v.H;
  const c = cv.getContext('2d');
  const f1 = C.floor, f2 = shade(C.floor, -0.05), gl = shade(C.floor, -0.12);
  // back walls: corrugated metal with clerestory windows
  const wallC = C.dark ? '#5b6670' : '#9aa6ae';
  fillPoly(c, [iso(v, 0, 0, 0), iso(v, fl.w, 0, 0), iso(v, fl.w, 0, WALL), iso(v, 0, 0, WALL)], shade(wallC, -0.08));
  fillPoly(c, [iso(v, 0, fl.h, 0), iso(v, 0, 0, 0), iso(v, 0, 0, WALL), iso(v, 0, fl.h, WALL)], shade(wallC, 0.08));
  for (let x = 0; x < fl.w; x += 0.5) { const [a, b] = iso(v, x, 0, 0), [, b2] = iso(v, x, 0, WALL); line(c, a, b - 1, a, b2 + 1, shade(wallC, -0.2)); }
  for (let y = 0; y < fl.h; y += 0.5) { const [a, b] = iso(v, 0, y, 0), [, b2] = iso(v, 0, y, WALL); line(c, a, b - 1, a, b2 + 1, shade(wallC, -0.06)); }
  for (let x = 1; x < fl.w - 1; x += 3) fillPoly(c, [iso(v, x, 0, WALL - 12), iso(v, x + 2, 0, WALL - 12), iso(v, x + 2, 0, WALL - 5), iso(v, x, 0, WALL - 5)], '#9fd0ea');
  for (let y = 1; y < fl.h - 1; y += 3) fillPoly(c, [iso(v, 0, y + 2, WALL - 12), iso(v, 0, y, WALL - 12), iso(v, 0, y, WALL - 5), iso(v, 0, y + 2, WALL - 5)], '#b5def2');
  line(c, ...iso(v, 0, 0, WALL), ...iso(v, fl.w, 0, WALL), shade(wallC, -0.45)); line(c, ...iso(v, 0, 0, WALL), ...iso(v, 0, fl.h, WALL), shade(wallC, -0.45));
  line(c, ...iso(v, 0, 0, 0), ...iso(v, 0, 0, WALL), shade(wallC, -0.45));
  // concrete
  for (let y = 0; y < fl.h; y++) for (let x = 0; x < fl.w; x++) fillPoly(c, tile(v, x, y), (x + y) % 2 ? f1 : f2);
  for (let y = 0; y <= fl.h; y++) line(c, ...iso(v, 0, y), ...iso(v, fl.w, y), gl, i => (i % 2 ? gl : null) || gl);
  for (let x = 0; x <= fl.w; x++) line(c, ...iso(v, x, 0), ...iso(v, x, fl.h), gl);
  // slab edge (front)
  const edge = shade(C.floor, -0.35);
  fillPoly(c, [iso(v, 0, fl.h, 0), iso(v, fl.w, fl.h, 0), iso(v, fl.w, fl.h, -4), iso(v, 0, fl.h, -4)], edge);
  fillPoly(c, [iso(v, fl.w, fl.h, 0), iso(v, fl.w, 0, 0), iso(v, fl.w, 0, -4), iso(v, fl.w, fl.h, -4)], shade(edge, -0.2));
  // zones
  for (let y = 0; y < fl.h; y++) for (let x = 0; x < fl.w; x++) {
    const z = fl.zones[y * fl.w + x]; if (!z) continue;
    const T = tile(v, x, y);
    if (z === ZONE.SAFETY) fillPolyPat(c, T, (px, py) => (((px + py * 2) >> 2) & 1) ? '#f2b71f' : '#1d1d1d');
    else if (z === ZONE.STORAGE) { fillPoly(c, T, shade(C.floor, -0.1)); const [a, b, cc, d] = T; const dash = i => (i >> 1) % 2 ? '#a07a4a' : null; line(c, ...a, ...b, null, dash); line(c, ...b, ...cc, null, dash); line(c, ...cc, ...d, null, dash); line(c, ...d, ...a, null, dash); }
    else if (z === ZONE.SMOKING) { fillPolyPat(c, T, (px, py) => (px + py) % 2 ? '#8b8f8c' : '#a3a7a4'); const [cx, cy] = iso(v, x + 0.5, y + 0.5); c.fillStyle = '#444'; c.fillRect(cx - 1, cy - 1, 3, 2); c.fillStyle = '#e06030'; c.fillRect(cx, cy - 2, 1, 1); }
    else if (z === ZONE.CARPET) fillPolyPat(c, T, (px, py) => (px + py) % 2 ? '#4a5f8f' : '#566c9e');
    else if (z === ZONE.FORKLIFT) { const [a, b, cc, d] = T; line(c, ...a, ...b, '#f2b71f'); line(c, ...b, ...cc, '#f2b71f'); line(c, ...cc, ...d, '#f2b71f'); line(c, ...d, ...a, '#f2b71f'); const [cx, cy] = iso(v, x + 0.5, y + 0.5); pixText(c, 'P', cx - 1, cy - 2, '#f2b71f'); }
  }
  floorCache.set(fl, { key, canvas: cv });
  return cv;
}

// ---------- sprites
function portMarks(c, v, o) {
  const p = ports(o); const [mx, my] = [o.x + rotSize(o.kind, o.rot || 0).w / 2, o.y + rotSize(o.kind, o.rot || 0).h / 2];
  for (const [name, [px, py]] of Object.entries(p)) {
    const [cx, cy] = iso(v, px + 0.5, py + 0.5);
    if (name === 'input' || name === 'output') {
      const dx = (mx - (px + 0.5)) * (name === 'input' ? 1 : -1), dy = (my - (py + 0.5)) * (name === 'input' ? 1 : -1), n = Math.hypot(dx, dy) || 1;
      const [tx, ty] = iso(v, px + 0.5 + dx / n * 0.35, py + 0.5 + dy / n * 0.35), [bx, by] = iso(v, px + 0.5 - dx / n * 0.3, py + 0.5 - dy / n * 0.3);
      const [lx, ly] = iso(v, px + 0.5 - dx / n * 0.3 - dy / n * 0.25, py + 0.5 - dy / n * 0.3 + dx / n * 0.25), [rx, ry] = iso(v, px + 0.5 - dx / n * 0.3 + dy / n * 0.25, py + 0.5 - dy / n * 0.3 - dx / n * 0.25);
      fillPoly(c, [[tx, ty], [lx, ly], [rx, ry]], name === 'input' ? '#2b6cb0' : '#2f8a4f'); void bx; void by;
    } else if (name === 'control') { fillPoly(c, quad(v, px + 0.25, py + 0.25, 0.5, 0.5, 0), '#5d636a'); }
    else if (name === 'maint') { const [a, b] = [cx, cy]; c.fillStyle = '#c47b16'; c.fillRect(a - 1, b, 3, 1); c.fillRect(a, b - 1, 1, 3); }
  }
}
function drawMachine(c, v, st, o, C, t, ghost) {
  const { w, h } = rotSize('machine', o.rot || 0);
  if (!ghost) portMarks(c, v, o);
  const hue = o.mode === 'research' ? '#3a6fb0' : lineHue(o.family);
  const x = o.x + 0.12, y = o.y + 0.12, W = w - 0.24, D = h - 0.24;
  // plinth, body, top panel
  box(c, v, x - 0.04, y - 0.04, W + 0.08, D + 0.08, 0, 2, '#3a3f44');
  const b = box(c, v, x, y, W, D, 2, 16, hue);
  box(c, v, x + 0.35, y + 0.35, W - 0.7, D - 0.7, 18, 2, shade(hue, -0.3));
  // hopper over the input side, chute at the output side
  const p = ports(o), towards = ([px, py]) => [Math.min(Math.max(px, o.x), o.x + w - 1), Math.min(Math.max(py, o.y), o.y + h - 1)];
  const [hx, hy] = towards(p.in0 || p.output); box(c, v, hx + 0.2, hy + 0.2, 0.6, 0.6, 18, 6, '#8a929a');
  const [ex, ey] = towards(p.output); box(c, v, ex + 0.3, ey + 0.3, 0.4, 0.4, 18, 3, '#565c63');
  // family code on the front face, warning stripe under it
  const [fx, fy] = iso(v, x + W * 0.3, y + D, 12);
  if (!ghost) pixText(c, FAMILIES[o.family]?.code || '', fx, fy - 2, shade(hue, 0.75));
  const s1 = iso(v, x, y + D, 4), s2 = iso(v, x + W, y + D, 4);
  line(c, ...s1, ...s2, null, i => ((i >> 1) & 1) ? '#f2b71f' : '#1d1d1d');
  // status lamp
  const [lx, ly] = iso(v, x + W - 0.3, y + D - 0.3, 22);
  if (!ghost) {
    const run = /Running|Research \d/.test(o.status || '');
    const lamp = o.broken ? (Math.floor(t / 300) % 2 ? '#ff4a3d' : '#7a1d16') : run ? (Math.floor(t / 500) % 2 ? '#5cff8a' : '#2fa858') : '#f2b71f';
    c.fillStyle = '#222'; c.fillRect(lx - 1, ly - 3, 3, 4); c.fillStyle = lamp; c.fillRect(lx, ly - 3, 1, 2);
  }
  return b;
}
function drawOffice(c, v, o, C) {
  const { w, h } = rotSize('office', o.rot || 0);
  fillPolyPat(c, quad(v, o.x + 0.05, o.y + 0.05, w - 0.1, h - 0.1, 0), (px, py) => (px + py) % 2 ? '#c9b48e' : '#bda780');
  box(c, v, o.x, o.y, w, 0.12, 0, 11, '#e4dccb');
  box(c, v, o.x, o.y + 0.12, 0.12, h - 0.12, 0, 11, '#ece5d6');
  box(c, v, o.x + 0.6, o.y + 0.7, 1.5, 0.7, 0, 5, '#8a5d34');
  box(c, v, o.x + 1.1, o.y + 1.6, 0.5, 0.5, 0, 3, '#3a3f55');
  const kit = officeKit(o);
  if (kit.has('pc')) { box(c, v, o.x + 1.2, o.y + 0.8, 0.4, 0.3, 5, 4, '#cfd3d6'); const [sx, sy] = iso(v, o.x + 1.2, o.y + 1.1, 7); c.fillStyle = '#4aa3df'; c.fillRect(sx + 1, sy - 2, 3, 2); }
  if (kit.has('files')) box(c, v, o.x + 0.2, o.y + 0.25, 0.45, 0.45, 0, 8, '#8c939a');
  if (kit.has('cabinet')) box(c, v, o.x + w - 0.7, o.y + 0.25, 0.5, 0.4, 0, 10, '#6f5a3c');
}
function drawRoom(c, v, o, kind) {
  const { w, h } = rotSize(kind, 0);
  if (kind === 'breakroom') {
    fillPolyPat(c, quad(v, o.x, o.y, w, h, 0), (px, py) => ((px >> 2) + py) % 2 ? '#b98a56' : '#c79a64');
    box(c, v, o.x + 1.2, o.y + 1, 1.6, 0.9, 0, 5, '#d8d2c4');
    for (const [dx, dy] of [[1.3, 0.6], [2.3, 0.6], [1.3, 2], [2.3, 2]]) box(c, v, o.x + dx, o.y + dy, 0.35, 0.35, 0, 3, '#7a3b2a');
    box(c, v, o.x + w - 0.7, o.y + 0.2, 0.5, 0.5, 0, 14, '#c0392b');
    const [vx, vy] = iso(v, o.x + w - 0.6, o.y + 0.7, 10); c.fillStyle = '#9fd0ea'; c.fillRect(vx, vy - 3, 2, 3);
    box(c, v, o.x + 0.2, o.y + 0.2, 0.6, 0.5, 0, 8, '#cfd3d6');
  } else {
    fillPolyPat(c, quad(v, o.x, o.y, w, h, 0), (px, py) => ((px >> 1) + (py >> 1)) % 2 ? '#e6eef3' : '#c7d9e6');
    for (let i = 0; i < 2; i++) box(c, v, o.x + 0.3 + i * 1.3, o.y + 0.15, 0.9, 0.9, 0, 10, '#7fa6c4');
  }
  box(c, v, o.x, o.y, w, 0.1, 0, 12, '#e4dccb');
  box(c, v, o.x, o.y + 0.1, 0.1, h - 0.1, 0, 12, '#ece5d6');
}
function drawConveyor(c, v, o, t, anim) {
  box(c, v, o.x, o.y, 1, 1, 0, 2, '#3c4146', { outline: false });
  fillPoly(c, quad(v, o.x + 0.08, o.y + 0.08, 0.84, 0.84, 3), '#4f565c');
  const off = anim ? Math.floor(t / 140) % 4 : 0;
  for (let k = 0; k < 4; k++) { const f = ((k + off) % 4) / 4 + 0.12; line(c, ...iso(v, o.x + 0.1, o.y + f, 3), ...iso(v, o.x + 0.9, o.y + f, 3), '#9aa2a8'); }
  line(c, ...iso(v, o.x, o.y + 1, 3), ...iso(v, o.x + 1, o.y + 1, 3), '#22262a'); line(c, ...iso(v, o.x + 1, o.y + 1, 3), ...iso(v, o.x + 1, o.y, 3), '#22262a');
}
function drawBin(c, v, o) {
  box(c, v, o.x + 0.15, o.y + 0.15, 1.7, 1.7, 0, 10, '#6c7f8f');
  fillPoly(c, quad(v, o.x + 0.35, o.y + 0.35, 1.3, 1.3, 10), '#2c343b');
  const a = iso(v, o.x + 0.15, o.y + 1.85, 0), b = iso(v, o.x + 1.85, o.y + 1.85, 10), a2 = iso(v, o.x + 0.15, o.y + 1.85, 10), b2 = iso(v, o.x + 1.85, o.y + 1.85, 0);
  line(c, ...a, ...b, '#3d4a55'); line(c, ...a2, ...b2, '#3d4a55');
}
function drawForklift(c, v, o) {
  const { w, h } = rotSize('forklift', o.rot || 0);
  box(c, v, o.x + 0.15, o.y + 0.15, w - 0.3, h - 0.3, 1, 6, '#f2b71f');
  box(c, v, o.x + 0.3, o.y + 0.3, 0.4, 0.4, 7, 5, '#2a2a2a', { outline: false });
  box(c, v, o.x + 0.15, o.y + h - 0.3, w - 0.3, 0.12, 0, 16, '#3a3a3a');
  for (const [dx, dy] of [[0.2, 0.3], [w - 0.35, 0.3], [0.2, h - 0.5], [w - 0.35, h - 0.5]]) { const [px, py] = iso(v, o.x + dx, o.y + dy, 0); c.fillStyle = '#111'; c.fillRect(px - 1, py - 1, 3, 2); }
}
function drawHandcart(c, v, o) {
  box(c, v, o.x + 0.2, o.y + 0.25, 0.6, 0.5, 1, 1, '#b03a2e');
  const a = iso(v, o.x + 0.2, o.y + 0.25, 2), b = iso(v, o.x + 0.2, o.y + 0.25, 10); line(c, ...a, ...b, '#7d2a21');
  const [px, py] = iso(v, o.x + 0.5, o.y + 0.75, 0); c.fillStyle = '#111'; c.fillRect(px - 3, py - 1, 2, 2); c.fillRect(px + 2, py - 1, 2, 2);
}
function drawDock(c, v, o) {
  fillPolyPat(c, quad(v, o.x, o.y, 4, 1, 0), (px, py) => (((px + py * 2) >> 2) & 1) ? '#f2b71f' : '#1d1d1d');
  box(c, v, o.x + 1.2, o.y + 0.2, 0.7, 0.6, 0, 2, '#9a7546');
  box(c, v, o.x + 1.25, o.y + 0.25, 0.6, 0.5, 2, 5, '#c89a62');
}
function drawExit(c, v, o) {
  fillPoly(c, tile(v, o.x, o.y), '#2f8a4f');
  box(c, v, o.x + 0.45, o.y + 0.45, 0.1, 0.1, 0, 14, '#555');
  box(c, v, o.x + 0.2, o.y + 0.4, 0.6, 0.2, 14, 5, '#2fa858');
  const [sx, sy] = iso(v, o.x + 0.2, o.y + 0.6, 18); pixText(c, 'EXIT', sx - 2, sy - 3, '#ffffff');
}
function drawPallet(c, v, x, y, stack) {
  box(c, v, x, y, 0.42, 0.42, 0, 1, '#8a6a42', { outline: false });
  for (let k = 0; k < stack; k++) box(c, v, x + 0.02, y + 0.02, 0.38, 0.38, 1 + k * 4, 4, '#c89a62', { tones: { top: '#dcb27a', left: '#c89a62', right: '#a77d4a', line: '#6e5230' } });
}
function drawWorker(c, v, e, t, moving) {
  const [sx, sy] = iso(v, e.px + 0.5, e.py + 0.5);
  const x = Math.round(sx) - 2, y = Math.round(sy);
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x - 1, y, 6, 1);
  const step = moving ? Math.floor(t / 160) % 2 : 0;
  c.fillStyle = '#2b2f3a'; c.fillRect(x + 1, y - 4, 1, 4 - step); c.fillRect(x + 2, y - 4, 1, 3 + step);
  const shirt = deptColor(JOBS[e.job]?.dept);
  c.fillStyle = shirt; c.fillRect(x, y - 9, 4, 5); c.fillStyle = shade(shirt, -0.3); c.fillRect(x + 3, y - 9, 1, 5);
  c.fillStyle = ['#f0d2b6', '#d9a77e', '#a86e4a', '#7a4a2e'][e.id % 4]; c.fillRect(x + 1, y - 12, 2, 3);
  c.fillStyle = ['#3a2a1a', '#1a1a1a', '#8a6a3a', '#b0b0b0', '#6a2a1a'][(e.id >> 2) % 5]; c.fillRect(x + 1, y - 13, 2, 1);
}
function bubble(c, v, e, kind) {
  const [sx, sy] = iso(v, e.px + 0.5, e.py + 0.5); const x = Math.round(sx) + 3, y = Math.round(sy) - 17;
  c.fillStyle = '#ffffff'; c.fillRect(x, y, 5, 4); c.fillRect(x + 1, y + 4, 1, 1);
  if (kind === 'coffee') { c.fillStyle = '#7a4a2a'; c.fillRect(x + 1, y + 1, 2, 2); c.fillRect(x + 3, y + 1, 1, 1); }
  else if (kind === 'smoke') { c.fillStyle = '#888'; c.fillRect(x + 1, y + 2, 3, 1); c.fillStyle = '#e06030'; c.fillRect(x + 3, y + 2, 1, 1); }
  else if (kind === 'strike') { c.fillStyle = '#c0392b'; c.fillRect(x + 1, y + 1, 3, 2); }
  else if (kind === 'goof') { c.fillStyle = '#3a6fb0'; c.fillRect(x + 1, y + 1, 1, 1); c.fillRect(x + 3, y + 2, 1, 1); }
}
function badge(c, x, y, color, glyph) {
  x = Math.round(x); y = Math.round(y);
  c.fillStyle = '#1d1d1d'; c.fillRect(x - 4, y - 4, 9, 9); c.fillStyle = color; c.fillRect(x - 3, y - 3, 7, 7);
  c.fillStyle = glyph === '?' || glyph === '!' ? '#1d1d1d' : '#ffffff';
  if (glyph === '!') { c.fillRect(x, y - 2, 1, 3); c.fillRect(x, y + 2, 1, 1); }
  else if (glyph === '?') { c.fillRect(x - 1, y - 2, 3, 1); c.fillRect(x + 1, y - 1, 1, 1); c.fillRect(x, y, 1, 1); c.fillRect(x, y + 2, 1, 1); }
  else { for (let k = -2; k <= 2; k++) { c.fillRect(x + k, y + k, 1, 1); c.fillRect(x + k, y - k, 1, 1); } }
}

export function drawObject(c, v, st, o, C, t, anim, ghost = false) {
  switch (o.kind) {
    case 'machine': return drawMachine(c, v, st, o, C, t, ghost);
    case 'office': return drawOffice(c, v, o, C);
    case 'conveyor': return drawConveyor(c, v, o, t, anim);
    case 'bin': return drawBin(c, v, o);
    case 'forklift': return drawForklift(c, v, o);
    case 'handcart': return drawHandcart(c, v, o);
    case 'breakroom': case 'restroom': return drawRoom(c, v, o, o.kind);
    case 'dock': return drawDock(c, v, o);
    case 'exit': return drawExit(c, v, o);
  }
}

/**
 * Draw the whole scene into the low-res context.
 * opts: { C colors, t, anim, workers:[{e, target, act}], pallets, sel, cursor:[x,y], ghost:{spec, ok}, gauges(o)->[{frac,status}], focus }
 */
export function drawScene(c, v, st, opts) {
  const { C, t, anim } = opts; const fl = v.fl;
  c.fillStyle = C.panel; c.fillRect(0, 0, v.W, v.H);
  c.drawImage(floorLayer(v, C), 0, 0);
  // selection: tinted footprint under everything
  if (opts.sel) for (const [x, y] of footprint(opts.sel)) fillPolyPat(c, tile(v, x, y), (px, py) => ((px + py) % 2 ? C.focus : null));
  // depth-sorted drawables
  const items = [];
  for (const o of fl.objects) { const { w, h } = rotSize(o.kind, o.rot || 0); const flat = o.kind === 'dock' || o.kind === 'exit'; items.push({ d: flat ? -1 + (o.x + o.y) * 0.001 : o.x + w / 2 + o.y + h / 2 - (o.kind === 'conveyor' ? 0.3 : 0), f: () => drawObject(c, v, st, o, C, t, anim) }); }
  // pallets on storage squares
  let pallets = opts.pallets || 0;
  for (let y = 0; y < fl.h && pallets > 0; y++) for (let x = 0; x < fl.w && pallets > 0; x++) {
    if (fl.zones[y * fl.w + x] !== ZONE.STORAGE) continue;
    for (let k = 0; k < 2 && pallets > 0; k++, pallets--) { const px = x + 0.06 + k * 0.48, py = y + 0.3; const stack = Math.min(3, 1 + ((x * 7 + y * 3 + k) % 3)); items.push({ d: px + py + 0.42, f: () => drawPallet(c, v, px, py, stack) }); }
  }
  for (const w of opts.workers || []) items.push({ d: w.e.px + w.e.py + 1.05, f: () => { drawWorker(c, v, w.e, t, w.moving); if (w.bubble) bubble(c, v, w.e, w.bubble); } });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.f();
  // overlays: stock gauges and status badges above machines
  for (const o of fl.objects) {
    if (o.kind !== 'machine') continue;
    const { w, h } = rotSize('machine', o.rot || 0);
    const [tx, ty] = iso(v, o.x + w / 2, o.y + h / 2, 30);
    const g = opts.gauges ? opts.gauges(o) : [];
    if (g.length) {
      const bw = 18, x0 = Math.round(tx - bw / 2), y0 = Math.round(ty) - g.length * 3;
      c.fillStyle = '#1d1d1d'; c.fillRect(x0 - 1, y0 - 1, bw + 2, g.length * 3 + 1);
      g.forEach((gg, i) => { c.fillStyle = '#3a3f44'; c.fillRect(x0, y0 + i * 3, bw, 2); c.fillStyle = gg.status === 'bad' ? '#ff4a3d' : gg.status === 'warn' ? '#f2b71f' : '#5cd68a'; c.fillRect(x0, y0 + i * 3, Math.max(gg.status === 'bad' ? 0 : 1, Math.round(bw * gg.frac)), 2); });
    }
    const s = o.status || '';
    let bc = null, glyph = null;
    if (o.broken) { bc = '#d9342b'; glyph = 'x'; } else if (/empty|full/i.test(s)) { bc = '#f2b71f'; glyph = '!'; } else if (/No operator|needs/i.test(s)) { bc = '#f2b71f'; glyph = '?'; }
    if (bc) badge(c, tx + 14, ty - 2, bc, glyph);
  }
  // selection marker: a bobbing arrow above the selected item
  if (opts.sel) {
    const o = opts.sel, { w, h } = rotSize(o.kind, o.rot || 0);
    const zTop = { machine: 46, office: 24, bin: 24, forklift: 30, conveyor: 16, handcart: 20 }[o.kind] || 24;
    const [ax, ay] = iso(v, o.x + w / 2, o.y + h / 2, zTop + (anim ? Math.floor(t / 250) % 2 : 0));
    const x = Math.round(ax), y = Math.round(ay);
    c.fillStyle = '#1d1d1d'; c.fillRect(x - 4, y - 7, 9, 5); c.fillRect(x - 3, y - 2, 7, 1); c.fillRect(x - 2, y - 1, 5, 1); c.fillRect(x - 1, y, 3, 1);
    c.fillStyle = C.focus; c.fillRect(x - 3, y - 6, 7, 4); c.fillRect(x - 2, y - 2, 5, 1); c.fillRect(x - 1, y - 1, 3, 1);
  }
  // ghost
  if (opts.ghost) {
    const g = opts.ghost.spec;
    for (const [x, y] of footprint(g)) fillPolyPat(c, tile(v, x, y), (px, py) => ((px + py) % 2 ? (opts.ghost.ok ? '#3fbf6a' : '#e0453a') : null));
    c.globalAlpha = 0.55; drawObject(c, v, st, { ...g, id: -1, status: '' }, C, t, false, true); c.globalAlpha = 1;
    for (const [, [x, y]] of Object.entries(ports(g))) { const T = tile(v, x, y); const col = opts.ghost.ok ? '#3fbf6a' : '#e0453a'; const dash = i => (i >> 1) % 2 ? col : null; line(c, ...T[0], ...T[1], null, dash); line(c, ...T[1], ...T[2], null, dash); line(c, ...T[2], ...T[3], null, dash); line(c, ...T[3], ...T[0], null, dash); }
  }
  // keyboard cursor
  if (opts.cursor) {
    const [cx, cy] = opts.cursor; const T = tile(v, cx, cy); const ph = anim ? Math.floor(t / 120) : 0;
    const dash = i => ((i + ph) >> 1) % 2 ? '#f2b71f' : '#1d1d1d';
    line(c, ...T[0], ...T[1], null, dash); line(c, ...T[1], ...T[2], null, dash); line(c, ...T[2], ...T[3], null, dash); line(c, ...T[3], ...T[0], null, dash);
    const [x0, y0] = iso(v, cx + 0.5, cy + 0.5); c.fillStyle = '#f2b71f'; c.fillRect(Math.round(x0) - 1, Math.round(y0) - 16, 3, 3); c.fillRect(Math.round(x0), Math.round(y0) - 13, 1, 3);
  }
}
function outlineFoot(c, v, o, color) {
  const { w, h } = rotSize(o.kind, o.rot || 0);
  const Q = quad(v, o.x, o.y, w, h, 0);
  for (let i = 0; i < 4; i++) { line(c, ...Q[i], ...Q[(i + 1) % 4], color); line(c, Q[i][0], Q[i][1] + 1, Q[(i + 1) % 4][0], Q[(i + 1) % 4][1] + 1, color); }
}

// ---------- small isometric building sprites for the city map (cached data URLs, drawn at 18x17 and shown at 2x)
const spriteCache = new Map();
export function buildingSprite(kind, sizeBucket, variant, dark) {
  const key = [kind, sizeBucket, variant % 12, dark ? 1 : 0].join(':');
  if (spriteCache.has(key)) return spriteCache.get(key);
  const cv = document.createElement('canvas'); cv.width = 18; cv.height = 17;
  const c = cv.getContext('2d');
  const isoS = (x, y, z = 0) => [9 + (x - y) * 4, 11 + (x + y) * 2 - z];
  const bx = (x, y, w, d, z, hgt, color, roof) => {
    const t = tones(color);
    const A0 = isoS(x, y + d, z), B0 = isoS(x + w, y + d, z), C0 = isoS(x + w, y, z), A1 = isoS(x, y + d, z + hgt), B1 = isoS(x + w, y + d, z + hgt), C1 = isoS(x + w, y, z + hgt), D1 = isoS(x, y, z + hgt);
    fillPoly(c, [A0, B0, B1, A1], t.left); fillPoly(c, [B0, C0, C1, B1], t.right); fillPoly(c, [D1, C1, B1, A1], roof || t.top);
    line(c, ...A1, ...D1, t.line); line(c, ...D1, ...C1, t.line); line(c, ...C1, ...C0, t.line); line(c, ...C0, ...B0, t.line); line(c, ...B0, ...A0, t.line); line(c, ...A0, ...A1, t.line);
    return { A0, B0, C0, A1, B1, C1, D1 };
  };
  // ground plot
  fillPoly(c, [isoS(-1, -1), isoS(1, -1), isoS(1, 1), isoS(-1, 1)], kind === 'vacant' ? (dark ? '#4c5a3a' : '#9aaa72') : (dark ? '#3a403d' : '#8f9592'));
  if (kind === 'build') {
    // construction site: a steel frame that rises with progress (variant 0-4) and a tower crane
    const s = [1.15, 1.45, 1.75][sizeBucket], off = -s / 2, stage = variant % 5, hgt = 2 + stage * 1.6;
    fillPoly(c, [isoS(off, off), isoS(off + s, off), isoS(off + s, off + s), isoS(off, off + s)], dark ? '#5a4a36' : '#a88a62');
    if (stage >= 4) bx(off, off, s, s, 0, 7, '#3f8f5a', '#74c49a');
    else {
      for (const [x, y] of [[off, off + s], [off + s, off + s], [off + s, off], [off, off]]) { const a = isoS(x, y), b2 = isoS(x, y, hgt); line(c, ...a, ...b2, '#6a6f78'); }
      for (let z = 2; z <= hgt; z += 2) { const pts = [[off, off + s], [off + s, off + s], [off + s, off]].map(([x, y]) => isoS(x, y, z)); line(c, ...pts[0], ...pts[1], '#8a929a'); line(c, ...pts[1], ...pts[2], '#8a929a'); }
    }
    const m = isoS(off + s + 0.1, off - 0.1); c.fillStyle = '#f2b71f'; c.fillRect(m[0], m[1] - 13, 1, 13); c.fillRect(m[0] - 7, m[1] - 13, 10, 1); c.fillStyle = '#2e3338'; c.fillRect(m[0] - 5, m[1] - 12, 1, 3 + stage);
    const url = cv.toDataURL(); spriteCache.set(key, url); return url;
  }
  if (kind === 'vacant') {
    for (let i = 0; i < 6; i++) { const p = isoS(-0.8 + (i * 0.37) % 1.6, -0.6 + (i * 0.53) % 1.4); c.fillStyle = dark ? '#5f6f48' : '#7f9258'; c.fillRect(p[0], p[1], 1, 1); }
    const T = isoS(0, 0.3); c.fillStyle = '#5a4a32'; c.fillRect(T[0], T[1] - 5, 1, 5);
    c.fillStyle = '#f2f2ea'; c.fillRect(T[0] - 3, T[1] - 9, 7, 5); c.fillStyle = '#c0392b'; c.fillRect(T[0] - 2, T[1] - 8, 5, 1); c.fillRect(T[0] - 2, T[1] - 6, 3, 1);
  } else {
    const s = [1.15, 1.45, 1.75][sizeBucket], hgt = [5, 7, 8][(variant + sizeBucket) % 3];
    const roofs = ['#8a8f94', '#7a6a5a', '#5f7a8a', '#9a8a6a', '#6a6f78', '#8a7060'];
    const wall = kind === 'mine' ? '#3f8f5a' : ['#c8bea9', '#aeb2b4', '#c4a98a', '#9fb0ba'][variant % 4];
    const off = -s / 2;
    const b = bx(off, off, s, s, 0, hgt, wall, kind === 'mine' ? '#74c49a' : roofs[variant % 6]);
    // windows on the front-left face
    for (let k = 2; k < hgt - 1; k += 3) { const a = isoS(off + 0.15, off + s, k), e = isoS(off + s - 0.15, off + s, k); for (let x = a[0] + 1; x < e[0]; x += 2) { c.fillStyle = dark ? '#f2d16b' : '#e8d890'; c.fillRect(x, Math.round(a[1] + (x - a[0]) / 2), 1, 1); } }
    if (kind === 'mine') { const p = isoS(0, 0, hgt); c.fillStyle = '#222'; c.fillRect(p[0], p[1] - 6, 1, 6); c.fillStyle = '#f2b71f'; c.fillRect(p[0] + 1, p[1] - 6, 3, 2); }
    else if (variant % 3 === 0) { const p = isoS(off + s * 0.7, off + s * 0.3, hgt); c.fillStyle = '#5a5050'; c.fillRect(p[0], p[1] - 4, 2, 4); c.fillStyle = '#c8c8c8'; c.fillRect(p[0] + 1, p[1] - 6, 1, 1); }
    void b;
  }
  const url = cv.toDataURL();
  spriteCache.set(key, url);
  return url;
}

// ---------- a small demo factory for the title screen
export function demoScene(canvas, C, newFloor, ZONE) {
  const fl = newFloor(16000);
  let id = 100;
  const add = o => { fl.objects.push({ id: id++, rot: 0, ...o }); };
  add({ kind: 'machine', family: FAMILY_ID.machining, x: 2, y: 3, status: 'Running', mode: 'produce' });
  add({ kind: 'machine', family: FAMILY_ID.lighting, x: 10, y: 3, status: 'Running', mode: 'produce' });
  for (const [x, y] of [[7, 4], [8, 4], [8, 3], [9, 3]]) add({ kind: 'conveyor', x, y });
  add({ kind: 'office', officeType: 3, x: 3, y: 8 });
  for (let x = 1; x <= 2; x++) fl.zones[(fl.h - 2) * fl.w + x] = 0;
  fl.zones[4 * fl.w + 1] = ZONE.SAFETY;
  add({ kind: 'forklift', x: 12, y: 9, rot: 1 });
  const v = makeView(fl, 2);
  canvas.width = v.W * 2; canvas.height = v.H * 2;
  const lo = document.createElement('canvas'); lo.width = v.W; lo.height = v.H;
  const workers = [{ e: { id: 1, job: 'line_worker', px: 3, py: 6 }, moving: false }, { e: { id: 6, job: 'line_worker', px: 10, py: 6 }, moving: false }, { e: { id: 3, job: 'account_rep', px: 4, py: 9 }, moving: false }, { e: { id: 9, job: 'supervisor', px: 7, py: 6.4 }, moving: false, bubble: 'coffee' }];
  drawScene(lo.getContext('2d'), v, { floor: fl }, { C, t: 0, anim: false, pallets: 14, workers });
  const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(lo, 0, 0, canvas.width, canvas.height);
}
