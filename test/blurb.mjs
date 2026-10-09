// The title-screen blurb promises only what the game has: every item it names is a real item in data/world.json,
// and the city count comes from the data, not a typed number.
import fs from 'fs';
import path from 'path';
import { ok, done } from './lib.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const world = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'world.json'), 'utf8'));
const src = fs.readFileSync(path.join(here, '..', 'src', 'ui', 'views', 'start.js'), 'utf8');

const m = src.match(/`(Choose one of [^`]*)`/);
ok(!!m, 'title blurb found in start.js');
const blurb = m ? m[1] : '';
ok(blurb.includes('${CITIES.length} American cities'), 'city count in the blurb comes from CITIES.length');

const names = new Set(['materials', 'components', 'products'].flatMap(k => Object.values(world[k]).map(it => it.name)));
// word in the blurb -> the item it stands for
const NAMED = {
  'magnet wire': 'Magnet wire', motors: 'Fractional motor', 'control boards': 'Control board', housings: 'ABS housing',
  lamps: 'Desk lamp', toasters: 'Toaster', tents: 'Dome tent', 'cash registers': 'Cash register',
};
for (const [word, item] of Object.entries(NAMED)) {
  ok(new RegExp(`\\b${word}\\b`).test(blurb), `blurb names "${word}"`);
  ok(names.has(item), `"${word}" is an item in the game: ${item}`);
}
for (const gone of ['copper wire', 'circuit boards']) ok(!blurb.includes(gone), `blurb no longer names "${gone}"`);
done('blurb');
