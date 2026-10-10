import { h, table, kv, kvParts, announce, confirmBox, field, pill, dialog, meter } from '../dom.js';
import { app, go, render as rerender, act } from '../app.js';
import * as G from '../../sim/game.js';
import { ITEMS, RECIPES, ITEM_ID, ECONOMY } from '../../gen/data.js';
import { GRID_W, GRID_H, lotDistance } from '../../sim/world.js';
import { money, money2, num, moneyShort } from '../../core/util.js';
import { buildingSprite } from '../iso.js';
import { pager, pagerState, pagedDialog } from '../pager.js';
import { isCompact } from '../compact.js';
import { makeView, drawScene } from '../topdown.js';
import { fmtDate } from '../../core/util.js';
import { objectLabel } from '../../sim/floor.js';
import { sfx } from '../sound.js';

// the market panel opens on the quick-start product, a component most towns trade in
const vs = () => (app.viewState.city ||= { sel: null, item: ITEM_ID[ECONOMY.quickStart.product], showP: true, showC: true });

function lotLabel(st, l) {
  const city = st.city;
  if (st.lotId === l.id) return `${l.addr}: your plant, ${num(l.sqft)} square feet`;
  if (st.move?.lotId === l.id) return `${l.addr}: your new plant, under construction, ${Math.round(G.moveProgress(st) * 100)}% done`;
  if (l.firm != null) { const f = city.firms[l.firm]; return `${l.addr}: ${f.name}, ${f.kind === 'vendor' ? 'materials vendor' : 'makes ' + ITEMS[RECIPES[f.recipe].out].name}`; }
  return `${l.addr}: for rent, ${num(l.sqft)} square feet, ${money(l.rent)} a month`;
}
const darkTheme = () => { const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); const n = parseInt(bg.slice(1), 16); return ((n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11) < 110; };
function glyph(l, kind) {
  const bucket = l.sqft < 30000 ? 0 : l.sqft < 60000 ? 1 : 2;
  return h('img', { src: buildingSprite(kind, bucket, l.id * 7 + (l.firm || 0), darkTheme()), alt: '', width: 36, height: 34, style: { imageRendering: 'pixelated', pointerEvents: 'none' } });
}

