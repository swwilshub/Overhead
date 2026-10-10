// A section as pages that each fit the screen (spec 016). Used on a phone; a desktop keeps its long pages.
//   groups: [{ key, label, header?, blocks: [Node, ...] }]
// A group is one large tab. Its blocks (cards, headings, charts, and the rows of a table) are measured and packed into as many
// pages as the space needs, so a long list becomes several pages instead of a scroll. Previous and Next walk through every page of
// the section in order, and so does a swipe. Which page you are on is kept in `state` ({ group, page }) across redraws.
import { h, announce, dialog } from './dom.js';
import { isCompact } from './compact.js';
import { reducedMotion, app } from './app.js';
import { pack } from './pack.js';
export { pack };

const GAP = 10;
// what a group is made of, for packing: each block, or each row of a table
function unitsOf(el) {
  const out = [];
  // a block that is a table, or marked data-split, is separate units that can go on different pages; a unit that is itself marked
  // data-split splits again (a list inside a card), so `parents` is every wrapper that has to hide when none of its units show
  const add = (b, parents) => {
    const rows = b.classList.contains('table-wrap') ? [...b.querySelectorAll('tbody > tr')] : b.hasAttribute('data-split') ? [...b.children] : [];
    if (!rows.length) { out.push({ el: b, parents, parent: parents[parents.length - 1] }); return; }
    for (const r of rows) add(r, parents.concat(b));
  };
  for (const b of el.querySelectorAll(':scope > .pg-body > *')) add(b, []);
  return out;
}
const marginBottom = el => parseFloat(getComputedStyle(el).marginBottom) || 0;

