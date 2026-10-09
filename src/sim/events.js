// Monthly city events and the business advisor's assessment.
import { ITEMS, RECIPES, FAMILIES, EVENTS } from '../gen/data.js';
import { hasRole, jobFor, aOrAn, FIRM_PREFIX, FIRM_SUFFIX, LAST } from '../core/content.js';
import { rand, pick, chance, clamp, money, num, pct } from '../core/util.js';
import { memo, isSelling, netWorth, freeBoxes, salesAttractiveness, accountingDelay, unsafeInputs } from './game.js';
import { ports, links, ZONE, countKind } from './floor.js';
import { bestMarkets } from './world.js';
import { payRatio, isWhite } from './people.js';

export function monthlyEvents(st) {
  const city = st.city;
  city.eventMul = {};
  // AI companies grow, shrink, close and open
  for (const f of city.firms) {
    if (!f.alive) continue;
    f.scale = clamp(f.scale * rand(st, 0.96, 1.065), 0.35, 2.6);
    f.netWorth = Math.round(f.netWorth + f.value * f.scale * rand(st, -0.15, 0.3));
    if (f.netWorth < 20000 || chance(st, 0.006)) {
      f.alive = false; city.lots[f.lot].firm = null;
      memo(st, { from: 'Business Journal', subject: `${f.name} shuts down`, kind: 'event', body: `${f.name} has gone under after a long run of losses. Its plant at ${city.lots[f.lot].addr} is up for lease.` });
    }
  }
  const vacant = city.lots.filter(l => l.firm == null && l.id !== st.lotId && l.id !== st.move?.lotId);
  if (vacant.length > 20 && chance(st, 0.22)) {
    const known = RECIPES.filter(r => r.start || city.aiKnown[r.id]);
    const r = pick(st, known), lot = pick(st, vacant);
    const name = chance(st, 0.5) ? `${pick(st, FIRM_PREFIX)} ${pick(st, FIRM_SUFFIX)}` : `${pick(st, LAST)} ${pick(st, FIRM_SUFFIX)}`;
    const f = { id: city.firms.length, name, kind: 'maker', lot: lot.id, alive: true, quality: Math.round(rand(st, 35, 80)), priceMul: +rand(st, 0.9, 1.1).toFixed(3), scale: 0.6, value: Math.round(rand(st, 30000, 150000)), netWorth: Math.round(rand(st, 80000, 300000)), founded: st.time, recipe: r.id };
    city.firms.push(f); lot.firm = f.id;
    memo(st, { from: 'Business Journal', subject: `Grand opening: ${name}`, kind: 'event', body: `${name} cut the ribbon on a plant at ${lot.addr} this week. It will be making ${ITEMS[r.out].name}.` });
  }
  if (chance(st, 0.12)) {
    const locked = RECIPES.filter(r => !r.start && !city.aiKnown[r.id]);
    if (locked.length) {
      const r = pick(st, locked); city.aiKnown[r.id] = true;
      const maker = pick(st, city.firms.filter(f => f.alive && f.kind === 'maker' && RECIPES[f.recipe].family === r.family) || []) ;
      if (maker) maker.recipe = r.id;
      memo(st, { from: 'Business Journal', subject: `Competitor launch: ${ITEMS[r.out].name}`, kind: 'event', body: `${maker ? maker.name : 'A local firm'} is now selling its own ${ITEMS[r.out].name}. With a model on store shelves to study, our engineers could develop one in roughly half the time.` });
    }
  }
  // about half the months bring one piece of news that moves a market or our costs
  if (!chance(st, 0.5)) return;
  const roll = rand(st), E = EVENTS;
  const made = Object.keys(st.inventory).map(Number).filter(id => ITEMS[id].tier !== 'material' && isSelling(st, id));
  const parts = ITEMS.filter(i => i.tier !== 'product');
  if (roll < 0.16) {
    const it = pick(st, parts);
    city.eventMul['s' + it.id] = E.squeeze.mult;
    const p = city.firms.find(f => f.alive && (f.kind === 'vendor' ? f.sells.includes(it.id) : RECIPES[f.recipe].out === it.id));
    memo(st, { from: 'Business Journal', subject: `${E.squeeze.title}: ${it.name}`, kind: 'event', important: !!st.targets[it.id], body: `${p ? p.name : 'The biggest local supplier'} lost a week to a broken line, and ${it.name} is scarce across town. Prices will run high this month.` });
  } else if (roll < 0.29) {
    const it = pick(st, parts);
    city.eventMul['s' + it.id] = E.dump.mult;
    memo(st, { from: 'Business Journal', subject: `${E.dump.title}: ${it.name}`, kind: 'event', body: `A distributor overbought ${it.name} and is selling off the excess cheap. Stock up while it lasts.` });
  } else if (roll < 0.42 && made.length) {
    const id = pick(st, made); st.flags.special = id;
    const f = pick(st, city.firms.filter(f => f.alive));
    memo(st, { from: f.name, subject: `${E.contract.title}: ${ITEMS[id].name}`, kind: 'event', important: true, body: `${f.name} has landed a large order of its own and needs ${ITEMS[id].name} in bulk. This month demand is up, and every one we sell earns ${Math.round(E.contract.premium * 100)}% more.` });
  } else if (roll < 0.52) {
    city.eventMul.freight = E.freight.days;
    memo(st, { from: 'Business Journal', subject: E.freight.title, kind: 'event', body: `A rail yard backlog has trucking firms running late. Expect deliveries to take about ${E.freight.days} days longer this month.` });
  } else if (roll < 0.6) {
    city.eventMul.power = E.powerRates.mult;
    memo(st, { from: 'City desk', subject: E.powerRates.title, kind: 'event', body: `The utility won a temporary rate increase for industrial customers. Running a machine costs ${Math.round((E.powerRates.mult - 1) * 100)}% more this month.` });
  } else if (roll < 0.68) {
    const selling = made.length > 0;
    if (selling) st.dept.awareness = clamp(st.dept.awareness + E.tradeShow.awareness, 0, 1);
    memo(st, { from: 'City desk', subject: E.tradeShow.title, kind: 'event', body: selling ? 'The regional trade show was busy, and plenty of buyers stopped at our booth. More people know our name now.' : 'The regional trade show came and went. Next time we will have something to show.' });
  } else {
    const ev = pick(st, E.demand);
    for (const id of ev.items) city.eventMul['d' + id] = ev.mult;
    memo(st, { from: 'City desk', subject: ev.title, kind: 'event', body: `${ev.text} Demand is up this month for: ${ev.items.map(i => ITEMS[i].name).join(', ')}.` });
  }
}

