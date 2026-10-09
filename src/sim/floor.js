// Factory floor: tiles, zones, equipment footprints, access rules, conveyor networks.
import { FAMILIES, RECIPES, ITEMS, OFFICES as OFFICES_DATA, EQUIPMENT } from '../gen/data.js';
import { itemDef, itemTiles } from './cells.js';

export const TILE_SQFT = 64;
export const ZONE = { NONE: 0, STORAGE: 1, SAFETY: 2, SMOKING: 3, CARPET: 4, FORKLIFT: 5 };
export const ZONE_INFO = [
  { key: 'clear', name: 'Bare concrete', desc: 'Clears paint from the floor.' },
  { key: 'storage', name: 'Storage zone', desc: 'Pallet space for materials and finished goods. Each square holds two pallets of 20 boxes.' },
  { key: 'safety', name: 'Safety zone', desc: 'Keeps people clear of machine intakes. Put one in front of every hand-fed machine input.' },
  { key: 'smoking', name: 'Smoking zone', desc: 'A place for smokers to take their breaks without leaving the building.' },
  { key: 'carpet', name: 'Carpet', desc: 'Carpeted office areas make office staff a little happier.' },
  { key: 'forklift', name: 'Forklift parking', desc: 'Forklifts must be parked on these squares.' },
];
export const BOXES_PER_STORAGE_TILE = 40, BOXES_PER_BIN = 20, DOCK_BOXES = 40;

// Ready-made offices (one desk each) from the world data. kit lists what the sprite shows: pc, files, cabinet, plant, window.
export const OFFICES = OFFICES_DATA;
export const officeKit = o => new Set(OFFICES[o.officeType]?.kit || []);

// Base footprints (rotation 0). Ports are access squares outside the footprint.
export const KINDS = {
  // inputs come from INPUT_SLOTS, one per material the line takes (1 to 4); the operator's post is at the front
  // between the front inputs, the service hatch at the back
  machine: { w: 5, h: 3, ports: { output: [5, 1], control: [2, 3], maint: [2, -1] }, max: 40 },
  // production cells: size and hatches are set by the player (cw, ch, hatches)
  cell: { w: 5, h: 4, ports: {}, max: 30 },
  suite: { w: 3, h: 3, ports: {}, max: 30 },
  office: { w: 3, h: 3, ports: { door: [1, 3] }, max: 40 },
  conveyor: { w: 1, h: 1, ports: {}, price: EQUIPMENT.conveyor.price, max: 600 },
  bin: { w: 2, h: 2, ports: {}, price: EQUIPMENT.bin.price, max: 40 },
  handcart: { w: 1, h: 1, ports: {}, price: EQUIPMENT.handcart.price, max: 10 },
  forklift: { w: 1, h: 2, ports: {}, price: EQUIPMENT.forklift.price, max: 6 },
  breakroom: { w: 4, h: 3, ports: { door: [1, 3] }, fixed: true },
  restroom: { w: 3, h: 2, ports: { door: [1, 2] }, fixed: true },
  dock: { w: 4, h: 1, ports: { door: [1, -1] }, fixed: true },
  exit: { w: 1, h: 1, ports: { door: [0, -1] }, fixed: true },
};
export const EQUIP_NAME = { conveyor: EQUIPMENT.conveyor.name, bin: EQUIPMENT.bin.name, handcart: EQUIPMENT.handcart.name, forklift: EQUIPMENT.forklift.name };
// Input squares in order: left top, left bottom, front left, front right. None touch each other, so belts to
// different inputs stay separate lines unless the player joins them on purpose, and none sit behind the machine
// where its body would hide them in the three-quarter view.
export const INPUT_SLOTS = [[-1, 0], [-1, 2], [0, 3], [4, 3]];
export const isInputPort = p => /^in\d$/.test(p);
export const isProducer = o => o.kind === 'machine' || o.kind === 'cell';
// rooms the player designs: production cells and office suites
export const isRoom = o => o.kind === 'cell' || o.kind === 'suite';
// The marker drawn over a stopped machine on the floor: "!" when it has run out of materials or room, "?" when
// nobody is there to run it. Broken machines get their own red "x".
export const statusMark = s => /Out of materials|full/i.test(s || '') ? '!' : /No operator|no engineer/.test(s || '') ? '?' : null;
export const inputCount = o => isProducer(o) ? FAMILIES[o.family].inputs : 0;
export const PORT_LABEL = { in0: 'input square', in1: 'input square', in2: 'input square', in3: 'input square', output: 'output square', control: "operator's post", maint: 'service hatch', door: 'doorway' };

