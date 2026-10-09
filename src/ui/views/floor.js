import { h, frag, table, kv, announce, describe, confirmBox, pill, meter, field, nameBy } from '../dom.js';
import { app, go, render as rerender, act, reducedMotion, setupProblems, shortcutsOn, navPending, isCompact } from '../app.js';
import * as G from '../../sim/game.js';
import { ITEMS, RECIPES, FAMILIES } from '../../gen/data.js';
import { JOBS, hasRole, canRunMachine, jobFor, deptColor, DEPT_LIST, aOrAn } from '../../core/content.js';
import { KINDS, ZONE, ZONE_INFO, OFFICES, footprint, ports, rotSize, placementProblem, zoneProblem, describeTile, objectAt, objectLabel, links, beltSummary, inputPorts, portItem, portName, isProducer, storageCapacity, priceOf, inBounds, center, countKind, BOXES_PER_STORAGE_TILE } from '../../sim/floor.js';
import { stalledMachines, alsoLacking, alsoText } from '../../sim/stalls.js';
import { unitsPerHour } from '../../sim/world.js';
import { fullName, skill, activityAt, ACT_LABEL, isWhite } from '../../sim/people.js';
import { money, num, pct, minuteOfDay, fmtShortDate, fmtDate } from '../../core/util.js';
import { buyDialog } from './business.js';
import { sfx } from '../sound.js';
import { makeView, screenToTile, drawScene, tileXY, itemColor, T as TILE } from '../topdown.js';
import { confirmCredit, creditToAsk } from '../credit.js';
import { editing, editorPrimary, editorKey, editorPanel, editorDraw, speakCell, cancelEditor, startEditCell, cellMetrics, suiteMetrics } from './cellEditor.js';
import { analyseSuite } from '../../sim/suites.js';
import { workSquare, isStation, itemDef, METRICS } from '../../sim/cells.js';

export const vs = () => (app.viewState.floor ||= { cx: 2, cy: 2, sel: null, mode: 'select', placing: null, zone: ZONE.SAFETY, rot: 0, moving: null });
export const live = true;

let canvas = null, raf = 0, colors = null, colorsAt = 0, dragging = false;

// ---------- zoom and touch (spec 006)
// Zoom is a number from ZOOM_MIN to ZOOM_MAX, applied as the canvas's CSS size, so pinching never redraws. The canvas's own
// resolution (v.pix) stays a whole number, chosen from the zoom, so the pixel art stays crisp.
const TAP_PX = 10, TAP_MS = 500, ZOOM_MIN = 0.25, ZOOM_MAX = 4, ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const touchUI = () => matchMedia('(pointer: coarse)').matches;
const pixFor = z => Math.min(4, Math.max(1, Math.ceil(z - 1e-6)));
const fmtZoom = z => `${+z.toFixed(2)}×`;
const clampZoom = z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const isPaint = v => v.mode === 'zone' || (v.mode === 'place' && !!v.placing?.repeat);
const isGhost = v => (v.mode === 'place' && !v.placing?.repeat) || v.mode === 'move';
function fitZoom() {
  const fr = document.getElementById('floor-app'); if (!fr || !curView) return 1;
  const maxH = parseFloat(getComputedStyle(fr).maxHeight) || innerHeight * 0.7;
  return clampZoom(Math.min(fr.clientWidth / curView.W, maxH / curView.H));
}
function zoomTo(z, ax, ay) {
  const v = vs(), fr = document.getElementById('floor-app'); if (!fr || !canvas || !curView) return;
  z = clampZoom(z); const old = v.zoom || 2, r = fr.getBoundingClientRect();
  if (ax == null) { ax = r.left + fr.clientWidth / 2; ay = r.top + fr.clientHeight / 2; }
  const px = ax - r.left - fr.clientLeft, py = ay - r.top - fr.clientTop;      // the anchor, inside the scrolling frame
  const cx = (fr.scrollLeft + px) / old, cy = (fr.scrollTop + py) / old;       // and what is under it, at zoom 1
  v.zoom = z;
  canvas.style.width = curView.W * z + 'px'; canvas.style.height = curView.H * z + 'px';
  const pix = pixFor(z); if (pix !== v.pix) { v.pix = pix; canvas.width = curView.W * pix; canvas.height = curView.H * pix; }
  fr.scrollLeft = cx * z - px; fr.scrollTop = cy * z - py; v.scrollX = fr.scrollLeft; v.scrollY = fr.scrollTop;
  const num = document.querySelector('.floor-tools .zoom-num'); if (num) num.textContent = fmtZoom(z);
  const zo = document.querySelector('[data-key="ft-zo"]'), zi = document.querySelector('[data-key="ft-zi"]');
  if (zo) zo.disabled = z <= ZOOM_MIN + 1e-6; if (zi) zi.disabled = z >= ZOOM_MAX - 1e-6;
}
const announceZoom = () => announce(`Zoom ${Math.round(vs().zoom * 100)} percent.`, 'polite', false);
function stepZoom(dir) {
  const z = vs().zoom, next = dir > 0 ? ZOOM_STEPS.find(x => x > z + 0.01) : [...ZOOM_STEPS].reverse().find(x => x < z - 0.01);
  if (next) { zoomTo(next); announceZoom(); }
}
function fitView() { zoomTo(fitZoom()); const fr = document.getElementById('floor-app'); if (fr) { fr.scrollLeft = 0; fr.scrollTop = 0; } announceZoom(); }
window.addEventListener('pointerup', () => { dragging = false; });

export function startPlacing(spec) {
  const v = vs(); v.mode = 'place'; v.placing = spec; v.rot = 0; v.sel = null; v.centerGhost = touchUI() && !spec.repeat;
  go('floor');
  setTimeout(() => document.getElementById('floor-app')?.focus(), 50);
  announce(`Placing ${spec.label}. Move with the arrow keys or mouse, R to rotate, Enter to place, Escape to cancel.`, 'polite', false);
}

