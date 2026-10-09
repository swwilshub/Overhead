// Spending guard (spec 005): how much a purchase would borrow, late fees named on the statement, one late-fee memo a
// month, and headless sims still buying on credit without any prompt.
import * as G from '../src/sim/game.js';
import { ITEMS, FAMILIES } from '../src/gen/data.js';
import { jobFor } from '../src/core/content.js';
import { monthKey, MIN_PER_DAY } from '../src/core/util.js';
import { ok, done, setup, hire, chainPair } from './lib.mjs';

const SUBJECT = 'Suppliers charged late fees';
const feeMemos = st => st.memos.filter(m => m.subject === SUBJECT);
const feeLines = st => st.bank.txns.filter(t => t.kind === 'fines' && t.desc.startsWith('Late-payment fee'));
const material = +Object.keys(ITEMS).find(id => ITEMS[id].tier === 'material');
const bill = (st, amount = 5600) => { const desc = `${ITEMS[material].name} from Test Vendor`; st.ap.push({ amount, due: st.time, desc }); return desc; };
const nextDay = st => G.advance(st, MIN_PER_DAY);
// run day by day until our test bills have been paid (bills are paid at the start of a workday)
const payDay = st => { for (let i = 0; i < 7 && st.ap.some(b => b.desc.endsWith('Test Vendor')); i++) nextDay(st); };

// 1. creditNeeded: 0 when checking plus savings cover the price, the shortfall otherwise
{
  const st = setup('spend1', { sandbox: false });
  st.bank.checking = 73796; st.bank.savings = 0;
  ok(G.creditNeeded(st, 91800) === 18004, `$91,800 with $73,796 in checking borrows ${G.creditNeeded(st, 91800)} (want 18,004)`);
  ok(G.creditNeeded(st, 73796) === 0, 'a price equal to checking borrows nothing');
  ok(G.creditNeeded(st, 5000) === 0, 'a small price borrows nothing');
  st.bank.savings = 20000;
  ok(G.creditNeeded(st, 91800) === 0, 'savings count: checking plus savings cover $91,800');
  st.bank.savings = 10000;
  ok(G.creditNeeded(st, 91800) === 8004, `checking and savings together leave ${G.creditNeeded(st, 91800)} to borrow (want 8,004)`);
}

// 2. late fees without Finance staff: named on the statement, one memo a month
{
  const st = setup('spend2', { sandbox: false });
  st.bank.checking = 500000;
  ok(!st.employees.some(e => e.job === jobFor('finance').key), 'no Finance staff at the start');
  ok(G.accountingDelay(st) === 6, 'bills are 6 days late with nobody keeping the books');
  // start at least ten days before a new month, so the second bill is paid in the same month
  while (monthKey(st.time + 10 * MIN_PER_DAY) !== monthKey(st.time)) nextDay(st);
  const month = monthKey(st.time);
  const desc = bill(st); payDay(st);
  const lines = feeLines(st);
  ok(lines.length === 1, `one late-fee line on the statement (${lines.length})`);
  ok(lines[0]?.desc === `Late-payment fee, paid 6 days late: ${desc}`, `statement names the delay and the bill: "${lines[0]?.desc}"`);
  const m = feeMemos(st);
  ok(m.length === 1, `one "${SUBJECT}" memo (${m.length})`);
  ok(m[0]?.from === 'Plant log', `memo comes from the Plant log (${m[0]?.from})`);
  const fee = -lines[0]?.amount;
  ok(m[0]?.body.includes(`Suppliers added $${fee.toLocaleString('en-US')} in late fees because bills were paid 6 days late.`), 'memo gives the fee and the delay: ' + m[0]?.body);
  ok(m[0]?.body.includes('nobody keeps the books') && m[0]?.body.includes(jobFor('finance').title), `memo suggests a ${jobFor('finance').title}`);
  ok(!m[0]?.important, 'the memo does not stop the clock');
  // a second late fee the same month: another line, no memo
  bill(st, 3000); payDay(st);
  ok(monthKey(st.time) === month, 'still the same month');
  ok(feeLines(st).length === 2 && feeMemos(st).length === 1, `second late fee this month: ${feeLines(st).length} lines, ${feeMemos(st).length} memo`);
  // next month: one more memo
  while (monthKey(st.time) === month) nextDay(st);
  nextDay(st);
  bill(st, 4000); payDay(st);
  ok(feeMemos(st).length === 2, `the first late fee of the next month sends a memo (${feeMemos(st).length})`);
  // several bills on one day: one memo with the day's total
  const before = feeMemos(st).length;
  while (monthKey(st.time + 10 * MIN_PER_DAY) === monthKey(st.time)) nextDay(st);
  while (monthKey(st.time) === monthKey(st.time - MIN_PER_DAY)) nextDay(st);
  bill(st, 2000); bill(st, 2000); const n0 = feeLines(st).length; payDay(st);
  ok(feeLines(st).length === n0 + 2 && feeMemos(st).length === before + 1, 'two bills on one day: two lines, one memo');
}

