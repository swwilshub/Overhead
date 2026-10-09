import { h, table, kv, kvParts, announce, dialog, confirmBox, pill, meter, field, prefs, stepper } from '../dom.js';
import { pager, pagerState, pagedDialog } from '../pager.js';
import { app, go, render as rerender, act, applyPrefs, NAV, isCompact } from '../app.js';
import * as G from '../../sim/game.js';
import { ITEMS, RECIPES, FAMILIES, ECONOMY } from '../../gen/data.js';
import { JOBS, hasRole, jobFor, aOrAn } from '../../core/content.js';
import { vendorsFor, unitsPerHour, WORKDAYS_PER_MONTH } from '../../sim/world.js';
import { storageCapacity, isProducer, objectLabel } from '../../sim/floor.js';
import { TECHS, CELL_ITEMS } from '../../sim/cells.js';
import { money, money2, num, pct, fmtDate, fmtShortDate, monthLabel, moneyShort, EPOCH } from '../../core/util.js';
import { saveGame, listSaves, exportFile, submitScore } from '../storage.js';
import { barChart, hBars, sparkline, SERIES } from '../charts.js';
import { sfx } from '../sound.js';
import { updateAmbience } from '../app.js';
const SOUND_BOARD = [['place', 'Place equipment'], ['cash', 'Sale or payment'], ['order', 'Order placed'], ['delivery', 'Delivery arrives'], ['ship', 'Shipment leaves'], ['payday', 'Payday'], ['memo', 'New memo'], ['alert', 'Urgent memo'], ['breakdown', 'Machine breaks down'], ['repair', 'Repair finished'], ['hire', 'New hire'], ['research', 'Research breakthrough'], ['fanfare', 'First sale'], ['accident', 'Accident'], ['whistle', 'Strike'], ['bell', 'Month end'], ['start', 'Clock starts'], ['stop', 'Clock stops'], ['error', 'Not allowed']];

