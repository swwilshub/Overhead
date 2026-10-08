// Production cells: a room the player sizes, gives hatches (door, one input per material, one output) and
// furnishes. The minimum items come with the room; duplicates and extras improve it. Layout matters: the operator
// walks from the input hatches to station A, on to station B and out, and some extras only work next to the right
// station. Advanced extras are unlocked by researching cell technologies.
import { FAMILIES } from '../gen/data.js';

export const METRICS = [
  { key: 'quality', name: 'Quality', base: 45, desc: 'Raises the quality of what the cell makes, which lifts sales.' },
  { key: 'uptime', name: 'Uptime', base: 50, desc: 'Fewer breakdowns.' },
  { key: 'safety', name: 'Safety', base: 55, desc: 'Fewer accidents. Crowded cells are less safe.' },
  { key: 'yield', name: 'Yield', base: 92, unit: '%', max: 99.5, desc: 'Share of material that ends up in good product. The rest is scrap.' },
];

export const TECHS = {
  guarding: { name: 'Machine guarding', hours: 55, cost: 7500, desc: 'Light curtains that stop a station when someone reaches in.' },
  spc: { name: 'Statistical process control', hours: 85, cost: 11500, desc: 'Charts that catch drifting processes before they make scrap.' },
  automation: { name: 'PLC automation', hours: 115, cost: 19000, desc: 'Programmable controllers that pace every station.' },
  robotics: { name: 'Robotics', hours: 190, cost: 42000, desc: 'Robot loaders that tend a station without an operator.' },
  cooling: { name: 'Process cooling', hours: 65, cost: 8500, desc: 'Chillers that shorten casting and moulding cycles.' },
  vision: { name: 'Machine vision', hours: 105, cost: 17000, desc: 'Cameras that inspect every part as it passes.' },
  burnin: { name: 'Burn-in and light testing', hours: 75, cost: 10500, desc: 'Run lamps and units hot before shipping, so early failures happen here.' },
  finishing: { name: 'Finishing booths', hours: 85, cost: 13500, desc: 'Lacquer, paint and powder-coat booths.' },
  cleanroom: { name: 'Clean benches', hours: 125, cost: 23000, desc: 'Filtered air for dust-sensitive assembly.' },
  heat: { name: 'Heat treatment', hours: 95, cost: 16000, desc: 'Furnaces that harden shafts, gears and tools.' },
  testing: { name: 'Electrical testing', hours: 85, cost: 12500, desc: 'Surge and insulation testers for coils and mains appliances.' },
  bonding: { name: 'Heat bonding', hours: 70, cost: 9500, desc: 'Hot-air seam sealing for fabric goods.' },
  networking: { name: 'Office networking', hours: 65, cost: 9500, desc: 'A file server that links every office computer.' },
  ergonomics: { name: 'Ergonomics', hours: 45, cost: 5500, desc: 'Lighting and seating that keep office staff fresh all day.' },
};

