// Room editor on the factory floor, for production cells and office suites:
//   1. Size: pick two opposite corners of the room.
//   2. Hatches: move the door, the input hatches (one per material) and the output hatch around the outside of the wall.
//   3. Furnish: place the required items (included in the price), then duplicates and extras, and confirm.
// Keyboard and mouse do the same things; every step is announced.
import { h, frag, announce, describe, confirmBox, pill } from '../dom.js';
import { app, go, render as rerender, act } from '../app.js';
import * as G from '../../sim/game.js';
import { ITEMS, RECIPES, FAMILIES } from '../../gen/data.js';
import { inBounds, objectAt, placementProblem } from '../../sim/floor.js';
import { money, num } from '../../core/util.js';
import { unitsPerHour } from '../../sim/world.js';
import { sfx } from '../sound.js';
import { CELL_ITEMS, itemDef, itemTiles, itemSize, isStation, workSquare, itemProblem, analyse, standardLayout, defaultHatches, hatchSpotOk, HATCH_ROLES, REQUIRED, EXTRAS, MIN_SIZE, MAX_SIZE, METRICS, TECHS, cellPrice, techDone } from '../../sim/cells.js';
import { itemColor } from '../topdown.js';
import { analyseSuite, standardSuite, suitePrice, defaultSuiteHatches, SUITE_REQUIRED, SUITE_EXTRAS, SUITE_MIN, SUITE_MAX } from '../../sim/suites.js';

// what differs between a production cell and an office suite
function K(d) {
  if (d.kind === 'suite') return {
    suite: true, title: 'Office suite', noun: 'office suite', min: SUITE_MIN, max: SUITE_MAX, roles: [{ role: 'door', label: 'Door' }],
    required: SUITE_REQUIRED, extras: SUITE_EXTRAS, analyse: x => analyseSuite(x), standard: x => standardSuite(x), price: (w, hh) => suitePrice(w, hh), hatches: x => defaultSuiteHatches(x),
    stepNames: ['Size', 'Door', 'Furnish'], perSquare: 90,
  };
  return {
    suite: false, title: `${FAMILIES[d.family].name} cell`, noun: 'cell', min: MIN_SIZE, max: MAX_SIZE, roles: HATCH_ROLES(d.family),
    required: REQUIRED(d.family), extras: EXTRAS(d.family), analyse: (x, o) => analyse(x, o), standard: x => standardLayout(x), price: (w, hh) => cellPrice(d.family, w, hh), hatches: x => defaultHatches(x),
    stepNames: ['Size', 'Hatches', 'Furnish'], perSquare: 120,
  };
}
export function startSuite() {
  const v = fv() || (app.viewState.floor = { zoom: 1, cx: 2, cy: 2, sel: null, mode: 'select', placing: null, zone: 2, rot: 0, moving: null });
  v.mode = 'cell'; v.sel = null; v.placing = null;
  v.cell = { stage: 'size', corner: null, draft: { kind: 'suite', x: 0, y: 0, cw: 0, ch: 0, hatches: [], items: [] }, editingId: null, role: 0, tool: null };
  go('floor');
  setTimeout(() => document.getElementById('floor-app')?.focus(), 50);
  announce(`Designing an office suite. Step 1 of 3: move to one corner of the room and press Enter, then to the opposite corner and press Enter. At least ${SUITE_MIN[0]} by ${SUITE_MIN[1]} squares.`, 'polite', false);
}

const fv = () => app.viewState.floor;
export const editing = () => fv()?.mode === 'cell' && fv().cell;