// ================= Purchasing
export const purchasing = {
  live: true,
  render() {
    const st = app.st;
    const targets = Object.keys(st.targets).length ? st.targets : G.suggestedTargets(st);
    const used = [...G.ownInputs(st)];
    const extra = Object.keys(st.inventory).map(Number).filter(i => !used.includes(i) && ITEMS[i].tier !== 'product');
    const ids = [...new Set([...used, ...Object.keys(targets).map(Number), ...extra])];
    const cap = storageCapacity(st.floor), stored = G.boxesStored(st);
    const staffed = st.employees.some(e => hasRole(e, 'purchasing'));
    const rows = ids.map(id => ({ id, name: ITEMS[id].name, boxes: G.boxesOf(st, id), units: st.inventory[id] || 0, onOrder: G.onOrderBoxes(st, id), target: targets[id] ?? 0, use: G.dailyUse(st, id), best: G.bestVendor(st, id) }));
    const anyItem = h('select', { id: 'buy-any' }, ['material', 'component', 'product'].map(t => h('optgroup', { label: t === 'material' ? 'Raw materials' : t === 'component' ? 'Components' : 'Finished goods' }, ITEMS.filter(i => i.tier === t).map(i => h('option', { value: i.id }, i.name)))));
    const intro = staffed ? 'Purchasing staff reorder stock up to the targets below every morning.' : `Nobody does the buying, so stock only gets reordered when you do it. ${aOrAn(jobFor('purchasing').title, true)} would handle it every morning.`;
    const buttons = h('div', { class: 'row' }, h('button', { type: 'button', 'data-key': 'pur-suggest', onclick: () => { st.targets = G.suggestedTargets(st); act({ ok: true, msg: 'Targets set to about three days of use.' }); } }, 'Suggest targets'),
      // focus stays on the button, so the polite message is the only sign it worked, whether or not anything was ordered
      h('button', { class: 'primary', type: 'button', 'data-key': 'pur-all', onclick: () => { const r = G.purchaseAll(st); announce(r.msg, r.ok || r.msg === 'Stock is already at target levels.' ? 'polite' : 'assertive'); act(r, true, 'order'); } }, 'Purchase all to target'));
    const summary = kv([['Storage', `${num(stored)} of ${num(cap)} boxes (${pct(stored / cap)})`], ['On order', `${num(G.allOnOrder(st))} boxes`], ['Room left for orders', `${num(G.roomForOrders(st))} boxes (15% is held back for finished goods)`]]);
    const stockTable = table('Materials and components', [
          { key: 'name', label: 'Item' },
          { key: 'boxes', label: 'In stock', num: true, render: r => `${num(r.boxes)} boxes` },
          { key: 'onOrder', label: 'On order', num: true, render: r => num(r.onOrder), phone: false },
          { key: 'use', label: 'Use per day', num: true, render: r => `${num(r.use / ITEMS[r.id].pack)} boxes` },
          { key: 'target', label: 'Target (boxes)', num: true, sortable: false, render: r => stepper({ compact: true, label: `Target stock for ${r.name}, in boxes`, value: r.target, min: 0, max: 9999, step: 1, big: 10, key: 'tgt-' + r.id, format: n => String(n),
            onChange: n => { st.targets = { ...(Object.keys(st.targets).length ? st.targets : G.suggestedTargets(st)), [r.id]: n }; }, onSettle: () => rerender({}) }) },
          { key: 'best', label: 'Best offer', num: true, render: r => r.best ? `${money2(r.best.boxPrice)}/box` : 'Sold out' },
          { key: 'buy', label: '', sortable: false, render: r => h('button', { type: 'button', 'data-key': 'buy-' + r.id, onclick: () => buyDialog(r.id) }, 'Buy…') }],
        rows, { hideCaption: true, empty: 'No machines need materials yet.', noMenu: true });
    const ordersTable = table('Orders in transit', [
          { key: 'item', label: 'Item', render: o => ITEMS[o.item].name }, { key: 'vendor', label: 'Vendor' }, { key: 'boxes', label: 'Boxes', num: true },
          { key: 'cost', label: 'Cost', num: true, render: o => money(o.boxes * o.boxPrice), sort: o => o.boxes * o.boxPrice },
          { key: 'eta', label: 'Arrives', render: o => fmtDate(o.eta) }, { key: 'auto', label: 'Placed by', render: o => o.auto ? 'Purchasing' : 'You' }],
        st.orders, { hideCaption: true, empty: 'Nothing on order.', defaultSort: 'eta', noMenu: true });
    const buyRow = () => h('div', { class: 'row', style: { alignItems: 'end' } }, field('Buy something else', anyItem), h('button', { type: 'button', onclick: () => buyDialog(+anyItem.value) }, 'See vendors'));
    if (isCompact()) return pager({ title: 'Purchasing', name: 'Purchasing pages', state: pagerState('purchasing'), groups: [
      { key: 'stock', label: 'Stock', header: buttons, blocks: [h('section', { class: 'card' }, summary), stockTable] },
      { key: 'buy', label: 'Buy', blocks: [h('p', { class: 'muted' }, intro), h('section', { class: 'card' }, buyRow())] },
      { key: 'orders', label: 'Orders', badge: st.orders.length || null, blocks: [ordersTable] }] });
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Purchasing'), h('p', null, intro)), buttons),
      h('section', { class: 'card' }, summary),
      h('section', { class: 'card' }, h('h2', null, 'Stock and targets'), stockTable, h('div', { style: { marginTop: '12px' } }, buyRow())),
      h('section', { class: 'card' }, h('h2', null, 'Deliveries on the way'), ordersTable));
  },
  paged: true,
};
export async function buyDialog(itemId) {
  const st = app.st; const vs = vendorsFor(st, itemId);
  if (!vs.length) { announce(`Nobody in ${st.city.name} sells ${ITEMS[itemId].name}.`, 'assertive'); return; }
  const perDay = G.dailyUse(st, itemId) / ITEMS[itemId].pack, room = Math.max(1, Math.floor(G.roomForOrders(st)));
  const days = d => Math.max(1, Math.ceil(perDay * d));
  const boxes = stepper({ label: 'Boxes to order', value: Math.min(room, days(2) || 5), min: 1, max: room, step: 1, big: 10, key: 'boxes', format: n => `${n} ${n === 1 ? 'box' : 'boxes'}`,
    describe: n => perDay > 0 ? `About ${Math.round(n / perDay * 10) / 10} days of use.` : 'Nothing of yours uses this yet.',
    presets: perDay > 0 ? [['2 days', 2], ['A week', 7], ['2 weeks', 14]].map(([label, d]) => ({ label, value: Math.min(room, days(d)) })) : [] });
  let chosen = G.bestVendor(st, itemId)?.firm ?? vs[0].firm;
  const leftOf = v => Math.max(1, v.monthlyBoxes - (st.vendorBought[v.firm + ':' + itemId] || 0));
  boxes.stepperLimit(Math.min(room, leftOf(vs.find(v => v.firm === chosen) || vs[0])));
  const radios = h('fieldset', { class: 'stack', style: { border: 'none', padding: 0, margin: 0, gap: '6px' } }, h('legend', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Vendor'),
    vs.map(v => { const left = v.monthlyBoxes - (st.vendorBought[v.firm + ':' + itemId] || 0); return h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
      h('input', { type: 'radio', name: 'vendor', id: 'v-' + v.firm, value: v.firm, checked: v.firm === chosen, disabled: left <= 0, onchange: () => { chosen = v.firm; boxes.stepperLimit(Math.min(room, leftOf(v))); } }),
      h('label', { for: 'v-' + v.firm, style: { fontWeight: 400 } }, h('strong', null, v.name), ` — ${money2(v.boxPrice)} per box of ${ITEMS[itemId].pack}, quality ${v.quality}, about ${Math.round(v.minutes / 60 * 10) / 10} hours to deliver, ${left > 0 ? num(left) + ' boxes left this month' : 'sold out this month'}`)); }));
  const intro = h('p', null, `In stock: ${num(G.boxesOf(st, itemId))} boxes. Room in storage: ${num(G.freeBoxes(st))} boxes. You pay the invoice ten days after delivery.`);
  const boxBlock = h('div', { class: 'stack', style: { gap: '4px' } }, h('strong', null, 'Boxes'), boxes);
  radios.setAttribute('data-split', '');
  await pagedDialog(`Buy ${ITEMS[itemId].name}`, [{ key: 'order', label: 'Order', blocks: [intro, boxBlock] }, { key: 'vendor', label: 'Vendor', blocks: [radios] }],
    [{ label: 'Cancel', value: null }, { label: 'Place order', primary: true, run: () => { const r = G.placeOrder(st, itemId, chosen, boxes.stepperValue()); act(r, false, 'order'); return r.ok; } }],
    () => h('div', { class: 'stack' }, intro, radios, boxBlock));
}

