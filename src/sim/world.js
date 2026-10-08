// City generation and the per-item market (AI vendors and manufacturers, consumer demand, prices).
import { ITEMS, RECIPES, CITIES, FAMILIES, ECONOMY } from '../gen/data.js';
import { rand, randInt, pick, chance, clamp, gauss } from '../core/util.js';
import { STREETS, STREET_TYPES, FIRM_PREFIX, FIRM_SUFFIX, LAST } from '../core/content.js';

export const GRID_W = 16, GRID_H = 14;
export const WORKDAYS_PER_MONTH = 21;
export const DIFF = {
  easy: { demand: 1.3, price: 0.95, label: 'Relaxed' },
  normal: { demand: 1.0, price: 1.0, label: 'Standard' },
  hard: { demand: 0.68, price: 1.06, label: 'Cutthroat' },
};

export function cityStats(cityId) {
  const c = CITIES[cityId];
  const f = Math.log10(c.metro / 40000), k = ECONOMY.city;
  return {
    f,
    avgSalary: Math.round((k.salaryBase + k.salaryPerLog * f) / 100) * 100,
    avgRent: +(k.rentBase + k.rentPerLog * f).toFixed(3), // $ per sq ft per month
    experience: Math.round(k.expBase + k.expPerLog * f),   // months, average workforce experience
  };
}

// The size of a city's consumer market. It grows more slowly than the metro population (a power law around a
// reference metro), so the largest cities are bigger markets without being endless ones, and small towns still
// buy enough to support a plant.
export function marketSize(metro) { const m = ECONOMY.market; return m.refMetro * Math.pow(metro / m.refMetro, m.exponent); }

// Machine output in dollars of product per hour at 100% efficiency.
export function machineValuePerHour(fam) { return FAMILIES[fam].price * ECONOMY.outputRate; }
export function unitsPerHour(recipeId) {
  const r = RECIPES[recipeId];
  return machineValuePerHour(r.family) / (ITEMS[r.out].unit * r.outQty) * r.outQty;
}

