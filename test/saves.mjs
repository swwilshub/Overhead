// Old saves still load: every fixture in test/fixtures/save-v*.json goes through migrate(), comes out at the current
// save version, and plays on for a month without errors or NaNs. When the save format changes, bump VERSION in
// src/sim/game.js, add the migration, and keep the old fixtures here (add a new one for the new version).
import fs from 'fs'; import path from 'path';
import * as G from '../src/sim/game.js';
import { ok, done } from './lib.mjs';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const files = fs.readdirSync(dir).filter(f => /^save-v\d+\.json$/.test(f)).sort();
ok(files.length > 0, `found ${files.length} save fixture(s): ${files.join(', ')}`);
const checkNaN = (o, p = '') => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('NaN at ' + p + k); if (v && typeof v === 'object') checkNaN(v, p + k + '.'); } };
for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const from = raw.v, st = G.migrate(raw);
  ok(st.v === G.VERSION, `${f}: format ${from} migrates to ${G.VERSION}`);
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
