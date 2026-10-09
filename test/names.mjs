// Clearer names (spec 001): job titles, departments and line names say what they are, every text uses the same
// words, articles before a title come from one helper, and a machine has one label everywhere.
import fs from 'fs';
import path from 'path';
import { ok, done } from './lib.mjs';
import { JOB_LIST, DEPT_LIST, JOBS, jobFor, aOrAn } from '../src/core/content.js';
import { FAMILIES, FAMILY_ID } from '../src/gen/data.js';
import { objectLabel, cellName, statusMark, ZONE_INFO, ZONE, EQUIP_NAME } from '../src/sim/floor.js';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]);
// what a player can read: src/ (not the generated data, which comes from data/world.json) and data/world.json,
// with code comments stripped so a note for programmers doesn't count
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const sources = [...files(path.join(root, 'src')).filter(f => /\.(js|html)$/.test(f) && !f.includes(`${path.sep}gen${path.sep}`)), path.join(root, 'data', 'world.json')]
  .map(f => ({ f: path.relative(root, f), text: f.endsWith('.js') ? stripComments(fs.readFileSync(f, 'utf8')) : fs.readFileSync(f, 'utf8') }));
const find = re => sources.flatMap(({ f, text }) => text.split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => re.test(l)).map(([f, n, l]) => `${f}:${n}: ${l.trim().slice(0, 90)}`));

// ---- criterion 1 and 3: the new titles, departments and duties
const want = {
  operations_1: 'Junior Operator', operations_2: 'Senior Operator', operations_3: 'Operations Director',
  maintenance_1: 'Junior Mechanic', maintenance_2: 'Senior Mechanic', maintenance_3: 'Maintenance Director',
  engineering_1: 'Junior Engineer', engineering_2: 'Senior Engineer', engineering_3: 'Engineering Director',
  finance_1: 'Finance Clerk', finance_2: 'Bookkeeper', finance_3: 'Finance Director',
  sales_1: 'Junior Sales Rep', sales_2: 'Senior Sales Rep', sales_3: 'Sales Director',
  promotions_1: 'Junior Promoter', promotions_2: 'Senior Promoter', promotions_3: 'Promotions Director',
  purchasing_1: 'Junior Buyer', purchasing_2: 'Senior Buyer', purchasing_3: 'Purchasing Director', director: 'Plant Director',
};
for (const [key, title] of Object.entries(want)) ok(JOBS[key]?.title === title, `job ${key} is titled "${title}" (${JOBS[key]?.title})`);
const depts = Object.fromEntries(DEPT_LIST.map(d => [d.key, d.name]));
ok(depts.exec === 'Management' && depts.commercial === 'Sales' && depts.supply === 'Purchasing', `departments: ${Object.values(depts).join(', ')}`);
ok(JOB_LIST.length === 22 && JOB_LIST.every(j => want[j.key]), 'twenty-one laddered jobs and the Plant Director, with the keys family_level');
const titles = JOB_LIST.map(j => j.title);
ok(new Set(titles).size === titles.length, 'job titles are unique');
for (const j of JOB_LIST) {
  ok(j.title.length <= 20, `"${j.title}" is at most 20 characters`);
  ok(j.desc.length <= 120, `${j.title} duties are at most 120 characters (${j.desc.length})`);
}
// duties start with what the job does in the game
const duties = {
  operations_1: 'Runs one machine or works in a production cell', operations_2: 'Runs a machine with more skill than a Junior Operator', operations_3: 'Speeds up every machine',
  maintenance_1: 'Services machines', maintenance_2: 'Services and repairs faster than a Junior Mechanic', maintenance_3: 'The best repairer on the floor',
  engineering_1: 'Runs a machine set to research', engineering_2: 'Researches faster and better than a Junior Engineer', engineering_3: 'Speeds up every research project',
  finance_1: 'Posts invoices and bills', finance_2: 'Posts invoices and bills faster', finance_3: "Does the department's work",
  sales_1: 'Wins orders from stores', sales_2: 'Wins more orders than a Junior Sales Rep', sales_3: "Does the department's work",
  promotions_1: 'Runs ads and displays', promotions_2: 'Raises brand awareness faster than a Junior Promoter', promotions_3: "Does the department's work",
  purchasing_1: 'Reorders materials up to your stock targets', purchasing_2: 'Handles more orders a day than a Junior Buyer', purchasing_3: "Does the department's work",
  director: 'Makes every office department more productive',
};
for (const [key, start] of Object.entries(duties)) ok(JOBS[key].desc.startsWith(start), `${JOBS[key].title} duties start "${start}"`);
// the job the game suggests for each role is the one the statuses and buttons name
ok(jobFor('operator').title === 'Junior Operator' && jobFor('researcher').title === 'Junior Engineer' && jobFor('sales').title === 'Junior Sales Rep' && jobFor('purchasing').title === 'Junior Buyer' && jobFor('finance').title === 'Finance Clerk', 'the hire for each role is the Junior job');

// no old title, department or line name is left in src/ or data/
const OLD = ['Line Worker', 'Account Rep', 'Promotions Specialist', 'Office Assistant', 'Finance Chief', 'Commercial Lead', 'Supply Lead',
  'Shift Supervisor', 'Development Engineer', 'Front office', 'Machine shop', 'Furniture shop', 'Plant manager', 'Hand cart', 'Input empty',
  'needs an engineer', 'researcher away', 'Hire a researcher', 'Hire an operator', 'Storage (pallets)', 'stored pallets', 'walk-in buyers',
  'Accounting falls', 'researcher-hours'];
