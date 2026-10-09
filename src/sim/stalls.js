// Why a machine has stopped: starved of materials, or blocked because its output has nowhere to go.
// Everything here is worked out again from the live state each time it is asked, so none of it is saved.
import { ITEMS, RECIPES } from '../gen/data.js';
import { jobFor, aOrAn, hasRole } from '../core/content.js';
import { isProducer, links, storageCapacity } from './floor.js';

// belt geometry shared with the material flow in game.js
export const BOX_GAP = 0.8, BUF_BOXES = 2;
export const STATUS = { starved: 'Out of materials', waiting: 'Waiting for materials', closed: 'Plant closed', noOperator: 'No operator' };

const list = a => a.length < 3 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
export const staffedBy = (st, o) => st.employees.some(e => e.assign === o.id);
const onOrder = (st, item) => st.orders.some(x => x.item === item);

// units riding the belts into each machine input: key "machine:input:item"
export function beltStock(st) {
  const m = new Map();
  for (const ln of Object.values(st.lanes || {})) {
    if (ln.to == null || ln.k == null || ln.kind === 'bin' || ln.kind === 'end') continue;
    for (const b of ln.boxes) { const key = `${ln.to}:${ln.k}:${b.item}`; m.set(key, (m.get(key) || 0) + b.units); }
  }
  return m;
}

// The inputs of a machine's product that it can no longer get: nothing at the machine, in the operator's hands or
// on a belt into it, and (unless a machine's belt is the only way in) nothing in storage either. An input fed by a
// belt from another machine is not starved while that machine is still able to make it.
export function starvedInputs(st, o, belt = beltStock(st), seen = new Set()) {
  if (!isProducer(o) || o.recipe == null) return [];
  const fl = st.floor, r = RECIPES[o.recipe], pf = links(fl).portFeed[o.id] || [], out = [];
  r.inputs.forEach(([it, q], k) => {
    const need = q / r.outQty - 1e-9;
    let have = (o.inBuf?.[it] || 0) + (belt.get(`${o.id}:${k}:${it}`) || 0);
    if (o.trip) for (const x of o.trip.in) if (x.item === it) have += x.units;
    const f = pf[k];
    const makers = f ? f.sources.map(id => fl.objects.find(x => x.id === id)).filter(m => m && m.mode === 'produce' && m.recipe != null && RECIPES[m.recipe].out === it) : [];
    // storage is only reached by hand when the input is not belted from a machine (a bin on the line feeds it)
    if (!makers.length || f.bin) have += st.inventory[it] || 0;
    if (have >= need) return;
    seen.add(o.id);
    // a running machine upstream will bring more
    if (!f?.bin && makers.some(m => !seen.has(m.id) && !m.broken && staffedBy(st, m) && !starvedInputs(st, m, belt, seen).length)) return;
    out.push({ item: it, k, made: makers.length > 0 });
  });
  return out;
}

const boxesStored = st => { let b = 0; for (const [id, u] of Object.entries(st.inventory)) b += Math.ceil(u / ITEMS[id].pack); return b; };
const entryFree = ln => !ln.boxes.length || Math.min(...ln.boxes.map(b => b.s)) >= BOX_GAP - 1e-9;
// 'belt' when the output tray is full and every belt from it is full, 'storage' when it is full and nothing can be
// carried away; null while the machine can still put its product somewhere
export function outputBlock(st, o) {
  if (!isProducer(o) || o.mode !== 'produce' || o.recipe == null) return null;
  const r = RECIPES[o.recipe];
  if ((o.tray || 0) + 1 <= BUF_BOXES * ITEMS[r.out].pack + 1e-9) return null;
  if (o.outLanes) { const lanes = Object.values(st.lanes || {}).filter(l => l.from === o.id && l.kind !== 'fromBin'); return lanes.some(entryFree) ? null : 'belt'; }
  return storageCapacity(st.floor) - boxesStored(st) <= 0 ? 'storage' : null;
}

// The reason a machine needs the owner, or null. Out-of-materials counts only when nothing is on order for the
// missing input (a delivery on its way will fix it), and broken machines have their own memo.
export function stallOf(st, o, belt = beltStock(st)) {
  if (!isProducer(o) || o.mode !== 'produce' || o.recipe == null || o.broken) return null;
  const block = outputBlock(st, o);
  if (block === 'belt') return { kind: 'blocked', short: 'output belt full', reason: 'output belt full', fix: 'nothing at the far end takes the boxes. Belt it on to a machine that uses them, or to a storage bin' };
  if (block === 'storage') return { kind: 'blocked', short: 'output storage full', reason: 'output storage full', fix: 'there is no room left to store the boxes. Paint more storage or sell some stock' };
  const lacking = starvedInputs(st, o, belt).filter(x => !onOrder(st, x.item));
  if (!lacking.length) return null;
  const names = lacking.map(x => ITEMS[x.item].name), buys = lacking.some(x => !x.made);
  const buyer = st.employees.some(e => hasRole(e, 'purchasing'));
  return {
    kind: 'starved', items: lacking.map(x => x.item), short: `out of ${list(names)}`,
    reason: `out of ${list(names)}, ${buys ? 'nothing on order' : 'and the machine that makes it has stopped'}`,
    fix: buys ? (buyer ? 'raise the stock target in Purchasing, or order some yourself' : `buy some or hire ${aOrAn(jobFor('purchasing').title)}`) : 'get that machine running, or buy some',
  };
}
export function stalledMachines(st) {
  if (!st.floor) return [];
  const belt = beltStock(st), out = [];
  for (const o of st.floor.objects) { const s = isProducer(o) ? stallOf(st, o, belt) : null; if (s) out.push({ obj: o, ...s }); }
  return out;
}

// A starved machine whose status says something else (no operator, plant closed, broken): the other problem
// leads, and this names what else is wrong, for "Also: out of ..." and the floor cursor.
const ACTIVE = /^(Running|Waiting for materials|Fetching materials|Carrying)/;
export function alsoLacking(st, o) {
  if (!isProducer(o) || o.mode !== 'produce' || o.recipe == null) return [];
  const s = o.broken ? 'Broken' : o.status || '';
  if (s === STATUS.starved || ACTIVE.test(s)) return [];
  return starvedInputs(st, o).map(x => ITEMS[x.item].name);
}
export const alsoText = names => `out of ${list(names)}`;

// The machine's state in words for the cursor reading: "broken", "out of materials: Zinc ingot"
export function statusPhrase(st, o) {
  if (!isProducer(o)) return null;
  const s = o.broken ? 'Broken' : o.status || 'Idle';
  if (s === STATUS.starved) { const n = starvedInputs(st, o).map(x => ITEMS[x.item].name); return `out of materials${n.length ? ': ' + list(n) : ''}`; }
  const also = alsoLacking(st, o);
  return s.toLowerCase() + (also.length ? `, also out of materials: ${list(also)}` : '');
}
