import { h, table, kv, announce } from '../dom.js';
import { app, go, render as rerender } from '../app.js';
import * as G from '../../sim/game.js';
import { CITIES, ITEMS, US_NATION_PATH, US_BORDER_PATH } from '../../gen/data.js';
import { cityStats, generateCity, bestMarkets } from '../../sim/world.js';
import { money, num, hashSeed } from '../../core/util.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs, ...kids) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v); for (const k of kids) if (k) el.append(k); return el; };
const preview = new Map();
function previewCity(id) {
  const st = app.st; const key = st.seed + ':' + id;
  if (!preview.has(key)) { const tmp = { rng: (st.seed ^ hashSeed('city' + id)) >>> 0, setup: st.setup }; preview.set(key, generateCity(tmp, id)); }
  return preview.get(key);
}
const vs = () => (app.viewState.nation ||= { sel: app.st?.cityId ?? 0, sort: { key: 'metro', dir: -1 } });

export function render() {
  const st = app.st; const v = vs();
  const playing = st && st.phase === 'play';
  const wrap = h('div', { class: 'stack nation' });
  wrap.append(h('div', { class: 'view-head' }, h('div', null, h('h1', null, playing ? 'The nation' : 'Choose a city'),
    h('p', null, playing ? `Your plant is in ${st.city.name}. Compare it with other markets.` : 'Bigger cities have more customers and a more experienced workforce, but higher rent and wages.'))));
  const svg = s('svg', { viewBox: '0 0 975 610', role: 'group', 'aria-label': 'Map of the United States. Each city is a button.' });
  svg.append(s('path', { d: US_NATION_PATH, fill: 'var(--panel-2)', stroke: 'var(--muted)', 'stroke-width': 1.2 }), s('path', { d: US_BORDER_PATH, fill: 'none', stroke: 'var(--line)', 'stroke-width': 0.8 }));
  for (const c of CITIES) {
    const r = 3.5 + Math.sqrt(c.metro) / 280;
    const sel = c.id === v.sel, mine = st?.cityId === c.id && playing;
    const g = s('g', { class: 'city-dot', tabindex: 0, role: 'button', 'aria-pressed': String(sel), 'aria-label': `${c.name}, metro population ${num(c.metro)}${mine ? ', your plant' : ''}`, 'data-key': 'city-' + c.id },
      s('circle', { cx: c.x, cy: c.y, r, fill: mine ? 'var(--accent)' : sel ? 'var(--hazard)' : 'var(--ink)', 'fill-opacity': sel || mine ? 1 : 0.72, stroke: 'var(--panel)', 'stroke-width': 1.5 }),
      sel || mine || c.metro > 4e6 ? s('text', { x: c.x + r + 4, y: c.y + 4, 'font-size': 13, 'font-weight': 700, fill: 'var(--ink)', 'paint-order': 'stroke', stroke: 'var(--panel-2)', 'stroke-width': 3, style: 'font-family: var(--font-body)' }, document.createTextNode(c.name)) : null);
    const pickIt = () => { v.sel = c.id; rerender({}); document.getElementById('city-info-h')?.focus(); };
    g.addEventListener('click', pickIt);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickIt(); } });
    svg.append(g);
  }
  wrap.append(h('div', { class: 'grid2 split-nation' },
    h('div', { class: 'card', style: { padding: '8px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '10px' } }, svg),
    infoCard(v.sel, playing)));
  const rows = CITIES.map(c => ({ ...c, ...cityStats(c.id) }));
  wrap.append(h('section', { class: 'card' }, h('h2', null, 'Compare cities'),
    table(`All ${CITIES.length} cities`, [
      { key: 'name', label: 'City' },
      { key: 'metro', label: 'Metro population', num: true, render: r => num(r.metro) },
      { key: 'avgRent', label: 'Rent / sq ft', num: true, render: r => '$' + r.avgRent.toFixed(2) },
      { key: 'avgSalary', label: 'Avg salary', num: true, render: r => money(r.avgSalary) },
      { key: 'experience', label: 'Experience', num: true, render: r => r.experience + ' mo' },
      { key: 'go', label: '', sortable: false, render: r => h('button', { type: 'button', 'data-key': 'see-' + r.id, onclick: () => { v.sel = r.id; rerender({}); document.getElementById('city-info-h')?.focus(); } }, 'Details') }],
    rows, { sortState: v.sort, onSort: so => { v.sort = so; rerender({}); }, scrollable: true, hideCaption: true })));
  return wrap;
}

function infoCard(id, playing) {
  const c = CITIES[id], cs = cityStats(id);
  const city = previewCity(id);
  const bm = bestMarkets(city, 5);
  const vacant = city.lots.filter(l => l.firm == null);
  return h('section', { class: 'card stack', 'aria-labelledby': 'city-info-h' },
    h('h2', { id: 'city-info-h', tabindex: -1 }, c.name),
    kv([['Metro population', num(c.metro)], ['City population', num(c.pop)], ['Average rent', `$${cs.avgRent.toFixed(2)} / sq ft / month`], ['Average salary', money(cs.avgSalary)], ['Workforce experience', `${cs.experience} months`], ['Companies in town', num(city.firms.length)], ['Buildings for rent', num(vacant.length)]]),
    h('div', null, h('h3', null, 'Least crowded markets'), h('ul', null, bm.map(i => h('li', null, ITEMS[i].name)))),
    playing ? (app.st.cityId === id ? h('p', { class: 'muted' }, 'Your plant is here.') : h('p', { class: 'muted' }, 'Your plant is already established elsewhere.'))
      : h('button', { class: 'primary', type: 'button', 'data-key': 'visit', onclick: () => { G.visitCity(app.st, id); announce(`Visiting ${c.name}. Choose a building to lease.`); go('city'); } }, `Visit ${c.name}`));
}
