// Equipment catalog: one tab per production line, ordered by model tier, then equipment and offices. Each line
// shows a labelled preview of its machine (inputs, output, operator's post, service hatch) and its products.
import { h, table, pill, kv, field } from '../dom.js';
import { app, render as rerender } from '../app.js';
import * as G from '../../sim/game.js';
import { ITEMS, RECIPES, FAMILIES } from '../../gen/data.js';
import { jobFor } from '../../core/content.js';
import { OFFICES, KINDS, ZONE_INFO, ports, inputPorts, machineTier, TIER_NAME } from '../../sim/floor.js';
import { unitsPerHour } from '../../sim/world.js';
import { money, money2, num } from '../../core/util.js';
import { startPlacing } from './floor.js';
import { startCell, startSuite } from './cellEditor.js';
import { suitePrice, SUITE_MIN } from '../../sim/suites.js';
import { reducedMotion } from '../app.js';
import { drawObject, itemColor, T } from '../topdown.js';
import { cellPrice, MIN_SIZE } from '../../sim/cells.js';

const vs = () => (app.viewState.catalog ||= { cat: 'f0', product: {} });
// lines from Mk I (components) up to Mk IV, cheapest first within a tier, then equipment and offices
const TABS = [...FAMILIES.slice().sort((a, b) => a.tier - b.tier || a.price - b.price).map(f => ['f' + f.id, f.tab]), ['equip', 'Equipment'], ['office', 'Offices']];

export function render() {
  const st = app.st, v = vs();
  if (!v.product) v.product = {};
  const pick = k => { v.cat = k; rerender({}); document.getElementById('tab-' + k)?.focus(); };
  const tabs = h('div', { class: 'cat-tabs', role: 'tablist', 'aria-label': 'Catalog sections' },
    TABS.map(([k, label]) => h('button', { type: 'button', role: 'tab', id: 'tab-' + k, 'aria-selected': String(v.cat === k), 'aria-controls': 'cat-panel', tabindex: v.cat === k ? 0 : -1, 'data-key': 'tab-' + k,
      onclick: () => pick(k),
      onkeydown: e => {
        const i = TABS.findIndex(c => c[0] === v.cat);
        const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
        if (d) { e.preventDefault(); pick(TABS[(i + d + TABS.length) % TABS.length][0]); }
        else if (e.key === 'Home') { e.preventDefault(); pick(TABS[0][0]); }
        else if (e.key === 'End') { e.preventDefault(); pick(TABS[TABS.length - 1][0]); }
      } }, label)));
  let panel;
  if (v.cat === 'equip') panel = equipment(st);
  else if (v.cat === 'office') panel = offices(st);
  else panel = family(st, +v.cat.slice(1));
  return h('div', { class: 'stack' },
    h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Catalog'), h('p', null, `You have ${money(st.bank.checking)} in checking. Equipment can be returned for a full refund on the day it was bought.`))),
    tabs, h('div', { id: 'cat-panel', role: 'tabpanel', 'aria-labelledby': 'tab-' + v.cat }, panel));
}

function placeBtn(spec, price, label = 'Place') {
  return h('button', { type: 'button', class: 'primary', 'data-key': 'place-' + spec.label, onclick: () => startPlacing(spec) }, `${label} (${money(price)})`);
}