// Item fields: name, w, h (rotation 0), price, role ('A' and 'B' are the stations, 'rack', or 'extra'), look (sprite),
// fx (metric points; speed and labour are fractions), near ('A', 'B' or 'station': full effect only when touching
// one, half otherwise), tech (research needed), floor (walkable, e.g. mats), desc.
const G = {
  rack: { name: 'Parts rack', w: 1, h: 1, price: 600, role: 'rack', look: 'rack', desc: 'Keeps a box of each material at hand. A station with a rack beside its work square cuts the walk from the input hatches to a quarter.' },
  board: { name: 'Tool board', w: 1, h: 1, price: 450, role: 'extra', look: 'board', near: 'station', fx: { labour: 0.04, quality: 2 }, desc: 'Tools on hooks by the station: less time per part, slightly better work.' },
  spares: { name: 'Spares cabinet', w: 1, h: 1, price: 1800, role: 'extra', look: 'cabinet', fx: { uptime: 12 }, desc: 'Common spare parts on site, so small faults are fixed in minutes.' },
  fan: { name: 'Extractor fan', w: 1, h: 1, price: 1200, role: 'extra', look: 'fan', fx: { safety: 8, uptime: 4 }, desc: 'Clears fumes and heat.' },
  inspect: { name: 'Inspection table', w: 2, h: 1, price: 2400, role: 'extra', look: 'table', near: 'B', fx: { quality: 10, yield: 1 }, desc: 'Checks every part as it leaves station B. Best right next to it.' },
  mat: { name: 'Anti-fatigue mat', w: 1, h: 1, price: 300, role: 'extra', look: 'mat', near: 'station', floor: true, fx: { labour: 0.02, safety: 2 }, desc: 'Something soft to stand on. Lay it on or next to a work square; people can walk on it.' },
  curtain: { name: 'Light curtain', w: 1, h: 1, price: 3500, role: 'extra', look: 'curtain', near: 'station', tech: 'guarding', fx: { safety: 18 }, desc: 'Stops a station when a hand crosses the beam.' },
  plc: { name: 'PLC controller', w: 1, h: 1, price: 9000, role: 'extra', look: 'plc', tech: 'automation', fx: { speed: 0.1, uptime: 6, plc: 1 }, desc: 'Paces every station: 10% faster and less operator attention per part.' },
  robot: { name: 'Robot loader', w: 1, h: 1, price: 24000, role: 'extra', look: 'robot', near: 'station', tech: 'robotics', fx: { robot: 1 }, desc: 'Loads and unloads the station it stands beside, so that station needs almost no operator time.' },
  spcterm: { name: 'SPC terminal', w: 1, h: 1, price: 6000, role: 'extra', look: 'terminal', tech: 'spc', fx: { quality: 10, yield: 2 }, desc: 'Process charts on the shop floor.' },
};
// Each line's two stations (A then B) and two extras (one basic, one from research) come from the world data.
export const CELL_ITEMS = { ...Object.fromEntries(Object.entries(G).map(([t, d]) => [t, { t, ...d }])) };
FAMILIES.forEach((f, fam) => {
  const st = f.price * 0.45, c = f.cell;
  CELL_ITEMS[`f${fam}a`] = { t: `f${fam}a`, name: c.A[0], w: c.A[1], h: c.A[2], price: Math.round(st * 0.55 / 100) * 100, role: 'A', look: 'station', fam, desc: `Station A: the first operation. Needs a clear work square in front (marked) for the operator.` };
  CELL_ITEMS[`f${fam}b`] = { t: `f${fam}b`, name: c.B[0], w: c.B[1], h: c.B[2], price: Math.round(st * 0.45 / 100) * 100, role: 'B', look: 'station', fam, desc: `Station B: the second operation, after station A. Needs a clear work square in front (marked).` };
  c.extras.forEach((x, i) => { CELL_ITEMS[`f${fam}x${i}`] = { t: `f${fam}x${i}`, role: 'extra', near: null, tech: null, ...x, fam }; });
});
export const itemDef = t => CELL_ITEMS[t];
export const REQUIRED = fam => [{ t: `f${fam}a`, n: 1 }, { t: `f${fam}b`, n: 1 }, { t: 'rack', n: 1 }];
export const EXTRAS = fam => ['board', 'spares', 'fan', 'inspect', 'mat', `f${fam}x0`, `f${fam}x1`, 'curtain', 'spcterm', 'plc', 'robot'];
export const MIN_SIZE = [5, 4], MAX_SIZE = [16, 12];
export function cellPrice(fam, cw, ch) { return Math.round((FAMILIES[fam].price * 1.05 + 120 * cw * ch) / 50) * 50; }
export const techDone = (st, tech) => !tech || !!st.cellTech?.done?.[tech];

// ---------- geometry (local coordinates inside the cell, 0..cw-1 by 0..ch-1)
const FRONT = [[0, 1], [-1, 0], [0, -1], [1, 0]];
export function itemSize(it) { const d = itemDef(it.t); return (it.rot || 0) % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h }; }
export function itemTiles(it) { const { w, h } = itemSize(it), out = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([it.x + x, it.y + y]); return out; }
// the square an operator stands on to work a station (in front of it, by rotation)
export function workSquare(it) {
  const { w, h } = itemSize(it), r = (it.rot || 0) & 3, [fx, fy] = FRONT[r];
  if (fx === 0) return [it.x + Math.floor((w - 1) / 2), fy > 0 ? it.y + h : it.y - 1];
  return [fx > 0 ? it.x + w : it.x - 1, it.y + Math.floor((h - 1) / 2)];
}
// items with a work square in front (production stations, and office desks whose chair goes there)
export const isStation = it => { const r = itemDef(it.t)?.role; return r === 'A' || r === 'B' || r === 'desk'; };
// a hatch is the outside square next to the wall; its inner square is the cell square just inside
export function hatchInner(cell, hz) { return [Math.min(Math.max(hz.lx, 0), cell.cw - 1), Math.min(Math.max(hz.ly, 0), cell.ch - 1)]; }
export function hatchSpotOk(cell, lx, ly) {
  const outX = lx < 0 || lx >= cell.cw, outY = ly < 0 || ly >= cell.ch;
  if (outX === outY) return false; // inside, or a diagonal corner
  return (lx >= -1 && lx <= cell.cw) && (ly >= -1 && ly <= cell.ch);
}
export const HATCH_ROLES = fam => [{ role: 'door', label: 'Door' }, ...Array.from({ length: FAMILIES[fam].inputs }, (_, k) => ({ role: 'in', k, label: `Input ${k + 1}` })), { role: 'out', label: 'Output' }];

