import { h, field, table, announce, confirmBox } from '../dom.js';
import { app, go, render as rerender, act } from '../app.js';
import * as G from '../../sim/game.js';
import { CITIES, ECONOMY, FAMILIES, ITEM_ID, ITEMS, RECIPES } from '../../gen/data.js';
import { lineOutlook } from '../../sim/world.js';
import { jobFor } from '../../core/content.js';
import { money, fmtDate } from '../../core/util.js';
import { listSaves, loadGame, deleteSave, topScores } from '../storage.js';
import { makeCandidate } from '../../sim/people.js';
import { ports, inputPorts, ZONE, newFloor } from '../../sim/floor.js';
import { demoScene } from '../topdown.js';
import { sfx } from '../sound.js';

let saves = null, scores = undefined;
export function mounted() {
  const art = document.getElementById('hero-art');
  if (art) { try { const cs = getComputedStyle(document.documentElement); const bg = cs.getPropertyValue('--bg').trim(), n = parseInt(bg.slice(1), 16); demoScene(art, { floor: cs.getPropertyValue('--floor').trim(), panel: cs.getPropertyValue('--panel').trim(), focus: cs.getPropertyValue('--focus').trim(), dark: ((n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11) < 110 }, newFloor, ZONE); } catch (e) { console.error(e); } }
  if (saves === null) listSaves().then(s => { saves = s; if (app.view === 'start') rerender({}); });
  if (scores === undefined) { scores = null; topScores().then(s => { scores = s || []; if (app.view === 'start') rerender({}); }); }
}

export function render() {
  const wrap = h('div', { class: 'stack', style: { gap: '28px' } });
  wrap.append(h('div', { class: 'hero-grid' }, h('div', { class: 'hero' },
    h('p', { class: 'kicker' }, 'A 90s-style factory management sim'),
    h('h1', null, 'Overhead'),
    h('div', { class: 'hazard-rule', 'aria-hidden': 'true' }),
    h('p', null, `Choose one of ${CITIES.length} American cities and lease a plant. Turn resin, steel and copper wire into motors, circuit boards and housings, then into lamps, toasters, tents, toys and fax machines. Hire a crew with real personalities, keep the machines fed, and outsell the firms across town.`),
    h('p', { class: 'muted' }, 'Every screen works with a keyboard and a screen reader, and the clock only moves when you start it.'),
    h('div', { class: 'row' },
      saves?.auto ? h('button', { class: 'primary', type: 'button', onclick: () => loadSlot('auto') }, `Continue ${saves.auto.company}`) : null,
      h('button', { class: saves?.auto ? '' : 'primary', type: 'button', onclick: quickStart }, 'Quick start'),
      h('a', { class: 'btn', href: '#new-game' }, 'Set up a new company'))), h('canvas', { class: 'hero-art', id: 'hero-art', 'aria-hidden': 'true' })));

  wrap.append(newGameForm());
  wrap.append(savesCard());
  wrap.append(h('section', { class: 'card', 'aria-labelledby': 'hof' }, h('h2', { id: 'hof' }, 'Best companies on this computer'),
    scores === null ? h('p', { class: 'muted' }, 'Loading scores…') : scores && scores.length ? table('Best companies', [
      { key: 'company', label: 'Company', render: r => r.company }, { key: 'city', label: 'City' }, { key: 'months', label: 'Months', num: true }, { key: 'score', label: 'Score', num: true, render: r => money(r.score) }],
    scores, { hideCaption: true }) : h('p', { class: 'muted' }, 'No scores yet. Retire a company from Options to record yours.')));
  wrap.append(h('p', { class: 'muted', style: { fontSize: '0.85rem' } }, 'Overhead is free software. Saves stay in this browser unless you export them.'));
  return wrap;
}

function newGameForm() {
  const company = h('input', { id: 'ng-company', value: 'Keystone Manufacturing', maxlength: 40, autocomplete: 'off' });
  const owner = h('input', { id: 'ng-owner', value: '', maxlength: 40, autocomplete: 'off', placeholder: 'Optional' });
  const diff = h('select', { id: 'ng-diff' }, h('option', { value: 'easy' }, 'Relaxed: more demand, slightly cheaper'), h('option', { value: 'normal', selected: true }, 'Standard'), h('option', { value: 'hard' }, 'Cutthroat: less demand, pricier'));
  const seed = h('input', { id: 'ng-seed', inputmode: 'numeric', maxlength: 12, autocomplete: 'off' });
  const sandbox = h('input', { type: 'checkbox', id: 'ng-sandbox' });
  const scen = Object.entries(G.SCENARIOS).map(([k, s], i) => h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } },
    h('input', { type: 'radio', name: 'ng-scen', id: 'ng-scen-' + k, value: k, checked: i === 0 }),
    h('label', { for: 'ng-scen-' + k, style: { fontWeight: 400 } }, h('strong', null, s.label), ' — ', s.desc)));
  const form = h('form', { class: 'stack', onsubmit: e => {
    e.preventDefault();
    const sc = form.querySelector('input[name=ng-scen]:checked').value;
    app.st = G.newGame({ company: company.value.trim() || 'Keystone Manufacturing', owner: owner.value.trim(), scenario: sc, difficulty: diff.value, seed: seed.value.trim(), sandbox: sandbox.checked });
    sfx('fanfare'); announce(`${app.st.setup.company} is founded. Choose a city.`);
    go('nation');
  } },
    h('div', { class: 'grid2' }, field('Company name', company), field('Your name', owner)),
    h('fieldset', { class: 'stack', style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '12px' } }, h('legend', { style: { fontWeight: 700 } }, 'Starting money'), scen),
    h('div', { class: 'grid2' }, field('Difficulty', diff), field('Scenario number', seed, 'Optional. The same number always builds the same cities and markets.')),
    h('div', { class: 'row' }, sandbox, h('label', { for: 'ng-sandbox', style: { fontWeight: 400 } }, 'Practice mode: start with $5,000,000 (scores are not posted)')),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Found the company')));
  return h('section', { class: 'card', id: 'new-game', 'aria-labelledby': 'ng-h' }, h('h2', { id: 'ng-h' }, 'New company'), form);
}