// ---------- machine families
function family(st, fid) {
  const f = FAMILIES[fid], v = vs();
  const recs = RECIPES.filter(r => r.family === fid);
  let rid = v.product[fid];
  if (rid == null || !recs.some(r => r.id === rid)) rid = (recs.find(r => G.recipeAvailable(st, r.id)) || recs[0]).id;
  const r = RECIPES[rid], avail = G.recipeAvailable(st, rid);
  const owned = st.floor.objects.filter(o => o.kind === 'machine' && o.family === fid).length;
  const mk = st.city.market;
  const cost = r.inputs.reduce((s, [i, q]) => s + mk[i].price * q, 0) / r.outQty;
  const sel = h('select', { id: 'cat-product', onchange: e => { v.product[fid] = +e.target.value; rerender({}); document.getElementById('cat-product')?.focus(); } },
    recs.map(x => h('option', { value: x.id, selected: x.id === rid }, ITEMS[x.out].name + (G.recipeAvailable(st, x.id) ? '' : ' (needs research)'))));
  const spec = { kind: 'machine', family: fid, label: f.name + ' machine', ...(avail ? { recipe: rid } : {}) };
  const rows = recs.map(x => ({ r: x, name: ITEMS[x.out].name, rate: unitsPerHour(x.id), price: mk[x.out].price, cost: x.inputs.reduce((s, [i, q]) => s + mk[i].price * q, 0) / x.outQty, ok: G.recipeAvailable(st, x.id) }));
  return h('div', { class: 'stack' },
    h('section', { class: 'card stack', 'aria-labelledby': 'fam-h' },
      h('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' } },
        h('h2', { id: 'fam-h' }, `${f.name} machine `, h('span', { class: 'mk-tag' }, TIER_NAME[machineTier(fid)])),
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, placeBtn(spec, f.price, avail ? `Place, making ${ITEMS[r.out].name}` : 'Place'),
          h('button', { type: 'button', 'data-key': 'build-cell', onclick: () => startCell(fid, avail ? rid : null) }, `Build as a cell (from ${money(cellPrice(fid, MIN_SIZE[0], MIN_SIZE[1]))})`))),
      h('p', { class: 'muted' }, 'A cell is a room you design: you choose its size and where materials come in and goods go out, then lay out its two stations, a parts rack and any extras. A good layout beats the machine; a poor one is slower.'),
      h('div', { class: 'cat-grid' },
        machinePreview(st, fid, r),
        h('div', { class: 'stack', style: { gap: '10px' } },
          field('Show product', sel, 'The preview and figures follow this product. A machine can switch products later by retooling.'),
          avail ? null : h('p', null, pill('Needs research', 'warn', '!'), ` A ${jobFor('researcher').title} has to develop this product on one of these machines first.`),
          kv([
            ['Makes', `${ITEMS[r.out].name}${r.outQty > 1 ? ` (${r.outQty} per cycle)` : ''}`],
            ['Rated output', `${unitsPerHour(r.id).toFixed(1)} units an hour`],
            ['Materials per unit', h('ul', { class: 'port-list' }, r.inputs.map(([i, q], k) => h('li', null, h('span', { class: 'swatch', 'aria-hidden': 'true', style: { background: itemColor(i) } }), `Input ${k + 1}: ${+(q / r.outQty).toFixed(3)} ${ITEMS[i].name} (${money2(mk[i].price)} each)`)))],
            ['Material cost', `${money2(cost)} a unit`],
            ['Sells for', h('span', null, `${money2(mk[r.out].price)} a unit, margin `, h('span', { class: mk[r.out].price > cost ? 'good' : 'bad' }, money2(mk[r.out].price - cost)))],
            ['Size', `${KINDS.machine.w} × ${KINDS.machine.h} squares, plus ${inputPorts({ kind: 'machine', family: fid, x: 0, y: 0 }).length} input squares, an output square, an operator's post and a service hatch, all kept clear`],
            ['Generation', `${TIER_NAME[machineTier(fid)]}: ${TIER_TEXT[machineTier(fid)]}`],
            ['Reliability', `About ${num(f.mtbf)} running hours between breakdowns`],
            ['You own', `${owned}`]])))),
    machineRange(fid),
    h('section', { class: 'card' }, h('h2', null, `All ${f.name.toLowerCase()} products`),
      table(`${f.name} products`, [
        { key: 'name', label: 'Product', render: x => h('button', { type: 'button', class: 'link', onclick: () => { v.product[fid] = x.r.id; rerender({}); document.getElementById('cat-product')?.focus(); } }, x.name), sort: x => x.name },
        { key: 'ok', label: 'Status', render: x => x.ok ? pill('Available', 'ok') : pill(st.city.aiKnown[x.r.id] ? 'Research (known in town)' : 'Needs research', 'warn') },
        { key: 'rate', label: 'Units / hour', num: true, render: x => x.rate.toFixed(1) },
        { key: 'inputs', label: 'Inputs per unit', render: x => x.r.inputs.map(([i, q], k) => `${k + 1}: ${+(q / x.r.outQty).toFixed(3)} ${ITEMS[i].name}`).join('; ') },
        { key: 'cost', label: 'Materials', num: true, render: x => money2(x.cost) },
        { key: 'price', label: 'Sells for', num: true, render: x => money2(x.price) },
        { key: 'margin', label: 'Margin', num: true, render: x => h('span', { class: x.price > x.cost ? 'good' : 'bad' }, money2(x.price - x.cost)), sort: x => x.price - x.cost }],
      rows, { hideCaption: true })));
}