// Is an item placement legal inside the cell?
export function itemProblem(cell, it, ignore = null) {
  const d = itemDef(it.t); if (!d) return 'Unknown item.';
  const occ = new Set();
  for (const o of cell.items) if (o !== ignore && !itemDef(o.t).floor) for (const [x, y] of itemTiles(o)) occ.add(x + ',' + y);
  const floorOcc = new Set(); for (const o of cell.items) if (o !== ignore && itemDef(o.t).floor) for (const [x, y] of itemTiles(o)) floorOcc.add(x + ',' + y);
  const inners = new Set((cell.hatches || []).map(hz => hatchInner(cell, hz).join(',')));
  for (const [x, y] of itemTiles(it)) {
    if (x < 0 || y < 0 || x >= cell.cw || y >= cell.ch) return 'That does not fit inside the cell.';
    const k = x + ',' + y;
    if (d.floor) { if (floorOcc.has(k) || occ.has(k)) return 'Something is already there.'; continue; }
    if (occ.has(k)) return 'Something is already there.';
    if (inners.has(k)) return 'Keep the square inside each hatch clear.';
  }
  if (!d.floor) for (const o of cell.items) if (o !== ignore && isStation(o) && itemTiles(it).some(([x, y]) => workSquare(o)[0] === x && workSquare(o)[1] === y)) return `That would block the work square of the ${itemDef(o.t).name.toLowerCase()}.`;
  if (isStation(it)) { const [wx, wy] = workSquare(it); if (wx < 0 || wy < 0 || wx >= cell.cw || wy >= cell.ch) return 'Turn it so its work square (in front) is inside the cell.'; if (occ.has(wx + ',' + wy)) return 'Its work square (in front) is blocked.'; }
  return null;
}

// ---------- layout analysis and metrics
function bfs(cell, blocked, from) {
  const W = cell.cw, H = cell.ch, dist = new Array(W * H).fill(Infinity);
  if (!from) return dist;
  const [sx, sy] = from; if (blocked.has(sx + ',' + sy)) return dist;
  dist[sy * W + sx] = 0; const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift(), d = dist[y * W + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked.has(nx + ',' + ny) || dist[ny * W + nx] <= d + 1) continue;
      dist[ny * W + nx] = d + 1; q.push([nx, ny]);
    }
  }
  return dist;
}
const touching = (a, b) => itemTiles(a).some(([x, y]) => itemTiles(b).some(([u, v]) => Math.abs(x - u) <= 1 && Math.abs(y - v) <= 1));

