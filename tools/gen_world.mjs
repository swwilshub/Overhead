#!/usr/bin/env node
// Builds src/gen/data.js from data/world.json and the us-atlas map (ISC licence). Run with `npm run gen`.
// Everything the game reads about its world comes out of this file; never edit src/gen/data.js by hand.
//
// What it works out (see docs/design/world.md, "Pricing and costs"):
//   - each made item's unit price: cost of its inputs per unit made × the markup for its line's tier
//   - box size: the step from economy.packSteps whose box value is nearest economy.boxTarget
//   - city map positions: geoAlbersUsa().scale(1300).translate([487.5, 305]), the projection us-atlas uses
//   - the country outline and state borders, simplified, as SVG path strings
// and it checks the world for mistakes (unknown keys, too many inputs, lines with no starting product, ...).
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/world.json'), 'utf8'));
const errors = [];
const fail = m => errors.push(m);
const uniq = (list, what) => { const s = new Set(); for (const k of list) { if (s.has(k)) fail(`duplicate ${what} key "${k}"`); s.add(k); } };

// ---------- lines
const lines = W.lines;
uniq(lines.map(l => l.key), 'line');
const lineIdx = Object.fromEntries(lines.map((l, i) => [l.key, i]));
for (const l of lines) {
  if (!(l.inputs >= 1 && l.inputs <= 4)) fail(`line ${l.key}: inputs must be 1 to 4`);
  if (!(l.tier >= 1 && l.tier <= 4)) fail(`line ${l.key}: tier must be 1 to 4`);
  if (!/^[A-Z]{2}$/.test(l.code)) fail(`line ${l.key}: code must be two capital letters`);
  if (!l.cell?.A || !l.cell?.B || (l.cell.extras || []).length !== 2) fail(`line ${l.key}: cell needs stations A and B and two extras`);
}
uniq(lines.map(l => l.code), 'line code');

// ---------- items, in id order: materials, components, products
const made = [...W.components.map(x => ({ ...x, tier: 'component' })), ...W.products.map(x => ({ ...x, tier: 'product' }))];
const all = [...W.materials.map(x => ({ ...x, tier: 'material' })), ...made];
uniq(all.map(x => x.key), 'item');
const itemIdx = Object.fromEntries(all.map((x, i) => [x.key, i]));
const byKey = Object.fromEntries(all.map(x => [x.key, x]));
for (const x of made) {
  const l = lines[lineIdx[x.line]];
  if (!l) { fail(`${x.key}: unknown line "${x.line}"`); continue; }
  if (x.tier === 'component' && l.tier !== 1) fail(`${x.key}: components come from Mk I lines`);
  if (x.tier === 'product' && l.tier === 1) fail(`${x.key}: products come from Mk II to IV lines`);
  if (!x.inputs?.length) fail(`${x.key}: no inputs`);
  if (x.inputs.length > l.inputs) fail(`${x.key}: ${x.inputs.length} inputs but ${l.key} machines have ${l.inputs}`);
  for (const [k, q] of x.inputs) {
    if (!byKey[k]) fail(`${x.key}: unknown input "${k}"`);
    else if (byKey[k].tier === 'product') fail(`${x.key}: products can't be inputs (${k})`);
    if (!(q > 0)) fail(`${x.key}: bad quantity for ${k}`);
  }
  if (x.tier === 'product' && !x.inputs.some(([k]) => byKey[k]?.tier === 'component')) fail(`${x.key}: a product needs at least one component`);
}
for (const l of lines) if (!made.some(x => x.line === l.key && x.start)) fail(`line ${l.key}: no product known at the start`);

// prices: materials as written; made items from their inputs, resolving components that use components
const unit = {};
for (const m of W.materials) unit[m.key] = m.unit;
for (let pass = 0; pass < 10 && Object.keys(unit).length < all.length; pass++) {
  for (const x of made) {
    if (unit[x.key] != null || !x.inputs.every(([k]) => unit[k] != null)) continue;
    const cost = x.inputs.reduce((s, [k, q]) => s + unit[k] * q, 0) / (x.outQty || 1);
    unit[x.key] = Math.round(cost * (x.markup ?? W.economy.markup[lines[lineIdx[x.line]].tier]) * 100) / 100;
  }
}
for (const x of made) if (unit[x.key] == null) fail(`${x.key}: price can't be worked out (an input loop?)`);
const packFor = u => W.economy.packSteps.reduce((best, s) => Math.abs(Math.log(s * u / W.economy.boxTarget)) < Math.abs(Math.log(best * u / W.economy.boxTarget)) ? s : best);

const ITEMS = all.map((x, id) => { const u = unit[x.key] ?? 0, pack = packFor(u || 1); return { id, key: x.key, name: x.name, tier: x.tier, unit: u, pack, packCost: Math.round(pack * u * 100) / 100 }; });
const FAMILIES = lines.map((l, id) => ({ id, key: l.key, name: l.name, tab: l.tab || l.name, code: l.code, hue: l.hue, head: l.head, tier: l.tier, price: l.price, mtbf: l.mtbf, inputs: l.inputs, cell: l.cell }));
const RECIPES = made.map((x, id) => ({ id, family: lineIdx[x.line], out: itemIdx[x.key], outQty: x.outQty || 1, inputs: x.inputs.map(([k, q]) => [itemIdx[k], q]), start: !!x.start }));