// 3. Finance staff who are behind: the memo says so and suggests one more
{
  const st = setup('spend3', { sandbox: false });
  st.bank.checking = 500000;
  hire(st, 'finance');
  st.dept.backlog = 5000;
  const delay = G.accountingDelay(st);
  ok(delay > 3, `Finance is ${delay} days behind`);
  bill(st); payDay(st);
  const d = G.accountingDelay(st), m = feeMemos(st)[0];
  ok(feeLines(st)[0]?.desc.includes('days late: '), 'statement line names the delay: ' + feeLines(st)[0]?.desc);
  ok(m && m.body.includes('Finance is behind') && m.body.includes(`One more ${jobFor('finance').title}`), 'memo says Finance is behind and suggests one more: ' + m?.body);
  ok(d >= 0, 'delay still readable');
}

// 4. headless: purchases past checking go through on the credit line with no prompt; over the limit is still refused
{
  const st = setup('spend4', { sandbox: false });
  const fam = chainPair().comp.family, price = FAMILIES[fam].price;
  st.bank.checking = Math.round(price / 2); st.bank.savings = 0;
  const need = G.creditNeeded(st, price);
  ok(need > 0, `a ${FAMILIES[fam].name} machine needs ${need} of credit`);
  let r = null;
  for (let y = 3; y < st.floor.h - 4 && !r?.ok; y++) for (let x = 3; x < st.floor.w - 6 && !r?.ok; x++) r = G.placeEquipment(st, { kind: 'machine', family: fam, x, y, rot: 0 });
  ok(r?.ok, 'the machine is bought headless without a prompt');
  ok(Math.round(st.bank.credit) === need, `the credit line covers exactly the shortfall (${Math.round(st.bank.credit)})`);
  ok(st.memos.some(m => m.subject === 'Credit line drawn'), 'the after-the-fact "Credit line drawn" memo is still sent');
  let err = null; try { G.advance(st, 30 * MIN_PER_DAY); } catch (e) { err = e; }
  ok(!err && !st.over, `30 days run on${err ? ': ' + err.message : ''}`);
  st.bank.checking = 0; st.bank.savings = 0; st.bank.credit = G.creditLimit(st);
  const credit0 = st.bank.credit;
  let r2 = null;
  for (let y = 3; y < st.floor.h - 4 && !(r2 && /cannot afford/.test(r2.msg || '')); y++) for (let x = 3; x < st.floor.w - 6 && !(r2 && /cannot afford/.test(r2.msg || '')); x++) r2 = G.placeEquipment(st, { kind: 'machine', family: fam, x, y, rot: 0 });
  ok(r2 && !r2.ok && /cannot afford/.test(r2.msg) && st.bank.credit === credit0, 'over the credit limit, the "cannot afford" refusal stands: ' + r2?.msg);
}
done('spending guard');
