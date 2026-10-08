// Less common code paths: product research, a walkout and its settlement, loans, the business advisor, selling
// equipment, and the market intelligence brief.
import * as G from '../src/sim/game.js';
import { ITEMS, RECIPES, FAMILIES } from '../src/gen/data.js';
import { ok, done, setup, hire, job } from './lib.mjs';
const st = setup('paths', { sandbox: false, sqft: 40000 });
st.bank.checking += 400000;
// a line with a product that needs research
const locked = RECIPES.find(r => !r.start && ITEMS[r.out].tier === 'product');
const m = G.placeEquipment(st, { kind: 'machine', family: locked.family, x: 3, y: 4 }).obj;
const mm = G.placeEquipment(st, { kind: 'machine', family: locked.family, x: 12, y: 4 }).obj;
ok(m && mm, `two ${FAMILIES[locked.family].name} machines placed`);
const rs = G.startResearch(st, mm.id, locked.id); ok(rs.ok, rs.msg);
const eng = hire(st, 'researcher', 1.05);
ok(eng && eng.assign === mm.id, `${eng?.first} (${eng?.job}) went straight to the research machine`);
let days = 0; while (!st.research.unlocked[locked.id] && days < 200) { G.advance(st, 1440); days++; }
ok(st.research.unlocked[locked.id], `research on ${ITEMS[locked.out].name} done after ${days} days; machine is ${mm.mode}`);
const rt = G.setRecipe(st, mm.id, locked.id); ok(rt.ok, 'retool: ' + rt.msg);
// walkout: underpaid, unhappy floor crew
for (let i = 0; i < 5; i++) hire(st, 'operator');
const crew = () => st.employees.filter(e => e.job === job('operator'));
for (const e of crew()) { e.salary = 15000; e.morale = 20; }
let d2 = 0; while (!st.strike && d2 < 120) { G.advance(st, 1440); d2++; for (const e of crew()) e.morale = Math.min(e.morale, 25); }
ok(!!st.strike, `walkout after ${d2} days: ${st.memos.find(x => x.kind === 'strike')?.subject}`);
const before = crew().map(e => e.salary);
const settle = G.settleStrike(st); ok(settle.ok && !st.strike, settle.msg);
ok(crew().every((e, i) => e.salary > before[i]), 'floor crew got their raise: ' + crew().map(e => e.salary).join(', '));
// loans
const loan = G.takeLoan(st, 40000, 2); ok(loan.ok, loan.msg);
const payoff = G.payOffLoan(st, st.bank.loans[0].id); ok(payoff.ok && !st.bank.loans.length, payoff.msg);
// business advisor and market brief
const adv = G.hireAdvisor(st); ok(adv.ok, adv.msg);
const report = st.memos.find(x => x.from === 'Business advisor'); ok(report && report.body.length > 50, 'advisor report:\n' + report?.body);
const rival = st.city.firms.find(f => f.alive && f.kind === 'maker');
const brief = G.buyBrief(st, rival.id); ok(brief.ok && /Profile/.test(st.memos[0].subject), `${brief.msg} ${st.memos[0].body}`);
// selling equipment
const sold = G.sellEquipment(st, m.id); ok(sold.ok && !st.floor.objects.includes(m), sold.msg);
done('code path');
