// Spending guard: ask before a purchase paid on the spot borrows from the credit line.
import { h, confirmBox } from './dom.js';
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
// Resolves true to go ahead (no borrowing needed, or the player chose to borrow), false if they cancelled.
export async function confirmCredit(st, price) {
  const need = creditToAsk(st, price);
  if (!need) return true;
  return confirmBox('Buy on credit?', [`This costs ${money(price)}. `, ...creditWords(st, price)], `Buy and borrow ${money(need)}`, true);
}