const onNewSite = (st, v) => !!st.move && v.site === 'new';
let followId = null, lastKeyNav = -1e9;
export function render() {
  const st = app.st, v = vs();
  if (!st.move) v.site = 'old';
  const newSite = onNewSite(st, v), fl = newSite ? st.move.floor : st.floor;
  if (newSite && v.mode !== 'select') { v.mode = 'select'; v.placing = null; v.moving = null; v.cell = null; }
  const view = makeView(fl, 2); curView = view;
  // first time: the old default of 2×; on a phone, the plant fitted to the screen (between 1× and 2×)
  if (!v.zoom) v.zoom = isCompact() ? Math.min(2, Math.max(1, ((document.getElementById('main')?.clientWidth || innerWidth) - 28) / view.W)) : 2;
  v.pix = pixFor(v.zoom);
  canvas = h('canvas', { width: view.W * v.pix, height: view.H * v.pix, 'aria-hidden': 'true', style: { imageRendering: 'pixelated', width: view.W * v.zoom + 'px', height: view.H * v.zoom + 'px' } });
  const helpId = 'floor-help';
  const appEl = h('div', { id: 'floor-app', class: 'floor-frame', role: 'application', tabindex: 0, 'aria-roledescription': 'factory floor', 'aria-label': `Factory floor, ${fl.w} squares wide and ${fl.h} deep. ${modeText(v)}`, 'aria-describedby': helpId }, canvas);
  wireCanvas(appEl, st, v, view);
  const tools = h('div', { class: 'floor-tools', role: 'toolbar', 'aria-label': 'Floor tools' },
    h('button', { type: 'button', 'aria-pressed': String(v.mode === 'select'), 'data-key': 'ft-select', onclick: () => setMode('select') }, 'Select'),
    h('button', { type: 'button', 'aria-pressed': String(v.mode === 'zone'), 'data-key': 'ft-zone', onclick: () => setMode('zone') }, 'Paint zones'),
    h('select', { 'aria-label': 'Zone to paint', 'data-key': 'ft-zonesel', hidden: isCompact() && v.mode !== 'zone', onchange: e => { v.zone = +e.target.value; setMode('zone'); } }, ZONE_INFO.map((z, i) => h('option', { value: i, selected: v.zone === i }, z.name))),
    h('button', { type: 'button', 'aria-pressed': String(v.mode === 'place' && v.placing?.kind === 'conveyor'), 'data-key': 'ft-belt', onclick: () => startPlacing({ kind: 'conveyor', label: 'conveyor belt', repeat: true }) }, `Lay conveyor (${money(KINDS.conveyor.price)})`),
    h('button', { type: 'button', 'data-key': 'ft-catalog', onclick: () => go('catalog') }, 'Catalog…'),
    h('span', { style: { flex: '1' } }),
    h('div', { class: 'zoom-group', role: 'group', 'aria-label': 'Zoom' },
      h('button', { type: 'button', 'aria-label': 'Zoom out', 'data-key': 'ft-zo', disabled: v.zoom <= ZOOM_MIN + 1e-6, onclick: () => stepZoom(-1) }, '−'),
      h('span', { class: 'num zoom-num', 'aria-live': 'off' }, fmtZoom(v.zoom)),
      h('button', { type: 'button', 'aria-label': 'Zoom in', 'data-key': 'ft-zi', disabled: v.zoom >= ZOOM_MAX - 1e-6, onclick: () => stepZoom(1) }, '+'),
      h('button', { type: 'button', 'data-key': 'ft-fit', onclick: fitView }, 'Fit')));
  const keys = ['Arrow keys move the cursor one square (Shift moves five). Enter selects or places. R rotates. M moves the selected item. Delete sells it. Escape cancels. ',
    shortcutsOn() ? 'Space starts or pauses the clock, and [ ], ? and g then a letter work here too.' : 'Space also selects or places.'];
  const help = h('p', { id: helpId, class: 'floor-help' }, touchUI() ? ['Drag to look around and pinch to zoom. Tap a machine to select it. When placing, drag the outline, then press Place here. With a keyboard: ', keys] : keys);
  const fixes = newSite ? [] : setupProblems(st);
  const siteTabs = st.move ? h('div', { class: 'site-tabs', role: 'tablist', 'aria-label': 'Which building' },
    [['old', `Current plant · ${st.city.lots[st.lotId].addr}`], ['new', `New site · ${st.city.lots[st.move.lotId].addr} · ${Math.round(G.moveProgress(st) * 100)}% built`]].map(([k, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String((v.site || 'old') === k), 'data-key': 'site-' + k, onclick: () => { v.site = k; v.sel = null; followId = null; rerender({}); document.getElementById('floor-app')?.focus(); announce(k === 'new' ? 'Showing the new site under construction.' : 'Showing the current plant.', 'polite', false); } }, label))) : null;
  return h('div', { class: 'stack floor-page' },
    h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Factory floor'), h('p', null, `${st.city.lots[st.lotId].addr} · ${num(st.city.lots[st.lotId].sqft)} sq ft · storage ${num(G.boxesStored(st))} of ${num(storageCapacity(fl))} boxes`))),
    h('div', { id: 'needs-wrap', 'data-sig': needsSig(fixes) }, needsAttention(st, fixes)),
    h('div', { class: 'floor-layout' },
      h('div', { class: 'stack', style: { minWidth: 0 } }, siteTabs, newSite ? null : tools, appEl, placeBar(st, v, newSite), help, legend()),
      h('aside', { class: 'stack' + (asSheet(v, newSite) ? ' sheet' : '') + (v.sheetOpen ? ' open' : ''), 'aria-label': editing() ? 'Cell blueprint' : newSite ? 'Construction' : 'Inspector', id: 'inspector' }, newSite ? movePanel(st) : editing() ? editorPanel(st) : inspector(st, v))),
    equipmentTable(st, v));
}
function movePanel(st) {
  const mv = st.move, p = G.moveProgress(st), lot = st.city.lots[mv.lotId], n = mv.order.length;
  const k = Math.max(0, (p - 0.08) / 0.86) * n, i = Math.floor(k);
  const now = i < n ? mv.floor.objects.find(o => o.id === mv.order[i]) : null;
  const phase = p < 0.08 ? 'Clearing the site and marking out the floor' : now ? `Installing: ${objectLabel(st, now)}` : 'Final checks and moving the stock across';
  return h('section', { class: 'card stack', 'aria-labelledby': 'mv-h' }, h('h2', { id: 'mv-h', tabindex: -1 }, `New plant at ${lot.addr}`),
    h('p', { role: 'status' }, h('strong', null, `${Math.round(p * 100)}% built. `), phase + '.'), meter(p, 'Construction progress'),
    kv([['Items installed', `${Math.min(n, i)} of ${n}`], ['Ready', `About ${fmtDate(mv.end)}`], ['Size', `${num(lot.sqft)} sq ft, ${mv.floor.w} × ${mv.floor.h} squares`], ['Rent', `${money(lot.rent)} a month`]]),
    h('p', { class: 'muted' }, 'Blue outlines are still to be installed. Your current plant keeps running until the move is done, then staff, stock and equipment switch over on their own. Press Play to watch it go up.'),
    mv.dropped.length ? h('p', { class: 'muted' }, `${mv.dropped.length} item${mv.dropped.length > 1 ? 's' : ''} won't fit and will be sold when the move completes.`) : null);
}
function modeText(v) {
  if (v.mode === 'place') return `Placing ${v.placing.label}.`;
  if (v.mode === 'zone') return `Painting ${ZONE_INFO[v.zone].name}.`;
  if (v.mode === 'move') return 'Moving equipment.';
  if (v.mode === 'cell') return 'Building a production cell.';
  return 'Select mode.';
}
function setMode(m) {
  const v = vs(); v.mode = m; if (m !== 'place') v.placing = null; if (m !== 'move') v.moving = null;
  announce(modeText(v), 'polite', false); rerender({}); document.getElementById('floor-app')?.focus();
}
// On a touch screen, putting something down is a decision: the ghost follows the finger, and nothing is bought until Place here.
function placeBar(st, v, newSite) {
  if (!touchUI() || newSite || !isGhost(v)) return null;
  const moving = v.mode === 'move', what = moving ? objectLabel(st, st.floor.objects.find(o => o.id === v.moving) || { kind: 'item' }) : v.placing.label;
  return h('div', { class: 'place-bar', role: 'group', 'aria-label': 'Placement' },
    h('span', { class: 'place-what' }, `${moving ? 'Moving' : 'Placing'} ${what}`),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary', 'data-key': 'place-here', onclick: () => primary(st, v) }, moving ? 'Move here' : 'Place here'),
      h('button', { type: 'button', 'data-key': 'place-rotate', onclick: () => { v.rot = (v.rot + 1) % 4; announce(`Rotated to ${v.rot * 90} degrees.`, 'polite', false); speakCursor(st, v); } }, 'Rotate'),
      h('button', { type: 'button', 'data-key': 'place-cancel', onclick: () => cancel(v) }, 'Cancel')));
}
function legend() {
  return h('div', { class: 'legend', 'aria-label': 'Legend' },
    h('span', null, h('i', { style: { background: 'repeating-linear-gradient(-45deg, var(--hazard) 0 3px, var(--hazard-ink) 3px 6px)' } }), 'Safety zone'),
    h('span', null, h('i', { style: { background: '#b08a5a' } }), 'Storage zone'),
    h('span', null, h('i', { style: { background: '#2b6cb0' } }), 'Blue arrow: machine input'), h('span', null, h('i', { style: { background: '#2f8a4f' } }), 'Green arrow: output'),
    h('span', null, h('i', { style: { background: '#5d636a' } }), "Grey pad: operator's post"), h('span', null, h('i', { style: { background: '#c47b16' } }), 'Orange cross: service hatch'),
    h('span', null, 'Bars above a machine show each input\'s stock (full means 16 hours or more). The lamp on its front is green when running, red when broken'),
    h('span', null, 'Workers are coloured by department'));
}

// ---------- canvas input
function wireCanvas(el, st, v, view) {
  let lastTouch = -1e9;
  const toTile = e => { const r = canvas.getBoundingClientRect(); return screenToTile(view, (e.clientX - r.left) / r.width * view.W, (e.clientY - r.top) / r.height * view.H); };
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; const [x, y] = toTile(e); if (x === v.cx && y === v.cy) return; v.cx = x; v.cy = y; if (dragging && (v.mode === 'zone' || (v.mode === 'place' && v.placing?.repeat))) primary(st, v, true); });
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; if (e.button === 2) return; el.focus(); const [x, y] = toTile(e); v.cx = x; v.cy = y; dragging = true; primary(st, v); });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (performance.now() - lastTouch > 1500) cancel(v); }); // a long press is not a right click
  el.addEventListener('scroll', () => { v.scrollX = el.scrollLeft; v.scrollY = el.scrollTop; }, { passive: true });
  // ---- touch: one finger pans (or paints, or moves the ghost, depending on the tool), a tap selects, two fingers pan and zoom
  const pts = new Map(); let pinch = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault(); lastTouch = performance.now();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, l0: el.scrollLeft, t0s: el.scrollTop, t0: performance.now(), moved: false, dead: false });
    if (pts.size === 2) { // a second finger: stop whatever the first began and start a pinch
      const [a, b] = [...pts.values()]; dragging = false; for (const q of pts.values()) q.dead = true;
      pinch = { d0: dist(a, b), z0: v.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return;
    }
    if (pts.size > 2 || pinch) return;
    if (isPaint(v) || isGhost(v)) {
      const [x, y] = toTile(e); v.cx = x; v.cy = y; el.focus({ preventScroll: true });
      if (isPaint(v)) { dragging = true; primary(st, v); } else speakCursor(st, v);
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return;
    const p = pts.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (pinch) {
      const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoomTo(pinch.z0 * dist(a, b) / pinch.d0, mx, my);
      el.scrollLeft -= mx - pinch.mx; el.scrollTop -= my - pinch.my; pinch.mx = mx; pinch.my = my; return;
    }
    if (pts.size !== 1 || p.dead) return;
    if (isPaint(v) || isGhost(v)) {
      const [x, y] = toTile(e); if (x === v.cx && y === v.cy) return; v.cx = x; v.cy = y;
      if (isPaint(v)) { if (dragging) primary(st, v, true); } else speakCursor(st, v);
      return;
    }
    const dx = p.x - p.sx, dy = p.y - p.sy;      // Select and the cell designer: a drag pans, a tap acts
    if (!p.moved && Math.hypot(dx, dy) > TAP_PX) p.moved = true;
    if (p.moved) { el.scrollLeft = p.l0 - dx; el.scrollTop = p.t0s - dy; }
  });
  const touchEnd = e => {
    if (e.pointerType !== 'touch') return;
    const p = pts.get(e.pointerId); if (!p) return; pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) { pinch = null; announceZoom(); } for (const q of pts.values()) q.dead = true; return; }
    if (p.dead || e.type !== 'pointerup' || isPaint(v) || isGhost(v) || p.moved || performance.now() - p.t0 >= TAP_MS) return;
    const [x, y] = toTile(e); v.cx = x; v.cy = y; el.focus({ preventScroll: true }); primary(st, v);   // a tap
  };
  canvas.addEventListener('pointerup', touchEnd); canvas.addEventListener('pointercancel', touchEnd);
  el.addEventListener('keydown', e => {
    if (navPending(e)) return; // the key after g belongs to navigation (app.js), so g m doesn't start a move
    const fl = onNewSite(st, v) ? st.move.floor : st.floor; const step = e.shiftKey ? 5 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (v.mode === 'cell' && editorKey(e, st)) return;
    if (mv) { lastKeyNav = performance.now(); e.preventDefault(); const nx = Math.max(0, Math.min(fl.w - 1, v.cx + mv[0])), ny = Math.max(0, Math.min(fl.h - 1, v.cy + mv[1])); sfx(nx === v.cx && ny === v.cy ? 'bump' : 'tick'); v.cx = nx; v.cy = ny; scrollToCursor(); speakCursor(st, v); return; }
    if (e.key === 'Enter' || (e.key === ' ' && !shortcutsOn())) { e.preventDefault(); primary(st, v); return; } // with shortcuts on, Space runs the clock
    if (e.key === 'Escape') { e.preventDefault(); cancel(v); return; }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); v.rot = (v.rot + 1) % 4; announce(`Rotated to ${v.rot * 90} degrees.`, 'polite', false); speakCursor(st, v); return; }
    if ((e.key === 'm' || e.key === 'M') && v.sel) { e.preventDefault(); beginMove(st, v); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && v.sel) { e.preventDefault(); sellSelected(st, v); return; }
    if (e.key === 'i' || e.key === 'I') { e.preventDefault(); if (v.sel && isCompact() && !v.sheetOpen) { v.sheetOpen = true; updateInspector(); } document.querySelector('#inspector h2')?.focus(); }
  });
}
let curView = null;
function scrollToCursor() {
  const fr = document.getElementById('floor-app'); if (!fr || !curView) return; const v = vs();
  const [lx, ly] = tileXY(curView, v.cx + 0.5, v.cy + 0.5); const x = lx * v.zoom, y = ly * v.zoom, m = TILE * 2 * v.zoom;
  if (x < fr.scrollLeft + m) fr.scrollLeft = x - m * 2; else if (x > fr.scrollLeft + fr.clientWidth - m) fr.scrollLeft = x - fr.clientWidth + m * 2;
  if (y < fr.scrollTop + m) fr.scrollTop = y - m * 2; else if (y > fr.scrollTop + fr.clientHeight - m) fr.scrollTop = y - fr.clientHeight + m * 2;
}
let speakT = 0;
function speakCursor(st, v) {
  clearTimeout(speakT);
  speakT = setTimeout(() => {
    if (v.mode === 'cell' && v.cell) { describe(`Column ${v.cx + 1}, row ${v.cy + 1}. ${speakCell(st)}`); return; }
    if (onNewSite(st, v)) { const o = st.move.floor.objects.find(o => footprint(o).some(([x, y]) => x === v.cx && y === v.cy)); describe(`New site, column ${v.cx + 1}, row ${v.cy + 1}: ${o ? objectLabel(st, o) : 'empty floor'}.`); return; }
    let msg = `Column ${v.cx + 1}, row ${v.cy + 1}: ${describeTile(st, v.cx, v.cy)}.`;
    if (v.mode === 'place' || v.mode === 'move') { const p = ghostProblem(st, v); msg += p ? ` Cannot place: ${p}` : ' Placement OK.'; }
    if (v.mode === 'zone') { const p = zoneProblem(st.floor, v.cx, v.cy, v.zone); if (p) msg += ' ' + p; }
    describe(msg);
    if (!v.sel) updateInspector(); // the Cursor card says what the announcement says, even with the clock stopped
  }, 140);
}
function ghostSpec(v) {
  if (v.mode === 'place') { const { w, h: hh } = rotSize(v.placing.kind, v.rot); return { ...v.placing, x: v.cx - Math.floor((w - 1) / 2), y: v.cy - Math.floor((hh - 1) / 2), rot: v.rot }; }
  if (v.mode === 'move' && v.moving) { const o = app.st.floor.objects.find(o => o.id === v.moving); if (!o) return null; const { w, h: hh } = rotSize(o.kind, v.rot); return { ...o, x: v.cx - Math.floor((w - 1) / 2), y: v.cy - Math.floor((hh - 1) / 2), rot: v.rot }; }
  return null;
}
function ghostProblem(st, v) { const g = ghostSpec(v); if (!g) return null; return placementProblem(st.floor, g, v.mode === 'move' ? v.moving : null); }

