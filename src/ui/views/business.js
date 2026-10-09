import { h, table, kv, announce, dialog, confirmBox, pill, meter, field, prefs } from '../dom.js';
import { app, go, render as rerender, act, applyPrefs, NAV } from '../app.js';
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
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Purchasing'), h('p', null, staffed ? 'Purchasing staff reorder stock up to the targets below every morning.' : `Nobody does the buying, so stock only gets reordered when you do it. ${aOrAn(jobFor('purchasing').title, true)} would handle it every morning.`)),
        h('div', { class: 'row' }, h('button', { type: 'button', 'data-key': 'pur-suggest', onclick: () => { st.targets = G.suggestedTargets(st); act({ ok: true, msg: 'Targets set to about three days of use.' }); } }, 'Suggest targets'),
          // focus stays on the button, so the polite message is the only sign it worked, whether or not anything was ordered
          h('button', { class: 'primary', type: 'button', 'data-key': 'pur-all', onclick: () => { const r = G.purchaseAll(st); announce(r.msg, 'polite'); act(r, true, 'order'); } }, 'Purchase all to target'))),
      h('section', { class: 'card' }, kv([['Storage', `${num(stored)} of ${num(cap)} boxes (${pct(stored / cap)})`], ['On order', `${num(G.allOnOrder(st))} boxes`], ['Room left for orders', `${num(G.roomForOrders(st))} boxes (15% is held back for finished goods)`]])),
      h('section', { class: 'card' }, h('h2', null, 'Stock and targets'),
        table('Materials and components', [
          { key: 'name', label: 'Item' },
          { key: 'boxes', label: 'In stock', num: true, render: r => `${num(r.boxes)} boxes` },
          { key: 'onOrder', label: 'On order', num: true, render: r => num(r.onOrder) },
          { key: 'use', label: 'Use per day', num: true, render: r => `${num(r.use / ITEMS[r.id].pack)} boxes` },
          { key: 'target', label: 'Target (boxes)', num: true, sortable: false, render: r => h('input', { type: 'number', min: 0, step: 1, value: r.target, 'aria-label': `Target stock for ${r.name} in boxes`, 'data-key': 'tgt-' + r.id, style: { width: '6em' }, onchange: e => { st.targets = { ...targets, [r.id]: Math.max(0, Math.round(+e.target.value)) }; announce(`Target for ${r.name} set to ${st.targets[r.id]} boxes.`, 'polite', false); } }) },
          { key: 'best', label: 'Best offer', num: true, render: r => r.best ? `${money2(r.best.boxPrice)}/box` : 'Sold out' },
          { key: 'buy', label: '', sortable: false, render: r => h('button', { type: 'button', 'data-key': 'buy-' + r.id, onclick: () => buyDialog(r.id) }, 'Buy…') }],
        rows, { hideCaption: true, empty: 'No machines need materials yet.' }),
        h('div', { class: 'row', style: { marginTop: '12px', alignItems: 'end' } }, field('Buy something else', anyItem), h('button', { type: 'button', onclick: () => buyDialog(+anyItem.value) }, 'See vendors'))),
      h('section', { class: 'card' }, h('h2', null, 'Deliveries on the way'),
        table('Orders in transit', [
          { key: 'item', label: 'Item', render: o => ITEMS[o.item].name }, { key: 'vendor', label: 'Vendor' }, { key: 'boxes', label: 'Boxes', num: true },
          { key: 'cost', label: 'Cost', num: true, render: o => money(o.boxes * o.boxPrice), sort: o => o.boxes * o.boxPrice },
          { key: 'eta', label: 'Arrives', render: o => fmtDate(o.eta) }, { key: 'auto', label: 'Placed by', render: o => o.auto ? 'Purchasing' : 'You' }],
        st.orders, { hideCaption: true, empty: 'Nothing on order.', defaultSort: 'eta' })));
  },
};
export async function buyDialog(itemId) {
  const st = app.st; const vs = vendorsFor(st, itemId);
  if (!vs.length) { announce(`Nobody in ${st.city.name} sells ${ITEMS[itemId].name}.`, 'assertive'); return; }
  const boxes = h('input', { type: 'number', id: 'buy-boxes', min: 1, step: 1, value: Math.max(1, Math.ceil(G.dailyUse(st, itemId) * 2 / ITEMS[itemId].pack) || 5) });
  let chosen = G.bestVendor(st, itemId)?.firm ?? vs[0].firm;
  const radios = h('fieldset', { class: 'stack', style: { border: 'none', padding: 0, margin: 0, gap: '6px' } }, h('legend', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Vendor'),
    vs.map(v => { const left = v.monthlyBoxes - (st.vendorBought[v.firm + ':' + itemId] || 0); return h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
      h('input', { type: 'radio', name: 'vendor', id: 'v-' + v.firm, value: v.firm, checked: v.firm === chosen, disabled: left <= 0, onchange: () => { chosen = v.firm; } }),
      h('label', { for: 'v-' + v.firm, style: { fontWeight: 400 } }, h('strong', null, v.name), ` — ${money2(v.boxPrice)} per box of ${ITEMS[itemId].pack}, quality ${v.quality}, about ${Math.round(v.minutes / 60 * 10) / 10} hours to deliver, ${left > 0 ? num(left) + ' boxes left this month' : 'sold out this month'}`)); }));
  await dialog(`Buy ${ITEMS[itemId].name}`, h('div', { class: 'stack' }, h('p', null, `In stock: ${num(G.boxesOf(st, itemId))} boxes. Room in storage: ${num(G.freeBoxes(st))} boxes. You pay the invoice ten days after delivery.`), radios, field('Boxes', boxes)),
    [{ label: 'Cancel', value: null }, { label: 'Place order', primary: true, run: () => { const r = G.placeOrder(st, itemId, chosen, +boxes.value); act(r, false, 'order'); return r.ok; } }]);
}

