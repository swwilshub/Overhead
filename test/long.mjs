// 24-month headless playthrough of a reasonable player, checked against the balance bands in docs/design/balance.md.
//   node test/long.mjs                      three seeds in the test city, checks the bands
//   node test/long.mjs SEED CITY DIFFICULTY  one run, printed month by month
// The player starts with one machine on the best-looking line made from bought materials, then grows when cash allows:
// further lines picked from the market (belted to the machines that feed them), more staff, a mechanic, a buyer, offices.
import * as G from '../src/sim/game.js';
import { ITEMS, RECIPES, CITIES, ECONOMY, ITEM_ID, FAMILY_ID, FAMILIES } from '../src/gen/data.js';
import { inputPorts, ZONE, KINDS } from '../src/sim/floor.js';
import { vendorsFor, lineOutlook } from '../src/sim/world.js';
import { marketSalary } from '../src/sim/people.js';
import { JOBS } from '../src/core/content.js';
import { money, fmtDate, monthKey } from '../src/core/util.js';
import { ok, done, hire, cityId, isMaterial, job } from './lib.mjs';
import { BANDS } from './balance.mjs';

const [, , seedArg, cityArg, diffArg] = process.argv;
const verbose = !!seedArg;
if (process.env.NOLEARN) { ECONOMY.seniority.xpToSenior = ECONOMY.seniority.xpToDirector = 1e9; } // measurement aid: the same plant with nobody learning

// What a reasonable player builds: the line that looks most profitable in this city's market right now, among
// products we can source (materials, components sold in town, or things we already make). A new line has to pay
// for its machine within about a year at a modest efficiency.
const makes = new Set();
const lineScore = (st, r) => lineOutlook(st, r.id);
const sourceable = (st, r) => r.inputs.every(([i]) => isMaterial(i) || makes.has(i) || vendorsFor(st, i).length);
function nextLine(st, first = false) {
  const options = RECIPES.filter(r => r.start && !makes.has(r.out) && (first ? r.inputs.every(([i]) => isMaterial(i)) : sourceable(st, r)))
    .map(r => ({ r, profit: lineScore(st, r) })).filter(x => x.profit * 12 > FAMILIES[x.r.family].price);
  return options.sort((a, b) => b.profit / FAMILIES[b.r.family].price - a.profit / FAMILIES[a.r.family].price)[0]?.r;
}

