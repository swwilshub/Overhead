# 002 — Broken text

Backlog Sprint 1 · Pillars 1, 4 · Effort S · Save impact: none (display text only)

## Problem

The [sprint-1 playtest](../playtests/sprint-1.md) found placeholder and debug text shown to players:

- **P1-2:** *"Click a machine on the floor, then click an empty floor square"* and the side panel reads
  "[object HTMLElement],[object HTMLElement]" until you leave the screen ([p1-object-htmlelement.png](../playtests/evidence/sprint-1/p1-object-htmlelement.png)).
  Cause: the inspector returns a list (checklist and Cursor card) that `updateInspector()` passes to
  `replaceChildren()` as one value, so it is turned into text.
- **P1-5:** *"After 'Found the company', the status bar shows the word 'null'"* ([p1-choose-city-null.png](../playtests/evidence/sprint-1/p1-choose-city-null.png)).
  Cause: `statusBar()` in `src/ui/app.js` passes `null` (no clock controls before play) to the browser's `append()`,
  which writes it as text.
- **P2-5:** *"The performance block of the cell panel shows 'nullnull'"* ([p2-cell-nullnull-overdraft.png](../playtests/evidence/sprint-1/p2-cell-nullnull-overdraft.png)).
  Same cause in `cellMetrics()` in `cellEditor.js`: two optional notes are `null`.
- **P1-5:** the city table is headed "All fifty cities" but lists 42.
- **Names and labels:** the title blurb names "copper wire" and an office product, and neither is in the game
  (the material is Magnet wire).

## Player story

As a player, every word on screen means something. I never see code leaking through, and the title screen promises
only what the game has.

## Acceptance criteria

1. Selecting a machine and then an empty square shows the Getting started checklist and the Cursor card, as on first
   load. Neither the side panel nor any other part of the page ever shows "[object".
2. The status bar on the title, city and building screens shows the company name and (once chosen) the city, with no
   "null".
3. The cell editor's Performance block shows no "null"; when there are no half-strength or crowding notes, nothing is
   shown in their place.
4. The Nation table caption is built from the data: "All 42 cities" today, and it follows `CITIES.length` if that
   changes.
5. The title blurb reads: *"Choose one of 42 American cities and lease a plant. Turn resin, steel and magnet wire into
   motors, control boards and housings, then into lamps, toasters, tents, toys and cash registers. Hire a crew with real
   personalities, keep the machines fed, and outsell the firms across town."* The 42 still comes from
   `CITIES.length`. Every item it names exists in `data/world.json` (Magnet wire, Fractional motor, Control board,
   ABS housing, Desk lamp, Toaster, Dome tent, Cash register).
6. A browser test visits every screen (title, Nation, City, each game view, the cell editor) and finds none of "null",
   "undefined", "NaN" or "[object" in the visible text or in any accessible name. axe reports zero violations.

## Out of scope

- The lease screen's "Grey dashed buildings are for rent" against its green-sign legend, and the default 68,800 sq ft
  pick against the advice of 25,000 to 40,000 (P1-5). Worth a small follow-up item.
- "Owner: Owner" on Reports when the name is blank, and the two "Share of demand" numbers.
- Any rename covered by spec 001.

## Pillars served

1, Readable factory: no noise where the player expects facts. 4, Accessible by default: screen readers stop reading
out "null" and "object HTMLElement".

## Accessibility notes

- **Keyboard:** no new interaction. After criterion 1, focus stays on the floor grid when the panel redraws.
- **Screen readers:** the side panel and status bar are read in full, so stray text was heard as words. The test in
  criterion 6 also checks accessible names.
- No colour cues change.

## Balance knobs

None.

## Test plan

- **Playwright `test/ui_test.py`, extended (criteria 1–4, 6):** a `no_junk_text(page)` helper reads
  `document.body.innerText` and the ARIA snapshot and fails on "null", "undefined", "NaN" or "[object" (matched as
  whole words). It runs after: founding a company (status bar), the Nation screen (caption reads "All 42 cities"),
  click machine then empty square (criterion 1), and the cell editor's furnish step with a standard layout
  (criterion 3), then on every game view. axe on each.
- **Node `test/names.mjs` (from 001) or a new check (criterion 5):** each item named in the blurb matches an item name
  in `data/world.json`.
- **Code guard (criteria 1–3):** the builder replaces the native `append`/`replaceChildren` calls that can receive
  `null` or an array with the `h()`/`frag()` helpers in `src/ui/dom.js`, which skip `null` and flatten lists.

## Save impact

None. Nothing stored changes.

## Files likely touched

`src/ui/views/floor.js` (`updateInspector`), `src/ui/app.js` (`statusBar`), `src/ui/views/cellEditor.js`
(`cellMetrics`), `src/ui/views/nation.js`, `src/ui/views/start.js` (blurb), `test/ui_test.py`. Optional:
`README.md` lede, if it echoes the blurb.

**Overlap:** spec 001 also edits `floor.js`, `app.js`, `start.js` and `cellEditor.js` (labels); spec 003 edits
`floor.js` and `app.js` (inspector, Needs attention); spec 004 edits `app.js` and `nation.js` (keys, button names).
The fixes here are small and local, so 002 can land first. If 001 changes a word in these strings, 001's word wins.
