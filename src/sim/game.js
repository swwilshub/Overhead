// Core game state and the simulation clock.
import { ITEMS, RECIPES, FAMILIES, CITIES, ECONOMY, SCENARIOS as SCENARIO_LIST, EVENTS } from '../gen/data.js';
import { JOBS, DEPTS, ATTRS, hasRole, canRunMachine, jobFor, aOrAn, levelOf, AD_TARGETS } from '../core/content.js';
const A = (e, k) => e.attrs[ATTRS.indexOf(k)];
import { rand, randInt, pick, chance, clamp, hashSeed, dayIndex, minuteOfDay, isWorkday, weekday, monthKey, dateOf, money, num, plural, fmtShortDate, MIN_PER_DAY } from '../core/util.js';
import { generateCity, recomputeMarket, vendorsFor, unitsPerHour, WORKDAYS_PER_MONTH, DIFF, bestMarkets } from './world.js';
import { newFloor, ports, inputPorts, portItem, links, autoRoute, isProducer, storageCapacity, ZONE, OFFICES, priceOf, placementProblem, footprint, countKind, objectLabel, KINDS } from './floor.js';
import { makeCandidate, hire, skill, payRatio, fullName, isWhite, planDay, activityAt, marketSalary, jobFit, xpFloor, growthFor, levelProgress, dailyXp, WORK_START, WORK_END } from './people.js';
import { monthlyEvents, advisorReport } from './events.js';
import { analyse, cellPrice, itemDef, REQUIRED, MIN_SIZE, MAX_SIZE, TECHS, CELL_ITEMS, techDone } from './cells.js';
import { analyseSuite, suitePrice, SUITE_REQUIRED, SUITE_MIN, SUITE_MAX } from './suites.js';
import { STATUS, BOX_GAP, BUF_BOXES, starvedInputs, outputBlock, stallOf, beltStock, staffedBy } from './stalls.js';

export const VERSION = 2;
export const SCENARIOS = Object.fromEntries(SCENARIO_LIST.map(sc => [sc.key, sc]));
export const DEFAULT_SCENARIO = SCENARIO_LIST[0].key;
const BANK = ECONOMY.bank.name;
const has = (st, role) => st.employees.some(e => hasRole(e, role));
const titleFor = role => jobFor(role).title;
// the title with its article, "a Machine Operator"; capital for the start of a sentence
const aTitle = (role, capital = false) => aOrAn(titleFor(role), capital);

// Announcements for the screen-reader live region and toasts (transient, not saved).
export const bus = { queue: [], sounds: [], push(msg, level = 'polite') { this.queue.push({ msg, level }); }, sound(name) { this.sounds.push(name); if (this.sounds.length > 50) this.sounds.shift(); } };

export function newGame(setup) {
  const seed = setup.seed != null && setup.seed !== '' ? hashSeed(setup.seed) : (Math.random() * 2 ** 32) >>> 0;
  const st = {
    v: VERSION, seed, rng: seed,
    setup: { company: setup.company || 'Midline Manufacturing Co.', owner: setup.owner || 'Owner', scenario: SCENARIOS[setup.scenario] ? setup.scenario : DEFAULT_SCENARIO, difficulty: setup.difficulty || 'normal', sandbox: !!setup.sandbox, seedText: String(setup.seed ?? '') },
    phase: 'nation', time: 7 * 60, nextId: 1000,
    cityId: null, city: null, lotId: null, floor: null, leaseMonths: ECONOMY.leaseMonths,
    employees: [], memos: [], ads: [], orders: [], ar: [], ap: [],
    inventory: {}, quality: {}, prices: {}, sell: {}, targets: {},
    bank: { checking: 0, savings: 0, credit: 0, loans: [], txns: [] },
    ledger: null, history: [], series: [],
    research: { unlocked: {}, done: [] },
    dept: { backlog: 0, acctCap: 0, purchCap: 0, salesEff: 0.35, awareness: 0, mkt: 0 },
    strike: null, flags: {}, vendorBought: {}, stats: { producedMonth: {}, soldMonth: {}, revenueMonth: {}, bestSales: 0, bestProd: 0, salesTrend: [], prodTrend: [] },
    obligation: null, vcShare: 0, over: null, tutorial: {},
  };
  const sc = SCENARIOS[st.setup.scenario];
  st.bank.checking = st.setup.sandbox ? 5000000 : sc.cash;
  // scenario terms: a net-worth target by a deadline, missed at the cost of a repayment or a share of the company
  if (sc.target && !st.setup.sandbox) st.obligation = { kind: sc.share ? 'equity' : 'repay', from: sc.from, target: sc.target, deadline: monthKey(st.time) + sc.months, penalty: sc.penalty || 0, share: sc.share || 0 };
  newLedger(st);
  txn(st, st.bank.checking, 'Opening deposit', 'deposit');
  if (sc.loan && !st.setup.sandbox) addLoan(st, sc.loan, sc.loanYears, 'Start-up loan');
  st.cellTech = { done: {}, active: null }; return st;
}

export function visitCity(st, cityId) {
  // a city always generates the same way for this game's seed
  const save = st.rng; st.rng = (st.seed ^ hashSeed('city' + cityId)) >>> 0;
  const city = generateCity(st, cityId);
  st.rng = save ^ 0x9e3779b9;
  st.cityId = cityId; st.city = city; st.phase = 'city';
}

// quiet: skip the "Getting started" memo (Quick start sets the plant up itself)
export function rentBuilding(st, lotId, { quiet = false } = {}) {
  const lot = st.city.lots[lotId];
  if (lot.firm != null) return { ok: false, msg: 'That building is occupied.' };
  st.lotId = lotId; st.phase = 'play';
  st.floor = newFloor(lot.sqft);
  st.rent = lot.rent;
  memo(st, { from: 'Leasing office', subject: `Lease signed: ${lot.addr}`, body: `Your lease on ${lot.addr} in ${st.city.name} starts today: ${num(lot.sqft)} sq ft at ${money(lot.rent)} a month, due on the first of each month.` });
  if (!quiet) memo(st, { from: 'Plant log', subject: 'Getting started', important: true, body: `The building is bare. From the Catalog, buy a machine and set it down, paint a safety zone on each input square, and hire ${aTitle('operator')}. Nothing runs until materials arrive, so order those too.` });
  const bm = bestMarkets(st.city, 3).map(i => ITEMS[i].name);
  if (bm.length) memo(st, { from: 'Market research', subject: 'Where the openings are', body: `Demand runs furthest ahead of supply for: ${bm.join(', ')}. A product made from bought-in parts gets you selling quickly; making your own components later widens the margin.` });
  pay(st, lot.rent, 'rent', `Rent, ${lot.addr} (first month)`);
  st.flags.pauseRequest = false; bus.queue.length = 0; bus.sounds.length = 0;
  return { ok: true };
}

// ---------------- money
function newLedger(st) {
  st.ledger = { month: monthKey(st.time), income: { sales: 0, equipment: 0, interest: 0, misc: 0 }, salesByDept: {}, expense: { rent: 0, personnel: 0, purchases: 0, loans: 0, running: 0, equipment: 0, fines: 0, misc: 0 }, produced: 0, sold: 0 };
}
export function txn(st, amount, desc, kind) {
  st.bank.txns.push({ t: st.time, amount: Math.round(amount * 100) / 100, desc, kind, bal: Math.round(st.bank.checking) });
  if (st.bank.txns.length > 400) st.bank.txns.splice(0, st.bank.txns.length - 400);
}
// Pay from checking, falling back to savings, then the bank's credit line.
export function pay(st, amount, cat, desc) {
  if (amount <= 0) return;
  st.bank.checking -= amount;
  st.ledger.expense[cat] = (st.ledger.expense[cat] || 0) + amount;
  if (desc) txn(st, -amount, desc, cat);
  coverOverdraft(st);
}
export function receive(st, amount, cat, desc) {
  st.bank.checking += amount;
  if (cat === 'sales' || cat === 'equipment' || cat === 'interest' || cat === 'misc') st.ledger.income[cat] += amount;
  txn(st, amount, desc, cat);
  if (st.bank.credit > 0 && st.bank.checking > 25000) {
    const r = Math.min(st.bank.credit, st.bank.checking - 25000);
    st.bank.credit -= r; st.bank.checking -= r; txn(st, -r, 'Credit line repayment', 'loan');
  }
}
function coverOverdraft(st) {
  if (st.bank.checking >= 0) return;
  const deficit = -st.bank.checking;
  if (st.bank.savings > 0) {
    const m = Math.min(st.bank.savings, deficit);
    st.bank.savings -= m; st.bank.checking += m;
    txn(st, m, 'Overdraft covered from savings', 'transfer');
    memo(st, { from: BANK, subject: 'Savings covered an overdraft', kind: 'bank', body: `Checking went ${money(deficit)} below zero, so we moved ${money(m)} across from savings.` });
  }
  if (st.bank.checking < 0) {
    const d = -st.bank.checking;
    st.bank.credit += d; st.bank.checking = 0;
    txn(st, d, 'Overdraft drawn on credit line', 'loan');
    if (!st.flags.creditWarnDay || dayIndex(st.time) - st.flags.creditWarnDay > 6) {
      st.flags.creditWarnDay = dayIndex(st.time);
      memo(st, { from: BANK, subject: 'Credit line drawn', kind: 'bank', important: true, body: `Checking went below zero, so ${money(d)} came from your credit line. You now owe ${money(st.bank.credit)} on it at ${pctRate(ECONOMY.bank.creditRate)} a year, against a limit of ${money(creditLimit(st))}.` });
      bus.push(`Overdraft: ${money(d)} drawn on credit.`, 'assertive');
    }
  }
}
export function creditLimit(st) { return Math.max(75000, Math.round(0.5 * (equipmentValue(st) + inventoryValue(st) + arTotal(st)))); }
// How much of a price paid on the spot would come from the credit line: 0 when checking plus savings cover it.
export function creditNeeded(st, price) { return Math.max(0, Math.round(price - st.bank.checking - st.bank.savings)); }

// ---------------- memos
export function memo(st, m) {
  const full = { id: st.nextId++, t: st.time, read: false, kind: 'note', important: false, ...m };
  st.memos.unshift(full);
  if (st.memos.length > 250) { const idx = st.memos.findLastIndex(x => x.read); st.memos.splice(idx >= 0 ? idx : st.memos.length - 1, 1); }
  bus.push(`New memo from ${m.from}: ${m.subject}`, m.important ? 'assertive' : 'polite');
  bus.sound(m.sound || (m.important ? 'alert' : 'memo'));
  if (m.important) st.flags.pauseRequest = true;
  return full;
}

// ---------------- valuation
export const arTotal = st => st.ar.reduce((s, a) => s + a.amount, 0);
export const apTotal = st => st.ap.reduce((s, a) => s + a.amount, 0);
export function equipmentValue(st) { return st.floor ? st.floor.objects.filter(o => !o.fixed).reduce((s, o) => s + (o.value || 0), 0) : 0; }
export function inventoryValue(st) {
  let v = 0; for (const [id, u] of Object.entries(st.inventory)) v += u * st.city.market[id].price * 0.75;
  if (st.floor) for (const o of st.floor.objects) if (o.inBuf) for (const [id, u] of Object.entries(o.inBuf)) v += u * st.city.market[id].price * 0.75;
  return v;
}
export function accruedPayroll(st) { return st.employees.reduce((s, e) => s + e.salary / 260 * e.accruedDays, 0); }
export function loansTotal(st) { return st.bank.loans.reduce((s, l) => s + l.balance, 0) + st.bank.credit; }
export function netWorth(st) {
  if (!st.city) return st.bank.checking;
  return st.bank.checking + st.bank.savings + arTotal(st) + inventoryValue(st) + equipmentValue(st) - loansTotal(st) - apTotal(st) - accruedPayroll(st) - (st.obligation?.owed || 0);
}
export function score(st) { return Math.round(netWorth(st) * (1 - st.vcShare)); }

// ---------------- inventory helpers
export const boxesOf = (st, id, units = st.inventory[id] || 0) => Math.ceil(units / ITEMS[id].pack);
export function boxesStored(st) { let b = 0; for (const [id, u] of Object.entries(st.inventory)) b += boxesOf(st, +id, u); return b; }
export function freeBoxes(st) { return storageCapacity(st.floor) - boxesStored(st); }
export function addInventory(st, id, units) { st.inventory[id] = (st.inventory[id] || 0) + units; if (st.inventory[id] <= 1e-6) delete st.inventory[id]; }

// what our own machines consume
export function ownInputs(st) {
  const s = new Set();
  if (st.floor) for (const o of st.floor.objects) if (isProducer(o) && o.recipe != null && o.mode === 'produce') for (const [it] of RECIPES[o.recipe].inputs) s.add(it);
  return s;
}
export function isSelling(st, id) { return st.sell[id] ?? !ownInputs(st).has(+id); }