// opts: { operators: number of operators present (default 1), recipeInputs: number of materials in use }
export function analyse(cell, opts = {}) {
  const fam = cell.family, N = opts.operators ?? 1, nIn = opts.recipeInputs ?? FAMILIES[fam].inputs;
  const problems = [];
  const items = cell.items || [];
  const blocked = new Set(); for (const it of items) if (!itemDef(it.t).floor) for (const [x, y] of itemTiles(it)) blocked.add(x + ',' + y);
  const A = items.filter(it => itemDef(it.t).role === 'A'), B = items.filter(it => itemDef(it.t).role === 'B');
  const racks = items.filter(it => itemDef(it.t).role === 'rack');
  for (const r of REQUIRED(fam)) { const have = items.filter(it => it.t === r.t).length; if (have < r.n) problems.push(`Place the ${itemDef(r.t).name.toLowerCase()}.`); }
  const hz = role => (cell.hatches || []).filter(h => h.role === role);
  const door = hz('door')[0], out = hz('out')[0], ins = hz('in').sort((a, b) => a.k - b.k);
  if (!door) problems.push('Place the door.'); if (!out) problems.push('Place the output hatch.');
  if (ins.length < FAMILIES[fam].inputs) problems.push(`Place ${FAMILIES[fam].inputs - ins.length} more input hatch${FAMILIES[fam].inputs - ins.length > 1 ? 'es' : ''}.`);
  const fromDoor = bfs(cell, blocked, door && hatchInner(cell, door));
  const at = (dist, [x, y]) => (x < 0 || y < 0 || x >= cell.cw || y >= cell.ch) ? Infinity : dist[y * cell.cw + x];
  if (door) {
    for (const s of [...A, ...B]) if (at(fromDoor, workSquare(s)) === Infinity) problems.push(`The ${itemDef(s.t).name.toLowerCase()}'s work square can't be reached from the door.`);
    for (const h of [...ins, ...(out ? [out] : [])]) if (at(fromDoor, hatchInner(cell, h)) === Infinity) problems.push(`The ${h.role === 'out' ? 'output hatch' : `input ${h.k + 1} hatch`} can't be reached from the door.`);
  }
  // walking per part: input hatches -> nearest station A (a quarter if a rack is beside it), A -> B, B -> output
  let D = 0; const legs = [];
  const wsDist = (from, stations) => { const d = bfs(cell, blocked, from); let best = Infinity, which = null; for (const s of stations) { const v = at(d, workSquare(s)); if (v < best) { best = v; which = s; } } return [best, which]; };
  const racked = s => racks.some(r => itemTiles(r).some(([x, y]) => Math.abs(x - workSquare(s)[0]) <= 1 && Math.abs(y - workSquare(s)[1]) <= 1));
  if (A.length && B.length && out && door) {
    for (const h of ins.slice(0, nIn)) { const [d, s] = wsDist(hatchInner(cell, h), A); const leg = d === Infinity ? 99 : d * (s && racked(s) ? 0.25 : 1); D += leg; legs.push(['in' + h.k, leg]); }
    let ab = Infinity; for (const a of A) { const d = bfs(cell, blocked, workSquare(a)); for (const b of B) ab = Math.min(ab, at(d, workSquare(b))); }
    const [bo] = wsDist(hatchInner(cell, out), B);
    D += (ab === Infinity ? 99 : ab) + (bo === Infinity ? 99 : bo); legs.push(['ab', ab], ['out', bo]);
  }
  // extras: full effect when touching what they need, half otherwise
  const sums = { quality: 0, uptime: 0, safety: 0, yield: 0, speed: 0 }; let plc = 0;
  const nearOk = (it, d) => !d.near || (d.near === 'station' ? [...A, ...B] : d.near === 'A' ? A : B).some(s => touching(it, s));
  const labourCut = new Map(), robotAt = new Set(), stationSpeed = new Map();
  const half = [];
  for (const it of items) {
    const d = itemDef(it.t); if (!d.fx) continue;
    const ok = nearOk(it, d), f = ok ? 1 : 0.5; if (!ok) half.push(it);
    for (const k of ['quality', 'uptime', 'safety', 'yield']) if (d.fx[k]) sums[k] += d.fx[k] * f;
    if (d.fx.plc) plc = 1;
    if (d.fx.speed) { if (d.near && ok) { for (const s of (d.near === 'B' ? B : d.near === 'A' ? A : [...A, ...B]).filter(s => touching(it, s))) stationSpeed.set(s, (stationSpeed.get(s) || 0) + d.fx.speed); } else sums.speed += d.fx.speed * f; }
    if (d.fx.labour) for (const s of [...A, ...B]) if (touching(it, s)) labourCut.set(s, (labourCut.get(s) || 0) + d.fx.labour);
    if (d.fx.robot) for (const s of [...A, ...B]) if (touching(it, s)) { robotAt.add(s); break; }
  }
  // crowding
  const area = cell.cw * cell.ch, used = items.filter(it => !itemDef(it.t).floor).reduce((a, it) => a + itemTiles(it).length, 0), occ = used / area;
  const crowd = Math.max(0, occ - 0.5);
  // capacity per station type and operator time per part
  const cap = list => list.reduce((a, s) => a + (1 + sums.speed + (stationSpeed.get(s) || 0)) * (plc ? 1.1 : 1), 0);
  const L = s => robotAt.has(s) ? 0.05 : Math.max(0.12, 0.25 - (labourCut.get(s) || 0));
  const avg = list => list.length ? list.reduce((a, s) => a + L(s), 0) / list.length : 0.25;
  const walk = 0.012 * D;
  const Lsum = (avg(A) + avg(B) + walk) * (plc ? 0.85 : 1);
  const capA = cap(A), capB = cap(B), staff = N > 0 ? N / Lsum : 0;
  const T = Math.min(capA, capB, staff);
  const flow = 1 / (1 + D / 120);
  const speedMult = problems.length ? 0 : T * flow / 0.909 * (1 - crowd * 0.5);
  let limit = 'none';
  if (!problems.length) {
    if (T === staff) limit = walk > Lsum * 0.35 ? 'walking' : 'staff';
    else limit = capA <= capB ? 'A' : 'B';
  }
  const clampM = (k, v) => { const m = METRICS.find(x => x.key === k); return Math.max(0, Math.min(m.max ?? 100, v)); };
  const metrics = {
    quality: clampM('quality', 45 + sums.quality),
    uptime: clampM('uptime', 50 + sums.uptime),
    safety: clampM('safety', 55 + sums.safety - crowd * 80),
    yield: clampM('yield', 92 + sums.yield),
  };
  // how many more operators would still help (labour-bound), for the panel
  const opsUseful = Math.max(1, Math.ceil(Math.min(capA, capB) * Lsum - 1e-9));
  return { ok: !problems.length, problems, speedMult, metrics, limit, D, legs, walk, Lsum, capA, capB, staff, T, flow, crowd, occ, half, opsUseful, robots: robotAt.size, stations: A.length + B.length };
}

