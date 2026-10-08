// Material flow: every unit is somewhere (storage, tray, belt, input stock, carried), belts clog when nothing takes
// the boxes, and hand-carried goods only reach storage when someone walks them there.
import * as G from '../src/sim/game.js';
import { inputPorts, ports, ZONE } from '../src/sim/floor.js';
import { RECIPES, ITEMS } from '../src/gen/data.js';
import { ok, done, setup as baseSetup, hire, chainPair } from './lib.mjs';
const setup = seed => { const st = baseSetup(seed); st.bank.checking += 1e6; return st; };
// A makes a component from materials; B makes a product that uses it
const { comp, prod } = chainPair();
const where = (st, item) => {
  const lanes = Object.values(st.lanes || {}).reduce((a, l) => a + l.boxes.filter(b => b.item === item).reduce((x, b) => x + b.units, 0), 0);
  let trays = 0, bufs = 0, carried = 0;
  for (const o of st.floor.objects) { if (o.recipe != null && RECIPES[o.recipe].out === item) trays += o.tray || 0; bufs += o.inBuf?.[item] || 0; if (o.trip?.out?.item === item) carried += o.trip.out.units; for (const x of o.trip?.in || []) if (x.item === item) carried += x.units; }
  return { store: st.inventory[item] || 0, lanes, trays, bufs, carried };
};
const consumedBy = (st, item) => st.floor.objects.filter(o => o.recipe != null && RECIPES[o.recipe].inputs.some(([i]) => i === item)).reduce((a, o) => a + o.produced * RECIPES[o.recipe].inputs.find(([i]) => i === item)[1] / RECIPES[o.recipe].outQty, 0);
{
  // A belts its component into B, which is staffed. Count every unit A makes.
  const st = setup('flow1');
  const A = G.placeEquipment(st, { kind: 'machine', family: comp.family, x: 6, y: 3, recipe: comp.id }).obj;
  const B = G.placeEquipment(st, { kind: 'machine', family: prod.family, x: 16, y: 8, recipe: prod.id }).obj;
  for (const o of [A, B]) for (const [x, y] of inputPorts(o)) st.floor.zones[y * st.floor.w + x] = ZONE.SAFETY;
  G.connectByBelt(st, A.id, B.id);
  G.assign(st, hire(st, 'operator').id, A.id); G.assign(st, hire(st, 'operator').id, B.id);
  const item = comp.out; const before = st.inventory[item] || 0;
  G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
  let maxOnBelt = 0;
  for (let i = 0; i < 288 * 3; i++) { G.advance(st, 5); maxOnBelt = Math.max(maxOnBelt, where(st, item).lanes); }
  const w = where(st, item), total = w.store - before + w.lanes + w.trays + w.bufs + w.carried + consumedBy(st, item);
  ok(Math.abs(total - A.produced) < 1e-6, `every ${ITEMS[item].name} accounted for: made ${A.produced}, storage +${w.store - before}, belt ${w.lanes}, tray ${w.trays}, at B ${w.bufs.toFixed(1)}, carried ${w.carried}, used ${consumedBy(st, item).toFixed(0)}`);
  ok(maxOnBelt > 0 && maxOnBelt % ITEMS[item].pack === 0, `boxes on the belt are whole boxes of ${ITEMS[item].pack} (peak ${maxOnBelt} units)`);
}
{
  // B has no operator: the belt fills, then A's tray fills and A stops
  const st = setup('flow2');
  const A = G.placeEquipment(st, { kind: 'machine', family: comp.family, x: 6, y: 3, recipe: comp.id }).obj;
  const B = G.placeEquipment(st, { kind: 'machine', family: prod.family, x: 16, y: 8, recipe: prod.id }).obj;
  for (const [x, y] of inputPorts(A)) st.floor.zones[y * st.floor.w + x] = ZONE.SAFETY;
  const c = G.connectByBelt(st, A.id, B.id);
  G.assign(st, hire(st, 'operator').id, A.id);
  G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
  const statuses = new Set(); let laneLen = 0;
  for (let i = 0; i < 288 * 3; i++) { G.advance(st, 5); statuses.add(A.status); }
  const ln = Object.values(st.lanes).find(l => l.from === A.id); laneLen = ln.len;
  const cap = Math.floor(ln.len / 0.8) + 1;
  ok(ln.boxes.length >= cap - 1, `belt clogged: ${ln.boxes.length} boxes on a ${ln.len}-square belt (room for about ${cap})`);
  ok(ln.boxes.every(b => !b.moving), 'clogged boxes have stopped moving');
  ok([...statuses].some(s => /belt full/.test(s)), `A reports a full belt: ${[...statuses].join(', ')}`);
  const made = A.produced; G.advance(st, 600);
  ok(A.produced === made, 'A makes nothing more while the belt is clogged');
  // staff B: the jam clears
  G.assign(st, hire(st, 'operator').id, B.id); G.purchaseAll(st); for (const o of st.orders) o.eta = st.time; for (let i = 0; i < 288 * 4; i++) G.advance(st, 5);
  ok(A.produced > made && B.produced > 0, `after staffing B the line runs again (A ${A.produced}, B ${B.produced})`);
}
{
  // a belt to nowhere fills up and stops the machine
  const st = setup('flow3');
  const A = G.placeEquipment(st, { kind: 'machine', family: comp.family, x: 6, y: 3, recipe: comp.id }).obj;
  for (const [x, y] of inputPorts(A)) st.floor.zones[y * st.floor.w + x] = ZONE.SAFETY;
  const [ox, oy] = ports(A).output; for (let x = ox; x < ox + 4; x++) G.placeEquipment(st, { kind: 'conveyor', x, y: oy });
  G.assign(st, hire(st, 'operator').id, A.id); G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
  for (let i = 0; i < 288 * 2; i++) G.advance(st, 5);
  const ln = Object.values(st.lanes).find(l => l.from === A.id);
  ok(ln && ln.kind === 'end' && ln.boxes.length >= 4, `dead-end belt piles up (${ln?.boxes.length} boxes) and A says "${A.status}"`);
}
{
  // no belt: goods reach storage only when carried; the operator spends time walking
  const st = setup('flow4');
  const A = G.placeEquipment(st, { kind: 'machine', family: 0, x: 14, y: 3, recipe: RECIPES.find(r => r.family === 0 && r.start).id }).obj;
  for (const [x, y] of inputPorts(A)) st.floor.zones[y * st.floor.w + x] = ZONE.SAFETY;
  G.assign(st, hire(st, 'operator').id, A.id); G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
  const item = RECIPES[A.recipe].out, seen = new Set(); let trips = 0, lastTrip = null; st.sell[item] = false;
  for (let i = 0; i < 288 * 2; i++) { G.advance(st, 5); seen.add(A.status); if (A.trip && A.trip !== lastTrip) { trips++; lastTrip = A.trip; } }
  const w = where(st, item);
  ok(trips > 3 && [...seen].some(s => /Carrying|Fetching/.test(s)), `operator made ${trips} trips (${[...seen].join(', ')})`);
  ok(Math.abs(w.store + w.trays + w.carried - A.produced) < 1e-6, `made ${A.produced}: ${w.store} in storage, ${w.trays} on the tray, ${w.carried} being carried`);
}
done('flow');