// ---------------- equipment
export function placeEquipment(st, spec) {
  const obj = { rot: 0, ...spec, id: st.floor.nextId };
  const prob = placementProblem(st.floor, obj);
  if (prob) return { ok: false, msg: prob };
  const price = priceOf(obj);
  if (st.bank.checking + st.bank.savings + (creditLimit(st) - st.bank.credit) < price) return { ok: false, msg: `You cannot afford that. It costs ${money(price)}.` };
  st.floor.nextId++;
  obj.value = price; obj.cost = price; obj.bought = st.time;
  if (obj.kind === 'machine') Object.assign(obj, { recipe: obj.recipe ?? RECIPES.find(r => r.family === obj.family && r.start).id, mode: 'produce', operator: null, produced: 0, producedMonth: 0, credits: 100, broken: false, repair: 0, eff: 0, effAvg: 0, progress: 0, inBuf: {}, status: 'No operator', research: null });
  if (obj.kind === 'office') obj.occupant = null;
  const before = obj.kind === 'conveyor' ? linkSummary(st.floor) : null;
  if (obj.kind === 'conveyor' && st.floor.zones[obj.y * st.floor.w + obj.x] === ZONE.SAFETY) st.floor.zones[obj.y * st.floor.w + obj.x] = ZONE.NONE;
  st.floor.objects.push(obj); st.floor.rev++;
  pay(st, price, 'equipment', `Purchased ${objectLabel(st, obj)}`);
  const linked = before ? newLinks(st, before) : [];
  return { ok: true, obj, linked };
}
// ---- belt lines
function linkSummary(fl) { const L = links(fl); const s = new Set(); for (const r of L.routes) s.add(`${r.from}>${r.to}:${r.k ?? ''}`); return s; }
function newLinks(st, before) {
  const fl = st.floor, L = links(fl), out = [];
  for (const r of L.routes) {
    const key = `${r.from}>${r.to}:${r.k ?? ''}`; if (before.has(key) || out.some(x => x.key === key)) continue;
    const a = fl.objects.find(o => o.id === r.from), b = fl.objects.find(o => o.id === r.to);
    out.push({ key, ...r, text: beltLineText(st, a, b, r.kind, r.k) });
  }
  return out;
}
export function beltLineText(st, a, b, kind, k) {
  const nm = o => o.kind === 'bin' ? `storage bin #${o.id}` : objectLabel(st, o);
  const want = k != null && isProducer(b) ? portItem(b, k) : null;
  const port = k != null ? `input ${k + 1}${want != null ? ` (${ITEMS[want].name})` : ''}` : 'the input';
  if (kind === 'bin') return `Belt connected: ${nm(a)} output now goes to storage through ${nm(b)}, with no hand carrying.`;
  if (kind === 'fromBin') return `Belt connected: ${nm(a)} now feeds ${port} of ${nm(b)} from storage, with no hand carrying.`;
  const out = a.recipe != null ? RECIPES[a.recipe].out : null;
  if (out != null && want === out) return `Belt connected: ${nm(a)} output to ${port} of ${nm(b)}. ${ITEMS[out].name} will ride the belt.`;
  const right = out != null ? inputFor(a, b) : null;
  return `Belt connected: ${nm(a)} output to ${port} of ${nm(b)}, but that input takes ${want != null ? ITEMS[want].name : 'nothing for this product'}` + (right != null ? `. ${ITEMS[out].name} goes in input ${right + 1}, so nothing will move yet.` : `, and ${nm(b)} doesn't use ${out != null ? ITEMS[out].name : 'its output'}, so nothing will move yet.`);
}
export const BELT_PRICE = () => KINDS.conveyor.price;
// ---------------- material flow
// Belts carry real boxes: each belt line from an output is a lane of boxes (one box = one product's pack of units)
// moving at belt speed with a gap between them. A box at the end goes into the next machine's input if that input
// takes it and has room, or into storage through a bin; otherwise it waits, the boxes behind it close up, and once the
// lane is full the machine's output tray fills and the machine stops. Without a belt, the operator carries boxes:
// finished goods out to the nearest storage square and materials back in, which takes them away from the machine.
export const BELT_SPEED = 0.25;
export { BOX_GAP, BUF_BOXES };
export const laneKey = r => `${r.from}>${r.to}:${r.k ?? ''}`;
const CARRY = { hand: { per: 0.12, cap: 1, load: 0.4 }, cart: { per: 0.09, cap: 2, load: 0.3 }, forklift: { per: 0.05, cap: 4, load: 0.15 } };
function syncLanes(st, L) {
  const fl = st.floor, tag = `${st.lotId}:${fl.w}x${fl.h}:${fl.rev}`;
  if (st.lanes && st.lanesTag === tag) return;
  const old = st.lanes || {}, next = {};
  for (const r of [...L.routes, ...L.ends]) {
    const key = r.kind === 'end' ? `${r.from}>end` : laneKey(r), len = r.path.length - 1;
    const prev = old[key];
    next[key] = { key, from: r.from, to: r.to, k: r.k ?? null, kind: r.kind, len, path: r.path, boxes: prev && prev.len === len ? prev.boxes : [] };
    if (prev && prev.len !== len) { for (const b of prev.boxes) addInventory(st, b.item, b.units); }
  }
  // belts that are gone: whatever was on them is picked up and put in storage
  for (const [key, ln] of Object.entries(old)) if (!next[key]) for (const b of ln.boxes) addInventory(st, b.item, b.units);
  st.lanes = next; st.lanesTag = tag;
  for (const o of fl.objects) if (isProducer(o)) o.outLanes = Object.values(next).filter(l => l.from === o.id && l.kind !== 'fromBin').length;
}
export function refreshLanes(st) { if (st.floor && st.phase === 'play') syncLanes(st, links(st.floor)); }
const entryFree = ln => !ln.boxes.length || Math.min(...ln.boxes.map(b => b.s)) >= BOX_GAP - 1e-9;
// move finished boxes from a machine's tray onto its belt: the next machine that uses them first, then storage, then anything
function pushOutput(st, o) {
  if (!st.lanes || o.recipe == null || o.mode === 'research') return;
  const item = RECIPES[o.recipe].out, pack = ITEMS[item].pack, fl = st.floor;
  const lanes = Object.values(st.lanes).filter(l => l.from === o.id && l.kind !== 'fromBin');
  if (!lanes.length) return;
  const rank = l => { if (l.kind === 'machine') { const d = fl.objects.find(x => x.id === l.to); return d && d.mode === 'produce' && portItem(d, l.k) === item ? 0 : 2; } return l.kind === 'bin' ? 1 : 3; };
  lanes.sort((a, b) => rank(a) - rank(b));
  while (o.tray >= pack - 1e-9) {
    // prefer a lane whose far end can take the box now; otherwise any lane with room at the start
    const ln = lanes.find(l => entryFree(l) && (rank(l) < 2 ? true : false)) || lanes.find(l => entryFree(l));
    if (!ln) break;
    ln.boxes.push({ s: 0, item, units: pack, moving: true }); o.tray -= pack; o.beltOut = (o.beltOut || 0) + pack;
  }
}
function laneStep(st, dt) {
  if (!st.lanes) return;
  const fl = st.floor, byId = new Map(fl.objects.map(o => [o.id, o]));
  for (const ln of Object.values(st.lanes)) {
    const dst = ln.to != null ? byId.get(ln.to) : null;
    // bins feed a machine input from storage when it is running low
    if (ln.kind === 'fromBin' && dst && dst.mode === 'produce' && dst.recipe != null) {
      const it = portItem(dst, ln.k);
      if (it != null && entryFree(ln)) {
        const pack = ITEMS[it].pack, inTransit = ln.boxes.reduce((a, b) => a + b.units, 0);
        if ((dst.inBuf?.[it] || 0) + inTransit < BUF_BOXES * pack - 1e-9 && (st.inventory[it] || 0) > 0) {
          const u = Math.min(pack, st.inventory[it]); addInventory(st, it, -u); ln.boxes.push({ s: 0, item: it, units: u, moving: true }); if (typeof dst.beltIn !== 'object' || !dst.beltIn) dst.beltIn = {}; dst.beltIn[ln.k] = (dst.beltIn[ln.k] || 0) + u;
        }
      }
    }
    if (!ln.boxes.length) continue;
    ln.boxes.sort((a, b) => b.s - a.s);
    // the box at the end gets off if it can
    const head = ln.boxes[0];
    if (head.s >= ln.len - 1e-6) {
      let taken = false;
      if ((ln.kind === 'machine' || ln.kind === 'fromBin') && dst && dst.mode === 'produce' && dst.recipe != null && portItem(dst, ln.k) === head.item) {
        dst.inBuf = dst.inBuf || {};
        if ((dst.inBuf[head.item] || 0) + head.units <= BUF_BOXES * ITEMS[head.item].pack + 1e-9) { dst.inBuf[head.item] = (dst.inBuf[head.item] || 0) + head.units; taken = true; }
      } else if (ln.kind === 'bin' && freeBoxes(st) >= 1) { addInventory(st, head.item, head.units); taken = true; }
      if (taken) ln.boxes.shift();
    }
    let limit = ln.len;
    for (const b of ln.boxes) { const ns = Math.min(b.s + BELT_SPEED * dt, limit); b.moving = ns > b.s + 1e-9; b.s = Math.max(b.s, ns); limit = b.s - BOX_GAP; }
  }
}
// nearest storage square to a spot (or the dock if nothing is painted)
function storageSpot(st, [x, y]) {
  const fl = st.floor; let best = null, bd = Infinity;
  for (let i = 0; i < fl.zones.length; i++) if (fl.zones[i] === ZONE.STORAGE) { const sx = i % fl.w, sy = (i / fl.w) | 0, d = Math.abs(sx - x) + Math.abs(sy - y); if (d < bd) { bd = d; best = [sx, sy]; } }
  if (!best) { const dk = fl.objects.find(o => o.kind === 'dock'); best = [dk.x + 1, dk.y]; bd = Math.abs(best[0] - x) + Math.abs(best[1] - y); }
  return { spot: best, d: bd };
}
// decide whether the operator should walk to storage: finished boxes out, materials in, both on one trip
function planTrip(st, o, L, equip, who) {
  const r = RECIPES[o.recipe], fl = st.floor, C = CARRY[equip], p = ports(o), pf = L.portFeed[o.id] || [];
  const outPack = ITEMS[r.out].pack;
  const outBoxes = !o.outLanes && o.tray >= outPack - 1e-9 ? Math.min(C.cap, Math.floor(o.tray / outPack + 1e-9), Math.max(0, freeBoxes(st))) : 0;
  const ins = [];
  let room = C.cap;
  r.inputs.forEach(([it], k) => {
    const f = pf[k], belted = f && (f.bin || f.sources.some(s => { const so = fl.objects.find(x => x.id === s); return so && so.recipe != null && RECIPES[so.recipe].out === it; }));
    if (belted || room <= 0) return;
    const pack = ITEMS[it].pack, have = o.inBuf[it] || 0;
    if (have >= pack * 0.5 || !(st.inventory[it] > 0)) return;
    const boxes = Math.min(room, Math.ceil((BUF_BOXES * pack - have) / pack));
    const units = Math.min(boxes * pack, st.inventory[it]); if (units <= 0) return;
    ins.push({ item: it, units, k }); room -= Math.ceil(units / pack);
  });
  // carry finished goods only when the tray has a full box and the trip is worth it
  const urgentOut = outBoxes > 0 && (o.tray >= BUF_BOXES * outPack - 1e-9 || ins.length);
  if (!ins.length && !urgentOut) return null;
  const from = ins.length ? p['in' + ins[0].k] || p.output : p.output;
  const { spot, d } = storageSpot(st, from || [o.x, o.y]);
  const nOut = urgentOut ? outBoxes : 0, nIn = ins.reduce((a, x) => a + Math.ceil(x.units / ITEMS[x.item].pack), 0);
  for (const x of ins) addInventory(st, x.item, -x.units);
  const outUnits = nOut * outPack; o.tray -= outUnits;
  const dur = 2 * d * C.per + (nOut + nIn) * C.load + 0.5;
  return { left: dur, dur, equip, who: who?.id ?? null, from: from || [o.x, o.y], spot, out: nOut ? { item: r.out, units: outUnits, boxes: nOut } : null, in: ins.map(({ item, units }) => ({ item, units, boxes: Math.ceil(units / ITEMS[item].pack) })) };
}
// put everything held at a machine (input stock, tray, a trip under way) back in storage
export function clearLocal(st, o) {
  for (const [it, u] of Object.entries(o.inBuf || {})) addInventory(st, +it, u);
  o.inBuf = {};
  if (o.tray > 0 && o.recipe != null) addInventory(st, RECIPES[o.recipe].out, o.tray);
  o.tray = 0;
  if (o.trip) { if (o.trip.out) addInventory(st, o.trip.out.item, o.trip.out.units); for (const x of o.trip.in) addInventory(st, x.item, x.units); o.trip = null; }
}
function finishTrip(st, o) {
  const t = o.trip; o.trip = null; if (!t) return;
  if (t.out) addInventory(st, t.out.item, t.out.units);
  for (const x of t.in) o.inBuf[x.item] = (o.inBuf[x.item] || 0) + x.units;
}

// ---------------- relocation: lease a new building and move the whole plant there
// The layout is copied keeping its position relative to the shipping dock (the bottom-left corner), so a bigger
// building gains room at the top and right. Anything that lands on the new building's fixed rooms is moved to the
// nearest free spot; belt squares that can't keep their exact place are left behind (sold), as is anything that
// cannot fit at all. Construction takes days; the old plant keeps running until the new one is ready.
const MOVE_ORDER = { cell: 0, machine: 1, office: 2, conveyor: 3, bin: 4, handcart: 5, forklift: 6 };
export function planMove(st, lotId) {
  const fl = st.floor, lot = st.city.lots[lotId];
  if (!lot || lot.firm != null) return { ok: false, msg: 'That building is not for rent.' };
  if (lotId === st.lotId) return { ok: false, msg: 'You are already there.' };
  if (st.move) return { ok: false, msg: 'A move is already under way.' };
  const nf = newFloor(lot.sqft), dx = 0, dy = nf.h - fl.h;
  nf.nextId = fl.nextId;
  // floor paint
  const fixedOcc = new Set(); for (const o of nf.objects) for (const [x, y] of footprint(o)) fixedOcc.add(y * nf.w + x);
  for (let y = 0; y < fl.h; y++) for (let x = 0; x < fl.w; x++) {
    const z = fl.zones[y * fl.w + x]; if (!z) continue;
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= nf.w || ny >= nf.h || fixedOcc.has(ny * nf.w + nx)) continue;
    nf.zones[ny * nf.w + nx] = z;
  }
  const moved = [], dropped = [], shifted = [];
  const user = fl.objects.filter(o => !o.fixed).sort((a, b) => (MOVE_ORDER[a.kind] ?? 9) - (MOVE_ORDER[b.kind] ?? 9));
  const fits = c => c.kind === 'cell' ? !placementProblem(nf, c) : !placementProblem(nf, c);
  for (const o of user) {
    const c = { ...o, x: o.x + dx, y: o.y + dy };
    let ok = fits(c);
    if (!ok && o.kind !== 'conveyor') {
      // nearest free spot, spiralling out
      search: for (let r = 1; r <= Math.max(nf.w, nf.h); r++) for (let ddy = -r; ddy <= r; ddy++) for (let ddx = -r; ddx <= r; ddx++) {
        if (Math.max(Math.abs(ddx), Math.abs(ddy)) !== r) continue;
        const t = { ...c, x: c.x + ddx, y: c.y + ddy }; if (fits(t)) { c.x = t.x; c.y = t.y; ok = true; shifted.push(o.id); break search; }
      }
    }
    if (ok) { nf.objects.push(c); nf.rev++; moved.push(o.id); } else dropped.push(o.id);
  }
  const value = id => fl.objects.find(o => o.id === id)?.value || 0;
  const cost = Math.round((2000 + moved.reduce((a, id) => a + value(id), 0) * 0.06) / 50) * 50;
  const days = Math.min(14, 3 + Math.ceil(moved.length / 6));
  const cap = storageCapacity(nf), stored = boxesStored(st);
  const problem = cap < stored ? `The new building would hold only ${num(cap)} boxes and you have ${num(stored)} in stock. Paint more storage first, or sell stock.` : null;
  // build order for the construction animation: back to front, left to right
  const order = nf.objects.filter(o => !o.fixed).sort((a, b) => a.y - b.y || a.x - b.x).map(o => o.id);
  return { ok: !problem, msg: problem, lot, floor: nf, moved, dropped, shifted, cost, rent: lot.rent, days, order, dy };
}
export function startMove(st, lotId) {
  const p = planMove(st, lotId); if (!p.ok) return p;
  const total = p.cost + p.rent;
  if (st.bank.checking + st.bank.savings + (creditLimit(st) - st.bank.credit) < total) return { ok: false, msg: `You cannot afford the move: ${money(total)}.` };
  pay(st, p.cost, 'equipment', `Moving costs to ${p.lot.addr}`);
  pay(st, p.rent, 'rent', `Rent, ${p.lot.addr} (first month)`);
  st.move = { lotId, start: st.time, end: st.time + p.days * MIN_PER_DAY, floor: p.floor, order: p.order, dropped: p.dropped, cost: p.cost, days: p.days };
  memo(st, { from: 'Leasing office', subject: `Lease signed: ${p.lot.addr}`, body: `The new lease on ${p.lot.addr} starts today: ${num(p.lot.sqft)} sq ft at ${money(p.lot.rent)} a month. Builders and movers need about ${p.days} days. The current plant keeps running until the new one is ready; until then you pay rent on both.` });
  bus.sound('place');
  return { ok: true, msg: `Move to ${p.lot.addr} under way: about ${p.days} days.`, plan: p };
}
export const moveProgress = st => st.move ? clamp((st.time - st.move.start) / (st.move.end - st.move.start), 0, 1) : 0;
function finishMove(st) {
  const mv = st.move, fl = st.floor, nf = mv.floor, lot = st.city.lots[mv.lotId];
  // equipment that could not come along is sold at its value
  for (const id of mv.dropped) { const o = fl.objects.find(x => x.id === id); if (!o) continue; if (o.value > 0) receive(st, Math.round(o.value), 'equipment', `${objectLabel(st, o)} sold in the move`); for (const e of st.employees) if (e.assign === id) e.assign = null; }
  const byId = new Map(fl.objects.map(o => [o.id, o]));
  const objs = [];
  for (const c of nf.objects) {
    if (c.fixed) { objs.push(c); continue; }
    const real = byId.get(c.id); if (!real) continue;
    real.x = c.x; real.y = c.y; real.rot = c.rot; objs.push(real);
  }
  // anything placed after the plan was made keeps its spot if it still fits, otherwise it is sold
  for (const o of fl.objects) if (!o.fixed && !objs.includes(o) && !mv.dropped.includes(o.id)) {
    const c = { ...o, y: o.y + (nf.h - fl.h) };
    if (!placementProblem({ ...nf, objects: objs }, c)) { o.y = c.y; objs.push(o); } else { if (o.value > 0) receive(st, Math.round(o.value), 'equipment', `${objectLabel(st, o)} sold in the move`); for (const e of st.employees) if (e.assign === o.id) e.assign = null; }
  }
  nf.objects = objs; nf.nextId = Math.max(fl.nextId, nf.nextId); nf.rev = (fl.rev || 0) + 1;
  const oldAddr = st.city.lots[st.lotId].addr;
  st.floor = nf; st.lotId = mv.lotId; st.rent = lot.rent; st.move = null;
  refreshOperators(st);
  for (const e of st.employees) { e.px = undefined; e.py = undefined; }
  memo(st, { from: 'Plant log', subject: `We have moved to ${lot.addr}`, important: true, sound: 'fanfare', body: `The new plant at ${lot.addr} is up and running: ${num(lot.sqft)} sq ft. Everything came across from ${oldAddr}${mv.dropped.length ? `, except ${mv.dropped.length} item${mv.dropped.length > 1 ? 's' : ''} that did not fit and ${mv.dropped.length > 1 ? 'were' : 'was'} sold` : ''}. Check the floor for anything that needs a new belt or safety zone.` });
}