// ================= Sales
export const sales = {
  live: true,
  render() {
    const st = app.st;
    const ids = [...new Set([...Object.keys(st.inventory).map(Number), ...st.floor.objects.filter(o => o.kind === 'machine' && o.recipe != null).map(o => RECIPES[o.recipe].out)])].filter(i => ITEMS[i].tier !== 'material');
    const rows = ids.map(id => { const m = st.city.market[id]; const a = G.salesAttractiveness(st, id); return { id, name: ITEMS[id].name, units: st.inventory[id] || 0, market: m.price, price: a.price, r: a.r, q: st.quality[id] ?? 55, sold: st.stats.soldMonth[id] || 0, rev: st.stats.revenueMonth[id] || 0, demand: m.demand, selling: G.isSelling(st, id) }; });
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Sales'), h('p', null, 'Orders ship every weekday at 3 pm. Customers pay about two weeks later, or later still if Finance falls behind.'))),
      h('section', { class: 'card' }, kv([['Sales effort', `${st.dept.salesEff.toFixed(2)} ${st.dept.salesEff < 0.5 ? '(no sales staff)' : ''}`], ['Brand awareness', pct(st.dept.awareness)], ['Owed to us (receivables)', money(G.arTotal(st))], ['Last shipment', st.lastShip ? `${fmtShortDate(st.lastShip.t)}: ${st.lastShip.lines.join(', ')} for ${money(st.lastShip.total)}` : 'None yet']])),
      salesCharts(st),
      h('section', { class: 'card' }, h('h2', null, 'Products'),
        table('Products', [
          { key: 'name', label: 'Product' },
          { key: 'units', label: 'In stock', num: true, render: r => num(r.units) },
          { key: 'q', label: 'Quality', num: true, render: r => Math.round(r.q) },
          { key: 'market', label: 'Market price', num: true, render: r => money2(r.market) },
          { key: 'price', label: 'Our price', num: true, sortable: false, render: r => h('input', { type: 'number', min: 0.01, step: 0.01, value: r.price.toFixed(2), 'aria-label': `Our price for ${r.name}`, 'data-key': 'price-' + r.id, style: { width: '7em' }, onchange: e => { const p = +e.target.value; if (p > 0) { st.prices[r.id] = p; announce(`${r.name} now priced at ${money2(p)}, ${pct(p / r.market)} of market.`); } } }) },
          { key: 'r', label: 'vs market', num: true, render: r => h('span', { class: r.r > 1.2 ? 'bad' : r.r < 0.9 ? 'warn' : '' }, pct(r.r)) },
          { key: 'trend', label: 'Market price, by month', sortable: false, render: r => { const hist = st.city.market[r.id].history || []; return h('span', { class: 'row', style: { flexWrap: 'nowrap', gap: '6px' } }, sparkline(hist.slice(-12)), h('span', { class: 'sr-only' }, hist.length > 1 ? `from ${money2(hist[Math.max(0, hist.length - 12)])} to ${money2(hist[hist.length - 1])}` : 'no history yet')); } },
          { key: 'sold', label: 'Sold this month', num: true, render: r => num(r.sold) },
          { key: 'rev', label: 'Revenue', num: true, render: r => money(r.rev) },
          { key: 'share', label: 'Share of demand', num: true, render: r => pct(r.sold / Math.max(1, r.demand)), sort: r => r.sold / Math.max(1, r.demand) },
          { key: 'selling', label: 'Sell it?', sortable: false, render: r => h('input', { type: 'checkbox', checked: r.selling, 'aria-label': `Sell ${r.name} (unchecked keeps it for our own machines)`, 'data-key': 'sell-' + r.id, onchange: e => { st.sell[r.id] = e.target.checked; announce(e.target.checked ? `Selling ${r.name}.` : `Keeping ${r.name} for production.`, 'polite', false); } }) },
          { key: 'reset', label: '', sortable: false, render: r => h('button', { type: 'button', 'data-key': 'match-' + r.id, onclick: () => { delete st.prices[r.id]; act({ ok: true, msg: `${r.name} follows the market price again.` }); } }, 'Match market') }],
        rows, { hideCaption: true, empty: 'No products yet. Finished goods appear here once a machine makes them.' })));
  },
};

