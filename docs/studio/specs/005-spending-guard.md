# 005 — Spending guard

Backlog Sprint 1 · Pillar 3 · Effort S · Save impact: none

## Problem

From the [sprint-1 playtest](../playtests/sprint-1.md):

- **P2-5:** *"With $73,796 in checking, the build went through at $91,800 and the game announced 'Overdraft: $19,024
  drawn on credit'. Nothing warned me before I confirmed."* ([p2-cell-nullnull-overdraft.png](../playtests/evidence/sprint-1/p2-cell-nullnull-overdraft.png))
- **P4-3:** *"The credit line costs 17% a year, and the only warning comes after the purchase."*
- **P1-1:** *"The bank statement shows two 'Late-payment fee' lines, which nothing had explained."* With no Finance
  staff, bills are paid 6 days late, so every bill carries a fee.

## Player story

As an owner, I choose to borrow; the game doesn't borrow for me. When a supplier charges a late fee, I'm told why and
what would stop it.

## Acceptance criteria

1. **Confirm before borrowing.** Before any purchase paid on the spot (a machine, a cell, a cell edit that costs
   more, an office or office suite, a conveyor section or a "Connect by belt" line, a storage bin, a pallet jack, a
   forklift) whose price is more than checking plus savings, a dialog asks first. Purchases that fit in checking and
   savings get no dialog. Taking a loan never asks.
2. **The dialog shows the borrowing.** Title "Buy on credit?"; text, for example: "This costs $91,800. You have $73,796
   in checking and $0 in savings, so **$18,004 would come from the credit line** at 17% a year. You would owe $18,004
   of your $75,000 limit." Buttons "Cancel" (focused first) and "Buy and borrow $18,004". Cancel buys nothing and
   leaves the cell editor, belt or placement as it was.
3. **Belts ask once.** When laying conveyor one square at a time or by dragging, the dialog appears on the first
   section that needs credit; after "Buy and borrow", the rest of that belt-laying session doesn't ask again. The
   session ends when the tool changes or Escape is pressed. The "Lay this belt?" confirm for "Connect by belt" gains
   the same credit sentence instead of a second dialog.
4. **Late fees are named on the statement.** The bank statement line reads "Late-payment fee, paid 6 days late:
   Zinc ingot from *vendor*" (the real delay and bill).
5. **Late fees are explained once a month.** The first late fee in a game month sends a memo from "Plant log" (001's
   sender), subject "Suppliers charged late fees", for example: "Suppliers added $84 in late fees because bills were
   paid 6 days late. Bills go out late when nobody keeps the books. A Bookkeeper would pay them on time, and customers
   would pay you sooner too." With Finance staff who are behind, it says Finance is behind and suggests one more
   Bookkeeper. Job titles come from `jobFor('finance')`, so they follow 001.
6. The "can't afford" check (over the credit limit) and the after-the-fact "Credit line drawn" memo stay as they are.
   Headless sims (`test/long.mjs`) buy without dialogs and stay inside the balance bands.

## Out of scope

- Material orders (paid by invoice ten days later), ads, retooling, cell technology research and moving the factory.
  The move dialog could gain the same sentence later.
- Any change to fees, rates or the credit limit.
- An option to turn the dialog off.

## Pillars served

3, Business tension: debt becomes a choice the player sees and makes.

## Accessibility notes

- **Keyboard:** the dialog is the native `<dialog>` from `confirmBox` in `src/ui/dom.js`: Tab between buttons,
  Escape cancels, and focus returns to the floor grid or the button that opened it (as spec 004 requires).
- **Screen readers:** the dialog title and the borrowed amount are in its text, so they are read when it opens. The
  memo is announced by the existing In-basket announcement.
- **No colour-only cues:** the borrowed amount is in words and bold, and the buy button names the amount.

## Balance knobs

Named, not changed. Credit rate `economy.bank.creditRate` 0.17 in `data/world.json`. Credit limit
`max(75,000, 0.5 × (equipment + inventory + receivables))` in `creditLimit()`. Late fee `0.015` of the bill per started
week of delay, charged only when the delay is over 3 days, in the bill-paying step of `src/sim/game.js`; the delay is 6
days with no Finance staff (`accountingDelay`). The builder may move the fee rate and the 3-day grace into
`economy` with the same values.

## Test plan

- **Node `test/spend.mjs` (new; criteria 1, 4–6):** `G.creditNeeded(st, price)` returns 0 when checking plus savings
  covers the price and the shortfall otherwise. With no Finance staff, a due bill gives a statement line with "paid 6
  days late" and one "Suppliers charged late fees" memo; a second late fee that month sends no memo; the next month
  sends one. A 30-day headless run still buys machines without a prompt.
- **Playwright `test/cell_ui_test.py`, extended (criteria 1–2):** set checking below a cell's price, confirm and
  build: the dialog shows the shortfall; Cancel leaves the editor open and cash unchanged; "Buy and borrow" builds it.
- **Playwright `test/belt_ui_test.py`, extended (criterion 3):** with little cash, lay five belt squares by keyboard:
  one dialog. axe with the dialog open.

## Save impact

None. The dialog is UI only. "First late fee this month" is read from this month's lines in `st.bank.txns`, which
are already saved, so no new field. The belt session flag lives in the floor view state, which isn't saved.

## Files likely touched

`src/sim/game.js` (`creditNeeded` helper, statement wording, late-fee memo), `src/ui/views/floor.js` (placement
`primary()`, `layBelt`), `src/ui/views/cellEditor.js` (`confirmCell`), `src/ui/dom.js` (only if `confirmBox` needs
rich text), new `test/spend.mjs`, `test/cell_ui_test.py`, `test/belt_ui_test.py`.

**Overlap:** 001 renames the memo sender ("Plant log") and the finance job titles used in the memo; 001's names
win. 003 also adds Plant log memos in `game.js`. 004 owns focus return after dialogs in `floor.js` and
`cellEditor.js`. 002 edits `cellMetrics` in `cellEditor.js`, next to `confirmCell`.
