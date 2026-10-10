# Decisions

Newest first. Each entry: date, decision, reason.

- **2026-10-08 — Playtest findings added to spec 001, and specs 002–005 written.**
  - **001 additions:** memos that were signed "Plant manager" (and "Warehouse") come from **Plant log**; the painted
    squares are a **Storage zone** and what they hold is **storage**; every machine and cell is named by its one
    label from `objectLabel` everywhere. Reason: the playtest found a sender nobody can hire, five names for storage and
    four names for one machine.
  - **003:** "Out of materials" means nothing is left anywhere for that input; "Waiting for materials" stays for boxes
    on their way and never alerts. Stall memos are throttled (30 shift minutes first, once per machine per stall, not
    again within a day, one memo per hour, at most 3 a day) and only urgent when nothing in the plant is running.
    Reason: warn about real stalls without filling the In-basket in a big plant.
  - **004:** on the floor grid, Space runs the clock and Enter selects, matching the checklist's "Play or space bar".
    Reason: one meaning for Space on every screen.
  - **005:** the guard is a confirm in the interface, not a rule in the simulation, so headless sims and balance tests
    are unchanged. Reason: the player should choose to borrow; the numbers stay as they are.
  - **No save changes in any of them.** Throttle memory is kept outside the save. Reason: ground rule 2, and nothing
    here needs a stored field.

- **2026-10-08 — Clearer names for jobs, departments and three lines ([spec 001](specs/001-clearer-names.md)).**
  - **Jobs:** Line Worker becomes Machine Operator. Account Rep becomes Sales Rep, Promotions Specialist becomes
    Marketer, Buyer becomes Materials Buyer and Office Assistant becomes Finance Clerk.
  - **Office leads** follow one pattern: Finance Manager, Sales Manager and Purchasing Manager. Shift Supervisor
    becomes Floor Supervisor, and Development Engineer becomes Research Engineer.
  - **Departments:** Commercial becomes Sales, Supply becomes Purchasing and Front office becomes Management.
  - **Lines:** Die-casting cell becomes Die-casting line, Machine shop becomes Machining line and Furniture shop becomes
    Furniture line.
  - **Duties text** now starts with each job's effect in the game.
  - **Keys stay the same.** Only the display text changes, so saves are unaffected.
  - **Allowlisted titles:** the content scan flagged "Machine Operator", "Sales Manager" and "Purchasing Manager". Sam
    approved all three as ordinary real-world job titles, and the producer is adding them to `tools/ip_allowlist.json`
    with reasons. Every other new name passes `npm run scan` as it is.

  Reason: Sam asked for this. A job title should use the same word as the screen, the status or the button that sends
  the player to hire for it ("No operator" leads to Machine Operator; the Sales screen leads to Sales Rep). "Cell" and
  "shop" made machine labels such as "Die-casting cell cell #12" and "Machine shop machine #4". Changing the keys would
  have needed a save migration and gained the player nothing.

- **2026-10-08 — Sprint settings from Sam.** One sprint, then stop for his review. Merge mode: open PRs for Sam to
  merge. Focus: clearer names, especially for staff roles such as operators and sales. Reason: Sam's call.
- **2026-10-08 — The studio's clean-room rule covers any commercial game.** Agent briefs and studio docs are public, so
  they say "do not search for, open, describe or imitate any commercial game" rather than naming a particular one.
  Reason: the rule is the same in practice, and the repository doesn't record where the project came from.
- **2026-10-08 — The performance budget and old-save checks are scripts.** `test/perf.mjs`, `test/perf_ui_test.py` and
  `test/saves.mjs` with fixtures in `test/fixtures/`. Reason: QA must measure, not guess, and every branch must prove
  old saves still load.

- **2026-10-09 — Work moves back into the main session.** Sam found spawning many agents inefficient, and a rate limit
  stopped four of them mid-review. The producer builds and fixes in the main session; agents are for independent QA and
  content review only. Reason: Sam's call; it also keeps timing tests honest, since fewer things run at once.
- **2026-10-09 — A stall is told once, quietly.** A starved or blocked machine gets one Plant log memo after 30 working
  minutes, grouped by hour, at most three a day, and only urgent when nothing is running. Reason: the playtest found
  machines stopping with no warning (P1-1, P4-1), and a notice per machine per hour would bury the In-basket.
- **2026-10-09 — "Out of materials" changes what the player is told, not the economy.** Idle machines keep the old
  wear and accident rules. Reason: an early build relabelled them and the 24-month run went over its one-month growth
  limit; spec 003 says no economy numbers change.
- **2026-10-09 — The credit dialog stops the clock.** The amount shown must be the amount borrowed. Reason: QA measured
  a $74,000 drift after 5 seconds at top speed. If the amount still changes, buying says so.
- **2026-10-09 — Needs attention refreshes in place and never takes focus.** If focus is on one of its buttons, the
  refresh waits. Reason: pillar 4 and spec 004; a list that redraws under a keyboard user is worse than a stale one.

