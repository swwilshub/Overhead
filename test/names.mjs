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
  line_worker: 'Machine Operator', account_rep: 'Sales Rep', promotions: 'Marketer', buyer: 'Materials Buyer',
  office_assistant: 'Finance Clerk', finance_chief: 'Finance Manager', commercial_lead: 'Sales Manager',
  supply_lead: 'Purchasing Manager', supervisor: 'Floor Supervisor', dev_engineer: 'Research Engineer',
  bookkeeper: 'Bookkeeper', mechanic: 'Plant Mechanic', chief_engineer: 'Chief Engineer', director: 'Plant Director',
};
for (const [key, title] of Object.entries(want)) ok(JOBS[key]?.title === title, `job ${key} is titled "${title}" (${JOBS[key]?.title})`);
const depts = Object.fromEntries(DEPT_LIST.map(d => [d.key, d.name]));
ok(depts.exec === 'Management' && depts.commercial === 'Sales' && depts.supply === 'Purchasing', `departments: ${Object.values(depts).join(', ')}`);
ok(JOB_LIST.length === 14 && JOB_LIST.every(j => want[j.key]), 'job keys are unchanged (14 jobs, same keys)');
const titles = JOB_LIST.map(j => j.title);
ok(new Set(titles).size === titles.length, 'job titles are unique');
for (const j of JOB_LIST) {
  ok(j.title.length <= 18, `"${j.title}" is at most 18 characters`);
  ok(j.desc.length <= 120, `${j.title} duties are at most 120 characters (${j.desc.length})`);
}
// duties start with what the job does in the game
const duties = {
  line_worker: 'Runs one machine or works in a production cell', account_rep: 'Wins orders from stores', promotions: 'Runs ads and displays',
  buyer: 'Reorders materials up to your stock targets', bookkeeper: 'Posts invoices and bills', office_assistant: 'Does the same Finance work as a Bookkeeper',
  finance_chief: "Does the department's work", commercial_lead: "Does the department's work", supply_lead: "Does the department's work",
  supervisor: 'Speeds up every machine', dev_engineer: 'Runs a machine set to research', chief_engineer: 'Speeds up every research project',
  mechanic: 'Services machines', director: 'Makes every office department more productive',
};
for (const [key, start] of Object.entries(duties)) ok(JOBS[key].desc.startsWith(start), `${JOBS[key].title} duties start "${start}"`);
// the job the game suggests for each role is the one the statuses and buttons name
ok(jobFor('operator').title === 'Machine Operator' && jobFor('researcher').title === 'Research Engineer' && jobFor('sales').title === 'Sales Rep' && jobFor('purchasing').title === 'Materials Buyer', 'the hire for each role has the new title');

// no old title, department or line name is left in src/ or data/
const OLD = ['Line Worker', 'Account Rep', 'Promotions Specialist', 'Office Assistant', 'Finance Chief', 'Commercial Lead', 'Supply Lead',
  'Shift Supervisor', 'Development Engineer', 'Front office', 'Machine shop', 'Furniture shop', 'Plant manager', 'Hand cart', 'Input empty',
  'needs an engineer', 'researcher away', 'Hire a researcher', 'Hire an operator', 'Storage (pallets)', 'stored pallets', 'walk-in buyers',
  'Accounting falls', 'researcher-hours'];
for (const old of OLD) { const hits = find(new RegExp(old.replace(/[()]/g, '\\$&'), 'i')); ok(!hits.length, `no "${old}" in src/ or data/${hits.length ? ': ' + hits.slice(0, 3).join(' | ') : ''}`); }
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
for (const t of titles) ok(aOrAn(t) === `a ${t}`, `aOrAn("${t}") = "${aOrAn(t)}"`);
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
const handMade = find(/[Mm]achine #\$\{|cell #\$\{|#\$\{[^}]*\} input|'#' \+ [a-z.]*id\b/).filter(l => !/case 'machine': return/.test(l));
ok(!handMade.length, `no hand-built "Machine #" or "#\${id} input" labels${handMade.length ? ': ' + handMade.slice(0, 3).join(' | ') : ''}`);

// ---- criterion 2: the floor markers stay the same for the renamed statuses
const marks = { 'Out of materials': '!', 'Output full: storage full': '!', 'Output blocked: belt full': '!', 'Output tray full': '!',
  'No operator': '?', 'Research: no engineer': '?', 'Research: engineer away': null, 'Operator away': null, 'Waiting for materials': null, Running: null, 'Research 40%': null };
for (const [s, m] of Object.entries(marks)) ok(statusMark(s) === m, `floor marker for "${s}" is ${m ?? 'none'}`);
const statuses = find(/'(Out of materials|Research: no engineer|Research: engineer away)'/).filter(l => l.startsWith('src/sim/game.js'));
ok(statuses.length === 3, `the sim sets the new research and materials statuses (${statuses.length} of 3)`);
ok(find(/from: 'Plant log'/).length >= 5 && find(/from: 'Purchasing'/).length === 1, 'memos come from "Plant log" and "Purchasing"');
done('names');
