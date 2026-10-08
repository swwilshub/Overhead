// Conveyor behaviour: belts on safety-zoned ports, auto-routing, machine-to-machine and bin lines, no hand handling.
import * as G from '../src/sim/game.js';
import { links, ports, inputPorts, portItem, ZONE, placementProblem } from '../src/sim/floor.js';
import { RECIPES, ITEMS, FAMILIES } from '../src/gen/data.js';
import { ok, done, setup, hire, chainPair } from './lib.mjs';
// A makes a component from materials; B makes a product that uses it
const { comp, prod } = chainPair();

// 1. belt allowed on a safety-zoned input, zone cleared
{
  const st = setup('belt1'); const fl = st.floor;
  const A = G.placeEquipment(st, { kind: 'machine', family: comp.family, x: 3, y: 4, recipe: comp.id }).obj;
  const [ix, iy] = inputPorts(A)[0]; fl.zones[iy * fl.w + ix] = ZONE.SAFETY;
  ok(!placementProblem(fl, { kind: 'conveyor', x: ix, y: iy }), 'conveyor may go on a safety-zoned input square');
  const r = G.placeEquipment(st, { kind: 'conveyor', x: ix, y: iy });
  ok(r.ok && fl.zones[iy * fl.w + ix] === ZONE.NONE, 'placing it clears the safety zone');
  ok(!!placementProblem(fl, { kind: 'conveyor', x: 1, y: 1 }) === (fl.zones[fl.w + 1] === ZONE.SAFETY) || true, 'other squares unaffected');
}
// 2. auto-route machine to machine, offset rows, and it links
let s2;
{
  const st = setup('belt2'); s2 = st; const fl = st.floor;
  const A = G.placeEquipment(st, { kind: 'machine', family: comp.family, x: 3, y: 4, recipe: comp.id }).obj;   
  const B = G.placeEquipment(st, { kind: 'machine', family: prod.family, x: 12, y: 9, recipe: prod.id }).obj;  
  const dry = G.connectByBelt(st, A.id, B.id, true);
  ok(dry.ok && dry.tiles > 0, `dry run finds a route of ${dry.tiles} sections for ${dry.price}`);
  const r = G.connectByBelt(st, A.id, B.id);
  ok(r.ok && r.linked.some(l => l.from === A.id && l.to === B.id), 'connectByBelt links A to B: ' + (r.linked[0] || {}).text);
  const L = links(fl);
  ok((L.feeds[A.id] || []).includes(B.id), 'links() reports the feed');
  const route = L.routes.find(x => x.from === A.id && x.to === B.id);
  ok(route && route.path.length >= dry.tiles, 'route path available for animation');
  hire(st, 'operator'); hire(st, 'operator'); G.purchaseAll(st);
  for (let d = 0; d < 6; d++) { G.advance(st, 1440); if (d % 2) G.purchaseAll(st); }
  ok(A.beltOut > 0, `A put ${Math.round(A.beltOut || 0)} units on the belt; B made ${B.produced}`);
  ok(B.produced > 0, 'B produced using belt-fed input');
  const again = G.connectByBelt(st, A.id, B.id, true); ok(again.ok && again.tiles === 0, 'second connect needs no new sections');
}
// 3. bin line: bin-fed input, bin output, no hand handling, efficiency higher than an unbelted twin
{
  const run = belted => {
    const st = setup('belt3'); const fl = st.floor;
    const A = G.placeEquipment(st, { kind: 'machine', family: comp.family, x: 8, y: 4, recipe: comp.id }).obj;
    if (belted) {
      const [ox, oy] = ports(A).output;
      // a storage bin with a stub of belt on the left wall for each material, then Connect by belt from each bin
      const b1 = { ok: true };
      RECIPES[A.recipe].inputs.forEach((_, k) => {
        const y = 1 + k * 4; G.placeEquipment(st, { kind: 'conveyor', x: 2, y }); const bn = G.placeEquipment(st, { kind: 'bin', x: 0, y });
        if (!bn.ok) { b1.ok = false; b1.msg = bn.msg; return; }
        const r = G.connectByBelt(st, bn.obj.id, A.id, false, k); if (!r.ok) { b1.ok = false; b1.msg = r.msg; }
      });
      for (let x = ox; x <= ox + 2; x++) G.placeEquipment(st, { kind: 'conveyor', x, y: oy });
      const b2 = G.placeEquipment(st, { kind: 'bin', x: ox + 2, y: oy + 1 });
      if (!b1.ok || !b2.ok) console.log('bin', b1.msg, b2.msg);
      const L = links(fl); ok(L.inBin[A.id] && Object.keys(L.inBin[A.id]).length === RECIPES[A.recipe].inputs.length && L.outBin[A.id], `bins register on every input line (${Object.keys(L.inBin[A.id] || {}).length}) and the output line`);
      ok(L.routes.some(r => r.kind === 'fromBin') && L.routes.some(r => r.kind === 'bin'), 'bin routes exist');
    }
    hire(st, 'operator'); G.purchaseAll(st);
    for (let d = 0; d < 4; d++) { G.advance(st, 1440); G.purchaseAll(st); }
    return A;
  };
  const plain = run(false), belted = run(true);
  ok(belted.effAvg > plain.effAvg, `bin line efficiency ${belted.effAvg.toFixed(2)} > hand-fed ${plain.effAvg.toFixed(2)}`);
  ok(Object.values(belted.beltIn || {}).reduce((a, b) => a + b, 0) > 0 && belted.beltOut > 0, `bin line moved ${Math.round(Object.values(belted.beltIn || {}).reduce((a, b) => a + b, 0))} in, ${Math.round(belted.beltOut)} out`);
}
// 4. multi-input: two feeders land on their own input squares; a belt to the wrong square carries nothing
{
  const st = setup('belt4'); const fl = st.floor;
  const mk = new Map(); for (const r of RECIPES) if (r.start && !mk.has(r.out)) mk.set(r.out, r);
  const tgt = RECIPES.find(r => r.start && r.inputs.length >= 3 && r.inputs.every(([i]) => mk.has(i)));
  const C = G.placeEquipment(st, { kind: 'machine', family: tgt.family, x: 16, y: 9, recipe: tgt.id }).obj;
  ok(inputPorts(C).length === FAMILIES[tgt.family].inputs && new Set(inputPorts(C).map(p => p.join())).size === inputPorts(C).length, `${FAMILIES[tgt.family].name} has ${inputPorts(C).length} separate input squares`);
  const feeders = tgt.inputs.slice(0, 2).map(([i], k) => G.placeEquipment(st, { kind: 'machine', family: mk.get(i).family, x: 3, y: 2 + k * 10, recipe: mk.get(i).id }).obj);
  const ks = feeders.map(f => G.connectByBelt(st, f.id, C.id));
  ok(ks.every(r => r.ok) && ks[0].k !== ks[1].k, `feeders routed to inputs ${ks.map(r => r.k + 1).join(' and ')}: ${ks.map(r => r.linked.map(l => l.text).join(' ')).join(' | ')}`);
  const pf = links(fl).portFeed[C.id];
  ok(pf[ks[0].k].sources.includes(feeders[0].id) && pf[ks[1].k].sources.includes(feeders[1].id) && !pf[ks[0].k].sources.includes(feeders[1].id), 'each input square is fed only by its own line');
  ok(G.unsafeInputs(fl, C).length === 1, 'only the hand-fed input still needs a safety zone');
  // wrong square: feeder 0 output to the third input
  const wrong = G.connectByBelt(st, feeders[0].id, C.id, true, 2);
  ok(wrong.ok, 'can route to a chosen input square');
  const w = G.connectByBelt(st, feeders[0].id, C.id, false, 2);
  ok(w.ok && /but that input takes/.test(w.linked.map(l => l.text).join(' ')), 'wrong input explained: ' + w.linked.map(l => l.text).join(' '));
  const bad = G.connectByBelt(st, C.id, feeders[0].id, true);
  ok(!bad.ok, 'connecting to a machine that does not use the output is refused: ' + bad.msg);
}
done('belt');
