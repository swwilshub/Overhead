# 014 — Numbers by touch, not by keyboard

Backlog Sprint 4 · Pillars 1, 4 · Effort M · Save impact: none

## Problem

Sam: "We need to remove all manual text entry for the game, unless it's really needed. Focus on numbers first. Use
mobile controls for salary negotiations etc." Every number the player sets is typed into a text box today, which on a
phone means the on-screen keyboard covering the page, a decimal point to find, and a value that is easy to get wrong.

An audit of `src/ui` found six typed numbers and two typed names:

| Where | What is typed | Today |
|---|---|---|
| Resume dialog | salary offer | number box |
| Buy dialog | boxes to order | number box |
| Purchasing table | target stock per item | number box in every row |
| Sales table | our price per product | number box in every row |
| Bank | amount to move; loan amount | two number boxes |
| New company | scenario number | text box |
| New company | company name, your name | text boxes (not in this spec; see Out of scope) |

## Player story

As a player on a phone, I set a salary, a quantity, a price or an amount by tapping and sliding, and I can see what I am
about to agree to before I do.

## Acceptance criteria

1. **One reusable control.** `stepper()` in `dom.js`: a readout with **minus and plus buttons** (large, hold to repeat,
   speeding up the longer it is held), optional **preset chips** and an optional **slider**. A compact form (minus,
   readout, plus) fits a table cell. Values are clamped to a range and rounded to the step.
2. **Salary offer** is a stepper with a slider from 70% to 130% of the asking salary, steps of $500 and $2,000, and chips
   **Ask −10%, Ask −5%, Ask, Ask +5%**. A line under it says how the offer compares: "$27,000, 4% under what they ask".
   It starts at the asking salary.
3. **Order boxes** is a stepper (1 and 10 at a time) with chips for **2 days, a week and two weeks** of use, capped at
   the room left for orders.
4. **Purchasing targets** and **Sales prices** are compact steppers in their rows. A price steps by 1% of the market
   price (by 10% with a long hold or Page Up and Page Down) and never goes below one cent.
5. **Bank:** the amount to move has chips ($1,000, $5,000, $10,000, $50,000, $100,000) and a stepper; the loan amount is a
   stepper with a slider up to what the bank will lend, in $1,000 steps.
6. **Scenario number** is a stepper where 0 reads "Random", with a **Roll** button for a fresh number.
7. **No number box remains** in the game: `input[type=number]` and numeric text boxes are gone from every page and
   dialog. A test fails if one comes back.
8. **Keyboard and screen readers.** The readout is a spinbutton (arrow keys step, Page Up and Page Down take the big
   step, Home and End jump to the ends), named for what it sets, with a spoken value ("$27,000"). Buttons say what they
   do ("Increase the offer by $500"). A change is announced politely, once, not on every repeat.
9. **Touch.** Every button is at least 44 px and the slider's thumb is finger-sized; nothing needs the on-screen
   keyboard.
10. **A live page does not fight the player.** A page that redraws every second does not redraw while a stepper has
    focus, as it does not while someone types.

## Out of scope

- **Names.** Company and player name are text, and "really needed" is arguable (a company needs a name). Proposed for
  the next spec: pick from a short list of generated names with a re-roll, and drop the player name. Needs Sam's call.
- Changing how a salary offer is judged, or a back-and-forth counter-offer (the stepper makes one later easy).
- The one-screen pager (moved to sprint 5).

## Pillars served

1 Readable factory; 4 Accessible by default (no keyboard needed, large targets, spoken values).

## Accessibility notes

Spinbutton role on the readout with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext`; a native
`input[type=range]` for the slider (labelled, with `aria-valuetext`); live announcements throttled so holding a button
does not flood a screen reader; chips are real buttons with `aria-pressed` for the one that matches.

## Balance knobs

None. No numbers in the economy change.

## Test plan

- **Playwright `test/stepper_ui_test.py` (new):** the control's buttons, hold repeat, clamping, rounding, keys, slider,
  chips, announcements, 44 px targets; each of the six places is set with it and the game state changes; the salary
  line; "no number boxes anywhere" across every section and dialog; axe.
- Update `flow_test.py`, `ui_test.py`, `hire_ui_test.py` (which typed numbers).

## Save impact

None.

## Files likely touched

`src/ui/dom.js` (`stepper`), `src/ui/views/people.js`, `business.js`, `start.js`, `src/index.html`, tests.
