import { isCompact } from './compact.js';
// Tiny DOM toolkit: element builder, announcements, dialogs, tables.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [p, x] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, x); else el.style[p] = x; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const frag = (...k) => { const f = document.createDocumentFragment(); append(f, k); return f; };

// ---- announcements: one polite and one assertive live region, plus visual toasts
let lastPolite = 0, politeQueue = [];
export function announce(msg, level = 'polite', toast = true) {
  if (!msg) return;
  if (level === 'assertive') {
    const r = document.getElementById('live-assertive'); r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 30);
  } else {
    politeQueue.push(msg);
    const now = Date.now();
    if (now - lastPolite > 600) flushPolite(); else setTimeout(flushPolite, 650);
  }
  if (toast && prefs.toasts !== false) showToast(msg, level);
}
function flushPolite() {
  if (!politeQueue.length) return;
  const r = document.getElementById('live-polite');
  const msg = politeQueue.slice(-3).join(' '); politeQueue = [];
  r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 30); lastPolite = Date.now();
}
// silent live update for the floor cursor (no toast)
export function describe(msg) {
  const r = document.getElementById('live-polite'); r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 20);
}
function showToast(msg, level) {
  const box = document.getElementById('toasts'); if (!box) return;
  const t = h('div', { class: 'toast ' + level }, msg);
  box.append(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.remove(), level === 'assertive' ? 7000 : 4200);
}
export const prefs = {};

// ---- dialogs (native <dialog>: focus trap and Escape for free)
export function dialog(title, body, actions = [], opts = {}) {
  return new Promise(resolve => {
    const id = 'dlg' + Math.random().toString(36).slice(2, 8);
    const dlg = h('dialog', { 'aria-labelledby': id, class: [opts.wide ? 'wide' : '', opts.cls || ''].filter(Boolean).join(' ') });
    if (opts.wide) dlg.style.width = 'min(860px, calc(100vw - 32px))';
    const close = v => { dlg.close(); dlg.remove(); resolve(v); };
    const acts = actions.map(a => h('button', { type: 'button', class: a.primary ? 'primary' : a.danger ? 'danger' : '', onclick: async () => { if (a.run) { const r = await a.run(dlg); if (r === false) return; } close(a.value); } }, a.label));
    dlg.append(h('div', { class: 'dlg' }, h('h2', { id }, title), body, acts.length ? h('div', { class: 'dlg-actions' }, acts) : null));
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(null); });
    if (opts.backdrop) dlg.addEventListener('click', e => { if (e.target === dlg) close(null); }); // a tap on the dimmed screen
    document.body.append(dlg);
    dlg.showModal();
    for (const p of dlg.querySelectorAll('.pager')) { p.__layout?.(); p.__observe?.(); }   // a paged body measures itself once it is on the screen
    const first = dlg.querySelector('[autofocus]') || dlg.querySelector('input,select,textarea') || acts.find(b => b.classList.contains('primary')) || acts[0];
    first?.focus();
  });
}
export async function confirmBox(title, text, yes = 'Confirm', danger = false) {
  return (await dialog(title, h('p', null, text), [{ label: 'Cancel', value: false }, { label: yes, value: true, primary: !danger, danger }])) === true;
}

