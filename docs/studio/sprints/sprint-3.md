# Sprint 3

Sam's request: "everything needs to fit on one screen … avoid vertical scrolling … stack some game elements: almost all
job roles have levels of seniority. Staff start at the bottom and learn through 3 stages, indicated by a line with 3 dots
on their profile card. One simple job advert; sometimes level 1, 2 or 3 people will apply and you can select them.
Junior, senior, director. Then staff will gain exp as they go."

Sam chose to do **staff seniority first**; the one-screen pager for every section is sprint 4. Four specs, built on
`sprint-3/integration`, which continues from `studio/sprint-2` (PR #2 is still open, so this branch is stacked on it).
The save format moved to **version 2**.

## What shipped

| Spec | What the player sees |
|---|---|
| **010 Seniority ladders** | Seven families (Operations, Maintenance, Engineering, Finance, Sales, Promotions, Purchasing), each three jobs: Junior, Senior, Director (Junior Operator, Senior Operator, Operations Director, and so on). People with a post earn experience each working day, a little faster at a job that suits them, and are promoted automatically at 130 and 560. A promotion raises skill and pay (pay keeps its place on the city scale) and sends a quiet memo. Directors lead: the Operations Director is the foreman, and the Finance, Sales, Promotions and Purchasing Directors lead their departments. The Plant Director stays alone at the top. Old saves convert on load. |
| **011 One advert** | Hiring is one page: large tabs for each family and the Plant Director, a three-rung line with each level's title, the city's pay and how many you have, and one **Place ad** ($300, $550 for the Plant Director). Applicants arrive 70% Junior, 25% Senior, 5% Director, and the Resumes list under the line names the level. |
| **012 Profile cards** | Staff are one card at a time: name, title, a line with three dots filled to the person's level and part-way to the next ("Senior, 49% of the way to Director"), pay against the city, skill, morale, stress, where they work and what they are doing, and **Details**. Previous and Next buttons, a "3 of 8" count, the arrow keys and a swipe move between cards; department tabs narrow the list. The carousel is one reusable component (`carousel` in `dom.js`). |
| **013 Balance** | The long test now measures promotions, the first Senior and Director months and payroll growth, and asserts bands on all three seeds (below). |

Screenshots: [Hiring on a phone](evidence/sprint-3/s3-hiring-phone.png), [Hiring on desktop](evidence/sprint-3/s3-hiring-desktop.png),
[Staff on a phone](evidence/sprint-3/s3-staff-phone.png), [Staff on desktop](evidence/sprint-3/s3-staff-desktop.png).
The "before" measurements are in the [playtest](../playtests/sprint-3.md).

## Screen fit, before and after

Pages tall, in screens of the visible area (390 × 844 / 360 × 740 / 844 × 390). Only the two pages this sprint rebuilt
changed; every other section is as tall as it was, which is why sprint 4 exists.

| Page | Before | After |
|---|---|---|
| Hiring | 6.4 / 8.2 / 14.3 | **1.0 / 1.3 / 2.1** |
| Staff | 1.9 / 2.2 / 4.0 | **1.0 / 1.1 / 2.1** |

Still over one screen on a phone: floor 2.7, catalog 6.1, research 11.3, sales 1.9, bank 2.5, city 4.5, nation 16.1,
options 6.7, purchasing 1.8 (all at 390 × 844). Both rebuilt pages are one screen at 390 × 844 with no resumes waiting; a
long resume list adds to Hiring. Full tables: `playtests/evidence/sprint-3/`.

## Balance (spec 013)

Three seeds, 24 months: net worth ends 13.0 to 15.5 times the start (band 2.5 to 18). 14 to 15 promotions in each game;
the first Senior arrives in month 5.3 to 5.5 (band 5 to 8) and the first Director in month 22.7 to 23.3 (band 18 to 24);
the payroll ends 49 to 51% above what the same people would cost unpromoted (band 35 to 65).

Three things moved from the specs, all recorded in `decisions.md`:

- **Director takes 560 experience, not 430, and skill grows 0.10 a level, not 0.05.** The first numbers gave a Director
  in month 17.5, and a plant that learned ended worth 7 to 39% less than one that did not. With the new numbers, running
  the same seeds with promotion off ends within about 13% of the version with learning (one seed 13% lower, two 1 and 5%
  higher): learning roughly pays for itself, not "a little more than" as the spec hoped. Differences of a few percent
  between runs are noise, because the bot makes different choices after the first differing month.
- **The payroll band is 35 to 65%, not 15 to 40%.** The spec's guess was lower than arithmetic allows: everyone reaches
  Senior in the first year and a Senior costs 1.4 to 1.6 times a Junior.
- **The output-per-employee band (5 to 15%) is not asserted.** Output per head depends mostly on which products the bot
  picks, so the comparison would mislead.

**Open question for Sam: the foreman.** The foreman effect (a lift to the whole floor, up to 18%) is now only on the
Operations Director, level 3. A new player cannot buy a foreman on day one; they promote an operator (about two years) or
get lucky with an advert (5%). I chose this for balance safety. Putting it on Senior is one line in `data/world.json`
and would need the long test re-run.

## What slipped

- Nothing from the four specs. Promotion by hand, choosing the level in the advert, firing and re-hiring tactics,
  and a "who is ready" list are out of scope (specs 011 and 012); backlog rows are in `backlog.md`.
- Spec 012 asked for progress "64 of 300 days to Director". Experience is not days (it depends on how well the person
  suits the job), so the card says "49% of the way to Director" instead.
- The Staff summary kept its four facts but became a row of pills (no meters), as the spec asked.

## Review: what happened, honestly

Built and checked by the producer alone, as Sam asked after sprint 1. **No independent QA or content review has run.**
My own review was a read of the diff in `game.js` (migration, `learn`, `promote`, `placeAd`), `people.js`, `dom.js` and
the two views, and the tests below, which I wrote against the specs. The content scan passes. It flagged one title in the
first draft of the promotion family's names, so I replaced it with a fresh one and left the scan alone. If Sam wants an
independent pass, QA and the content check are ready to run on this branch.

**Not tested on a real phone** (see sprint 2): swipe and carousel were tested with emulated touch and real touch
sequences in headless Chromium at 390 × 844. **The seniority numbers have not been played by a person.** The long
test is a scripted player that never fires anyone and always hires Juniors; a player who hires only Seniors, or fires
and rehires, is outside what 013 measures.

**Save migration** was tested against the old fixture (`save-v1.json`) and a new one (`save-v2.json`, 250 played days).
Old Chief Engineers lose their desk assignment and become Engineering Directors on the floor. Old Floor Supervisors become
Operations Directors, and pay is unchanged (so they are paid below the new Director scale until a review).

## Gates on this branch

- Build, 14 Node test files (including the new `seniority.mjs`: 58 checks) and the content scan pass.
- Browser tests: 17 of 18 files pass in the full run, including new `hire_ui_test.py` (19 checks) and
  `staff_ui_test.py` (25 checks: cards, dots and words, buttons, arrows, swipe, announcements, department tabs, Details,
  axe, 390 × 844 height and card position, 44 px buttons). `keyboard_test.py`, `ui_test.py` and `phone_test.py` were
  updated for the new pages (phone's card-table checks now use the Nation page, since Hiring is no longer a table).
- **Performance:** sim tick unchanged. `perf_ui_test.py` (floor frame, 16 ms budget) fails in the full run and on three
  of four standalone runs, with 16.3 to 17.2 ms. Alternating seven runs of the sprint 2 build and this one: medians
  15.8 ms and 16.8 ms, ranges 15.2 to 18.2 and 15.9 to 17.2. This sprint touches no floor drawing, but the ranges
  overlap and I cannot rule out a small cost. Same position as sprints 1 and 2: the budget cannot be certified on this
  runner.

## For Sam

Nothing is pushed. This branch sits on top of PR #2 (sprint 2), which is still open, so a sprint 3 PR would either be
stacked on it (the diff shows only sprint 3 if its base is `studio/sprint-2`) or wait until you merge PR #2. Pushing and
opening it needs your go-ahead, as does anything outward. Sprint 4 (the one-screen pager) is planned in
`docs/studio/specs/DRAFT-staff-seniority-and-one-screen.md` and needs your agreement before I spec it.
