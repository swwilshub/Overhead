// Stalled machines: one honest status per machine, a throttled notice when one stops, and the cursor reading its state.
import fs from 'fs';
import * as G from '../src/sim/game.js';
import { inputPorts, describeTile, objectLabel, ZONE } from '../src/sim/floor.js';
import { stalledMachines, starvedInputs } from '../src/sim/stalls.js';
import { RECIPES, ITEMS } from '../src/gen/data.js';
import { ok, done, setup, hire, isMaterial, chainPair } from './lib.mjs';
import { WORK_START } from '../src/sim/people.js';
import { minuteOfDay } from '../src/core/util.js';

const start = RECIPES.find(r => r.start && r.inputs.every(([i]) => isMaterial(i)));
const stallMemos = st => st.memos.filter(m => /^(Machine stopped|\d+ machines stopped)/.test(m.subject));
const toShiftStart = st => { let n = 0; while (minuteOfDay(st.time) !== WORK_START && n++ < 2000) G.advance(st, 5); };
function machine(st, x, y, recipe = start) {
  const o = G.placeEquipment(st, { kind: 'machine', family: recipe.family, x, y, rot: 0, recipe: recipe.id }).obj;
  for (const [ix, iy] of inputPorts(o)) st.floor.zones[iy * st.floor.w + ix] = ZONE.SAFETY;
  return o;
}