export function startCell(family, recipe = null) {
  const v = fv() || (app.viewState.floor = { zoom: 1, cx: 2, cy: 2, sel: null, mode: 'select', placing: null, zone: 2, rot: 0, moving: null });
  v.mode = 'cell'; v.sel = null; v.placing = null;
  v.cell = { stage: 'size', corner: null, draft: { kind: 'cell', family, recipe, x: 0, y: 0, cw: 0, ch: 0, hatches: [], items: [] }, editingId: null, role: 0, tool: null };
  go('floor');
  setTimeout(() => document.getElementById('floor-app')?.focus(), 50);
  announce(`Building a ${FAMILIES[family].name} cell. Step 1 of 3: move to one corner of the room and press Enter, then to the opposite corner and press Enter. At least ${MIN_SIZE[0]} by ${MIN_SIZE[1]} squares.`, 'polite', false);
}
export function startEditCell(o) {
  const v = fv(); v.mode = 'cell'; v.sel = null;
  v.cell = { stage: 'furnish', draft: { kind: o.kind, family: o.family, recipe: o.recipe, x: o.x, y: o.y, cw: o.cw, ch: o.ch, hatches: o.hatches.map(x => ({ ...x })), items: o.items.map(x => ({ ...x })) }, editingId: o.id, role: 0, tool: null };
  rerender({}); setTimeout(() => document.getElementById('floor-app')?.focus(), 30);
  announce(`Editing ${o.kind === 'suite' ? 'office suite' : 'cell'} #${o.id}. Pick an item from the panel to add it, or move to an item and press Enter to pick it up. Delete removes it.`, 'polite', false);
}
function stop(msg) { const v = fv(); v.mode = 'select'; const id = v.cell?.editingId; v.cell = null; if (id) v.sel = id; if (msg) announce(msg, 'polite', false); rerender({}); document.getElementById('floor-app')?.focus(); }

// ---------- geometry helpers
function rectFrom(a, b) { const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]); return { x, y, cw: Math.abs(a[0] - b[0]) + 1, ch: Math.abs(a[1] - b[1]) + 1 }; }
function sizeProblem(st, r, ignoreId) {
  const k = K(fv().cell.draft);
  if (r.cw < k.min[0] || r.ch < k.min[1]) return `Too small: ${r.cw} by ${r.ch}. ${k.suite ? 'An office suite' : 'A cell'} needs at least ${k.min[0]} by ${k.min[1]} squares.`;
  if (r.cw > k.max[0] || r.ch > k.max[1]) return `Too big: at most ${k.max[0]} by ${k.max[1]} squares.`;
  return placementProblem(st.floor, { kind: fv().cell.draft.kind || 'cell', ...r, hatches: [], family: 0 }, ignoreId);
}
const local = (d, x, y) => [x - d.x, y - d.y];
const roleKey = hz => hz.role === 'in' ? 'in' + hz.k : hz.role;
const roleLabel = hz => hz.role === 'door' ? 'door' : hz.role === 'out' ? 'output hatch' : `input ${hz.k + 1} hatch`;
function hatchSpotProblem(st, d, lx, ly, ignore) {
  if (!hatchSpotOk(d, lx, ly)) return 'Hatches go on the squares just outside the wall, not on corners.';
  const ax = d.x + lx, ay = d.y + ly;
  if (!inBounds(st.floor, ax, ay)) return 'That is outside the building.';
  if (d.hatches.some(o => o !== ignore && o.lx === lx && o.ly === ly)) return 'Another hatch is already there.';
  const o = objectAt(st.floor, ax, ay); const v = fv();
  if (o && o.id !== v.cell?.editingId && !(o.kind === 'conveyor' && ignore?.role !== 'door')) return 'Something is in the way outside.';
  return null;
}

