// Office suites: rooms the player sizes, gives a door and furnishes, like production cells. One desk (with its chair)
// comes with the room; each desk seats one office worker, so a big suite can be open plan. Productivity per desk comes
// from what touches that desk (computer +18%, storage cabinet +6%, filing cabinet +4%, so a fully kitted desk matches
// the Workstation office), plus a few room-wide extras. Crowding and noise from extra desks take it away; partitions
// win some back. Comfort (plants, heating, rug, water cooler, coffee) lifts the occupants' morale.
import { CELL_ITEMS, itemDef, itemTiles, workSquare, hatchInner } from './cells.js';

const O = {
  odesk: { name: 'Desk and chair', w: 2, h: 1, price: 1600, role: 'desk', look: 'desk', desc: 'Seats one office worker. The chair goes on the marked square in front, which must stay clear and reachable from the door.' },
  ofile: { name: 'Filing cabinet', w: 1, h: 1, price: 450, role: 'extra', look: 'ofile', near: 'desk', fx: { prod: 0.04 }, desc: '+4% for each desk it touches (once per desk).' },
  ostore: { name: 'Storage cabinet', w: 1, h: 1, price: 700, role: 'extra', look: 'ostore', near: 'desk', fx: { prod: 0.06 }, desc: '+6% for each desk it touches (once per desk).' },
  opc: { name: 'Computer', w: 1, h: 1, price: 2300, role: 'extra', look: 'opc', near: 'desk', fx: { prod: 0.18, pc: 1 }, desc: '+18% for the desk it touches (one per desk).' },
  ofax: { name: 'Fax and copier', w: 1, h: 1, price: 1800, role: 'extra', look: 'ofax', fx: { roomProd: 0.03 }, desc: '+3% for every desk in the suite (one counts).' },
  oshelf: { name: 'Bookcase', w: 1, h: 1, price: 600, role: 'extra', look: 'oshelf', fx: { roomProd: 0.02, comfort: 2 }, desc: 'Manuals and references: +2% for every desk (one counts), a little comfort.' },
  oplant: { name: 'Pot plant', w: 1, h: 1, price: 120, role: 'extra', look: 'oplant', fx: { comfort: 4 }, max: 3, desc: '+4 comfort (up to three count).' },
  orad: { name: 'Radiator', w: 1, h: 1, price: 350, role: 'extra', look: 'orad', fx: { comfort: 6 }, perArea: 20, desc: '+6 comfort; one counts for every 20 squares of room.' },
  ocool: { name: 'Water cooler', w: 1, h: 1, price: 400, role: 'extra', look: 'ocool', fx: { comfort: 5 }, max: 1, desc: '+5 comfort (one counts).' },
  ocoffee: { name: 'Coffee machine', w: 1, h: 1, price: 900, role: 'extra', look: 'ocoffee', fx: { comfort: 6 }, max: 1, desc: '+6 comfort (one counts).' },
  orug: { name: 'Rug', w: 2, h: 2, price: 500, role: 'extra', look: 'orug', floor: true, fx: { comfort: 4 }, max: 1, desc: '+4 comfort. People can walk on it.' },
  opart: { name: 'Partition screen', w: 1, h: 1, price: 250, role: 'extra', look: 'opart', fx: { quiet: 1 }, desc: 'Each one cancels the noise of one extra desk.' },
  oserver: { name: 'Network server', w: 1, h: 1, price: 9000, role: 'extra', look: 'oserver', tech: 'networking', fx: { network: 0.10 }, max: 1, desc: '+10% for every desk that has a computer.' },
  olamp: { name: 'Task lamp', w: 1, h: 1, price: 800, role: 'extra', look: 'olamp', near: 'desk', tech: 'ergonomics', fx: { prod: 0.04, comfort: 3 }, desc: '+4% for the desk it touches (once per desk) and +3 comfort.' },
};
for (const [t, d] of Object.entries(O)) CELL_ITEMS[t] = { t, ...d, suite: true };
export const SUITE_REQUIRED = [{ t: 'odesk', n: 1 }];
export const SUITE_EXTRAS = ['odesk', 'ofile', 'ostore', 'opc', 'ofax', 'oshelf', 'oplant', 'orad', 'ocool', 'ocoffee', 'orug', 'opart', 'oserver', 'olamp'];
export const SUITE_MIN = [3, 3], SUITE_MAX = [14, 10];
export function suitePrice(cw, ch) { return Math.round((2400 + 90 * cw * ch) / 50) * 50; }
export function defaultSuiteHatches(d) { return [{ role: 'door', lx: Math.floor(d.cw / 2), ly: d.ch }]; }