function glyphBuild(l, st) {
  const bucket = l.sqft < 30000 ? 0 : l.sqft < 60000 ? 1 : 2;
  return h('img', { src: buildingSprite('build', bucket, Math.min(3, Math.floor(G.moveProgress(st) * 4)), darkTheme()), alt: '', width: 36, height: 34, style: { imageRendering: 'pixelated', pointerEvents: 'none' } });
}
export const paged = true;
export function render() {
  const st = app.st, city = st.city, v = vs(), compact = isCompact();
  const playing = st.phase === 'play';
  if (v.sel == null) v.sel = playing ? st.lotId : city.lots.find(l => l.firm == null).id;
  const itemId = v.item;
  const producerFirms = new Set(city.firms.filter(f => f.alive && (f.kind === 'vendor' ? f.sells.includes(itemId) : RECIPES[f.recipe].out === itemId)).map(f => f.id));
  const consumerFirms = new Set(city.firms.filter(f => f.alive && f.kind === 'maker' && RECIPES[f.recipe].inputs.some(([i]) => i === itemId)).map(f => f.id));

  const grid = h('div', { class: 'city-grid', role: 'grid', 'aria-label': `City map of ${city.name}, ${GRID_W} columns by ${GRID_H} rows. Use arrow keys to move between buildings.`, style: { gridTemplateColumns: `repeat(${GRID_W}, 40px)` } });
  for (let y = 0; y < GRID_H; y++) {
    const row = h('div', { role: 'row', style: { display: 'contents' } });
    for (let x = 0; x < GRID_W; x++) {
      const l = city.lots[y * GRID_W + x];
      const mine = st.lotId === l.id, firm = l.firm != null ? city.firms[l.firm] : null, building = st.move?.lotId === l.id;
      const isP = firm && producerFirms.has(firm.id) && v.showP, isC = firm && consumerFirms.has(firm.id) && v.showC;
      const cls = ['lot', mine ? 'mine' : firm ? 'firm' : 'vacant', l.id === v.sel ? 'sel' : '', isP ? 'prod' : '', isC ? 'cons' : ''].join(' ');
      const extra = [isP ? 'sells ' + ITEMS[itemId].name : '', isC ? 'buys ' + ITEMS[itemId].name : ''].filter(Boolean).join(', ');
      row.append(h('div', { role: 'gridcell' }, h('button', { type: 'button', class: cls, tabindex: l.id === v.sel ? 0 : -1, 'data-key': 'lot-' + l.id, 'data-lot': l.id,
        'aria-label': lotLabel(st, l) + (extra ? `. ${extra}` : ''), 'aria-pressed': String(l.id === v.sel),
        onclick: () => { v.sel = l.id; if (compact) { const ps = pagerState('city'); ps.group = 'lot'; ps.page = 0; } rerender({}); } }, (building ? glyphBuild(l, st) : glyph(l, mine ? 'mine' : firm ? 'firm' : 'vacant')), h('span', { class: 'mark', 'aria-hidden': 'true' }))));
    }
    grid.append(row);
  }
  grid.addEventListener('keydown', e => {
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: GRID_W, ArrowUp: -GRID_W, Home: -(v.sel % GRID_W), End: GRID_W - 1 - (v.sel % GRID_W) }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const n = v.sel + d; if (n < 0 || n >= city.lots.length) return;
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && Math.floor(n / GRID_W) !== Math.floor(v.sel / GRID_W)) return;
    const prev = grid.querySelector(`[data-lot="${v.sel}"]`), next = grid.querySelector(`[data-lot="${n}"]`);
    prev.tabIndex = -1; next.tabIndex = 0; next.focus(); v.sel = n;
    prev.classList.remove('sel'); next.classList.add('sel'); prev.setAttribute('aria-pressed', 'false'); next.setAttribute('aria-pressed', 'true');
    const panel = document.getElementById('lot-panel'); if (panel) panel.replaceWith(lotPanel(st, city.lots[n]));
  });

  const legend = h('div', { class: 'legend' },
    h('span', null, h('i', { style: { boxShadow: 'inset 0 0 0 3px var(--accent)' } }), 'Your plant (flag on the roof)'),
    h('span', null, h('i', { style: { background: 'var(--lot-ground)' } }), 'Occupied'),
    h('span', null, h('i', { style: { background: 'var(--lot-vacant)', outline: '1.5px dashed var(--hazard)' } }), 'For rent (sign on the lot)'),
    h('span', null, h('i', { style: { boxShadow: 'inset 0 0 0 2px var(--info)' } }), 'P sells, C buys the selected product'));

  if (compact) {
    // a phone: the map is a pane that pans inside its page; the chosen building, the market and the ranks are pages of their own
    const ps = pagerState('city'), inner = n => [...n.children].filter(c => c.tagName !== 'H2');
    const scroller = h('div', { class: 'city-scroll', role: 'region', 'aria-label': `Map of ${city.name}` }, grid);
    setTimeout(() => { const b = scroller.querySelector(`[data-lot="${v.sel}"]`); if (b && scroller.isConnected) { scroller.scrollLeft = b.offsetLeft - scroller.clientWidth / 2 + 22; scroller.scrollTop = b.offsetTop - scroller.clientHeight / 2 + 22; } }, 0);
    const lot = lotPanel(st, city.lots[v.sel]), mkt = marketPanel(st, v, producerFirms, consumerFirms);
    return pager({ title: playing ? city.name : `Lease a building in ${city.name}`, name: 'City pages', state: ps, groups: [
      { key: 'map', label: 'Map', blocks: [h('div', { class: 'city-pane' }, scroller, legend)] },
      { key: 'lot', label: 'Building', blocks: [h('h2', { class: 'pg-h2' }, city.lots[v.sel].addr), ...inner(lot)] },
      { key: 'market', label: 'Market', blocks: inner(mkt) },
      ...(playing ? [{ key: 'ranks', label: 'Ranks', blocks: inner(ranksCard(st)) }] : [])] });
  }
  return h('div', { class: 'stack' },
    h('div', { class: 'view-head' }, h('div', null, h('h1', null, playing ? `${city.name}` : `Lease a building in ${city.name}`),
      h('p', null, playing ? 'The industrial district: your suppliers, customers and competitors.' : 'Grey dashed buildings are for rent. Pick one near the producers and buyers of what you plan to make. A building of 25,000 to 40,000 square feet is plenty to start.')),
      !playing ? h('button', { type: 'button', onclick: () => go('nation') }, 'Back to the map') : null),
    h('div', { class: 'grid2 split-city' },
      h('div', { class: 'stack' }, h('div', { class: 'table-wrap' }, grid), legend),
      h('div', { class: 'stack' }, lotPanel(st, city.lots[v.sel]), marketPanel(st, v, producerFirms, consumerFirms))),
    playing ? ranksCard(st) : null);
}

