// Tiny DOM toolkit: element builder, announcements, dialogs, tables.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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
    const dlg = h('dialog', { 'aria-labelledby': id, class: opts.wide ? 'wide' : '' });
    if (opts.wide) dlg.style.width = 'min(860px, calc(100vw - 32px))';
    const close = v => { dlg.close(); dlg.remove(); resolve(v); };
    const acts = actions.map(a => h('button', { type: 'button', class: a.primary ? 'primary' : a.danger ? 'danger' : '', onclick: async () => { if (a.run) { const r = await a.run(dlg); if (r === false) return; } close(a.value); } }, a.label));
    dlg.append(h('div', { class: 'dlg' }, h('h2', { id }, title), body, acts.length ? h('div', { class: 'dlg-actions' }, acts) : null));
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(null); });
    document.body.append(dlg);
    dlg.showModal();
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
  const st = opts.sortState || { key: opts.defaultSort, dir: opts.defaultDir || 1 };
  const sorted = [...rows];
  const col = cols.find(c => c.key === st.key);
  if (col) { const f = col.sort || (r => r[col.key]); sorted.sort((a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; }); }
  const thead = h('thead', null, h('tr', null, cols.map(c => {
    const sortable = opts.onSort && c.sortable !== false;
    const aria = st.key === c.key ? (st.dir > 0 ? 'ascending' : 'descending') : (sortable ? 'none' : null);
    if (!c.label) return h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Actions'));
    return h('th', { scope: 'col', class: c.num ? 'n' : '', 'aria-sort': aria }, sortable ? h('button', { class: 'sort', type: 'button', 'data-key': 'sort-' + c.key, onclick: () => opts.onSort({ key: c.key, dir: st.key === c.key ? -st.dir : (c.num ? -1 : 1) }) }, c.label, st.key === c.key ? (st.dir > 0 ? ' ▲' : ' ▼') : '') : c.label);
  })));
  const tbody = h('tbody', null, sorted.map(r => {
    const tr = h('tr', { class: opts.rowClass ? opts.rowClass(r) : '' }, cols.map((c, i) => {
      const v = c.render ? c.render(r) : r[c.key];
      return i === 0 && opts.rowHeader !== false ? h('th', { scope: 'row', class: c.num ? 'n' : '', style: { textTransform: 'none', letterSpacing: 0, fontSize: 'inherit', color: 'inherit' } }, v) : h('td', { class: c.num ? 'n' : '' }, v);
    }));
    const first = tr.cells[0], marked = [...tr.querySelectorAll('[data-rowname]')], labels = marked.length ? marked : [first];
    if (first) for (const b of tr.querySelectorAll('button')) if (!first.contains(b) && !b.hasAttribute('aria-label') && !b.hasAttribute('aria-labelledby')) nameBy(b, ...labels);
    return tr;
  }));
  if (!rows.length) tbody.append(h('tr', null, h('td', { colspan: cols.length, class: 'muted' }, opts.empty || 'Nothing here yet.')));
  return h('div', { class: 'table-wrap', tabindex: opts.scrollable ? 0 : null, role: opts.scrollable ? 'region' : null, 'aria-label': opts.scrollable ? caption : null },
    h('table', null, caption ? h('caption', { class: opts.hideCaption ? 'sr-only' : '' }, caption) : null, thead, tbody));
}

export function meter(v, label) {
  const p = Math.max(0, Math.min(1, v));
  return h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100), 'aria-label': label }, h('i', { style: { width: p * 100 + '%' } }));
}
export const pill = (text, kind = 'mute', icon = '') => h('span', { class: 'pill ' + kind }, icon ? h('span', { 'aria-hidden': 'true' }, icon) : null, text);
export const kv = pairs => h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
export function field(label, input, hint) {
  const id = input.id || ('f' + Math.random().toString(36).slice(2, 8)); input.id = id;
  const hid = hint ? id + '-hint' : null; if (hid) input.setAttribute('aria-describedby', hid);
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('span', { id: hid, class: 'muted', style: { fontSize: '0.85rem' } }, hint) : null);
}