const TIER_TEXT = ['', 'makes components; riveted enamel, a dial gauge', 'makes everyday products; cover panels, a counter and louvres',
  'makes higher-value products; cream casing, a window over the tool and a status screen', 'makes the most advanced products; white casing, glazed tool bay, display and LED strip'];
// The whole range grouped by generation, so the shared chassis and the progression read at a glance
function machineRange(fid) {
  const groups = [1, 2, 3, 4].map(t => FAMILIES.filter(f => machineTier(f.id) === t).sort((a, b) => a.price - b.price));
  return h('section', { class: 'card stack', 'aria-labelledby': 'range-h' },
    h('h2', { id: 'range-h' }, 'The machine range'),
    h('p', { class: 'muted' }, "Every machine shares one chassis: hoppers over the inputs, an output chute, an operator's post, a nameplate in the line's colour and a hazard kick plate. Each generation along the tech tree gets a newer finish and instruments, and each line has its own tool head."),
    h('div', { class: 'range' }, groups.map((g, i) => h('div', { class: 'range-group', role: 'group', 'aria-label': TIER_NAME[i + 1] },
      h('h3', null, TIER_NAME[i + 1]),
      h('ul', null, g.map(f => h('li', null, h('button', { type: 'button', class: 'range-btn', 'aria-current': f.id === fid ? 'true' : null, 'data-key': 'range-' + f.id,
        onclick: () => { vs().cat = 'f' + f.id; rerender({}); document.getElementById('tab-f' + f.id)?.focus(); } },
        h('canvas', { class: 'range-sprite', width: 6 * T * 2, height: (4 * T + 6) * 2, 'aria-hidden': 'true', 'data-range': f.id }),
        h('span', null, f.name), h('small', null, money(f.price))))))))));
}
function drawRangeSprite(cv) {
  const fid = +cv.dataset.range, lw = 6 * T, lh = 4 * T + 6;
  const o = { kind: 'machine', family: fid, recipe: RECIPES.find(r => r.family === fid && r.start).id, x: 0, y: 0, rot: 0, id: -1, status: 'Running', mode: 'produce', noPorts: true };
  const v = { fl: { w: 6, h: 4, objects: [o] }, ox: 6, oy: 14, W: lw, H: lh };
  // draw the machine body only (no port markers): a ghost-free sprite without the floor squares around it
  paint(cv, c => { const cs = getComputedStyle(document.documentElement); c.fillStyle = cs.getPropertyValue('--panel-2').trim() || '#eef1ed'; c.fillRect(0, 0, lw, lh); drawObject(c, v, app.st, { ...o }, { focus: '#1b5fd6' }, 3 * 140, true); }, lw, lh);
}