// Model generation, set per line in the world data: component lines are Mk I, product lines Mk II to IV.
export const TIER_NAME = ['', 'Mk I', 'Mk II', 'Mk III', 'Mk IV'];
export function machineTier(fam) { return FAMILIES[fam]?.tier || 1; }

export function priceOf(obj) {
  if (obj.kind === 'machine') return FAMILIES[obj.family].price;
  if (isRoom(obj)) return obj.cost || 0;
  if (obj.kind === 'office') return OFFICES[obj.officeType].price;
  return KINDS[obj.kind].price || 0;
}

export function floorSize(sqft) {
  const tiles = sqft / TILE_SQFT;
  let w = Math.round(Math.sqrt(tiles * 1.3)), h = Math.round(tiles / w);
  w = Math.min(Math.max(w, 18), 56); h = Math.min(Math.max(h, 13), 44);
  return { w, h };
}

// size on the floor of an object (cells have their own size)
export function objSize(o) { return isRoom(o) ? { w: o.cw, h: o.ch } : rotSize(o.kind, o.rot || 0); }
export function rotSize(kind, rot) { const k = KINDS[kind]; return rot % 2 ? { w: k.h, h: k.w } : { w: k.w, h: k.h }; }
function rotPoint(lx, ly, w, h, r) {
  switch (r & 3) { case 0: return [lx, ly]; case 1: return [h - 1 - ly, lx]; case 2: return [w - 1 - lx, h - 1 - ly]; default: return [ly, w - 1 - lx]; }
}
export function footprint(obj) {
  const { w, h } = objSize(obj); const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([obj.x + x, obj.y + y]);
  return out;
}
export function ports(obj) {
  const k = KINDS[obj.kind], out = {};
  if (isRoom(obj)) {
    for (const hz of obj.hatches || []) out[hz.role === 'in' ? 'in' + hz.k : hz.role === 'out' ? 'output' : 'door'] = [obj.x + hz.lx, obj.y + hz.ly];
    return out;
  }
  const all = obj.kind === 'machine' ? { ...Object.fromEntries(INPUT_SLOTS.slice(0, inputCount(obj)).map((p, i) => ['in' + i, p])), ...k.ports } : k.ports;
  for (const [name, [lx, ly]] of Object.entries(all)) {
    const [rx, ry] = rotPoint(lx, ly, k.w, k.h, obj.rot || 0); out[name] = [obj.x + rx, obj.y + ry];
  }
  return out;
}
// the material input square k takes for the machine's current product (null when this product doesn't use it)
export function portItem(o, k) { const r = o.recipe != null ? RECIPES[o.recipe] : null; return r?.inputs[k]?.[0] ?? null; }
export function portName(o, k) { const it = portItem(o, k); return `input ${k + 1}${it != null ? ` (${ITEMS[it].name})` : ' (unused by this product)'}`; }
// input squares of a machine, in port order
export function inputPorts(obj) { const p = ports(obj); return Array.from({ length: inputCount(obj) }, (_, i) => p['in' + i]).filter(Boolean); }

export function newFloor(sqft) {
  const { w, h } = floorSize(sqft);
  const fl = { w, h, zones: new Array(w * h).fill(0), objects: [], rev: 0 };
  const fixed = [
    { kind: 'dock', x: 1, y: h - 1, rot: 0 },
    { kind: 'exit', x: w - 3, y: h - 1, rot: 0 },
    { kind: 'breakroom', x: w - 5, y: 0, rot: 0 },
    { kind: 'restroom', x: w - 9, y: 0, rot: 0 },
  ];
  let id = 1;
  for (const f of fixed) fl.objects.push({ id: id++, ...f, fixed: true });
  fl.nextId = id;
  // a starter storage area next to the dock
  for (let y = h - 5; y < h - 2; y++) for (let x = 1; x < 9; x++) fl.zones[y * w + x] = ZONE.STORAGE;
  return fl;
}

export const inBounds = (fl, x, y) => x >= 0 && y >= 0 && x < fl.w && y < fl.h;

// occupancy grid: object id per tile, plus a map of reserved access squares
export function occupancy(fl) {
  const occ = new Int32Array(fl.w * fl.h).fill(0);
  const access = new Map(); // tileIndex -> {obj, port}
  for (const o of fl.objects) {
    for (const [x, y] of footprint(o)) if (inBounds(fl, x, y)) occ[y * fl.w + x] = o.id;
    for (const [p, [x, y]] of Object.entries(ports(o))) if (inBounds(fl, x, y)) access.set(y * fl.w + x, { obj: o, port: p });
  }
  return { occ, access };
}