export function advisorReport(st) {
  const out = [];
  const fl = st.floor, machines = fl.objects.filter(o => o.kind === 'machine');
  const has = role => st.employees.some(e => hasRole(e, role));
  if (!machines.length) out.push('You pay rent on a plant with no machines in it. Buy one from the Catalog.');
  const running = machines.filter(o => o.mode === 'produce' && o.recipe != null);
  const avgEff = running.length ? running.reduce((s, o) => s + o.effAvg, 0) / running.length : 0;
  if (running.length && avgEff < 0.5) {
    const carry = !countKind(fl, 'handcart') && !countKind(fl, 'forklift');
    out.push(`Machines run at ${pct(avgEff)} of their rated speed on average.${carry ? ' Operators carry every box by hand: a pallet jack, a forklift or belts between machines would win a lot of that back.' : ''}${!has('foreman') && running.length >= 3 ? ` ${aOrAn(jobFor('foreman').title, true)} would get more out of the crew.` : ''}`);
  }
  const unsafe = running.filter(o => unsafeInputs(fl, o).length);
  if (unsafe.length) out.push(`${unsafe.length === 1 ? 'One machine has' : unsafe.length + ' machines have'} an unguarded input square: no safety zone and no belt. Injuries cost money and morale.`);
  if (!has('sales') && Object.keys(st.inventory).some(id => ITEMS[id].tier !== 'material')) out.push(`Only walk-in customers find you. ${aOrAn(jobFor('sales').title, true)} would win a much bigger share of each market.`);
  if (!has('marketing') && st.history.length >= 2) out.push(`Few shoppers have heard of you. ${aOrAn(jobFor('marketing').title, true)} builds awareness month by month.`);
  for (const id of Object.keys(st.inventory).map(Number)) {
    if (ITEMS[id].tier === 'material' || !isSelling(st, id)) continue;
    const { r } = salesAttractiveness(st, id);
    if (r > 1.25) out.push(`${ITEMS[id].name} sells for ${pct(r - 1)} more than the going rate, so it moves slowly.`);
    else if (r < 0.8) out.push(`${ITEMS[id].name} sells for ${pct(1 - r)} less than the going rate. There is room to charge more.`);
  }
  if (accountingDelay(st) >= 5) out.push(`Invoicing runs ${accountingDelay(st)} days late, so customers pay late and suppliers add fees.`);
  if (freeBoxes(st) < 20) out.push('Storage is nearly full. Paint more storage, add bins or sell stock.');
  const under = st.employees.filter(e => payRatio(st, e) < 0.9);
  if (under.length >= 2) out.push(`${under.length} people earn well under the local rate for their job. Underpaid crews walk out.`);
  const officeless = st.employees.filter(e => isWhite(e) && !fl.objects.some(o => (o.kind === 'office' || o.kind === 'suite') && o.id === e.assign));
  if (officeless.length) out.push(`${officeless.length} office worker(s) have no desk and get little done.`);
  const bm = bestMarkets(st.city, 3);
  if (bm.length) out.push(`Where ${st.city.name} has the most unmet demand: ${bm.map(i => ITEMS[i].name).join(', ')}.`);
  const cash = st.bank.checking + st.bank.savings;
  out.push(`The business is worth ${money(netWorth(st))}, with ${money(cash)} in the bank.`);
  return out.map(s => '• ' + s).join('\n');
}
