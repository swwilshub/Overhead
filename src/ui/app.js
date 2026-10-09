// App shell: status bar, navigation, the run loop, refresh with focus preservation.
import { h, frag, announce, prefs, dialog, confirmBox, captureFocus, restoreFocus } from './dom.js';
import { isCompact, COMPACT_QUERY, compactMq } from './compact.js';
import * as G from '../sim/game.js';
import { fmtDate, fmtTime, money, moneyShort, minuteOfDay, isWorkday, MIN_PER_DAY, monthKey, weekday } from '../core/util.js';
import { WORK_START, WORK_END, isWhite } from '../sim/people.js';
import { hasRole } from '../core/content.js';
import { ports, links, ZONE, objectLabel } from '../sim/floor.js';
import { stalledMachines } from '../sim/stalls.js';
import { saveGame, localPrefsGet, localPrefsSet, submitScore } from './storage.js';
import { sfx, sfxBatch, ambience } from './sound.js';

export const app = { st: null, view: 'start', speed: 0, viewState: {}, views: {}, runTo: null, lastRefresh: 0, dirty: true };

export const NAV = [
  ['Plant', [['floor', 'Factory floor'], ['catalog', 'Catalog'], ['research', 'Research']]],
  ['People', [['staff', 'Staff'], ['hire', 'Hiring'], ['inbox', 'In-basket']]],
  ['Business', [['purchasing', 'Purchasing'], ['sales', 'Sales'], ['bank', 'Bank'], ['reports', 'Reports']]],
  ['Market', [['city', 'City map'], ['nation', 'Nation']]],
  ['Game', [['options', 'Options & help']]],
];
// Phones, in portrait and landscape: a slim top bar, a bottom bar and a Menu sheet replace the side menu (spec 007).
export { isCompact, COMPACT_QUERY };
compactMq.addEventListener('change', () => { closeMenu(); render({}); });
const NAV_KEYS = { f: 'floor', c: 'catalog', d: 'research', s: 'staff', h: 'hire', i: 'inbox', p: 'purchasing', l: 'sales', b: 'bank', r: 'reports', m: 'city', n: 'nation', o: 'options' };

export function registerView(name, mod) { app.views[name] = mod; }