// ---------- automatic standard layout: place A, B and a rack to keep the walk short
export function standardLayout(cell) {
  const fam = cell.family, base = { ...cell, items: cell.items.filter(it => !isStation(it) && itemDef(it.t).role !== 'rack') };
  const tryPlace = (c, t) => {
    let best = null;
    for (let r = 0; r < 4; r++) for (let y = 0; y < c.ch; y++) for (let x = 0; x < c.cw; x++) {
      const it = { t, x, y, rot: r }; if (itemProblem(c, it)) continue;
      const trial = { ...c, items: [...c.items, it] };
      const a = analyse(trial, { operators: 1 });
      // score: prefer short walks, ignoring problems about items not yet placed
      const blockers = a.problems.filter(p => /can't be reached/.test(p)).length;
      const score = blockers * 1000 + (Number.isFinite(a.D) ? a.D : 500) + scoreStage(trial, t);
      if (!best || score < best.score) best = { it, score };
    }
    return best ? { ...c, items: [...c.items, best.it] } : null;
  };
  let c = tryPlace(base, `f${fam}a`); if (!c) return null;
  c = tryPlace(c, `f${fam}b`); if (!c) return null;
  c = tryPlace(c, 'rack'); if (!c) return null;
  return c.items;
}
// while placing A before B exists, judge A by how close its work square is to the input hatches
function scoreStage(cell, t) {
  const it = cell.items[cell.items.length - 1]; if (!isStation(it) && t !== 'rack') return 0;
  const ws = t === 'rack' ? null : workSquare(it);
  const ins = (cell.hatches || []).filter(h => h.role === 'in').map(h => hatchInner(cell, h));
  const out = (cell.hatches || []).find(h => h.role === 'out');
  if (t === 'rack') { const a = cell.items.find(x => itemDef(x.t).role === 'A'); if (!a) return 0; const [wx, wy] = workSquare(a); return itemTiles(it).some(([x, y]) => Math.abs(x - wx) <= 1 && Math.abs(y - wy) <= 1) ? -50 : 0; }
  if (itemDef(t).role === 'A') return ins.reduce((a, [x, y]) => a + Math.abs(x - ws[0]) + Math.abs(y - ws[1]), 0) * 0.5;
  if (itemDef(t).role === 'B' && out) { const [ox, oy] = hatchInner(cell, out); return (Math.abs(ox - ws[0]) + Math.abs(oy - ws[1])) * 0.3; }
  return 0;
}
// default hatches for a fresh blueprint: door at the front, inputs down the left, output on the right
export function defaultHatches(cell) {
  const n = FAMILIES[cell.family].inputs, out = [];
  out.push({ role: 'door', lx: Math.floor(cell.cw / 2), ly: cell.ch });
  for (let k = 0; k < n; k++) out.push({ role: 'in', k, lx: -1, ly: Math.min(cell.ch - 1, Math.round((k + 0.5) * cell.ch / n - 0.5)) });
  out.push({ role: 'out', lx: cell.cw, ly: Math.floor(cell.ch / 2) });
  return out;
}