- **2026-10-09 — "Compact" means a phone in either orientation.** One definition for the whole interface: width up to
  700 px or height up to 500 px (`src/ui/compact.js`). Touch behaviour on the floor depends on the pointer instead
  (`pointer: coarse`), so a tablet gets touch gestures without the phone layout. Reason: a landscape phone is wider than
  700 px but has almost no height, and a tablet needs touch but has room for the desktop layout.
- **2026-10-09 — On a touch screen, placing is a decision.** The outline follows the finger and nothing is bought until
  Place here. Reason: touch-down used to act at once, so a drag could buy a machine; the credit dialog from spec 005 would
  only have asked after the damage.
- **2026-10-09 — Phone menus are a bottom bar plus a Menu sheet, not a hamburger drawer.** Four large buttons along the
  bottom (Floor, Staff, In-basket, Menu) and a sheet listing everything. Reason: the thumb reaches the bottom, and two taps
  reach every section.
- **2026-10-09 — Tables become cards with explicit roles.** Changing a table's `display` can drop its meaning for
  screen readers in some browsers, so the card layout writes out the table, row, header and cell roles and the
  column name each value belongs to. Reason: pillar 4; a phone screen reader user must hear a table.
- **2026-10-09 — Checkboxes and radios are drawn by the page on touch screens.** A native one cannot be made
  44 px. Reason: spec 009's tap-size rule, and an Options page full of 24 px checkboxes.
- **2026-10-09 — The screen-reader-only helper needs a positioned parent.** Hidden text beside a table's last column
  escaped the table's clipping and made phones zoom the whole page out. `main` and the table wrapper are now positioned
  boxes. Reason: found while building spec 007; it affected every wide table.

- **2026-10-09 — Each rung of a ladder is its own job.** Junior Operator and Senior Operator are separate job records
  (`operations_1`, `operations_2`), and a promotion swaps the person's job. Reason: every effect (roles, lead, pay,
  fit weights) already hangs off the job, so nothing else had to learn about levels, and old saves convert with a table.
- **2026-10-09 — Promotion is automatic and quiet.** Experience from working at a post triggers it, a non-urgent
  Personnel memo reports it, and pay keeps its place on the city scale. Reason: Sam asked that staff "gain exp as they
  go"; asking the player to approve every promotion would add a chore to a game that is already busy.
- **2026-10-09 — The promotion family is called Promotions.** A first-draft title for the family was flagged by the content
  scan as a protected name, so it was replaced with a fresh one (Junior Promoter, Senior Promoter, Promotions Director).
  The scan and its lists were not touched.
- **2026-10-09 — The foreman is the Operations Director.** The `foreman` role (and its lift to the whole floor) is only
  on level 3, not on a cheap level 1 hire. Reason: the foreman boost is capped and averaged, but it is worth up to 18% of
  floor output; a day-one foreman would shorten the early game, and a Director is earned (about two years) or arrives as one applicant in twenty.
  Sam confirmed: the foreman stays at Director.
- **2026-10-09 — Director takes 560 experience, not 430, and skill grows 0.10 a level.** The first tuning gave Directors in
  month 17.5 (the band is 18 to 24) and promotions that cost the plant 7 to 39% of its final value. Reason: the long
  test (spec 013); the numbers now pass, with Director in months 22.7 to 23.3.
- **2026-10-09 — The payroll band is 35 to 65%, not 15 to 40%.** Spec 013 guessed lower. Everyone reaches Senior in the
  first year and a Senior costs 1.4 to 1.6 times a Junior, so the lowest honest figure is about 40%. Measured: 49 to 51%.
- **2026-10-09 — The screen-fit pages are the next sprint.** Sprint 3 changed Hiring (6.4 screens to 1.0 at 390 × 844)
  and Staff (1.9 to 1.0), but every other section is as tall as it was. Reason: Sam chose staff first; the pager is
  sprint 4.

- **2026-10-09 — Numbers are set by a stepper, never typed.** One control (`stepper` in `dom.js`) is used for the
  salary offer, order size, purchasing targets, sales prices, bank amounts, loans and the scenario number. Reason: Sam
  asked to remove manual entry unless it is really needed, starting with numbers; on a phone a number box brings up the
  keyboard over the page. A test fails if a number box comes back.