// ================= Sales
export const sales = {
  live: true,
  render() {
    const st = app.st;
    const ids = [...new Set([...Object.keys(st.inventory).map(Number), ...st.floor.objects.filter(o => o.kind === 'machine' && o.recipe != null).map(o => RECIPES[o.recipe].out)])].filter(i => ITEMS[i].tier !== 'material');
    const rows = ids.map(id => { const m = st.city.market[id]; const a = G.salesAttractiveness(st, id); return { id, name: ITEMS[id].name, units: st.inventory[id] || 0, market: m.price, price: a.price, r: a.r, q: st.quality[id] ?? 55, sold: st.stats.soldMonth[id] || 0, rev: st.stats.revenueMonth[id] || 0, demand: m.demand, selling: G.isSelling(st, id) }; });
    const intro = 'Orders ship every weekday at 3 pm. Customers pay about two weeks later, or later still if Finance falls behind.';
    const facts = kv([['Sales effort', `${st.dept.salesEff.toFixed(2)} ${st.dept.salesEff < 0.5 ? '(no sales staff)' : ''}`], ['Brand awareness', pct(st.dept.awareness)], ['Owed to us (receivables)', money(G.arTotal(st))], ['Last shipment', st.lastShip ? `${fmtShortDate(st.lastShip.t)}: ${st.lastShip.lines.join(', ')} for ${money(st.lastShip.total)}` : 'None yet']]);
    const products = table('Products', [
          { key: 'name', label: 'Product' },
          { key: 'units', label: 'In stock', num: true, render: r => num(r.units) },
          { key: 'q', label: 'Quality', num: true, render: r => Math.round(r.q), phone: false },
          { key: 'market', label: 'Market price', num: true, render: r => money2(r.market) },
          { key: 'price', label: 'Our price', num: true, sortable: false, render: r => stepper({ compact: true, label: `Our price for ${r.name}`, value: r.price, min: 0.01, max: Math.max(1, r.market * 10), decimals: 2, step: Math.max(0.01, Math.round(r.market * 0.01 * 100) / 100), big: Math.max(0.05, Math.round(r.market * 0.1 * 100) / 100), key: 'price-' + r.id, format: money2,
            onChange: p => { st.prices[r.id] = p; }, onSettle: () => rerender({}) }) },
          { key: 'r', label: 'vs market', num: true, render: r => h('span', { class: r.r > 1.2 ? 'bad' : r.r < 0.9 ? 'warn' : '' }, pct(r.r)) },
          { key: 'trend', label: 'Market price, by month', sortable: false, phone: false, render: r => { const hist = st.city.market[r.id].history || []; return h('span', { class: 'row', style: { flexWrap: 'nowrap', gap: '6px' } }, sparkline(hist.slice(-12)), h('span', { class: 'sr-only' }, hist.length > 1 ? `from ${money2(hist[Math.max(0, hist.length - 12)])} to ${money2(hist[hist.length - 1])}` : 'no history yet')); } },
          { key: 'sold', label: 'Sold this month', num: true, render: r => num(r.sold) },
          { key: 'rev', label: 'Revenue', num: true, render: r => money(r.rev) },
          { key: 'share', label: 'Share of demand', num: true, phone: false, render: r => pct(r.sold / Math.max(1, r.demand)), sort: r => r.sold / Math.max(1, r.demand) },
          { key: 'selling', label: 'Sell it?', sortable: false, render: r => h('input', { type: 'checkbox', checked: r.selling, 'aria-label': `Sell ${r.name} (unchecked keeps it for our own machines)`, 'data-key': 'sell-' + r.id, onchange: e => { st.sell[r.id] = e.target.checked; announce(e.target.checked ? `Selling ${r.name}.` : `Keeping ${r.name} for production.`, 'polite', false); } }) },
          { key: 'reset', label: '', sortable: false, render: r => h('button', { type: 'button', 'data-key': 'match-' + r.id, onclick: () => { delete st.prices[r.id]; act({ ok: true, msg: `${r.name} follows the market price again.` }); } }, 'Match market') }],
        rows, { hideCaption: true, empty: 'No products yet. Finished goods appear here once a machine makes them.', noMenu: isCompact() });
    if (isCompact()) return pager({ title: 'Sales', name: 'Sales pages', state: pagerState('sales'), groups: [
      { key: 'overview', label: 'Overview', blocks: [h('p', { class: 'muted' }, intro), h('section', { class: 'card' }, facts)] },
      { key: 'charts', label: 'Charts', blocks: salesChartParts(st) },
      { key: 'products', label: 'Products', header: products.sortMenu, blocks: [products] }] });
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Sales'), h('p', null, intro))),
      h('section', { class: 'card' }, facts), salesCharts(st),
      h('section', { class: 'card' }, h('h2', null, 'Products'), products));
  },
  paged: true,
};