function primary(st, v, drag = false) {
  const fl = onNewSite(st, v) ? st.move.floor : st.floor;
  if (!inBounds(fl, v.cx, v.cy)) return;
  if (v.mode === 'cell') { if (!drag) editorPrimary(st); return; }
  if (onNewSite(st, v)) { if (!drag) announce('This is the construction site. You can change the layout once the move is done.', 'polite'); return; }
  if (v.mode === 'zone') {
    const i = v.cy * fl.w + v.cx; if (fl.zones[i] === v.zone) return;
    if (fl.zones[i] === ZONE.STORAGE && v.zone !== ZONE.STORAGE) {
      const after = storageCapacity(fl) - BOXES_PER_STORAGE_TILE;
      if (after < G.boxesStored(st)) { if (!drag) announce("Can't clear that storage zone square: the rest of storage can't hold your stock. Sell or use some stock first.", 'assertive'); return; }
    }
    const p = zoneProblem(fl, v.cx, v.cy, v.zone); if (p) { if (!drag) announce(p, 'assertive'); return; }
    fl.zones[i] = v.zone; fl.rev++; sfx('paint');
    if (!drag) announce(`${ZONE_INFO[v.zone].name} painted.`, 'polite', false);
    app.dirty = true; return;
  }
  if (v.mode === 'place') {
    const g = ghostSpec(v);
    // borrowing needs a yes first; once given, the rest of this placing session (one belt run) doesn't ask again
    if (v.creditFor !== v.placing && !placementProblem(st.floor, g) && creditToAsk(st, priceOf(g))) { askCredit(st, v, g); return; }
    placeGhost(st, v, g, drag);
    return;
  }
  if (v.mode === 'move') {
    const g = ghostSpec(v); const r = G.moveEquipment(st, v.moving, g.x, g.y, g.rot);
    act(r.ok ? { ok: true, msg: 'Moved.' } : r, false, 'place'); if (r.ok) { v.mode = 'select'; v.sel = v.moving; v.moving = null; rerender({}); document.getElementById('floor-app')?.focus(); }
    return;
  }
  const o = objectAt(fl, v.cx, v.cy);
  v.sel = o ? o.id : null;
  if (o) announce(`Selected ${objectLabel(st, o)}. Press I for details, M to move, Delete to sell.`, 'polite', false);
  updateInspector();
}
function placeGhost(st, v, g, drag) {
  const r = G.placeEquipment(st, g);
  if (!r.ok) { if (!drag) act(r); return; }
  sfx(r.obj.kind === 'conveyor' ? 'belt' : 'place'); announce(`${objectLabel(st, r.obj)} placed for ${money(priceOf(r.obj))}.`);
  if (r.linked?.length) { sfx('ok'); announce(r.linked.map(l => l.text).join(' '), 'polite'); }
  if (!v.placing.repeat) { v.mode = 'select'; v.placing = null; v.sel = r.obj.id; rerender({}); document.getElementById('floor-app')?.focus(); }
}
let asking = false;
async function askCredit(st, v, g) {
  if (asking) return;
  asking = true; dragging = false;
  const spec = v.placing;
  try {
    if (!(await confirmCredit(st, priceOf(g)))) return;
    if (v.mode !== 'place' || v.placing !== spec) return;
    v.creditFor = spec;
    placeGhost(st, v, g, false);
  } finally { asking = false; }
}
function cancel(v) {
  if (v.mode === 'cell') { editorKey({ key: 'Escape', preventDefault() {} }, app.st); return; }
  if (v.mode !== 'select') { v.mode = 'select'; v.placing = null; v.moving = null; announce('Cancelled.', 'polite', false); rerender({}); document.getElementById('floor-app')?.focus(); return; }
  if (v.sel) { v.sel = null; updateInspector(); announce('Selection cleared.', 'polite', false); }
}
function beginMove(st, v) {
  const o = st.floor.objects.find(o => o.id === v.sel); if (!o || o.fixed) { announce('That cannot be moved.', 'assertive'); return; }
  v.mode = 'move'; v.moving = o.id; v.rot = o.rot || 0; const [cx, cy] = center(o); v.cx = Math.round(cx); v.cy = Math.round(cy);
  announce(`Moving ${objectLabel(st, o)}. Arrow keys to position, Enter to drop, Escape to cancel.`, 'polite', false);
  rerender({}); document.getElementById('floor-app')?.focus();
}
async function sellSelected(st, v) {
  const o = st.floor.objects.find(o => o.id === v.sel); if (!o || o.fixed) return;
  const fresh = st.time - o.bought < 1440;
  if (!(await confirmBox(fresh ? 'Return this?' : 'Sell this?', fresh ? `${objectLabel(st, o)} was just bought and goes back for a full ${money(o.cost)} refund.` : `${objectLabel(st, o)} is worth about ${money(o.value)}. Anyone assigned to it will need a new assignment.`, fresh ? 'Return it' : 'Sell it', true))) return;
  const r = G.sellEquipment(st, o.id); v.sel = null; act(r, false, 'cash'); document.getElementById('floor-app')?.focus();
}
export function selectObj(o) {
  const v = vs(); v.mode = 'select'; v.sel = o.id; const [cx, cy] = center(o); v.cx = Math.round(cx); v.cy = Math.round(cy);
  if (app.view !== 'floor') go('floor', { focus: false }); else rerender({});
  setTimeout(() => { document.getElementById('floor-app')?.focus(); scrollToCursor(); }, 30);
}