export function loadPrefs() {
  Object.assign(prefs, { theme: 'system', scale: 0, contrast: false, sfx: true, ambience: false, cursorTicks: false, volume: 0.6, shortcuts: true, pauseOnAlert: true, toasts: true, motion: 'system', autosave: true, ...localPrefsGet() });
  applyPrefs();
}
export function applyPrefs() {
  const r = document.documentElement;
  if (prefs.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', prefs.theme);
  if (prefs.scale) r.setAttribute('data-scale', prefs.scale); else r.removeAttribute('data-scale');
  if (prefs.contrast) r.setAttribute('data-contrast', 'high'); else r.removeAttribute('data-contrast');
  localPrefsSet(prefs);
}
export const reducedMotion = () => prefs.motion === 'reduce' || (prefs.motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---- navigation and rendering
export function go(view, opts = {}) {
  if (!app.views[view]) return;
  app.view = view; app.dirty = true;
  render({ focusMain: opts.focus !== false });
}
export function act(result, quiet, sound) {
  if (!result) return result;
  if (result.msg && !quiet) announce(result.msg, result.ok ? 'polite' : 'assertive');
  if (result.ok) sfx(sound || 'ok'); else if (result.msg) sfx('error');
  app.dirty = true; refresh(true);
  return result;
}

function inGame() { return app.st && app.st.phase === 'play'; }

export function render(opts = {}) {
  const root = document.getElementById('app');
  const prevFocus = captureFocus(root);
  const main = document.getElementById('main');
  const scroll = main ? main.scrollTop : 0;
  root.replaceChildren(statusBar(), h('div', { class: 'body' }, navRail(), h('main', { id: 'main', tabindex: -1 }, viewContent())));
  const nm = document.getElementById('main');
  if (opts.focusMain) { nm.scrollTop = 0; const hd = nm.querySelector('h1'); (hd || nm).setAttribute('tabindex', '-1'); (hd || nm).focus({ preventScroll: true }); }
  else { nm.scrollTop = scroll; restoreFocus(prevFocus, root); }
  app.dirty = false; app.lastRefresh = performance.now();
  app.views[app.view]?.mounted?.(app);
}
function viewContent() {
  const v = app.views[app.view];
  try { return v.render(app); }
  catch (e) { console.error(e); return h('div', { class: 'notice' }, 'Something went wrong drawing this page: ' + e.message); }
}

// Live refresh: re-render the active view (throttled), unless the player is typing in it.
export function refresh(force = false) {
  const now = performance.now();
  updateStatus();
  if (!force && now - app.lastRefresh < 1000) return;
  const ae = document.activeElement;
  const typing = ae && ae.closest('main') && (ae.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]),select,textarea'));
  if (typing && !force) { updateStatus(); return; }
  if (document.querySelector('dialog[open]')) { updateStatus(); return; }
  const v = app.views[app.view];
  if (v?.patch && !force) { v.patch(app); app.lastRefresh = now; updateNavBadges(); return; }
  if (force || v?.live) render({ focusMain: false });
}

// ---- status bar
function statusBar() {
  const st = app.st, compact = isCompact();
  const bar = h('header', { class: 'status' + (compact ? ' compact' : ''), 'aria-label': 'Company status' },
    h('div', { class: 'brand' }, h('span', { class: 'stripe', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, st ? st.setup.company : 'Overhead')));
  if (!st) return bar;
  // compact: money, issues, the clock and the speed buttons; net worth, city, Run until and Sound live in the Menu
  if (compact) {
    bar.append(frag(
      h('div', { class: 'fig cash' }, h('span', null, 'Checking'), h('span', { id: 'st-cash' }, money(st.bank.checking))),
      alertSlot(),
      h('div', { class: 'clock', id: 'st-clock', 'aria-label': 'Game date and time' }, clockText()),
      inGame() ? runControls(true) : null));
    return bar;
  }
  bar.append(frag(
    h('div', { class: 'clock', id: 'st-clock', 'aria-label': 'Game date and time' }, clockText()),
    h('div', { class: 'figs' },
      h('div', { class: 'fig' }, h('span', null, 'Checking'), h('span', { id: 'st-cash' }, money(st.bank.checking))),
      h('div', { class: 'fig' }, h('span', null, 'Net worth'), h('span', { id: 'st-nw' }, moneyShort(G.netWorth(st)))),
      st.city ? h('div', { class: 'fig' }, h('span', null, 'City'), h('span', null, st.city.name)) : null),
    inGame() ? runControls() : null,
    alertSlot()));
  return bar;
}
// The "N setup issues" button lives in the status bar, which render() rebuilds. It is built there (not added later by
// updateStatus) and has a data-key, so focus on it survives a full render; updateStatus patches its text in place.
const issueText = n => `${n} issue${n > 1 ? 's' : ''}`;
function alertSlot() {
  const n = setupProblems(app.st).length;
  return h('span', { id: 'st-alert', 'data-v': n ? issueText(n) : '' }, n ? alertButton(issueText(n)) : null);
}
const alertButton = text => h('button', { class: 'alert', type: 'button', 'data-key': 'st-alert', onclick: () => go('floor') }, text);
function clockText() {
  const st = app.st; const m = minuteOfDay(st.time);
  const shift = isWorkday(st.time) && m >= WORK_START && m < WORK_END ? 'Shift running' : 'Plant closed';
  return [h('div', null, fmtDate(st.time)), h('div', null, `${fmtTime(st.time)} · ${shift}`)];
}
const SPEEDS = [['Pause', 0], ['Play', 1], ['Fast', 2], ['Faster', 3]];
const SPEED_ICON = { Pause: '❚❚', Play: '▶', Fast: '▶▶', Faster: '▶▶▶' };
function muteButton() {
  return h('button', { type: 'button', 'data-key': 'mute', 'aria-pressed': String(!prefs.sfx), 'aria-label': 'Mute sound', title: 'Mute sound', onclick: e => { prefs.sfx = !prefs.sfx; applyPrefs(); e.currentTarget.setAttribute('aria-pressed', String(!prefs.sfx)); e.currentTarget.textContent = prefs.sfx ? '♪ Sound' : '♪ Muted'; updateAmbience(); if (prefs.sfx) sfx('ok'); announce(prefs.sfx ? 'Sound on.' : 'Sound muted.', 'polite', false); } }, prefs.sfx ? '♪ Sound' : '♪ Muted');
}
function runControls(compact = false) {
  return h('div', { class: 'run', role: 'group', 'aria-label': 'Clock' },
    SPEEDS.map(([label, s]) => h('button', { type: 'button', 'data-key': 'speed-' + s, 'aria-pressed': String(app.speed === s && !app.runTo), onclick: () => setSpeed(s), ...(compact ? { 'aria-label': label, title: label } : {}) }, compact ? SPEED_ICON[label] : label)),
    compact ? null : [h('button', { type: 'button', 'data-key': 'runto', onclick: runToMenu, 'aria-haspopup': 'dialog' }, 'Run until…'), muteButton()]);
}
export function setSpeed(s) {
  const was = app.speed; app.speed = s; app.runTo = null;
  if (!was && s) sfx('start'); else if (was && !s) sfx('stop'); else if (s) sfx('click');
  if (s && app.st.over) { app.speed = 0; return; }
  announce(s ? `Clock running, ${SPEEDS[s][0].toLowerCase()} speed.` : 'Clock paused.', 'polite', false);
  document.querySelectorAll('.status .run button[data-key^="speed-"]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.key.slice(6) === s)));
}
async function runToMenu() {
  const st = app.st;
  const nextDay = () => { let t = st.time - minuteOfDay(st.time) + MIN_PER_DAY + WORK_START; while (!isWorkday(t)) t += MIN_PER_DAY; return t; };
  const endOfShift = () => { const m = minuteOfDay(st.time); if (isWorkday(st.time) && m < WORK_END) return st.time - m + WORK_END; return nextDay() - WORK_START + WORK_END; };
  const nextFriday = () => { let t = st.time - minuteOfDay(st.time) + WORK_END + 1; while (weekday(t) !== 5 || t <= st.time) t += MIN_PER_DAY; return t; };
  const monthEnd = () => { let t = st.time - minuteOfDay(st.time) + MIN_PER_DAY; while (monthKey(t) === monthKey(st.time)) t += MIN_PER_DAY; return t + 7 * 60; };
  const choice = await dialog('Run the clock until…', h('p', null, 'The clock stops early if something urgent lands in your In-basket.'), [
    { label: 'End of this shift', value: endOfShift() }, { label: 'Next morning', value: nextDay() }, { label: 'Friday evening', value: nextFriday() }, { label: 'Start of next month', value: monthEnd(), primary: true }, { label: 'Cancel', value: null }]);
  if (choice) { app.runTo = choice; app.speed = 4; sfx('start'); announce('Running the clock…', 'polite', false); }
}
function updateStatus() {
  const st = app.st; if (!st) return;
  const c = document.getElementById('st-clock'); if (c) c.replaceChildren(...clockText());
  const cash = document.getElementById('st-cash'); if (cash) { cash.textContent = money(st.bank.checking); }
  const nw = document.getElementById('st-nw'); if (nw) nw.textContent = moneyShort(G.netWorth(st));
  const al = document.getElementById('st-alert');
  if (al) {
    const n = setupProblems(st).length;
    const want = n ? issueText(n) : '';
    if (al.dataset.v !== want) {
      al.dataset.v = want;
      const btn = al.querySelector('button');
      if (btn && n) btn.textContent = want; // same element, so focus stays on it
      else if (n) al.replaceChildren(alertButton(want));
      else {
        // the last issue is fixed: if the button has focus, hand it to its neighbour in the bar instead of the page body
        const had = btn && document.activeElement === btn;
        al.replaceChildren();
        if (had) document.querySelector('.status [data-key="mute"], .status [data-key="runto"], .status [data-key="speed-3"]')?.focus({ preventScroll: true });
      }
    }
  }
  updateNavBadges();
}
function updateNavBadges() {
  const st = app.st; if (!st) return;
  const n = st.memos.filter(m => !m.read).length;
  for (const b of document.querySelectorAll('[data-badge="inbox"]')) { b.textContent = n ? String(n) : ''; b.hidden = !n; b.setAttribute('aria-label', `${n} unread`); }
}
export function setupProblems(st) {
  if (!st || st.phase !== 'play') return [];
  const out = [], fl = st.floor;
  const machines = fl.objects.filter(o => o.kind === 'machine' || o.kind === 'cell');
  if (!machines.length) out.push({ text: 'No production machines have been purchased.', view: 'catalog' });
  if (machines.some(o => o.operator == null)) out.push({ text: 'A machine has no operator.', view: 'staff' });
  if (st.employees.some(e => e.assign == null && !['chief', 'foreman', 'maintenance'].some(r => hasRole(e, r)))) out.push({ text: 'Someone has no job assignment.', view: 'staff' });
  if (st.strike) out.push({ text: 'The floor staff are on strike.', view: 'staff' });
  for (const o of machines) {
    if (o.mode !== 'produce') continue;
    const un = G.unsafeInputs(fl, o);
    if (un.length) { out.push({ text: `${objectLabel(st, o)} needs a safety zone (or a belt) at input ${un.map(u => u.k + 1).join(' and ')}.`, view: 'floor', obj: o.id }); }
  }
  // machines that are starved or blocked right now, each with its reason (a delivery on its way is not a problem)
  for (const s of stalledMachines(st)) out.push({ text: `${objectLabel(st, s.obj)}: ${s.short}.`, view: 'floor', obj: s.obj.id, stall: s.kind });
  if (links(fl).dangling) out.push({ text: 'Some conveyor belts do not connect to anything.', view: 'floor' });
  if (st.employees.some(e => isWhite(e) && !fl.objects.some(o => (o.kind === 'office' || o.kind === 'suite') && o.id === e.assign))) out.push({ text: 'An office worker has no office.', view: 'catalog' });
  return out;
}

const unread = () => app.st ? app.st.memos.filter(m => !m.read).length : 0;
const inboxBadge = () => h('span', { class: 'badge', 'data-badge': 'inbox', hidden: !unread() }, String(unread() || ''));
// Compact screens: four big buttons along the bottom. Before a game starts they are the same few links the side menu has.
function tabBar() {
  const play = app.st && app.st.phase === 'play';
  const link = (view, label, extra) => h('li', null, h('a', { href: '#' + view, 'data-key': 'tab-' + view, 'aria-current': app.view === view ? 'page' : null, onclick: e => { e.preventDefault(); go(view); } }, h('span', null, label), extra));
  if (!play) return h('nav', { class: 'tabbar', 'aria-label': 'Game' }, h('ul', null,
    link('start', 'Title screen'), app.st ? link('nation', 'Choose a city') : null, app.st?.city ? link('city', 'Choose a building') : null, link('options', 'Options & help')));
  return h('nav', { class: 'tabbar', 'aria-label': 'Main' }, h('ul', null,
    link('floor', 'Floor'), link('staff', 'Staff'), link('inbox', 'In-basket', inboxBadge()),
    h('li', null, h('button', { type: 'button', 'data-key': 'menu', 'aria-haspopup': 'dialog', onclick: openMenu }, 'Menu'))));
}
const closeMenu = () => document.querySelector('dialog.menu-sheet')?.dispatchEvent(new Event('cancel'));
// The Menu: every section of the game, plus what the slim top bar leaves out. A modal dialog, so focus is held in it,
// Escape closes it and focus returns to the Menu button; a tap on the dimmed screen above it closes it too.
function openMenu() {
  const st = app.st; if (!st || st.phase !== 'play') return;
  const sections = h('nav', { 'aria-label': 'Departments' }, NAV.map(([group, items]) => h('section', { class: 'menu-group' }, h('h3', null, group),
    h('ul', null, items.map(([k, label]) => h('li', null, h('button', { type: 'button', class: 'menu-link', 'data-key': 'nav-' + k, 'aria-current': app.view === k ? 'page' : null, onclick: () => { closeMenu(); go(k); } }, h('span', null, label), k === 'inbox' ? inboxBadge() : null)))))));
  const facts = h('dl', { class: 'menu-facts' }, h('div', null, h('dt', null, 'Net worth'), h('dd', null, moneyShort(G.netWorth(st)))), st.city ? h('div', null, h('dt', null, 'City'), h('dd', null, st.city.name)) : null);
  const tools = h('div', { class: 'row menu-tools' }, h('button', { type: 'button', 'data-key': 'runto', 'aria-haspopup': 'dialog', onclick: () => { closeMenu(); runToMenu(); } }, 'Run until…'), muteButton());
  dialog('Menu', frag(h('button', { type: 'button', class: 'menu-close', 'data-key': 'menu-close', onclick: closeMenu }, 'Close'), facts, tools, sections), [], { cls: 'menu-sheet', backdrop: true });
}
function navRail() {
  if (isCompact()) return tabBar();
  if (!app.st || app.st.phase !== 'play') {
    return h('nav', { class: 'rail', 'aria-label': 'Game' }, h('ul', null,
      h('li', null, h('a', { href: '#', 'aria-current': app.view === 'start' ? 'page' : null, onclick: e => { e.preventDefault(); go('start'); } }, 'Title screen')),
      app.st ? h('li', null, h('a', { href: '#', 'aria-current': app.view === 'nation' ? 'page' : null, onclick: e => { e.preventDefault(); go('nation'); } }, 'Choose a city')) : null,
      app.st?.city ? h('li', null, h('a', { href: '#', 'aria-current': app.view === 'city' ? 'page' : null, onclick: e => { e.preventDefault(); go('city'); } }, 'Choose a building')) : null,
      h('li', null, h('a', { href: '#', 'aria-current': app.view === 'options' ? 'page' : null, onclick: e => { e.preventDefault(); go('options'); } }, 'Options & help'))));
  }
  return h('nav', { class: 'rail', 'aria-label': 'Departments' }, h('ul', null, NAV.map(([group, items]) => [
    h('li', { class: 'group', 'aria-hidden': 'true' }, group),
    items.map(([k, label]) => h('li', null, h('a', { href: '#' + k, 'data-key': 'nav-' + k, 'aria-current': app.view === k ? 'page' : null, onclick: e => { e.preventDefault(); go(k); } }, label,
      k === 'inbox' ? h('span', { class: 'badge', id: 'badge-inbox', 'data-badge': 'inbox', hidden: !app.st.memos.some(m => !m.read) }, String(app.st.memos.filter(m => !m.read).length || '')) : null)))])));
}

// ---- the clock loop
let lastTick = 0, saving = false;
export function startLoop() {
  setInterval(tick, 50);
}
const RATE = [0, 8, 60, 240]; // game minutes per real second during the shift
function tick() {
  const st = app.st; const now = performance.now(); const dtReal = Math.min(0.25, (now - (lastTick || now)) / 1000); lastTick = now;
  if (!st || st.phase !== 'play' || st.over) return;
  if (!app.speed) { drainBus(); updateAmbience(); return; }
  const before = st.time;
  if (app.runTo) {
    const step = Math.min(app.runTo - st.time, 1440);
    if (step > 0) G.advance(st, step);
    if (st.time >= app.runTo) { app.runTo = null; app.speed = 0; announce(`Clock stopped: ${fmtDate(st.time)}, ${fmtTime(st.time)}.`); render({}); }
  } else {
    const m = minuteOfDay(st.time); const working = isWorkday(st.time) && m >= WORK_START - 15 && m < WORK_END + 15;
    let mins = RATE[app.speed] * dtReal * (working ? 1 : 30);
    app.acc = (app.acc || 0) + mins;
    const whole = Math.floor(app.acc);
    if (whole >= 1) { app.acc -= whole; G.advance(st, whole); }
  }
  if (st.time !== before) afterAdvance(before);
  updateAmbience();
}
let ambAt = 0;
export function updateAmbience() {
  const now = performance.now(); if (now - ambAt < 500) return; ambAt = now;
  const st = app.st; const running = st?.floor ? st.floor.objects.filter(o => (o.kind === 'machine' || o.kind === 'cell') && /Running/.test(o.status || '')).length : 0;
  ambience(running, !!(st && st.phase === 'play' && app.speed && !st.over));
}
function afterAdvance(before) {
  const st = app.st;
  drainBus();
  if (st.flags.pauseRequest) {
    st.flags.pauseRequest = false;
    if (prefs.pauseOnAlert && (app.speed || app.runTo)) { app.speed = 0; app.runTo = null; announce('Clock paused: an urgent memo arrived.', 'assertive'); sfx('alert'); render({}); }
  }
  if (st.flags.autosave) { st.flags.autosave = false; if (prefs.autosave && !saving) { saving = true; saveGame('auto', st, 'Autosave').finally(() => { saving = false; }); } }
  if (st.over && !app.shownOver) { app.shownOver = true; app.speed = 0; gameOver(); }
  app.views[app.view]?.onTick?.(app, before);
  refresh();
}
function drainBus() {
  if (G.bus.sounds.length) sfxBatch(G.bus.sounds.splice(0, G.bus.sounds.length));
  const q = G.bus.queue; if (!q.length) return;
  const items = q.splice(0, q.length);
  const urgent = items.filter(i => i.level === 'assertive');
  for (const u of urgent.slice(-2)) announce(u.msg, 'assertive');
  const normal = items.filter(i => i.level !== 'assertive');
  if (normal.length) announce(normal.length > 3 ? `${normal.length} updates. Latest: ${normal[normal.length - 1].msg}` : normal.map(i => i.msg).join(' '), 'polite');
}
async function gameOver() {
  const st = app.st;
  await submitScore({ company: st.setup.company, city: st.city.name, score: st.over.score, months: st.history.length, scenario: st.setup.scenario });
  await dialog('Game over', h('p', null, `${st.setup.company} has gone bankrupt after ${st.history.length} months. Final score: ${money(st.over.score)}.`), [{ label: 'Back to the title screen', value: 1, primary: true }]);
  app.st = null; go('start');
}

// ---- keyboard shortcuts (single keys can be switched off in Options)
// They work everywhere outside text fields and dialogs, the floor grid included. After g, the next key within 1.5 s
// is for navigation only: the floor grid leaves it alone (navPending), so g m opens the City map and doesn't start a move.
let gPending = 0;
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);
export const shortcutsOn = () => !!(prefs.shortcuts && app.st && app.st.phase === 'play');
export const navPending = e => shortcutsOn() && !!gPending && Date.now() - gPending < 1500 && !MODIFIERS.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey;
export function installKeys() {
  document.addEventListener('keydown', e => {
    if (!prefs.shortcuts || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest('input,select,textarea,dialog')) return;
    if (!app.st || app.st.phase !== 'play') return;
    if (MODIFIERS.has(e.key)) return;
    if (gPending) {
      const fresh = Date.now() - gPending < 1500; gPending = 0;
      if (fresh && NAV_KEYS[e.key]) { e.preventDefault(); go(NAV_KEYS[e.key]); return; }
      if (fresh && e.key !== 'g' && t.closest('[role="application"]')) return;
    }
    if (e.key === ' ' && !t.closest('button,a,[role="button"]')) { e.preventDefault(); setSpeed(app.speed ? 0 : 1); updatePressed(); return; }
    if (e.key === '[') { setSpeed(Math.max(0, app.speed - 1)); updatePressed(); return; }
    if (e.key === ']') { setSpeed(Math.min(3, app.speed + 1)); updatePressed(); return; }
    if (e.key === '?') { go('options'); return; }
    if (e.key === 'g') { gPending = Date.now(); return; }
  });
}
function updatePressed() { document.querySelectorAll('.status .run button[data-key^="speed-"]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.key.slice(6) === app.speed))); }

export async function quickSave() {
  const st = app.st; if (!st) return;
  st._nw = Math.round(G.netWorth(st));
  const r = await saveGame('auto', st, 'Autosave');
  return r;
}