function run(seed, cityName, difficulty) {
  const st = G.newGame({ company: 'Long Co', seed, difficulty });
  G.visitCity(st, cityId(cityName));
  const lot = st.city.lots.filter(l => l.firm == null).sort((a, b) => Math.abs(a.sqft - 36000) - Math.abs(b.sqft - 36000))[0];
  G.rentBuilding(st, lot.id);
  const start = st.bank.checking;
  // machine spots on a grid, clear of the offices along the bottom and the fixed rooms
  const slots = fl => { const out = []; for (let y = 3; y + 4 < fl.h - 10; y += 6) for (let x = 2; x + 7 < fl.w - 1; x += 9) out.push([x, y]); return out; };
  let full = false;
  const machines = [];
  const addMachine = recipe => {
    const fl = st.floor;
    for (const [x, y] of slots(fl)) {
      const r = G.placeEquipment(st, { kind: 'machine', family: recipe.family, x, y, rot: 0, recipe: recipe.id });
      if (!r.ok) continue;
      for (const [ix, iy] of inputPorts(r.obj)) fl.zones[iy * fl.w + ix] = ZONE.SAFETY;
      machines.push(r.obj); makes.add(recipe.out);
      // belt any machine that feeds this one, or that this one feeds
      for (const o of machines) if (o !== r.obj) { G.connectByBelt(st, o.id, r.obj.id); G.connectByBelt(st, r.obj.id, o.id); }
      return r.obj;
    }
    full = true;
    return null;
  };
  let offices = 0;
  const addOffice = () => { const fl = st.floor; for (let x = 10; x < fl.w - 4; x += 4) if (G.placeEquipment(st, { kind: 'office', officeType: offices % 2 ? 2 : 0, x, y: fl.h - 5 }).ok) { offices++; return true; } return false; };
  makes.clear(); const starter = nextLine(st, true); addMachine(starter);
  addOffice(); addOffice();
  G.placeEquipment(st, { kind: 'handcart', x: 1, y: 1 });
  hire(st, 'operator', 1.03); hire(st, 'sales', 1.03); hire(st, 'finance', 1.03);
  G.purchaseAll(st);
  const checkNaN = (o, path = '') => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('NaN at ' + path + k); if (v && typeof v === 'object') checkNaN(v, path + k + '.'); } };
  let lastM = monthKey(st.time), grew = 0, overLimit = 0, stallMax = 0, stallTotal = 0;
  const months = [];
  // seniority: who is on which rung, and when each rung is first reached
  const rung = new Map(), firstJob = new Map();
  const climb = { total: 0, perDayMax: 0, firstSenior: null, firstDirector: null };
  const watchClimb = day => {
    let today = 0;
    for (const e of st.employees) {
      const lv = JOBS[e.job].level;
      if (!firstJob.has(e.id)) firstJob.set(e.id, e.job);
      const was = rung.get(e.id) ?? lv;
      if (lv > was) { today++; if (lv === 2 && climb.firstSenior == null) climb.firstSenior = day; if (lv === 3 && climb.firstDirector == null) climb.firstDirector = day; }
      rung.set(e.id, lv);
    }
    climb.total += today; climb.perDayMax = Math.max(climb.perDayMax, today);
  };
  for (let d = 0; d < 731 && !st.over; d++) {
    G.advance(st, 1440);
    watchClimb(d + 1);
    if (d % 7 === 4) G.purchaseAll(st);
    let stallToday = 0; // "Machine stopped" notices that arrived today (the plant may send at most three a day)
    for (const m of st.memos) if (!m.seen) { m.seen = 1; if (/^(Machine stopped|\d+ machines stopped)/.test(m.subject)) stallToday++; if (m.kind === 'raise' && !m.data.done) G.answerRaise(st, m.id, true); }
    stallMax = Math.max(stallMax, stallToday); stallTotal += stallToday;
    if (st.strike && d % 5 === 0) G.settleStrike(st);
    if (st.bank.credit > G.creditLimit(st)) overLimit++;
    if (monthKey(st.time) !== lastM) {
      lastM = monthKey(st.time); checkNaN(st);
      const h = st.history[st.history.length - 1];
      const exp = Object.values(h.expense).reduce((s, v) => s + v, 0);
      const row = { nw: G.netWorth(st), cash: st.bank.checking + st.bank.savings - st.bank.credit, sales: h.income.sales, exp, made: h.produced, staff: st.employees.length, mach: machines.length };
      months.push(row);
      if (verbose) console.log(fmtDate(st.time).slice(4), 'NW', money(row.nw).padStart(11), 'cash', money(row.cash).padStart(10), 'sales', money(row.sales).padStart(9), 'exp', money(exp).padStart(9), 'made', String(h.produced).padStart(7), 'staff', row.staff, 'mach', row.mach, 'eff', (machines.reduce((s, o) => s + o.effAvg, 0) / machines.length).toFixed(2));
      // grow when cash allows: a new line, an operator for it, and the support staff a growing plant needs
      const next = nextLine(st);
      const need = next ? FAMILIES[next.family].price * 1.5 : Infinity;
      // borrow for a line that pays back within a year, once the business has shown a profit for a few months
      const profitable = months.length >= 4 && months.slice(-3).every(x => x.sales > x.exp * 0.9);
      if (next && grew < 5 && st.bank.checking < need && profitable && !st.bank.loans.length) { const l = G.takeLoan(st, Math.min(G.maxLoan(st), Math.round((need - st.bank.checking) / 1000) * 1000 + 20000), 3); if (verbose && l.ok) console.log('   ', l.msg); }
      // a line that has lost money for three months running gets retooled to a better product, or replaced
      if (machines.length && months.length >= 4 && months.length % 3 === 1 && months.slice(-3).every(x => x.sales < x.exp)) {
        const worst = machines.slice().sort((a, b) => lineScore(st, RECIPES[a.recipe]) - lineScore(st, RECIPES[b.recipe]))[0];
        const alt = RECIPES.filter(r => r.family === worst.family && r.start && r.id !== worst.recipe && sourceable(st, r)).sort((a, b) => lineScore(st, b) - lineScore(st, a))[0];
        if (alt && lineScore(st, alt) > lineScore(st, RECIPES[worst.recipe]) * 1.2) { const rt = G.setRecipe(st, worst.id, alt.id); makes.add(alt.out); if (verbose) console.log('   ', rt.msg); }
        else if (machines.length === 1) {
          const repl = nextLine(st, true);
          if (repl && repl.family !== worst.family && st.bank.checking + worst.value > FAMILIES[repl.family].price * 1.1) { G.sellEquipment(st, worst.id); machines.splice(machines.indexOf(worst), 1); makes.clear(); const o = addMachine(repl); if (o) for (const e of st.employees) if (e.assign == null && e.job === job('operator')) G.assign(st, e.id, o.id); if (verbose) console.log('    switched to', ITEMS[repl.out].name); }
        }
      }
      // out of floor space: lease a building about twice the size and move the plant
      if (full && !st.move && st.bank.checking > 150000) {
        const area = st.city.lots[st.lotId].sqft, lot = st.city.lots.filter(l => l.firm == null && l.sqft > area * 1.8).sort((a, b) => a.rent - b.rent)[0];
        const mv = lot && G.startMove(st, lot.id); if (verbose && mv) console.log('   ', mv.msg); if (mv?.ok) full = false;
      }
      if (next && st.bank.checking > need && grew < 5 && !st.move) {
        if (addMachine(next)) {
          hire(st, 'operator', 1.03); grew++;
          if (grew === 1) { hire(st, 'maintenance', 1.03); hire(st, 'purchasing', 1.03); addOffice(); }
          if (grew === 2) { hire(st, 'foreman', 1.03); hire(st, 'marketing', 1.03); addOffice(); }
          if (grew === 3) { hire(st, 'sales', 1.03); addOffice(); G.placeEquipment(st, { kind: 'handcart', x: 1, y: 2 }); }
          if (grew === 4) { hire(st, 'finance', 1.03); addOffice(); }
        }
      }
    }
  }
  const m = st.city.market;
  const priceRatios = ITEMS.map(i => m[i.id].price / i.unit);
  if (verbose) {
    console.log('over', st.over, 'score', money(G.score(st)), 'lines', machines.map(o => ITEMS[RECIPES[o.recipe].out].name).join(', '));
    console.log('save bytes', JSON.stringify(st).length, 'firms alive', st.city.firms.filter(f => f.alive).length, '/', st.city.firms.length);
  }
  // payroll against what the same people would cost had nobody been promoted, and units made per employee per month
  const staffed = st.employees.filter(e => JOBS[e.job].level);
  const pay = staffed.reduce((a, e) => a + e.salary, 0);
  const flat = staffed.reduce((a, e) => a + e.salary * marketSalary(st, firstJob.get(e.id) || e.job) / marketSalary(st, e.job), 0);
  const tail = months.slice(-6), perHead = tail.reduce((a, x) => a + x.made / Math.max(1, x.staff), 0) / Math.max(1, tail.length);
  return { st, start, months, overLimit, priceRatios, machines, stallMax, stallTotal, climb, payUp: flat ? pay / flat - 1 : 0, perHead };
}

