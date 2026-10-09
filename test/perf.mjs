// Performance budget for the simulation: one sim tick (G.advance by 5 game minutes in working hours) must average
// under 4 ms, on the largest building with 40 staffed machines, belts between machines that feed each other, and stock.
//   node test/perf.mjs
import * as G from '../src/sim/game.js';
import { RECIPES, ITEMS } from '../src/gen/data.js';
import { KINDS, inputPorts, ZONE } from '../src/sim/floor.js';
import { minuteOfDay, isWorkday } from '../src/core/util.js';
import { ok, done, setup, hire } from './lib.mjs';

export const BUDGET_TICK_MS = 4;
export function bigPlant(seed = 'perf') {
  const st = setup(seed); st.bank.checking += 2e7;
  const fl = st.floor, starters = RECIPES.filter(r => r.start), machines = [];
  for (let y = 2; y + 5 < fl.h - 6 && machines.length < KINDS.machine.max; y += 5)
    for (let x = 2; x + 7 < fl.w && machines.length < KINDS.machine.max; x += 7) {
      const r = starters[machines.length % starters.length];
      const res = G.placeEquipment(st, { kind: 'machine', family: r.family, x, y, rot: 0, recipe: r.id });
      if (!res.ok) continue;
      for (const [ix, iy] of inputPorts(res.obj)) if (!fl.zones[iy * fl.w + ix]) fl.zones[iy * fl.w + ix] = ZONE.SAFETY;
      machines.push(res.obj);
    }
  // belts between neighbours where one feeds the other
  for (const a of machines) for (const b of machines) if (a !== b && G.inputFor(a, b) != null && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 14) G.connectByBelt(st, a.id, b.id);
  for (const m of machines) { const e = hire(st, 'operator'); if (e) G.assign(st, e.id, m.id); }
  for (let i = 0; i < 4; i++) G.placeEquipment(st, { kind: 'handcart', x: 1, y: 1 + i });
  G.purchaseAll(st); for (const o of st.orders) o.eta = st.time;
  return { st, machines };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { st, machines } = bigPlant();
  ok(machines.length === KINDS.machine.max, `${machines.length} machines on a ${st.floor.w} × ${st.floor.h} floor, ${Object.keys(st.lanes || {}).length || 'some'} belt lanes, ${st.employees.length} staff`);
  // warm up for two days, then time every tick of a full working day
  G.advance(st, 2 * 1440);
  while (!(isWorkday(st.time) && minuteOfDay(st.time) === 8 * 60)) G.advance(st, 5);
  const times = []; let running = 0;
  for (let i = 0; i < 9 * 12; i++) { const t0 = performance.now(); G.advance(st, 5); times.push(performance.now() - t0); running = Math.max(running, machines.filter(o => o.status === 'Running').length); }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length, p95 = times[Math.floor(times.length * 0.95)];
  ok(running > 10, `up to ${running} machines running at once during the measured day`);
  ok(mean < BUDGET_TICK_MS, `sim tick averages ${mean.toFixed(2)} ms (p95 ${p95.toFixed(2)} ms, budget ${BUDGET_TICK_MS} ms)`);
  done('performance');
}
