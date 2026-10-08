// A printed four-month playthrough with the quick-start line, for eyeballing the economy (no assertions).
//   node test/play.mjs [seed] [machines]
import * as G from '../src/sim/game.js';
import { ITEMS, RECIPES, CITIES, ECONOMY, FAMILY_ID } from '../src/gen/data.js';
import { hire } from './lib.mjs';
import { ports, inputPorts, ZONE } from '../src/sim/floor.js';
import { money, fmtDate, monthKey } from '../src/core/util.js';

const st = G.newGame({ company: 'Test Co', seed: process.argv[2] || 'abc', difficulty: 'normal' });
G.visitCity(st, CITIES.findIndex(c => c.name.startsWith('Dayton')));
const lot = st.city.lots.filter(l => l.firm == null).sort((a, b) => Math.abs(a.sqft - 50000) - Math.abs(b.sqft - 50000))[0];
console.log('city', st.city.name, 'firms', st.city.firms.length, 'lot', lot.addr, lot.sqft, money(lot.rent), 'salary', st.city.avgSalary);
console.log(G.rentBuilding(st, lot.id));
const fl = st.floor; console.log('floor', fl.w, fl.h);
const nMach = +(process.argv[3] || 1);
const ms = [];
for (let k = 0; k < nMach; k++) {
  const r = G.placeEquipment(st, { kind: 'machine', family: FAMILY_ID[ECONOMY.quickStart.line], x: 4 + k * 8, y: 5, rot: 0 });
  if (!r.ok) { console.log('place fail', r.msg); continue; }
  ms.push(r.obj);
  for (const [ix, iy] of inputPorts(r.obj)) fl.zones[iy * fl.w + ix] = ZONE.SAFETY;
}
for (let k = 0; k < 3; k++) console.log(G.placeEquipment(st, { kind: 'office', officeType: 0, x: 3 + k * 4, y: 12, rot: 0 }).msg || 'office ok');
const hireJob = role => { const e = hire(st, role, 1.02); return { msg: e ? `${e.first} ${e.last} hired as ${e.job}` : `no ${role} hired` }; };
for (const o of ms) console.log(hireJob('operator').msg);
console.log(hireJob('sales').msg, hireJob('finance').msg);
console.log(G.purchaseAll(st).msg);
let lastM = monthKey(st.time);
for (let d = 0; d < 120; d++) {
  G.advance(st, 1440);
  if (d % 7 === 6) G.purchaseAll(st);
  if (monthKey(st.time) !== lastM) {
    lastM = monthKey(st.time);
    const h = st.history[st.history.length - 1];
    const exp = Object.entries(h.expense).map(([k, v]) => k + ':' + Math.round(v)).join(' ');
    console.log(fmtDate(st.time), 'NW', money(G.netWorth(st)), 'cash', money(st.bank.checking), 'credit', money(st.bank.credit), '| income sales', money(h.income.sales), '| produced', h.produced, 'sold', h.sold, '|', exp);
    console.log('   machines', st.floor.objects.filter(o => o.kind === 'machine').map(o => `#${o.id} ${o.status} effAvg ${o.effAvg.toFixed(2)} credits ${o.credits.toFixed(0)}`).join('; '));
    console.log('   inv', Object.entries(st.inventory).map(([i, u]) => ITEMS[i].name + ':' + Math.round(u)).join(', '), 'AR', money(G.arTotal(st)), 'AP', money(G.apTotal(st)), 'free boxes', G.freeBoxes(st));
    console.log('   staff', st.employees.map(e => `${e.first} m${e.morale.toFixed(0)} s${e.stress.toFixed(0)}`).join(', '), 'salesEff', st.dept.salesEff.toFixed(2), 'backlog', st.dept.backlog.toFixed(0), 'cap', st.dept.acctCap.toFixed(0));
  }
}
console.log('memos', st.memos.length, st.memos.slice(0, 12).map(m => m.subject).join(' | '));
console.log('save size', JSON.stringify(st).length);