export function countKind(fl, kind) { return fl.objects.filter(o => o.kind === kind).length; }

// Returns null when placement is legal, else a player-facing reason.
export function placementProblem(fl, obj, ignoreId = null) {
  const k = KINDS[obj.kind];
  if (!k) return 'Unknown equipment.';
  if (!ignoreId && k.max && countKind(fl, obj.kind) >= k.max) return `A plant can hold at most ${k.max} of those (${(EQUIP_NAME[obj.kind] || obj.kind).toLowerCase()}).`;
  const { occ, access } = occupancy({ ...fl, objects: fl.objects.filter(o => o.id !== ignoreId) });
  const tiles = footprint(obj);
  for (const [x, y] of tiles) {
    if (!inBounds(fl, x, y)) return 'That runs past the walls.';
    const i = y * fl.w + x;
    if (occ[i]) return 'That spot is taken.';
    const z = fl.zones[i];
    const a = access.get(i);
    const beltOnPort = obj.kind === 'conveyor' && a && isProducer(a.obj) && (isInputPort(a.port) || a.port === 'output');
    if (z === ZONE.STORAGE) return 'That is a storage zone. Repaint the floor first.';
    // a belt may sit on a machine's input or output square even if it is painted as a safety zone (the belt replaces it)
    if (z === ZONE.SAFETY && !beltOnPort) return 'Nothing may stand on a safety zone.';
    if (obj.kind === 'forklift' && z !== ZONE.FORKLIFT) return 'Park forklifts on forklift parking only.';
    if (a) {
      if (!beltOnPort) return `That would block the ${isProducer(a.obj) && a.port !== 'door' ? PORT_LABEL[a.port] : a.obj.kind === 'office' ? 'office doorway' : 'doorway'} of ${objectLabel(null, a.obj)}. Keep it clear.`;
    }
  }
  for (const [p, [x, y]] of Object.entries(ports(obj))) {
    if (!inBounds(fl, x, y)) return `Its ${PORT_LABEL[p]} would be outside the walls.`;
    const i = y * fl.w + x;
    if (occ[i]) {
      const other = fl.objects.find(o => o.id === occ[i]);
      const ok = other && other.kind === 'conveyor' && isProducer(obj) && (isInputPort(p) || p === 'output');
      if (!ok) return `Its ${PORT_LABEL[p]} would be blocked. Leave that square free.`;
    }
    if (fl.zones[i] === ZONE.STORAGE) return `Its ${PORT_LABEL[p]} would land on a storage zone. Repaint that square first.`;
  }
  if (obj.kind === 'bin') {
    const adj = conveyorTilesAround(fl, tiles);
    if (!adj) return 'Put the bin right beside a belt so goods can reach it.';
  }
  return null;
}

function conveyorTilesAround(fl, tiles) {
  const set = new Set(tiles.map(([x, y]) => y * fl.w + x));
  const conv = new Set(fl.objects.filter(o => o.kind === 'conveyor').map(o => o.y * fl.w + o.x));
  for (const [x, y] of tiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const i = (y + dy) * fl.w + (x + dx);
    if (inBounds(fl, x + dx, y + dy) && !set.has(i) && conv.has(i)) return true;
  }
  return false;
}

export function zoneProblem(fl, x, y, zone) {
  if (!inBounds(fl, x, y)) return 'That is past the walls.';
  const { occ, access } = occupancy(fl);
  const i = y * fl.w + x;
  if (zone === ZONE.NONE) return null;
  if (occ[i]) {
    const o = fl.objects.find(o => o.id === occ[i]);
    if (zone === ZONE.CARPET && o && (o.kind === 'office')) return null;
    if (zone === ZONE.FORKLIFT && o && o.kind === 'forklift') return null;
    return 'Something is standing there.';
  }
  if (zone === ZONE.STORAGE && access.has(i)) return 'A storage zone there would block a machine or door square.';
  return null;
}

