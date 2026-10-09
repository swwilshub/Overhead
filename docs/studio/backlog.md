# Backlog

Scores: **impact** 1–5 (player impact), **effort** S, M or L, **pillars** served. The designer re-ranks this at each
triage. Status is one of: new, specced, in progress, review, done, dropped.

## Sprint 1 (triaged 2026-10-08 from `playtests/sprint-1.md`)

| Spec | Item | Impact | Effort | Pillars | Status | Evidence |
|---|---|---|---|---|---|---|
| 001 | **Clearer names (Sam's request):** staff roles, departments, line and machine names, statuses, storage and equipment names used the same way on every screen. | 5 | M | 1, 4 | review | Sam; playtest "Names and labels", P1-3 |
| 002 | **Broken text:** "[object HTMLElement]" in the side panel, "null" in the status bar, "nullnull" in the cell panel, "All fifty cities", a title blurb naming things not in the game. | 4 | S | 1, 4 | review | P1-2, P1-5, P2-5 |
| 003 | **Stalled machines are visible:** warn when a machine starves or jams, list stalled machines in "Needs attention", have the floor cursor read a machine's state, and fix Quick start's misleading first messages. | 5 | M | 1, 4 | review | P1-1, P1-4, P3-1, P3-2, P4-1 |
| 004 | **Keyboard and focus:** global shortcuts work from the floor grid, focus stays put after actions, and repeated buttons have distinct names. | 4 | M | 4 | review | P2-1, P2-2, P3-3 |
| 005 | **Spending guard:** warn before a purchase that would dip into the credit line, and explain late-payment fees when they're charged. | 3 | S | 3 | review | P1-1, P2-5, P4-3 |

Left for later sprints (from this playtest): the lease screen's legend and default building size (P1-5), one-key tool switching on the floor (P2-3), belt drawing and direction by keyboard (P2-4), dropped or repeated live-region messages (P3-4), landmark names (P3-5), belt wording in the inspector (P4-2), Quick start ignoring the scenario number (P4-4), the scripted late game stalling (P4-5).

## Sprint 2 (triaged 2026-10-09 from `playtests/sprint-2.md`)

Sam's request: make the game work on a phone: menus, pop-ups and a pinch-to-zoom floor. This is backlog item 10, split
into four specs (one large, three medium).

| Spec | Item | Impact | Effort | Pillars | Status | Evidence |
|---|---|---|---|---|---|---|
| 006 | **Touch controls for the floor:** drag to pan, pinch to zoom, tap to select, and a confirm bar before anything is placed. | 5 | L | 1, 4 | specced | Sam; M-1, M-2, M-9 |
| 007 | **Phone shell:** a slim top bar, a bottom bar and a menu sheet in place of the sideways strip of links. | 5 | M | 1, 4 | specced | Sam; M-4, M-5, M-12 |
| 008 | **Pop-ups and panels as bottom sheets:** dialogs at the thumb, the selected machine's panel on screen, toasts clear of the action. | 4 | M | 1, 4 | specced | Sam; M-3, M-8, M-10 |
| 009 | **Pages that fit a phone:** tables as cards with a sort menu, the Nation page, 44 px targets, one row of Catalog tabs. | 4 | M | 1, 4 | specced | Sam; M-6, M-7, M-9, M-11 |

Left for later: the cell designer on a phone, tablet-specific layouts, swipe between sections, and everything left over
from sprint 1.

## Full backlog

| # | Item | Impact | Effort | Pillars | Status | Notes |
|---|---|---|---|---|---|---|
| 0 | → spec 001. **Clearer names (Sam's request):** rename things so they explain themselves, especially staff roles such as operators and sales. | 5 | M | 1, 4 | new | Sam's first-sprint focus. Job titles, departments, lines and on-screen labels. Save impact: job keys are stored in saves. |
| 1 | **Onboarding:** a guided goal chain for the first ten minutes that teaches belts, jams, cells and cash flow. Skippable and screen-reader friendly. | 5 | L | 1, 3, 4 | new | Builds on the Getting started checklist. |
| 2 | **Belt tools:** splitters, mergers and priority lanes, so jams become a puzzle you can solve, not only a penalty. | 4 | L | 2 | new | Touches lanes and routing; save impact likely. |
| 3 | **Bottleneck lens:** an overlay that shades each machine by its starved, blocked or working time, with a matching table view. | 4 | M | 1, 4 | new | Needs per-machine time accounting. |
| 4 | **Scenarios:** three new start scenarios with clear win conditions, plus a seeded "daily challenge". | 3 | M | 3 | new | |
| 5 | **Events:** at least six new events of our own design, each with a choice rather than a pure penalty. | 3 | M | 3 | new | Needs a choice-memo mechanic. |
| 6 | **Research tree view:** a readable, keyboard-navigable tree in place of a list. | 3 | M | 1, 4 | new | |
| 7 | **Modding:** load a custom `world.json` from a file, with validation errors written in plain words. | 2 | M | — | new | Reuse the checks in `tools/gen_world.mjs`. |
| 8 | **Comfort settings:** text size, reduced motion, a high-contrast palette and a colour-blind-safe machine palette. | 3 | S | 4, 5 | new | Text size, reduced motion and high contrast exist already; the gap is the machine palette. |
| 9 | **Sound:** a mixer (effects, ambience, alerts) and an optional factory ambience that rises and falls with throughput. | 2 | S | 5 | new | |
| 10 | → specs 006 to 009. **Touch and small screens:** tap to place and pinch to zoom, with the floor playable at 768 px wide. | 3 | M | 4 | new | |
| 11 | **Render headroom (raised in sprint 1):** the floor frame on the largest building with 40 machines averages 13.4 ms, against a 16 ms budget (p95 17.5 ms, headless Chromium). Cache static layers per machine, or skip redrawing idle machines. | 3 | M | 1, 5 | new | Found while setting up `test/perf_ui_test.py`. |
| 12 | **Cell editor loses focus:** pressing Enter on "Standard layout" sends focus to the page body, because the panel is redrawn under the button. | 3 | S | 4 | new | QA on 002 (finding 3). Happens before 002. Check again once 004 has merged, since it adds focus keeping. |
| 13 | **Deselecting with Enter is silent:** Enter on an empty square clears the selection but only reads the square. Escape says "Selection cleared." | 2 | S | 4 | new | QA on 002 (finding 4). `primary()` in `floor.js`. |
| 14 | **"Set up a new company" link drops focus** to the page body. | 2 | S | 4 | new | QA on 002 (finding 5). The Nation map's arrow keys are covered by 004. |
| 15 | **Test tidy-up:** `ui_test.py` hard-codes 42 cities in the caption check, never checks the cell editor's room-size step for junk text, and skips axe on Research. | 1 | S | 4 | new | QA on 002 (findings 1 and 2). |
| 16 | **Tune stall notices:** a hands-off bot gets 216 to 424 "Machine stopped" memos in two years. Check with a playtest, then consider a longer gap per machine or one daily digest. | 3 | S | 1, 3 | new | Sprint 1 balance run. `STALL_REPEAT_MIN` in `game.js`. |
| 17 | **Idle machines count as running for wear:** a machine with nothing to work on still wears and can have accidents, because the sim's wear rules test for the "Running" status. Decide whether that is right. | 2 | S | 2, 3 | new | Found in sprint 1 while changing statuses; left alone to keep the balance. |