// the three charts, as separate blocks (a phone shows one at a time)
function salesChartParts(st) {
  const daily = (st.salesDaily || []).slice(-30);
  const dShort = t => { const d = new Date(EPOCH + t * 60000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const daysChart = daily.length ? barChart({
    id: 'daily', title: 'Revenue per day', desc: `Last ${daily.length} shipping days. Hover, or focus the chart and use the arrow keys, for each day.`,
    cols: daily.map(d => ({ label: fmtDate(d.t), short: dShort(d.t), segs: [{ key: 'rev', value: d.rev }] })),
    keys: [{ key: 'rev', label: 'Revenue', color: 'var(--accent)' }], fmt: v => money(v), fmtTick: v => moneyShort(v),
  }) : h('p', { class: 'empty' }, 'Daily revenue appears after the first shipping day (3 pm on a weekday).');
  // monthly revenue by product: top six products by total, the rest folded into Other
  const months = [...st.history.slice(-11).map(m => ({ key: m.month, rev: m.revenue || {}, label: monthLabel(m.month) })), { key: st.ledger.month, rev: st.stats.revenueMonth, label: monthLabel(st.ledger.month) + ' (so far)' }];
  const totals = {}; for (const m of months) for (const [id, v] of Object.entries(m.rev)) totals[id] = (totals[id] || 0) + v;
  const top = Object.keys(totals).sort((a, b) => totals[b] - totals[a]).slice(0, 6);
  const keys = top.map((id, i) => ({ key: 'p' + id, label: ITEMS[id].name, color: SERIES(i) }));
  const hasOther = Object.keys(totals).length > top.length; if (hasOther) keys.push({ key: 'other', label: 'Other products', color: 'var(--series-other)' });
  const monthChart = Object.keys(totals).length ? barChart({
    id: 'monthly', title: 'Revenue by product, by month', desc: 'Each bar is a month; segments are products.',
    cols: months.map(m => { const segs = top.map(id => ({ key: 'p' + id, value: m.rev[id] || 0 })); if (hasOther) segs.push({ key: 'other', value: Object.entries(m.rev).filter(([id]) => !top.includes(id)).reduce((a, [, v]) => a + v, 0) }); return { label: m.label, short: m.label.slice(0, 3), segs }; }),
    keys, fmt: v => money(v), fmtTick: v => moneyShort(v), legend: true,
  }) : h('p', { class: 'empty' }, 'Monthly revenue appears once something has sold.');
  // share of city demand over the last 21 shipping days
  const recent = (st.salesDaily || []).slice(-21); const units = {};
  for (const d of recent) for (const [id, [u]] of Object.entries(d.by)) units[id] = (units[id] || 0) + u;
  const share = Object.entries(units).map(([id, u]) => ({ label: ITEMS[id].name, value: u / Math.max(1, st.city.market[id].demand * recent.length / WORKDAYS_PER_MONTH) })).sort((a, b) => b.value - a.value).slice(0, 8);
  const shareChart = hBars({ title: 'Share of demand in ' + st.city.name, note: `Units we sold over the last ${recent.length || 0} shipping days, against the whole city's demand for the same period.`, rows: share, fmt: v => pct(v), max: Math.max(0.25, ...share.map(r => r.value)) });
  return [daysChart, monthChart, shareChart];
}
function salesCharts(st) { const [d, m, sh] = salesChartParts(st); return h('section', { class: 'card stack' }, h('h2', null, 'Sales charts'), h('div', { class: 'charts-grid' }, d, m), sh); }

// ================= Bank
export const bank = {
  live: true,
  render() {
    const st = app.st, b = st.bank;
    const bv = (app.viewState.bank ||= {}), maxL = G.maxLoan(st);
    if (bv.amt == null) bv.amt = 10000;
    if (bv.loan == null || bv.loan > maxL) bv.loan = Math.max(Math.min(5000, maxL), Math.min(100000, maxL));
    const amt = stepper({ label: 'Amount to move', value: bv.amt, min: 0, max: 10000000, step: 1000, big: 10000, key: 'move-amt', format: money, onChange: v => { bv.amt = v; },
      presets: [1000, 5000, 10000, 50000, 100000].map(v => ({ label: money(v), value: v })) });
    const loanAmt = stepper({ label: 'Loan amount', value: bv.loan, min: Math.min(5000, maxL), max: maxL, step: 1000, big: 10000, slider: true, key: 'loan-amt', format: money, onChange: v => { bv.loan = v; } });
    const years = h('select', { id: 'loan-yrs' }, [1, 2, 3, 4, 5].map(y => h('option', { value: y, selected: y === 3 }, `${y} year${y > 1 ? 's' : ''} at ${(G.loanRate(st, y) * 100).toFixed(2)}%`)));
    const intro = `Savings pay ${+(ECONOMY.bank.savingsRate * 100).toFixed(2)}% a year. When checking goes below zero, the bank moves money in from savings first and then from your credit line, which costs ${+(ECONOMY.bank.creditRate * 100).toFixed(2)}% a year.`;
    const accounts = kv([['Checking', money(b.checking)], ['Savings', money(b.savings)], ['Credit line used', `${money(b.credit)} of ${money(G.creditLimit(st))}`], ['Loans outstanding', money(b.loans.reduce((s, l) => s + l.balance, 0))]]);
    const moveAmt = h('div', { class: 'stack', style: { gap: '4px', flex: '1 1 12em', minWidth: 0 } }, h('strong', null, 'Amount'), amt);
    const moveBtns = [h('button', { type: 'button', onclick: () => act(G.transfer(st, 'checking', amt.stepperValue()), false, 'cash') }, 'Checking → savings'),
      h('button', { type: 'button', onclick: () => act(G.transfer(st, 'savings', amt.stepperValue()), false, 'cash') }, 'Savings → checking'),
      b.credit > 0 ? h('button', { type: 'button', onclick: () => act(G.payCreditLine(st, amt.stepperValue())) }, 'Repay credit line') : null];
    const loanNote = h('p', null, `The bank will lend up to ${money(G.maxLoan(st))} right now. At most five loans at a time.`);
    const loanAmtBox = h('div', { class: 'stack', style: { gap: '4px' } }, h('strong', null, 'Amount'), loanAmt);
    const apply = h('button', { class: 'primary', type: 'button', onclick: async () => { const y = +years.value, a = loanAmt.stepperValue(), r = G.loanRate(st, y), i = r / 12, n = y * 12; const pmt = a * i / (1 - Math.pow(1 + i, -n)); if (await confirmBox('Take this loan?', `Borrow ${money(a)} for ${y} years at ${(r * 100).toFixed(2)}%. Payments of ${money(pmt)} a month.`, 'Borrow')) act(G.takeLoan(st, a, y), false, 'cash'); } }, 'Apply for loan');
    const loans = table('Loans', [
          { key: 'principal', label: 'Borrowed', num: true, render: l => h('span', { 'data-rowname': '' }, money(l.principal)) }, { key: 'balance', label: 'Balance', num: true, render: l => money(l.balance) },
          { key: 'rate', label: 'Rate', num: true, render: l => h('span', { 'data-rowname': '' }, (l.rate * 100).toFixed(2) + '%') }, { key: 'payment', label: 'Monthly', num: true, render: l => money(l.payment) },
          { key: 'left', label: 'Payments left', num: true }, { key: 'pay', label: '', sortable: false, render: l => h('button', { type: 'button', 'data-key': 'payoff-' + l.id, onclick: () => act(G.payOffLoan(st, l.id), false, 'cash') }, 'Pay off') }],
        b.loans, { hideCaption: true, rowHeader: false, empty: 'No loans.', noMenu: true });
    const statement = table('Recent transactions', [
          { key: 't', label: 'Date', render: x => fmtShortDate(x.t) }, { key: 'desc', label: 'Transaction' },
          { key: 'amount', label: 'Amount', num: true, render: x => h('span', { class: x.amount < 0 ? 'bad' : 'good' }, money2(x.amount)) }, { key: 'bal', label: 'Balance', num: true, render: x => money(x.bal) }],
        b.txns.slice(-40).reverse(), { hideCaption: true, rowHeader: false, noMenu: true });
    if (isCompact()) return pager({ title: ECONOMY.bank.name, name: 'Bank pages', state: pagerState('bank'), groups: [
      { key: 'accounts', label: 'Accounts', blocks: [h('section', { class: 'card' }, accounts), h('div', { class: 'card pair' }, moveAmt, h('div', { class: 'row' }, moveBtns)), h('p', { class: 'muted' }, intro)] },
      { key: 'borrow', label: 'Borrow', blocks: [h('div', { class: 'card pair' }, loanAmtBox, h('div', { class: 'stack' }, loanNote, field('Term and rate', years), apply))] },
      { key: 'loans', label: 'Loans', badge: b.loans.length || null, blocks: [loans] },
      { key: 'statement', label: 'Statement', blocks: [statement] }] });
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, ECONOMY.bank.name), h('p', null, intro))),
      h('div', { class: 'grid2' },
        h('section', { class: 'card stack' }, h('h2', null, 'Accounts'), accounts, h('div', { class: 'row', style: { alignItems: 'end' } }, moveAmt, moveBtns)),
        h('section', { class: 'card stack' }, h('h2', null, 'Borrow'), loanNote, h('div', { class: 'grid2', style: { gap: '10px' } }, loanAmtBox, field('Term and rate', years)), apply)),
      h('section', { class: 'card' }, h('h2', null, 'Loans'), loans),
      h('section', { class: 'card' }, h('h2', null, 'Checking statement'), statement));
  },
  paged: true,
};

