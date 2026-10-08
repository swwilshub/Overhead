// Office suites: per-desk productivity from touching furniture, crowding and noise, comfort, seating, morale, output.
import { analyseSuite, standardSuite, defaultSuiteHatches } from '../src/sim/suites.js';
import { itemProblem } from '../src/sim/cells.js';
import * as G from '../src/sim/game.js';
import { ok, done, setup, hire as hireIn } from './lib.mjs';
import { OFFICES } from '../src/gen/data.js';
const mk = (cw, ch) => { const d = { kind: 'suite', cw, ch, items: [] }; d.hatches = defaultSuiteHatches(d); return d; };
const put = (d, t, near = null) => { for (let y = 0; y < d.ch; y++) for (let x = 0; x < d.cw; x++) for (let r = 0; r < 4; r++) { const it = { t, x, y, rot: r }; if (itemProblem(d, it)) continue; const trial = { ...d, items: [...d.items, it] }; const a = analyseSuite(trial); if (!a.ok) continue; if (near && !near(trial, it)) continue; d.items.push(it); return it; } return null; };
{
  const d = mk(5, 4); d.items = standardSuite(d); const a0 = analyseSuite(d);
  ok(a0.ok && a0.seats === 1 && a0.deskBonus[0] === 0, 'standard suite: one desk, basic productivity');
  const touchDesk = (trial, it) => analyseSuite(trial).deskBonus[0] > analyseSuite({ ...trial, items: trial.items.filter(x => x !== it) }).deskBonus[0];
  put(d, 'opc', touchDesk); put(d, 'ostore', touchDesk); put(d, 'ofile', touchDesk);
  // a fully kitted desk matches the best plain office that has the same three items
  const kitted = OFFICES.find(o => ['pc', 'files', 'cabinet'].every(k => o.kit.includes(k)) && o.kit.length === 3).bonus;
  ok(Math.abs(analyseSuite(d).deskBonus[0] - kitted) < 1e-9, `computer + storage + filing touching the desk = +${Math.round(kitted * 100)}% (${analyseSuite(d).deskBonus[0]})`);
  const c0 = analyseSuite(d).comfort; put(d, 'oplant'); put(d, 'ocoffee');
  ok(analyseSuite(d).comfort > c0, `comfort rises with a plant and coffee (${c0} -> ${analyseSuite(d).comfort})`);
}
{
  // open plan: four desks in a small room are crowded and noisy; partitions win some back
  const d = mk(6, 5); d.items = standardSuite(d);
  for (let i = 0; i < 3; i++) put(d, 'odesk');
  const a = analyseSuite(d); ok(a.seats === 4 && a.avg < 0, `four desks in 30 squares: average ${Math.round(a.avg * 100)}% (crowded and noisy)`);
  put(d, 'opart'); put(d, 'opart');
  ok(analyseSuite(d).avg > a.avg, `partitions cut the noise: ${Math.round(analyseSuite(d).avg * 100)}%`);
}
{
  const st = setup('suite'); st.bank.checking += 1e6;
  const d = { kind: 'suite', x: 4, y: 3, cw: 7, ch: 5, items: [] }; d.hatches = defaultSuiteHatches(d); d.items = standardSuite(d); put(d, 'odesk');
  const r = G.buildCell(st, d); ok(r.ok, 'suite built for ' + r.price);
  const white = ['sales', 'purchasing', 'marketing'].map(role => hireIn(st, role));
  ok(white.filter(e => e.assign === r.obj.id).length === 2, `new office hires take the free desks (${white.map(e => e.assign).join(', ')})`);
  const third = white.find(e => e.assign !== r.obj.id); G.assign(st, third.id, null);
  const full = G.assign(st, third.id, r.obj.id); ok(!full.ok && /taken/.test(full.msg), 'a full suite refuses another person: ' + full.msg);
  const shrink = G.editCell(st, r.obj.id, r.obj.items.filter((it, i) => !(it.t === 'odesk' && i > 0)).slice(0, 1), r.obj.hatches);
  ok(!shrink.ok && /Move someone out/.test(shrink.msg), 'cannot remove desks people sit at: ' + shrink.msg);
  G.advance(st, 1440 * 2);
  ok(st.employees.every(e => e.assign !== r.obj.id || e.morale > 0), 'occupants work a couple of days without errors');
  const mv = G.planMove(st, st.city.lots.filter(l => l.firm == null && l.id !== st.lotId)[0].id);
  ok(mv.moved.includes(r.obj.id) || mv.dropped.includes(r.obj.id), 'suites are part of a relocation plan');
}
done('suite');
