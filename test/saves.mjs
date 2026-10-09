// Old saves still load: every fixture in test/fixtures/save-v*.json goes through migrate(), comes out at the current
// save version, and plays on for a month without errors or NaNs. When the save format changes, bump VERSION in
// src/sim/game.js, add the migration, and keep the old fixtures here (add a new one for the new version).
import fs from 'fs'; import path from 'path';
import * as G from '../src/sim/game.js';
import { JOBS, levelOf } from '../src/core/content.js';
import { xpFloor } from '../src/sim/people.js';
import { objectLabel } from '../src/sim/floor.js';
import { ok, done } from './lib.mjs';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const files = fs.readdirSync(dir).filter(f => /^save-v\d+\.json$/.test(f)).sort();
ok(files.length > 0, `found ${files.length} save fixture(s): ${files.join(', ')}`);
const checkNaN = (o, p = '') => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('NaN at ' + p + k); if (v && typeof v === 'object') checkNaN(v, p + k + '.'); } };
for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const from = raw.v, before = raw.employees.map(e => [e.id, e.job]), st = G.migrate(raw);
  ok(st.v === G.VERSION, `${f}: format ${from} migrates to ${G.VERSION}`);
  // old saves store job keys, so every employee shows a current title, and every machine and cell a current label
  ok(st.employees.length > 0 && st.employees.every(e => JOBS[e.job]?.title), `${f}: every employee has a job title (${[...new Set(st.employees.map(e => JOBS[e.job].title))].join(', ')})`);
  ok(st.employees.every(e => typeof e.xp === 'number' && e.xp >= xpFloor(levelOf(e)) && JOBS[e.job]), `${f}: every employee has experience that matches their level`);
  if (from === 1) {   // version 1 used fourteen separate jobs; each maps to the nearest (family, level) (spec 010)
    const MAP = { line_worker: 'operations_1', supervisor: 'operations_3', mechanic: 'maintenance_1', dev_engineer: 'engineering_1', chief_engineer: 'engineering_3', office_assistant: 'finance_1',
      bookkeeper: 'finance_2', finance_chief: 'finance_3', account_rep: 'sales_1', commercial_lead: 'sales_3', promotions: 'promotions_1', buyer: 'purchasing_1', supply_lead: 'purchasing_3', director: 'director' };
    ok(before.every(([id, job]) => st.employees.find(e => e.id === id).job === MAP[job]), `${f}: each old job becomes its ladder job (${[...new Set(before.map(([, j]) => j + ' to ' + MAP[j]))].join(', ')})`);
    ok(st.memos.filter(m => m.kind === 'resume').every(m => JOBS[m.data.cand.job]) && st.ads.every(a => a.family), `${f}: waiting resumes and running ads are read as ladder jobs`);
  }
  ok(st.floor.objects.filter(o => o.kind === 'machine' || o.kind === 'cell').every(o => /^[A-Z][\w -]+ (line machine|cell) #\d+$/.test(objectLabel(st, o)) && !/cell cell/.test(objectLabel(st, o))), `${f}: machines and cells show the new labels`);
  const made = st.floor.objects.reduce((a, o) => a + (o.produced || 0), 0), t0 = st.time;
  let err = null;
  try { G.advance(st, 30 * 1440); checkNaN(st); } catch (e) { err = e; }
  ok(!err, `${f}: plays on for 30 days${err ? ': ' + err.message : ''}`);
  ok(st.time > t0 && st.floor.objects.reduce((a, o) => a + (o.produced || 0), 0) > made, `${f}: the plant keeps producing`);
}
const future = { ...JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8')), v: G.VERSION + 1 };
let refused = false; try { G.migrate(future); } catch { refused = true; }
ok(refused, 'a save from a newer version is refused with a message, not loaded half-broken');
done('save');