function lotPanel(st, l) {
  const city = st.city, playing = st.phase === 'play';
  const firm = l.firm != null ? city.firms[l.firm] : null, mine = st.lotId === l.id;
  const rents = city.lots.map(x => x.rentPsf).sort((a, b) => a - b);
  const body = [];
  if (mine) body.push(h('p', null, h('strong', null, 'Your plant. '), `${num(l.sqft)} sq ft at ${money(l.rent)} a month.`));
  else if (firm) {
    body.push(h('p', null, h('strong', null, firm.name), firm.kind === 'vendor' ? ` sells raw materials: ${firm.sells.map(i => ITEMS[i].name).join(', ')}.` : ` makes ${ITEMS[RECIPES[firm.recipe].out].name} from ${RECIPES[firm.recipe].inputs.map(([i]) => ITEMS[i].name).join(', ')}.`));
    body.push(kv([['Net worth', `${moneyShort(firm.netWorth)} (${'$'.repeat(Math.max(1, Math.min(10, Math.round(firm.netWorth / 100000))))})`], st.lotId != null ? ['Delivery distance', `${lotDistance(city, l.id, st.lotId)} blocks`] : null]));
    if (playing) body.push(h('button', { type: 'button', onclick: async () => { if (await confirmBox('Buy a market intelligence brief?', `Pay ${money(ECONOMY.briefFee)} for a profile of ${firm.name}?`, `Pay ${money(ECONOMY.briefFee)}`)) act(G.buyBrief(st, firm.id), false, 'cash'); } }, `Buy a brief (${money(ECONOMY.briefFee)})`));
  } else {
    body.push(h('p', null, h('strong', null, 'For rent. '), `${num(l.sqft)} sq ft, ${money(l.rent)} a month ($${l.rentPsf.toFixed(2)} per sq ft).`));
    body.push(h('p', { class: 'muted' }, `City rents run $${rents[0].toFixed(2)} low, $${(rents.reduce((s, x) => s + x, 0) / rents.length).toFixed(2)} average, $${rents[rents.length - 1].toFixed(2)} high per sq ft.`));
    if (playing && st.move?.lotId === l.id) {
      const p = G.moveProgress(st);
      body.push(h('p', null, h('strong', null, 'Your new plant is being built. '), `${Math.round(p * 100)}% done, ready about ${fmtDate(st.move.end)}. The current plant keeps running until then.`), meter(p, 'Construction progress'),
        h('button', { type: 'button', 'data-key': 'watch-build', onclick: () => { (app.viewState.floor ||= {}).site = 'new'; go('floor'); } }, 'Watch it being built'));
    } else if (playing && st.move) body.push(h('p', { class: 'muted' }, 'A move is already under way.'));
    else if (playing) {
      const cur = city.lots[st.lotId];
      body.push(h('p', null, l.sqft > cur.sqft ? `${Math.round((l.sqft / cur.sqft - 1) * 100)}% more floor space than your plant.` : l.sqft < cur.sqft ? `Smaller than your plant by ${Math.round((1 - l.sqft / cur.sqft) * 100)}%.` : 'The same size as your plant.'),
        h('button', { class: 'primary', type: 'button', 'data-key': 'move-here', onclick: () => moveDialog(st, l) }, 'Move the factory here…'));
    }
    if (!playing) body.push(h('button', { class: 'primary', type: 'button', 'data-key': 'lease', onclick: async () => {
      if (!(await confirmBox('Sign the lease?', `Lease ${l.addr} for ${money(l.rent)} a month? The first month is due today.`, 'Sign lease'))) return;
      const r = G.rentBuilding(st, l.id); if (r.ok) { sfx('cash'); announce(`Lease signed. Welcome to ${l.addr}.`); go('floor'); } else act(r);
    } }, 'Lease this building'));
  }
  return h('section', { class: 'card stack', id: 'lot-panel', 'aria-live': 'off' }, h('h2', null, l.addr), body);
}