// ---- focus that survives a redraw
// Every focused control is found again by a stable key: its data-key, its own id, or (for controls with neither) a
// signature built from its section, its table row and its text. If the control is gone, focus goes to the nearest
// control in the same table row, then the next control in the same section, then that section's heading. It never
// falls back to the page body.
const FOCUSABLE = 'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
const SECTION = 'section,aside,header,nav,main,[role="region"]';
let autoId = 0;
const norm = s => (s || '').replace(/\s+/g, ' ').replace(/[\d$,.]+/g, '#').trim().slice(0, 80);
const headingOf = sec => sec?.querySelector('h1,h2,h3');
function sectionKey(sec) {
  return sec.id || sec.getAttribute('aria-labelledby') || sec.getAttribute('aria-label') || norm(headingOf(sec)?.textContent) || sec.tagName;
}
function rowKey(el) {
  const tr = el.closest('tr'); if (!tr) return '';
  return (tr.cells[0]?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function baseSig(el) {
  const sec = el.closest(SECTION);
  return [sec ? sectionKey(sec) : '', rowKey(el), el.tagName, el.getAttribute('role') || '', norm(el.getAttribute('aria-label') || el.textContent)].join('|');
}
// signatures of the controls that have neither a data-key nor an id of their own
function sigs(scope) {
  const seen = new Map(), out = new Map();
  for (const el of scope.querySelectorAll(FOCUSABLE)) {
    if (el.dataset.key || (el.id && !el.hasAttribute('data-autoid'))) continue;
    const b = baseSig(el), n = seen.get(b) || 0; seen.set(b, n + 1); out.set(el, b + '|' + n);
  }
  return out;
}
function focusKey(el, all) {
  if (el.dataset.key) return 'k:' + el.dataset.key;
  if (el.id && !el.hasAttribute('data-autoid')) return '#' + el.id;
  return 's:' + all.get(el);
}
function findKey(scope, key, all) {
  if (key.startsWith('k:')) return scope.querySelector(`[data-key="${CSS.escape(key.slice(2))}"]`);
  if (key.startsWith('#')) return document.getElementById(key.slice(1));
  for (const [el, s] of all()) if ('s:' + s === key) return el;
  return null;
}
const usable = el => !!el && !el.disabled && !el.closest('[hidden],[inert]') && el.getClientRects().length > 0;
// Call before redrawing `scope`. Returns what restoreFocus needs, or null when focus is not inside `scope`.
export function captureFocus(scope) {
  const ae = document.activeElement;
  if (!scope || !ae || ae === document.body || !scope.contains(ae)) return null;
  const all = sigs(scope), key = el => focusKey(el, all);
  const sec = ae.closest(SECTION);
  const inSec = sec ? [...sec.querySelectorAll(FOCUSABLE)].filter(el => el === ae || usable(el)) : [];
  const i = inSec.indexOf(ae), tr = ae.closest('tr');
  const row = tr ? [...tr.querySelectorAll(FOCUSABLE)].filter(el => el !== ae && usable(el)).sort((a, b) => Math.abs(inSec.indexOf(a) - i) - Math.abs(inSec.indexOf(b) - i)).map(key) : [];
  return { key: key(ae), row, next: i >= 0 ? inSec.slice(i + 1, i + 41).map(key) : [], section: sec ? [sec.tagName, sectionKey(sec)] : null };
}
// After the redraw: focus the same control, or the nearest one that still exists.
export function restoreFocus(snap, scope) {
  if (!snap || !scope) return false;
  let cache = null; const all = () => (cache ||= sigs(scope));
  const tryFocus = el => { if (!usable(el)) return false; el.focus({ preventScroll: true }); return document.activeElement === el; };
  for (const k of [snap.key, ...snap.row, ...snap.next]) if (tryFocus(findKey(scope, k, all))) return true;
  const sec = snap.section && [...scope.querySelectorAll(SECTION)].find(s => s.tagName === snap.section[0] && sectionKey(s) === snap.section[1]);
  const main = document.getElementById('main');
  for (const hd of [sec && headingOf(sec), main?.querySelector('h1'), main]) {
    if (!hd) continue;
    if (!hd.hasAttribute('tabindex') && !hd.matches('button,a[href],input,select,textarea')) hd.setAttribute('tabindex', '-1');
    hd.focus({ preventScroll: true });
    if (document.activeElement === hd) return true;
  }
  return false;
}

// For a dialog or any async step that may outlive a redraw: `const back = rememberFocus(); await confirmBox(...); back();`
// puts focus back on the control that opened it, or the nearest one if a redraw replaced it.
export function rememberFocus() {
  const root = document.getElementById('app'), snap = captureFocus(root);
  return () => restoreFocus(snap, root);
}

// ---- distinct names for a control repeated down a list or table
// The accessible name is the control's own visible text, then the text of `labels` (its row header, say), through
// aria-labelledby, so it follows whatever those elements say. A comma that is heard but not seen (the CSS class
// named-by) separates the two.
export function nameBy(ctrl, ...labels) {
  const ids = [ctrl, ...labels].filter(Boolean).map(el => { if (!el.id) { el.id = 'an' + (++autoId); el.setAttribute('data-autoid', ''); } return el.id; });
  if (ids.length < 2) return ctrl;
  // the text goes in one inline wrapper so the comma joins it without a space (a flex button spaces its children)
  ctrl.classList.add('named-by'); ctrl.append(h('span', { class: 'nb' }, ...ctrl.childNodes));
  ctrl.setAttribute('aria-labelledby', ids.join(' '));
  return ctrl;
}

// ---- tables with optional sortable columns
// cols: [{key, label, num, render(row), sort(row)}]
// A button in a row (outside its first cell) is named by its own text and then the first cell, or the elements in the
// row marked data-rowname: "Select, Extrusion line machine #5".
export function table(caption, cols, rows, opts = {}) {
  if (isCompact()) cols = cols.filter(c => c.phone !== false);   // a phone's card shows the columns that matter
  const st = opts.sortState || { key: opts.defaultSort, dir: opts.defaultDir || 1 };
  const sorted = [...rows];
  const col = cols.find(c => c.key === st.key);
  if (col) { const f = col.sort || (r => r[col.key]); sorted.sort((a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; }); }
  // On a phone each row is a card (CSS). A table whose display is changed can lose its meaning for assistive technology,
  // so in that layout the roles are written out, and each cell carries its column's name for the card to show.
  const cards = isCompact(), role = r => cards ? { role: r } : {};
  const thead = h('thead', role('rowgroup'), h('tr', role('row'), cols.map(c => {
    const sortable = opts.onSort && c.sortable !== false;
    const aria = st.key === c.key ? (st.dir > 0 ? 'ascending' : 'descending') : (sortable ? 'none' : null);
    if (!c.label) return h('th', { scope: 'col', ...role('columnheader') }, h('span', { class: 'sr-only' }, 'Actions'));
    return h('th', { scope: 'col', class: c.num ? 'n' : '', 'aria-sort': aria, ...role('columnheader') }, sortable && !cards ? h('button', { class: 'sort', type: 'button', 'data-key': 'sort-' + c.key, onclick: () => opts.onSort({ key: c.key, dir: st.key === c.key ? -st.dir : (c.num ? -1 : 1) }) }, c.label, st.key === c.key ? (st.dir > 0 ? ' ▲' : ' ▼') : '') : c.label);
  })));
  const tbody = h('tbody', role('rowgroup'), sorted.map(r => {
    const tr = h('tr', { class: opts.rowClass ? opts.rowClass(r) : '', ...role('row') }, cols.map((c, i) => {
      const v = c.render ? c.render(r) : r[c.key];
      return i === 0 && opts.rowHeader !== false ? h('th', { scope: 'row', class: c.num ? 'n' : '', style: { textTransform: 'none', letterSpacing: 0, fontSize: 'inherit', color: 'inherit' }, ...role('rowheader') }, v) : h('td', { class: c.num ? 'n' : '', 'data-label': c.label || '', ...role('cell') }, v);
    }));
    const first = tr.cells[0], marked = [...tr.querySelectorAll('[data-rowname]')], labels = marked.length ? marked : [first];
    if (first) for (const b of tr.querySelectorAll('button')) if (!first.contains(b) && !b.hasAttribute('aria-label') && !b.hasAttribute('aria-labelledby')) nameBy(b, ...labels);
    return tr;
  }));
  if (!rows.length) tbody.append(h('tr', role('row'), h('td', { colspan: cols.length, class: 'muted', ...role('cell') }, opts.empty || 'Nothing here yet.')));
  // cards have no header row to click, so a sortable table offers a menu instead
  const sortCols = opts.onSort ? cols.filter(c => c.label && c.sortable !== false) : [];
  const menu = cards && sortCols.length ? h('label', { class: 'sort-menu' }, h('span', null, 'Sort by'),
    h('select', { 'data-key': 'sort-menu', onchange: e => { const [key, dir] = e.target.value.split(':'); opts.onSort({ key, dir: +dir }); } },
      sortCols.flatMap(c => [[c, c.num ? -1 : 1], [c, c.num ? 1 : -1]]).map(([c, d]) => h('option', { value: `${c.key}:${d}`, selected: st.key === c.key && st.dir === d },
        `${c.label}, ${c.num ? (d > 0 ? 'low to high' : 'high to low') : (d > 0 ? 'A to Z' : 'Z to A')}`)))) : null;
  const wrap = h('div', { class: opts.plain ? 'table-wrap plain' : 'table-wrap', tabindex: opts.scrollable ? 0 : null, role: opts.scrollable ? 'region' : null, 'aria-label': opts.scrollable ? caption : null },
    opts.noMenu ? null : menu, h('table', cards ? { role: 'table' } : null, caption ? h('caption', { class: opts.hideCaption ? 'sr-only' : '' }, caption) : null, thead, tbody));
  wrap.sortMenu = menu;   // a pager puts the Sort by menu above every page
  return wrap;
}

export function meter(v, label) {
  const p = Math.max(0, Math.min(1, v));
  return h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100), 'aria-label': label }, h('i', { style: { width: p * 100 + '%' } }));
}
export const pill = (text, kind = 'mute', icon = '') => h('span', { class: 'pill ' + kind }, icon ? h('span', { 'aria-hidden': 'true' }, icon) : null, text);
export const kv = pairs => h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
// the same pairs as one list, or on a phone as short lists of `n`, so a pager can put them on separate pages
export const kvParts = (pairs, n = 4) => { const ps = pairs.filter(Boolean); if (!isCompact() || ps.length <= n) return [kv(ps)]; const out = []; for (let i = 0; i < ps.length; i += n) out.push(kv(ps.slice(i, i + n))); return out; };
export function field(label, input, hint) {
  const id = input.id || ('f' + Math.random().toString(36).slice(2, 8)); input.id = id;
  const hid = hint ? id + '-hint' : null; if (hid) input.setAttribute('aria-describedby', hid);
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('span', { id: hid, class: 'muted', style: { fontSize: '0.85rem' } }, hint) : null);
}