function firmName(st, used) {
  for (let i = 0; i < 20; i++) {
    const n = chance(st, 0.5) ? `${pick(st, FIRM_PREFIX)} ${pick(st, FIRM_SUFFIX)}` : `${pick(st, LAST)} ${pick(st, FIRM_SUFFIX)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  return `${pick(st, LAST)} & ${pick(st, LAST)} ${used.size}`;
}

export function generateCity(st, cityId) {
  const c = CITIES[cityId];
  const cs = cityStats(cityId);
  const lots = [];
  const rowStreets = [];
  for (let y = 0; y < GRID_H; y++) rowStreets.push(`${pick(st, STREETS)} ${pick(st, STREET_TYPES)}`);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const sqft = clamp(Math.round(Math.exp(gauss(st, Math.log(42000), 0.5)) / 100) * 100, 12000, 140000);
    const rentPsf = +(cs.avgRent * rand(st, 0.78, 1.28)).toFixed(3);
    lots.push({ id: lots.length, x, y, addr: `${(x + 1) * 100 + randInt(st, 0, 49) * 2} ${rowStreets[y]}`, sqft, rentPsf, rent: Math.round(sqft * rentPsf), firm: null });
  }
  const used = new Set();
  const nFirms = clamp(Math.round(42 + 30 * cs.f), 40, 130);
  const nVendors = Math.max(7, Math.round(nFirms * 0.13));
  const firms = [];
  const freeLots = lots.map(l => l.id);
  const takeLot = () => freeLots.splice(randInt(st, 0, freeLots.length - 1), 1)[0];
  // raw-material vendors: every material gets at least two vendors
  const mats = ITEMS.filter(i => i.tier === 'material').map(i => i.id);
  for (let v = 0; v < nVendors; v++) {
    const sells = new Set();
    const k = randInt(st, 3, 8);
    while (sells.size < k) sells.add(pick(st, mats));
    firms.push(newFirm(st, firms.length, firmName(st, used), 'vendor', takeLot(), { sells: [...sells] }));
  }
  for (const m of mats) {
    const n = firms.filter(f => f.kind === 'vendor' && f.sells.includes(m)).length;
    for (let i = n; i < 2; i++) pick(st, firms.filter(f => f.kind === 'vendor')).sells.push(m);
  }
  // manufacturers run one recipe each; mostly standard tech, a few already on advanced lines
  const startRecipes = RECIPES.filter(r => r.start).map(r => r.id);
  const advRecipes = RECIPES.filter(r => !r.start).map(r => r.id);
  for (let i = nVendors; i < nFirms; i++) {
    const rid = chance(st, 0.1) ? pick(st, advRecipes) : pick(st, startRecipes);
    firms.push(newFirm(st, firms.length, firmName(st, used), 'maker', takeLot(), { recipe: rid }));
  }
  for (const f of firms) lots[f.lot].firm = f.id;
  // make sure every component used by AI manufacturers has at least one producer in town
  for (let pass = 0; pass < 3; pass++) {
    const needs = new Set();
    for (const f of firms) if (f.kind === 'maker') for (const [it] of RECIPES[f.recipe].inputs) if (ITEMS[it].tier === 'component') needs.add(it);
    for (const it of needs) {
      if (!firms.some(f => f.alive && f.kind === 'maker' && RECIPES[f.recipe].out === it) && freeLots.length > 40) {
        const r = RECIPES.find(x => x.out === it);
        const f = newFirm(st, firms.length, firmName(st, used), 'maker', takeLot(), { recipe: r.id });
        firms.push(f); lots[f.lot].firm = f.id;
      }
    }
  }
  const known = {}; for (const r of RECIPES) if (!r.start && firms.some(f => f.recipe === r.id)) known[r.id] = true;
  const national = {};
  for (const it of ITEMS) if (it.tier !== 'material') national[it.id] = Math.round((it.tier === 'product' ? ECONOMY.market.nationalProduct : ECONOMY.market.nationalComponent) * rand(st, 0.7, 1.3) / it.unit);
  const city = { id: cityId, name: c.name, pop: c.pop, metro: c.metro, ...cs, lots, firms, market: {}, aiKnown: known, eventMul: {}, national };
  normalize(st, city);
  recomputeMarket(st, city, true);
  return city;
}

function newFirm(st, id, name, kind, lot, extra) {
  const value = rand(st, 30000, 210000);
  return {
    id, name, kind, lot, alive: true,
    quality: randInt(st, 30, 85),
    priceMul: +rand(st, 0.9, 1.12).toFixed(3),
    scale: +rand(st, 0.6, 1.5).toFixed(3),   // monthly output value multiplier
    value: Math.round(value),                  // monthly output value in dollars
    netWorth: Math.round(value * rand(st, 1.5, 4.5) + rand(st, 50000, 400000)),
    founded: 0,
    ...extra,
  };
}

// Raw monthly flows: AI output, AI consumption, households and out-of-town (national) buyers.
function flows(st, city) {
  const diff = DIFF[st.setup?.difficulty || 'normal'];
  const supply = new Float64Array(ITEMS.length), demand = new Float64Array(ITEMS.length), producers = new Int32Array(ITEMS.length), consumers = new Int32Array(ITEMS.length);
  for (const f of city.firms) {
    if (!f.alive) continue;
    if (f.kind === 'maker') {
      const r = RECIPES[f.recipe], out = ITEMS[r.out];
      const units = f.value * f.scale / out.unit;
      supply[r.out] += units; producers[r.out]++;
      for (const [it, q] of r.inputs) { demand[it] += units * q / r.outQty; consumers[it]++; }
    }
  }
  // vendors cover material demand with headroom
  const vendorsOf = id => city.firms.filter(f => f.alive && f.kind === 'vendor' && f.sells.includes(id));
  for (const m of ITEMS.filter(i => i.tier === 'material')) {
    const vs = vendorsOf(m.id); producers[m.id] = vs.length;
    supply[m.id] = Math.max(demand[m.id] * 1.35, ECONOMY.market.vendorFloor / m.unit * vs.length) * (city.eventMul['s' + m.id] || 1);
  }
  // household demand for finished products scales with the metro area
  const spend = ECONOMY.market.spend * diff.demand, size = marketSize(city.metro);
  for (const p of ITEMS.filter(i => i.tier === 'product')) {
    demand[p.id] += size * spend / p.unit * (city.eventMul['d' + p.id] || 1);
    consumers[p.id] += Math.round(size / 60000) + 3;
  }
  for (const it of ITEMS) if (city.national?.[it.id]) demand[it.id] += city.national[it.id] * diff.demand * (city.eventMul['d' + it.id] || 1);
  return { supply, demand, producers, consumers };
}

// Scale AI manufacturers so their supply sits near demand: tightness is AI supply over demand, so below 1 leaves room
// for us and above 1 means a crowded market.
function normalize(st, city) {
  city.tight = {};
  const M = ECONOMY.market;
  for (const it of ITEMS) if (it.tier !== 'material') city.tight[it.id] = +(it.tier === 'product' ? rand(st, ...M.tightProduct) : rand(st, ...M.tightComponent)).toFixed(3);
  for (let pass = 0; pass < 4; pass++) {
    const { supply, demand } = flows(st, city);
    for (const it of ITEMS) {
      if (it.tier === 'material' || supply[it.id] <= 0) continue;
      const mul = demand[it.id] * city.tight[it.id] / supply[it.id];
      for (const f of city.firms) if (f.alive && f.kind === 'maker' && RECIPES[f.recipe].out === it.id) f.scale = +clamp(f.scale * mul, 0.08, 4).toFixed(3);
    }
  }
}

// Monthly units of each item and the prices that result.
export function recomputeMarket(st, city, init = false) {
  const diff = DIFF[st.setup?.difficulty || 'normal'];
  const { supply, demand, producers, consumers } = flows(st, city);
  for (const it of ITEMS) {
    if (it.tier !== 'material' && city.eventMul['s' + it.id]) supply[it.id] *= city.eventMul['s' + it.id];
    const prev = city.market[it.id];
    const playerSold = prev ? prev.playerSoldLast || 0 : 0;
    const s = supply[it.id] + playerSold, d = demand[it.id] + (prev ? prev.playerBoughtLast || 0 : 0);
    const M = ECONOMY.market;
    let ratio = s <= 0 ? M.priceMax : clamp(Math.pow(Math.max(d, 1) / s, M.priceExp), M.priceMin, M.priceMax);
    const noise = init ? rand(st, 0.96, 1.04) : rand(st, 0.97, 1.03);
    const target = it.unit * ratio * diff.price * noise;
    const price = prev && !init ? prev.price * 0.5 + target * 0.5 : target;
    city.market[it.id] = {
      price: +price.toFixed(2), low: +(price * 0.88).toFixed(2), high: +(price * 1.14).toFixed(2),
      supply: Math.round(supply[it.id]), demand: Math.round(demand[it.id]),
      producers: producers[it.id], consumers: consumers[it.id],
      playerSold: 0, playerBought: 0, playerSoldLast: prev ? prev.playerSold || 0 : 0, playerBoughtLast: prev ? prev.playerBought || 0 : 0,
      history: [...(prev?.history || []).slice(-23), +price.toFixed(2)],
    };
  }
}

export function lotDistance(city, a, b) {
  const A = city.lots[a], B = city.lots[b];
  return Math.abs(A.x - B.x) + Math.abs(A.y - B.y);
}

// Vendors the player can buy an item from, with their terms.
export function vendorsFor(st, itemId) {
  const city = st.city, m = city.market[itemId];
  const out = [];
  for (const f of city.firms) {
    if (!f.alive) continue;
    const sells = f.kind === 'vendor' ? f.sells.includes(itemId) : RECIPES[f.recipe].out === itemId;
    if (!sells) continue;
    const dist = st.lotId != null ? lotDistance(city, f.lot, st.lotId) : 8;
    const monthlyUnits = f.kind === 'vendor' ? m.supply / Math.max(1, m.producers) : f.value * f.scale / ITEMS[itemId].unit;
    out.push({
      firm: f.id, name: f.name,
      boxPrice: +(m.price * f.priceMul * ITEMS[itemId].pack).toFixed(2),
      quality: f.quality,
      minutes: 45 + dist * 9 + (f.kind === 'maker' ? 60 : 0),
      monthlyBoxes: Math.max(5, Math.floor(monthlyUnits * 0.4 / ITEMS[itemId].pack)),
    });
  }
  return out.sort((a, b) => a.boxPrice - b.boxPrice);
}

// Rough monthly profit a new machine on this recipe could make here: the open part of the market (demand not met by
// AI firms, plus a small share of the contested part), capped by what a machine makes at modest efficiency, times
// the margin at today's prices. Used by Quick start and the balance test to pick lines the way a careful player would.
export function lineOutlook(st, recipeId) {
  const r = RECIPES[recipeId], m = st.city.market;
  const cost = r.inputs.reduce((s, [i, q]) => s + m[i].price * q, 0) / r.outQty;
  const cap = unitsPerHour(recipeId) * 0.55 * 8 * WORKDAYS_PER_MONTH;
  const open = Math.max(0, m[r.out].demand - m[r.out].supply) + 0.15 * Math.min(m[r.out].demand, m[r.out].supply);
  return Math.min(cap, open) * (m[r.out].price - cost);
}

// The five products with the least supply relative to demand.
export function bestMarkets(city, n = 5) {
  return ITEMS.filter(i => i.tier !== 'material')
    .map(i => ({ id: i.id, r: city.market[i.id].demand / Math.max(1, city.market[i.id].supply), m: city.market[i.id] }))
    .filter(x => x.m.demand > 0 && (RECIPES.find(r => r.out === x.id)?.start))
    .sort((a, b) => b.r - a.r).slice(0, n).map(x => x.id);
}