// ---------- input
export function editorPrimary(st) {
  const v = fv(), E = v.cell, d = E.draft;
  if (E.stage === 'size') {
    if (!E.corner) { E.corner = [v.cx, v.cy]; sfx('tick'); announce(`First corner set at column ${v.cx + 1}, row ${v.cy + 1}. Now move to the opposite corner and press Enter.`, 'polite', false); refreshPanel(); return; }
    const r = rectFrom(E.corner, [v.cx, v.cy]); const p = sizeProblem(st, r, E.editingId);
    if (p) { sfx('error'); announce(p, 'assertive'); return; }
    Object.assign(d, r); d.hatches = K(d).hatches(d);
    // nudge default hatches that land on something
    for (const hz of d.hatches) if (hatchSpotProblem(st, d, hz.lx, hz.ly, hz)) { const alt = perimeter(d).find(([lx, ly]) => !hatchSpotProblem(st, d, lx, ly, hz)); if (alt) { hz.lx = alt[0]; hz.ly = alt[1]; } }
    E.stage = 'hatch'; E.role = 0; sfx('place');
    announce(K(d).suite ? `Room ${r.cw} by ${r.ch} squares, ${money(suitePrice(r.cw, r.ch))} with one desk. Step 2 of 3: the door. It is at the front; press Enter on a square just outside the wall to move it, or go on to Furnish.` : `Room ${r.cw} by ${r.ch} squares, ${money(cellPrice(d.family, r.cw, r.ch))} with the required items. Step 2 of 3: hatches. Default positions are set: door at the front, inputs on the left, output on the right. Pick a hatch in the panel and press Enter on a square just outside the wall to move it, or go on to Furnish.`, 'polite', false);
    rerender({}); document.getElementById('floor-app')?.focus(); return;
  }
  if (E.stage === 'hatch') {
    const [lx, ly] = local(d, v.cx, v.cy); const hz = d.hatches[E.role];
    const p = hatchSpotProblem(st, d, lx, ly, hz); if (p) { sfx('error'); announce(p, 'assertive'); return; }
    hz.lx = lx; hz.ly = ly; sfx('place'); announce(`The ${roleLabel(hz)} is now here.`, 'polite', false);
    E.role = (E.role + 1) % d.hatches.length; refreshPanel(); return;
  }
  // furnish
  const [lx, ly] = local(d, v.cx, v.cy);
  if (E.tool) {
    const it = { t: E.tool.t, x: 0, y: 0, rot: v.rot }; const { w, h: hh } = itemSize(it); it.x = lx - Math.floor((w - 1) / 2); it.y = ly - Math.floor((hh - 1) / 2);
    const def = itemDef(it.t);
    if (def.tech && !techDone(st, def.tech)) { sfx('error'); announce(`${def.name} needs ${TECHS[def.tech].name} research first.`, 'assertive'); return; }
    const p = itemProblem(d, it); if (p) { sfx('error'); announce(p, 'assertive'); return; }
    d.items.push(it); sfx('place');
    const a = K(d).analyse(d);
    announce(`${def.name} placed.${isStation(it) ? (K(d).suite ? ' Its chair goes on the square in front.' : ' Its work square is in front of it.') : ''} ${!a.ok ? a.problems[0] : K(d).suite ? `${a.seats} desk${a.seats > 1 ? 's' : ''}, average productivity ${a.avg >= 0 ? '+' : ''}${Math.round(a.avg * 100)}%, comfort ${Math.round(a.comfort)}.` : `Cell runs at ${(a.speedMult * 100).toFixed(0)}% of a standard machine.`}`, 'polite', false);
    if (!E.tool.repeat) E.tool = null; refreshPanel(); return;
  }
  // pick up the item under the cursor to move it
  const it = itemAt(d, lx, ly);
  if (it) { d.items.splice(d.items.indexOf(it), 1); E.tool = { t: it.t, repeat: false }; v.rot = it.rot || 0; sfx('tick'); announce(`Picked up the ${itemDef(it.t).name.toLowerCase()}. Move it and press Enter to put it down, or Escape to put it back.`, 'polite', false); E.picked = it; refreshPanel(); }
}
function itemAt(d, lx, ly) { return [...d.items].reverse().find(it => itemTiles(it).some(([x, y]) => x === lx && y === ly)); }
function perimeter(d) { const out = []; for (let x = 0; x < d.cw; x++) out.push([x, -1], [x, d.ch]); for (let y = 0; y < d.ch; y++) out.push([-1, y], [d.cw, y]); return out; }
export function editorKey(e, st) {
  const v = fv(), E = v.cell; if (!E) return false;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (E.tool) { if (E.picked) { E.draft.items.push(E.picked); E.picked = null; } E.tool = null; announce('Put down.', 'polite', false); refreshPanel(); return true; }
    if (E.stage === 'size' && E.corner) { E.corner = null; announce('Corner cleared.', 'polite', false); refreshPanel(); return true; }
    cancelEditor(); return true;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && E.stage === 'furnish') {
    e.preventDefault(); const [lx, ly] = local(E.draft, v.cx, v.cy); const it = itemAt(E.draft, lx, ly);
    if (it) { E.draft.items.splice(E.draft.items.indexOf(it), 1); sfx('cash'); announce(`Removed the ${itemDef(it.t).name.toLowerCase()}.`, 'polite', false); refreshPanel(); }
    return true;
  }
  return false;
}
export async function cancelEditor() {
  const E = fv().cell; if (!E) return;
  if (E.stage !== 'size' && !(await confirmBox(E.editingId ? 'Discard changes?' : 'Cancel this cell?', E.editingId ? 'Changes to the layout will be lost.' : 'The blueprint will be discarded. Nothing has been paid yet.', E.editingId ? 'Discard' : 'Cancel blueprint', true))) return;
  stop(E.editingId ? 'Changes discarded.' : 'Blueprint cancelled.');
}