if (verbose) {
  const r = run(seedArg, cityArg || 'Dayton', diffArg || 'normal');
  console.log('promotions', r.climb.total, 'first Senior day', r.climb.firstSenior, 'first Director day', r.climb.firstDirector, 'pay up', (r.payUp * 100).toFixed(0) + '%', 'made/head/month', r.perHead.toFixed(1));
  process.exit(0);
}

// ---- the balance check: several seeds and cities, every run inside the bands
const runs = [['long1', 'Dayton'], ['long2', 'Grand Rapids'], ['long3', 'Tulsa']];
for (const [seed, city] of runs) {
  const r = run(seed, city, 'normal'), M = r.months, nw = M.map(x => x.nw), last = M[M.length - 1];
  const tag = `${seed} in ${city}`;
  ok(!r.st.over && M.length >= 24, `${tag}: still trading after ${M.length} months`);
  ok(Math.min(...nw.slice(0, 6)) >= r.start * BANDS.earlyFloor, `${tag}: net worth never falls below ${BANDS.earlyFloor * 100}% of the start in the first six months (lowest ${money(Math.min(...nw.slice(0, 6)))})`);
  ok(r.overLimit === 0, `${tag}: credit line never over its limit`);
  ok(r.stallMax <= 3, `${tag}: at most 3 stalled-machine notices on any day (most ${r.stallMax}, ${r.stallTotal} in two years)`);
  const end = last.nw / r.start;
  ok(end >= BANDS.endMin && end <= BANDS.endMax, `${tag}: net worth after 24 months is ${end.toFixed(2)}× the start (band ${BANDS.endMin}–${BANDS.endMax}×)`);
  const early = M.slice(3, 9).reduce((s, x) => s + x.sales, 0) / 6, late = M.slice(18, 24).reduce((s, x) => s + x.sales, 0) / 6;
  ok(late >= early * BANDS.salesGrowth, `${tag}: monthly sales grow from ${money(early)} (months 4–9) to ${money(late)} (months 19–24), at least ${BANDS.salesGrowth}×`);
  const worst = Math.max(...M.slice(1).map((x, i) => x.nw - M[i].nw)) / r.start;
  ok(worst <= BANDS.maxMonthlyGain, `${tag}: no runaway month (largest one-month gain ${worst.toFixed(2)}× the start, limit ${BANDS.maxMonthlyGain}×)`);
  const [lo, hi] = [Math.min(...r.priceRatios), Math.max(...r.priceRatios)];
  ok(lo >= BANDS.price[0] && hi <= BANDS.price[1], `${tag}: market prices stay within ${BANDS.price[0]}–${BANDS.price[1]}× base (${lo.toFixed(2)}–${hi.toFixed(2)})`);
  // seniority (spec 013)
  const c = r.climb, mo = d => d == null ? null : d / 30.4;
  ok(c.total >= 1, `${tag}: ${c.total} promotions in two years`);
  ok(c.perDayMax <= BANDS.promotionsPerDay, `${tag}: at most ${BANDS.promotionsPerDay} promotions on any day (most ${c.perDayMax})`);
  ok(mo(c.firstSenior) != null && mo(c.firstSenior) >= BANDS.firstSenior[0] && mo(c.firstSenior) <= BANDS.firstSenior[1], `${tag}: first Senior in month ${mo(c.firstSenior)?.toFixed(1)} (band ${BANDS.firstSenior.join('–')})`);
  ok(mo(c.firstDirector) != null && mo(c.firstDirector) >= BANDS.firstDirector[0] && mo(c.firstDirector) <= BANDS.firstDirector[1], `${tag}: first Director in month ${mo(c.firstDirector)?.toFixed(1)} (band ${BANDS.firstDirector.join('–')})`);
  ok(r.payUp >= BANDS.payUp[0] && r.payUp <= BANDS.payUp[1], `${tag}: promotions lift the payroll by ${(r.payUp * 100).toFixed(0)}% (band ${BANDS.payUp.map(x => x * 100).join('–')}%)`);
}
done('balance');