// A preview of the machine on a patch of floor, with each access square called out beside it: inputs on the
// left and front with their materials, then the output and service hatch on the right.
const PREV = { cols: 7, rows: 5, pad: 4, top: 18 };
function machinePreview(st, fid, r) {
  const o = { kind: 'machine', family: fid, recipe: r.id, x: 1, y: 1, rot: 0, id: -1, status: '', mode: 'produce' };
  const p = ports(o), ins = inputPorts(o);
  const center = ([x, y]) => [PREV.pad + x * T + T / 2, PREV.top + y * T + T / 2];
  const callout = (side, text, at, color, num) => h('li', { 'data-px': at[0], 'data-py': at[1], class: side },
    num != null ? h('span', { class: 'cat-num', 'aria-hidden': 'true' }, String(num)) : null,
    color ? h('span', { class: 'swatch', 'aria-hidden': 'true', style: { background: color } }) : null, text);
  // each callout goes on the side of the machine its square is on: left, below (sorted left to right) or right
  const all = [
    ...ins.map((pt, k) => { const it = r.inputs[k]?.[0]; return { pt, text: it != null ? `Input ${k + 1}: ${ITEMS[it].name}` : `Input ${k + 1}: not used by this product`, color: it != null ? itemColor(it) : null, num: k + 1 }; }),
    { pt: p.output, text: `Output: ${ITEMS[r.out].name}`, color: itemColor(r.out) },
    { pt: p.control, text: "Operator's post" },
    { pt: p.maint, text: 'Service hatch' },
  ].map(c => ({ ...c, side: c.pt[0] < o.x ? 'l' : c.pt[1] >= o.y + 3 ? 'b' : 'r' }));
  const list = (side, label) => h('ul', { class: 'cat-callouts ' + { l: 'left', r: 'right', b: 'below' }[side], 'aria-label': label },
    all.filter(c => c.side === side).sort((a, b) => side === 'b' ? a.pt[0] - b.pt[0] : a.pt[1] - b.pt[1]).map(c => callout(side, c.text, center(c.pt), c.color, c.num)));
  const cv = h('canvas', { class: 'cat-canvas', width: (PREV.cols * T + PREV.pad * 2) * 3, height: (PREV.rows * T + PREV.top + PREV.pad) * 3, 'aria-hidden': 'true', 'data-fam': fid, 'data-recipe': r.id });
  return h('figure', { class: 'cat-preview', 'aria-label': `Preview of the ${FAMILIES[fid].name} machine making ${ITEMS[r.out].name}` },
    list('l', 'Left side'), h('div', { class: 'cat-canvas-wrap' }, cv), list('r', 'Right side'), list('b', 'Front'),
    linesLayer());
}

function linesLayer() { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'cat-lines'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); return svg; }
function floorPatch(c, w, hgt, ox, oy, cols, rows) {
  const cs = getComputedStyle(document.documentElement);
  c.fillStyle = cs.getPropertyValue('--panel').trim() || '#f7f8f5'; c.fillRect(0, 0, w, hgt);
  const fl = cs.getPropertyValue('--floor').trim() || '#d3d8d2', line = cs.getPropertyValue('--floor-line').trim() || '#c1c8c1';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { c.fillStyle = fl; c.fillRect(ox + x * T, oy + y * T, T, T); c.fillStyle = line; c.fillRect(ox + x * T, oy + y * T, T, 1); c.fillRect(ox + x * T, oy + y * T, 1, T); }
}
function paint(cv, draw, lw, lh) {
  const lo = document.createElement('canvas'); lo.width = lw; lo.height = lh;
  draw(lo.getContext('2d'));
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height); c.drawImage(lo, 0, 0, cv.width, cv.height);
}
function drawMachinePreview(cv, t = 0) {
  const fid = +cv.dataset.fam, rid = +cv.dataset.recipe;
  const lw = PREV.cols * T + PREV.pad * 2, lh = PREV.rows * T + PREV.top + PREV.pad;
  const o = { kind: 'machine', family: fid, recipe: rid, x: 1, y: 1, rot: 0, id: -1, status: 'Running', mode: 'produce' };
  const v = { fl: { w: PREV.cols, h: PREV.rows, objects: [o] }, ox: PREV.pad, oy: PREV.top, W: lw, H: lh };
  paint(cv, c => { floorPatch(c, lw, lh, PREV.pad, PREV.top, PREV.cols, PREV.rows); drawObject(c, v, app.st, o, { focus: '#1b5fd6' }, t, t > 0); }, lw, lh);
}
// leader lines from each callout to its square on the preview
function layoutLines(fig) {
  const svg = fig.querySelector('.cat-lines'), cv = fig.querySelector('.cat-canvas'); if (!svg || !cv) return;
  const fr = fig.getBoundingClientRect(), cr = cv.getBoundingClientRect();
  svg.setAttribute('width', fr.width); svg.setAttribute('height', fr.height); svg.setAttribute('viewBox', `0 0 ${fr.width} ${fr.height}`);
  if (getComputedStyle(svg).display === 'none') return;
  const sx = cr.width / (PREV.cols * T + PREV.pad * 2), sy = cr.height / (PREV.rows * T + PREV.top + PREV.pad);
  const NS = 'http://www.w3.org/2000/svg'; svg.replaceChildren();
  for (const li of fig.querySelectorAll('.cat-callouts li')) {
    const lr = li.getBoundingClientRect();
    const tx = cr.left - fr.left + +li.dataset.px * sx, ty = cr.top - fr.top + +li.dataset.py * sy;
    const side = li.classList.contains('l') ? 'l' : li.classList.contains('b') ? 'b' : 'r';
    let pts;
    if (side === 'b') { const ax = lr.left - fr.left + lr.width / 2, ay = lr.top - fr.top - 3, ey = Math.max(ty + 4, cr.bottom - fr.top + 8); pts = `${ax},${ay} ${ax},${ey} ${tx},${ty}`; }
    else {
      const left = side === 'l';
      const ax = left ? lr.right - fr.left + 4 : lr.left - fr.left - 4, ay = lr.top - fr.top + lr.height / 2;
      const ex = left ? Math.max(ax + 8, cr.left - fr.left - 6) : Math.min(ax - 8, cr.right - fr.left + 6);
      pts = `${ax},${ay} ${ex},${ay} ${tx},${ty}`;
    }
    const pl = document.createElementNS(NS, 'polyline');
    pl.setAttribute('points', pts); pl.setAttribute('class', 'cat-line');
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('cx', tx); dot.setAttribute('cy', ty); dot.setAttribute('r', 3.5); dot.setAttribute('class', 'cat-dot');
    svg.append(pl, dot);
  }
}

