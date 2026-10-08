// Shared helpers for the Node tests: find things by role instead of by id, so the tests survive changes to
// data/world.json (new items, a different catalog order, renamed lines).
import * as G from '../src/sim/game.js';
import { RECIPES, ITEMS, FAMILIES, CITIES, ITEM_ID, FAMILY_ID } from '../src/gen/data.js';
import { jobFor } from '../src/core/content.js';
import { makeCandidate } from '../src/sim/people.js';

export let fails = 0;
export const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
export const done = what => { console.log(fails ? `${fails} FAILED` : `all ${what} checks pass`); process.exit(fails ? 1 : 0); };

export const cityId = name => { const i = CITIES.findIndex(c => c.name.startsWith(name)); if (i < 0) throw new Error('no city ' + name); return i; };
// a mid-sized metro used by most tests
export const TEST_CITY = cityId('Dayton');
export const job = role => jobFor(role).key;
export const isMaterial = id => ITEMS[id].tier === 'material';
export const recipeOf = key => RECIPES.find(r => r.out === ITEM_ID[key]);
export const starter = fam => RECIPES.find(r => r.family === fam && r.start);
export const line = key => FAMILY_ID[key];

// A component made only from bought materials, and a product known at the start that uses it, made on another line.
export function chainPair() {
  for (const prod of RECIPES) {
    if (!prod.start || ITEMS[prod.out].tier !== 'product') continue;
    for (const [i] of prod.inputs) {
      const comp = RECIPES.find(r => r.out === i);
      if (comp && comp.start && comp.family !== prod.family && comp.inputs.every(([m]) => isMaterial(m))) return { comp, prod };
    }
  }
  throw new Error('no component and product pair in the world data');
}

// A new game in the test city with the largest free building leased. sandbox gives plenty of cash.
export function setup(seed, { sandbox = true, city = TEST_CITY, sqft = null } = {}) {
  const st = G.newGame({ seed, sandbox });
  G.visitCity(st, city);
  const free = st.city.lots.filter(l => l.firm == null);
  const lot = sqft ? free.sort((a, b) => Math.abs(a.sqft - sqft) - Math.abs(b.sqft - sqft))[0] : free.sort((a, b) => b.sqft - a.sqft)[0];
  G.rentBuilding(st, lot.id);
  return st;
}

// Hire someone for a role at a little over their asking salary. Returns the new employee (or null).
export function hire(st, role, mult = 1.1) {
  const c = makeCandidate(st, job(role));
  const m = G.memo(st, { from: 'x', subject: 'r', kind: 'resume', data: { cand: c, expires: st.time + 1e7 } });
  const r = G.makeOffer(st, m.id, c.ask * mult);
  return r.ok ? r.emp : null;
}