export function speakCell(st) {
  const v = fv(), E = v.cell, d = E.draft;
  if (E.stage === 'size') {
    if (!E.corner) return 'Choose the first corner.';
    const r = rectFrom(E.corner, [v.cx, v.cy]); const p = sizeProblem(st, r, E.editingId);
    return `${r.cw} by ${r.ch} squares, ${money(K(d).price(r.cw, r.ch))}. ${p || 'Press Enter to set the room.'}`;
  }
  const [lx, ly] = local(d, v.cx, v.cy);
  const inside = lx >= 0 && ly >= 0 && lx < d.cw && ly < d.ch;
  const hz = d.hatches.find(o => o.lx === lx && o.ly === ly);
  if (E.stage === 'hatch') { if (hz) return `The ${roleLabel(hz)} is here.`; const p = hatchSpotProblem(st, d, lx, ly, d.hatches[E.role]); return p ? p : `Press Enter to put the ${roleLabel(d.hatches[E.role])} here.`; }
  let msg = inside ? `Inside the cell, square ${lx + 1} of ${d.cw} across, ${ly + 1} of ${d.ch} down` : hz ? `Outside the wall: ${roleLabel(hz)}` : 'Outside the cell';
  const it = inside && itemAt(d, lx, ly); if (it) msg += `: ${itemDef(it.t).name.toLowerCase()}`;
  else if (inside && d.items.some(s => isStation(s) && workSquare(s)[0] === lx && workSquare(s)[1] === ly)) msg += ': a work square, keep clear';
  if (E.tool) { const g = toolGhost(); const p = g && itemProblem(d, g); msg += p ? `. Cannot place: ${p}` : '. Placement OK.'; }
  return msg + '.';
}
function toolGhost() {
  const v = fv(), E = v.cell; if (!E?.tool) return null;
  const it = { t: E.tool.t, x: 0, y: 0, rot: v.rot }; const { w, h: hh } = itemSize(it);
  it.x = v.cx - E.draft.x - Math.floor((w - 1) / 2); it.y = v.cy - E.draft.y - Math.floor((hh - 1) / 2); return it;
}
// what the floor renderer needs to show the editor
export function editorDraw(st) {
  const v = fv(), E = v.cell; if (!E) return null;
  if (E.stage === 'size') { const r = E.corner ? rectFrom(E.corner, [v.cx, v.cy]) : { x: v.cx, y: v.cy, cw: 1, ch: 1 }; return { rect: r, ok: E.corner ? !sizeProblem(st, r, E.editingId) : true }; }
  const g = toolGhost();
  return { draft: { ...E.draft, kind: E.draft.kind || 'cell', status: '' }, hideId: E.editingId, tool: g, toolOk: g ? !itemProblem(E.draft, g) : true, hatchStage: E.stage === 'hatch', role: E.draft.hatches[E.role] };
}