// ---- conveyor networks: which machine outputs feed which machine inputs
const linkCache = new WeakMap();
export function links(fl) {
  const hit = linkCache.get(fl);
  if (hit && hit.rev === fl.rev) return hit;
  const conv = new Map(); for (const o of fl.objects) if (o.kind === 'conveyor') conv.set(o.y * fl.w + o.x, o.id);
  const net = new Map(); let n = 0;
  for (const start of conv.keys()) {
    if (net.has(start)) continue;
    const stack = [start]; net.set(start, n);
    while (stack.length) {
      const i = stack.pop(), x = i % fl.w, y = (i / fl.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!inBounds(fl, x + dx, y + dy)) continue;
        const j = (y + dy) * fl.w + x + dx;
        if (conv.has(j) && !net.has(j)) { net.set(j, n); stack.push(j); }
      }
    }
    n++;
  }
  const nets = Array.from({ length: n }, () => ({ sources: [], sinks: [], sinkPorts: [], bins: [] }));
  const portNet = {};
  for (const o of fl.objects) {
    if (isProducer(o)) {
      const p = ports(o);
      const oi = p.output ? p.output[1] * fl.w + p.output[0] : -1;
      if (net.has(oi)) nets[net.get(oi)].sources.push(o.id);
      portNet[o.id] = inputPorts(o).map(([x, y], k) => {
        const ii = y * fl.w + x; if (!net.has(ii)) return -1;
        const nt = nets[net.get(ii)]; if (!nt.sinks.includes(o.id)) nt.sinks.push(o.id); nt.sinkPorts.push({ id: o.id, k });
        return net.get(ii);
      });
    } else if (o.kind === 'bin') {
      const seen = new Set();
      for (const [x, y] of footprint(o)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * fl.w + x + dx;
        if (net.has(j) && !seen.has(net.get(j))) { seen.add(net.get(j)); nets[net.get(j)].bins.push(o.id); }
      }
    }
  }
  const feeds = {}, fedBy = {}, binsOf = {};
  for (const nt of nets) for (const s of nt.sources) {
    feeds[s] = [...new Set([...(feeds[s] || []), ...nt.sinks.filter(t => t !== s)])];
    binsOf[s] = (binsOf[s] || 0) + nt.bins.length;
    for (const t of nt.sinks) if (t !== s) fedBy[t] = [...new Set([...(fedBy[t] || []), s])];
  }
  // per input square: which machine outputs and bins reach it
  const portFeed = {};
  for (const [id, arr] of Object.entries(portNet)) portFeed[id] = arr.map(nIdx => nIdx < 0 ? null : { sources: nets[nIdx].sources.filter(s => s !== +id), bin: nets[nIdx].bins.length > 0, net: nIdx });
  // bins on an input line feed that input from storage; bins on an output line take goods to storage
  const inBin = {}, outBin = {};
  for (const [id, arr] of Object.entries(portFeed)) arr.forEach((f, k) => { if (f?.bin) (inBin[id] = inBin[id] || {})[k] = true; });
  for (const nt of nets) if (nt.bins.length) for (const sId of nt.sources) outBin[sId] = true;
  // concrete routes along the belt tiles, for drawing goods in motion and for describing a line
  const routes = [];
  const byId = new Map(fl.objects.map(o => [o.id, o]));
  const pathBetween = (startI, goalSet) => {
    const prev = new Map([[startI, -1]]), q = [startI];
    while (q.length) {
      const i = q.shift(); if (goalSet.has(i)) { const path = []; for (let k = i; k !== -1; k = prev.get(k)) path.push([k % fl.w, (k / fl.w) | 0]); return path.reverse(); }
      const x = i % fl.w, y = (i / fl.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * fl.w + x + dx; if (inBounds(fl, x + dx, y + dy) && conv.has(j) && !prev.has(j)) { prev.set(j, i); q.push(j); } }
    }
    return null;
  };
  const inTile = (id, k) => { const [x, y] = inputPorts(byId.get(id))[k]; return y * fl.w + x; };
  const binEdge = bo => { const out = []; for (const [x, y] of footprint(bo)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * fl.w + x + dx; if (conv.has(j)) out.push(j); } return out; };
  nets.forEach((nt, n) => {
    for (const sId of nt.sources) {
      const so = byId.get(sId); const [ox, oy] = ports(so).output; const start = oy * fl.w + ox;
      for (const { id: tId, k } of nt.sinkPorts) { if (tId === sId) continue; const p = pathBetween(start, new Set([inTile(tId, k)])); if (p) routes.push({ from: sId, to: tId, k, kind: 'machine', path: p, net: n }); }
      for (const bId of nt.bins) {
        const bo = byId.get(bId);
        const p = pathBetween(start, new Set(binEdge(bo))); if (p) { const c = center(bo); routes.push({ from: sId, to: bId, kind: 'bin', path: [...p, [Math.round(c[0]), Math.round(c[1])]], net: n }); }
      }
    }
    for (const bId of nt.bins) for (const { id: tId, k } of nt.sinkPorts) {
      const st0 = binEdge(byId.get(bId))[0]; if (st0 == null) continue;
      const p = pathBetween(st0, new Set([inTile(tId, k)])); if (p) routes.push({ from: bId, to: tId, k, kind: 'fromBin', path: p, net: n });
    }
  });
  // belts leaving an output that don't reach any input or bin: goods ride to the far end and stop there
  const ends = [];
  nets.forEach((nt, n) => {
    for (const sId of nt.sources) {
      if (routes.some(r => r.from === sId)) continue;
      const [ox, oy] = ports(byId.get(sId)).output, start = oy * fl.w + ox;
      const prev = new Map([[start, -1]]), q = [start]; let last = start;
      while (q.length) { const i = q.shift(); last = i; const x = i % fl.w, y = (i / fl.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * fl.w + x + dx; if (inBounds(fl, x + dx, y + dy) && conv.has(j) && !prev.has(j)) { prev.set(j, i); q.push(j); } } }
      const path = []; for (let k = last; k !== -1; k = prev.get(k)) path.push([k % fl.w, (k / fl.w) | 0]);
      ends.push({ from: sId, to: null, kind: 'end', path: path.reverse(), net: n });
    }
  });
  const dangling = nets.filter(nt => !nt.sources.length && !nt.sinks.length && !nt.bins.length).length;
  const out = { rev: fl.rev, feeds, fedBy, binsOf, nets, dangling, netOf: net, inBin, outBin, routes, ends, portNet, portFeed };
  linkCache.set(fl, out);
  return out;
}

