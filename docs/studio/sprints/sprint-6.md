# Sprint 6

Sam's request: "no everything must be on one screen on mobile." (From sprint 3: "For it to be a true mobile game everything needs
to fit on one screen and we make better use of large tabs and left and right navs, especially for clustered menus… We need to avoid
vertical scrolling.") One spec (016, effort L), built on `sprint-6/integration`, stacked on `sprint-5/integration`, which is stacked
on `studio/sprint-4` (PR #4). The save format is unchanged. I read "no" as: not only the factory floor's canvas, but every screen,
section and common dialog on a phone.

## What shipped

| Part | What the player sees on a phone |
|---|---|
| **A pager** | Each section is large tabs (a left rail on a phone on its side) over pages that fit the visible height. Previous and Next buttons (arrows at the edges in landscape), a swipe, the arrow keys on the tabs, and "2 of 5" where a group has more than one page. The place is kept while the clock redraws the page. |
| **Every section** | Staff, Hiring, In-basket, Purchasing, Sales, Bank, Reports, Research, Catalog, City, Nation and Options, and the start page, are pager pages. Long lists continue on the next page row by row; tables become grids of labelled values. |
| **Dialogs** | Resume and offer (Offer / About them), Buy, equipment list, Help, Legend, move plan and loan confirmation fit a sheet with their buttons always visible. |
| **The floor's panels** | An item's Details are pages in the bottom sheet; the cell and suite designer keep their steps and Confirm/Cancel on screen with the instructions and item lists as pages between. On a phone on its side these become a column down the right edge so the floor stays in view. |
| **Desktop** | Unchanged: long pages, tables, the preview in the catalog. |

Screenshots in `evidence/sprint-6/`: [start](evidence/sprint-6/s6-start.png), [purchasing](evidence/sprint-6/s6-purchasing.png),
[catalog](evidence/sprint-6/s6-catalog.png), [bank](evidence/sprint-6/s6-bank.png), [city](evidence/sprint-6/s6-city.png),
[hire](evidence/sprint-6/s6-hire.png), [reports](evidence/sprint-6/s6-reports.png), [options](evidence/sprint-6/s6-options.png),
[landscape catalog](evidence/sprint-6/s6-landscape-catalog.png), [landscape purchasing](evidence/sprint-6/s6-landscape-purchasing.png).

## Screen fit, before and after

Pages tall, in screens of the visible area, with plenty of content in the game (390 × 844 / 360 × 740 / 844 × 390). 1.0 is one screen.

| Section | Before | After |
|---|---|---|
| Catalog | 6.1 / 7.4 / 10.9 | **1.0 / 1.0 / 1.0** |
| Research | 11.3 / 13.7 / 26.6 | **1.0 / 1.0 / 1.0** |
| Purchasing | 3.2 / 3.0 / 5.5 | **1.0 / 1.0 / 1.0** |
| Sales | 1.9 / 2.3 / 4.1 | **1.0 / 1.0 / 1.0** |
| Bank | 2.9 / 3.5 / 5.2 | **1.0 / 1.0 / 1.0** |
| City | 4.5 / 5.4 / 10.2 | **1.0 / 1.0 / 1.0** |
| Nation | 16.1 / 20.1 / 39.5 | **1.0 / 1.0 / 1.0** |
| Options | 6.7 / 8.3 / 13.9 | **1.0 / 1.0 / 1.0** |
| Staff | 1.0 / 1.1 / 2.1 | **1.0 / 1.0 / 1.0** |
| Hiring | 1.0 / 1.3 / 2.1 | **1.0 / 1.0 / 1.0** |
| In-basket | 1.0 / 1.0 / 1.8 | **1.0 / 1.0 / 1.0** |
| Reports | 1.0 / 1.1 / 1.8 | **1.0 / 1.0 / 1.0** |
| Floor | 1.0 | **1.0** (the panels over it are below) |

Raw numbers: `playtests/evidence/sprint-6/screen-fit-after-sprint-6.json`. The floor's item Details and the designer's three steps are
checked at the same three sizes by `one_screen_test.py`; before this sprint Details scrolled inside the sheet (content 1445 / 2042 /
1372 px in sheets of 419 / 369 / 194 px).

## What it costs, honestly

- **More swiping.** The nation page is 39 screens of content on a phone on its side; it is now many one-screen pages. Where the order
  matters the pages follow it; where it does not, the tabs jump.
- **A phone on its side shows few lines per page** in the designer (the furnish step is 13 pages there) and the machine's Details
  (15). The packing is correct, the control is the problem; a better furnish control (a palette strip) is a new backlog idea, not more packing.
- **The catalog's preview is gone on a phone.** It was the largest block on that page.
- **A toast over the top of a landscape side panel** can cover its first line for a few seconds.

## Review: what happened, honestly

Built and checked by the producer alone, as Sam asked after sprint 1. **No independent QA or content review has run.** The checks
are the tests below, which I wrote against the spec, and screenshots I looked at. The content scan passes and I did not touch it.

**Not tested on a real phone.** Touch and swipe were tested with emulated touch and real touch event sequences in headless
Chromium at the three sizes. Real-hand feel (swipe thresholds, tab reach, how the pages feel on a long list) is untested. The
perf budget (16 ms floor frame) cannot be certified on this runner; the pager does no per-frame work.

## Gates on this branch

See the end of this file for the last full run.

- Build, content scan (untouched) and all Node tests pass, including the long balance test and the new `pager.mjs`.
- Browser tests, last full run: every file passes except two that I fixed or re-ran afterwards. `phone_test.py` expected a Details
  sheet of at most 55% of the screen with the Move/Sell buttons in view; the sheet is now pages up to 78%, so the test turns to
  the page with those buttons (it passes on its own). `touch_test.py`'s flick check ("carries on after the finger lifts") failed once
  in the full run and passed on two standalone runs; it is the same timing-sensitive check that needed retries in sprint 5, and I have
  not made it deterministic. Neither was re-run as part of one more full pass.
- New `one_screen_test.py` (start page, 13 sections with filled content, common dialogs, item Details and the designer's three
  steps, at three sizes) passes, axe clean on the paged pages.
- **Performance:** the pager does no per-frame work. The floor frame budget (16 ms) passed in this full run, but cannot be certified
  on this runner (marginal in sprints 1 to 5).

## For Sam

Nothing is pushed. This branch is stacked on sprint 5 (not pushed) on sprint 4 (PR #4). Pushing and opening a PR needs your go-ahead.