// ---------- inspector
// The list of things that need the owner, in its own container so a light refresh can swap it without a redraw.
function needsAttention(st, fixes) {
  const fl = st.floor;
  return fixes.length ? h('div', { class: 'notice', role: 'region', 'aria-label': 'Setup issues' }, h('strong', null, 'Needs attention: '), h('ul', { style: { margin: '4px 0 0', paddingLeft: '1.2em' } }, fixes.map(f => { const t = h('span', null, f.text); return h('li', null, t, ' ', nameBy(h('button', { class: 'link', type: 'button', onclick: () => { if (f.obj) { const o = fl.objects.find(o => o.id === f.obj); selectObj(o); } else go(f.view); } }, f.obj ? 'Show me' : 'Fix'), t)); }))) : null;
}
const needsSig = fixes => fixes.map(f => f.text + '|' + (f.obj ?? f.view)).join('\n');
function updateNeeds() {
  const wrap = document.getElementById('needs-wrap'), st = app.st; if (!wrap || !st?.floor || st.move) return;
  const fixes = setupProblems(st), sig = needsSig(fixes);
  if (sig === wrap.dataset.sig) return;
  // never take focus from the list: if the player is on one of its buttons, try again on the next refresh
  if (wrap.contains(document.activeElement)) return;
  wrap.dataset.sig = sig; wrap.replaceChildren(...[needsAttention(st, fixes)].filter(Boolean));
}
// On a phone the panel for the selected item is a sheet over the bottom of the screen (spec 008), so it is seen where the
// player tapped; with nothing selected it stays under the floor as the checklist and Cursor card.
const asSheet = (v, newSite) => isCompact() && !!v.sel && !editing() && !newSite;
let sheetFor = null; // the selection the sheet was last opened for: a new selection starts collapsed
function updateInspector() { const el = document.getElementById('inspector'); if (!el) return; const st = app.st, v = vs(); if (v.sel !== sheetFor) { sheetFor = v.sel; v.sheetOpen = false; } if (st.move && v.site === 'new') el.replaceChildren(movePanel(st)); else if (!editing()) el.replaceChildren(frag(inspector(st, v))); el.classList.toggle('sheet', asSheet(v, st.move && v.site === 'new')); el.classList.toggle('open', !!v.sheetOpen); }
// Collapsed, the sheet shows the item's name and status and leaves the plant in view; Details opens the rest.
function sheetActions(v) {
  return h('div', { class: 'sheet-actions' },
    h('button', { type: 'button', class: 'sheet-more', 'data-key': 'sheet-more', 'aria-expanded': String(!!v.sheetOpen), 'aria-controls': 'inspector', onclick: () => { v.sheetOpen = !v.sheetOpen; updateInspector(); announce(v.sheetOpen ? 'Details shown.' : 'Details hidden.', 'polite', false); document.querySelector('[data-key="sheet-more"]')?.focus(); } }, v.sheetOpen ? 'Less' : 'Details'),
    h('button', { type: 'button', class: 'sheet-close', 'data-key': 'sheet-close', 'aria-label': 'Close panel', onclick: () => { v.sel = null; updateInspector(); announce('Selection cleared.', 'polite', false); document.getElementById('floor-app')?.focus(); } }, 'Close'));
}
function inspector(st, v) {
  const o = v.sel ? st.floor.objects.find(o => o.id === v.sel) : null;
  if (!o) return [checklist(st), h('section', { class: 'card' }, h('h2', { tabindex: -1 }, 'Cursor'), h('p', null, `Column ${v.cx + 1}, row ${v.cy + 1}: ${describeTile(st, v.cx, v.cy)}`))];
  const card = h('section', { class: 'card stack', 'aria-labelledby': 'insp-h' }, h('h2', { id: 'insp-h', tabindex: -1 }, objectLabel(st, o)), isCompact() ? sheetActions(v) : null);
  if (o.kind === 'machine') machineInspector(st, o, card);
  else if (o.kind === 'cell') cellInspector(st, o, card);
  else if (o.kind === 'suite') suiteInspector(st, o, card);
  else if (o.kind === 'office') {
    const occ = st.employees.find(e => e.assign === o.id);
    card.append(h('p', null, OFFICES[o.officeType].desc), kv([['Occupant', occ ? `${fullName(occ)}, ${JOBS[occ.job].title}` : 'Empty'], ['Value', money(o.value)]]));
    const cands = st.employees.filter(e => isWhite(e));
    const sel = h('select', { id: 'office-occ' }, h('option', { value: '' }, 'Nobody'), cands.map(e => h('option', { value: e.id, selected: occ?.id === e.id }, `${fullName(e)} (${JOBS[e.job].title})`)));
    card.append(field('Assign office to', sel), h('button', { type: 'button', 'data-key': 'office-assign', onclick: () => { const id = sel.value ? +sel.value : null; if (occ && occ.id !== id) G.assign(st, occ.id, null); if (id) act(G.assign(st, id, o.id)); else { act({ ok: true, msg: 'Office cleared.' }); } } }, 'Assign'));
  } else if (o.fixed) {
    const d = { breakroom: 'Where staff eat lunch and take coffee breaks.', restroom: 'Staff need it a couple of times a day.', dock: 'Deliveries arrive here and shipments leave from here.', exit: 'Smokers without a smoking zone step outside here.' }[o.kind];
    card.append(h('p', null, d));
  } else {
    const d = { conveyor: 'Carries items along a line of belt squares. A line must touch a machine output square at one end and another machine input square, or a storage bin, at the other.', bin: 'Links a belt line to storage. On an input line it feeds the machine from storage; on an output line it takes goods to storage. Either way, nobody carries boxes.', handcart: 'With a pallet jack, operators carry two boxes a trip instead of one. One pallet jack serves about three machines.', forklift: 'The fastest way to move pallets. One serves about four machines.' }[o.kind];
    card.append(h('p', null, d));
    if (o.kind === 'conveyor' || o.kind === 'bin') card.append(beltLineCard(st, o));
    card.append(kv([['Value', money(o.value)], ['Bought', fmtShortDate(o.bought)]]));
  }
  if (!o.fixed) card.append(h('div', { class: 'row' }, o.kind === 'cell' || o.kind === 'suite' ? null : h('button', { type: 'button', 'data-key': 'obj-move', onclick: () => beginMove(st, vs()) }, 'Move'), h('button', { type: 'button', class: 'danger', 'data-key': 'obj-sell', onclick: () => sellSelected(st, vs()) }, st.time - o.bought < 1440 ? 'Return for refund' : `Sell (${money(o.value)})`)));
  return card;
}
function suiteInspector(st, o, card) {
  const a = analyseSuite(o), staff = st.employees.filter(e => e.assign === o.id);
  card.append(h('p', null, h('span', { class: 'muted' }, `${o.cw} × ${o.ch} squares, ${a.seats} desk${a.seats > 1 ? 's' : ''}, ${staff.length} in use`)));
  card.append(suiteMetrics(a, staff.map(e => fullName(e))));
  card.append(h('button', { type: 'button', 'data-key': 'cell-edit', onclick: () => startEditCell(o) }, 'Edit layout and furniture'));
  const free = st.employees.filter(e => isWhite(e) && e.assign !== o.id);
  const sel = h('select', { id: 'suite-add' }, free.map(e => h('option', { value: e.id }, `${fullName(e)} (${JOBS[e.job].title}${e.assign ? ', has an office' : ''})`)));
  card.append(h('div', { class: 'stack', style: { gap: '6px' }, role: 'group', 'aria-labelledby': 'occ-h' }, h('h3', { id: 'occ-h' }, `Occupants (${staff.length} of ${a.seats})`),
    staff.length ? h('ol', { class: 'port-list' }, staff.map((e, i) => { const t = h('span', null, `Desk ${i + 1}: ${fullName(e)}, ${JOBS[e.job].title}`); return h('li', null, t, ' ', nameBy(h('button', { type: 'button', class: 'link', 'data-key': 'suite-out-' + e.id, onclick: () => { G.assign(st, e.id, null); act({ ok: true, msg: `${fullName(e)} moved out of suite #${o.id}.` }); } }, 'Move out'), t)); })) : h('p', { class: 'muted' }, 'Nobody yet.'),
    staff.length < a.seats && free.length ? [field('Give a desk to', sel), h('button', { type: 'button', 'data-key': 'suite-add', onclick: () => { const id = +sel.value; const e = st.employees.find(x => x.id === id); if (e.assign) G.assign(st, id, null); act(G.assign(st, id, o.id)); } }, 'Assign desk')]
      : staff.length >= a.seats ? h('p', { class: 'muted' }, 'Every desk is taken. Add a desk to seat more people.') : h('button', { class: 'link', type: 'button', onclick: () => go('hire') }, 'Hire office staff')));
  card.append(kv([['Value', money(o.value)], ['Built', fmtShortDate(o.bought)]]));
}
function cellInspector(st, o, card) {
  const crew = st.employees.filter(e => e.assign === o.id), present = crew.filter(e => e.act === 'work');
  const statusKind = o.broken ? 'bad' : /Running/.test(o.status) ? 'ok' : 'warn';
  card.append(h('p', null, pill(o.status || 'Idle', statusKind), ' ', h('span', { class: 'muted' }, `${o.cw} × ${o.ch} squares, ${o.items.length} items`)));
  const a = G.cellAnalysis(o, Math.max(1, present.length || crew.length));
  card.append(cellMetrics(a, o, Math.max(1, crew.length), crew.length ? `${crew.length} operator${crew.length > 1 ? 's' : ''}` : 'one operator (none assigned yet)'));
  card.append(h('button', { type: 'button', 'data-key': 'cell-edit', onclick: () => startEditCell(o) }, 'Edit layout and extras'));
  if (o.recipe != null) card.append(supplyGraphic(st, o), machineBelts(st, o));
  card.append(meter(o.effAvg, 'Efficiency'));
  // crew
  const eligible = st.employees.filter(e => canRunMachine(e) && e.assign !== o.id);
  const sel = h('select', { id: 'cell-crew-add' }, eligible.map(e => h('option', { value: e.id }, `${fullName(e)} (${JOBS[e.job].title}${e.assign ? ', busy elsewhere' : ''})`)));
  card.append(h('div', { class: 'stack', style: { gap: '6px' }, role: 'group', 'aria-labelledby': 'crew-h' }, h('h3', { id: 'crew-h' }, `Crew (${crew.length})`),
    crew.length ? h('ul', { class: 'port-list' }, crew.map(e => { const t = h('span', null, `${fullName(e)}, ${JOBS[e.job].title}`); return h('li', null, t, ' ', nameBy(h('button', { type: 'button', class: 'link', 'data-key': 'crew-out-' + e.id, onclick: () => { G.assign(st, e.id, null); act({ ok: true, msg: `${fullName(e)} taken off ${objectLabel(st, o)}.` }); } }, 'Remove'), t)); })) : h('p', { class: 'muted' }, 'Nobody yet. A cell needs at least one operator.'),
    eligible.length ? [field('Add to crew', sel, `This layout can use up to ${a.opsUseful} operator${a.opsUseful > 1 ? 's' : ''}.`), h('button', { type: 'button', 'data-key': 'cell-crew', onclick: () => { const id = +sel.value; const e = st.employees.find(x => x.id === id); if (e.assign) G.assign(st, id, null); act(G.assign(st, id, o.id)); } }, 'Add operator')]
      : h('button', { class: 'link', type: 'button', onclick: () => go('hire') }, `Hire ${aOrAn(jobFor('operator').title)}`)));
  // product
  const fam = RECIPES.filter(x => x.family === o.family);
  const prodSel = h('select', { id: 'mach-prod' }, fam.map(x => h('option', { value: x.id, selected: x.id === o.recipe, disabled: !G.recipeAvailable(st, x.id) }, `${ITEMS[x.out].name}${G.recipeAvailable(st, x.id) ? ` (sells ~${money(st.city.market[x.out].price)})` : ' (needs research on a machine)'}`)));
  card.append(h('div', { class: 'stack', style: { gap: '6px' } }, field('Product', prodSel, `Retooling costs ${money(Math.round(FAMILIES[o.family].price * 0.08))}.`), h('button', { type: 'button', 'data-key': 'mach-retool', onclick: () => act(G.setRecipe(st, o.id, +prodSel.value), false, 'retool') }, 'Retool')));
  card.append(kv([['Made this month', num(o.producedMonth)], ['Made in total', num(o.produced)], ['Maintenance', o.broken ? `Broken, repair ${Math.round(o.repair * 100)}%` : `${Math.round(o.credits)}% serviced`], ['Value', money(o.value)]]));
}
function machineInspector(st, o, card) {
  const r = o.recipe != null ? RECIPES[o.recipe] : null;
  const op = o.operator != null ? st.employees.find(e => e.id === o.operator) : null;
  const statusKind = o.broken ? 'bad' : /Running/.test(o.status) ? 'ok' : /Research/.test(o.status) ? 'info' : 'warn';
  card.append(h('p', null, pill(o.status || 'Idle', statusKind)));
  if (o.mode === 'produce' && r) card.append(supplyGraphic(st, o));
  if (o.mode === 'produce' && r) card.append(kv([
    ['Made this month', num(o.producedMonth)], ['Made in total', num(o.produced)],
    ['Maintenance', o.broken ? `Broken, repair ${Math.round(o.repair * 100)}%` : `${Math.round(o.credits)}% serviced`], ['Value', money(o.value)]]));
  if (o.mode === 'research' && o.research) card.append(kv([['Researching', ITEMS[RECIPES[o.research.target].out].name], ['Progress', `${Math.floor(o.research.hours)} of ${o.research.need} hours`]]), meter(o.research.hours / o.research.need, 'Research progress'));
  card.append(meter(o.effAvg, 'Efficiency'));
  if (o.mode === 'produce' && r) card.append(machineBelts(st, o));
  // operator
  const eligible = st.employees.filter(e => (o.mode === 'research' ? hasRole(e, 'researcher') : canRunMachine(e)));
  const opSel = h('select', { id: 'mach-op' }, h('option', { value: '' }, 'Nobody'), eligible.map(e => h('option', { value: e.id, selected: op?.id === e.id }, `${fullName(e)} (${JOBS[e.job].title}${e.assign && e.assign !== o.id ? ', busy' : ''})`)));
  card.append(h('div', { class: 'stack', style: { gap: '6px' } }, field(o.mode === 'research' ? jobFor('researcher').title : 'Operator', opSel), h('div', { class: 'row' }, h('button', { type: 'button', 'data-key': 'mach-assign', onclick: () => { const id = opSel.value ? +opSel.value : null; if (op && op.id !== id) G.assign(st, op.id, null); if (id) { const e = st.employees.find(x => x.id === id); if (e.assign) G.assign(st, id, null); act(G.assign(st, id, o.id)); } else act({ ok: true, msg: 'Machine has no operator now.' }); } }, 'Assign'),
    !eligible.length ? h('button', { class: 'link', type: 'button', onclick: () => go('hire') }, `Hire ${aOrAn(jobFor(o.mode === 'research' ? 'researcher' : 'operator').title)}`) : null)));
  // product / research
  const fam = RECIPES.filter(x => x.family === o.family);
  const prodSel = h('select', { id: 'mach-prod' }, fam.map(x => h('option', { value: x.id, selected: x.id === o.recipe && o.mode === 'produce', disabled: !G.recipeAvailable(st, x.id) }, `${ITEMS[x.out].name}${G.recipeAvailable(st, x.id) ? ` (sells ~${money(st.city.market[x.out].price)})` : ' (needs research)'}`)));
  card.append(h('div', { class: 'stack', style: { gap: '6px' } }, field('Product', prodSel, `Retooling costs ${money(Math.round(FAMILIES[o.family].price * 0.08))}.`), h('button', { type: 'button', 'data-key': 'mach-retool', onclick: () => act(G.setRecipe(st, o.id, +prodSel.value), false, 'retool') }, 'Retool')));
  const locked = fam.filter(x => !G.recipeAvailable(st, x.id));
  if (locked.length) {
    const rs = h('select', { id: 'mach-res' }, locked.map(x => h('option', { value: x.id }, ITEMS[x.out].name + (st.city.aiKnown[x.id] ? ' (known in town: faster)' : ''))));
    card.append(h('div', { class: 'stack', style: { gap: '6px' } }, field('Research a new product', rs, `Needs ${aOrAn(jobFor('researcher').title)} at this machine, and stops production while it runs.`), h('button', { type: 'button', 'data-key': 'mach-research', onclick: () => act(G.startResearch(st, o.id, +rs.value), false, 'retool') }, 'Start research')));
  }
}
// ---------- belt lines
const nameOf = (st, id) => { const q = st.floor.objects.find(x => x.id === id); return !q ? `item #${id}` : q.kind === 'bin' ? `storage bin #${id}` : objectLabel(st, q); };
function routeLine(st, r) {
  const fl = st.floor, a = fl.objects.find(x => x.id === r.from), b = fl.objects.find(x => x.id === r.to);
  const port = r.k != null ? `input ${r.k + 1} of ` : '';
  let items;
  if (r.kind === 'fromBin') { const it = portItem(b, r.k); items = it != null ? `${ITEMS[it].name} from storage` : 'nothing: this input is unused by the current product'; }
  else if (r.kind === 'bin') items = 'output to storage';
  else { const it = a?.recipe != null ? RECIPES[a.recipe].out : null, want = portItem(b, r.k); items = it != null && it === want ? ITEMS[it].name : `nothing yet: input ${r.k + 1} takes ${want != null ? ITEMS[want].name : 'nothing for this product'}, not ${it != null ? ITEMS[it].name : 'this output'}`; }
  return `${nameOf(st, r.from)} → ${port}${nameOf(st, r.to)}: ${items}, ${r.path.length} squares`;
}
function beltLineCard(st, o) {
  const fl = st.floor, L = links(fl);
  const nets = new Set();
  if (o.kind === 'conveyor') nets.add(L.netOf.get(o.y * fl.w + o.x));
  else for (const [x, y] of footprint(o)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = L.netOf.get((y + dy) * fl.w + x + dx); if (n != null) nets.add(n); }
  const rs = L.routes.filter(r => nets.has(r.net));
  const sections = [...L.netOf.entries()].filter(([, n]) => nets.has(n)).map(([i]) => i);
  const wrap = h('div', { class: 'stack', style: { gap: '6px' } }, h('h3', null, 'This belt line'));
  if (rs.length) wrap.append(h('ul', { style: { margin: 0, paddingLeft: '1.2em' } }, rs.map(r => h('li', null, routeLine(st, r)))));
  else wrap.append(h('p', { class: 'sup-alert', role: 'status' }, o.kind === 'conveyor' ? beltSummary(st, o)[0].toUpperCase() + beltSummary(st, o).slice(1) + '. Easiest fix: select the first machine and use “Connect by belt”.' : 'Not linked to any machine yet.'));
  if (o.kind === 'conveyor' && sections.length > 1) wrap.append(h('button', { type: 'button', class: 'danger', onclick: async () => {
    const belts = sections.map(i => fl.objects.find(q => q.kind === 'conveyor' && q.y * fl.w + q.x === i)).filter(Boolean);
    const val = belts.reduce((a, b) => a + (st.time - b.bought < 1440 ? b.cost : Math.round(b.value)), 0);
    if (!(await confirmBox('Remove this whole belt line?', `${belts.length} conveyor sections, worth about ${money(val)}.`, 'Remove line', true))) return;
    for (const b of belts) G.sellEquipment(st, b.id);
    vs().sel = null; act({ ok: true, msg: `Removed ${belts.length} conveyor sections for ${money(val)}.` }, false, 'cash'); document.getElementById('floor-app')?.focus();
  } }, `Remove whole line (${sections.length} sections)`));
  return wrap;
}
const swatch = it => h('span', { class: 'swatch', 'aria-hidden': 'true', style: { background: itemColor(it) } });
// How each input square and the output are supplied, plus controls to lay belts
function machineBelts(st, o) {
  const fl = st.floor, L = links(fl), r = RECIPES[o.recipe], pf = L.portFeed[o.id] || [];
  const byId = id => fl.objects.find(x => x.id === id);
  const wrap = h('div', { class: 'stack', style: { gap: '6px' }, role: 'group', 'aria-labelledby': 'belt-h-' + o.id }, h('h3', { id: 'belt-h-' + o.id }, 'Inputs, output and belts'));
  const rows = inputPorts(o).map(([x, y], k) => {
    const it = portItem(o, k), f = pf[k];
    if (it == null) return h('li', null, h('strong', null, `Input ${k + 1}: `), 'not used by this product.');
    const good = (f?.sources || []).filter(id => byId(id)?.recipe != null && RECIPES[byId(id).recipe].out === it);
    const wrong = (f?.sources || []).filter(id => !good.includes(id));
    let how;
    if (good.length) how = pill(`Belt from ${good.map(id => nameOf(st, id)).join(', ')}`, 'ok', '⇢');
    else if (f?.bin) how = pill('Belt from storage', 'ok', '⇢');
    else how = pill(fl.zones[y * fl.w + x] === ZONE.SAFETY ? 'By hand, safety zone' : 'By hand, no safety zone', fl.zones[y * fl.w + x] === ZONE.SAFETY ? 'mute' : 'warn', fl.zones[y * fl.w + x] === ZONE.SAFETY ? '' : '!');
    const note = wrong.length ? h('div', { class: 'muted' }, `The belt from ${wrong.map(id => nameOf(st, id)).join(', ')} brings ${wrong.map(id => byId(id).recipe != null ? ITEMS[RECIPES[byId(id).recipe].out].name : 'nothing').join(', ')}, which this input doesn't take.`) : null;
    return h('li', null, swatch(it), h('strong', null, `Input ${k + 1}: ${ITEMS[it].name}`), ` (${r.inputs[k][1]} per ${r.outQty > 1 ? r.outQty + ' units' : 'unit'}) `, how, note);
  });
  const outTo = L.routes.filter(x => x.from === o.id && x.kind === 'machine' && portItem(byId(x.to), x.k) === r.out);
  const outRow = h('li', null, swatch(r.out), h('strong', null, `Output: ${ITEMS[r.out].name} `),
    outTo.length ? pill(`Belt to ${outTo.map(x => `input ${x.k + 1} of ${nameOf(st, x.to)}`).join(', ')}`, 'ok', '⇢') : L.outBin[o.id] ? pill('Belt to storage', 'ok', '⇢') : pill('By hand to storage', 'mute'));
  wrap.append(h('ul', { class: 'port-list' }, rows, outRow));
  // what is physically on the belts leaving this machine, and whether they are backed up
  for (const ln of Object.values(st.lanes || {}).filter(l => l.from === o.id && l.kind !== 'fromBin')) {
    const n = ln.boxes.length, stuck = ln.boxes.filter(b => !b.moving).length, cap = Math.floor(ln.len / G.BOX_GAP) + 1;
    const dest = ln.kind === 'end' ? 'a belt that goes nowhere' : ln.kind === 'bin' ? `storage bin #${ln.to}` : `input ${ln.k + 1} of ${nameOf(st, ln.to)}`;
    wrap.append(h('p', { class: stuck >= cap - 1 ? 'sup-alert' : 'muted', role: stuck >= cap - 1 ? 'status' : null },
      `Belt to ${dest}: ${n} box${n === 1 ? '' : 'es'} on it${stuck ? `, ${stuck} standing still` : ''}.`, stuck >= cap - 1 ? ' It is jammed: nothing at the far end is taking the boxes, so this machine will stop when its tray fills.' : ''));
  }
  if (o.trip) wrap.append(h('p', { class: 'muted' }, `Operator is ${o.trip.left > o.trip.dur / 2 ? 'walking to storage' : 'walking back'}${o.trip.out ? ` with ${o.trip.out.boxes} box${o.trip.out.boxes > 1 ? 'es' : ''} of ${ITEMS[o.trip.out.item].name}` : ''}${o.trip.in.length ? `, bringing ${o.trip.in.map(x => `${x.boxes} box${x.boxes > 1 ? 'es' : ''} of ${ITEMS[x.item].name}`).join(' and ')}` : ''}.`));
  if (o.tray > 0) wrap.append(h('p', { class: 'muted' }, `On the output tray: ${num(Math.floor(o.tray))} ${ITEMS[r.out].name} (a tray holds ${2 * ITEMS[r.out].pack}).`));
  const unsafe = G.unsafeInputs(fl, o, L);
  if (unsafe.length) wrap.append(h('button', { type: 'button', 'data-key': 'safety-inputs', onclick: () => {
    let n = 0; for (const u of unsafe) { { const i = u.y * fl.w + u.x; if (!fl.zones[i] && !zoneProblem(fl, u.x, u.y, ZONE.SAFETY)) { fl.zones[i] = ZONE.SAFETY; n++; } } }
    fl.rev++; sfx('paint'); act({ ok: n > 0, msg: n ? `Painted safety zones on ${n} input${n > 1 ? 's' : ''}.` : 'Those squares have other zones painted on them. Clear them first.' }, false, 'paint');
  } }, `Paint safety zones on hand-fed inputs (${unsafe.map(u => u.k + 1).join(', ')})`));
  const anyHand = rows.length && inputPorts(o).some((_, k) => portItem(o, k) != null && !(pf[k] && (pf[k].bin || (pf[k].sources || []).length)));
  if (anyHand || !outTo.length) wrap.append(h('p', { class: 'muted' }, 'Every box carried by hand slows the machine. Belt an input from a machine that makes it or from a storage bin, and belt the output to the next machine or to a bin.'));
  // feed an input
  const feedOpts = [];
  inputPorts(o).forEach((_, k) => {
    const it = portItem(o, k); if (it == null) return;
    const srcs = fl.objects.filter(q => q.id !== o.id && ((isProducer(q) && q.recipe != null && RECIPES[q.recipe].out === it) || q.kind === 'bin'));
    const already = new Set([...(pf[k]?.sources || []), ...(pf[k]?.bin ? fl.objects.filter(q => q.kind === 'bin').map(q => q.id) : [])]);
    const list = srcs.filter(q => !already.has(q.id));
    if (list.length) feedOpts.push(h('optgroup', { label: `Input ${k + 1}: ${ITEMS[it].name}` }, list.map(q => h('option', { value: `${q.id}:${k}` }, q.kind === 'bin' ? `from storage bin #${q.id}` : `from ${objectLabel(st, q)}`))));
  });
  if (feedOpts.length) {
    const sel = h('select', { id: 'belt-feed' }, feedOpts);
    wrap.append(field('Feed an input by belt', sel, `Lays the shortest belt into that input square, at ${money(priceOf({ kind: 'conveyor' }))} a section.`),
      h('button', { type: 'button', 'data-key': 'belt-feed', onclick: () => { const [from, k] = sel.value.split(':').map(Number); layBelt(st, from, o.id, k); } }, 'Connect input by belt'));
  }
  // send the output
  const uses = q => isProducer(q) && q.recipe != null && RECIPES[q.recipe].inputs.some(([i]) => i === r.out);
  const linked = new Set([...outTo.map(x => x.to), ...(L.outBin[o.id] ? L.routes.filter(x => x.from === o.id && x.kind === 'bin').map(x => x.to) : [])]);
  const cands = fl.objects.filter(q => q.id !== o.id && !linked.has(q.id) && (uses(q) || q.kind === 'bin')).sort((a, b) => (a.kind === 'bin') - (b.kind === 'bin') || a.id - b.id);
  if (cands.length) {
    const sel = h('select', { id: 'belt-to' }, cands.map(q => h('option', { value: q.id }, q.kind === 'bin' ? `Storage bin #${q.id} (output to storage)` : `${objectLabel(st, q)}, input ${G.inputFor(o, q) + 1} (uses ${ITEMS[r.out].name})`)));
    wrap.append(field(`Send ${ITEMS[r.out].name} by belt to`, sel, 'Goes into the input square that takes this product. Only machines that use it are listed.'),
      h('button', { type: 'button', 'data-key': 'belt-connect', onclick: () => layBelt(st, o.id, +sel.value, null) }, 'Connect output by belt'));
  } else if (!outTo.length && !L.outBin[o.id]) wrap.append(h('p', { class: 'muted' }, `No machine on the floor uses ${ITEMS[r.out].name}. Place one, or a storage bin, to belt the output.`));
  return wrap;
}
async function layBelt(st, from, to, k) {
  const dry = G.connectByBelt(st, from, to, true, k);
  if (!dry.ok) { act(dry); return; }
  const port = dry.k != null ? `input ${dry.k + 1} of ` : '';
  const text = `${dry.tiles} conveyor sections from ${nameOf(st, from)} to ${port}${nameOf(st, to)}, for ${money(dry.price)}.`;
  if (dry.tiles) {
    if (creditToAsk(st, dry.price)) { if (!(await confirmCredit(st, dry.price, { title: 'Lay this belt?', lead: text + ' ', yes: n => `Lay belt and borrow ${money(n)}` }))) return; }
    else if (!(await confirmBox('Lay this belt?', text, `Lay belt (${money(dry.price)})`))) return;
  }
  const res = G.connectByBelt(st, from, to, false, k);
  if (res.ok) { sfx('belt'); act({ ok: true, msg: res.linked?.length ? res.linked.map(l => l.text).join(' ') : (res.msg || `Laid ${res.tiles} sections.`) }, false, 'ok'); }
  else act(res);
  document.getElementById('floor-app')?.focus();
}