export function storageCapacity(fl) {
  let tiles = 0; for (const z of fl.zones) if (z === ZONE.STORAGE) tiles++;
  return tiles * BOXES_PER_STORAGE_TILE + countKind(fl, 'bin') * BOXES_PER_BIN + DOCK_BOXES;
}

export function objectAt(fl, x, y) {
  for (const o of fl.objects) for (const [fx, fy] of footprint(o)) if (fx === x && fy === y) return o;
  return null;
}

export function describeTile(st, x, y) {
  const fl = st.floor; if (!inBounds(fl, x, y)) return 'Outside the building';
  const o = objectAt(fl, x, y); const z = fl.zones[y * fl.w + x];
  const { access } = occupancy(fl); const a = access.get(y * fl.w + x);
  const parts = [];
  if (o) parts.push(objectLabel(st, o));
  if (o && isRoom(o)) { const it = (o.items || []).find(i => itemTiles(i).some(([ix, iy]) => o.x + ix === x && o.y + iy === y)); parts.push(it ? itemDef(it.t).name.toLowerCase() : 'cell floor'); }
  if (z) parts.push(ZONE_INFO[z].name);
  if (a && (!o || o.kind === 'conveyor')) parts.push(`${o ? 'on the ' : ''}${a.port === 'door' ? 'doorway of ' : isInputPort(a.port) ? portName(a.obj, +a.port[2]) + ' of ' : PORT_LABEL[a.port] + ' of '}${objectLabel(st, a.obj)}`);
  if (o && o.kind === 'conveyor') parts.push(beltSummary(st, o));
  return parts.length ? parts.join(', ') : 'Empty floor';
}

// One line saying what a conveyor square's belt line carries, for the cursor and the inspector
export function beltSummary(st, o) {
  const fl = st.floor, L = links(fl), n = L.netOf.get(o.y * fl.w + o.x);
  const rs = L.routes.filter(r => r.net === n);
  const tag = id => { const q = fl.objects.find(x => x.id === id); return q.kind === 'bin' ? `storage bin #${id}` : objectLabel(st, q); };
  if (!rs.length) {
    const nt = L.nets[n];
    if (nt && nt.sources.length && !nt.sinks.length && !nt.bins.length) return `belt from ${nt.sources.map(tag).join(', ')} that doesn't reach an input or bin yet`;
    if (nt && nt.sinks.length && !nt.sources.length && !nt.bins.length) return `belt to an input of ${nt.sinks.map(tag).join(', ')} with nothing feeding it yet`;
    return 'belt not connected to any machine';
  }
  const into = r => r.k != null ? `${portName(fl.objects.find(x => x.id === r.to), r.k)} of ` : '';
  return 'belt line ' + rs.map(r => `${tag(r.from)} to ${into(r)}${tag(r.to)}`).join(', ');
}