// ---------- side panel
function refreshPanel() { const el = document.getElementById('inspector'); if (el) el.replaceChildren(editorPanel(app.st)); app.dirty = true; }
export function editorPanel(st) {
  const v = fv(), E = v.cell, d = E.draft, fam = d.family;
  const k = K(d), steps = k.stepNames, cur = { size: 0, hatch: 1, furnish: 2 }[E.stage];
  const head = h('div', { class: 'cell-head' }, h('h2', { tabindex: -1, id: 'cell-ed-h' }, k.title),
    h('ol', { class: 'cell-steps', 'aria-label': 'Steps' }, steps.map((s, i) => h('li', { 'aria-current': i === cur ? 'step' : null, class: i < cur ? 'done' : '' }, `${i + 1}. ${s}`))));
  const card = h('section', { class: 'card stack cell-panel', 'aria-labelledby': 'cell-ed-h' }, head);
  const btn = (label, on, opts = {}) => h('button', { type: 'button', ...opts, onclick: on }, label);
  if (E.stage === 'size') {
    card.append(h('p', null, E.corner ? 'Now move to the opposite corner and press Enter (or click).' : 'Move to one corner of the room and press Enter (or click). The room can be ' + `${k.min[0]}×${k.min[1]} to ${k.max[0]}×${k.max[1]} squares. ${k.suite ? 'Each desk seats one person; allow about six squares per desk so it isn\'t cramped.' : 'Bigger rooms cost more but leave space for extras.'}`),
      h('p', { class: 'muted' }, `Price: ${money(k.price(k.min[0], k.min[1]))} for the smallest room, plus ${money(k.perSquare)} a square. It includes ${k.suite ? 'one desk and chair' : 'the required items'}.`),
      h('div', { class: 'row' }, btn('Cancel', () => cancelEditor(), { class: 'danger', 'data-key': 'cell-cancel' })));
    return card;
  }
  if (E.stage === 'hatch') {
    const roles = k.roles, rec = k.suite ? null : d.recipe != null ? RECIPES[d.recipe] : RECIPES.find(r => r.family === fam && r.start);
    card.append(h('p', null, k.suite ? 'Press Enter on a square just outside the wall to move the door there.' : 'Pick a hatch, then press Enter on a square just outside the wall to move it there. Inputs take one material each; belts and carts connect at the hatches.'),
      h('div', { role: 'radiogroup', 'aria-label': 'Hatch to move', class: 'cell-list' }, d.hatches.map((hz, i) => {
        const mat = !rec ? null : hz.role === 'in' ? rec.inputs[hz.k]?.[0] : hz.role === 'out' ? rec.out : null;
        return h('button', { type: 'button', role: 'radio', 'aria-checked': String(i === E.role), 'data-key': 'hatch-' + roleKey(hz), class: 'cell-row' + (i === E.role ? ' on' : ''), onclick: () => { E.role = i; refreshPanel(); document.getElementById('floor-app')?.focus(); announce(`Moving the ${roleLabel(hz)}.`, 'polite', false); } },
          mat != null ? h('span', { class: 'swatch', 'aria-hidden': 'true', style: { background: itemColor(mat) } }) : null,
          h('span', null, roles.find(r => roleKey(r) === roleKey(hz))?.label || hz.role, mat != null ? `: ${ITEMS[mat].name}` : ''), h('small', null, `${hz.lx < 0 ? 'left' : hz.lx >= d.cw ? 'right' : hz.ly < 0 ? 'back' : 'front'} wall`));
      })),
      h('div', { class: 'row' }, btn('Back', () => { E.stage = 'size'; E.corner = null; refreshPanel(); }, { 'data-key': 'cell-back' }), btn('Next: furnish', () => { E.stage = 'furnish'; rerender({}); document.getElementById('floor-app')?.focus(); announce('Step 3 of 3: furnish. Pick an item, move it into the room and press Enter. R rotates. Or use Standard layout.', 'polite', false); }, { class: 'primary', 'data-key': 'cell-next' }), btn('Cancel', () => cancelEditor(), { class: 'danger', 'data-key': 'cell-cancel' })));
    return card;
  }
  // furnish
  const a = k.analyse(d, { operators: 1 });
  const counts = {}; for (const it of d.items) counts[it.t] = (counts[it.t] || 0) + 1;
  const req = k.required;
  const pickTool = (t, repeat = false) => { E.tool = { t, repeat }; E.picked = null; v.rot = 0; refreshPanel(); document.getElementById('floor-app')?.focus(); announce(`Placing a ${itemDef(t).name.toLowerCase()}. ${itemDef(t).desc} Move into the room, R rotates, Enter places, Escape stops.`, 'polite', false); };
  const itemRow = (t, kind) => {
    const def = itemDef(t), have = counts[t] || 0, need = req.find(r => r.t === t)?.n || 0, locked = def.tech && !techDone(st, def.tech);
    const price = kind === 'req' && have < need ? 'Included' : money(def.price);
    return h('li', null, h('button', { type: 'button', class: 'cell-row' + (E.tool?.t === t ? ' on' : ''), 'aria-pressed': String(E.tool?.t === t), disabled: locked, 'data-key': 'item-' + t, onclick: () => pickTool(t),
      title: def.desc, 'aria-describedby': 'desc-' + t },
      h('span', { class: 'cell-row-name' }, def.name, def.role === 'A' || def.role === 'B' ? h('small', null, ` station ${def.role}`) : null),
      kind === 'req' ? h('span', { class: 'count ' + (have >= need ? 'good' : 'bad') }, `${have}/${need}`) : have ? h('span', { class: 'count' }, `×${have}`) : null,
      h('small', null, locked ? `Research: ${TECHS[def.tech].name}` : price)),
      h('span', { id: 'desc-' + t, class: 'sr-only' }, def.desc));
  };
  const extrasCost = G.cellExtrasCost(fam, d.items, d.kind), base = E.editingId ? 0 : k.price(d.cw, d.ch);
  const prevExtras = E.editingId ? G.cellExtrasCost(fam, st.floor.objects.find(o => o.id === E.editingId)?.items || [], d.kind) : 0;
  const total = E.editingId ? extrasCost - prevExtras : base + extrasCost;
  card.append(
    h('p', null, E.tool ? `Placing: ${itemDef(E.tool.t).name}. Enter places it, R rotates, Escape stops.` : 'Pick an item to place it. Enter on a placed item picks it up to move; Delete removes it. Stations need their marked work square clear and reachable from the door.'),
    h('h3', null, 'Required (included)'), h('ul', { class: 'cell-list' }, req.map(r => itemRow(r.t, 'req'))),
    h('h3', null, k.suite ? 'More desks and extras' : 'Extras and duplicates'), h('ul', { class: 'cell-list' }, k.extras.map(t => itemRow(t, 'extra'))),
    h('div', { class: 'row' }, btn('Standard layout', () => { const items = k.standard({ ...d, items: k.suite ? d.items : d.items.filter(it => !req.some(r => r.t === it.t)) }); if (!items) { sfx('error'); announce('The standard layout does not fit. Try a bigger room or move hatches.', 'assertive'); return; } d.items = items; sfx('place'); announce('Standard layout placed: station A near the inputs, station B near the output, a rack by station A.', 'polite', false); refreshPanel(); }, { 'data-key': 'cell-std' }),
      btn('Clear all', () => { d.items = []; E.tool = null; refreshPanel(); }, { 'data-key': 'cell-clear' })),
    k.suite ? suiteMetrics(a) : cellMetrics(a, d, 1),
    h('p', null, h('strong', null, E.editingId ? (total >= 0 ? `Changes cost ${money(total)}` : `Refund about ${money(Math.round(-total * 0.6))}`) : `Total ${money(total)}`), E.editingId ? '' : ` (room and required items ${money(base)}${extrasCost ? `, extras ${money(extrasCost)}` : ''})`),
    h('div', { class: 'row' },
      btn('Back to hatches', () => { E.stage = 'hatch'; E.tool = null; refreshPanel(); }, { 'data-key': 'cell-back' }),
      btn(E.editingId ? 'Confirm changes' : 'Confirm and build', () => confirmCell(st), { class: 'primary', 'data-key': 'cell-confirm', 'aria-disabled': a.ok ? null : 'true' }),
      btn('Cancel', () => cancelEditor(), { class: 'danger', 'data-key': 'cell-cancel' })));
  return card;
}
async function confirmCell(st) {
  const E = fv().cell, d = E.draft; const a = K(d).analyse(d);
  if (!a.ok) { sfx('error'); announce(a.problems[0], 'assertive'); return; }
  if (E.editingId) { const r = G.editCell(st, E.editingId, d.items, d.hatches); act(r, false, 'place'); if (r.ok) stop(); return; }
  const r = G.buildCell(st, d);
  if (!r.ok) { act(r); return; }
  sfx('fanfare'); const id = r.obj.id; stop(K(d).suite ? `Office suite #${id} built for ${money(r.price)}. Give each desk an office worker in the panel.` : `${FAMILIES[d.family].name} cell #${id} built for ${money(r.price)}. Assign operators to it in the panel.`); fv().sel = id; rerender({});
}