// ---------- equipment and offices
function spriteCard(id, draw, title, price, desc, spec, extra) {
  return h('article', { class: 'cat-item', 'aria-labelledby': id },
    h('canvas', { class: 'cat-sprite', width: 4 * T * 3, height: (3 * T + 20) * 3, 'aria-hidden': 'true', 'data-sprite': draw }),
    h('div', { class: 'stack', style: { gap: '6px' } },
      h('h3', { id }, title), extra || null, h('p', null, desc),
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, h('strong', null, money(price) + (spec.kind === 'conveyor' ? ' a square' : '')), placeBtn(spec, price))));
}
const SPRITES = {
  conveyor: () => ({ objs: [0, 1, 2, 3].map(i => ({ kind: 'conveyor', x: i, y: 1, id: -1 - i })), dirs: true }),
  bin: () => ({ objs: [{ kind: 'bin', x: 0, y: 0, id: -1 }, { kind: 'conveyor', x: 2, y: 1, id: -2 }, { kind: 'conveyor', x: 3, y: 1, id: -3 }] }),
  handcart: () => ({ objs: [{ kind: 'handcart', x: 1, y: 1, id: -1 }] }),
  forklift: () => ({ objs: [{ kind: 'forklift', x: 1, y: 0, rot: 0, id: -1 }] }),
};
for (let i = 0; i < OFFICES.length; i++) SPRITES['office' + i] = () => ({ objs: [{ kind: 'office', officeType: i, x: 0, y: 0, rot: 0, id: -1 }] });
function drawSprite(cv) {
  const lw = 4 * T, lh = 3 * T + 20, oy = 18;
  const { objs, dirs } = SPRITES[cv.dataset.sprite]();
  const fl = { w: 4, h: 3, objects: objs };
  const v = { fl, ox: 0, oy, W: lw, H: lh };
  if (dirs) { v.beltDir = new Map(objs.map(o => [o.y * fl.w + o.x, [1, 0]])); v.beltLive = new Set(); }
  paint(cv, c => { floorPatch(c, lw, lh, 0, oy, 4, 3); for (const o of objs) drawObject(c, v, app.st, o, { focus: '#1b5fd6' }, 0, false); }, lw, lh);
}