// Show the plan for moving: a picture of the copied layout, what it costs, how long it takes, what gets left behind
async function moveDialog(st, l) {
  const plan = G.planMove(st, l.id), cur = st.city.lots[st.lotId];
  const cv = h('canvas', { class: 'move-preview', 'aria-hidden': 'true' });
  const left = plan.dropped?.map(id => st.floor.objects.find(o => o.id === id)).filter(Boolean) || [];
  const belts = left.filter(o => o.kind === 'conveyor').length, others = left.filter(o => o.kind !== 'conveyor');
  const figure = plan.floor ? h('figure', { class: 'move-fig' }, cv, h('figcaption', { class: 'muted' }, `How your plant would be laid out at ${l.addr}: ${plan.floor.w} × ${plan.floor.h} squares, against ${st.floor.w} × ${st.floor.h} now. The layout keeps its place relative to the shipping dock.`)) : null;
  const factPairs = [
      ['Floor space', `${num(cur.sqft)} → ${num(l.sqft)} sq ft`],
      ['Rent', `${money(cur.rent)} → ${money(l.rent)} a month (${l.rent >= cur.rent ? '+' : '−'}${money(Math.abs(l.rent - cur.rent))})`],
      plan.cost != null ? ['Due today', `${money(plan.cost + l.rent)}: moving ${money(plan.cost)} and the first month's rent`] : null,
      plan.days ? ['Building and moving', `About ${plan.days} days. The current plant keeps running until then, and you pay rent on both.`] : null,
      plan.moved ? ['Coming along', `${plan.moved.length} items${plan.shifted.length ? `, ${plan.shifted.length} moved to a nearby spot because the new building's rooms are in the way` : ''}`] : null,
      left.length ? ['Left behind and sold', [others.map(o => objectLabel(st, o)).join(', '), belts ? `${others.length ? ', ' : ''}${belts} belt sections` : ''].join('')] : null];
  const alertP = !plan.ok ? h('p', { class: 'sup-alert', role: 'alert' }, plan.msg) : null;
  if (plan.floor) drawPlan(cv, plan.floor);
  const go2 = await pagedDialog(`Move to ${l.addr}?`, [{ key: 'plan', label: 'Plan', blocks: [figure, ...kvParts(factPairs, 3), alertP].filter(Boolean) }], plan.ok ? [{ label: 'Cancel', value: false }, { label: `Move here (${money(plan.cost + l.rent)})`, value: true, primary: true }] : [{ label: 'Close', value: false, primary: true }],
    () => h('div', { class: 'stack' }, figure, kv(factPairs), alertP), { wide: true });
  if (!go2) return;
  const r = G.startMove(st, l.id);
  act(r, false, 'cash');
  if (r.ok) { (app.viewState.floor ||= {}).site = 'new'; go('floor'); }
}
// draw the planned layout into the dialog once it is in the document
export function drawPlan(cv, fl) {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  const C = { floor: g('--floor'), panel: g('--panel'), focus: g('--focus'), dark: false };
  const v = makeView(fl, 1), lo = document.createElement('canvas'); lo.width = v.W; lo.height = v.H;
  drawScene(lo.getContext('2d'), v, { floor: fl }, { C, t: 0, anim: false, pallets: 0, workers: [] });
  const S = Math.max(1, Math.min(3, Math.floor(820 / v.W))); cv.width = v.W * S; cv.height = v.H * S;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(lo, 0, 0, cv.width, cv.height);
}

function marketPanel(st, v, P, C) {
  const city = st.city, m = city.market[v.item], it = ITEMS[v.item];
  const sel = h('select', { id: 'mkt-item', onchange: e => { v.item = +e.target.value; rerender({}); } },
    ['material', 'component', 'product'].map(t => h('optgroup', { label: t === 'material' ? 'Raw materials' : t === 'component' ? 'Components' : 'Finished goods' },
      ITEMS.filter(i => i.tier === t).map(i => h('option', { value: i.id, selected: i.id === v.item }, i.name)))));
  const recipe = RECIPES.find(r => r.out === v.item);
  const usedIn = RECIPES.filter(r => r.inputs.some(([i]) => i === v.item)).map(r => ITEMS[r.out].name);
  return h('section', { class: 'card stack', 'aria-labelledby': 'mkt-h' }, h('h2', { id: 'mkt-h' }, 'Product market'),
    field('Product', sel),
    kv([['Price per unit', `${money2(m.low)} low · ${money2(m.price)} avg · ${money2(m.high)} high`], ['Units per box', num(it.pack)],
      ['Monthly supply', num(m.supply) + ' units'], ['Monthly demand', num(m.demand) + ' units'], ['Producers in town', `${P.size}`], ['Buyers in town', `${C.size}${it.tier === 'product' ? ' plus households' : ''}`]]),
    recipe ? h('p', null, h('strong', null, 'Made from: '), recipe.inputs.map(([i, q]) => `${q} × ${ITEMS[i].name}`).join(', '), recipe.start ? '' : ' (needs research)') : h('p', null, 'A raw material, bought from vendors.'),
    usedIn.length ? h('p', null, h('strong', null, 'Used in: '), usedIn.slice(0, 8).join(', '), usedIn.length > 8 ? ` and ${usedIn.length - 8} more` : '') : null,
    h('div', { class: 'row' },
      h('input', { type: 'checkbox', id: 'mkt-p', checked: v.showP, onchange: e => { v.showP = e.target.checked; rerender({}); } }), h('label', { for: 'mkt-p' }, 'Mark producers (P)'),
      h('input', { type: 'checkbox', id: 'mkt-c', checked: v.showC, onchange: e => { v.showC = e.target.checked; rerender({}); } }), h('label', { for: 'mkt-c' }, 'Mark buyers (C)')));
}

function ranksCard(st) {
  const rows = G.cityRanks(st).map((r, i) => ({ ...r, rank: i + 1 }));
  const me = rows.find(r => r.you);
  return h('section', { class: 'card stack' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h2', null, 'City ranks'),
    h('button', { type: 'button', onclick: async () => { if (await confirmBox('Call in a business advisor?', `An advisor will look over the whole business for ${money(ECONOMY.advisorFee)}.`, `Pay ${money(ECONOMY.advisorFee)}`)) act(G.hireAdvisor(st)); } }, `Business advisor (${money(ECONOMY.advisorFee)})`)),
    h('p', null, `You rank ${me.rank} of ${rows.length} companies in ${st.city.name} by net worth.`),
    table('Top companies by net worth', [{ key: 'rank', label: 'Rank', num: true }, { key: 'name', label: 'Company' }, { key: 'nw', label: 'Net worth', num: true, render: r => money(r.nw) }],
      rows.filter(r => r.rank <= 10 || r.you), { rowClass: r => r.you ? 'you' : '', rowHeader: false }));
}
