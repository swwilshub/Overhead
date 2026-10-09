# Sprint 4

Sam's request: "We need to remove all manual text entry for the game, unless it's really needed. Focus on numbers first.
Use mobile controls for salary negotiations etc." One spec (014), built on `sprint-4/integration`, stacked on
`studio/sprint-3` (PR #3, still open). The one-screen pager that was planned for this sprint is now sprint 5. The save
format is unchanged.

## What shipped

An audit of `src/ui` found six typed numbers and two typed names. **All six numbers are gone.** One new control,
`stepper()` in `dom.js`, replaces them: large minus and plus buttons (hold to repeat, faster after one second and again
after two), optional preset chips, an optional slider, and a compact form for table cells. The readout is a spinbutton
(arrows, Page Up and Page Down, Home and End), named, with a spoken value; changes are announced once, half a second
after the last one.

| Where | Now |
|---|---|
| **Salary offer** | Slider from 70% to 130% of the ask; steps of $500 and $2,000; chips **Ask −10%, −5%, Ask, +5%**; a line saying "$36,100 is 5% under what they ask". Starts at the ask. |
| **Order boxes** | Steps of 1 and 10; chips for 2 days, a week and 2 weeks of use; "About 6.5 days of use"; stops at the room in storage and at what the chosen vendor has left this month. |
| **Purchasing targets** | A compact stepper in every row. |
| **Sales prices** | A compact stepper in every row, stepping by 1% of the market price (10% on a long hold or Page Up). |
| **Bank** | Amount to move: chips ($1,000 to $100,000) and a stepper. Loan: stepper and slider up to what the bank will lend. Both survive the page redrawing every second. |
| **Scenario number** | A stepper where 0 reads "Random", and a Roll button. |

A test fails if a number box comes back on any page or dialog. Screenshots (390 × 844):
[salary offer](evidence/sprint-4/s4-salary-offer.png), [order](evidence/sprint-4/s4-buy.png),
[Purchasing](evidence/sprint-4/s4-purchasing.png), [Bank](evidence/sprint-4/s4-bank.png),
[new company](evidence/sprint-4/s4-new-company.png).

## Behaviour changes worth knowing

- A page that redraws every second no longer redraws under a focused stepper (as it does not while someone types),
  or while a button is held. Half a second after the last step it redraws once, so "vs market" and similar figures catch up.
- The order amount now stops at the vendor's monthly supply. Before, the box accepted any number and the game quietly
  ordered fewer.
- Purchasing targets are merged at the moment of change. The old handler could drop an earlier edit; I did not reproduce
  that, I saw the risk in the code.

## What slipped

- **Names are still typed** (company and player name; the save-file chooser is a file picker and is needed). Proposed next:
  pick a company name from a short generated list with a re-roll, and drop the player name, which nothing in the game
  needs. It is Sam's call.
- Salary "negotiation" is still one offer, accepted or refused. The controls now make a back-and-forth (a counter-offer)
  easy to add. I did not change how an offer is judged.

## Review: what happened, honestly

Built and checked by the producer alone. **No independent QA or content review has run.** My review was a read of the
diff, and the new test, which I wrote against the spec. **Not tested on a real phone.** Hold-to-repeat, the slider and
chip layout were tested with emulated touch and mouse in headless Chromium; a real thumb on a real slider (especially
iOS Safari's range input, which draws differently) may feel different. The first run of the new test found three
layout faults on a 320 px screen and in the 44 px rule, now fixed. The salary dialog is tall on a phone (the resume's
history comes first, the offer controls last, above the sticky buttons); I left the order alone.

## Gates on this branch

- Build, 14 Node test files and the content scan pass. Browser tests: 17 of 18 files pass in the full run, including the
  new `stepper_ui_test.py` (52 checks: each of the six places, hold, keys, chips, slider, announcements, redraw, 44 px
  targets and no sideways scroll on three pages, no number box on any section, axe on four pages and two dialogs).
  `flow_test.py`, `ui_test.py` and `hire_ui_test.py` were updated to set numbers with the steppers.
- `phone_test.py` caught the Bank page 38 px too wide at 320 px; fixed and now passes.
- **Performance:** `perf_ui_test.py` (floor frame, 16 ms) is over budget on this runner, 16.2 to 16.8 ms, as in sprint 3. No
  floor drawing changed.

## For Sam

Nothing from this sprint is pushed. The branch is stacked on `studio/sprint-3` (PR #3); a PR for it would use that as its
base until you merge #3. Pushing and opening it need your go-ahead.
