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
  Open question for Sam: would he rather the foreman sit at Senior? The change is one line in `data/world.json`.
- **2026-10-09 — Director takes 560 experience, not 430, and skill grows 0.10 a level.** The first tuning gave Directors in
  month 17.5 (the band is 18 to 24) and promotions that cost the plant 7 to 39% of its final value. Reason: the long
  test (spec 013); the numbers now pass, with Director in months 22.7 to 23.3.
- **2026-10-09 — The payroll band is 35 to 65%, not 15 to 40%.** Spec 013 guessed lower. Everyone reaches Senior in the
  first year and a Senior costs 1.4 to 1.6 times a Junior, so the lowest honest figure is about 40%. Measured: 49 to 51%.
- **2026-10-09 — The screen-fit pages are the next sprint.** Sprint 3 changed Hiring (6.4 screens to 1.0 at 390 × 844)
  and Staff (1.9 to 1.0), but every other section is as tall as it was. Reason: Sam chose staff first; the pager is
  sprint 4.