// ---- large tabs: a tablist with arrow keys, Home and End. `list` is [[key, label], ...]; `pick(key)` re-renders and the
// helper puts focus back on the chosen tab. Styled as .cat-tabs, which turns into a swipeable strip on a phone.
export function tabs(label, list, cur, pick, panelId, prefix = 'tab') {
  const go = k => { pick(k); document.getElementById(`${prefix}-${k}`)?.focus(); };
  return h('div', { class: 'cat-tabs', role: 'tablist', 'aria-label': label },
    list.map(([k, text]) => h('button', { type: 'button', role: 'tab', id: `${prefix}-${k}`, 'aria-selected': String(cur === k), 'aria-controls': panelId, tabindex: cur === k ? 0 : -1, 'data-key': `${prefix}-${k}`,
      onclick: () => go(k),
      onkeydown: e => {
        const i = list.findIndex(c => c[0] === cur), d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
        if (d) { e.preventDefault(); go(list[(i + d + list.length) % list.length][0]); }
        else if (e.key === 'Home') { e.preventDefault(); go(list[0][0]); }
        else if (e.key === 'End') { e.preventDefault(); go(list[list.length - 1][0]); }
      } }, text)));
}

// ---- a seniority line: one dot per rung, filled up to `level`, with the rung's name under it. A named list, so the dots
// are never the only way to read the level.
export function ladderDots(names, level, opts = {}) {
  return h('ol', { class: 'ladder', 'aria-label': opts.label || 'Seniority' },
    names.map((n, i) => h('li', { class: i + 1 <= level ? 'on' : '', 'aria-current': i + 1 === level ? 'step' : null },
      h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'rung' }, n), opts.extra ? opts.extra(i + 1) : null)));
}

