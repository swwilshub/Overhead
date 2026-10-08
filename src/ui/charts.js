// Small accessible SVG charts: one tab stop per chart, arrow keys move between bars,
// hover and focus share one readout, and every chart carries a table view.
import { h, table } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); return el; };
export const SERIES = n => `var(--series-${n + 1})`;
const focusState = {}; // chart id -> highlighted index, survives live re-renders

function niceTicks(max, count = 4) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const raw = max / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw);
  const top = Math.ceil(max / step) * step; const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, ticks };
}
// rounded top corners only: the data-end gets the radius, the baseline stays square
function barPath(x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt);
  if (hgt <= 0) return '';
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

/**
 * Vertical bars, single series or stacked.
 * cols: [{label, short, segs:[{key, value}]}]   keys: [{key, label, color}]
 */
export function barChart({ id, title, desc, cols, keys, fmt, fmtTick, height = 220, tableCols, legend: forceLegend }) {
  const H = height, P = { l: 58, r: 10, t: 12, b: 26 };
  const totals = cols.map(c => c.segs.reduce((a, x) => a + Math.max(0, x.value), 0));
  const { top, ticks } = niceTicks(Math.max(...totals, 0));
  const readout = h('p', { class: 'chart-readout', 'aria-live': 'polite' });
  let geo = null, hi = null;
  const show = i => {
    if (i == null || i < 0 || i >= cols.length) { if (hi) hi.setAttribute('opacity', 0); readout.textContent = desc || ''; return; }
    focusState[id] = i;
    if (hi && geo) { hi.setAttribute('x', geo.P.l + geo.band * i); hi.setAttribute('opacity', 0.07); }
    const c = cols[i];
    readout.replaceChildren(h('strong', null, fmt(totals[i])), ` ${c.label}`, ...(keys.length > 1 ? c.segs.filter(x => x.value > 0).sort((a, b) => b.value - a.value).map(x => { const k = keys.find(kk => kk.key === x.key); return h('span', { class: 'chart-key' }, h('i', { style: { background: k.color }, 'aria-hidden': 'true' }), `${k.label} ${fmt(x.value)}`); }) : []));
  };
  // draw at the real pixel width so text stays at its true size
  const draw = W => {
    W = Math.max(260, Math.round(W));
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const band = iw / Math.max(1, cols.length), bw = Math.max(3, Math.min(34, band * 0.68));
    const Y = v => P.t + ih * (1 - v / top);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true', style: 'display:block;max-width:100%' });
    for (const t of ticks) {
      svg.append(s('line', { x1: P.l, x2: W - P.r, y1: Y(t), y2: Y(t), stroke: 'var(--line)', 'stroke-width': t === 0 ? 1.2 : 0.6 }));
      const tx = s('text', { x: P.l - 8, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--muted)', 'font-family': 'var(--font-mono)' }); tx.textContent = (fmtTick || fmt)(t); svg.append(tx);
    }
    hi = s('rect', { y: P.t, height: ih, width: band, fill: 'var(--ink)', opacity: 0, rx: 3 }); svg.append(hi);
    const maxLabels = Math.max(2, Math.floor(iw / 46)), every = Math.max(1, Math.ceil(cols.length / maxLabels));
    cols.forEach((c, i) => {
      const x = P.l + band * i + (band - bw) / 2;
      let acc = 0; const live = c.segs.filter(x => x.value > 0);
      live.forEach((seg, k) => {
        const y0 = Y(acc + seg.value), y1 = Y(acc); acc += seg.value;
        const isTop = k === live.length - 1, key = keys.find(kk => kk.key === seg.key);
        const d = isTop ? barPath(x, y0, bw, y1 - y0, 4) : `M${x},${y1}V${y0}H${x + bw}V${y1}Z`;
        svg.append(s('path', { d, fill: key?.color || 'var(--accent)', stroke: 'var(--panel)', 'stroke-width': live.length > 1 ? 2 : 0, 'paint-order': 'stroke' }));
      });
      if ((cols.length - 1 - i) % every === 0) { const tx = s('text', { x: P.l + band * i + band / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--muted)' }); tx.textContent = c.short || c.label; svg.append(tx); }
    });
    svg.addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(); const i = Math.floor(((e.clientX - r.left) / r.width * W - P.l) / band); if (i >= 0 && i < cols.length) show(i); });
    svg.addEventListener('pointerleave', () => { if (document.activeElement !== wrap) show(null); });
    geo = { P, band };
    return svg;
  };
  const wrap = h('div', { class: 'chart', tabindex: 0, role: 'group', 'data-key': 'chart-' + id, 'aria-label': `${title}. Use left and right arrow keys to read each bar.`,
    onkeydown: e => {
      const cur = focusState[id] ?? cols.length - 1;
      const n = { ArrowLeft: cur - 1, ArrowRight: cur + 1, Home: 0, End: cols.length - 1 }[e.key];
      if (n == null) return; e.preventDefault(); show(Math.max(0, Math.min(cols.length - 1, n)));
    },
    onfocus: () => show(focusState[id] ?? cols.length - 1),
    onblur: () => show(null) });
  wrap.append(draw(lastWidth[id] || 520));
  let lastW = 0;
  const ro = new ResizeObserver(([e]) => { if (!wrap.isConnected && lastW) { ro.disconnect(); return; } const w = Math.floor(e.contentRect.width); if (w && Math.abs(w - lastW) > 2) { lastW = w; lastWidth[id] = w; const keep = hi?.getAttribute('opacity') > 0 ? focusState[id] : null; wrap.replaceChildren(draw(w)); if (keep != null) show(keep); } }); ro.observe(wrap);
  show(document.activeElement?.dataset?.key === 'chart-' + id ? focusState[id] : null);
  const legend = keys.length > 1 || forceLegend ? h('ul', { class: 'chart-legend', 'aria-label': 'Legend' }, keys.map(k => h('li', null, h('i', { style: { background: k.color }, 'aria-hidden': 'true' }), k.label))) : null;
  const tbl = h('details', { class: 'chart-table' }, h('summary', null, 'Show as a table'),
    table(title, tableCols || [{ key: 'label', label: 'Period' }, ...keys.map(k => ({ key: k.key, label: k.label, num: true, render: r => fmt(r[k.key] || 0) })), ...(keys.length > 1 ? [{ key: 'total', label: 'Total', num: true, render: r => fmt(r.total) }] : [])],
      cols.map((c, i) => ({ label: c.label, total: totals[i], ...Object.fromEntries(c.segs.map(x => [x.key, x.value])) })), { hideCaption: true }));
  return h('figure', { class: 'chart-fig' }, h('figcaption', null, h('h3', null, title)), legend, wrap, readout, tbl);
}
const lastWidth = {};

// Horizontal bars as an HTML list: name, bar, value. Readable without any interaction.
export function hBars({ title, rows, fmt, max, note }) {
  const m = max ?? Math.max(1e-9, ...rows.map(r => r.value));
  return h('figure', { class: 'chart-fig' }, h('figcaption', null, h('h3', null, title), note ? h('p', { class: 'muted' }, note) : null),
    rows.length ? h('ul', { class: 'hbars' }, rows.map(r => h('li', null,
      h('span', { class: 'hb-name' }, r.label),
      h('span', { class: 'hb-track', 'aria-hidden': 'true' }, h('i', { style: { width: Math.max(0.5, Math.min(100, r.value / m * 100)) + '%', background: r.color || 'var(--accent)' } })),
      h('span', { class: 'hb-val num' }, fmt(r.value))))) : h('p', { class: 'muted' }, 'Nothing to show yet.'));
}

// A tiny trend line for table cells; the cell text carries the numbers.
export function sparkline(values, { w = 90, hgt = 24 } = {}) {
  if (!values || values.length < 2) return h('span', { class: 'muted' }, '—');
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const X = i => 2 + (w - 4) * i / (values.length - 1), Y = v => 3 + (hgt - 6) * (1 - (v - lo) / span);
  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, 'aria-hidden': 'true', style: 'vertical-align:middle' });
  svg.append(s('path', { d: values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(''), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  svg.append(s('circle', { cx: X(values.length - 1), cy: Y(values[values.length - 1]), r: 3, fill: 'var(--accent)', stroke: 'var(--panel)', 'stroke-width': 1.5 }));
  return svg;
}