// metrics block, shared with the inspector of a built cell
// per-desk productivity and comfort for an office suite
export function suiteMetrics(a, names = []) {
  const wrap = h('div', { class: 'stack cell-metrics', role: 'group', 'aria-label': 'Office suite performance' }, h('h3', null, 'Performance'));
  if (!a.ok) { wrap.append(h('ul', { class: 'cell-problems' }, a.problems.slice(0, 5).map(p => h('li', null, p)))); return wrap; }
  const pc = x => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;
  wrap.append(h('p', null, h('strong', null, `${a.seats} desk${a.seats > 1 ? 's' : ''}`), `, average productivity ${pc(a.avg)} against a bare desk.`),
    h('dl', { class: 'metric-rows' }, a.deskBonus.map((b, i) => [h('dt', null, `Desk ${i + 1}${names[i] ? `: ${names[i]}` : ''}`), h('dd', null, h('span', { class: 'num' }, pc(b)), h('span', { class: 'mbar', role: 'meter', 'aria-label': `Desk ${i + 1} productivity`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(Math.max(0, Math.min(1, (b + 0.2) / 0.8)) * 100), 'aria-valuetext': pc(b) }, h('i', { style: { width: Math.max(0, Math.min(1, (b + 0.2) / 0.8)) * 100 + '%' } })))]),
      [h('dt', null, 'Comfort'), h('dd', null, h('span', { class: 'num' }, String(Math.round(a.comfort))), h('span', { class: 'mbar', role: 'meter', 'aria-label': 'Comfort', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(a.comfort), 'aria-valuetext': `${Math.round(a.comfort)}. Raises the morale of everyone in the suite.` }, h('i', { style: { width: a.comfort + '%' } })))]),
    h('p', { class: 'muted' }, 'A computer (+18%), storage cabinet (+6%) and filing cabinet (+4%) count for each desk they touch. ' + (a.crowd > 0 ? 'It is crowded: allow about six squares per desk. ' : '') + (a.noisy > 0 ? `${a.noisy} desk${a.noisy > 1 ? 's' : ''} too many share the room; partition screens cut the noise.` : '')));
  return wrap;
}
export function cellMetrics(a, d, operators, crewText = null) {
  const LIMIT = { A: 'station A capacity: add another station A', B: 'station B capacity: add another station B', staff: 'operator time: add an operator, a robot loader or tool boards', walking: 'walking: move stations, racks and hatches closer together', none: '' };
  const wrap = h('div', { class: 'stack cell-metrics', role: 'group', 'aria-label': 'Cell performance' }, h('h3', null, 'Performance'));
  if (!a.ok) { wrap.append(h('ul', { class: 'cell-problems' }, a.problems.slice(0, 5).map(p => h('li', null, p)))); return wrap; }
  const rate = d.recipe != null ? unitsPerHour(d.recipe) : null;
  wrap.append(frag(
    h('p', null, h('strong', null, `Speed ${(a.speedMult * 100).toFixed(0)}%`), ` of a standard ${FAMILIES[d.family].name.toLowerCase()} machine${crewText ? ` with ${crewText}` : ` with ${operators} operator${operators > 1 ? 's' : ''}`}.`, rate ? ` About ${(rate * a.speedMult).toFixed(1)} units an hour at full speed.` : ''),
    h('p', { class: 'muted' }, `Held back by ${LIMIT[a.limit]}. Walk per part: ${a.D.toFixed(0)} squares. ${a.opsUseful > operators ? `Up to ${a.opsUseful} operators can help in this layout.` : 'More operators would not help this layout.'}`),
    h('dl', { class: 'metric-rows' }, METRICS.map(m => {
      const val = a.metrics[m.key], txt = m.key === 'yield' ? val.toFixed(1) + '%' : String(Math.round(val)), frac = m.key === 'yield' ? (val - 80) / 19.5 : val / 100;
      return [h('dt', null, m.name), h('dd', null, h('span', { class: 'num' }, txt), h('span', { class: 'mbar', role: 'meter', 'aria-label': m.name, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(Math.max(0, Math.min(1, frac)) * 100), 'aria-valuetext': `${txt}. ${m.desc}` }, h('i', { style: { width: Math.max(0, Math.min(1, frac)) * 100 + '%' } })))];
    })),
    a.half.length ? h('p', { class: 'muted' }, `Only working at half strength (not next to what they serve): ${[...new Set(a.half.map(it => itemDef(it.t).name))].join(', ')}.`) : null,
    a.crowd > 0 ? h('p', { class: 'muted' }, 'The cell is crowded, which lowers Safety and slows people down.') : null));
  return wrap;
}