// ---- a progress line for seniority: three dots on a line, filled up to the current level and part-way to the next.
// Purely visual (aria-hidden); the level and progress are always written out beside it.
export function levelLine(level, progress = 0) {
  const at = Math.min(2, Math.max(0, level - 1 + (level >= 3 ? 0 : progress))) / 2 * 100;
  return h('div', { class: 'levelline', 'aria-hidden': 'true', style: { '--p': at + '%' } },
    [1, 2, 3].map(n => h('span', { class: n <= level ? 'pt on' : 'pt', style: { left: (n - 1) * 50 + '%' } })));
}

// ---- a carousel: one card at a time, with Previous and Next buttons, a count, swipe and the arrow keys.
//   items            what to page through
//   render(item, i)  builds the card
//   opts.state       an object kept by the caller ({ id, i }) so the place survives a re-render
//   opts.key(item)   a stable id for an item, so the place follows the person, not the position
//   opts.label(item) text announced when the card changes, e.g. "Maria Lopez, Senior Operator"
//   opts.name        the region's label, e.g. "Staff"
export function carousel(items, render, opts = {}) {
  const s = opts.state || {}, n = items.length, key = opts.key || (x => x);
  let i = s.id != null ? items.findIndex(x => key(x) === s.id) : -1;
  if (i < 0) i = Math.min(s.i || 0, Math.max(0, n - 1));
  const card = h('div', { class: 'carousel-card', 'aria-live': 'off' });
  const count = h('span', { class: 'carousel-count num', 'aria-hidden': 'true' });
  const prev = h('button', { type: 'button', class: 'carousel-btn', 'data-key': 'car-prev', onclick: () => move(-1) }, h('span', { 'aria-hidden': 'true' }, '‹ '), 'Previous');
  const next = h('button', { type: 'button', class: 'carousel-btn', 'data-key': 'car-next', onclick: () => move(1) }, 'Next', h('span', { 'aria-hidden': 'true' }, ' ›'));
  const show = said => {
    s.i = i; s.id = n ? key(items[i]) : null;
    card.replaceChildren(n ? render(items[i], i) : h('p', { class: 'empty' }, opts.empty || 'Nothing to show.'));
    count.textContent = n ? `${i + 1} of ${n}` : '';
    prev.disabled = next.disabled = n < 2;
    if (said && n) announce(`${i + 1} of ${n}: ${opts.label ? opts.label(items[i]) : ''}`, 'polite', false);
  };
  function move(d) { if (n < 2) return; i = (i + d + n) % n; show(true); }
  // swipe: a mostly horizontal drag of 50 px or more; vertical drags still scroll the page
  let sx = null, sy = 0;
  card.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; });
  card.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1); });
  card.addEventListener('pointercancel', () => { sx = null; });
  show(false);
  return h('section', { class: 'carousel', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': opts.name || 'Items', tabindex: n ? 0 : null,
    onkeydown: e => { if (e.target !== e.currentTarget && !e.target.matches?.('.carousel-btn')) return; const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); move(d); } } },
    card, h('div', { class: 'carousel-bar' }, prev, count, next));
}