function salesCharts(st) {
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
  return h('section', { class: 'card stack' }, h('h2', null, 'Sales charts'), h('div', { class: 'charts-grid' }, daysChart, monthChart), shareChart);
}

// ================= Bank
export const bank = {
  live: true,
  render() {
    const st = app.st, b = st.bank;
    const amt = h('input', { type: 'number', id: 'move-cash-amount', min: 0, step: 100, value: 10000 });
    const loanAmt = h('input', { type: 'number', id: 'loan-amt', min: 5000, step: 1000, value: Math.min(100000, G.maxLoan(st)) });
    const years = h('select', { id: 'loan-yrs' }, [1, 2, 3, 4, 5].map(y => h('option', { value: y, selected: y === 3 }, `${y} year${y > 1 ? 's' : ''} at ${(G.loanRate(st, y) * 100).toFixed(2)}%`)));
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, ECONOMY.bank.name), h('p', null, `Savings pay ${+(ECONOMY.bank.savingsRate * 100).toFixed(2)}% a year. When checking goes below zero, the bank moves money in from savings first and then from your credit line, which costs ${+(ECONOMY.bank.creditRate * 100).toFixed(2)}% a year.`))),
      h('div', { class: 'grid2' },
        h('section', { class: 'card stack' }, h('h2', null, 'Accounts'),
          kv([['Checking', money(b.checking)], ['Savings', money(b.savings)], ['Credit line used', `${money(b.credit)} of ${money(G.creditLimit(st))}`], ['Loans outstanding', money(b.loans.reduce((s, l) => s + l.balance, 0))]]),
          h('div', { class: 'row', style: { alignItems: 'end' } }, field('Amount', amt),
            h('button', { type: 'button', onclick: () => act(G.transfer(st, 'checking', +amt.value), false, 'cash') }, 'Checking → savings'),
            h('button', { type: 'button', onclick: () => act(G.transfer(st, 'savings', +amt.value), false, 'cash') }, 'Savings → checking'),
            b.credit > 0 ? h('button', { type: 'button', onclick: () => act(G.payCreditLine(st, +amt.value)) }, 'Repay credit line') : null)),
        h('section', { class: 'card stack' }, h('h2', null, 'Borrow'),
          h('p', null, `The bank will lend up to ${money(G.maxLoan(st))} right now. At most five loans at a time.`),
          h('div', { class: 'grid2', style: { gap: '10px' } }, field('Amount', loanAmt), field('Term and rate', years)),
          h('button', { class: 'primary', type: 'button', onclick: async () => { const y = +years.value, a = +loanAmt.value, r = G.loanRate(st, y), i = r / 12, n = y * 12; const pmt = a * i / (1 - Math.pow(1 + i, -n)); if (await confirmBox('Take this loan?', `Borrow ${money(a)} for ${y} years at ${(r * 100).toFixed(2)}%. Payments of ${money(pmt)} a month.`, 'Borrow')) act(G.takeLoan(st, a, y), false, 'cash'); } }, 'Apply for loan'))),
      h('section', { class: 'card' }, h('h2', null, 'Loans'),
        table('Loans', [
          { key: 'principal', label: 'Borrowed', num: true, render: l => h('span', { 'data-rowname': '' }, money(l.principal)) }, { key: 'balance', label: 'Balance', num: true, render: l => money(l.balance) },
          { key: 'rate', label: 'Rate', num: true, render: l => h('span', { 'data-rowname': '' }, (l.rate * 100).toFixed(2) + '%') }, { key: 'payment', label: 'Monthly', num: true, render: l => money(l.payment) },
          { key: 'left', label: 'Payments left', num: true }, { key: 'pay', label: '', sortable: false, render: l => h('button', { type: 'button', 'data-key': 'payoff-' + l.id, onclick: () => act(G.payOffLoan(st, l.id), false, 'cash') }, 'Pay off') }],
        b.loans, { hideCaption: true, rowHeader: false, empty: 'No loans.' })),
      h('section', { class: 'card' }, h('h2', null, 'Checking statement'),
        table('Recent transactions', [
          { key: 't', label: 'Date', render: x => fmtShortDate(x.t) }, { key: 'desc', label: 'Transaction' },
          { key: 'amount', label: 'Amount', num: true, render: x => h('span', { class: x.amount < 0 ? 'bad' : 'good' }, money2(x.amount)) }, { key: 'bal', label: 'Balance', num: true, render: x => money(x.bal) }],
        b.txns.slice(-40).reverse(), { hideCaption: true, rowHeader: false })));
  },
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
    return h('div', { class: 'stack' }, h('div', { class: 'view-head' }, h('h1', null, 'Reports')), tabs, h('section', { class: 'card stack', id: 'rep-panel', role: 'tabpanel', 'aria-labelledby': 'rt-' + v.tab }, reportBody(st, v.tab)));
  },
};
function plTable(L, title) {
  const inc = [['Product sales', L.income.sales], ['Equipment sold', L.income.equipment], ['Savings interest', L.income.interest], ['Other income', L.income.misc]];
  const exp = [['Rent', L.expense.rent], ['Personnel', L.expense.personnel], ['Purchases', L.expense.purchases], ['Equipment', L.expense.equipment], ['Running costs and repairs', L.expense.running], ['Loan payments and interest', L.expense.loans], ['Fines and fees', L.expense.fines], ['Other costs', L.expense.misc]];
  const ti = inc.reduce((s, x) => s + x[1], 0), te = exp.reduce((s, x) => s + x[1], 0);
  return table(title, [{ key: 0, label: 'Line' }, { key: 1, label: 'Amount', num: true, render: r => r[2] ? h('strong', null, money(r[1])) : money(r[1]) }],
    [...inc, ['Total income', ti, 1], ...exp, ['Total expenses', te, 1], ['Net profit (loss)', ti - te, 1]], { rowHeader: true });
}
function reportBody(st, tab) {
  const last = st.history[st.history.length - 1];
  switch (tab) {
    case 'general': return [h('h2', null, 'General information'), kv([['Business name', st.setup.company], ['Owner', st.setup.owner || '—'], ['City', st.city.name], ['Address', st.city.lots[st.lotId].addr], ['Today', fmtDate(st.time)], ['Months in business', String(st.history.length)], ['Employees', num(st.employees.length)], ['Machines', num(st.floor.objects.filter(o => o.kind === 'machine').length)], ['Net worth', money(G.netWorth(st))], ['Score', money(G.score(st))], st.obligation ? ['Obligation', `${money(st.obligation.target)} by ${monthLabel(st.obligation.deadline)}${st.obligation.done ? ` (${st.obligation.done})` : ''}`] : null])];
    case 'balance': {
      const assets = [['Checking', st.bank.checking], ['Savings', st.bank.savings], ['Accounts receivable', G.arTotal(st)], ['Inventory', G.inventoryValue(st)], ['Equipment and fixtures', G.equipmentValue(st)]];
      const liab = [['Loans and credit line', G.loansTotal(st)], ['Accrued payroll', G.accruedPayroll(st)], ['Accounts payable', G.apTotal(st)]];
      const ta = assets.reduce((s, x) => s + x[1], 0), tl = liab.reduce((s, x) => s + x[1], 0);
      return [h('h2', null, 'Balance sheet'), table('Balance sheet', [{ key: 0, label: 'Line' }, { key: 1, label: 'Amount', num: true, render: r => r[2] ? h('strong', null, money(r[1])) : money(r[1]) }],
        [...assets, ['Total assets', ta, 1], ...liab, ['Total liabilities', tl, 1], ['Net worth', ta - tl, 1]], { hideCaption: true })];
    }
    case 'pl': return [h('h2', null, 'Profit and loss'), h('div', { class: 'grid2' }, h('div', null, plTable(st.ledger, `This month (${monthLabel(st.ledger.month)}, so far)`)), last ? h('div', null, plTable(last, `Last month (${monthLabel(last.month)})`)) : h('p', { class: 'muted' }, 'No completed month yet.'))];
    case 'assets': return [h('h2', null, 'Assets'), table('Equipment', [{ key: 'name', label: 'Item' }, { key: 'bought', label: 'Bought', render: o => fmtShortDate(o.bought) }, { key: 'cost', label: 'Paid', num: true, render: o => money(o.cost) }, { key: 'value', label: 'Value now', num: true, render: o => money(o.value) }],
      st.floor.objects.filter(o => !o.fixed).map(o => ({ ...o, name: o.kind === 'conveyor' ? 'Conveyor section' : objectLabel(st, o) })), { hideCaption: true })];
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
    st.history.slice().reverse(), { empty: 'No completed months yet.' });
}