// ---------- boxes on belts, at machines and in people's hands, all drawn from the simulation's own state
const belt = { st: null, tag: '', dirs: new Map(), live: new Set(), lastPiles: [], drawMs: [] };
export function beltDebug() { return belt; }
function beltFrame(st, now, anim) {
  G.refreshLanes(st); // belts laid while the clock is stopped get their lanes straight away
  const fl = st.floor, lanes = Object.values(st.lanes || {});
  const tag = `${st.lanesTag}|${fl.rev}`;
  if (belt.st !== st || belt.tag !== tag) {
    belt.st = st; belt.tag = tag; belt.dirs = new Map();
    for (const ln of lanes) {
      const p = ln.path;
      for (let k = 0; k < p.length; k++) {
        const [x, y] = p[k]; if (x < 0 || y < 0) continue; const i = y * fl.w + x;
        const nx = p[Math.min(k + 1, p.length - 1)], px = p[Math.max(0, k - 1)];
        const d = k < p.length - 1 ? [Math.sign(nx[0] - x), Math.sign(nx[1] - y)] : [Math.sign(x - px[0]), Math.sign(y - px[1])];
        if ((d[0] || d[1]) && fl.objects.some(q => q.kind === 'conveyor' && q.x === x && q.y === y) && !belt.dirs.has(i)) belt.dirs.set(i, d);
      }
    }
  }
  // between simulation steps, slide moving boxes on by the minutes not yet simulated so motion stays smooth
  const ahead = anim ? G.BELT_SPEED * Math.min(1, app.acc || 0) : 0;
  belt.live = new Set();
  const boxes = [];
  for (const ln of lanes) {
    if (ln.boxes.some(b => b.moving)) for (const [x, y] of ln.path) belt.live.add(y * fl.w + x);
    const at = s => { const k = Math.min(ln.path.length - 1, Math.floor(s)), f = s - k, a = ln.path[k], b = ln.path[Math.min(k + 1, ln.path.length - 1)]; return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f }; };
    for (const b of ln.boxes) { const s = b.moving ? Math.min(ln.len, b.s + ahead) : b.s; boxes.push({ ...at(s), color: itemColor(b.item) }); }
  }
  return boxes;
}
// finished boxes waiting on a machine's output tray, and materials stacked at its hand-fed inputs
function machineStacks(st) {
  const fl = st.floor, L = links(fl), out = [];
  for (const o of fl.objects) {
    if (!isProducer(o) || o.recipe == null) continue;
    const r = RECIPES[o.recipe], p = ports(o), front = o.y + (o.kind === 'cell' ? o.ch : rotSize(o.kind, o.rot || 0).h) + 0.01;
    if (p.output && o.tray > 0 && !L.netOf.has(p.output[1] * fl.w + p.output[0])) {
      const n = Math.min(3, Math.ceil(o.tray / ITEMS[r.out].pack - 1e-9));
      out.push({ x: p.output[0], y: p.output[1], n, d: Math.max(p.output[1] + 0.55, front), color: itemColor(r.out) });
    }
    r.inputs.forEach(([it], k) => {
      const sq = p['in' + k]; if (!sq || L.netOf.has(sq[1] * fl.w + sq[0])) return;
      const u = o.inBuf?.[it] || 0; if (u <= 0) return;
      out.push({ x: sq[0], y: sq[1], n: Math.min(2, Math.ceil(u / ITEMS[it].pack - 1e-9)), d: Math.max(sq[1] + 0.55, front), color: itemColor(it) });
    });
  }
  return out;
}
// where a carrier is on a trip to storage and back, and what they are holding
function tripPose(st, o, t) {
  const f = Math.min(1, Math.max(0, 1 - (t.left - (app.speed ? Math.min(1, app.acc || 0) : 0)) / t.dur));
  const [ax, ay] = t.from, [bx, by] = t.spot;
  const go = f < 0.5, g = go ? f * 2 : (f - 0.5) * 2;
  const [sx, sy, ex, ey] = go ? [ax, ay, bx, by] : [bx, by, ax, ay];
  // walk along x first, then y
  const lx = Math.abs(ex - sx), ly = Math.abs(ey - sy), dist = (lx + ly) * g;
  const px = dist <= lx ? sx + Math.sign(ex - sx) * dist : ex, py = dist <= lx ? sy : sy + Math.sign(ey - sy) * (dist - lx);
  const load = go ? (t.out ? [{ n: t.out.boxes, color: itemColor(t.out.item) }] : []) : t.in.map(x => ({ n: x.boxes, color: itemColor(x.item) }));
  return { px, py, carry: load.flatMap(l => Array.from({ length: l.n }, () => l.color)), equip: t.equip };
}