function offices(st) {
  const suite = h('section', { class: 'card stack', 'aria-labelledby': 'suite-h' },
    h('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' } }, h('h2', { id: 'suite-h' }, 'Design an office suite'),
      h('button', { type: 'button', class: 'primary', 'data-key': 'build-suite', onclick: () => startSuite() }, `Design a suite (from ${money(suitePrice(SUITE_MIN[0], SUITE_MIN[1]))})`)),
    h('p', null, 'Size the room, place its door and furnish it yourself. One desk and chair come with the room; every desk seats one office worker, so a larger suite can be open plan. A computer, storage cabinet or filing cabinet touching a desk makes that desk more productive (+25%, +10%, +5%). Plants, a radiator, rug, water cooler and coffee raise comfort and morale. Crowding and too many desks without partition screens cost productivity. A network server and task lamps need research.'));
  return h('div', { class: 'stack' }, suite, offices0(st));
}
function offices0(st) {
  return h('section', { class: 'card stack' }, h('h2', null, 'Ready-made offices'),
    h('p', null, 'Every office worker needs an office: 3 × 3 squares with a door square that must stay clear. Better-equipped offices make the person inside more productive. Carpet under an office improves morale.'),
    h('div', { class: 'cat-items' }, OFFICES.map((o, i) => spriteCard('off-' + i, 'office' + i, o.name, o.price, o.desc, { kind: 'office', officeType: i, label: o.name },
      o.bonus ? pill(`${Math.round(o.bonus * 100)}% more productive`, 'ok') : pill('Standard', 'mute')))));
}

function equipment(st) {
  const items = [
    ['conveyor', 'Conveyor belt', KINDS.conveyor.price, 'Run belts from a machine output to the input square of a machine that uses that product, or between a storage bin and a machine. Nobody has to carry those boxes. Each machine has one input square per material. The machine panel on the factory floor can lay belts for you.', { kind: 'conveyor', label: 'Conveyor belt', repeat: true }],
    ['bin', 'Storage bin', KINDS.bin.price, 'Joins a belt line to the warehouse (2 × 2, must touch a belt). On an input line it feeds that material from storage; on an output line it takes goods to storage. Holds 20 boxes.', { kind: 'bin', label: 'Storage bin' }],
    ['handcart', 'Hand cart', KINDS.handcart.price, 'Lets an operator move a pallet at a time. One cart serves about three machines.', { kind: 'handcart', label: 'Hand cart' }],
    ['forklift', 'Forklift', KINDS.forklift.price, 'Moves two stacked pallets at once, the fastest handling. Must park on forklift parking squares. One serves about four machines.', { kind: 'forklift', label: 'Forklift' }],
  ];
  return h('div', { class: 'stack' },
    h('section', { class: 'card stack' }, h('h2', null, 'Material handling'),
      h('div', { class: 'cat-items' }, items.map(([k, name, price, desc, spec]) => spriteCard('eq-' + k, k, name, price, desc, spec)))),
    h('section', { class: 'card stack' }, h('h2', null, 'Floor zones (free)'),
      h('p', null, 'Paint zones with the Paint zones tool on the factory floor.'),
      h('ul', null, ZONE_INFO.slice(1).map(z => h('li', null, h('strong', null, z.name + ': '), z.desc)))));
}

// ---------- after render: draw canvases and leader lines
let ro = null;
let raf = 0;
export function mounted() {
  cancelAnimationFrame(raf);
  for (const cv of document.querySelectorAll('.cat-canvas')) drawMachinePreview(cv, reducedMotion() ? 0 : 1);
  for (const cv of document.querySelectorAll('.range-sprite')) drawRangeSprite(cv);
  // the preview runs its tool head (not with reduced motion)
  const cv0 = document.querySelector('.cat-canvas');
  if (cv0 && !reducedMotion()) { let last = 0; const loop = now => { if (!cv0.isConnected || app.view !== 'catalog') return; if (now - last > 130) { drawMachinePreview(cv0, now); last = now; } raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
  for (const cv of document.querySelectorAll('.cat-sprite')) drawSprite(cv);
  const fig = document.querySelector('.cat-preview');
  ro?.disconnect(); ro = null;
  if (fig) {
    layoutLines(fig);
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => layoutLines(fig)); ro.observe(fig); }
    document.fonts?.ready?.then(() => fig.isConnected && layoutLines(fig));
  }
}
