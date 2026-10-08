// Cell model: standard layout, metrics, duplicates, walking, extras, research gating.
import { analyse, standardLayout, defaultHatches, itemProblem, workSquare, itemDef, CELL_ITEMS, cellPrice } from '../src/sim/cells.js';
import { FAMILIES, RECIPES, ITEMS } from '../src/gen/data.js';
import { ok, done, setup, hire, isMaterial } from './lib.mjs';
const mk = (fam, cw, ch) => { const c = { family: fam, cw, ch, items: [] }; c.hatches = defaultHatches(c); return c; };
for (let fam = 0; fam < FAMILIES.length; fam++) {
  const c = mk(fam, 6, 5); const items = standardLayout(c); c.items = items || [];
  const a = analyse(c, { operators: 1 });
  console.log(FAMILIES[fam].key, 'D', a.D.toFixed(1), 'speed', a.speedMult.toFixed(2), 'limit', a.limit, a.problems.join(' '));
  ok(items && a.ok && a.speedMult > 0.85 && a.speedMult < 1.25, `${FAMILIES[fam].name}: standard layout runs at ${a.speedMult.toFixed(2)}× a machine`);
}
// a line whose station A is a big 2 × 2 machine, so walking and staffing matter
const DF = FAMILIES.findIndex(f => f.cell.A[1] * f.cell.A[2] >= 4 && f.cell.extras[0].fx.quality && f.cell.extras[0].near === 'A');
const c = mk(DF, 8, 6); c.items = standardLayout(c);
const one = analyse(c, { operators: 1 }), two = analyse(c, { operators: 2 });
ok(Math.abs(two.speedMult - one.speedMult) < 0.01, `standard layout: second operator adds nothing (${one.speedMult.toFixed(2)} -> ${two.speedMult.toFixed(2)}, limit ${two.limit})`);
// duplicate both stations
const dup = { ...c, items: [...c.items] };
for (const t of [`f${DF}a`, `f${DF}b`]) { let placed = false; for (let y = 0; y < dup.ch && !placed; y++) for (let x = 0; x < dup.cw && !placed; x++) for (let r = 0; r < 4 && !placed; r++) { const it = { t, x, y, rot: r }; if (!itemProblem(dup, it)) { dup.items.push(it); placed = true; } } }
const d1 = analyse(dup, { operators: 1 }), d2 = analyse(dup, { operators: 2 });
ok(d1.speedMult > one.speedMult * 1.2, `duplicate stations, same operator: ${d1.speedMult.toFixed(2)} (limit ${d1.limit})`);
ok(d2.speedMult > d1.speedMult * 1.15, `duplicate stations, two operators: ${d2.speedMult.toFixed(2)} (limit ${d2.limit})`);
// spread-out layout walks more
const far = mk(DF, 14, 10); far.items = [{ t: `f${DF}a`, x: 11, y: 6, rot: 0 }, { t: `f${DF}b`, x: 1, y: 1, rot: 0 }, { t: 'rack', x: 6, y: 0, rot: 0 }];
const fa = analyse(far, { operators: 1 }); ok(fa.ok && fa.D > one.D + 10 && fa.speedMult < one.speedMult, `sprawling layout walks ${fa.D.toFixed(0)} squares and runs at ${fa.speedMult.toFixed(2)}`);
// extras: the line's basic extra works best beside station A
const withX = (it) => analyse({ ...c, items: [...c.items, it] }).metrics.quality;
const press = c.items.find(i => i.t === `f${DF}a`);
let near = null, away = null;
for (let y = 0; y < c.ch; y++) for (let x = 0; x < c.cw; x++) { const it = { t: `f${DF}x0`, x, y, rot: 0 }; if (itemProblem(c, it)) continue; const q = withX(it); if (near == null || q > near) near = q; if (away == null || q < away) away = q; }
ok(near > away, `${CELL_ITEMS[`f${DF}x0`].name}: quality ${near} beside station A, ${away} away from it`);
ok(cellPrice(0, 6, 5) > 50000, 'cell price includes the minimum items: ' + cellPrice(0, 6, 5));
ok(Object.values(CELL_ITEMS).filter(d => d.tech).length >= 14, 'researchable extras: ' + Object.values(CELL_ITEMS).filter(d => d.tech).length);
// ---- in the game: build a cell, staff it, run it beside a machine making the same product
import * as Gm from '../src/sim/game.js';
import { links, inputPorts, ZONE, describeTile } from '../src/sim/floor.js';
{
  const st = setup('cell'); st.bank.checking += 1e6;
  // a three-input line with a starting product made only from bought materials
  const R = RECIPES.find(r => r.start && FAMILIES[r.family].inputs === 3 && r.inputs.length === 3 && r.inputs.every(([i]) => isMaterial(i)));
  const M = Gm.placeEquipment(st, { kind: 'machine', family: R.family, x: 3, y: 3, recipe: R.id }).obj;
  for (const [x, y] of inputPorts(M)) st.floor.zones[y * st.floor.w + x] = ZONE.SAFETY;
  const draft = { family: R.family, x: 12, y: 3, cw: 7, ch: 5, items: [], recipe: R.id }; draft.hatches = defaultHatches(draft); draft.items = standardLayout(draft);
  const r = Gm.buildCell(st, draft); ok(r.ok, 'cell built: ' + (r.msg || Gm.cellPrice?.name || r.price));
  const C = r.obj;
  ok(describeTile(st, C.x + 1, C.y + 1).includes('cell'), 'cursor describes cell squares: ' + describeTile(st, C.x + 1, C.y + 1));
  ok(inputPorts(C).length === 3, 'cell has 3 input hatches as ports');
  // staff: 1 operator each
  const ops = [hire(st, 'operator'), hire(st, 'operator')];
  Gm.assign(st, ops[0].id, M.id); Gm.assign(st, ops[1].id, C.id);
  ok(C.operators.length === 1, 'cell crew of 1');
  Gm.purchaseAll(st);
  for (let d = 0; d < 5; d++) { Gm.advance(st, 1440); Gm.purchaseAll(st); }
  ok(C.produced > 0 && C.produced > M.produced * 0.7, `cell made ${C.produced}, machine made ${M.produced}`);
  // edit: add extras and pay for them
  const before = st.bank.checking;
  const items = [...C.items]; for (const t of ['spares', 'fan']) { let done = false; for (let y = 0; y < C.ch && !done; y++) for (let x = 0; x < C.cw && !done; x++) { const it = { t, x, y, rot: 0 }; if (!itemProblem({ ...C, items }, it) && analyse({ ...C, items: [...items, it] }).ok) { items.push(it); done = true; } } }
  const e = Gm.editCell(st, C.id, items, C.hatches); ok(e.ok && e.delta === 3000, 'refit pays for extras: ' + e.msg);
  ok(Gm.cellAnalysis(C, 1).metrics.uptime > 60, 'uptime up with a spares cabinet: ' + Gm.cellAnalysis(C, 1).metrics.uptime);
  // research gating
  const bad = Gm.editCell(st, C.id, [...C.items, { t: 'plc', x: 0, y: 0, rot: 0 }], C.hatches); ok(!bad.ok && /research/.test(bad.msg), 'PLC needs research: ' + bad.msg);
  hire(st, 'researcher'); const t = Gm.startTech(st, 'automation'); ok(t.ok, t.msg);
  for (let d = 0; d < 30 && st.cellTech.active; d++) Gm.advance(st, 1440);
  ok(st.cellTech.done.automation, 'automation researched');
  // a belt into a cell hatch links like a machine input
  const link = Gm.connectByBelt(st, M.id, C.id, true);
  ok(link.ok || /doesn't use/.test(link.msg), 'belt routing to a cell works: ' + (link.msg || link.tiles + ' sections'));
}
done('cell model');