// STALE_STATUS in game.js keeps the old status words on purpose, so a save made before the rename is brought up to date
for (const old of OLD) { const hits = find(new RegExp(old.replace(/[()]/g, '\\$&'), 'i')).filter(l => !/STALE_STATUS/.test(l)); ok(!hits.length, `no "${old}" in src/ or data/${hits.length ? ': ' + hits.slice(0, 3).join(' | ') : ''}`); }
const buyerTitle = find(/["'`]Buyer["'`]|\bthe Buyer\b|\ba Buyer\b/);
ok(!buyerTitle.length, `no bare "Buyer" title${buyerTitle.length ? ': ' + buyerTitle.slice(0, 3).join(' | ') : ''}`);
const deptWords = find(/["'`](Commercial|Supply)["'`]/).filter(l => !/FIRM_SUFFIX = /.test(l)); // "Supply" still ends some company names
ok(!deptWords.length, `no "Commercial" or "Supply" department or sender${deptWords.length ? ': ' + deptWords.slice(0, 3).join(' | ') : ''}`);
// "Warehouse" survives only as a street name
const warehouse = find(/warehouse/i).filter(l => !/STREETS = /.test(l));
ok(!warehouse.length, `no player-facing "warehouse"${warehouse.length ? ': ' + warehouse.slice(0, 3).join(' | ') : ''}`);
ok(FAMILIES.every(f => / line$/.test(f.name)), `every line is called "... line": ${FAMILIES.map(f => f.name).join(', ')}`);
ok(EQUIP_NAME.handcart === 'Pallet jack', 'the catalog item is a Pallet jack');
ok(ZONE_INFO[ZONE.STORAGE].name === 'Storage zone', 'the storage squares are a "Storage zone"');

// ---- criterion 5: articles come from one helper
for (const t of titles) { const want = /^[aeiou]/i.test(t) ? `an ${t}` : `a ${t}`; ok(aOrAn(t) === want, `aOrAn("${t}") = "${aOrAn(t)}"`); }   // no title starts with a word like "unit" or "hour"
const cases = { operator: 'an operator', engineer: 'an engineer', 'Office Assistant': 'an Office Assistant', 'Account Rep': 'an Account Rep',
  'Inspection table': 'an Inspection table', unit: 'a unit', 'Union rep': 'a Union rep', user: 'a user', 'one-off': 'a one-off', hour: 'an hour', 'Head of Sales': 'a Head of Sales' };
for (const [w, a] of Object.entries(cases)) ok(aOrAn(w) === a, `aOrAn("${w}") = "${aOrAn(w)}"`);
ok(aOrAn('engineer', true) === 'An engineer' && aOrAn('Sales Rep', true) === 'A Sales Rep', 'capital article for the start of a sentence');
const hardArticle = find(/\b[Aa]n? \$\{[^}]*(title|titleFor|\.title)/);
ok(!hardArticle.length, `no template hard-codes "a" or "an" before a title${hardArticle.length ? ': ' + hardArticle.slice(0, 3).join(' | ') : ''}`);

// ---- criterion 4: one label per machine or cell
const st = {};
const dc = FAMILY_ID.diecast, mc = FAMILY_ID.machining;
ok(objectLabel(st, { kind: 'machine', family: dc, id: 3 }) === 'Die-casting line machine #3', objectLabel(st, { kind: 'machine', family: dc, id: 3 }));
ok(objectLabel(st, { kind: 'cell', family: dc, id: 12 }) === 'Die-casting cell #12', objectLabel(st, { kind: 'cell', family: dc, id: 12 }));
ok(objectLabel(st, { kind: 'machine', family: mc, id: 4 }) === 'Machining line machine #4', objectLabel(st, { kind: 'machine', family: mc, id: 4 }));
for (const f of FAMILIES) {
  const l = objectLabel(st, { kind: 'cell', family: f.id, id: 9 });
  ok(!/cell cell|line cell|shop machine/i.test(l) && l === `${cellName(f.id)} #9`, `cell label ${l}`);
}
const handMade = find(/[Mm]achine #\$\{|cell #\$\{|#\$\{[^}]*\} input|'#' \+ [a-z.]*id\b/).filter(l => !/case 'machine': return/.test(l) && !/data-autoid/.test(l)); // dom.js builds a focus key from an element id, not a label
ok(!handMade.length, `no hand-built "Machine #" or "#\${id} input" labels${handMade.length ? ': ' + handMade.slice(0, 3).join(' | ') : ''}`);

// ---- criterion 2: the floor markers stay the same for the renamed statuses
const marks = { 'Out of materials': '!', 'Output full: storage full': '!', 'Output blocked: belt full': '!', 'Output tray full': '!',
  'No operator': '?', 'Research: no engineer': '?', 'Research: engineer away': null, 'Operator away': null, 'Waiting for materials': null, Running: null, 'Research 40%': null };
for (const [s, m] of Object.entries(marks)) ok(statusMark(s) === m, `floor marker for "${s}" is ${m ?? 'none'}`);
const gameSrc = fs.readFileSync(path.join(root, 'src/sim/game.js'), 'utf8') + fs.readFileSync(path.join(root, 'src/sim/stalls.js'), 'utf8');
const missing = ['Out of materials', 'Research: no engineer', 'Research: engineer away'].filter(w => !gameSrc.includes(`'${w}'`));
ok(!missing.length, `the sim sets the new research and materials statuses${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);
ok(find(/from: 'Plant log'/).length >= 5 && find(/from: 'Purchasing'/).length === 1, 'memos come from "Plant log" and "Purchasing"');
done('names');
