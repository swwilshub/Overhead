# 001 — Clearer names

Backlog item 0 · Pillars 1, 4 · Effort M · Save impact: none (display text only)

All new names pass `npm run scan` (checked by the producer before build; three standard job titles are allowlisted with Sam's approval).

## Problem

Sam (owner), sprint focus in [decisions.md](../decisions.md): *"Please rename things to make them more clear, in
particular with staff roles like operators and sales."*

**Playtest evidence:** [playtests/sprint-1.md](../playtests/sprint-1.md) P1-3 (*"'Hire an operator' leads to a page
with no operator job"*) and its "Names and labels" section, with the verbatim strings in
[names-transcript.txt](../playtests/evidence/sprint-1/names-transcript.txt). Evidence from an audit of
`data/world.json` and the player-facing strings, plus the playtest:

- **The game says "operator" but hires "Line Workers".** Statuses ("No operator", "Operator away"), the machine panel
  ("Operator", "Hire an operator"), the alert bar and the checklist ("Give every machine an operator") never use the
  title the player has to hire.
- **Sales is spread over three names:** the Sales screen, the "Commercial" department and the "Account Rep" title.
  Buying has the same problem: the Purchasing screen, the "Supply" department and the "Buyer" title. "Buyer" also means
  customer in other text ("walk-in buyers", "Mark buyers").
- **The research words don't match.** "Development Engineer", "Hire a researcher", "Research: needs an engineer" and
  "Research: researcher away" all mean the same person.
- **"Office Assistant"** is a Finance clerk, but the title names neither Finance nor the work. **"Shift Supervisor"**
  suggests shifts, but the game has only one shift. **"Front office"** doesn't say it is the boss's department.
- **Line names collide with game words.** The labels read "Die-casting cell machine #3", "Die-casting cell cell #12"
  and "Machine shop machine #4".
- **Hard-coded articles are already wrong:** "A Account Rep doesn't run machines", "A Office Assistant…".
- **The catalog says "Hand cart"**, but the data, the to-do memos and the advisor all say "Pallet jack".
- **One machine, four names** (playtest): "Extrusion line machine #5" on the floor, "EX #5" in the inspector,
  "Machine #5" in Needs attention and memos, "Extrusion line #5" in the belt dialog, and "#10 input 1" in belt text.
- **Five names for storage** (playtest): "Storage zone", "Storage (pallets)", "stored pallets", "storage" and
  "Warehouse" all mean the painted squares where pallets are kept.
- **Memos signed "Plant manager"** (playtest), a job nobody can hire, so the player can't tell who is talking.

## Player story

As a new owner, I read a job title once and know what that person will do in my plant. When a machine says
"No operator", I know which job to hire for.

## Names (keys unchanged; only the `title`, `name` and `desc` values in `data/world.json` change)

| Key | Now | New | Other candidates | Why |
|---|---|---|---|---|
| `line_worker` | Line Worker | **Machine Operator** | Operator, Machine Hand | It matches "operator" in every status and button, and it's the word Sam uses. |
| `account_rep` | Account Rep | **Sales Rep** | Salesperson, Sales Agent | Says "sells"; matches the Sales screen. |
| `promotions` | Promotions Specialist | **Marketer** | Ad Specialist, Promoter | One plain word that's clearly different from selling; shorter. |
| `buyer` | Buyer | **Materials Buyer** | Parts Buyer, Purchaser | Says what gets bought, and stops it reading as "customer". |
| `office_assistant` | Office Assistant | **Finance Clerk** | Accounts Clerk, Data Clerk | Names its department and the kind of work. |
| `finance_chief` | Finance Chief | **Finance Manager** | Head of Finance, Chief Accountant | Office leads all follow one pattern: *Department* Manager. |
| `commercial_lead` | Commercial Lead | **Sales Manager** | Head of Sales, Sales Chief | Leads the Sales department. |
| `supply_lead` | Supply Lead | **Purchasing Manager** | Head of Buying, Purchasing Chief | Leads the Purchasing department. |
| `supervisor` | Shift Supervisor | **Floor Supervisor** | Production Supervisor, Floor Boss | Says where they work. There are no shifts to supervise. |
| `dev_engineer` | Development Engineer | **Research Engineer** | Product Developer, R&D Engineer | Matches the Research screen and the research statuses. |
| `bookkeeper`, `mechanic`, `chief_engineer`, `director` | Bookkeeper, Plant Mechanic, Chief Engineer, Plant Director | *unchanged* | — | Already clear. Only their duties text changes. |
| dept `commercial` | Commercial | **Sales** | Sales and Marketing, Selling | Same word as the screen and the "Sales effort" meter. |
| dept `supply` | Supply | **Purchasing** | Buying, Materials | Same word as the screen. |
| dept `exec` | Front office | **Management** | Head office, Leadership | Says it is the boss. |
| line `diecast` | Die-casting cell | **Die-casting line** | Die-casting press, Casting line | "Cell" means a production cell the player designs. |
| line `machining` | Machine shop | **Machining line** | Turning line, Parts machining | Fixes "Machine shop machine #4". |
| line `furniture` | Furniture shop | **Furniture line** | Woodshop, Furniture works | Every line is now called "*X* line". |
| memo sender | Plant manager, Warehouse | **Plant log** | Floor report, Plant notices | Reads as the plant's own record, not a person you could hire. |
| zone `storage` | Storage zone, Storage (pallets), stored pallets, Warehouse | **Storage zone** (the squares), **storage** (what they hold) | Warehouse, Stockroom | Already the word on the zone, the bin and the floor header; "warehouse" suggests a second building. |

**Duties column (`desc`): start with the effect in the game.** Machine Operator: "Runs one machine or works in a
production cell, and carries its boxes. Every machine needs one." Sales Rep: "Wins orders from stores, so you sell far
more than to walk-in customers." Marketer: "Runs ads and displays. Raises brand awareness, so every product sells
better." Materials Buyer: "Reorders materials up to your stock targets every morning." Bookkeeper: "Posts invoices and
bills, so customers pay on time and suppliers don't add late fees." Finance Clerk: "Does the same Finance work as a
Bookkeeper, for lower pay." Finance, Sales and Purchasing Manager: "Does the department's work and makes everyone in it
more productive." Floor Supervisor: "Speeds up every machine and lowers crew stress. Can run a machine." Research
Engineer: "Runs a machine set to research to develop new products, and researches cell technology." Chief Engineer:
"Speeds up every research project." Plant Mechanic: "Services machines so they run well, and fixes them when they break."
Plant Director: "Makes every office department more productive."

## Acceptance criteria

1. The Hiring page, Staff page, profile, resumes, cell crew list, machine panel, Getting started checklist, to-do memo,
   advisor report and Quick start memo show the new titles and department names from the table. Outside old save text,
   no old title or department name is left in `src/` or `data/`.
2. The other words match the titles. The research statuses become "Research: no engineer" and "Research: engineer away".
   The hire links read "Hire a Machine Operator" and "Hire a Research Engineer", and the research picker's label is
   "Research Engineer". "Input empty" becomes "Out of materials". The floor still shows the same "?" and "!" markers for
   these statuses. The staff summary label and the memo sender "Supply" become "Purchasing", and memos sent as
   "Plant manager" or "Warehouse" come from "Plant log". "Accounting" on the Sales page becomes "Finance". "Walk-in
   buyers" becomes "walk-in customers". The catalog says "Pallet jack", and its text matches the two-boxes-a-trip rule.
3. Every job's Duties text starts with what the job does in the game, as worded above.
4. The labels read "Die-casting line machine #3" and "Die-casting cell #12": no "cell cell", no "shop machine".
   Every text that names a machine or cell (cursor, inspector, equipment table, Needs attention, memos, belt text and
   dialogs) uses that one label from `objectLabel`; no bare "Machine #5" or "#10 input 1". The line code (EX, DC) may
   stay as a badge beside the label. Storage squares are "Storage zone" in the paint menu, legend, cursor and placement
   errors, and what they hold is "storage" on the floor header, Purchasing and the inspector; no player-facing
   "warehouse" is left.
5. "A" or "an" before a title comes from the title through one helper in `src/core/content.js`. No template hard-codes
   "A ${…title}" or "An ${…title}".
6. Job, department and line keys don't change, and `VERSION` stays 1. `test/fixtures/save-v1.json` loads and shows the
   new titles. `npm run scan` passes, and axe reports zero violations.

## Test plan

- **Node `test/names.mjs` (new; criteria 1, 3, 5).** Checks that the titles are unique and at most 18 characters, and
  that each Duties text is at most 120 characters. Feeds every title through the article helper and checks it. Searches
  `src/` and `data/` for the old names (including "Plant manager", "Hand cart" and player-facing "warehouse"), for
  hard-coded articles before a title, and for templates that build "Machine #" or "#${id} input" by hand.
- **Node `test/saves.mjs` (criterion 6),** extended: after migration, `JOBS[e.job].title` gives a new title for every
  employee.
- **Playwright `test/ui_test.py` (criteria 1, 2, 4, 6),** extended: Quick start, then check the Hiring and Staff
  tables, the checklist ("Hire a Machine Operator"), the machine panel and a cell label. Run axe on each screen.
- **Status markers (criterion 2):** a unit check that the floor's marker for each new status is unchanged. The
  regexes in `topdown.js`, `iso.js` and `floor.js` need updating.

## Accessibility notes

- **Same word on every screen:** what a screen reader announces in a status, button or alert uses the noun from the job
  title ("operator", "engineer"), so a blind player can link the problem to the hire without seeing the screen. A
  machine is announced by the same label in the cursor, memos and alerts, so it's clear they mean one machine.
- Titles use whole words, with no abbreviations other than "Rep". Every title reads well after "a", and the article
  helper keeps that true for later titles.
- No new interaction, so the keyboard path doesn't change. The floor shows departments only by shirt colour, but the
  department name appears as text on the Staff page and profile; the new names don't change that.

## Pillars served

1, Readable factory: statuses name the missing person. 4, Accessible by default: the same words are heard everywhere.

## Balance knobs

None. No numbers change.

## Save impact

None. Saves store keys (`employee.job`, `ad.job`, `o.family`), not titles, so no version bump and no migration.
`o.status` is worked out again on the first tick. Text already saved stays as it was: old memos, resume subjects such
as "Resume: Line Worker", and applicants' past jobs. That's history, and resumes expire within 14 days.

## Out of scope

- Machine numbering (the first machine is #5 because belts take numbers too), and the other memo senders
  ("Finance" before anyone in Finance is hired, outside firms).
- The "In-basket" name, "Est." in "Est. job fit", nameplate codes (AV, TX), the "Office machine line" next to offices,
  and "Idle" when no product is set.
- Moving the Plant Mechanic out of Engineering (it would change shirt colours).
- Teaching what "cell" and "suite" mean; onboarding (item 1) covers that.
- "Buyers" meaning customers on the City screen.
- Changing any key.
- The builder updates `README.md`, `docs/design/world.md` §1 and §5, and `docs/design/economy.md` (the "Shift
  Supervisor" mention) to the new names in the same change.

**Files likely touched:** `data/world.json`, `src/core/content.js`, `src/sim/game.js`, `src/sim/floor.js`,
`src/ui/app.js`, `src/ui/topdown.js`, `src/ui/iso.js`, every view in `src/ui/views/`, and tests. Specs 002–005 touch
some of the same files; where their text overlaps, **001's names win**.