// ================= Research
// cell technologies: worked on by engineers who aren't running a research machine; each unlocks cell extras
function techSection(st) {
  const ct = st.cellTech || { done: {}, active: null }, a = ct.active;
  const free = G.techResearchers(st);
  const rows = Object.entries(TECHS).map(([id, t]) => ({ id, ...t, unlocks: Object.values(CELL_ITEMS).filter(d => d.tech === id).map(d => d.name).join(', '), done: !!ct.done[id], active: a?.id === id }));
  return h('section', { class: 'card stack', 'aria-labelledby': 'tech-h' }, h('h2', { id: 'tech-h' }, 'Cell technology'),
    h('p', null, `Unlocks extras for production cells. Any ${jobFor('researcher').title} not at a research machine works on it (${free.length} now). One project at a time; you pay when it starts.`),
    a ? h('div', { class: 'stack', style: { gap: '4px' } }, h('p', null, h('strong', null, TECHS[a.id].name), ` · ${Math.floor(a.hours)} of ${a.need} engineer-hours${free.length ? '' : ' · paused: no engineer is free'}`), meter(a.hours / a.need, `${TECHS[a.id].name} progress`)) : null,
    table('Cell technologies', [
      { key: 'name', label: 'Technology', render: r => h('span', null, h('strong', { 'data-rowname': '' }, r.name), h('br'), h('small', { class: 'muted' }, r.desc)) },
      { key: 'unlocks', label: 'Unlocks' },
      { key: 'hours', label: 'Hours', num: true },
      { key: 'cost', label: 'Cost', num: true, render: r => money(r.cost) },
      { key: 'go', label: '', sortable: false, render: r => r.done ? pill('Done', 'ok', '✓') : r.active ? pill('In progress', 'info') : h('button', { type: 'button', 'data-key': 'tech-' + r.id, disabled: !!a, onclick: () => act(G.startTech(st, r.id), false, 'research') }, 'Start') }],
      rows, { hideCaption: true }));
}
export const research = {
  live: true,
  render() {
    const st = app.st;
    const rm = st.floor.objects.filter(o => o.kind === 'machine' && o.mode === 'research');
    const locked = RECIPES.filter(r => !G.recipeAvailable(st, r.id));
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Research'), h('p', null, `Some products have to be developed before you can make them. Pick a machine of the right line on the floor, choose "Research a new product" and put ${aOrAn(jobFor('researcher').title)} on it. ${aOrAn(jobFor('research_lead').title, true)} speeds up every project.`))),
      h('section', { class: 'card' }, h('h2', null, 'Projects under way'), table('Projects', [
        { key: 'm', label: 'Machine', render: o => objectLabel(st, o) },
        { key: 't', label: 'Target', render: o => o.research ? ITEMS[RECIPES[o.research.target].out].name : '—' },
        { key: 'p', label: 'Progress', render: o => o.research ? h('span', { class: 'row' }, meter(o.research.hours / o.research.need, 'Progress'), `${Math.floor(o.research.hours)} / ${o.research.need} h`) : '—' },
        { key: 's', label: 'Status', render: o => o.status }], rm, { hideCaption: true, empty: 'No research running.' })),
      h('section', { class: 'card' }, h('h2', null, 'Products still to develop'), table('Locked products', [
        { key: 'name', label: 'Product', render: r => ITEMS[r.out].name }, { key: 'fam', label: 'Machine', render: r => FAMILIES[r.family].name },
        { key: 'price', label: 'Market price', num: true, render: r => money2(st.city.market[r.out].price), sort: r => st.city.market[r.out].price },
        { key: 'known', label: 'Known in town', render: r => st.city.aiKnown[r.id] ? pill('Yes: research twice as fast', 'info') : 'No' }], locked, { hideCaption: true })),
      techSection(st),
      st.research.done.length ? h('section', { class: 'card' }, h('h2', null, 'Developed'), h('ul', null, st.research.done.map(d => h('li', null, `${ITEMS[RECIPES[d.rid].out].name} (${fmtShortDate(d.t)})`)))) : null);
  },
};

