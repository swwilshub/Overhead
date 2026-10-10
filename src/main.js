import { app, registerView, render, loadPrefs, startLoop, installKeys } from './ui/app.js';
import { RECIPES, ITEMS, FAMILIES, ITEM_ID, FAMILY_ID } from './gen/data.js';
import { jobFor } from './core/content.js';
import { makeCandidate } from './sim/people.js';
import { drawObject, T as TILE } from './ui/topdown.js';
import * as cells from './sim/cells.js';
import * as suites from './sim/suites.js';
import * as start from './ui/views/start.js';
import * as nation from './ui/views/nation.js';
import * as city from './ui/views/city.js';
import * as floor from './ui/views/floor.js';
import * as catalog from './ui/views/catalog.js';
import { staff, hire, inbox } from './ui/views/people.js';
import { purchasing, sales, bank, reports, research, options } from './ui/views/business.js';
import * as G from './sim/game.js';
import { ZONE } from './sim/floor.js';
import { sfxLog } from './ui/sound.js';

for (const [k, v] of Object.entries({ start, nation, city, floor, catalog, staff, hire, inbox, purchasing, sales, bank, reports, research, options })) registerView(k, v);

function boot() {
  document.documentElement.lang = 'en';
  loadPrefs();
  render({});
  startLoop();
  installKeys();
}
// test hook (used by the automated browser tests)
// hire(role) adds someone for a role (operator, sales, finance, ...) at their asking salary, for tests that need staff
const hireRole = role => { const st = app.st, c = makeCandidate(st, jobFor(role).key); const m = G.memo(st, { from: 'test', subject: 'r', kind: 'resume', data: { cand: c, expires: st.time + 1e7 } }); m.read = true; const r = G.makeOffer(st, m.id, c.ask * 1.1); return r.ok ? r.emp.id : null; };
window.__overhead = { app, G, ZONE, sfxLog, belt: floor.beltDebug, floorPoint: floor.tileScreen, emptyTile: floor.findEmptyTile, selectId: id => { const o = app.st.floor.objects.find(o => o.id === id); if (o) floor.selectObj(o); }, camera: floor.cameraState, RECIPES, ITEMS, FAMILIES, ITEM_ID, FAMILY_ID, drawObject, TILE, cells, suites, jobFor, hire: hireRole };
boot();
