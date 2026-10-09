# 003 — Stalled machines are visible

Backlog Sprint 1 · Pillars 1, 4 · Effort M · Save impact: none

## Problem

From the [sprint-1 playtest](../playtests/sprint-1.md):

- **P1-1:** *"The first order ran out after about a week… The Getting started checklist read '8 of 8 done'. 'Needs
  attention' showed nothing."* Over a fast-forwarded month the only memo was a news item ([p1-starved-no-banner.png](../playtests/evidence/sprint-1/p1-starved-no-banner.png)).
- **P4-1:** *"The status becomes 'Output blocked: belt full'… The banner still lists only missing operators, safety
  zones and unconnected belts. A starved machine ('Waiting for materials') is not listed either."* ([p4-blocked-no-banner.png](../playtests/evidence/sprint-1/p4-blocked-no-banner.png))
- **P3-1:** *"Every square is read as 'Die-casting cell machine #5.' Nothing says it is broken, blocked or starved."* ([p3-cursor-log.txt](../playtests/evidence/sprint-1/p3-cursor-log.txt))
- **P1-4:** the inspector shows "No operator" and "Stopped: out of Synthetic rubber." at once, and Needs attention stays
  stale until you leave the floor. **P1-3:** an assigned machine says "No operator" until the clock runs.
- **P3-2:** Quick start's memo says the operator is on the machine while the inspector says "No operator", and an
  urgent "Getting started" memo says *"The building is bare"* ([p3-aria-floor-quickstart.txt](../playtests/evidence/sprint-1/p3-aria-floor-quickstart.txt)).

Today "Waiting for materials" means both "the operator is fetching boxes" and "there is nothing left to fetch".

## Player story

As an owner, when a machine stops for lack of materials or a jammed output, I'm told once, I can see it in Needs
attention until it's fixed, and the cursor tells me its state when I pass over it.

## Acceptance criteria

1. **One honest status.** A machine is *starved* when an input of its product has no units at the machine, in storage,
   in the operator's hands or on a belt into it; its status is "Out of materials" (001's wording). Stock that exists but
   hasn't reached the machine stays "Waiting for materials", which is never an alert. *Blocked* is any "Output blocked"
   or "Output full" status. Status updates as soon as an operator is assigned or removed, without the clock running;
   a staffed machine outside working hours reads "Plant closed", as the clock does. The inspector shows one status
   pill; any other problem reads "Also: out of Synthetic rubber", never a second "Stopped:".
2. **A notice, throttled.** A machine that has been starved or blocked for 30 straight shift minutes triggers a memo
   from "Plant log" (001's sender), subject "Machine stopped: Die-casting line machine #5" or "3 machines stopped". The
   body gives each machine's reason and fix ("out of Zinc ingot, nothing on order: buy some or hire a Materials
   Buyer"; "output belt full: nothing at the far end takes the boxes"). Throttling:
   - one notice per machine per stall; a stall ends when the machine makes a unit;
   - the same machine isn't noticed again within one game day, even if it ran in between;
   - notices that fall due in the same game hour share one memo;
   - at most 3 stall memos per game day; after that, Needs attention carries them;
   - the memo is urgent (pauses the clock under the existing option) only when no production machine is running.
3. **Needs attention** lists every starved or blocked machine with its reason and a "Show me" button
   ("Die-casting line machine #5: out of Zinc ingot"). The status-bar alert counts these too and reads "3 issues". The
   list updates within a second of a change (painting a zone, a delivery, a tick) without leaving the floor and without
   moving focus.
4. **The floor cursor reads state.** Every square of a machine or cell is read as label plus status, for example
   "Column 6, row 5: Die-casting line machine #5, broken." or "…, out of materials: Zinc ingot." The Cursor card shows
   the same text.
5. **Getting started** ticks "Order materials" only while no machine is out of materials with nothing on order, so a
   starved plant reads "7 of 8 done" and the step's Go link opens Purchasing.
6. **Quick start** doesn't send the "Getting started" memo, its own memo is true when it arrives (the machine shows its
   operator, status "Plant closed" before Play), and its last line reads "Then add a second machine that uses what this
   one makes."

## Out of scope

- Live announcements for every status change, and the live-region fixes in P3-4.
- The inspector's belt wording (P4-2) and a bottleneck overlay (backlog item 3).
- Onboarding beyond the checklist (backlog item 1).

## Pillars served

1, Readable factory: you see why a machine stopped. 4, Accessible by default: the cursor and memos say it in words.

## Accessibility notes

- **Keyboard:** "Show me" in Needs attention selects the machine and puts focus on the floor grid (as today). The
  memo's arrival is announced by the existing In-basket announcement; no extra live message, so no double reading.
- **Screen readers:** criterion 4 puts state in the cursor reading; the Needs attention list is a region with plain
  text, not a live region, so refreshing it is silent.
- **No colour-only cues:** the floor keeps the "!" marker for "Out of materials" and blocked statuses (yellow plus
  glyph); "Waiting for materials" shows no marker.

## Balance knobs

Code constants in `src/sim/game.js`: `STALL_NOTICE_MIN = 30` (shift minutes before a notice),
`STALL_REPEAT_MIN = 1440` (minimum gap per machine), `STALL_MEMOS_PER_DAY = 3`. No economy numbers change.

## Test plan

- **Node `test/stall.mjs` (new; criteria 1, 2, 5):** a starved machine reads "Out of materials" and a fetching one
  "Waiting for materials"; one memo after 30 shift minutes, none for the next day while it stays starved, a new one
  after it runs and starves again a day later; three machines starving in one hour give one memo; a fourth memo in a
  day is held back; urgent only when nothing runs. A dead-end belt gives "Output blocked" and a notice. Assigning an
  operator changes the status at once.
- **Node `test/long.mjs` / `test/balance.mjs`:** still inside the balance bands; count stall memos per run and fail
  above 3 a day.
- **Playwright `test/ui_test.py` (criteria 3, 4, 6):** Quick start: no "building is bare" memo, inspector status isn't
  "No operator". Run until starved: Needs attention lists the machine, status bar says "1 issue", cursor text contains
  "out of materials". Paint the missing safety zones: the entry goes within a second while focus stays on the grid.
  axe on the floor.

## Save impact

None. Statuses are worked out again on every tick. The throttle memory (stall start and last notice per machine)
lives outside the save, in a `WeakMap` keyed by the game state in `game.js`, like `bus`; after a load, a machine that
is still stalled may be noticed once more. Old saves' status text ("Input empty", "Shift over") is replaced on the
first tick, or at load by the same status refresh used on assignment.

## Files likely touched

`src/sim/game.js` (tick status, stall notices, `assign`/`refreshOperators`, a quiet option for `rentBuilding`),
`src/sim/floor.js` (`describeTile`), `src/ui/app.js` (`setupProblems`, status-bar alert), `src/ui/views/floor.js`
(Needs attention render and `patch`, inspector "Also", checklist), `src/ui/views/start.js` (Quick start),
`src/ui/topdown.js` and `src/ui/iso.js` (marker regex), tests.

**Overlap with 001:** both edit statuses, memo text, `setupProblems` and the checklist. Use 001's words: "Out of
materials", "Plant log", "Machine Operator", "Materials Buyer", and labels from `objectLabel`. Build 003 after 001, or
on top of its branch. **With 002:** both edit `floor.js` `updateInspector`; 002's fix is one line.