// ---- a stepper: sets a number without the keyboard.
//   label       what it sets ("Salary offer"); names the group, the readout and the buttons
//   value, min, max, step, big   the number, its range, and the small and large steps (big defaults to 10 × step)
//   decimals    digits kept (2 for dollars and cents); values are rounded to this
//   format(v)   how a value reads ("$27,000"); also what a screen reader says
//   presets     [{ label, value }] chips that jump to a value
//   slider      add a range slider across min to max
//   compact     just minus, readout and plus: fits a table cell
//   describe(v) a line under the control that reads the current value in context
//   onChange(v) called with each new value; onSettle() half a second after the last one (a page can redraw then)
//   key         data-key prefix for the controls (tests, focus after a redraw)
// Hold a button to repeat: faster after a second, faster again after two. The readout is a spinbutton: arrows step,
// Page Up and Page Down take the big step, Home and End go to the ends.
export function stepper(o) {
  const dec = o.decimals ?? 0, scale = 10 ** dec, rnd = x => Math.round(x * scale) / scale;
  let max = o.max ?? Infinity; const min = o.min ?? 0, small = o.step ?? 1, big = o.big ?? small * 10;
  const fmt = o.format || (v => String(v)), clamp = x => Math.min(max, Math.max(min, rnd(x)));
  const k = o.key ? s => ({ 'data-key': `${o.key}-${s}` }) : () => ({});
  let cur = clamp(o.value ?? min);
  const readout = h('span', { class: 'stepper-value num', role: 'spinbutton', tabindex: 0, 'aria-label': o.label, ...(o.key ? { 'data-key': o.key } : {}),
    onkeydown: e => {
      const d = { ArrowUp: small, ArrowRight: small, ArrowDown: -small, ArrowLeft: -small, PageUp: big, PageDown: -big }[e.key];
      if (d) { e.preventDefault(); set(cur + d); }
      else if (e.key === 'Home') { e.preventDefault(); set(min); }
      else if (e.key === 'End' && isFinite(max)) { e.preventDefault(); set(max); }
    } });
  const say = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  const note = o.describe ? h('p', { class: 'stepper-note muted' }) : null;
  const slider = o.slider && isFinite(max) ? h('input', { type: 'range', class: 'stepper-slider', min, max, step: small, 'aria-label': `${o.label}, slider`, ...k('slider'), oninput: e => set(+e.target.value) }) : null;
  const chips = (o.presets || []).map(p => h('button', { type: 'button', class: 'chip', ...k('chip-' + String(p.label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')), onclick: () => set(p.value) }, p.label));
  let timer = null;
  function paint() {
    const text = fmt(cur);
    readout.textContent = text; readout.setAttribute('aria-valuenow', cur); readout.setAttribute('aria-valuetext', text); readout.setAttribute('aria-valuemin', min);
    if (isFinite(max)) readout.setAttribute('aria-valuemax', max);
    if (slider) { slider.value = cur; slider.setAttribute('aria-valuetext', text); }
    for (const b of buttons) b.el.disabled = b.dir < 0 ? cur <= min : cur >= max;
    (o.presets || []).forEach((p, i) => chips[i].setAttribute('aria-pressed', String(cur === clamp(p.value))));
    if (note) note.textContent = o.describe(cur);
  }
  function set(v) {
    const n = clamp(v); if (n === cur) return;
    cur = n; paint(); o.onChange?.(cur);
    clearTimeout(timer); timer = setTimeout(() => { say.textContent = ''; setTimeout(() => { say.textContent = `${o.label}: ${fmt(cur)}`; }, 30); o.onSettle?.(); }, 500);
  }
  const buttons = [];
  // a button that steps once on a press and repeats while it is held; a keyboard click steps once
  function stepBtn(dir, amount, text, name) {
    let rep = null, t0 = 0, fired = false;
    const stop = () => { clearTimeout(rep); rep = null; delete document.body.dataset.stepping; };
    const tick = () => { const held = performance.now() - t0; set(cur + dir * amount * (held > 2000 ? 10 : held > 1000 ? 3 : 1)); rep = setTimeout(tick, held > 1000 ? 60 : 120); };
    const el = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': `${dir < 0 ? 'Decrease' : 'Increase'} ${o.label} by ${fmt(amount)}`, ...k(name),
      onpointerdown: e => { if (e.pointerType === 'mouse' && e.button !== 0) return; fired = true; t0 = performance.now(); document.body.dataset.stepping = '1'; set(cur + dir * amount); rep = setTimeout(tick, 450); try { el.setPointerCapture(e.pointerId); } catch {} },
      onclick: () => { if (fired) { fired = false; return; } set(cur + dir * amount); },
      oncontextmenu: e => e.preventDefault() }, text);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, stop);
    buttons.push({ el, dir });
    return el;
  }
  const sign = (dir, amount) => (dir < 0 ? '−' : '+') + (o.compact ? '' : fmt(amount));
  const ctl = o.compact
    ? h('div', { class: 'stepper-row' }, stepBtn(-1, small, '−', 'minus'), readout, stepBtn(1, small, '+', 'plus'))
    : h('div', { class: 'stepper-main' }, readout,
        h('div', { class: 'stepper-row' }, big > small ? stepBtn(-1, big, sign(-1, big), 'minus-big') : null, stepBtn(-1, small, sign(-1, small), 'minus'), stepBtn(1, small, sign(1, small), 'plus'), big > small ? stepBtn(1, big, sign(1, big), 'plus-big') : null));
  const root = h('div', { class: o.compact ? 'stepper compact' : 'stepper', role: 'group', 'aria-label': o.label }, ctl, slider, chips.length ? h('div', { class: 'stepper-chips' }, chips) : null, note, say);
  paint();
  root.stepperValue = () => cur;
  root.stepperSet = set;
  // change the top of the range (the vendor you pick may have less to sell); the value is pulled down to fit
  root.stepperLimit = m => { max = Math.max(min, m); if (slider) slider.max = max; readout.setAttribute('aria-valuemax', max); const was = cur; cur = clamp(cur); paint(); if (cur !== was) o.onChange?.(cur); };
  return root;
}