// ================= Options & help
export const options = {
  render() {
    const st = app.st;
    const sel = (id, label, val, opts, on) => field(label, h('select', { id, onchange: e => on(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(val) === String(v) }, l))));
    const chk = (id, label, val, on) => h('div', { class: 'row' }, h('input', { type: 'checkbox', id, checked: !!val, onchange: e => on(e.target.checked) }), h('label', { for: id, style: { fontWeight: 400 } }, label));
    const set = (k, v) => { prefs[k] = v; applyPrefs(); announce('Setting saved.', 'polite', false); };
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('h1', null, 'Options and help')),
      st && st.phase === 'play' ? h('section', { class: 'card stack' }, h('h2', null, 'Game'),
        h('div', { class: 'row' },
          [1, 2, 3].map(n => h('button', { type: 'button', onclick: async () => { st._nw = Math.round(G.netWorth(st)); const r = await saveGame(String(n), st); announce(r.ok ? `Saved to slot ${n} in this browser.` : r.msg, r.ok ? 'polite' : 'assertive'); } }, `Save to slot ${n}`)),
          h('button', { type: 'button', onclick: async () => { const r = await exportFile(st); announce(r.msg, r.ok ? 'polite' : 'assertive'); } }, 'Export save file')),
        h('div', { class: 'row' },
          h('button', { type: 'button', onclick: async () => { if (!(await confirmBox('Retire?', `Retire now and record a score of ${money(G.score(st))} on this computer?`, 'Retire'))) return; if (!st.setup.sandbox) await submitScore({ company: st.setup.company, city: st.city.name, score: G.score(st), months: st.history.length, scenario: st.setup.scenario }); announce('Score recorded. The company is retired.'); app.st = null; go('start'); } }, 'Retire and record score'),
          h('button', { type: 'button', class: 'danger', onclick: async () => { if (await confirmBox('Quit to the title screen?', 'Anything since your last save will be lost.', 'Quit', true)) { app.st = null; app.speed = 0; go('start'); } } }, 'Quit to title screen'))) : null,
      h('section', { class: 'card stack' }, h('h2', null, 'Display and sound'),
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
      h('section', { class: 'card stack' }, h('h2', null, 'Play'),
        chk('o-pause', 'Pause the clock when an urgent memo arrives', prefs.pauseOnAlert, v => set('pauseOnAlert', v)),
        chk('o-auto', 'Autosave at the start of each month', prefs.autosave, v => set('autosave', v)),
        chk('o-keys', 'Single-key shortcuts (space, [ ], g then a letter)', prefs.shortcuts, v => set('shortcuts', v))),
      h('section', { class: 'card stack' }, h('h2', null, 'How to play'),
        h('ol', { style: { margin: 0, paddingLeft: '1.2em', display: 'grid', gap: '6px' } },
          h('li', null, 'Lease a building in a city. Rent is due on the first of each month.'),
          h('li', null, "Buy a machine from the Catalog and set it on the floor. Leave its input squares, output square, operator's post and service hatch clear, and paint a safety zone on each input square."),
          h('li', null, `Hire ${aOrAn(jobFor('operator').title)} and put them on the machine. Office staff each need a desk.`),
          h('li', null, 'Buy materials on the Purchasing page. Deliveries land in your storage zones; paint more storage as you grow.'),
          h('li', null, 'Start the clock. Finished goods ship at 3 pm on weekdays to customers around town. Set prices on the Sales page.'),
          h('li', null, 'Grow: link machines with conveyor belts, add pallet jacks and forklifts, staff up the office, keep a mechanic on hand, research new products, and move to a bigger building when you run out of room.'))),
      h('section', { class: 'card stack' }, h('h2', null, 'Keyboard'),
        table('Keyboard shortcuts', [{ key: 0, label: 'Keys' }, { key: 1, label: 'Action' }], [
          ['Space', 'Start or pause the clock, on the factory floor too (not when focus is on a button)'], ['[ and ]', 'Slower or faster'], ['g then f', 'Factory floor'], ['g then c', 'Catalog'], ['g then s', 'Staff'], ['g then h', 'Hiring'], ['g then i', 'In-basket'], ['g then p', 'Purchasing'], ['g then l', 'Sales'], ['g then b', 'Bank'], ['g then r', 'Reports'], ['g then m', 'City map'], ['g then n', 'Nation'], ['g then d', 'Research'], ['?', 'This page'],
          ['After g', 'The next key only moves between screens, on the factory floor too: g then m opens the City map and does not start a move'],
          ['On the floor: arrows', 'Move the cursor (Shift: five squares)'], ['Enter', 'Select or place (Space as well when single-key shortcuts are off)'], ['R', 'Rotate'], ['M', 'Move the selected item'], ['Delete', 'Sell the selected item'], ['I', 'Jump to the inspector'], ['Escape', 'Cancel']], { hideCaption: true })),
      h('section', { class: 'card stack' }, h('h2', null, 'About'),
        h('p', null, 'Overhead is a 90s-style factory management sim, released as free software: the code under the MIT licence, the art and text under CC BY 4.0. City populations come from the US Census Bureau, and the map from us-atlas. The source code and credits are in the project repository.')));
  },
};