// ---------- people, places, events
const deptKeys = new Set(W.departments.map(d => d.key));
const traitKeys = new Set(W.traits.flatMap(g => g.traits.map(([k]) => k)));
uniq([...W.traits.flatMap(g => g.traits.map(([k]) => k))], 'trait');
uniq(W.jobs.map(j => j.key), 'job');
for (const t of W.drawbackTraits) if (!traitKeys.has(t)) fail(`drawback trait "${t}" is not a trait`);
for (const j of W.jobs) {
  if (!deptKeys.has(j.dept)) fail(`job ${j.key}: unknown department "${j.dept}"`);
  for (const k of Object.keys(j.w)) if (!traitKeys.has(k)) fail(`job ${j.key}: unknown trait "${k}"`);
}
// seniority ladders: every family has levels 1, 2 and 3 in order, each in the family's department
const famKeys = new Set((W.jobFamilies || []).map(f => f.key));
uniq([...famKeys], 'job family');
for (const f of W.jobFamilies) {
  if (!deptKeys.has(f.dept)) fail(`job family ${f.key}: unknown department "${f.dept}"`);
  const rungs = W.jobs.filter(j => j.family === f.key).sort((a, b) => a.level - b.level);
  if (rungs.length !== 3 || rungs.some((j, i) => j.level !== i + 1 || j.key !== `${f.key}_${i + 1}`)) fail(`job family ${f.key} must have exactly three jobs, ${f.key}_1 to ${f.key}_3, with levels 1 to 3`);
  for (const j of rungs) if (j.dept !== f.dept) fail(`job ${j.key}: department must be the family's ("${f.dept}")`);
  if (rungs.length === 3 && !(rungs[0].pay < rungs[1].pay && rungs[1].pay < rungs[2].pay)) fail(`job family ${f.key}: pay must rise with each level`);
}
for (const j of W.jobs) if (j.family && !famKeys.has(j.family)) fail(`job ${j.key}: unknown family "${j.family}"`);
const sen = W.economy.seniority;
if (!sen || !(sen.xpToSenior > 0 && sen.xpToDirector > sen.xpToSenior) || sen.resumeLevels?.length !== 3 || Math.abs(sen.resumeLevels.reduce((a, b) => a + b, 0) - 1) > 1e-9) fail('economy.seniority needs xpToSenior < xpToDirector and three resumeLevels that add up to 1');
for (const role of ['chief', 'finance', 'sales', 'marketing', 'purchasing', 'foreman', 'operator', 'research_lead', 'researcher', 'maintenance'])
  if (!W.jobs.some(j => [j.role].flat().includes(role))) fail(`no job has the "${role}" role`);
for (const e of W.events.demand) for (const k of e.items) if (byKey[k]?.tier !== 'product') fail(`event ${e.key}: "${k}" is not a product`);
if (W.cities.length < 10) fail('fewer than 10 cities: run tools/fetch_cities.mjs');
const qs = W.economy.quickStart;
if (!qs || lineIdx[qs.line] == null || byKey[qs.product]?.line !== qs.line || !byKey[qs.product]?.start) fail('economy.quickStart must name a line and a product it makes from the start');

if (errors.length) { console.error('data/world.json has problems:\n  ' + errors.join('\n  ')); process.exit(1); }

// ---------- map
const proj = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const CITIES = W.cities.map((c, id) => { const p = proj([c.lon, c.lat]); if (!p) throw new Error(`${c.name} is outside the map`); return { id, name: c.name, pop: c.pop, metro: c.metro, x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10 }; });
const us = require('us-atlas/states-albers-10m.json');
const simple = simplify(presimplify(us), quantile(presimplify(us), 0.12));
const draw = geoPath().digits(1);
const US_NATION_PATH = draw(feature(simple, simple.objects.nation));
const US_BORDER_PATH = draw(mesh(simple, simple.objects.states, (a, b) => a !== b));

// ---------- write
const J = v => JSON.stringify(v);
const rows = (name, list) => `export const ${name} = [\n${list.map(x => '  ' + J(x)).join(',\n')},\n];\n`;
const src = `// Generated by tools/gen_world.mjs from data/world.json. Do not edit by hand: change the JSON and run \`npm run gen\`.
// Map outlines: us-atlas states-albers-10m (ISC licence), simplified.
${rows('ITEMS', ITEMS)}${rows('FAMILIES', FAMILIES)}${rows('RECIPES', RECIPES)}${rows('CITIES', CITIES)}
export const ECONOMY = ${J(W.economy)};
export const DEPTS = ${J(W.departments)};
export const ATTR_GROUPS = ${J(W.traits.map(g => [g.group, g.traits]))};
export const DRAWBACK_TRAITS = ${J(W.drawbackTraits)};
${rows('JOBS', W.jobs.map((j, id) => ({ id, ...j, roles: [j.role].flat(), lead: !!j.lead, next: j.family && j.level < 3 ? `${j.family}_${j.level + 1}` : null })))}${rows('JOB_FAMILIES', W.jobFamilies)}${rows('OFFICES', W.offices)}
export const EQUIPMENT = ${J(W.equipment)};
export const EVENTS = ${J({ ...W.events, demand: W.events.demand.map(e => ({ ...e, items: e.items.map(k => itemIdx[k]) })) })};
${rows('SCENARIOS', W.scenarios)}
export const ITEM_ID = ${J(itemIdx)};
export const FAMILY_ID = ${J(lineIdx)};
export const US_NATION_PATH = ${J(US_NATION_PATH)};
export const US_BORDER_PATH = ${J(US_BORDER_PATH)};
`;
fs.mkdirSync(path.join(ROOT, 'src/gen'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/gen/data.js'), src);
const n = t => ITEMS.filter(i => i.tier === t).length;
console.log(`src/gen/data.js: ${n('material')} materials, ${n('component')} components, ${n('product')} products, ${RECIPES.length} recipes, ${FAMILIES.length} lines, ${CITIES.length} cities, ${W.jobs.length} jobs (${(src.length / 1024).toFixed(0)} KB)`);