// A production cell of a line is named after the line's process: "Die-casting line" gives "Die-casting cell".
export const cellName = fam => `${FAMILIES[fam].name.replace(/ line$/, '')} cell`;
// The one name for a piece of equipment, used everywhere text names it: cursor, inspector, tables, memos, belt text.
export function objectLabel(st, o) {
  switch (o.kind) {
    case 'machine': return `${FAMILIES[o.family].name} machine #${o.id}`;
    case 'cell': return `${cellName(o.family)} #${o.id}`;
    case 'suite': return `Office suite #${o.id}`;
    case 'office': return `${OFFICES[o.officeType].name} #${o.id}`;
    case 'conveyor': return 'Conveyor belt';
    case 'bin': return `${EQUIP_NAME.bin} #${o.id}`;
    case 'handcart': return EQUIP_NAME.handcart;
    case 'forklift': return 'Forklift';
    case 'breakroom': return 'Break room';
    case 'restroom': return 'Restroom';
    case 'dock': return 'Shipping dock';
    case 'exit': return 'Exit';
  }
  return o.kind;
}

export function center(o) {
  const { w, h } = objSize(o);
  return [o.x + w / 2 - 0.5, o.y + h / 2 - 0.5];
}

// Shortest belt route from a machine's output square (or the edge of a storage bin) to a machine's input square k
// (or the edge of a bin), through free floor. It first tries to keep clear of other belt lines so separate lines
// don't merge, and only then reuses or touches existing belts. Returns the squares still needing a conveyor, or null.
export function autoRoute(fl, fromObj, toObj, k = 0) {
  const conv = new Set(fl.objects.filter(o => o.kind === 'conveyor').map(o => o.y * fl.w + o.x));
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const edge = o => { const fp = footprint(o), out = new Set(); for (const [x, y] of fp) for (const [dx, dy] of N4) { if (inBounds(fl, x + dx, y + dy) && !fp.some(([fx, fy]) => fx === x + dx && fy === y + dy)) out.add((y + dy) * fl.w + x + dx); } return out; };
  const starts = fromObj.kind === 'bin' ? edge(fromObj) : new Set([ports(fromObj).output].map(([x, y]) => y * fl.w + x));
  const goals = isProducer(toObj) ? new Set([inputPorts(toObj)[k]].map(([x, y]) => y * fl.w + x)) : edge(toObj);
  const { access } = occupancy(fl);
  const ends = new Set([...starts, ...goals]);
  const free = i => !placementProblem(fl, { kind: 'conveyor', x: i % fl.w, y: (i / fl.w) | 0, rot: 0 }) && (ends.has(i) || !access.has(i));
  // already joined? (same belt network from a start to a goal)
  const L = links(fl);
  const sNets = new Set([...starts].filter(i => L.netOf.has(i)).map(i => L.netOf.get(i)));
  if ([...goals].some(i => L.netOf.has(i) && sNets.has(L.netOf.get(i)))) return [];
  const touchesOther = i => { const x = i % fl.w, y = (i / fl.w) | 0; return N4.some(([dx, dy]) => { const j = (y + dy) * fl.w + x + dx; return inBounds(fl, x + dx, y + dy) && conv.has(j) && !ends.has(j); }); };
  const passes = [
    i => ends.has(i) ? (conv.has(i) || free(i)) : (!conv.has(i) && free(i) && !touchesOther(i)), // a separate line
    i => conv.has(i) || free(i),                                                                    // anything goes
  ];
  for (const ok of passes) {
    const prev = new Map(), q = [];
    for (const s0 of starts) if (ok(s0)) { prev.set(s0, -1); q.push(s0); }
    while (q.length) {
      const i = q.shift();
      if (goals.has(i)) { const path = []; for (let t = i; t !== -1; t = prev.get(t)) path.push(t); return path.reverse().filter(t => !conv.has(t)).map(t => [t % fl.w, (t / fl.w) | 0]); }
      const x = i % fl.w, y = (i / fl.w) | 0;
      for (const [dx, dy] of N4) { const j = (y + dy) * fl.w + x + dx; if (inBounds(fl, x + dx, y + dy) && !prev.has(j) && ok(j)) { prev.set(j, i); q.push(j); } }
    }
  }
  return null;
}