// ---------------- production cells
const anCache = new WeakMap();
export function cellAnalysis(o, operators) {
  const key = `${o.layoutRev || 0}:${operators}:${o.recipe}`;
  let m = anCache.get(o); if (!m) { m = new Map(); anCache.set(o, m); }
  if (!m.has(key)) { if (m.size > 20) m.clear(); m.set(key, analyse(o, { operators, recipeInputs: o.recipe != null ? RECIPES[o.recipe].inputs.length : undefined })); }
  return m.get(key);
}
// what the items beyond the included minimum cost (cells and office suites)
const roomRequired = d => d.kind === 'suite' ? SUITE_REQUIRED : REQUIRED(d.family);
export const roomAnalyse = d => d.kind === 'suite' ? analyseSuite(d) : analyse(d);
export const roomPrice = d => d.kind === 'suite' ? suitePrice(d.cw, d.ch) : cellPrice(d.family, d.cw, d.ch);
export function cellExtrasCost(fam, items, kind = 'cell') {
  const left = Object.fromEntries((kind === 'suite' ? SUITE_REQUIRED : REQUIRED(fam)).map(r => [r.t, r.n]));
  let sum = 0; for (const it of items) { if (left[it.t] > 0) { left[it.t]--; continue; } sum += itemDef(it.t).price; }
  return sum;
}
export function cellProblem(st, draft, ignoreId = null) {
  const fl = st.floor, kind = draft.kind || 'cell', [mn, mx] = kind === 'suite' ? [SUITE_MIN, SUITE_MAX] : [MIN_SIZE, MAX_SIZE];
  if (draft.cw < mn[0] || draft.ch < mn[1]) return `${kind === 'suite' ? 'An office suite' : 'A cell'} must be at least ${mn[0]} × ${mn[1]} squares.`;
  if (draft.cw > mx[0] || draft.ch > mx[1]) return `${kind === 'suite' ? 'An office suite' : 'A cell'} can be at most ${mx[0]} × ${mx[1]} squares.`;
  const p = placementProblem(fl, { kind, x: draft.x, y: draft.y, cw: draft.cw, ch: draft.ch, hatches: draft.hatches, family: draft.family }, ignoreId);
  if (p) return p;
  for (const it of draft.items) { const d = itemDef(it.t); if (d.tech && !techDone(st, d.tech)) return `${d.name} needs ${TECHS[d.tech].name} research first.`; }
  return null;
}
export function buildCell(st, draft) {
  const fl = st.floor, kind = draft.kind || 'cell';
  if (countKind(fl, kind) >= KINDS[kind].max) return { ok: false, msg: `The most ${kind === 'suite' ? 'office suites' : 'cells'} a plant can have is ${KINDS[kind].max}.` };
  const prob = cellProblem(st, { ...draft, kind }); if (prob) return { ok: false, msg: prob };
  const a = roomAnalyse({ ...draft, kind }); if (!a.ok) return { ok: false, msg: a.problems[0] };
  const base = roomPrice({ ...draft, kind }), extras = cellExtrasCost(draft.family, draft.items, kind), price = base + extras;
  if (st.bank.checking + st.bank.savings + (creditLimit(st) - st.bank.credit) < price) return { ok: false, msg: `You cannot afford that. It costs ${money(price)}.` };
  const o = { kind, id: fl.nextId++, x: draft.x, y: draft.y, cw: draft.cw, ch: draft.ch, rot: 0, hatches: draft.hatches.map(h => ({ ...h })), items: draft.items.map(i => ({ ...i })), layoutRev: 1, value: price, cost: price, bought: st.time };
  if (kind === 'cell') {
    const recipe = draft.recipe != null && recipeAvailable(st, draft.recipe) ? draft.recipe : RECIPES.find(r => r.family === draft.family && r.start).id;
    Object.assign(o, { family: draft.family, recipe, mode: 'produce', operator: null, operators: [], produced: 0, producedMonth: 0, credits: 100, broken: false, repair: 0, eff: 0, effAvg: 0, progress: 0, inBuf: {}, status: 'No operator', research: null });
  }
  for (const [x, y] of footprint(o)) if (fl.zones[y * fl.w + x] === ZONE.SAFETY || fl.zones[y * fl.w + x] === ZONE.SMOKING || (kind === 'cell' && fl.zones[y * fl.w + x] === ZONE.CARPET)) fl.zones[y * fl.w + x] = ZONE.NONE;
  fl.objects.push(o); fl.rev++;
  pay(st, price, 'equipment', `Built ${objectLabel(st, o)}`);
  return { ok: true, obj: o, price };
}
// change a built room's hatches and furniture; new extras are paid for, removed extras refund 60% (all on the day they were bought)
export function editCell(st, id, items, hatches) {
  const fl = st.floor, o = fl.objects.find(x => x.id === id); if (!o || (o.kind !== 'cell' && o.kind !== 'suite')) return { ok: false, msg: 'No such room.' };
  const draft = { ...o, items, hatches };
  const prob = cellProblem(st, draft, id); if (prob) return { ok: false, msg: prob };
  const a = roomAnalyse(draft); if (!a.ok) return { ok: false, msg: a.problems[0] };
  if (o.kind === 'suite') { const n = st.employees.filter(e => e.assign === id).length; if (a.seats < n) return { ok: false, msg: `${n} people work here but there would only be ${a.seats} desk${a.seats > 1 ? 's' : ''}. Move someone out first.` }; }
  const before = cellExtrasCost(o.family, o.items, o.kind), after = cellExtrasCost(o.family, items, o.kind);
  const fresh = st.time - o.bought < MIN_PER_DAY;
  const delta = after >= before ? after - before : -Math.round((before - after) * (fresh ? 1 : 0.6));
  if (delta > 0 && st.bank.checking + st.bank.savings + (creditLimit(st) - st.bank.credit) < delta) return { ok: false, msg: `You cannot afford the changes (${money(delta)}).` };
  o.items = items.map(i => ({ ...i })); o.hatches = hatches.map(h => ({ ...h })); o.layoutRev = (o.layoutRev || 0) + 1; fl.rev++;
  const nm = objectLabel(st, o);
  if (delta > 0) pay(st, delta, 'equipment', `Refitted ${nm}`); else if (delta < 0) receive(st, -delta, 'equipment', `Extras sold from ${nm}`);
  o.value = Math.max(0, (o.value || 0) + delta); o.cost = (o.cost || 0) + Math.max(0, delta);
  return { ok: true, delta, msg: delta > 0 ? `${nm} refitted for ${money(delta)}.` : delta < 0 ? `${nm} refitted; ${money(-delta)} back for removed extras.` : `${nm} layout changed.` };
}
// the productivity bonus of the desk an office worker sits at in a suite (desks are taken in order of arrival)
export function suiteSeatBonus(st, o, e) {
  const a = analyseSuite(o), i = st.employees.filter(x => x.assign === o.id).indexOf(e);
  return i >= 0 && i < a.deskBonus.length ? a.deskBonus[i] : 0;
}
// cell technology research: any Research Engineer not running a research machine works on it
export function startTech(st, id) {
  const t = TECHS[id]; if (!t) return { ok: false, msg: 'No such technology.' };
  st.cellTech = st.cellTech || { done: {}, active: null };
  if (st.cellTech.done[id]) return { ok: false, msg: 'Already researched.' };
  if (st.cellTech.active) return { ok: false, msg: `Engineers are already researching ${TECHS[st.cellTech.active.id].name}.` };
  if (!has(st, 'researcher')) return { ok: false, msg: `Hire ${aTitle('researcher')} first.` };
  if (st.bank.checking + st.bank.savings + (creditLimit(st) - st.bank.credit) < t.cost) return { ok: false, msg: `You cannot afford it. It costs ${money(t.cost)}.` };
  pay(st, t.cost, 'misc', `Research: ${t.name}`);
  st.cellTech.active = { id, hours: 0, need: t.hours };
  return { ok: true, msg: `Research on ${t.name} started: about ${t.hours} engineer-hours.` };
}
export function techResearchers(st) { return st.employees.filter(e => hasRole(e, 'researcher') && !st.floor.objects.some(o => o.id === e.assign && o.mode === 'research')); }
function techStep(st, dt) {
  const a = st.cellTech?.active; if (!a) return;
  const rs = techResearchers(st).filter(e => e.act === 'work'); if (!rs.length) return;
  a.hours += rs.reduce((s, e) => s + (0.5 + skill(e)), 0) * dt / 60;
  if (a.hours >= a.need) {
    st.cellTech.done[a.id] = true; st.cellTech.active = null;
    const unlocks = Object.values(CELL_ITEMS).filter(d => d.tech === a.id).map(d => d.name);
    memo(st, { from: 'Engineering', subject: `Cell technology: ${TECHS[a.id].name}`, important: true, sound: 'research', body: `${TECHS[a.id].name} is done. These cell extras are now for sale: ${unlocks.join(', ')}.` });
  }
}

// Version 2 (spec 010): the fourteen separate jobs became seniority ladders. Each old job is the nearest (family, level);
// people start with the experience their level begins at, and adverts and waiting resumes are read the same way.
const JOB_V1 = { line_worker: 'operations_1', supervisor: 'operations_3', mechanic: 'maintenance_1', dev_engineer: 'engineering_1', chief_engineer: 'engineering_3',
  office_assistant: 'finance_1', bookkeeper: 'finance_2', finance_chief: 'finance_3', account_rep: 'sales_1', commercial_lead: 'sales_3', promotions: 'promotions_1',
  buyer: 'purchasing_1', supply_lead: 'purchasing_3', director: 'director' };