- **2026-10-09 — A page does not redraw under a focused stepper.** Same rule as typing. A change redraws the page half a
  second after the last step, so figures that depend on it (a price's "vs market") catch up. Reason: a redraw replaces the
  button being held.
- **2026-10-09 — An order stops at what the vendor has left.** The Boxes stepper's maximum follows the chosen vendor's
  monthly supply and the room in storage. Reason: the old number box accepted any number and the game quietly ordered
  fewer, with the message after the fact.
- **2026-10-09 — Purchasing targets are merged at the moment of change.** The old handler spread a copy of the targets
  taken when the page was drawn, so by reading it two rows changed before the next redraw could drop the first edit (I
  did not reproduce this; it was a risk seen while reading the code). The stepper reads the targets when it changes.

- **2026-10-09 — The factory floor is a full-window canvas with a camera.** One canvas fills the content area, sized in device
  pixels, and pan and zoom are a camera (`camera.js`, tested in Node) rather than a scrolled, CSS-stretched canvas. Reason:
  Sam asked for the floor to be the whole window with touch done properly; scrolling a frame inside a scrolling page made a
  drag ambiguous and blurred the picture on dense screens.
- **2026-10-09 — "All the graphics in that context" means everything drawn, not the controls.** Machines, belts, boxes,
  workers, zones, selection, cursor, ghost, gauges and the cell designer's overlays are drawn into the one canvas context.
  Text and buttons stay real page elements floating over it. Reason: drawing them into the canvas would hide them from
  assistive technology and from the keyboard; pillar 4 outranks a single draw surface. (If Sam meant the controls too,
  that is a different, much larger decision.)
- **2026-10-09 — Touch, pen and mouse share one pointer path.** Pointer capture on the surface, `touch-action: none`, a Map
  of active pointers, pinch with the midpoint following the fingers, a cancelled touch ends cleanly, and a lifted finger
  never turns into a drag or a tap. A flick glides for touch and pen, not for the mouse. Reason: the old code had separate
  mouse and touch paths and relied on the frame's scrolling.
- **2026-10-09 — The mouse pans by dragging empty floor in Select, by the middle button anywhere, and the wheel zooms.** A click
  still selects, and Paint, Lay conveyor and placing keep the left button. Reason: the frame's scrollbars are gone; these
  are the usual map controls. Shift and the wheel pan; Ctrl and the wheel (a trackpad pinch) zoom.
- **2026-10-09 — The equipment table moved into the Equipment list panel.** It is no longer under the floor, because the page
  does not scroll. It stays a real table, reachable by keyboard and screen reader. Help and Legend moved to panels too.
- **2026-10-09 — The first view fits the plant between the floating controls.** It is never bigger than 2×, a desktop never
  starts below 1×, and a phone may start as small as ½×; a landscape phone puts the tools in a column at the left. Reason:
  the old phone default clipped the right-hand side of the plant.
- **2026-10-09 — Off-screen text no longer makes the page taller.** The two live regions were absolutely positioned at the
  bottom and pushed the document one pixel past the window on every page. They are fixed now, so the floor page cannot
  scroll at all. Found by the new floor test.

- **2026-10-09 — On a phone, every section is pages, not a scroll (spec 016).** A section's content is grouped into large tabs; each
  group's blocks are measured and packed into as many pages as fit the visible height; Previous, Next and a swipe walk through every
  page in order. Reason: Sam, twice ("no everything must be on one screen on mobile"). Pages are computed from measured heights, not
  hand-cut, so a longer list makes more pages instead of a scroll, and a new section only has to name its groups.
- **2026-10-09 — The pager is for phones only.** A desktop keeps its long pages. Compact means width ≤ 700 px or height ≤ 500 px
  (the existing query), so a phone on its side is paged too.
- **2026-10-09 — Tables are split row by row and become grids of labelled values on a phone.** A long table (Staff, Equipment,
  Purchasing) continues on the next page rather than shrinking. A row is never cut in half.
- **2026-10-09 — The catalog's range preview is dropped on a phone.** It was the largest block on the page and the least useful
  one at that size; the facts about each product are kept.
- **2026-10-09 — The city map pans inside its own page.** It fills the page it is on and pans and zooms there; it does not make the
  page taller.
- **2026-10-09 — In landscape the tabs are a left rail and Previous/Next are arrows at the edges.** The portrait bottom bar would
  cost a quarter of the height of a phone on its side.
- **2026-10-09 — Dialogs are paged too.** Resume and offer, Buy, the equipment list, Help, Legend, the move plan and the loan
  confirmation fit the sheet (88% of the height) with their buttons always visible under the pages.
- **2026-10-09 — The item inspector and the cell designer are pages in the bottom sheet.** With Details open, the name, status and
  buttons stay up top and the rest is packed into pages (lists inside it split row by row). The designer keeps its steps and its
  Back/Confirm/Cancel buttons on screen with the instructions and item lists as pages between. In landscape both become a column down
  the right edge so the floor stays visible beside them. Cost: a phone on its side shows few lines per page (the designer's furnish step
  is 13 pages there); a better answer needs a different furnish control, not more packing.
- **2026-10-09 — Found and fixed: Details did nothing after "Show me" or an equipment select.** The sheet's remembered selection
  (`sheetFor`) was only reset in the update path, not in a full redraw, so the next Details press collapsed an already-"open" sheet.
  It is reset in the redraw too.