let uidN = 0;
export function pager({ title, groups, state, name = 'Pages' }) {
  const uid = 'pg' + (++uidN), keys = groups.map(g => g.key);
  if (!keys.includes(state.group)) { state.group = keys[0]; state.page = 0; }
  state.page = Number.isInteger(state.page) && state.page >= 0 ? state.page : 0;
  const layout = { pages: {}, avail: {}, heights: {} };       // group key -> [[unit indexes], ...] once measured
  const els = {};
  const tabs = h('div', { class: 'pager-tabs' + (groups.length > 5 ? ' many' : ''), role: 'tablist', 'aria-label': name },
    groups.map(g => h('button', { type: 'button', role: 'tab', 'data-key': 'pg-' + g.key, 'aria-controls': uid + '-view', id: uid + '-tab-' + g.key,
      onclick: () => select(g.key), onkeydown: e => tabKey(e, g.key) }, g.label, g.badge ? h('span', { class: 'badge' }, g.badge) : null)));
  const view = h('div', { class: 'pager-view pending', id: uid + '-view', role: 'tabpanel' },
    groups.map(g => { const el = h('section', { class: 'pg-group', 'data-group': g.key, 'aria-label': g.label }, g.header ? h('div', { class: 'pg-head' }, g.header) : null, h('div', { class: 'pg-body' }, g.blocks)); els[g.key] = el; return el; }));
  const count = h('span', { class: 'pager-count num', 'aria-hidden': 'true' });
  const prev = h('button', { type: 'button', class: 'pager-btn', 'data-key': 'pg-prev', onclick: () => move(-1) }, h('span', { 'aria-hidden': 'true' }, '‹ '), 'Previous');
  const next = h('button', { type: 'button', class: 'pager-btn', 'data-key': 'pg-next', onclick: () => move(1) }, 'Next', h('span', { 'aria-hidden': 'true' }, ' ›'));
  const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  const bar = h('div', { class: 'pager-bar' }, prev, count, next);
  const root = h('div', { class: 'pager' + (groups.length > 5 ? ' many' : '') + (groups.length === 1 ? ' solo' : '') }, title ? h('h1', { class: 'sr-only' }, title) : null, tabs, h('div', { class: 'pager-main' }, view, bar), live);

  const pagesOf = k => layout.pages[k] || [[]];
  const linear = () => keys.flatMap(k => pagesOf(k).map((_, p) => [k, p]));
  function tabKey(e, k) {
    const i = keys.indexOf(k), d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (d) { e.preventDefault(); select(keys[(i + d + keys.length) % keys.length], true); }
    else if (e.key === 'Home') { e.preventDefault(); select(keys[0], true); }
    else if (e.key === 'End') { e.preventDefault(); select(keys[keys.length - 1], true); }
  }
  function select(k, focusTab = false) { state.group = k; state.page = 0; show(true); if (focusTab) document.getElementById(uid + '-tab-' + k)?.focus(); }
  function move(d, fromSwipe = false) {
    const all = linear(), i = all.findIndex(([k, p]) => k === state.group && p === state.page), j = Math.min(all.length - 1, Math.max(0, i + d));
    if (j === i) return;
    state.group = all[j][0]; state.page = all[j][1]; show(true, d);
  }
  // show the current page: its units visible, the rest hidden, and the controls brought up to date
  function show(said, dir = 0) {
    const g = groups.find(x => x.key === state.group), pages = pagesOf(g.key); state.page = Math.min(state.page, pages.length - 1);
    for (const k of keys) els[k].hidden = k !== g.key;
    const el = els[g.key], units = unitsOf(el), vis = new Set(pages[state.page] || []);
    units.forEach((u, i) => { u.el.hidden = !vis.has(i); });
    for (const b of new Set(units.flatMap(u => u.parents))) b.hidden = !units.some((u, i) => u.parents.includes(b) && vis.has(i));
    for (const b of tabs.children) { const on = b.id === uid + '-tab-' + g.key; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && said) b.scrollIntoView?.({ inline: 'center', block: 'nearest' }); }
    const all = linear(), i = all.findIndex(([k, p]) => k === state.group && p === state.page);
    prev.disabled = i <= 0; next.disabled = i >= all.length - 1;
    count.textContent = pages.length > 1 ? `${state.page + 1} of ${pages.length}` : '';   // where you are in a long group; a short one has nothing to count
    count.hidden = !count.textContent; bar.classList.toggle('single', all.length < 2);
    if (dir && !reducedMotion()) { el.classList.remove('slide-l', 'slide-r'); void el.offsetWidth; el.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
    if (said) { live.textContent = ''; setTimeout(() => { live.textContent = `${g.label}${pages.length > 1 ? `, page ${state.page + 1} of ${pages.length}` : ''}`; }, 30); }
  }
  // measure every group and pack its units into pages; runs when the pager is on the screen and whenever its size changes
  function relayout() {
    if (!root.isConnected) return;
    view.classList.remove('pending');
    const keep = { group: state.group, page: state.page };
    for (const g of groups) {
      const el = els[g.key]; el.hidden = false; el.style.visibility = 'hidden'; el.classList.add('measuring');
      for (const u of unitsOf(el)) u.el.hidden = false;
      for (const u of unitsOf(el)) for (const b of u.parents) b.hidden = false;
      const head = el.querySelector(':scope > .pg-head'), body = el.querySelector(':scope > .pg-body'), cs = getComputedStyle(el);
      const avail = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - (head ? head.offsetHeight + GAP : 0);
      el.style.setProperty('--pg-avail', Math.round(avail) + 'px');   // a block that fills a page (a map) takes its height from this
      const units = unitsOf(el), hs = units.map(u => u.el.getBoundingClientRect().height + (marginBottom(u.el) || (u.parent ? 0 : 0)));
      const pages = pack(hs, avail);
      layout.pages[g.key] = pages; layout.avail[g.key] = Math.round(avail); layout.heights[g.key] = hs.map(Math.round); el.dataset.pages = pages.length;
      el.classList.toggle('overflowing', hs.some(x => x > avail + 0.5));
      el.classList.remove('measuring'); el.style.visibility = '';
    }
    state.group = keep.group; state.page = keep.page; show(false);
  }
  // swipe: a mostly horizontal drag of 50 px or more, from a finger or a pen
  let sx = null, sy = 0;
  view.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' || e.target.closest?.('input, select, textarea, [role=slider], .stepper-slider')) { sx = null; return; } sx = e.clientX; sy = e.clientY; });
  view.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1, true); });
  view.addEventListener('pointercancel', () => { sx = null; });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => relayout()) : null;
  root.__layout = relayout; root.__observe = () => ro?.observe(view);
  root.pagerState = () => ({ group: state.group, page: state.page, pages: { ...layout.pages }, avail: { ...layout.avail }, heights: { ...layout.heights }, overflow: groups.filter(g => els[g.key].classList.contains('overflowing')).map(g => g.key) });
  root.pagerMove = move; root.pagerSelect = select;
  return root;
}
// called by the app after every render, before focus is put back: measure the pagers now on the page
export function layoutPagers(scope = document) { for (const p of scope.querySelectorAll('.pager')) { p.__layout?.(); p.__observe?.(); } }

// where a section keeps its group and page, so a redraw does not send it back to the first page
export const pagerState = name => (app.viewState['pager-' + name] ||= {});

// a dialog whose pages fit: on a phone the body is a pager inside a sheet of fixed height; elsewhere the plain body
export function pagedDialog(title, groups, actions, desktopBody, opts = {}) {
  if (!isCompact()) return dialog(title, desktopBody(), actions, opts);
  const pg = pager({ title, groups, state: {}, name: title });
  return dialog(title, h('div', { class: 'dlg-pager' }, pg), actions, { ...opts, cls: ((opts.cls || '') + ' paged').trim() });
}
