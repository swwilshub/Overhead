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

// ---- tables with optional sortable columns
// cols: [{key, label, num, render(row), sort(row)}]
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
  const tbody = h('tbody', null, sorted.map(r => h('tr', { class: opts.rowClass ? opts.rowClass(r) : '' }, cols.map((c, i) => {
    const v = c.render ? c.render(r) : r[c.key];
    return i === 0 && opts.rowHeader !== false ? h('th', { scope: 'row', class: c.num ? 'n' : '', style: { textTransform: 'none', letterSpacing: 0, fontSize: 'inherit', color: 'inherit' } }, v) : h('td', { class: c.num ? 'n' : '' }, v);
  }))));
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