{
  // status is honest without running the clock
  const st = setup('stall1'); const o = machine(st, 4, 3);
  G.refreshStatus(st, o);
  ok(o.status === 'No operator', `a machine nobody is assigned to reads "No operator" (${o.status})`);
  const e = hire(st, 'operator'); G.assign(st, e.id, o.id);
  ok(o.status !== 'No operator', `assigning an operator changes the status at once, with no clock (${o.status})`);
  G.assign(st, e.id, null);
  ok(o.status === 'No operator', `taking them off changes it back at once (${o.status})`);
}
{
  // starved, with nothing ordered: "Out of materials", an alert, and one notice after 30 shift minutes
  const st = setup('stall2'); const o = machine(st, 4, 3); const e = hire(st, 'operator'); G.assign(st, e.id, o.id);
  toShiftStart(st);
  const before = stallMemos(st).length;
  G.advance(st, 20);
  ok(o.status === 'Out of materials', `no materials anywhere: "Out of materials" (${o.status})`);
  ok(stalledMachines(st).length === 1 && stalledMachines(st)[0].kind === 'starved', 'the machine is listed as starved');
  ok(stallMemos(st).length === before, 'no notice before 30 shift minutes');
  G.advance(st, 20);
  const memos = stallMemos(st);
  ok(memos.length === before + 1, `one notice after 30 shift minutes (${memos.length - before})`);
  const m = memos[memos.length - 1];
  ok(m.from === 'Plant log' && m.subject === `Machine stopped: ${objectLabel(st, o)}`, `from the plant log, naming the machine: "${m.subject}"`);
  ok(/out of/.test(m.body) && /nothing on order/.test(m.body) && /Junior Buyer/.test(m.body), `the body gives the reason and the fix: ${m.body}`);
  ok(m.important === true, 'urgent when no machine is running');
  for (let d = 0; d < 3; d++) G.advance(st, 1440);
  ok(stallMemos(st).length === before + 1, `no second notice while it stays stalled for three more days (${stallMemos(st).length - before})`);
  // the cursor reads the state
  const tile = describeTile(st, o.x + 1, o.y + 1);
  ok(/out of materials: /i.test(tile) && tile.includes(ITEMS[start.inputs[0][0]].name), `the cursor reads the state: "${tile}"`);
  // buying fixes it: the stall ends when the machine makes a unit, and a later stall is noticed again after a day
  G.purchaseAll(st); for (const x of st.orders) x.eta = st.time;
  for (let i = 0; i < 288; i++) G.advance(st, 5);
  ok(o.produced > 0, `with materials delivered it makes units (${o.produced})`);
  ok(!stalledMachines(st).length, 'and leaves the list');
  st.inventory = {}; o.inBuf = {}; st.orders.length = 0;
  for (let d = 0; d < 3; d++) G.advance(st, 1440);
  ok(stallMemos(st).length === before + 2, `starving again gets a new notice (${stallMemos(st).length - before} in all)`);
}
{
  // stock that exists but has not arrived is "Waiting", never an alert; stock on order stops the alert
  const st = setup('stall3'); const o = machine(st, 4, 3); const e = hire(st, 'operator'); G.assign(st, e.id, o.id);
  toShiftStart(st);
  G.purchaseAll(st); for (const x of st.orders) x.eta = st.time + 60 * 24 * 5; // on order, far off
  G.advance(st, 60);
  ok(!stalledMachines(st).length, 'materials on order: not an alert');
  for (const x of st.orders) x.eta = st.time; G.advance(st, 10);
  const first = o.status;
  ok(first === 'Waiting for materials' || first === 'Running' || /Fetching|Carrying/.test(first), `stock in storage that is on its way is not "Out of materials" (${first})`);
}
{
  // three machines starving in the same hour give one memo; the memo is not urgent when another machine runs
  const st = setup('stall4'); const os = [machine(st, 4, 3), machine(st, 4, 9), machine(st, 4, 15)];
  for (const o of os) G.assign(st, hire(st, 'operator').id, o.id);
  toShiftStart(st);
  const before = stallMemos(st).length;
  G.advance(st, 45);
  const memos = stallMemos(st).slice(before);
  ok(memos.length === 1 && memos[0].subject === '3 machines stopped', `three machines in one hour share one memo: ${memos.map(m => m.subject)}`);
  ok(os.every(o => memos[0].body.includes(objectLabel(st, o))), 'it names every machine');
}
{
  // at most three notices a game day, the rest go out the next morning
  const st = setup('stall5'); const os = [];
  for (let k = 0; k < 5; k++) os.push(machine(st, 4, 3 + k * 5));
  toShiftStart(st);
  const before = stallMemos(st).length;
  for (const o of os) { G.assign(st, hire(st, 'operator').id, o.id); G.advance(st, 90); } // one machine every 90 minutes
  const day1 = stallMemos(st).length - before;
  ok(day1 === 3, `five machines stall in one day but only three notices go out (${day1})`);
  for (let i = 0; i < 2; i++) G.advance(st, 1440);
  const named = new Set(); for (const m of stallMemos(st)) for (const o of os) if ((m.subject + m.body).includes(objectLabel(st, o))) named.add(o.id);
  ok(named.size === 5, `the held-back ones are noticed later (${named.size} of 5 named)`);
}
{
  // a running machine means the memo is not urgent
  const st = setup('stall6'); const a = machine(st, 4, 3), b = machine(st, 4, 9, RECIPES.find(r => r.start && r.family !== start.family && r.inputs.every(([i]) => isMaterial(i))) || start);
  G.assign(st, hire(st, 'operator').id, a.id); G.assign(st, hire(st, 'operator').id, b.id);
  toShiftStart(st);
  G.purchaseAll(st); for (const x of st.orders) x.eta = st.time;
  // a only: take b's materials away so it starves while a (if it shares nothing with it) keeps going
  const bIn = new Set(RECIPES[b.recipe].inputs.map(([i]) => i)), aIn = new Set(RECIPES[a.recipe].inputs.map(([i]) => i));
  if ([...bIn].some(i => !aIn.has(i))) {
    for (const i of bIn) if (!aIn.has(i)) { delete st.inventory[i]; st.orders = st.orders.filter(x => x.item !== i); }
    const before = stallMemos(st).length;
    G.advance(st, 60);
    const m = stallMemos(st).slice(before)[0];
    ok(m && m.important === false, `not urgent while another machine is running (${m && m.important})`);
  } else ok(true, 'the two lines share every input, so this check does not apply');
}
{
  // a dead-end belt blocks the producer: "Output blocked" and a notice
  const { comp, prod } = chainPair();
  const st = setup('stall7'); st.bank.checking += 1e6;
  const A = machine(st, 6, 3, comp);
  const B = G.placeEquipment(st, { kind: 'machine', family: prod.family, x: 16, y: 8, recipe: prod.id }).obj;
  G.connectByBelt(st, A.id, B.id);
  G.assign(st, hire(st, 'operator').id, A.id);
  toShiftStart(st); G.purchaseAll(st); for (const x of st.orders) x.eta = st.time;
  const before = stallMemos(st).length;
  for (let i = 0; i < 288 * 4; i++) G.advance(st, 5);
  toShiftStart(st); G.advance(st, 60); // judge it during working hours: at night every staffed machine reads "Plant closed"
  ok(/Output blocked/.test(A.status), `nothing takes the boxes: "${A.status}"`);
  const s = stalledMachines(st).find(x => x.obj.id === A.id);
  ok(s && s.kind === 'blocked', 'the blocked machine is listed');
  const memos = stallMemos(st).slice(before);
  ok(memos.some(m => /output belt full/.test(m.body)), 'and a notice says its output belt is full');
}
{
  // a broken machine reads "broken" under the cursor
  const st = setup('stall8'); const o = machine(st, 4, 3); G.assign(st, hire(st, 'operator').id, o.id);
  o.broken = true; o.repair = 0; G.refreshStatus(st, o);
  ok(/broken/i.test(describeTile(st, o.x + 1, o.y + 1)), `a broken machine reads "broken": "${describeTile(st, o.x + 1, o.y + 1)}"`);
}
{
  // an old save gets the current status words
  const st = JSON.parse(fs.readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8'));
  for (const o of st.floor?.objects || []) if (o.kind === 'machine' || o.kind === 'cell') o.status = o.operator == null ? 'Input empty' : 'Shift over';
  G.migrate(st);
  const words = (st.floor?.objects || []).filter(o => o.kind === 'machine' || o.kind === 'cell').map(o => o.status);
  ok(words.length > 0 && words.every(w => w !== 'Input empty' && w !== 'Shift over'), `old status words give way on load: ${[...new Set(words)]}`);
}
done('stall');