// ---------- stock levels for one machine
const COVER_SCALE = 16; // hours shown on the bar: two full shifts
// One status pill says what the machine is doing; this line adds a different problem or a warning, never a second "Stopped".
function supplyNote(st, o, S) {
  const l = S.limiting; if (!l || l.status === 'ok') return null;
  if (l.status === 'bad') { const also = alsoLacking(st, o); return also.length ? h('p', { class: 'sup-alert', role: 'status' }, `Also: ${alsoText(also)}.`) : null; }
  return h('p', { class: 'sup-alert', role: 'status' }, `${l.name} runs out first, in about ${hrs(l.hours)} at full speed.`);
}
export function machineSupply(st, o) {
  const r = RECIPES[o.recipe], fl = st.floor, L = links(fl);
  const rate = unitsPerHour(o.recipe);
  const fedBy = (L.fedBy[o.id] || []).map(id => fl.objects.find(x => x.id === id)).filter(Boolean);
  const inputs = r.inputs.map(([id, q]) => {
    const perUnit = q / r.outQty;
    const buf = o.inBuf?.[id] || 0, stock = st.inventory[id] || 0, have = buf + stock;
    const users = fl.objects.filter(m => isProducer(m) && m.mode === 'produce' && m.recipe != null && RECIPES[m.recipe].inputs.some(([i]) => i === id));
    const plantPerHour = users.reduce((a, m) => a + unitsPerHour(m.recipe) * RECIPES[m.recipe].inputs.find(([i]) => i === id)[1] / RECIPES[m.recipe].outQty, 0) || rate * perUnit;
    const k = r.inputs.findIndex(([i]) => i === id), pfk = (L.portFeed[o.id] || [])[k];
    const belt = (pfk?.sources || []).map(s => fl.objects.find(x => x.id === s)).find(m => m && m.recipe != null && RECIPES[m.recipe].out === id);
    const binFed = !!pfk?.bin;
    const hours = have / plantPerHour;
    const orders = st.orders.filter(x => x.item === id).sort((a, b) => a.eta - b.eta);
    const status = have < perUnit ? 'bad' : hours < 4 && !belt ? 'warn' : 'ok';
    return { id, k, binFed, name: ITEMS[id].name, perUnit, buf, stock, have, boxes: G.boxesOf(st, id), hours, status, shared: users.length - 1, belt, onOrder: orders.reduce((a, x) => a + x.boxes, 0), nextEta: orders[0]?.eta };
  });
  const limiting = inputs.filter(i => !i.belt).sort((a, b) => a.hours - b.hours)[0] || null;
  const beltTo = (L.feeds[o.id] || []).map(id => fl.objects.find(x => x.id === id)).filter(t => t && t.recipe != null && RECIPES[t.recipe].inputs.some(([i]) => i === r.out));
  return { rate, inputs, limiting, out: { id: r.out, name: ITEMS[r.out].name, units: st.inventory[r.out] || 0, boxes: G.boxesOf(st, r.out), selling: G.isSelling(st, r.out), beltTo, toBin: !!L.outBin[o.id] } };
}
const STATUS_TEXT = { ok: 'Stocked', warn: 'Running low', bad: 'Empty' };
const STATUS_ICON = { ok: '✓', warn: '!', bad: '✕' };
function supplyGraphic(st, o) {
  const S = machineSupply(st, o);
  const hrs = x => x >= 100 ? '100+ h' : x >= 10 ? `${Math.round(x)} h` : `${x.toFixed(1)} h`;
  const rows = S.inputs.map(i => h('li', { class: 'sup-row ' + i.status },
    h('div', { class: 'sup-head' }, h('span', null, swatch(i.id), `Input ${i.k + 1}: ${i.name}`, h('span', { class: 'muted', style: { fontWeight: 400 } }, ` · ${i.perUnit} per unit`)), pill(STATUS_TEXT[i.status], i.status === 'ok' ? 'ok' : i.status === 'warn' ? 'warn' : 'bad', STATUS_ICON[i.status])),
    h('div', { class: 'sup-bar', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': COVER_SCALE, 'aria-valuenow': Math.min(COVER_SCALE, +i.hours.toFixed(1)), 'aria-valuetext': `${hrs(i.hours)} of full-speed production`, 'aria-label': `${i.name} supply` },
      h('i', { style: { width: Math.min(100, i.hours / COVER_SCALE * 100) + '%' } }), h('b', { style: { left: (4 / COVER_SCALE * 100) + '%' }, title: 'Low below 4 hours' }), h('b', { style: { left: '50%' }, title: 'One shift' })),
    h('div', { class: 'sup-scale', 'aria-hidden': 'true' }, h('span', null, '0'), h('span', null, '4 h low'), h('span', null, '8 h · 1 shift'), h('span', null, '16 h')),
    h('div', { class: 'sup-meta' }, h('strong', null, num(Math.floor(i.have))), ` units (${num(i.boxes)} boxes) · lasts `, h('strong', null, hrs(i.hours)),
      i.shared > 0 ? ` shared with ${i.shared} other machine${i.shared > 1 ? 's' : ''}` : '',
      i.buf > 0 ? ` · ${num(Math.floor(i.buf))} waiting on the belt` : ''),
    i.belt ? h('div', { class: 'sup-meta' }, `Fed by conveyor from ${objectLabel(st, i.belt)} into input ${i.k + 1}.`) : i.binFed ? h('div', { class: 'sup-meta' }, `Fed by conveyor from storage into input ${i.k + 1}, no hand carrying.`) : null,
    i.onOrder ? h('div', { class: 'sup-meta' }, `+ ${num(i.onOrder)} boxes on order, first arriving ${fmtDate(i.nextEta)}.`) : (!i.belt && i.status !== 'ok' ? h('div', { class: 'sup-meta' }, 'Nothing on order. ', h('button', { class: 'link', type: 'button', onclick: () => buyDialog(i.id) }, `Buy ${i.name}`)) : null)));
  const eff = o.effAvg;
  return h('div', { class: 'supply', role: 'group', 'aria-label': 'Stock levels for this machine' },
    supplyNote(st, o, S),
    h('h3', null, 'Inputs'), h('ul', null, rows),
    h('span', { class: 'sup-arrow', 'aria-hidden': 'true' }, '▼'),
    h('div', { class: 'sup-machine' }, h('span', { class: 'code' }, FAMILIES[o.family].code), h('span', null, `${objectLabel(st, o)} makes ${S.out.name}`), h('small', null, `Rated ${S.rate.toFixed(1)} units an hour · recent efficiency ${pct(eff)} · about ${(S.rate * eff).toFixed(1)} an hour now`)),
    h('span', { class: 'sup-arrow', 'aria-hidden': 'true' }, '▼'),
    h('h3', null, 'Output'),
    h('div', { class: 'sup-row' }, h('div', { class: 'sup-head' }, h('span', null, S.out.name), S.out.beltTo.length ? pill('Conveyor', 'info', '⇢') : S.out.toBin ? pill('Conveyor to storage', 'info', '⇢') : S.out.selling ? pill('Selling', 'ok', '$') : pill('Kept for our machines', 'mute')),
      h('div', { class: 'sup-meta' }, h('strong', null, num(Math.floor(S.out.units))), ` units in storage (${num(S.out.boxes)} boxes). Storage space left: ${num(Math.max(0, G.freeBoxes(st)))} boxes.`),
      S.out.beltTo.length ? h('div', { class: 'sup-meta' }, `Sent by conveyor to ${S.out.beltTo.map(t => objectLabel(st, t)).join(', ')}.`) : null));
}

function checklist(st) {
  const fl = st.floor, m = fl.objects.filter(o => isProducer(o));
  const L = links(fl);
  const safe = m.length && m.every(o => !G.unsafeInputs(fl, o, L).length);
  const steps = [
    [m.length > 0, 'Place a production machine', 'catalog'],
    [safe, 'Paint a safety zone (or lay a belt) on each machine input', 'floor'],
    [st.employees.some(e => hasRole(e, 'operator')), `Hire ${aOrAn(jobFor('operator').title)}`, 'hire'],
    [m.length && m.every(o => o.operator != null), 'Give every machine an operator', 'staff'],
    // ticked once something is in stock or on order, and unticked while a machine is out of materials with nothing coming
    [(Object.keys(st.inventory).length > 0 || st.orders.length > 0) && !stalledMachines(st).some(s => s.kind === 'starved'), 'Order materials', 'purchasing'],
    [st.ledger.produced > 0 || st.history.length > 0, 'Start the clock (Play or space bar)', null],
    [st.employees.some(e => hasRole(e, 'sales')), `Hire ${aOrAn(jobFor('sales').title)} and give them a desk`, 'hire'],
    [!!st.flags.firstDollar, 'Make your first sale', 'sales'],
  ];
  const done = steps.filter(s => s[0]).length;
  return h('section', { class: 'card stack', 'aria-labelledby': 'cl-h' }, h('h2', { id: 'cl-h', tabindex: -1 }, 'Getting started'), h('p', { class: 'muted' }, `${done} of ${steps.length} done`),
    h('ol', { style: { margin: 0, paddingLeft: '1.3em', display: 'grid', gap: '4px' } }, steps.map(([ok, text, view]) => { const t = h('span', { class: ok ? 'good' : '' }, ok ? '✓ ' : '', text); return h('li', null, t, ok ? h('span', { class: 'sr-only' }, ' (done)') : view ? [' ', nameBy(h('button', { class: 'link', type: 'button', onclick: () => go(view) }, 'Go'), t)] : null); })));
}

function equipmentTable(st, v) {
  const rows = st.floor.objects.filter(o => !o.fixed && o.kind !== 'conveyor').map(o => ({ o, name: objectLabel(st, o), loc: `${o.x + 1}, ${o.y + 1}`, status: isProducer(o) ? (o.status || 'Idle') : o.kind === 'suite' ? `${st.employees.filter(e => e.assign === o.id).length} of ${analyseSuite(o).seats} desks in use` : o.kind === 'office' ? (st.employees.find(e => e.assign === o.id) ? fullName(st.employees.find(e => e.assign === o.id)) : 'Empty') : '—', value: o.value }));
  const belts = countKind(st.floor, 'conveyor');
  return h('section', { class: 'card' }, h('h2', null, 'Equipment'), belts ? h('p', { class: 'muted' }, `Plus ${num(belts)} conveyor belt sections.`) : null,
    table('Equipment on the floor', [
      { key: 'name', label: 'Item' }, { key: 'loc', label: 'Column, row' }, { key: 'status', label: 'Status / occupant' },
      { key: 'value', label: 'Value', num: true, render: r => money(r.value) },
      { key: 'sel', label: '', sortable: false, render: r => h('button', { type: 'button', 'data-key': 'eq-' + r.o.id, onclick: () => selectObj(r.o) }, 'Select') }],
    rows, { hideCaption: true, empty: 'Nothing bought yet. Open the Catalog to buy machines and offices.' }));
}

// ---------- drawing
export function mounted() {
  const fr = document.getElementById('floor-app'), v = vs();
  if (fr) {
    if (v.scrollX != null) { fr.scrollLeft = v.scrollX; fr.scrollTop = v.scrollY; }
    if (v.centerGhost && curView) {   // on a touch screen a new item starts in the middle of what is on screen
      v.centerGhost = false;
      const vx = (fr.scrollLeft + fr.clientWidth / 2) / v.zoom, vy = (fr.scrollTop + fr.clientHeight / 2) / v.zoom, fl = app.st.floor;
      const [tx, ty] = screenToTile(curView, vx, vy); v.cx = Math.max(0, Math.min(fl.w - 1, tx)); v.cy = Math.max(0, Math.min(fl.h - 1, ty));
    }
  }
  cancelAnimationFrame(raf); const loop = () => { if (app.view !== 'floor' || !canvas?.isConnected) return; draw(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
export function patch() {
  // light refresh: inspector + checklist only; canvas animates itself
  updateNeeds();
  const ae = document.activeElement; if (ae && document.getElementById('inspector')?.contains(ae)) return;
  updateInspector();
}
function readColors() {
  const cs = getComputedStyle(document.documentElement); const g = n => cs.getPropertyValue(n).trim();
  const bg = g('--bg'); const n = parseInt(bg.slice(1), 16); const lum = ((n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11);
  colors = { floor: g('--floor'), panel: g('--panel'), focus: g('--focus'), dark: lum < 110 };
  colorsAt = performance.now();
}
let lo = null;
// draw times of the last 120 frames, read by the performance test through the test hook
function draw() { const t0 = performance.now(); drawFrame(); belt.drawMs.push(performance.now() - t0); if (belt.drawMs.length > 120) belt.drawMs.shift(); }
function drawFrame() {
  const st = app.st; if (!st?.floor || !curView) return;
  if (!colors || performance.now() - colorsAt > 1500) readColors();
  const v = vs(), fl = st.floor, view = curView;
  if (!lo || lo.width !== view.W || lo.height !== view.H) { lo = document.createElement('canvas'); lo.width = view.W; lo.height = view.H; }
  const lc = lo.getContext('2d');
  const now = performance.now(), anim = !reducedMotion() && app.speed > 0;
  if (onNewSite(st, v)) {
    if (view.fl !== st.move.floor) { rerender({}); return; }
    // follow the builders: centre the view on whatever is being installed (unless the player is moving the cursor)
    { const n = st.move.order.length, i = Math.floor(Math.max(0, (G.moveProgress(st) - 0.08) / 0.86) * n);
      const cur = i < n ? st.move.floor.objects.find(x => x.id === st.move.order[i]) : st.move.floor.objects.find(x => x.kind === 'dock');
      if (cur && cur.id !== followId && performance.now() - lastKeyNav > 4000) { followId = cur.id; const [cx, cy] = center(cur); v.cx = Math.round(cx); v.cy = Math.round(cy); const fr = document.getElementById('floor-app'); if (fr) { const [lx, ly] = tileXY(view, cx + 0.5, cy + 0.5); fr.scrollLeft = lx * v.zoom - fr.clientWidth / 2; fr.scrollTop = ly * v.zoom - fr.clientHeight / 2; } } }
    const showCursor = document.activeElement?.id === 'floor-app';
    drawScene(lc, view, st, { C: colors, t: now, anim, pallets: 0, workers: crewSprites(st, anim), build: { p: G.moveProgress(st), order: st.move.order },
      cursor: showCursor && inBounds(st.move.floor, v.cx, v.cy) ? [v.cx, v.cy] : null });
    const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(lo, 0, 0, canvas.width, canvas.height);
    return;
  }
  if (view.fl !== st.floor) { rerender({}); return; }
  const g = ghostSpec(v);
  const beltBoxes = beltFrame(st, now, anim);
  const piles = machineStacks(st); belt.lastPiles = piles;
  const editor = editing() ? editorDraw(st) : null;
  view.beltDir = belt.dirs; view.beltLive = belt.live;
  const showCursor = document.activeElement?.id === 'floor-app' || v.mode !== 'select';
  drawScene(lc, view, st, {
    C: colors, t: now, anim,
    pallets: Math.ceil(G.boxesStored(st) / 20),
    workers: workerSprites(st), beltBoxes, editor, piles,
    sel: v.sel ? fl.objects.find(o => o.id === v.sel) : null,
    ghost: g && inBounds(fl, v.cx, v.cy) ? { spec: g, ok: !placementProblem(fl, g, v.mode === 'move' ? v.moving : null) } : null,
    cursor: showCursor && inBounds(fl, v.cx, v.cy) ? [v.cx, v.cy] : null,
    gauges: o => o.mode === 'produce' && o.recipe != null ? machineSupply(st, o).inputs.map(i => ({ frac: Math.min(1, i.hours / COVER_SCALE), status: i.status })) : [],
  });
  const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false;
  c.drawImage(lo, 0, 0, canvas.width, canvas.height);
}
// a building crew in hard hats around whatever is being installed at the new site
const crew = [101, 102, 103, 104].map((id, i) => ({ id, job: ['line_worker', 'mechanic', 'supervisor', 'line_worker'][i], hat: true, px: null, py: null, tx: null, ty: null }));
function crewSprites(st, anim) {
  const mv = st.move, n = mv.order.length, p = G.moveProgress(st);
  const i = Math.floor(Math.max(0, (p - 0.08) / 0.86) * n);
  const o = i < n ? mv.floor.objects.find(x => x.id === mv.order[i]) : mv.floor.objects.find(x => x.kind === 'dock');
  const fp = footprint(o); const xs = fp.map(f => f[0]), ys = fp.map(f => f[1]);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  return crew.map((e, k) => {
    const spot = () => { const side = (k + Math.floor(Math.random() * 4)) % 4; return side === 0 ? [x0 + Math.random() * (x1 - x0), y1] : side === 1 ? [x1, y0 + Math.random() * (y1 - y0)] : side === 2 ? [x0, y0 + Math.random() * (y1 - y0)] : [x0 + Math.random() * (x1 - x0), y1 + 0.4]; };
    if (e.px == null || !anim) { const [a, b] = spot(); e.px = e.px ?? a; e.py = e.py ?? b; e.tx = a; e.ty = b; }
    const dx = e.tx - e.px, dy = e.ty - e.py, d = Math.hypot(dx, dy), sp = 0.04 * (app.speed || 1);
    let moving = false;
    if (anim) { if (d < sp) { const [a, b] = spot(); e.tx = a; e.ty = b; } else { e.px += dx / d * sp; e.py += dy / d * sp; moving = true; } }
    e.px = Math.max(0, Math.min(mv.floor.w - 1, e.px)); e.py = Math.max(0, Math.min(mv.floor.h - 1, e.py));
    return { e, moving };
  });
}
function workerTarget(st, e) {
  const fl = st.floor, minute = minuteOfDay(st.time);
  const act = e.state || activityAt(e, minute);
  const find = k => fl.objects.find(o => o.kind === k);
  const at = o => center(o);
  if (act === 'home' || act === 'injured') return null;
  if (act === 'strike') { const ex = find('exit'); return [ex.x, ex.y - 1]; }
  if (act === 'lunch' || act === 'coffee') { const b = find('breakroom'); const [cx, cy] = at(b); return [cx + ((e.id * 7) % 3) - 1, cy + ((e.id * 3) % 2) - 0.5]; }
  if (act === 'restroom') return at(find('restroom'));
  if (act === 'smoke') { const i = fl.zones.indexOf(ZONE.SMOKING); if (i >= 0) return [i % fl.w, Math.floor(i / fl.w)]; const ex = find('exit'); return [ex.x, ex.y]; }
  const wp = fl.objects.find(o => o.id === e.assign);
  if (wp?.kind === 'machine') return ports(wp).control;
  if (wp?.kind === 'cell') {
    // the crew stands at the station work squares; with fewer people than stations they walk between them
    const sts = (wp.items || []).filter(isStation).sort((a, b) => (itemDef(a.t).role > itemDef(b.t).role) - (itemDef(a.t).role < itemDef(b.t).role));
    if (!sts.length) return [wp.x + wp.cw / 2, wp.y + wp.ch / 2];
    const crew = st.employees.filter(x => x.assign === wp.id), i = crew.indexOf(e);
    const run = /Running/.test(wp.status || '');
    const k = crew.length >= sts.length ? i % sts.length : (i + (run ? Math.floor(st.time / 20) : 0)) % sts.length;
    const [wx, wy] = workSquare(sts[k]); return [wp.x + wx, wp.y + wy];
  }
  if (wp?.kind === 'office') return at(wp);
  if (wp?.kind === 'suite') {
    const desks = (wp.items || []).filter(it => it.t === 'odesk'), i = st.employees.filter(x => x.assign === wp.id).indexOf(e);
    if (desks[i]) { const [wx, wy] = workSquare(desks[i]); return [wp.x + wx, wp.y + wy - 0.2]; }
    return at(wp);
  }
  const ms = fl.objects.filter(o => isProducer(o));
  if ((hasRole(e, 'foreman') || hasRole(e, 'maintenance')) && ms.length) {
    const spot = m => m.kind === 'cell' ? (ports(m).door || [m.x, m.y]) : null;
    if (hasRole(e, 'maintenance')) { const tgt = ms.slice().sort((a, b) => (b.broken - a.broken) || (a.credits - b.credits))[0]; return spot(tgt) || ports(tgt).maint; }
    const m = ms[Math.floor(minute / 30 + e.id) % ms.length]; if (spot(m)) return spot(m); const p = ports(m).control; return [p[0] + 1, p[1]];
  }
  const b = find('breakroom'); return at(b);
}
function workerSprites(st) {
  const snap = reducedMotion() || !app.speed, out = [];
  const trips = new Map(); for (const o of st.floor.objects) if (o.trip && o.trip.who != null) trips.set(o.trip.who, o);
  for (const e of st.employees) {
    e.carry = null; e.equip = null;
    const tripOf = trips.get(e.id);
    if (tripOf && e.act === 'work') { const pose = tripPose(st, tripOf, tripOf.trip); e.px = pose.px; e.py = pose.py; e.carry = pose.carry; e.equip = pose.equip; out.push({ e, moving: !!app.speed, bubble: null }); continue; }
    const tgt = workerTarget(st, e);
    if (!tgt) { e.px = undefined; continue; }
    let moving = false;
    if (e.px == null || snap) { e.px = tgt[0]; e.py = tgt[1]; }
    else { const dx = tgt[0] - e.px, dy = tgt[1] - e.py, d = Math.hypot(dx, dy), sp = 0.05 * (app.speed || 1); if (d < sp) { e.px = tgt[0]; e.py = tgt[1]; } else { e.px += dx / d * sp; e.py += dy / d * sp; moving = true; } }
    const act = e.state || activityAt(e, minuteOfDay(st.time));
    out.push({ e, moving, bubble: { coffee: 'coffee', smoke: 'smoke', strike: 'strike', goof: 'goof' }[act] || null });
  }
  return out;
}