const touching = (a, b) => itemTiles(a).some(([x, y]) => itemTiles(b).some(([u, v]) => Math.abs(x - u) <= 1 && Math.abs(y - v) <= 1));
function bfs(d, blocked, from) {
  const W = d.cw, H = d.ch, dist = new Array(W * H).fill(Infinity); if (!from) return dist;
  const [sx, sy] = from; if (blocked.has(sx + ',' + sy)) return dist;
  dist[sy * W + sx] = 0; const q = [[sx, sy]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked.has(nx + ',' + ny) || dist[ny * W + nx] !== Infinity) continue; dist[ny * W + nx] = dist[y * W + x] + 1; q.push([nx, ny]); } }
  return dist;
}
export function analyseSuite(d) {
  const items = d.items || [], problems = [];
  const desks = items.filter(it => it.t === 'odesk');
  if (!desks.length) problems.push('Place a desk.');
  const door = (d.hatches || []).find(h => h.role === 'door'); if (!door) problems.push('Place the door.');
  const blocked = new Set(); for (const it of items) if (!itemDef(it.t).floor) for (const [x, y] of itemTiles(it)) blocked.add(x + ',' + y);
  const dist = bfs(d, blocked, door && hatchInner(d, door));
  if (door) desks.forEach((k, i) => { const [x, y] = workSquare(k); if (x < 0 || y < 0 || x >= d.cw || y >= d.ch || dist[y * d.cw + x] === Infinity) problems.push(`Desk ${i + 1}'s chair can't be reached from the door.`); });
  const count = t => items.filter(it => it.t === t).length;
  // room-wide
  const roomProd = (count('ofax') ? 0.03 : 0) + (count('oshelf') ? 0.02 : 0);
  const area = d.cw * d.ch, n = Math.max(1, desks.length);
  const perDeskArea = area / n, crowd = Math.max(0, 6 - perDeskArea) * 0.03;
  const noisy = Math.max(0, desks.length - 1 - count('opart')), noise = noisy * 0.02;
  const server = count('oserver') > 0;
  const deskBonus = desks.map(k => {
    let b = 0; const seen = new Set(); let pc = false;
    for (const it of items) {
      const df = itemDef(it.t); if (!df.fx || df.near !== 'desk' || seen.has(it.t) || !touching(it, k)) continue;
      seen.add(it.t); b += df.fx.prod || 0; if (df.fx.pc) pc = true;
    }
    if (pc && server) b += 0.10;
    return Math.round((b + roomProd - crowd - noise) * 100) / 100;
  });
  const capped = (t, m) => Math.min(count(t), m);
  let comfort = 50 + capped('oplant', 3) * 4 + Math.min(count('orad'), Math.max(1, Math.ceil(area / 20))) * 6 + capped('ocool', 1) * 5 + capped('ocoffee', 1) * 6 + capped('orug', 1) * 4 + (count('oshelf') ? 2 : 0) + count('olamp') * 3 - crowd * 150 - noisy * 3;
  comfort = Math.max(0, Math.min(100, comfort));
  const avg = deskBonus.length ? deskBonus.reduce((a, b) => a + b, 0) / deskBonus.length : 0;
  return { ok: !problems.length, problems, seats: desks.length, deskBonus, avg, comfort, crowd, noise, noisy, perDeskArea };
}
// a sensible starting layout: one desk facing the door with a filing cabinet beside it
export function standardSuite(d) {
  const keep = d.items.filter(it => it.t !== 'odesk');
  for (let r = 0; r < 4; r++) for (let y = 0; y < d.ch; y++) for (let x = 0; x < d.cw; x++) {
    const it = { t: 'odesk', x, y, rot: r }; const trial = { ...d, items: [...keep, it] };
    if (suiteItemOk(trial, it) && analyseSuite(trial).ok) return trial.items;
  }
  return null;
}
function suiteItemOk(d, it) { const tiles = itemTiles(it); return tiles.every(([x, y]) => x >= 0 && y >= 0 && x < d.cw && y < d.ch); }
