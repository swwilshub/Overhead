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