function toLadders(st) {
  for (const e of st.employees || []) {
    const was = e.job; e.job = JOB_V1[e.job] || e.job;
    if (was === 'chief_engineer') e.assign = null;            // the old Chief Engineer sat at a desk; the Engineering Director stays on the floor
    const lv = levelOf(e); e.xp = xpFloor(lv); e.growth = growthFor(lv, 0);
  }
  st.ads = (st.ads || []).map(a => ({ family: a.family || JOBS[JOB_V1[a.job] || a.job]?.family || 'director', placed: a.placed, until: a.until }));
  for (const m of st.memos || []) if (m.kind === 'resume' && m.data?.cand) { const c = m.data.cand; c.job = JOB_V1[c.job] || c.job; c.level = levelOf(c) || 1; }
}
// Bring older saves up to date. Each format change bumps VERSION and adds a step here, oldest first, with a fixture
// in test/fixtures/ that test/saves.mjs loads.
export function migrate(st) {
  if (!st) return st;
  if ((st.v || 1) > VERSION) throw new Error(`This save comes from a newer version of the game (format ${st.v}).`);
  if (st.floor) st.cellTech = st.cellTech || { done: {}, active: null };
  if ((st.v || 1) < 2) toLadders(st);
  st.v = VERSION;
  if (st.floor && st.phase === 'play') refreshOperators(st); // old status words ("Input empty", "Shift over") give way to the current ones
  return st;
}
// Input squares in use by the current product that have neither a belt nor a safety zone
export function unsafeInputs(fl, o, L = links(fl)) {
  if (o.kind !== 'machine' || o.recipe == null) return []; // cells: walls and the Safety metric instead
  return inputPorts(o).map(([x, y], k) => ({ x, y, k })).filter(({ x, y, k }) => portItem(o, k) != null && fl.zones[y * fl.w + x] !== ZONE.SAFETY && !L.netOf.has(y * fl.w + x));
}
// Which input square of `to` should take what `from` makes (or null)
export function inputFor(from, to) {
  if (!isProducer(from) || from.recipe == null || !isProducer(to) || to.recipe == null) return null;
  const k = RECIPES[to.recipe].inputs.findIndex(([i]) => i === RECIPES[from.recipe].out);
  return k < 0 ? null : k;
}
// Lay belts: machine output -> another machine's matching input square, machine output -> storage bin,
// or storage bin -> a machine's input square k (feeds that material from storage).
export function connectByBelt(st, fromId, toId, dryRun = false, k = null) {
  const fl = st.floor; const a = fl.objects.find(o => o.id === fromId), b = fl.objects.find(o => o.id === toId);
  if (!a || !b || !(isProducer(a) || a.kind === 'bin')) return { ok: false, msg: 'Pick a machine or storage bin to connect from.' };
  if (a === b) return { ok: false, msg: 'A machine cannot feed itself.' };
  if (a.kind === 'bin' && !isProducer(b)) return { ok: false, msg: 'A storage bin can only feed a machine input.' };
  if (isProducer(b)) {
    if (k == null) k = inputFor(a, b);
    if (k == null) return { ok: false, msg: `${objectLabel(st, b)} doesn't use ${a.recipe != null ? ITEMS[RECIPES[a.recipe].out].name : 'that'}. Retool one of them first.` };
    if (k >= inputPorts(b).length) return { ok: false, msg: 'That machine has no such input.' };
  }
  const path = autoRoute(fl, a, b, k ?? 0);
  if (!path) return { ok: false, msg: `No clear path for a belt from ${a.kind === 'bin' ? `storage bin #${a.id}` : objectLabel(st, a)} to ${b.kind === 'bin' ? `storage bin #${b.id}` : objectLabel(st, b)}. Clear or move equipment, storage zones or safety zones in the way.` };
  const price = path.length * priceOf({ kind: 'conveyor' });
  if (countKind(fl, 'conveyor') + path.length > KINDS.conveyor.max) return { ok: false, msg: `That needs ${path.length} belt sections, over the limit of ${KINDS.conveyor.max}.` };
  if (dryRun) return { ok: true, tiles: path.length, price, path, k };
  if (!path.length) return { ok: true, tiles: 0, price: 0, linked: [], msg: 'They are already connected.' };
  if (st.bank.checking + st.bank.savings + (creditLimit(st) - st.bank.credit) < price) return { ok: false, msg: `You cannot afford ${path.length} belt sections (${money(price)}).` };
  const before = linkSummary(fl);
  for (const [x, y] of path) {
    const i = y * fl.w + x; if (fl.zones[i] === ZONE.SAFETY) fl.zones[i] = ZONE.NONE;
    fl.objects.push({ kind: 'conveyor', x, y, rot: 0, id: fl.nextId++, value: priceOf({ kind: 'conveyor' }), cost: priceOf({ kind: 'conveyor' }), bought: st.time });
  }
  fl.rev++;
  pay(st, price, 'equipment', `Laid ${path.length} conveyor sections`);
  return { ok: true, tiles: path.length, price, k, linked: newLinks(st, before) };
}
export function moveEquipment(st, id, x, y, rot) {
  const o = st.floor.objects.find(o => o.id === id); if (!o || o.fixed) return { ok: false, msg: 'That cannot be moved.' };
  if (o.kind === 'cell' || o.kind === 'suite') return { ok: false, msg: 'Rooms are built in place. Edit its layout, or sell it and build a new one.' };
  if (o.kind === 'forklift' && st.employees.some(e => e.usingForklift === id)) return { ok: false, msg: "Can't move a forklift while someone is using it." };
  const next = { ...o, x, y, rot };
  const prob = placementProblem(st.floor, next, id);
  if (prob) return { ok: false, msg: prob };
  Object.assign(o, { x, y, rot }); st.floor.rev++;
  if (isProducer(o)) clearLocal(st, o);
  return { ok: true };
}
export function saleValue(st, o) { return Math.round((o.value || 0) * (st.time - (o.bought || 0) < MIN_PER_DAY ? 1 : 1)); }
export function sellEquipment(st, id) {
  const fl = st.floor; const o = fl.objects.find(o => o.id === id); if (!o || o.fixed) return { ok: false, msg: 'That cannot be sold.' };
  const justBought = st.time - o.bought < MIN_PER_DAY;
  let v = justBought ? o.cost : Math.round(o.value);
  let note = justBought ? 'returned for a full refund' : 'sold';
  if (!justBought && isProducer(o) && chance(st, 0.12)) { v = Math.round(v * 0.2); note = 'sold for scrap (no buyers this month)'; }
  if (isProducer(o)) {
    clearLocal(st, o);
    for (const e of st.employees) if (e.assign === id) e.assign = null;
  }
  if (o.kind === 'office' || o.kind === 'suite') for (const e of st.employees) if (e.assign === id) e.assign = null;
  if (o.kind === 'bin' || o.kind === 'conveyor') { /* buffers are abstract; nothing to move */ }
  fl.objects.splice(fl.objects.indexOf(o), 1); fl.rev++;
  if (v > 0) receive(st, v, 'equipment', `${objectLabel(st, o)} ${note}`);
  liquidateOverflow(st);
  return { ok: true, msg: `${objectLabel(st, o)} ${note} for ${money(v)}.` };
}
// if storage shrinks below stock, sell the surplus at half value
export function liquidateOverflow(st) {
  let over = -freeBoxes(st); if (over <= 0) return;
  const ids = Object.keys(st.inventory).map(Number).sort((a, b) => st.city.market[a].price - st.city.market[b].price);
  for (const id of ids) {
    if (over <= 0) break;
    const units = Math.min(st.inventory[id], over * ITEMS[id].pack);
    const v = units * st.city.market[id].price * 0.5;
    addInventory(st, id, -units); over -= Math.ceil(units / ITEMS[id].pack);
    receive(st, v, 'misc', `Liquidated ${num(units)} ${ITEMS[id].name}`);
    memo(st, { from: 'Plant log', subject: 'Inventory liquidated', body: `${num(units)} ${ITEMS[id].name} unit(s) were sold off for ${money(v)} because there was no storage space left for them.` });
  }
}
export function setRecipe(st, id, recipeId) {
  const o = st.floor.objects.find(o => o.id === id); if (!o || !isProducer(o)) return { ok: false, msg: 'No such machine.' };
  if (RECIPES[recipeId].family !== o.family) return { ok: false, msg: 'This machine cannot make that product.' };
  if (!recipeAvailable(st, recipeId)) return { ok: false, msg: "We don't know how to make that yet. Research it first." };
  if (o.recipe === recipeId && o.mode === 'produce') return { ok: true };
  const cost = Math.round(FAMILIES[o.family].price * ECONOMY.retoolShare);
  clearLocal(st, o);
  o.recipe = recipeId; o.mode = 'produce'; o.research = null; o.progress = 0;
  refreshStatus(st, o, true);
  pay(st, cost, 'equipment', `Retooled ${objectLabel(st, o)} for ${ITEMS[RECIPES[recipeId].out].name}`);
  return { ok: true, msg: `Retooled for ${ITEMS[RECIPES[recipeId].out].name} at a cost of ${money(cost)}.` };
}
export const recipeAvailable = (st, rid) => RECIPES[rid].start || !!st.research.unlocked[rid];
export function startResearch(st, id, recipeId) {
  const o = st.floor.objects.find(o => o.id === id); if (!o || o.kind !== 'machine') return { ok: false, msg: o?.kind === 'cell' ? 'Cells only produce. Research new products on a machine.' : 'No such machine.' };
  if (RECIPES[recipeId].family !== o.family) return { ok: false, msg: 'This machine family cannot research that product.' };
  if (recipeAvailable(st, recipeId)) return { ok: false, msg: 'We already know how to make that.' };
  clearLocal(st, o);
  o.mode = 'research';
  const locked = RECIPES.filter(r => r.family === o.family && !r.start);
  const rank = locked.findIndex(r => r.id === recipeId);
  const need = Math.round(140 * (1 + rank * 0.35) * (st.city.aiKnown[recipeId] ? 0.55 : 1));
  o.research = { target: recipeId, hours: 0, need };
  refreshStatus(st, o);
  return { ok: true, msg: `Research on ${ITEMS[RECIPES[recipeId].out].name} started: about ${need} engineer-hours.` };
}

// ---------------- staff
export function assign(st, empId, objId) {
  const e = st.employees.find(e => e.id === empId); if (!e) return { ok: false, msg: 'No such employee.' };
  if (objId == null) { e.assign = null; refreshOperators(st); return { ok: true }; }
  const o = st.floor.objects.find(o => o.id === objId); if (!o) return { ok: false, msg: 'No such workplace.' };
  if (o.kind === 'suite') {
    if (!isWhite(e)) return { ok: false, msg: "Can't assign a floor worker to an office." };
    const seats = analyseSuite(o).seats, used = st.employees.filter(x => x.assign === objId && x.id !== empId).length;
    if (used >= seats) return { ok: false, msg: `All ${seats} desk${seats > 1 ? 's' : ''} in suite #${o.id} are taken. Add a desk to it first.` };
  } else if (o.kind === 'office') {
    if (!isWhite(e)) return { ok: false, msg: "Can't assign a floor worker to an office." };
    const cur = st.employees.find(x => x.assign === objId && x.id !== empId);
    if (cur) return { ok: false, msg: `${fullName(cur)} already works there.` };
  } else if (o.kind === 'cell') {
    if (!canRunMachine(e)) return { ok: false, msg: `${aOrAn(JOBS[e.job].title, true)} doesn't work in production cells. Hire ${aTitle('operator')}.` };
    const crew = st.employees.filter(x => x.assign === objId && x.id !== empId).length;
    if (crew >= 6) return { ok: false, msg: 'Six operators is the most a cell can use.' };
  } else if (o.kind === 'machine') {
    if (o.mode === 'research' && !hasRole(e, 'researcher')) return { ok: false, msg: `A machine doing research needs ${aTitle('researcher')} at it.` };
    if (o.mode !== 'research' && !canRunMachine(e)) return { ok: false, msg: `${aOrAn(JOBS[e.job].title, true)} doesn't run machines. Hire ${aTitle('operator')}.` };
    const cur = st.employees.find(x => x.assign === objId && x.id !== empId);
    if (cur) return { ok: false, msg: `${fullName(cur)} already runs that machine.` };
  } else return { ok: false, msg: 'People can only be assigned to machines and offices.' };
  e.assign = objId; refreshOperators(st);
  return { ok: true, msg: `${fullName(e)} assigned to ${objectLabel(st, o)}.` };
}
function refreshOperators(st) {
  for (const o of st.floor.objects) if (isProducer(o)) {
    o.operator = st.employees.find(e => e.assign === o.id)?.id ?? null;
    if (o.kind === 'cell') o.operators = st.employees.filter(e => e.assign === o.id).map(e => e.id);
    refreshStatus(st, o);
  }
}
// ---------------- machine status between ticks
export const isShift = t => { const m = minuteOfDay(t); return isWorkday(t) && m >= WORK_START && m < WORK_END; };
const STALE_STATUS = /^(|Idle|No operator|Plant closed|Shift over|Input empty|Research: no engineer)$/;
// Bring a machine's status up to date without running the clock: when someone is assigned or taken off, when the
// plant closes, when a game is loaded. A machine that is staffed during the shift keeps what the last tick found,
// unless that was a stale "nobody here" (or `force` is set, after a retool).
export function refreshStatus(st, o, force = false) {
  if (!isProducer(o)) return;
  if (o.broken) { o.status = 'Broken'; return; }
  const staffed = staffedBy(st, o);
  if (o.mode === 'research') {
    const op = o.operator != null ? st.employees.find(e => e.id === o.operator) : null;
    if (!o.research) o.status = 'Research: no project';
    else if (!op || !hasRole(op, 'researcher')) o.status = 'Research: no engineer';
    else if (!isShift(st.time)) o.status = STATUS.closed;
    else if (STALE_STATUS.test(o.status || '')) o.status = `Research ${Math.min(99, Math.floor(o.research.hours / o.research.need * 100))}%`;
    return;
  }
  if (o.recipe == null) { o.status = 'Idle'; return; }
  if (!staffed) { o.status = STATUS.noOperator; o.eff = 0; return; }
  if (!isShift(st.time)) { o.status = STATUS.closed; return; }
  if (!force && !STALE_STATUS.test(o.status || '')) return;
  if (o.kind === 'cell' && !cellAnalysis(o, st.employees.filter(e => e.assign === o.id).length).ok) { o.status = 'Layout incomplete'; return; }
  const block = outputBlock(st, o), r = RECIPES[o.recipe];
  o.status = block === 'belt' ? 'Output blocked: belt full' : block === 'storage' ? 'Output full: storage full'
    : starvedInputs(st, o).length ? 'Out of materials'
    : r.inputs.every(([it, q]) => (o.inBuf?.[it] || 0) >= q / r.outQty - 1e-9) ? 'Running' : 'Waiting for materials';
}

// ---------------- stalled machines: a notice for the owner
// A machine that has been starved or blocked for STALL_NOTICE_MIN shift minutes in a row gets one note from the plant
// log. A stall ends when the machine makes a unit. The same machine is not noticed again within STALL_REPEAT_MIN,
// notices that fall due in the same game hour share one memo, and at most STALL_MEMOS_PER_DAY go out in a game day
// (what is held back goes out the next morning if it is still stuck; Needs attention lists it meanwhile).
// The memory is not saved: after a load a machine that is still stuck may be noticed once more.
export const STALL_NOTICE_MIN = 30, STALL_REPEAT_MIN = 1440, STALL_MEMOS_PER_DAY = 3;
const stallMemory = new WeakMap();
const stallLine = (st, o, s) => `${objectLabel(st, o)}: ${s.reason}: ${s.fix}.`;
function trackStalls(st, machines, ran, inShift, t, dt) {
  let mem = stallMemory.get(st); if (!mem) stallMemory.set(st, mem = { by: new Map(), day: -1, sent: 0, group: null });
  const belt = beltStock(st), due = [];
  for (const o of machines) {
    let s = mem.by.get(o.id);
    const stall = ran.has(o.id) || o.mode !== 'produce' || !staffedBy(st, o) ? null : stallOf(st, o, belt);
    if (!stall) { if (s) { s.mins = 0; s.sent = false; } continue; }
    if (!s) mem.by.set(o.id, s = { mins: 0, sent: false, last: null });
    if (inShift) s.mins += dt;
    if (!s.sent && s.mins >= STALL_NOTICE_MIN && (s.last == null || t - s.last >= STALL_REPEAT_MIN)) due.push({ o, s, stall });
  }
  if (!due.length) return;
  const day = dayIndex(t), slot = Math.floor(t / 60), g = mem.group; // slot: the game hour a notice falls in
  if (mem.day !== day) { mem.day = day; mem.sent = 0; }
  const entries = due.map(({ o, stall }) => ({ id: o.id, line: stallLine(st, o, stall) }));
  const text = es => es.length === 1 ? { subject: `Machine stopped: ${objectLabel(st, machines.find(m => m.id === es[0].id))}`, body: es[0].line } : { subject: `${es.length} machines stopped`, body: es.map(e => '• ' + e.line).join('\n') };
  if (g && g.slot === slot && st.memos.some(m => m.id === g.memoId)) {
    // another machine falls due in the hour of the last notice: add it to that memo
    g.entries.push(...entries);
    Object.assign(st.memos.find(m => m.id === g.memoId), text(g.entries), { read: false });
  } else {
    if (mem.sent >= STALL_MEMOS_PER_DAY) return;
    const urgent = !ran.size && !machines.some(o => o.mode === 'produce' && /Running/.test(o.status || ''));
    const m = memo(st, { from: 'Plant log', ...text(entries), important: urgent });
    mem.sent++; mem.group = { slot, memoId: m.id, entries };
  }
  for (const { s } of due) { s.sent = true; s.last = t; }
}
// ---------------- learning and promotion (spec 010)
// Each worked day earns experience; at the thresholds a person steps up a level on their own, keeping their place on the
// pay scale, and the skill they have learned shows in `growth`.
function learn(st, e) {
  if (!JOBS[e.job]?.family) return;                           // the Plant Director has nowhere to climb
  if (e.assign == null && !hasRole(e, 'maintenance') && !hasRole(e, 'foreman')) return;   // no post, no learning (mechanics and supervisors work without one)
  e.xp = (e.xp ?? xpFloor(levelOf(e))) + dailyXp(e, jobFit(e.attrs, e.job));
  const from = JOBS[e.job];
  if (from.next && e.xp >= xpFloor(from.level + 1)) promote(st, e, from, JOBS[from.next]);
  e.growth = growthFor(levelOf(e), levelProgress(e));
}
function promote(st, e, from, to) {
  const ratio = payRatio(st, e), was = e.salary;                // before the job changes
  e.job = to.key;
  e.salary = Math.round(marketSalary(st, e.job) * ratio / 100) * 100;
  e.lastRaise = st.time; e.morale = clamp(e.morale + 6, 0, 100);
  memo(st, { from: 'Personnel', subject: `${fullName(e)} is now ${aOrAn(to.title)}`,
    body: `${fullName(e)} has learned the work and moves up from ${from.title} to ${to.title}. Pay goes from ${money(was)} to ${money(e.salary)} a year, in line with the city's pay for the new job. ${to.level === 3 ? 'That is the top of the ladder.' : 'The next step is Director.'}` });
}
export function terminate(st, empId) {
  const i = st.employees.findIndex(e => e.id === empId); if (i < 0) return { ok: false };
  const e = st.employees[i];
  const sev = Math.round(e.salary / 26);
  pay(st, sev + e.salary / 260 * e.accruedDays, 'personnel', `Final pay and severance, ${fullName(e)}`);
  st.employees.splice(i, 1); refreshOperators(st);
  for (const x of st.employees) x.morale = clamp(x.morale - 2, 0, 100);
  return { ok: true, msg: `${fullName(e)} was let go with ${money(sev)} severance.` };
}
export function review(st, empId, raisePct) {
  const e = st.employees.find(e => e.id === empId); if (!e) return { ok: false };
  e.lastReview = st.time;
  if (raisePct > 0) {
    e.salary = Math.round(e.salary * (1 + raisePct / 100) / 100) * 100; e.lastRaise = st.time;
    e.morale = clamp(e.morale + 4 + raisePct * 1.5, 0, 100); e.stress = clamp(e.stress - raisePct, 0, 100);
    return { ok: true, msg: `${fullName(e)} received a ${raisePct}% raise to ${money(e.salary)} a year.` };
  }
  e.morale = clamp(e.morale - 4, 0, 100);
  return { ok: true, msg: `${fullName(e)} was reviewed without a raise.` };
}
// One advert per family of jobs (or for the Plant Director); who answers it, and at which level, is luck (spec 011).
export function placeAd(st, family) {
  const t = AD_TARGETS.find(x => x.key === family); if (!t) return { ok: false, msg: 'There is no such job to advertise.' };
  if (st.ads.some(a => a.family === family && a.until > st.time)) return { ok: false, msg: `An ad for ${t.name} is already running.` };
  const cost = family === 'director' ? ECONOMY.seniority.directorAdCost : ECONOMY.seniority.adCost;
  st.ads.push({ family, placed: st.time, until: st.time + 7 * MIN_PER_DAY });
  pay(st, cost, 'misc', `Help-wanted ad: ${t.name}`);
  return { ok: true, msg: `Ad placed for ${t.name} (${money(cost)}). Resumes will arrive in the In-basket over the next week.` };
}
// the level of an applicant: mostly Juniors, sometimes a Senior, rarely a Director
export function applicantJob(st, family) {
  if (family === 'director') return 'director';
  let r = rand(st, 0, 1); const w = ECONOMY.seniority.resumeLevels;
  for (let i = 0; i < 3; i++) { r -= w[i]; if (r < 0) return `${family}_${i + 1}`; }
  return `${family}_1`;
}
export function makeOffer(st, memoId, salary) {
  const m = st.memos.find(m => m.id === memoId); if (!m || m.kind !== 'resume' || m.data.hired || m.data.gone) return { ok: false, msg: 'That applicant is no longer available.' };
  const c = m.data.cand;
  const drive = A(c, 'drive');
  const floorAsk = c.ask * (0.9 + drive / 1000);
  if (salary >= floorAsk) {
    const e = hire(st, c, Math.round(salary / 100) * 100);
    m.data.hired = true; m.read = true;
    autoPlace(st, e);
    return { ok: true, msg: `${fullName(e)} accepted ${money(e.salary)} a year and joins as ${JOBS[e.job].title}.`, emp: e };
  }
  m.data.tries = (m.data.tries || 0) + 1;
  if (m.data.tries >= 2 && chance(st, 0.45)) { m.data.gone = true; return { ok: false, msg: `${c.first} ${c.last} is no longer interested in working for us.` }; }
  return { ok: false, msg: `${c.first} ${c.last} turned down ${money(salary)}. ${c.female ? 'She' : 'He'} asked for ${money(c.ask)}.` };
}
// new hires take the first free suitable workplace
export function autoPlace(st, e) {
  const fl = st.floor; if (!fl) return;
  const taken = new Set(st.employees.filter(x => x.assign != null).map(x => x.assign));
  let cand = null;
  if (isWhite(e)) cand = fl.objects.find(o => o.kind === 'office' && !taken.has(o.id)) || fl.objects.find(o => o.kind === 'suite' && st.employees.filter(x => x.assign === o.id).length < analyseSuite(o).seats);
  else if (hasRole(e, 'operator')) cand = fl.objects.find(o => isProducer(o) && o.mode === 'produce' && !taken.has(o.id));
  else if (hasRole(e, 'researcher')) cand = fl.objects.find(o => o.kind === 'machine' && o.mode === 'research' && !taken.has(o.id));
  if (cand) assign(st, e.id, cand.id);
}

// ---------------- purchasing
export function placeOrder(st, itemId, firmId, boxes, auto = false) {
  boxes = Math.floor(boxes); if (boxes <= 0) return { ok: false, msg: 'Order at least one box.' };
  const v = vendorsFor(st, itemId).find(v => v.firm === firmId); if (!v) return { ok: false, msg: 'That vendor does not sell this.' };
  const key = firmId + ':' + itemId; const used = st.vendorBought[key] || 0;
  if (used + boxes > v.monthlyBoxes) {
    const left = v.monthlyBoxes - used;
    if (left <= 0) return { ok: false, msg: `${v.name} has no more ${ITEMS[itemId].name} to sell us this month.` };
    boxes = left;
  }
  st.vendorBought[key] = used + boxes;
  const order = { id: st.nextId++, item: itemId, firm: firmId, vendor: v.name, boxes, boxPrice: v.boxPrice, quality: v.quality, t: st.time, eta: deliveryTime(st, st.time + v.minutes + (st.city.eventMul?.freight || 0) * MIN_PER_DAY), auto };
  st.orders.push(order);
  st.city.market[itemId].playerBought += boxes * ITEMS[itemId].pack;
  return { ok: true, msg: `Ordered ${plural(boxes, 'box', 'boxes')} of ${ITEMS[itemId].name} from ${v.name} for ${money(boxes * v.boxPrice)}. Arrives around ${fmtShortDate(order.eta)}.`, order };
}
// deliveries only arrive during business hours on workdays
function deliveryTime(st, t) {
  let x = t;
  for (let guard = 0; guard < 20; guard++) {
    const m = minuteOfDay(x);
    if (!isWorkday(x)) { x = x - m + MIN_PER_DAY + WORK_START; continue; }
    if (m < WORK_START) { x = x - m + WORK_START + 30; continue; }
    if (m > WORK_END - 30) { x = x - m + MIN_PER_DAY + WORK_START + 30; continue; }
    return x;
  }
  return x;
}
export const allOnOrder = st => st.orders.reduce((s, o) => s + o.boxes, 0);
export const roomForOrders = st => Math.max(0, freeBoxes(st) - allOnOrder(st) - Math.round(storageCapacity(st.floor) * 0.15));
export const onOrderBoxes = (st, id) => st.orders.filter(o => o.item === id).reduce((s, o) => s + o.boxes, 0);
export function bestVendor(st, itemId) {
  const vs = vendorsFor(st, itemId);
  let best = null, bs = Infinity;
  for (const v of vs) {
    const left = v.monthlyBoxes - (st.vendorBought[v.firm + ':' + itemId] || 0); if (left <= 0) continue;
    const s = v.boxPrice * (1 + v.minutes / 3000) * (1.25 - v.quality / 300);
    if (s < bs) { bs = s; best = v; }
  }
  return best;
}
// units per workday our machines would use at full speed
export function dailyUse(st, itemId) {
  let u = 0;
  for (const o of st.floor?.objects || []) if (isProducer(o) && o.mode === 'produce' && o.recipe != null) {
    const r = RECIPES[o.recipe]; const q = r.inputs.find(([i]) => i === itemId)?.[1];
    if (q) u += unitsPerHour(o.recipe) / r.outQty * q * 8;
  }
  return u;
}
export function suggestedTargets(st) {
  const out = {};
  for (const id of ownInputs(st)) {
    if (ITEMS[id].tier !== 'material' && st.floor.objects.some(o => isProducer(o) && o.mode === 'produce' && RECIPES[o.recipe].out === id)) continue;
    out[id] = Math.max(2, Math.ceil(dailyUse(st, id) * 3 / ITEMS[id].pack));
  }
  // keep at least 40% of storage free for finished goods
  const cap = storageCapacity(st.floor) * 0.6, total = Object.values(out).reduce((s, v) => s + v, 0);
  if (total > cap) for (const k of Object.keys(out)) out[k] = Math.max(1, Math.floor(out[k] * cap / total));
  return out;
}
export function purchaseAll(st) {
  const msgs = []; let n = 0;
  const targets = Object.keys(st.targets).length ? st.targets : suggestedTargets(st);
  for (const [id, target] of Object.entries(targets)) {
    const need = Math.min(target - boxesOf(st, +id) - onOrderBoxes(st, +id), roomForOrders(st));
    if (need <= 0) continue;
    const v = bestVendor(st, +id); if (!v) { msgs.push(`No vendor has ${ITEMS[id].name} left this month.`); continue; }
    const r = placeOrder(st, +id, v.firm, need); if (r.ok) n++; else msgs.push(r.msg);
  }
  return { ok: n > 0, msg: n ? `Placed ${plural(n, 'order')}.${msgs.length ? ' ' + msgs.join(' ') : ''}` : (msgs.join(' ') || 'Stock is already at target levels.') };
}

// ---------------- bank
const pctRate = r => `${+(r * 100).toFixed(2)}%`;
export function loanRate(st, years) { const b = ECONOMY.bank; return +(b.loanBase + years * b.loanPerYear + st.bank.loans.length * b.loanPerLoan + (st.bank.credit > 0 ? b.loanIfCredit : 0)).toFixed(4); }
export function maxLoan(st) { return Math.max(0, Math.round((Math.max(0, netWorth(st)) * 0.8 + 150000 - st.bank.loans.reduce((s, l) => s + l.balance, 0)) / 1000) * 1000); }
export function takeLoan(st, amount, years) {
  amount = Math.round(amount);
  if (st.bank.loans.length >= 5) return { ok: false, msg: 'The bank allows at most five loans at once.' };
  if (amount < 5000) return { ok: false, msg: 'The smallest loan is $5,000.' };
  if (amount > maxLoan(st)) return { ok: false, msg: `The bank will lend at most ${money(maxLoan(st))} right now.` };
  const l = addLoan(st, amount, years, 'Loan proceeds');
  return { ok: true, msg: `Borrowed ${money(amount)} for ${years} years at ${(l.rate * 100).toFixed(2)}%. Monthly payment ${money(l.payment)}.` };
}
function addLoan(st, amount, years, label) {
  const rate = loanRate(st, years), n = years * 12, i = rate / 12;
  const payment = Math.round(amount * i / (1 - Math.pow(1 + i, -n)) * 100) / 100;
  const l = { id: st.nextId++, principal: amount, balance: amount, rate, months: n, left: n, payment, t: st.time };
  st.bank.loans.push(l);
  receive(st, amount, 'loan', `${label} (${years} yr at ${(rate * 100).toFixed(2)}%)`);
  return l;
}
export function payOffLoan(st, id) {
  const l = st.bank.loans.find(l => l.id === id); if (!l) return { ok: false };
  if (st.bank.checking < l.balance) return { ok: false, msg: `Paying it off needs ${money(l.balance)} in checking.` };
  pay(st, l.balance, 'loans', 'Loan paid off'); st.bank.loans.splice(st.bank.loans.indexOf(l), 1);
  memo(st, { from: BANK, subject: 'Loan cleared', kind: 'bank', body: 'You paid off the whole balance early. The loan is closed and nothing more is due on it.' });
  return { ok: true, msg: 'Loan paid in full.' };
}
export function transfer(st, from, amount) {
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return { ok: false, msg: 'Enter an amount above zero.' };
  const to = from === 'checking' ? 'savings' : 'checking';
  if (st.bank[from] < amount) return { ok: false, msg: `There is only ${money(st.bank[from])} in ${from}.` };
  st.bank[from] -= amount; st.bank[to] += amount;
  txn(st, from === 'checking' ? -amount : amount, `Transfer ${from} to ${to}`, 'transfer');
  return { ok: true, msg: `Moved ${money(amount)} from ${from} to ${to}.` };
}
export function payCreditLine(st, amount) {
  amount = Math.min(amount, st.bank.credit, st.bank.checking);
  if (amount <= 0) return { ok: false, msg: 'Nothing to repay, or no money in checking.' };
  st.bank.checking -= amount; st.bank.credit -= amount; txn(st, -amount, 'Credit line repayment', 'loan');
  return { ok: true, msg: `Repaid ${money(amount)} of the credit line.` };
}

// ================= the clock =================
export function advance(st, minutes) {
  const end = st.time + minutes;
  while (st.time < end && !st.over) {
    const m = minuteOfDay(st.time);
    const work = isWorkday(st.time) && m >= 6 * 60 && m < 18 * 60;
    let dt = work ? 5 : Math.min(60, MIN_PER_DAY - m, m < 6 * 60 ? 6 * 60 - m : MIN_PER_DAY - m);
    dt = Math.min(dt, end - st.time);
    step(st, dt);
  }
}

function step(st, dt) {
  const t0 = st.time, t1 = st.time + dt;
  const m0 = minuteOfDay(t0), m1 = m0 + dt; // m1 may equal 1440
  const wd = isWorkday(t0);
  if (wd && m0 < 6 * 60 && m1 >= 6 * 60) startOfDay(st);
  if (wd && m0 >= WORK_START - 60 && m0 < WORK_END + 60 && st.phase === 'play') work(st, t0, dt);
  st.time = t1;
  if (st.move && st.time >= st.move.end && st.phase === 'play') finishMove(st);
  if (wd && m0 < 15 * 60 && m1 >= 15 * 60 && st.phase === 'play') ship(st);
  if (wd && m0 < WORK_END && m1 >= WORK_END && st.phase === 'play') endOfDay(st);
  if (dayIndex(t1) !== dayIndex(t0)) {
    if (monthKey(t1) !== monthKey(t0) && st.phase === 'play') endOfMonth(st);
  }
}

function startOfDay(st) {
  if (st.phase !== 'play') return;
  const smoking = st.floor.zones.includes(ZONE.SMOKING);
  for (const e of st.employees) {
    if (e.injuredUntil > st.time) { e.schedule = null; e.state = 'injured'; continue; }
    if (st.strike && !isWhite(e)) { e.schedule = null; e.state = 'strike'; continue; }
    e.state = null; e.schedule = planDay(st, e, smoking); e.workedMin = 0;
  }
  // resumes from running ads
  for (const ad of st.ads) {
    if (ad.until <= st.time) continue;
    const n = Math.floor(rand(st, 0, 1.2 + st.city.f * 0.9) + (st.time - ad.placed < MIN_PER_DAY ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const c = makeCandidate(st, applicantJob(st, ad.family));
      memo(st, { from: `${c.first} ${c.last}`, subject: `Resume: ${JOBS[c.job].title}`, kind: 'resume', data: { cand: c, expires: st.time + 14 * MIN_PER_DAY } });
    }
  }
  st.ads = st.ads.filter(a => a.until > st.time);
  for (const m of st.memos) if (m.kind === 'resume' && !m.data.hired && !m.data.gone && m.data.expires < st.time) m.data.gone = true;
  // accounts receivable and payable that fall due today
  const delay = accountingDelay(st);
  let lateFees = 0;
  const feeBefore = lateFeeThisMonth(st);
  for (const a of [...st.ar]) if (a.due + delay * MIN_PER_DAY <= st.time) { st.ar.splice(st.ar.indexOf(a), 1); receive(st, a.amount, 'sales', `Payment received: ${a.desc}`); st.dept.txToday = (st.dept.txToday || 0) + 1; }
  for (const b of [...st.ap]) if (b.due <= st.time) {
    st.ap.splice(st.ap.indexOf(b), 1);
    let amt = b.amount;
    if (delay > 3) { const fee = Math.round(amt * 0.015 * Math.ceil(delay / 7)); pay(st, fee, 'fines', `${LATE_FEE}, paid ${plural(delay, 'day')} late: ${b.desc}`); lateFees += fee; }
    pay(st, amt, 'purchases', `Paid invoice: ${b.desc}`);
    st.dept.txToday = (st.dept.txToday || 0) + 1;
  }
  if (lateFees > 0 && !feeBefore) lateFeeMemo(st, lateFees, delay);
  autoPurchase(st);
  // outside repair service for broken machines when we have no maintenance staff
  if (!st.employees.some(e => hasRole(e, 'maintenance') && !e.state)) for (const o of st.floor.objects) if (isProducer(o) && o.broken) {
    const fee = Math.round(FAMILIES[o.family].price * ECONOMY.outsideRepairShare);
    pay(st, fee, 'running', `Outside repair service, ${objectLabel(st, o)}`); o.broken = false; o.repair = 0; o.credits = 70;
    memo(st, { from: 'Plant log', subject: `${objectLabel(st, o)} repaired`, body: `An outside repair service fixed ${objectLabel(st, o)} for ${money(fee)}. ${aTitle('maintenance', true)} on staff would do this for the price of a salary.` });
  }
}

function autoPurchase(st) {
  const staff = st.employees.filter(e => hasRole(e, 'purchasing') && !e.state);
  if (!staff.length) return;
  let cap = Math.max(1, Math.round(st.dept.purchCap || staff.length * 4));
  const targets = Object.keys(st.targets).length ? st.targets : suggestedTargets(st);
  for (const [id, target] of Object.entries(targets)) {
    if (cap <= 0) { if (!st.flags.purchWarn || st.time - st.flags.purchWarn > 21 * MIN_PER_DAY) { st.flags.purchWarn = st.time; memo(st, { from: 'Purchasing', subject: 'Reorders are piling up', body: `Some reorders had to wait for another day. One more ${titleFor('purchasing')} would keep up.` }); } break; }
    const need = Math.min(target - boxesOf(st, +id) - onOrderBoxes(st, +id), roomForOrders(st));
    if (need <= 0) continue;
    const v = bestVendor(st, +id); if (!v) continue;
    if (placeOrder(st, +id, v.firm, need, true).ok) cap--;
  }
}

// The first late fee in a game month gets a memo saying why. Read from this month's statement lines, so nothing new is saved.
const LATE_FEE = 'Late-payment fee';
function lateFeeThisMonth(st) { const m = monthKey(st.time); return st.bank.txns.some(t => t.kind === 'fines' && t.desc.startsWith(LATE_FEE) && monthKey(t.t) === m); }
function lateFeeMemo(st, fees, delay) {
  const fin = titleFor('finance'), a = /^[AEIOU]/i.test(fin) ? 'An' : 'A';
  const why = has(st, 'finance')
    ? `Finance is behind on the books, so bills go out late. One more ${fin} would catch up and pay them on time.`
    : `Bills go out late when nobody keeps the books. ${a} ${fin} would pay them on time, and customers would pay you sooner too.`;
  memo(st, { from: 'Plant log', subject: 'Suppliers charged late fees', body: `Suppliers added ${money(fees)} in late fees because bills were paid ${plural(delay, 'day')} late. ${why}` });
}
export function accountingDelay(st) {
  const staff = st.employees.filter(e => hasRole(e, 'finance'));
  if (!staff.length) return 6;
  return clamp(Math.round(st.dept.backlog / Math.max(1, st.dept.acctCap)), 0, 30);
}

// ---------------- the working day
function work(st, t0, dt) {
  const minute = minuteOfDay(t0), inShift = minute >= WORK_START && minute < WORK_END;
  const fl = st.floor;
  // who is where
  const smokingZ = fl.zones.includes(ZONE.SMOKING);
  for (const e of st.employees) {
    if (!e.schedule && !e.state) e.schedule = planDay(st, e, smokingZ);
    e.act = e.state || activityAt(e, minute);
    if (e.act === 'work') e.workedMin = (e.workedMin || 0) + dt;
  }
  // deliveries
  for (const o of [...st.orders]) if (o.eta <= t0 + dt) receiveOrder(st, o);
  const L = links(fl);
  const machines = fl.objects.filter(o => isProducer(o));
  const foremen = st.employees.filter(e => hasRole(e, 'foreman') && e.act === 'work');
  const foremanBoost = foremen.length ? Math.min(1, foremen.length * 10 / Math.max(1, machines.length)) * foremen.reduce((s, e) => s + skill(e), 0) / foremen.length * 0.18 : 0;
  const carts = countKind(fl, 'handcart'), forks = countKind(fl, 'forklift');
  const minPerBox = forks * 4 >= machines.length && forks ? 0.35 : carts * 3 >= machines.length && carts ? 0.8 : forks || carts ? 1.2 : 2.0;
  const maint = st.employees.filter(e => hasRole(e, 'maintenance') && e.act === 'work');
  let maintPower = maint.reduce((s, e) => s + skill(e), 0) * dt / 60;
  techStep(st, dt);
  syncLanes(st, L);
  const ran = new Set(); let beltMap = null; // machines that made a unit this step; boxes on belts, built when first needed
  const equip = forks * 4 >= machines.length && forks ? 'forklift' : carts * 3 >= machines.length && carts ? 'cart' : forks || carts ? 'cart' : 'hand';
  for (const o of machines) {
    const isCell = o.kind === 'cell';
    const crew = isCell ? st.employees.filter(e => e.assign === o.id) : [];
    const present = isCell ? crew.filter(e => e.act === 'work') : [];
    // a cell's crew acts as one operator with the average skill and morale of whoever is at work
    const op = isCell ? (present.length ? { skill: present.reduce((a, e) => a + skill(e), 0) / present.length, morale: present.reduce((a, e) => a + e.morale, 0) / present.length, act: 'work', crew: present } : null)
      : o.operator != null ? st.employees.find(e => e.id === o.operator) : null;
    o.tray = o.tray || 0; o.inBuf = o.inBuf || {};
    if (o.mode !== 'research') pushOutput(st, o);
    // maintenance: broken machines first, then lowest credits
    if (o.broken) { o.status = 'Broken'; continue; }
    if (o.mode === 'research') { researchStep(st, o, op, dt); continue; }
    if (o.recipe == null) { o.status = 'Idle'; continue; }
    if (isCell && !crew.length) { o.status = 'No operator'; o.eff = 0; continue; }
    if (isCell && !present.length) { o.status = crew.some(e => e.state === 'strike') ? 'Crew on walkout' : inShift ? 'Crew away' : STATUS.closed; continue; }
    if (!op) { o.status = 'No operator'; o.eff = 0; continue; }
    if (op.act !== 'work') { o.status = op.state === 'strike' ? 'Operator on walkout' : inShift ? 'Operator away' : STATUS.closed; continue; }
    const r = RECIPES[o.recipe], pack = ITEMS[r.out].pack;
    const CA = isCell ? cellAnalysis(o, present.length) : null;
    if (CA && !CA.ok) { o.status = 'Layout incomplete'; continue; }
    const rate = unitsPerHour(o.recipe) * (CA ? CA.speedMult : 1);
    const opSkill = isCell ? op.skill : skill(op);
    const fOp = (0.45 + 0.55 * opSkill) * (0.75 + 0.25 * op.morale / 100);
    const fMaint = 0.85 + 0.15 * o.credits / 100;
    const eff = clamp(fOp * (1 + foremanBoost) * fMaint, 0, 1.15);
    // labour this step: the operator (or the crew) either runs the machine or carries boxes
    const crewN = isCell ? present.length : 1;
    let busy = 0;
    if (o.trip) { busy = Math.min(o.trip.left, dt); o.trip.left -= busy; if (o.trip.left <= 1e-9) finishTrip(st, o); }
    if (!o.trip) { const t = planTrip(st, o, L, equip, isCell ? present[0] : op); if (t) { o.trip = t; const more = Math.min(t.left, dt - busy); t.left -= more; busy += more; if (t.left <= 1e-9) finishTrip(st, o); } }
    const prodMin = Math.max(0, crewN * dt - busy) / crewN;
    const yf = CA ? 92 / CA.metrics.yield : 1; // a cell's yield above the standard 92% saves material
    let can = rate * eff * prodMin / 60 + o.progress;
    let made = 0, why = null;
    const trayMax = BUF_BOXES * pack;
    while (can >= 1) {
      // inputs come only from what is at the machine: delivered by belt or carried in
      let ok = true;
      for (const [it, q] of r.inputs) if ((o.inBuf[it] || 0) < q * yf / r.outQty - 1e-9) { ok = false; break; }
      // out of materials means an input has nothing anywhere it can be got from; stock that is still on its way is waiting
      if (!ok) { why = starvedInputs(st, o, beltMap ||= beltStock(st)).length ? 'Out of materials' : 'Waiting for materials'; break; }
      if (o.tray + 1 > trayMax + 1e-9) { pushOutput(st, o); if (o.tray + 1 > trayMax + 1e-9) { why = o.outLanes ? 'Output blocked: belt full' : freeBoxes(st) <= 0 ? 'Output full: storage full' : 'Output tray full'; break; } }
      for (const [it, q] of r.inputs) {
        o.inBuf[it] -= q * yf / r.outQty; if (o.inBuf[it] <= 1e-9) delete o.inBuf[it];
        st.quality['in' + it] = st.quality['in' + it] ?? 55;
      }
      o.tray += 1;
      // product quality: input quality blended with operator skill
      const qIn = r.inputs.reduce((s, [it]) => s + (st.quality['in' + it] ?? 55), 0) / r.inputs.length;
      const q = 0.6 * qIn + 40 * opSkill + 10 + (CA ? (CA.metrics.quality - 45) * 0.4 : 0);
      st.quality[r.out] = (st.quality[r.out] ?? q) * 0.995 + q * 0.005;
      made++; can -= 1;
      pushOutput(st, o);
    }
    o.progress = can >= 1 ? 0 : can;
    if (made) ran.add(o.id);
    o.status = made ? 'Running' : why || (o.trip && prodMin <= 0 ? (o.trip.out ? 'Carrying boxes to storage' : 'Fetching materials') : 'Running');
    // Wear, breakdowns and accidents below follow the old "Running" test, so what the player is told can change
    // without changing the economy: a machine idling with nothing to work on says so but is still counted as running.
    const running = o.status === 'Running';
    if (!made && running && starvedInputs(st, o, beltMap ||= beltStock(st)).length) o.status = 'Out of materials';
    if (made) {
      o.produced += made; o.producedMonth += made;
      st.stats.producedMonth[r.out] = (st.stats.producedMonth[r.out] || 0) + made; st.ledger.produced += made;
      pay(st, FAMILIES[o.family].price / ECONOMY.runningDivisor * (st.city.eventMul?.power || 1) * dt / 60, 'running', null);
    }
    o.eff = made ? eff * prodMin / dt : (running ? eff : 0);
    o.effAvg = o.effAvg * 0.97 + (running ? eff * prodMin / dt : 0) * 0.03;
    // wear and breakdowns
    o.credits = Math.max(0, o.credits - 100 / FAMILIES[o.family].mtbf * dt / 60 * 0.9);
    const hazard = (0.004 + (o.credits < 25 ? 0.05 : 0)) * dt / 60 * (CA ? 1.5 - CA.metrics.uptime / 100 : 1);
    if (running && chance(st, hazard)) {
      o.broken = true; o.repair = 0; o.status = 'Broken';
      memo(st, { from: 'Plant log', subject: `${objectLabel(st, o)} broke down`, important: !maint.length, sound: 'breakdown', body: `${objectLabel(st, o)} has stopped with a fault.${maint.length ? ` ${aTitle('maintenance', true)} is on the way.` : ` Nobody on staff can fix it, so an outside repair service comes first thing tomorrow.`}` });
    }
    // accidents at hand-fed input squares without a safety zone (each one adds risk)
    if (running && !o.broken && isCell) {
      // inside a cell the walls keep hands out of hatches; the Safety metric sets the risk
      if (chance(st, 0.0045 * (1.5 - CA.metrics.safety / 100) * dt / 60)) { const who = present[randInt(st, 0, present.length - 1)]; accident(st, o, who, true); }
    } else if (running && !o.broken) {
      const unsafe = unsafeInputs(fl, o, L).length;
      if (unsafe && chance(st, 0.0045 * unsafe / r.inputs.length * dt / 60 * (1.4 - A(op, 'caution') / 100))) accident(st, o, op);
    }
  }
  laneStep(st, dt);
  trackStalls(st, machines, ran, inShift, t0 + dt, dt);
  // maintenance crews: repair broken machines, then top up credits
  if (maintPower > 0) {
    const order = machines.filter(o => o.broken).concat(machines.filter(o => !o.broken).sort((a, b) => a.credits - b.credits));
    for (const o of order) {
      if (maintPower <= 0) break;
      if (o.broken) { const use = Math.min(maintPower, (1 - o.repair) * 4); o.repair += use / 4; maintPower -= use; if (o.repair >= 0.999) { o.broken = false; o.repair = 0; o.credits = 85; bus.push(`${objectLabel(st, o)} is repaired.`); bus.sound('repair'); } }
      else if (o.credits < 98) { const use = Math.min(maintPower, (100 - o.credits) / 30); o.credits = Math.min(100, o.credits + use * 30); maintPower -= use; }
    }
  }
}

function researchStep(st, o, op, dt) {
  if (!o.research) { o.status = 'Research: no project'; return; }
  if (!op || !hasRole(op, 'researcher')) { o.status = 'Research: no engineer'; return; }
  if (op.act !== 'work') { o.status = 'Research: engineer away'; return; }
  const dir = st.employees.find(e => hasRole(e, 'research_lead') && e.act === 'work');
  o.research.hours += dt / 60 * (0.5 + skill(op)) * (1 + (dir ? 0.5 * skill(dir) : 0));
  o.status = `Research ${Math.min(99, Math.floor(o.research.hours / o.research.need * 100))}%`;
  if (o.research.hours >= o.research.need) {
    const rid = o.research.target, r = RECIPES[rid];
    if (chance(st, 0.85)) {
      st.research.unlocked[rid] = true; st.research.done.push({ rid, t: st.time });
      o.research = null; o.mode = 'produce';
      memo(st, { from: 'Engineering', subject: `Ready to make: ${ITEMS[r.out].name}`, important: true, sound: 'research', body: `Engineering has a working ${ITEMS[r.out].name} process. You can now retool any ${FAMILIES[r.family].name} machine for it. ${objectLabel(st, o)} has gone back to its old product.` });
    } else {
      o.research.hours = o.research.need * 0.5;
      memo(st, { from: 'Engineering', subject: `${ITEMS[r.out].name} trial failed`, body: `The first ${ITEMS[r.out].name} run didn't pass inspection, so the project is back to about half done. We do know the bill of materials now: ${r.inputs.map(([i, q]) => `${q} × ${ITEMS[i].name}`).join(', ')}.` });
    }
  }
}

function accident(st, o, op, inCell = false) {
  const fine = Math.round(rand(st, 2500, 12000) / 100) * 100;
  pay(st, fine, 'fines', `Insurance deductible, accident at ${objectLabel(st, o)}`);
  op.injuredUntil = st.time + randInt(st, 2, 8) * MIN_PER_DAY; op.state = 'injured'; op.act = 'injured';
  for (const e of st.employees) e.morale = clamp(e.morale - 6, 0, 100);
  memo(st, { from: 'Insurance carrier', subject: 'Accident on the floor', important: true, sound: 'accident', body: inCell ? `${fullName(op)} was hurt in ${objectLabel(st, o)} and will be out for several days. Our deductible is ${money(fine)}. Guards, fans, mats and a less crowded layout raise a cell's Safety.` : `${fullName(op)} was hurt at an input of ${objectLabel(st, o)} and will be out for several days. Our deductible is ${money(fine)}. Hand-fed machine inputs need a safety zone in front of them.` });
}

function receiveOrder(st, o) {
  st.orders.splice(st.orders.indexOf(o), 1);
  const space = freeBoxes(st);
  const fits = Math.max(0, Math.min(o.boxes, space));
  if (fits < o.boxes) {
    memo(st, { from: 'Shipping dock', subject: 'Delivery partly refused', body: `${o.vendor} delivered ${o.boxes} boxes of ${ITEMS[o.item].name}, but we only had room for ${fits}. The rest went back. We need more storage space.` });
  }
  if (fits <= 0) return;
  const units = fits * ITEMS[o.item].pack;
  const qk = 'in' + o.item, have = st.inventory[o.item] || 0;
  st.quality[qk] = ((st.quality[qk] ?? o.quality) * have + o.quality * units) / (have + units);
  addInventory(st, o.item, units); bus.sound('delivery');
  const amount = fits * o.boxPrice;
  st.ap.push({ amount, due: st.time + 10 * MIN_PER_DAY, desc: `${ITEMS[o.item].name} from ${o.vendor}` });
  st.dept.txToday = (st.dept.txToday || 0) + 1;
  st.stats.boughtMonth = st.stats.boughtMonth || {}; st.stats.boughtMonth[o.item] = (st.stats.boughtMonth[o.item] || 0) + fits;
}

// ---------------- sales (daily, 3 pm)
export function salesAttractiveness(st, id) {
  const m = st.city.market[id];
  const price = st.prices[id] ?? m.price;
  const r = price / m.price;
  const q = st.quality[id] ?? 55;
  const mktF = 1 + 0.7 * st.dept.awareness;
  return { r, A: st.dept.salesEff * mktF * Math.pow(q / 55, 0.6) * Math.pow(r, -3), price };
}
function ship(st) {
  let total = 0;
  const lines = [], dayLog = [];
  for (const [ids, units] of Object.entries(st.inventory)) {
    const id = +ids; if (ITEMS[id].tier === 'material' || !isSelling(st, id) || units < 1) continue;
    const m = st.city.market[id];
    const D = m.demand / WORKDAYS_PER_MONTH * (st.flags.special === id ? EVENTS.contract.demand : 1);
    const aiDaily = m.supply / WORKDAYS_PER_MONTH;
    const unmet = Math.max(0, D - aiDaily), contested = Math.min(D, aiDaily);
    const { r, A, price } = salesAttractiveness(st, id);
    const nEff = Math.max(1, m.producers * 0.75);
    let want = unmet * clamp(2 - r, 0, 1) * (0.4 + 0.6 * Math.min(1, st.dept.salesEff)) + contested * A / (A + nEff);
    want *= rand(st, 0.85, 1.15);
    const sold = Math.floor(Math.min(units, want));
    if (sold < 1) continue;
    const bonus = st.flags.special === id ? 1 + EVENTS.contract.premium : 1;
    const amount = sold * price * bonus;
    addInventory(st, id, -sold);
    st.ar.push({ amount, due: st.time + 14 * MIN_PER_DAY, desc: `${num(sold)} ${ITEMS[id].name}` });
    m.playerSold += sold;
    st.stats.soldMonth[id] = (st.stats.soldMonth[id] || 0) + sold;
    st.stats.revenueMonth[id] = (st.stats.revenueMonth[id] || 0) + amount;
    st.ledger.sold += sold; total += amount;
    lines.push(`${num(sold)} ${ITEMS[id].name}`); dayLog.push({ id, units: sold, amount });
    st.dept.txToday = (st.dept.txToday || 0) + 1;
  }
  // daily record for the sales charts (kept for about 4 months of workdays)
  const by = {}; for (const l of dayLog) by[l.id] = [l.units, Math.round(l.amount)];
  (st.salesDaily ||= []).push({ t: st.time, rev: Math.round(total), units: dayLog.reduce((s, l) => s + l.units, 0), by });
  if (st.salesDaily.length > 90) st.salesDaily.splice(0, st.salesDaily.length - 90);
  if (total > 0) {
    st.lastShip = { t: st.time, lines, total };
    if (!st.flags.firstDollar) {
      st.flags.firstDollar = true;
      memo(st, { from: 'Finance', subject: 'First order shipped', important: true, sound: 'fanfare', body: `The first truck just left: ${lines.join(', ')}, invoiced at ${money(total)}. Expect the money in about two weeks.` });
    } else { bus.push(`Shipped ${lines.join(', ')} for ${money(total)}.`); bus.sound('ship'); }
  }
}

// ---------------- end of the working day: departments, morale, payroll
function endOfDay(st) {
  const emp = st.employees;
  const worked = e => clamp((e.workedMin || 0) / 480, 0, 1);
  const officeBonus = e => { const o = st.floor.objects.find(o => o.id === e.assign && (o.kind === 'office' || o.kind === 'suite')); if (!o) return 0.3; if (o.kind === 'office') return 1 + OFFICES[o.officeType].bonus; return 1 + suiteSeatBonus(st, o, e); };
  const pres = emp.filter(e => hasRole(e, 'chief'));
  const presBoost = 1 + pres.reduce((s, e) => s + skill(e) * worked(e), 0) * 0.1;
  // output of the office staff who do a job (finance, sales, ...), lifted by that job's leads and the director
  const deptPower = (role, perUnit) => {
    const staff = emp.filter(e => hasRole(e, role) && isWhite(e));
    const mgr = staff.filter(e => JOBS[e.job].lead);
    const mgrBoost = 1 + mgr.reduce((s, e) => s + skill(e) * worked(e), 0) * 0.3;
    return staff.reduce((s, e) => s + skill(e) * worked(e) * (0.7 + 0.3 * e.morale / 100) * officeBonus(e), 0) * perUnit * mgrBoost * presBoost;
  };
  st.dept.acctCap = deptPower('finance', 30);
  st.dept.purchCap = deptPower('purchasing', 8);
  st.dept.salesEff = clamp(0.35 + deptPower('sales', 0.32), 0.35, 3);
  st.dept.mkt = deptPower('marketing', 1);
  st.dept.awareness = clamp(st.dept.awareness * 0.985 + st.dept.mkt * 0.012, 0, 1);
  const tx = (st.dept.txToday || 0) + Math.ceil(emp.length / 8);
  st.dept.txToday = 0;
  st.dept.backlog = Math.max(0, st.dept.backlog + tx - st.dept.acctCap);
  if (has(st, 'finance') && st.dept.backlog > st.dept.acctCap * 4 && (!st.flags.acctWarn || st.time - st.flags.acctWarn > 10 * MIN_PER_DAY)) {
    st.flags.acctWarn = st.time;
    memo(st, { from: 'Finance', subject: 'The books are falling behind', body: `About ${num(st.dept.backlog)} transactions are waiting to be posted. Customers pay late when invoices go out late, and suppliers are adding late fees. One more ${titleFor('finance')} would catch us up.` });
  }
  // morale and stress
  const smoking = st.floor.zones.includes(ZONE.SMOKING);
  const fore = emp.filter(e => hasRole(e, 'foreman'));
  for (const e of emp) {
    e.accruedDays = (e.accruedDays || 0) + 1;
    learn(st, e);
    if (e.state === 'injured' && e.injuredUntil <= st.time) e.state = null;
    const pr = payRatio(st, e);
    let target = 58 + clamp((pr - 1) * 110, -35, 22);
    const off = st.floor.objects.find(o => o.id === e.assign);
    if (isWhite(e) && off?.kind === 'suite') { const a = analyseSuite(off); target += suiteSeatBonus(st, off, e) * 20 + (a.comfort - 50) / 5; }
    else if (isWhite(e)) { if (!off) target -= 15; else { target += OFFICES[off.officeType].bonus * 20 + (OFFICES[off.officeType].morale || 0); const [cx, cy] = [off.x + 1, off.y + 1]; if (st.floor.zones[cy * st.floor.w + cx] === ZONE.CARPET) target += 5; } }
    else if (fore.length) target += 6 * fore.reduce((s, f) => s + skill(f), 0) / fore.length;
    if (e.assign == null && !hasRole(e, 'maintenance') && !hasRole(e, 'foreman') && !hasRole(e, 'chief')) target -= 8;
    if (A(e, 'smoker') > 62 && !smoking) target -= 8;
    if (st.time - e.lastRaise > 270 * MIN_PER_DAY) target -= 6;
    target -= (A(e, 'grumbling') - 50) / 6;
    if (st.strike && !isWhite(e)) target -= 10;
    e.morale = clamp(e.morale + (target - e.morale) * 0.08, 0, 100);
    const load = hasRole(e, 'finance') ? clamp(st.dept.backlog / Math.max(1, st.dept.acctCap) / 5, 0, 1) : 0;
    e.stress = clamp(e.stress + (e.morale < 35 ? 1.6 : -0.8) + load * 2 + (50 - A(e, 'calm')) / 120 - (fore.length && !isWhite(e) ? 0.4 : 0), 0, 100);
    if (e.stress > 86 && !e.warnedEdge) { e.warnedEdge = true; memo(st, { from: 'Personnel', subject: `${fullName(e)} is struggling`, body: `${fullName(e)} (${JOBS[e.job].title}) is badly stressed. A raise, a talk at review time or less work would help before it turns into a resignation.` }); }
    if (e.stress < 70) e.warnedEdge = false;
    if (e.stress >= 100) {
      memo(st, { from: fullName(e), subject: 'I quit', important: true, body: `${fullName(e)} has handed in a resignation, effective today. The stress of the job was too much.` });
      st.employees.splice(st.employees.indexOf(e), 1);
      pay(st, e.salary / 260 * e.accruedDays, 'personnel', `Final pay, ${fullName(e)}`);
    } else if (pr < 0.9 && e.morale < 40 && !e.raiseAsked && chance(st, 0.02)) {
      e.raiseAsked = true;
      const ask = Math.round(marketSalary(st, e.job) * 1.02 / 100) * 100;
      memo(st, { from: fullName(e), subject: 'Request for a raise', kind: 'raise', important: true, data: { emp: e.id, ask }, body: `${fullName(e)} (${JOBS[e.job].title}) wants ${money(ask)} a year, or will start looking for another job. Others in town with this title make about ${money(marketSalary(st, e.job))}.` });
    }
    e.workedMin = 0;
  }
  st.employees.forEach(e => { if (!e.injuredUntil || e.injuredUntil <= st.time) { if (e.state === 'injured') e.state = null; } });
  // payday every other Friday
  if (weekday(st.time) === 5) {
    st.series.push({ t: st.time, cash: Math.round(st.bank.checking + st.bank.savings - st.bank.credit), nw: Math.round(netWorth(st)) });
    if (st.series.length > 260) st.series.shift();
    st.flags.week = (st.flags.week || 0) + 1;
    if (st.flags.week % 2 === 0 && emp.length) payday(st);
  }
  // president's advice every Monday
  if (weekday(st.time) === 1) presidentAdvice(st);
  refreshOperators(st); // also sets every staffed machine to "Plant closed" for the night
  if (st.strike) strikeCheck(st);
}

function payday(st) {
  let total = 0;
  for (const e of st.employees) { total += e.salary / 260 * e.accruedDays * 1.08; e.accruedDays = 0; }
  pay(st, total, 'personnel', `Payroll for ${plural(st.employees.length, 'employee')}`);
  bus.push(`Payday: ${money(total)} paid to staff.`); bus.sound('payday');
}

function presidentAdvice(st) {
  const tips = [];
  const fl = st.floor; const machines = fl.objects.filter(o => isProducer(o));
  if (!machines.length) tips.push('The floor has no machines yet. Buy one from the Catalog.');
  if (machines.some(o => o.operator == null && o.mode === 'produce')) tips.push('A machine is standing idle with nobody to run it.');
  const white = st.employees.filter(isWhite);
  if (white.some(e => e.assign == null)) tips.push('An office worker has no desk. Buy an office and seat them in it.');
  if (!has(st, 'finance') && st.employees.length >= 3) tips.push(`Nobody keeps the books. Without ${aTitle('finance')}, customers pay late and our own bills slip.`);
  if (!has(st, 'sales') && st.ledger.produced > 0) tips.push(`Goods only sell to walk-in customers. ${aTitle('sales', true)} would win far more orders.`);
  if (!has(st, 'purchasing') && machines.length >= 2) tips.push(`With no ${titleFor('purchasing')}, you place every material order yourself.`);
  if (machines.some(o => o.broken) && !has(st, 'maintenance')) tips.push(`${aTitle('maintenance', true)} would service machines before they break.`);
  if (machines.length >= 3 && !countKind(fl, 'handcart') && !countKind(fl, 'forklift')) tips.push('Operators carry every box by hand. A pallet jack or forklift would free them up.');
  for (const o of machines) { if (o.mode !== 'produce' || o.recipe == null) continue; if (unsafeInputs(fl, o).length) { tips.push(`${objectLabel(st, o)} has an input square with no safety zone.`); break; } }
  if (freeBoxes(st) < 15) tips.push('Storage is almost out of room. Paint more storage or sell some stock.');
  if (!tips.length) return;
  const key = tips.join('|');
  if (key === st.flags.lastAdvice && st.time - (st.flags.lastAdviceT || 0) < 28 * MIN_PER_DAY) return;
  st.flags.lastAdvice = key; st.flags.lastAdviceT = st.time;
  const chief = st.employees.find(e => hasRole(e, 'chief'));
  memo(st, { from: chief ? fullName(chief) : 'Plant log', subject: 'To do this week', body: tips.map(t => '• ' + t).join('\n') });
}

export function settleStrike(st) {
  if (!st.strike) return { ok: false, msg: 'Nobody is out.' };
  const pctRaise = Math.round(ECONOMY.walkoutRaise * 100);
  for (const e of st.employees) if (!isWhite(e)) { e.salary = Math.round(e.salary * (1 + ECONOMY.walkoutRaise) / 100) * 100; e.lastRaise = st.time; e.morale = clamp(e.morale + 15, 0, 100); e.state = null; }
  st.strike = null;
  memo(st, { from: 'Crew representative', subject: 'Back to work', body: `The floor crew took the ${pctRaise}% raise and will be at their machines tomorrow.` });
  return { ok: true, msg: `Walkout over: floor staff get ${pctRaise}% more.` };
}
function strikeCheck(st) {
  if (st.time - st.strike.since > ECONOMY.walkoutDays * MIN_PER_DAY) {
    settleStrike(st);
    memo(st, { from: 'Mediator', subject: 'Walkout settled by mediation', body: `After ${ECONOMY.walkoutDays} days the mediator ruled for the crew: an ${Math.round(ECONOMY.walkoutRaise * 100)}% raise for everyone on the floor, starting now.` });
  }
}

// ---------------- month end
function endOfMonth(st) {
  const prevKey = st.ledger.month;
  // interest
  const si = st.bank.savings * ECONOMY.bank.savingsRate / 12; if (si > 0.5) { st.bank.savings += si; st.ledger.income.interest += si; txn(st, si, 'Savings interest', 'interest'); }
  if (st.bank.credit > 0) pay(st, st.bank.credit * ECONOMY.bank.creditRate / 12, 'loans', 'Credit line interest');
  for (const l of [...st.bank.loans]) {
    const interest = l.balance * l.rate / 12; const principal = Math.min(l.balance, l.payment - interest);
    l.balance -= principal; l.left--;
    pay(st, interest + principal, 'loans', 'Loan payment');
    if (l.left <= 0 || l.balance < 1) { st.bank.loans.splice(st.bank.loans.indexOf(l), 1); memo(st, { from: BANK, subject: 'Final loan payment made', kind: 'bank', body: 'That was the last scheduled payment. The loan is closed.' }); }
  }
  // depreciation
  for (const o of st.floor.objects) if (!o.fixed) o.value = Math.round(o.value * 0.985);
  // archive the month
  const snap = { month: prevKey, ...JSON.parse(JSON.stringify(st.ledger)), sold: { ...st.stats.soldMonth }, revenue: { ...st.stats.revenueMonth }, producedBy: { ...st.stats.producedMonth }, bought: { ...(st.stats.boughtMonth || {}) },
    machines: st.floor.objects.filter(o => isProducer(o)).map(o => ({ id: o.id, recipe: o.recipe, produced: o.producedMonth, eff: o.effAvg })),
    netWorth: Math.round(netWorth(st)), cash: Math.round(st.bank.checking + st.bank.savings) };
  st.history.push(snap); if (st.history.length > 48) st.history.shift();
  const salesTotal = Object.values(st.stats.revenueMonth).reduce((s, v) => s + v, 0);
  const prodTotal = Object.values(st.stats.producedMonth).reduce((s, v) => s + v, 0);
  if (salesTotal > 0 && salesTotal > st.stats.bestSales && st.history.length > 1) memo(st, { from: 'Finance', subject: 'Best sales month yet', body: `We sold ${money(salesTotal)} worth of goods last month, more than in any month before.` });
  if (prodTotal > 0 && prodTotal > st.stats.bestProd && st.history.length > 1) memo(st, { from: 'Plant log', subject: 'Busiest month on the floor', body: `The plant turned out ${num(prodTotal)} units last month. We have never made more.` });
  st.stats.bestSales = Math.max(st.stats.bestSales, salesTotal); st.stats.bestProd = Math.max(st.stats.bestProd, prodTotal);
  st.stats.salesTrend.push(salesTotal); st.stats.prodTrend.push(prodTotal);
  const tr = st.stats.salesTrend; if (tr.length >= 4 && tr[tr.length - 1] < tr[tr.length - 2] && tr[tr.length - 2] < tr[tr.length - 3] && tr[tr.length - 3] < tr[tr.length - 4]) memo(st, { from: 'Finance', subject: 'Three down months', body: 'Sales have dropped for three months in a row. Keep a close eye on cash until they pick up.' });
  st.stats.soldMonth = {}; st.stats.revenueMonth = {}; st.stats.producedMonth = {}; st.stats.boughtMonth = {};
  for (const o of st.floor.objects) if (isProducer(o)) o.producedMonth = 0;
  st.vendorBought = {}; st.flags.special = null;
  newLedger(st);
  // rent
  pay(st, st.rent, 'rent', `Rent, ${st.city.lots[st.lotId].addr}`);
  if (st.move) pay(st, st.city.lots[st.move.lotId].rent, 'rent', `Rent, ${st.city.lots[st.move.lotId].addr} (moving in)`);
  for (const o of st.floor.objects) if (o.kind === 'office') pay(st, 40, 'running', null); else if (o.kind === 'suite') pay(st, 40 * Math.max(1, analyseSuite(o).seats), 'running', null);
  // the city moves on
  monthlyEvents(st);
  recomputeMarket(st, st.city);
  // labor unrest
  const blue = st.employees.filter(e => !isWhite(e));
  if (!st.strike && blue.length >= 4) {
    const pr = blue.reduce((s, e) => s + payRatio(st, e), 0) / blue.length, mo = blue.reduce((s, e) => s + e.morale, 0) / blue.length;
    if (pr < 0.92 && mo < 42 && chance(st, 0.6)) {
      st.strike = { since: st.time };
      memo(st, { from: 'Crew representative', subject: 'The floor crew has walked out', kind: 'strike', important: true, sound: 'whistle', body: `The floor crew stopped work over pay and want ${Math.round(ECONOMY.walkoutRaise * 100)}% more. No machine runs until it's settled. You can settle on the Staff page, or wait for a mediator after ${ECONOMY.walkoutDays} days.` });
    }
  }
  // cash-flow memo
  const last = st.history[st.history.length - 1];
  const flow = last.income.sales + last.income.misc - Object.values(last.expense).reduce((s, v) => s + v, 0);
  const cash = st.bank.checking + st.bank.savings;
  if (has(st, 'finance') || st.history.length % 3 === 0)
    memo(st, { from: 'Finance', subject: 'Cash this month', kind: 'report', body: flow < 0 ? `We spent ${money(-flow)} more than we took in last month. At that rate the ${money(cash)} in the bank covers about ${Math.max(0, Math.floor(cash / -flow))} more month(s).` : `We took in ${money(flow)} more than we spent last month, and have ${money(cash)} in the bank.` });
  if (cash < 50000 && cash >= 0) memo(st, { from: 'Finance', subject: 'Cash is low', important: true, body: `Only ${money(cash)} is left in the bank. Borrow, sell stock or cut spending soon.` });
  // scenario obligations
  if (st.obligation && !st.obligation.done) {
    const ob = st.obligation, nw = netWorth(st), left = ob.deadline - monthKey(st.time), from = ob.from || 'Backer';
    if (nw >= ob.target) { ob.done = 'met'; memo(st, { from, subject: 'Target reached', important: true, body: `The business is now worth ${money(nw)}, past the ${money(ob.target)} we agreed. Nothing more is owed.` }); }
    else if (left <= 0) {
      ob.done = 'missed';
      if (ob.kind === 'equity') { st.vcShare = ob.share; memo(st, { from, subject: 'Target missed', important: true, body: `We fell short of ${money(ob.target)} by the deadline, so ${Math.round(ob.share * 100)}% of the company now belongs to our investor. Your score counts only your share.` }); }
      else { pay(st, ob.penalty, 'misc', 'Repayment to backer'); memo(st, { from, subject: 'Target missed', important: true, body: `The business didn't reach ${money(ob.target)} in time, so ${money(ob.penalty)} has gone back to the lender as agreed.` }); }
    } else if (left % 3 === 0) memo(st, { from, subject: 'Checking in on the target', body: `${plural(left, 'month')} to go until the deadline. The business needs to grow by another ${money(ob.target - nw)}.` });
  }
  // bankruptcy
  if (st.bank.credit > creditLimit(st)) {
    st.flags.overLimit = (st.flags.overLimit || 0) + 1;
    if (st.flags.overLimit >= 2 && netWorth(st) < 0) {
      st.over = { reason: 'bankrupt', t: st.time, score: score(st) };
      memo(st, { from: BANK, subject: 'Credit line called in', important: true, body: 'We have called in the credit line. The business owes more than it owns and cannot pay, so it closes today.' });
    } else memo(st, { from: BANK, subject: 'Over your credit limit', important: true, body: `You owe ${money(st.bank.credit)} on the credit line, more than its ${money(creditLimit(st))} limit. Get under the limit by next month, or we will call it in and close the business.` });
  } else st.flags.overLimit = 0;
  st.flags.autosave = true; bus.sound('bell');
}

export function answerRaise(st, memoId, accept) {
  const m = st.memos.find(m => m.id === memoId); if (!m || m.kind !== 'raise' || m.data.done) return { ok: false, msg: 'Already handled.' };
  const e = st.employees.find(e => e.id === m.data.emp); m.data.done = true; m.read = true;
  if (!e) return { ok: false, msg: 'That employee has left.' };
  e.raiseAsked = false;
  if (accept) { e.salary = m.data.ask; e.lastRaise = e.lastReview = st.time; e.morale = clamp(e.morale + 15, 0, 100); e.stress = clamp(e.stress - 10, 0, 100); return { ok: true, msg: `${fullName(e)} now earns ${money(e.salary)} a year.` }; }
  if (chance(st, 0.5)) { st.employees.splice(st.employees.indexOf(e), 1); refreshOperators(st); pay(st, e.salary / 260 * e.accruedDays, 'personnel', `Final pay, ${fullName(e)}`); return { ok: true, msg: `${fullName(e)} has resigned.` }; }
  e.morale = clamp(e.morale - 12, 0, 100);
  return { ok: true, msg: `${fullName(e)} is staying, but is unhappy about it.` };
}

// ---------------- misc actions
export function hireAdvisor(st) {
  const fee = ECONOMY.advisorFee;
  if (st.bank.checking < fee) return { ok: false, msg: `A business advisor costs ${money(fee)}, more than we have in checking.` };
  pay(st, fee, 'misc', 'Business advisor');
  memo(st, { from: 'Business advisor', subject: 'How the business looks from outside', kind: 'report', body: advisorReport(st) });
  return { ok: true, msg: "The advisor's notes are in your In-basket." };
}
export function buyBrief(st, firmId) {
  const f = st.city.firms[firmId]; if (!f || !f.alive) return { ok: false, msg: 'No such company.' };
  const fee = ECONOMY.briefFee;
  if (st.bank.checking < fee) return { ok: false, msg: `A market intelligence brief costs ${money(fee)}, more than we have in checking.` };
  pay(st, fee, 'misc', 'Market intelligence brief');
  let body;
  if (f.kind === 'vendor') body = `${f.name} supplies ${f.sells.map(i => ITEMS[i].name).join(', ')}. It prices ${Math.round((f.priceMul - 1) * 100)}% off the going rate, and its goods rate ${f.quality} for quality. Worth about ${money(f.netWorth)}.`;
  else { const r = RECIPES[f.recipe]; const units = f.value * f.scale / ITEMS[r.out].unit; body = `${f.name} turns out about ${num(units)} ${ITEMS[r.out].name} a month, worth ${money(f.value * f.scale)}, from ${r.inputs.map(([i]) => ITEMS[i].name).join(', ')}. Quality ${f.quality}; prices ${Math.round((f.priceMul - 1) * 100)}% off the going rate. Worth about ${money(f.netWorth)}.`; }
  memo(st, { from: 'Market intelligence', subject: `Profile: ${f.name}`, kind: 'report', body });
  return { ok: true, msg: 'The brief is in your In-basket.' };
}
export function cityRanks(st) {
  const rows = st.city.firms.filter(f => f.alive).map(f => ({ name: f.name, nw: f.netWorth, you: false }));
  rows.push({ name: st.setup.company, nw: Math.round(netWorth(st)), you: true });
  return rows.sort((a, b) => b.nw - a.nw);
}
export { DEPTS };