// ================= Reports
const REPORTS = [['general', 'General'], ['balance', 'Balance sheet'], ['pl', 'Profit & loss'], ['assets', 'Assets'], ['inventory', 'Inventory'], ['purchases', 'Purchases'], ['production', 'Production'], ['salesr', 'Sales'], ['trends', 'Trends']];
export const reports = {
  live: true,
  render() {
    const st = app.st, v = (app.viewState.reports ||= { tab: 'general' });
    const tabs = h('div', { class: 'row', role: 'tablist', 'aria-label': 'Reports', style: { gap: '4px' } }, REPORTS.map(([k, l]) => h('button', { type: 'button', role: 'tab', id: 'rt-' + k, 'aria-selected': String(v.tab === k), tabindex: v.tab === k ? 0 : -1, 'aria-controls': 'rep-panel', 'data-key': 'rt-' + k,
      onclick: () => { v.tab = k; rerender({}); document.getElementById('rt-' + k)?.focus(); },
      onkeydown: e => { const i = REPORTS.findIndex(r => r[0] === v.tab); const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); v.tab = REPORTS[(i + d + REPORTS.length) % REPORTS.length][0]; rerender({}); document.getElementById('rt-' + v.tab)?.focus(); } } }, l)));
    if (isCompact()) return pager({ title: 'Reports', name: 'Report pages', state: pagerState('reports'), groups: REPORTS.map(([k, l]) => ({ key: k, label: l, blocks: reportBody(st, k).filter(n => n.tagName !== 'H2') })) });
    return h('div', { class: 'stack' }, h('div', { class: 'view-head' }, h('h1', null, 'Reports')), tabs, h('section', { class: 'card stack', id: 'rep-panel', role: 'tabpanel', 'aria-labelledby': 'rt-' + v.tab }, reportBody(st, v.tab)));
  },
  paged: true,
};
function plTable(L, title) {
  const inc = [['Product sales', L.income.sales], ['Equipment sold', L.income.equipment], ['Savings interest', L.income.interest], ['Other income', L.income.misc]];
  const exp = [['Rent', L.expense.rent], ['Personnel', L.expense.personnel], ['Purchases', L.expense.purchases], ['Equipment', L.expense.equipment], ['Running costs and repairs', L.expense.running], ['Loan payments and interest', L.expense.loans], ['Fines and fees', L.expense.fines], ['Other costs', L.expense.misc]];
  const ti = inc.reduce((s, x) => s + x[1], 0), te = exp.reduce((s, x) => s + x[1], 0);
  return table(title, [{ key: 0, label: 'Line' }, { key: 1, label: 'Amount', num: true, render: r => r[2] ? h('strong', null, money(r[1])) : money(r[1]) }],
    [...inc, ['Total income', ti, 1], ...exp, ['Total expenses', te, 1], ['Net profit (loss)', ti - te, 1]], { rowHeader: true, plain: true, noMenu: true, hideCaption: isCompact() });
}
function reportBody(st, tab) {
  const last = st.history[st.history.length - 1];
  switch (tab) {
    case 'general': return [h('h2', null, 'General information'), ...kvParts([['Business name', st.setup.company], ['Owner', st.setup.owner || '—'], ['City', st.city.name], ['Address', st.city.lots[st.lotId].addr], ['Today', fmtDate(st.time)], ['Months in business', String(st.history.length)], ['Employees', num(st.employees.length)], ['Machines', num(st.floor.objects.filter(o => o.kind === 'machine').length)], ['Net worth', money(G.netWorth(st))], ['Score', money(G.score(st))], st.obligation ? ['Obligation', `${money(st.obligation.target)} by ${monthLabel(st.obligation.deadline)}${st.obligation.done ? ` (${st.obligation.done})` : ''}`] : null])];
    case 'balance': {
      const assets = [['Checking', st.bank.checking], ['Savings', st.bank.savings], ['Accounts receivable', G.arTotal(st)], ['Inventory', G.inventoryValue(st)], ['Equipment and fixtures', G.equipmentValue(st)]];
      const liab = [['Loans and credit line', G.loansTotal(st)], ['Accrued payroll', G.accruedPayroll(st)], ['Accounts payable', G.apTotal(st)]];
      const ta = assets.reduce((s, x) => s + x[1], 0), tl = liab.reduce((s, x) => s + x[1], 0);
      return [h('h2', null, 'Balance sheet'), table('Balance sheet', [{ key: 0, label: 'Line' }, { key: 1, label: 'Amount', num: true, render: r => r[2] ? h('strong', null, money(r[1])) : money(r[1]) }],
        [...assets, ['Total assets', ta, 1], ...liab, ['Total liabilities', tl, 1], ['Net worth', ta - tl, 1]], { hideCaption: true, plain: true, noMenu: true })];
    }
    case 'pl': {
      const t1 = `This month (${monthLabel(st.ledger.month)}, so far)`, t2 = last ? `Last month (${monthLabel(last.month)})` : null;
      if (isCompact()) return [h('h3', null, t1), plTable(st.ledger, t1), ...(last ? [h('h3', null, t2), plTable(last, t2)] : [h('p', { class: 'muted' }, 'No completed month yet.')])];
      return [h('h2', null, 'Profit and loss'), h('div', { class: 'grid2' }, h('div', null, plTable(st.ledger, t1)), last ? h('div', null, plTable(last, t2)) : h('p', { class: 'muted' }, 'No completed month yet.'))];
    }
    case 'assets': return [h('h2', null, 'Assets'), table('Equipment', [{ key: 'name', label: 'Item' }, { key: 'bought', label: 'Bought', render: o => fmtShortDate(o.bought) }, { key: 'cost', label: 'Paid', num: true, render: o => money(o.cost) }, { key: 'value', label: 'Value now', num: true, render: o => money(o.value) }],
      st.floor.objects.filter(o => !o.fixed).map(o => ({ ...o, name: o.kind === 'conveyor' ? 'Conveyor section' : objectLabel(st, o) })), { hideCaption: true, noMenu: true })];
    case 'inventory': return [h('h2', null, 'Inventory'), table('Stored goods', [{ key: 'name', label: 'Item' }, { key: 'boxes', label: 'Boxes', num: true }, { key: 'units', label: 'Units', num: true, render: r => num(r.units) }, { key: 'value', label: 'Value', num: true, render: r => money(r.value) }],
      Object.entries(st.inventory).map(([id, u]) => ({ name: ITEMS[id].name, boxes: G.boxesOf(st, +id), units: u, value: u * st.city.market[id].price * 0.75 })), { hideCaption: true })];
    case 'purchases': {
      const bought = (st.stats.boughtMonth || {});
      const ids = [...new Set([...Object.keys(bought), ...st.orders.map(o => String(o.item)), ...Object.keys(st.targets)])];
      return [h('h2', null, 'Purchase report'), table('Purchases this month', [{ key: 'name', label: 'Item' }, { key: 'target', label: 'Target', num: true }, { key: 'arrived', label: 'Arrived (boxes)', num: true }, { key: 'transit', label: 'In transit', num: true }, { key: 'est', label: 'Price estimate', num: true, render: r => money2(r.est) }],
        ids.map(id => ({ name: ITEMS[id].name, target: st.targets[id] ?? '—', arrived: bought[id] || 0, transit: G.onOrderBoxes(st, +id), est: st.city.market[id].price * ITEMS[id].pack })), { hideCaption: true })];
    }
    case 'production': return [h('h2', null, 'Production report'), table('Machines', [{ key: 'name', label: 'Machine' }, { key: 'product', label: 'Product' }, { key: 'month', label: 'This month', num: true, render: r => num(r.month) }, { key: 'total', label: 'Total', num: true, render: r => num(r.total) }, { key: 'eff', label: 'Efficiency', num: true, render: r => pct(r.eff) }, { key: 'date', label: 'Bought', render: r => fmtShortDate(r.date) }],
      st.floor.objects.filter(o => isProducer(o)).map(o => ({ name: objectLabel(st, o), product: o.mode === 'research' ? 'Research' : ITEMS[RECIPES[o.recipe].out].name, month: o.producedMonth, total: o.produced, eff: o.effAvg, date: o.bought })), { hideCaption: true })];
    case 'salesr': return [h('h2', null, 'Sales report'), table('Sales this month', [{ key: 'name', label: 'Product' }, { key: 'units', label: 'Units sold', num: true, render: r => num(r.units) }, { key: 'income', label: 'Income', num: true, render: r => money(r.income) }, { key: 'share', label: 'Market share', num: true, render: r => pct(r.share) }, { key: 'price', label: 'Unit price', num: true, render: r => money2(r.price) }],
      Object.keys(st.stats.soldMonth).map(id => ({ name: ITEMS[id].name, units: st.stats.soldMonth[id], income: st.stats.revenueMonth[id], share: st.stats.soldMonth[id] / Math.max(1, st.city.market[id].demand), price: st.stats.revenueMonth[id] / st.stats.soldMonth[id] })), { hideCaption: true, empty: 'No sales yet this month.' })];
    case 'trends': return [h('h2', null, 'Trends'), trendChart(st), monthlyTable(st)];
  }
}
function trendChart(st) {
  const s = st.series; if (s.length < 2) return h('p', { class: 'muted' }, 'The chart fills in after a couple of weeks of play.');
  const W = 720, H = 260, P = { l: 70, r: 16, t: 16, b: 30 };
  const vals = s.flatMap(p => [p.cash, p.nw]); let lo = Math.min(0, ...vals), hi = Math.max(...vals); if (hi === lo) hi = lo + 1;
  const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 4))); const tick = [1, 2, 5, 10].map(m => m * step).find(t => (hi - lo) / t <= 5);
  lo = Math.floor(lo / tick) * tick; hi = Math.ceil(hi / tick) * tick;
  const X = i => P.l + (W - P.l - P.r) * i / (s.length - 1), Y = v => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
  const line = k => s.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
  let grid = ''; for (let v = lo; v <= hi + 1e-6; v += tick) grid += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="${v === 0 ? 1.5 : 0.7}"/><text x="${P.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--font-mono)">${moneyShort(v)}</text>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly cash and net worth. Latest: cash ${money(s[s.length - 1].cash)}, net worth ${money(s[s.length - 1].nw)}." style="width:100%;height:auto">${grid}
    <path d="${line('nw')}" fill="none" stroke="var(--accent)" stroke-width="2.5"/><path d="${line('cash')}" fill="none" stroke="var(--info)" stroke-width="2" stroke-dasharray="6 4"/>
    <circle cx="${X(s.length - 1)}" cy="${Y(s[s.length - 1].nw)}" r="4" fill="var(--accent)"/>
    <text x="${P.l}" y="${H - 8}" font-size="11" fill="var(--muted)">${fmtShortDate(s[0].t)}</text><text x="${W - P.r}" y="${H - 8}" font-size="11" text-anchor="end" fill="var(--muted)">${fmtShortDate(s[s.length - 1].t)}</text></svg>`;
  return h('figure', { style: { margin: 0 } }, h('div', { html: svg }), h('figcaption', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--accent)' } }), 'Net worth (solid)'), h('span', null, h('i', { style: { background: 'var(--info)' } }), 'Cash (dashed)')));
}
function monthlyTable(st) {
  return table('Month by month', [{ key: 'm', label: 'Month', render: r => monthLabel(r.month) }, { key: 'inc', label: 'Income', num: true, render: r => money(r.income.sales + r.income.misc + r.income.equipment + r.income.interest) }, { key: 'exp', label: 'Expenses', num: true, render: r => money(Object.values(r.expense).reduce((s, v) => s + v, 0)) }, { key: 'produced', label: 'Units made', num: true, render: r => num(r.produced) }, { key: 'netWorth', label: 'Net worth', num: true, render: r => money(r.netWorth) }],
    st.history.slice().reverse(), { empty: 'No completed months yet.', hideCaption: isCompact() });
}

// ================= Research
// cell technologies: worked on by engineers who aren't running a research machine; each unlocks cell extras
function techParts(st) {
  const ct = st.cellTech || { done: {}, active: null }, a = ct.active;
  const free = G.techResearchers(st);
  const rows = Object.entries(TECHS).map(([id, t]) => ({ id, ...t, unlocks: Object.values(CELL_ITEMS).filter(d => d.tech === id).map(d => d.name).join(', '), done: !!ct.done[id], active: a?.id === id }));
  return {
    intro: h('p', null, `Unlocks extras for production cells. Any ${jobFor('researcher').title} not at a research machine works on it (${free.length} now). One project at a time; you pay when it starts.`),
    active: a ? h('div', { class: 'stack', style: { gap: '4px' } }, h('p', null, h('strong', null, TECHS[a.id].name), ` · ${Math.floor(a.hours)} of ${a.need} engineer-hours${free.length ? '' : ' · paused: no engineer is free'}`), meter(a.hours / a.need, `${TECHS[a.id].name} progress`)) : null,
    table: table('Cell technologies', [
      { key: 'name', label: 'Technology', render: r => h('span', null, h('strong', { 'data-rowname': '' }, r.name), h('br'), h('small', { class: 'muted' }, r.desc)) },
      { key: 'unlocks', label: 'Unlocks' },
      { key: 'hours', label: 'Hours', num: true },
      { key: 'cost', label: 'Cost', num: true, render: r => money(r.cost) },
      { key: 'go', label: '', sortable: false, render: r => r.done ? pill('Done', 'ok', '✓') : r.active ? pill('In progress', 'info') : h('button', { type: 'button', 'data-key': 'tech-' + r.id, disabled: !!a, onclick: () => act(G.startTech(st, r.id), false, 'research') }, 'Start') }],
      rows, { hideCaption: true, noMenu: true }) };
}
function techSection(st) {
  const t = techParts(st);
  return h('section', { class: 'card stack', 'aria-labelledby': 'tech-h' }, h('h2', { id: 'tech-h' }, 'Cell technology'), t.intro, t.active, t.table);
}
export const research = {
  live: true,
  render() {
    const st = app.st;
    const rm = st.floor.objects.filter(o => o.kind === 'machine' && o.mode === 'research');
    const locked = RECIPES.filter(r => !G.recipeAvailable(st, r.id));
    const intro = `Some products have to be developed before you can make them. Pick a machine of the right line on the floor, choose "Research a new product" and put ${aOrAn(jobFor('researcher').title)} on it. ${aOrAn(jobFor('research_lead').title, true)} speeds up every project.`;
    const projects = table('Projects', [
        { key: 'm', label: 'Machine', render: o => objectLabel(st, o) },
        { key: 't', label: 'Target', render: o => o.research ? ITEMS[RECIPES[o.research.target].out].name : '—' },
        { key: 'p', label: 'Progress', render: o => o.research ? h('span', { class: 'row' }, meter(o.research.hours / o.research.need, 'Progress'), `${Math.floor(o.research.hours)} / ${o.research.need} h`) : '—' },
        { key: 's', label: 'Status', render: o => o.status }], rm, { hideCaption: true, empty: 'No research running.', noMenu: true });
    const lockedTable = table('Locked products', [
        { key: 'name', label: 'Product', render: r => ITEMS[r.out].name }, { key: 'fam', label: 'Machine', render: r => FAMILIES[r.family].name },
        { key: 'price', label: 'Market price', num: true, render: r => money2(st.city.market[r.out].price), sort: r => st.city.market[r.out].price },
        { key: 'known', label: 'Known in town', render: r => st.city.aiKnown[r.id] ? pill('Yes: research twice as fast', 'info') : 'No' }], locked, { hideCaption: true, noMenu: true });
    const done = st.research.done.length ? h('ul', null, st.research.done.map(d => h('li', null, `${ITEMS[RECIPES[d.rid].out].name} (${fmtShortDate(d.t)})`))) : null;
    if (isCompact()) { const t = techParts(st); return pager({ title: 'Research', name: 'Research pages', state: pagerState('research'), groups: [
      { key: 'projects', label: 'Projects', blocks: [h('p', { class: 'muted' }, intro), projects] },
      { key: 'develop', label: 'To develop', blocks: [lockedTable] },
      { key: 'cells', label: 'Cells', blocks: [t.intro, t.active, t.table].filter(Boolean) },
      ...(done ? [{ key: 'done', label: 'Developed', blocks: [done] }] : [])] }); }
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Research'), h('p', null, intro))),
      h('section', { class: 'card' }, h('h2', null, 'Projects under way'), projects),
      h('section', { class: 'card' }, h('h2', null, 'Products still to develop'), lockedTable),
      techSection(st),
      done ? h('section', { class: 'card' }, h('h2', null, 'Developed'), done) : null);
  },
  paged: true,
};

// ================= Options & help
export const options = {
  render() {
    const st = app.st;
    const sel = (id, label, val, opts, on) => field(label, h('select', { id, onchange: e => on(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(val) === String(v) }, l))));
    const chk = (id, label, val, on) => h('div', { class: 'row' }, h('input', { type: 'checkbox', id, checked: !!val, onchange: e => on(e.target.checked) }), h('label', { for: id, style: { fontWeight: 400 } }, label));
    const set = (k, v) => { prefs[k] = v; applyPrefs(); announce('Setting saved.', 'polite', false); };
    const secs = { game: st && st.phase === 'play' ? h('section', { class: 'card stack' }, h('h2', null, 'Game'),
        h('div', { class: 'row' },
          [1, 2, 3].map(n => h('button', { type: 'button', onclick: async () => { st._nw = Math.round(G.netWorth(st)); const r = await saveGame(String(n), st); announce(r.ok ? `Saved to slot ${n} in this browser.` : r.msg, r.ok ? 'polite' : 'assertive'); } }, `Save to slot ${n}`)),
          h('button', { type: 'button', onclick: async () => { const r = await exportFile(st); announce(r.msg, r.ok ? 'polite' : 'assertive'); } }, 'Export save file')),
        h('div', { class: 'row' },
          h('button', { type: 'button', onclick: async () => { if (!(await confirmBox('Retire?', `Retire now and record a score of ${money(G.score(st))} on this computer?`, 'Retire'))) return; if (!st.setup.sandbox) await submitScore({ company: st.setup.company, city: st.city.name, score: G.score(st), months: st.history.length, scenario: st.setup.scenario }); announce('Score recorded. The company is retired.'); app.st = null; go('start'); } }, 'Retire and record score'),
          h('button', { type: 'button', class: 'danger', onclick: async () => { if (await confirmBox('Quit to the title screen?', 'Anything since your last save will be lost.', 'Quit', true)) { app.st = null; app.speed = 0; go('start'); } } }, 'Quit to title screen'))) : null,
      disp: h('section', { class: 'card stack' }, h('h2', null, 'Display and sound'),
        h('div', { class: 'grid2' },
          sel('o-theme', 'Theme', prefs.theme, [['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']], v => set('theme', v)),
          sel('o-scale', 'Text size', prefs.scale, [[0, 'Standard'], [1, 'Large'], [2, 'Larger'], [3, 'Largest']], v => set('scale', +v)),
          sel('o-motion', 'Animation', prefs.motion, [['system', 'Match my device'], ['full', 'Full'], ['reduce', 'Reduced: no walking or moving belts']], v => set('motion', v))),
        chk('o-contrast', 'High contrast borders and text', prefs.contrast, v => set('contrast', v)),
        chk('o-sfx', 'Sound effects', prefs.sfx, v => { set('sfx', v); if (v) sfx('ok'); }),
        chk('o-amb', 'Factory ambience while the clock runs (hum and machine thumps)', prefs.ambience, v => { set('ambience', v); updateAmbience(); }),
        chk('o-ticks', 'Clicks as the cursor moves on the factory floor', prefs.cursorTicks, v => { set('cursorTicks', v); if (v) sfx('tick'); }),
        h('div', { class: 'row', style: { alignItems: 'center' } }, h('label', { for: 'o-vol' }, 'Volume'),
          h('input', { type: 'range', id: 'o-vol', min: 0, max: 100, step: 5, value: Math.round((prefs.volume ?? 0.6) * 100), 'aria-valuetext': Math.round((prefs.volume ?? 0.6) * 100) + ' percent', style: { width: '12em' },
            onchange: e => { prefs.volume = +e.target.value / 100; e.target.setAttribute('aria-valuetext', e.target.value + ' percent'); applyPrefs(); sfx('ok'); } })),
        h('details', null, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, 'Preview the sounds'),
          h('div', { class: 'row', style: { marginTop: '8px' } }, SOUND_BOARD.map(([k, label]) => h('button', { type: 'button', onclick: () => { const was = prefs.sfx; prefs.sfx = true; sfx(k); prefs.sfx = was; } }, label)))),
        chk('o-toasts', 'Show pop-up notices (screen readers hear updates either way)', prefs.toasts, v => set('toasts', v))),
      play: h('section', { class: 'card stack' }, h('h2', null, 'Play'),
        chk('o-pause', 'Pause the clock when an urgent memo arrives', prefs.pauseOnAlert, v => set('pauseOnAlert', v)),
        chk('o-auto', 'Autosave at the start of each month', prefs.autosave, v => set('autosave', v)),
        chk('o-keys', 'Single-key shortcuts (space, [ ], g then a letter)', prefs.shortcuts, v => set('shortcuts', v))),
      how: h('section', { class: 'card stack' }, h('h2', null, 'How to play'),
        h('ol', { style: { margin: 0, paddingLeft: '1.2em', display: 'grid', gap: '6px' } },
          h('li', null, 'Lease a building in a city. Rent is due on the first of each month.'),
          h('li', null, "Buy a machine from the Catalog and set it on the floor. Leave its input squares, output square, operator's post and service hatch clear, and paint a safety zone on each input square."),
          h('li', null, `Hire ${aOrAn(jobFor('operator').title)} and put them on the machine. Office staff each need a desk.`),
          h('li', null, 'Buy materials on the Purchasing page. Deliveries land in your storage zones; paint more storage as you grow.'),
          h('li', null, 'Start the clock. Finished goods ship at 3 pm on weekdays to customers around town. Set prices on the Sales page.'),
          h('li', null, 'Grow: link machines with conveyor belts, add pallet jacks and forklifts, staff up the office, keep a mechanic on hand, research new products, and move to a bigger building when you run out of room.'))),
      keys: h('section', { class: 'card stack' }, h('h2', null, 'Keyboard'),
        table('Keyboard shortcuts', [{ key: 0, label: 'Keys' }, { key: 1, label: 'Action' }], [
          ['Space', 'Start or pause the clock, on the factory floor too (not when focus is on a button)'], ['[ and ]', 'Slower or faster'], ['g then f', 'Factory floor'], ['g then c', 'Catalog'], ['g then s', 'Staff'], ['g then h', 'Hiring'], ['g then i', 'In-basket'], ['g then p', 'Purchasing'], ['g then l', 'Sales'], ['g then b', 'Bank'], ['g then r', 'Reports'], ['g then m', 'City map'], ['g then n', 'Nation'], ['g then d', 'Research'], ['?', 'This page'],
          ['After g', 'The next key only moves between screens, on the factory floor too: g then m opens the City map and does not start a move'],
          ['On the floor: arrows', 'Move the cursor (Shift: five squares)'], ['Enter', 'Select or place (Space as well when single-key shortcuts are off)'], ['R', 'Rotate'], ['M', 'Move the selected item'], ['Delete', 'Sell the selected item'], ['I', 'Jump to the inspector'], ['Escape', 'Cancel']], { hideCaption: true, plain: true })),
      about: h('section', { class: 'card stack' }, h('h2', null, 'About'),
        h('p', null, 'Overhead is a 90s-style factory management sim, released as free software: the code under the MIT licence, the art and text under CC BY 4.0. City populations come from the US Census Bureau, and the map from us-atlas. The source code and credits are in the project repository.')) };
    if (isCompact()) {
      // each card becomes a few blocks (its heading dropped, a list split into its items) so the pager can lay them out
      const inner = (n, split) => n ? [...n.children].filter(c => c.tagName !== 'H2').flatMap(c => split && (c.tagName === 'OL' || c.tagName === 'UL') ? [...c.children].map(li => h('p', null, ...li.childNodes)) : [c]) : [];
      const disp = inner(secs.disp), display = disp.slice(0, 2), sound = disp.slice(2);
      return pager({ title: 'Options and help', name: 'Options pages', state: pagerState('options'), groups: [
        ...(secs.game ? [{ key: 'game', label: 'Game', blocks: inner(secs.game) }] : []),
        { key: 'display', label: 'Display', blocks: display }, { key: 'sound', label: 'Sound', blocks: sound },
        { key: 'play', label: 'Play', blocks: inner(secs.play) },
        { key: 'help', label: 'Help', blocks: [...inner(secs.how, true), ...inner(secs.about)] },
        { key: 'keys', label: 'Keys', blocks: inner(secs.keys) }] });
    }
    return h('div', { class: 'stack' }, h('div', { class: 'view-head' }, h('h1', null, 'Options and help')), secs.game, secs.disp, secs.play, secs.how, secs.keys, secs.about);
  },
  paged: true,
};
