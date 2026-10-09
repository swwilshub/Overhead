// Spending guard: ask before a purchase paid on the spot borrows from the credit line.
import { h, announce, confirmBox } from './dom.js';
import { app } from './app.js';
import * as G from '../sim/game.js';
import { ECONOMY } from '../gen/data.js';
import { money } from '../core/util.js';

const rate = () => `${+(ECONOMY.bank.creditRate * 100).toFixed(2)}%`;

// Credit is only asked about when the bank would lend it; over the limit, the sim's own "cannot afford" message stands.
export function creditToAsk(st, price) {
  const need = G.creditNeeded(st, price);
  return need > 0 && need <= G.creditLimit(st) - st.bank.credit ? need : 0;
}
// "You have $A in checking and $B in savings, so $N would come from the credit line at 17% a year. ..."
export function creditWords(st, price) {
  const need = G.creditNeeded(st, price);
  return [`You have ${money(st.bank.checking)} in checking and ${money(st.bank.savings)} in savings, so `,
    h('strong', null, `${money(need)} would come from the credit line`),
    ` at ${rate()} a year. You would owe ${money(st.bank.credit + need)} of your ${money(G.creditLimit(st))} limit.`];
}

const pressed = s => document.querySelectorAll('.status .run button[data-key^="speed-"]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.key.slice(6) === s)));
// The numbers in the dialog must still be true when the player answers, so the clock stops while it is open and
// goes back to the speed it had (unless something else has changed it meanwhile). A paused clock stays paused.
async function withClockPaused(fn) {
  const speed = app.speed, runTo = app.runTo;
  if (speed) { app.speed = 0; app.runTo = null; pressed(0); }
  try { return await fn(); }
  finally { if (speed && !app.speed && !app.runTo && !(app.st && app.st.over)) { app.speed = speed; app.runTo = runTo; pressed(speed); } }
}
// A running clock re-renders the page and can detach what had focus, so put it back on purpose.
function refocus(opener) {
  const t = opener && opener.isConnected && opener !== document.body ? opener : document.getElementById('floor-app');
  t?.focus();
}

// Resolves true to go ahead (no borrowing needed, or the player chose to borrow), false if they cancelled.
// opts: title and lead (text before the credit sentence) for a dialog that already exists, such as "Lay this belt?";
// yes(need) names the buy button.
export async function confirmCredit(st, price, opts = {}) {
  const opener = document.activeElement;
  return withClockPaused(async () => {
    const need = creditToAsk(st, price);
    if (!need) return true;
    // a mouse press changes focus after its handler has run, which would take it back from Cancel
    await new Promise(r => setTimeout(r, 0));
    const { title = 'Buy on credit?', lead = `This costs ${money(price)}. `, yes = n => `Buy and borrow ${money(n)}` } = opts;
    const answer = confirmBox(title, [lead, ...creditWords(st, price)], yes(need), true);
    setTimeout(() => { const d = document.querySelector('dialog[open]'); if (d && !d.contains(document.activeElement)) d.querySelector('button')?.focus(); }, 30);
    const go = await answer;
    refocus(opener);
    if (!go) return false;
    const now = creditToAsk(st, price) || G.creditNeeded(st, price);
    if (now !== need) announce(`The amount to borrow is now ${money(now)}, not ${money(need)}.`, 'assertive');
    return true;
  });
}