function savesCard() {
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', id: 'import-file', onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const st = JSON.parse(await f.text()); if (!st.setup || !st.bank) throw new Error('not a save'); app.st = G.migrate(st); announce(`Loaded ${st.setup.company}.`); go(st.phase === 'play' ? 'floor' : st.phase); }
    catch { announce("That file isn't an Overhead save.", 'assertive'); }
  } });
  const rows = saves ? Object.values(saves).sort((a, b) => b.savedAt - a.savedAt) : [];
  return h('section', { class: 'card', 'aria-labelledby': 'saves-h' }, h('h2', { id: 'saves-h' }, 'Saved games'),
    saves === null ? h('p', { class: 'muted' }, 'Looking for saved games…') :
      table('Saved games', [
        { key: 'label', label: 'Save', render: r => `${r.slot === 'auto' ? 'Autosave' : 'Slot ' + r.slot}: ${r.company}` },
        { key: 'city', label: 'City' }, { key: 'gameTime', label: 'Game date', render: r => fmtDate(r.gameTime) },
        { key: 'savedAt', label: 'Saved', render: r => new Date(r.savedAt).toLocaleString() },
        { key: 'act', label: 'Actions', render: r => h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => loadSlot(r.slot) }, 'Load'), h('button', { type: 'button', class: 'danger', onclick: async () => { if (await confirmBox('Delete save?', `Delete the save for ${r.company}? This cannot be undone.`, 'Delete', true)) { await deleteSave(r.slot); saves = null; rerender({}); } } }, 'Delete')) }],
      rows, { hideCaption: true, empty: 'No saved games yet.' }),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('label', { for: 'import-file' }, 'Import a save file'), fileIn));
}

async function loadSlot(slot) {
  const st = await loadGame(slot);
  if (!st) { announce('That save could not be read.', 'assertive'); return; }
  app.st = G.migrate(st); app.speed = 0; announce(`Loaded ${st.setup.company}, ${fmtDate(st.time)}.`);
  go(st.phase === 'play' ? 'floor' : st.phase === 'city' ? 'city' : 'nation');
}

// A ready-to-run factory in a mid-sized city: one machine making whichever component from bought materials looks
// most profitable there (the world's default starter if nothing does).
function quickStart() {
  const st = G.newGame({ company: 'Keystone Manufacturing', scenario: G.DEFAULT_SCENARIO, difficulty: 'normal' });
  const options = CITIES.map((c, i) => [c, i]).filter(([c]) => c.metro > 700000 && c.metro < 2600000);
  const [, cityId] = options[Math.floor(Math.random() * options.length)];
  G.visitCity(st, cityId);
  const lot = st.city.lots.filter(l => l.firm == null).sort((a, b) => Math.abs(a.sqft - 30000) + a.rentPsf * 20000 - (Math.abs(b.sqft - 30000) + b.rentPsf * 20000))[0];
  G.rentBuilding(st, lot.id);
  const fallback = RECIPES.find(r => r.out === ITEM_ID[ECONOMY.quickStart.product]);
  const best = RECIPES.filter(r => r.start && r.inputs.every(([i]) => ITEMS[i].tier === 'material')).map(r => [r, lineOutlook(st, r.id) / FAMILIES[r.family].price]).sort((a, b) => b[1] - a[1])[0];
  const pick = best && best[1] > 0 ? best[0] : fallback;
  const fl = st.floor;
  const m = G.placeEquipment(st, { kind: 'machine', family: pick.family, x: 4, y: 4, rot: 0, recipe: pick.id }).obj;
  for (const [ix, iy] of inputPorts(m)) fl.zones[iy * fl.w + ix] = ZONE.SAFETY;
  G.placeEquipment(st, { kind: 'office', officeType: 0, x: 12, y: 4, rot: 0 });
  const crew = [jobFor('operator'), jobFor('sales')];
  for (const job of crew) { const c = makeCandidate(st, job.key); const memo = G.memo(st, { from: `${c.first} ${c.last}`, subject: 'Resume', kind: 'resume', data: { cand: c, expires: st.time + 1e7 } }); memo.read = true; G.makeOffer(st, memo.id, c.ask); }
  G.purchaseAll(st);
  st.memos.forEach(x => { if (x.kind === 'resume') x.read = true; });
  G.memo(st, { from: 'Plant manager', subject: 'Quick start: ready to roll', important: false, body: `A ${FAMILIES[pick.family].name.toLowerCase()} making ${ITEMS[pick.out].name}, the best opening for a first machine in ${st.city.name}, is set up with safety zones, a ${crew[0].title} is on it, an ${crew[1].title} has an office, and the first materials are on order. Press Play (or the space bar) to start the clock. Good next hires: a ${jobFor('finance').title} and a ${jobFor('maintenance').title}. Then add a product line that uses what this machine makes.` });
  st.flags.pauseRequest = false; G.bus.queue.length = 0;
  app.st = st; app.speed = 0;
  sfx('place'); announce(`Quick start: ${st.setup.company} in ${st.city.name}. Press Play to start the clock.`);
  go('floor');
}
