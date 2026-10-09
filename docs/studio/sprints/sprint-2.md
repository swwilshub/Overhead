# Sprint 2

Sam's request: "make the game work on mobile, so there will need to be some work on menus and popups. Maybe a pinch to
zoom screen." One sprint, four specs (one large, three medium), built in the order 007, 008, 006, 009 on
`studio/sprint-2`, one commit each. Sprint 1 had been merged into `main`, so this branch continues from it. The save
format is unchanged.

## What shipped

| Spec | What a phone player sees |
|---|---|
| **007 Phone shell** | A slim two-line top bar (company, money, the clock, four big speed buttons), a bottom bar with **Floor**, **Staff**, **In-basket** and **Menu**, and a Menu sheet with every section plus net worth, city, Run until… and Sound. In landscape the top bar is one line. |
| **008 Sheets** | Questions pop up as a sheet at the bottom with full-width buttons. Tapping a machine opens a short sheet with its name and status, with **Details** for the rest and **Close**; the plant stays in view. Messages show under the top bar. |
| **006 Floor touch** | Drag to look around, pinch to zoom (¼× to 4×), tap to select, **Fit** to see everything. Paint zones and Lay conveyor still work by dragging. Placing or moving shows **Place here**, **Rotate** and **Cancel**; nothing is bought until Place here. The floor keeps its scroll position when the page redraws, and a long press no longer cancels. |
| **009 Phone pages** | Tables are lists of cards (each value labelled, with a **Sort by** menu); the Nation page shows the map full width with the city list below it; Catalog tabs are one swipeable row; every control is finger-sized (checkboxes and radios are drawn at 44 px). |

Screenshots: [the floor](evidence/sprint-2/s2-floor.png), [a tapped machine](evidence/sprint-2/s2-machine-sheet.png)
and [its details](evidence/sprint-2/s2-machine-sheet-open.png), [placing](evidence/sprint-2/s2-placing.png),
[the Menu](evidence/sprint-2/s2-menu.png), [Hiring as cards](evidence/sprint-2/s2-hiring-cards.png) and
[landscape](evidence/sprint-2/s2-landscape.png). The "before" shots are in the
[playtest](../playtests/sprint-2.md).

## A bug found on the way, which affected every wide table

Building the shell showed pages zooming out on a phone. A phone widens the page to fit anything that overflows, and
the cause was hidden screen-reader text beside a table's last column: it is positioned absolutely, and the table's
clipping box was not a positioned box, so it escaped and widened the whole page. Hiring, Purchasing, Sales and the
Nation page were all 460 to 790 px wide on a 390 px screen. `main` and the table wrapper are now positioned boxes, and
four two-column layouts became one column. The earlier measurement had compared against `innerWidth`, which grows with
the page; the new tests compare against the device width.

## What slipped

Nothing from the four specs. Left for later (backlog 18 to 21): a better landscape floor layout, the cell designer on a
phone, swipe and long-press gestures, and a real-device pass.

## Review: what happened, honestly

This sprint was built and checked by the producer alone, as Sam asked after sprint 1. **No independent QA or content
review has run.** The producer's own review was a read of the changed code in `floor.js`, `dom.js` and `app.js`, plus
the tests below, which were written against the problems the playtest found. New strings are
plain interface words (Menu, Details, Close panel, Place here, Fit, Sort by…) and the scan passes. If Sam wants an
independent pass, QA and the content check are ready to run on this branch.

**Not tested on a real phone.** Everything ran in headless Chromium with touch emulation (390 × 844 and 844 × 390, and
320 and 430 px wide), including real multi-finger touch sequences. Safari on iPhone behaves differently in places (safe
areas, dynamic viewport height, dialog placement, how pinch feels), so a real-device pass is the first thing to do
(backlog 20; a row is added to the release checklist).

## Gates on this branch

- Build, 13 Node test files, the content scan and old-save loading pass. Browser tests: 16 files pass, including the new
  `phone_test.py` (85 checks: bars, Menu, sheets, cards, roles, sort, Nation, tabs, a 44 px sweep of every control on
  every section, largest text size, landscape, axe on every section in the phone layout and with the Menu, a dialog and
  the panel sheet open) and `touch_test.py` (42 checks: pan, tap, hold, pinch about the fingers' midpoint, zoom limits,
  two-finger pan, Fit, the zoom buttons, painting, laying belt, the placement bar, scroll kept across redraws).
- Both new tests passed on repeated runs. The existing desktop tests pass unchanged, and desktop checks inside the new
  tests confirm the side menu, dialogs and tables look as before.
- **Performance:** sim tick unchanged. The floor frame budget is marginal on this runner (see sprint 1). Alternating
  runs of the build just before the floor change and the build after it gave medians of 16.4 ms and 16.1 ms, so nothing
  got slower; the budget still cannot be certified here.

## Process change for next sprint

Measure against fixed device values. The first audit script compared page width with `innerWidth`, which grows with the
page on a phone, so it reported no overflow while the page was zooming out. It only caught the bug once the check used
the device width. Next sprint's playtest script will take the device width as a constant and fail on any difference.

## For Sam

Nothing is pushed. Pushing `studio/sprint-2` and opening the PR needs your go-ahead. The branch is clean on top of
`main`, so the PR will show only this sprint.
