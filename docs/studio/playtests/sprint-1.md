# Playtest: sprint 1

- **Build:** branch `sprint-1/000-studio-setup`, commit b2dc2d6, `npm run build` (389 KB `dist/overhead.html`).
- **Browser:** Playwright 1.63 (Python) with Chromium 1194, 1366 × 900. Time was fast-forwarded with
  `G.advance(app.st, minutes)` only, then the view was reopened to refresh it.
- **Sam's focus:** clearer names, especially staff roles such as operators and sales. Every name I met is in
  "Names and labels" at the end. The verbatim strings are in `evidence/sprint-1/names-transcript.txt`.
- **Evidence:** `docs/studio/playtests/evidence/sprint-1/` (about 1 MB).
- **Note:** `page.accessibility.snapshot()` is not in Playwright 1.63, so I used `locator('body').aria_snapshot()`
  instead. axe-core reported zero violations on Factory floor, Catalog, Research, Staff, Hiring, In-basket, Purchasing
  and Sales.

Severity: **1** blocks play, **2** hurts, **3** annoys.

## Persona 1: first-timer with a mouse

I started from the title screen with "Set up a new company" and the defaults, then chose Akron, OH, leased a
32,700 sq ft building and followed the Getting started checklist, the memos and the "Fix" and "Go" links.

**1. The only machine starves for weeks without a warning (severity 2).**
- Steps: follow the checklist, using Purchasing > "Suggest targets" > "Purchase all to target" once. Hire a Line
  Worker and an Account Rep, press Play, then fast-forward 30 days.
- What I saw: the first order ran out after about a week, around Jan 14. The Getting started checklist read
  "8 of 8 done". "Needs attention" showed nothing. In the equipment table, the machine said "Operator away" on
  Saturday and "Waiting for materials" on Monday. Only the Purchasing page says "Nobody does the buying". Over the
  fast-forwarded month, the only memo in the In-basket was a "Supply squeeze" news item. The bank statement shows
  two "Late-payment fee" lines, which nothing had explained.
- Evidence: `p1-starved-no-banner.png`.

**2. The side panel shows "[object HTMLElement],[object HTMLElement]" (severity 2).**
- Steps: click a machine on the floor, then click an empty floor square.
- What I saw: the Getting started checklist and the Cursor panel are replaced by that text until you leave the
  screen and come back. It happens every time.
- Evidence: `p1-object-htmlelement.png`.

**3. "Operator" and "Line Worker" are the same job under two names (severity 2).**
- Steps: in the inspector of a new machine, click "Hire an operator".
- What I saw: the Hiring page lists 14 jobs, and none of them is called operator. The checklist shows "3. Hire a
  Line Worker" right above "4. Give every machine an operator".
- After I hired her, the worker was not put on the machine. Once I had assigned her by hand, the machine and the
  equipment table still said "No operator" until the clock ran.
- Evidence: `p1-checklist.png`, `p1-hiring-no-operator-job.png`.

**4. The game shows two statuses at once, and the alert list goes out of date (severity 3).**
- Steps: place a machine.
- What I saw: the inspector shows the pill "No operator" and the banner "Stopped: out of Synthetic rubber." at the
  same time.
- Steps: then paint both input squares as safety zones.
- What I saw: "Needs attention" still says "Machine #5 needs a safety zone (or a belt) at input 1 and 2". It
  updates only after you leave the floor and come back.
- Evidence: `p1-two-statuses.png`.

**5. Several setup screens contradict themselves (severity 3).**
- After "Found the company", the status bar shows the word "null".
- The city table is headed "All fifty cities" but lists 42 cities.
- The lease screen says "Grey dashed buildings are for rent", but the legend shows for-rent lots as green squares
  with a sign. The building selected by default is 68,800 sq ft at $41,486 a month, while the same screen advises
  25,000 to 40,000 sq ft. You can only see a lot's size by clicking each lot.
- Evidence: `p1-choose-city-null.png`, `p1-lease-legend.png`.

## Persona 2: keyboard only

I used Quick start (Buffalo, NY) and played by keyboard only: Tab, the arrow keys, Enter, `g` plus a letter, and
I to jump to the inspector. The log is in `p2-keyboard-log.txt`.

**1. The global shortcuts do nothing while the floor grid has focus (severity 2).**
- Steps: Tab into the floor grid, then press `g` `h`, Space, `]` or `?`.
- What I saw: none of them works. Space selects the item under the cursor instead of starting the clock. The
  checklist says "Start the clock (Play or space bar)". The same keys work once focus is on a header button.
  The floor is where you spend most of the game.
- Evidence: `p2-keyboard-log.txt`.

**2. Focus jumps to the top of the page after common actions (severity 2).**
- Steps: press Enter on any of these: Hiring > "Place ad", Purchasing > "Suggest targets", Purchasing > "Purchase
  all to target", or cell editor > "Standard layout".
- What I saw: focus lands on the page body each time, and the next Tab goes to "Skip to the work area". Placing
  several ads means tabbing back through the header and the side rail each time.
- Evidence: `p2-keyboard-log.txt`.

**3. Every tool change means leaving the grid (severity 3).**
- Steps: on the floor, switch between selecting, painting zones and laying conveyor.
- What I saw: Paint zones and Lay conveyor have no key. Each switch is 4 to 6 presses of Shift+Tab out of the grid,
  Enter, and then the grid gets focus back. Painting two input squares took about 20 key presses.
- Evidence: `p2-keyboard-log.txt`.

**4. Belts are laid one square at a time, and their direction can't be heard or changed (severity 3).**
- Steps: in conveyor mode, press Enter on each square.
- What I saw: a placed belt is announced as "Conveyor belt, belt not connected to any machine", with no direction.
  Pressing R on a selected belt does nothing. The inspector's "Connect input by belt" is much easier, but the floor
  help never mentions it.
- Evidence: `p2-belts-keyboard.png`.

**5. Building a cell is announced as "Die-casting cell cell" and can push you into overdraft (severity 3).**
- Steps: Catalog > Cast > "Build as a cell", then size the room, accept the hatches, choose "Standard layout" and
  "Confirm and build".
- What I saw: with $73,796 in checking, the build went through at $91,800 and the game announced "Overdraft:
  $19,024 drawn on credit". Nothing warned me before I confirmed. The performance block of the cell panel shows
  "nullnull".
- Evidence: `p2-cell-cell.png`, `p2-cell-nullnull-overdraft.png`.

## Persona 3: screen-reader user

I relied on `#live-polite` and `#live-assertive` (watched with a MutationObserver) and on the ARIA snapshot, not on
pixels. The logs are in `p3-live-log-clock-running.txt` and `p3-aria-floor-quickstart.txt`.

**1. The floor cursor gives a machine's name but never its state (severity 2).**
- Steps: in Quick start, run until "Machine #5 broke down", then move the cursor over the machine.
- What I saw: every square is read as "Die-casting cell machine #5." Nothing says it is broken, blocked or starved.
  To hear its state, you have to select it, press I and read the inspector.
- Evidence: `p3-live-log-clock-running.txt`, `p3-cursor-log.txt`.

**2. Quick start tells a screen-reader user two wrong things at the start (severity 2).**
- What I saw: the "Quick start: ready to roll" memo says a Line Worker is on the machine. Before Play, the
  inspector and the equipment table say "No operator". The urgent "Getting started" memo, which arrives in the
  same In-basket, says "The building is bare. From the Catalog, buy a machine…".
- Evidence: `p3-aria-floor-quickstart.txt`, `names-transcript.txt`.

**3. Many buttons share the same name (severity 3).**
- What I saw: Hiring has 14 buttons named only "Place ad ($300)" or "Place ad ($550)". Research has 14 buttons
  named "Start". Nation has 42 named "Details", and the floor's equipment table has several named "Select".
  In a table they make sense, but in a list of buttons they don't say which job or row they act on.
- Evidence: `names-transcript.txt`.

**4. Live regions drop or repeat messages (severity 3).**
- Placing the third belt in a row updated the toast but not the polite region.
- "Purchase all to target" announces nothing.
- Old assertive text, for example "That spot is taken." or "That would block the operator's post…", stays in the
  region through later actions.
- The urgent "First order shipped" memo stops the clock with "Clock paused: an urgent memo arrived."
- Evidence: `p2-keyboard-log.txt`, `p3-live-log-clock-running.txt`.

**5. Some landmark and control names don't match what's on screen (severity 3).**
- The side rail is announced as navigation "Departments", but it lists screens. The game also has six departments
  of staff.
- The sound button reads "Mute sound", while the screen shows "♪ Sound".
- Memos and alerts say "Machine #5", but the cursor says "Die-casting cell machine #5".
- The Options page calls the side panel "the inspector"; no heading on screen does.
- Evidence: `p3-aria-floor-quickstart.txt`.

## Persona 4: optimiser

I started Quick start in Birmingham, AL, then ran the headless sims with `node test/long.mjs 7 Akron normal` and
`node test/long.mjs 1234 Phoenix normal`. Both are logged in `p4-long-*.txt`.

**1. A jammed or blocked machine never appears in "Needs attention" (severity 2).**
- Steps: lay three belts from a machine's output square that end at a wall or office, and run a day. Or belt it
  into a second machine that has no operator.
- What I saw: the status becomes "Output blocked: belt full". The inspector explains the jam well ("It is jammed:
  nothing at the far end is taking the boxes"). The banner still lists only missing operators, safety zones and
  unconnected belts. A starved machine ("Waiting for materials") is not listed either.
- Evidence: `p4-dead-end-jam.png`, `p4-blocked-no-banner.png`.

**2. The inspector contradicts itself on belts (severity 3).**
- With the output belted to a dead end, the panel says "Output: ABS housing By hand to the warehouse". Right below,
  it says "Belt to a belt that goes nowhere… jammed".
- A hand-fed input shows "700 waiting on the belt", although no belt touches it.
- Evidence: `p4-dead-end-jam.png`.

**3. Nothing stops you from overspending (severity 3).**
- Machines and cells can be bought past your cash; see persona 2, point 5. The credit line costs 17% a year, and
  the only warning comes after the purchase.
- Evidence: `p2-cell-nullnull-overdraft.png`.

**4. Quick start ignores the scenario number (severity 3).**
- Steps: type 42 in "Scenario number", then press Quick start.
- What I saw: the game started with seed 2515499494 in a random city (Birmingham, AL; other runs gave Buffalo and
  Memphis). A Quick start can't be replayed.
- Evidence: `p3-cursor-log.txt`.

**5. The economy held up; the headless late game stalls (severity 3).**
- **Prices:** at 300% of market, ABS housing still sold 204 units in a week. At 9,989% it sold none.
- **Resale:** buying desk lamps from a vendor ($9.81 a unit) to resell at market ($9.70) lost money. I found no
  exploit.
- **Sims:** both stay inside the balance bands. Akron ends at $2.04M (8.2× the start); Phoenix ends at $3.36M
  (13.5×).
- **The stall:** in both runs, the scripted player stops at 6 machines (from month 12 in Phoenix and month 20 in
  Akron) while cash piles up to $1.2M (Akron) and $2.8M (Phoenix). Monthly efficiency drops to 0.00–0.12 in six Phoenix months (Mar, Jun, Jul, Sep,
  Oct and Dec 1998) and to 0.09 in Akron in Dec 1998. Several of those months come right after a move or a new line.
- Evidence: `p4-long-7-akron.txt`, `p4-long-1234-phoenix.txt`.

## Names and labels

Each entry gives the name, where I met it, and why it was unclear or inconsistent. The verbatim strings are in
`evidence/sprint-1/names-transcript.txt`.

### Staff roles and departments

| Name | Where | Why |
|---|---|---|
| Line Worker / operator / crew / floor staff | Hiring and Staff say "Line Worker". The checklist, the inspector ("Operator", "Hire an operator"), the floor legend ("operator's post") and the cell panel ("Add operator") say operator. The cell panel ("Crew (0)", "Add to crew"), the pallet jack text and the title blurb say crew. | One job has three names. "Hire an operator" leads to a page with no operator job. |
| Account Rep / sales staff / Sales effort / Commercial | Hiring says "Account Rep, Commercial". The Sales page says "Sales effort 0.35 (no sales staff)". Staff says "Sales effort: Walk-in customers only", then "Modest". | Sales are done by a job that doesn't say "sales", in a department called "Commercial". The same "Sales effort" is a number on one screen and a word on the other. "(no sales staff)" showed while an Account Rep was hired and seated. |
| Promotions Specialist / promoter / Brand awareness / "Promotion" | The Hiring job, the Commercial Lead duty ("every rep and promoter"), the Staff meter, and the employee card's know-how line "Promotion 77" | Four words for marketing. "Promotion" on an employee card reads like a career promotion. |
| Buyer / Supply / Purchasing / "Buyers in town" | The Hiring job "Buyer" in department "Supply". The page is called Purchasing. The city view has "Buyers in town" and "C buys". | "Buyer" means our purchasing clerk on one screen and the customer firms on another. Department and page names differ. |
| Finance / Accounting / Bookkeeper | The Finance department, the Sales page ("if Accounting falls behind") and memos "From Finance" | Accounting isn't a department. "Finance" sends memos before anyone in Finance is hired. |
| Plant Director / "Plant manager" | The Hiring job, and the sender of most memos | The sender isn't a job you can hire, and doesn't match the top job. |
| Front office | The department of the Plant Director alone | The Office Assistant sits in Finance, not in Front office. |
| Est. job fit / Skill / Skill at this job | Hiring table, Staff table, employee card | One measure under two names. |
| Departments | The Staff panel lists only Finance and Supply, plus two meters. The side rail's landmark is also called "Departments". | It doesn't match the six departments on Hiring, and the rail isn't departments. |
| Workers are coloured by department | The floor legend | There's no key: the floor doesn't say which colour is which department. |
| Shift Supervisor, Best suited for | The employee card says "Best suited for: Shift Supervisor (72%)…" | Nothing on the card lets you move a person into that job, so the label raises a question it can't answer. |

### Lines, machines and cells

| Name | Where | Why |
|---|---|---|
| "line" | Extrusion line, Lighting line… (machine types), "Line Worker", "add a product line" (Quick start memo) | Means a single machine, a job and a business line. |
| Die-casting cell / cell | A machine type named "Die-casting cell machine", and the "Build as a cell" feature | It produces "Die-casting cell cell #11" and the editor title "DIE-CASTING CELL CELL". |
| Machine shop / Furniture shop / tab "Shop" | Catalog tabs and headings | "Shop" could mean either line. |
| Tab names and line names | Tabs: Sew, Extrude, Shop, Coils, Cast, Boards, Lights, AV, Office tech. Headings: Cut-and-sew line, Coil winding line, Home electronics line, Office machine line. | Each line has two names. "AV" and "Office tech" are explained nowhere. |
| One machine, four names | "Extrusion line machine #5" (floor), "EX #5" (inspector), "Machine #5" (Needs attention, memos), "Extrusion line #5" (belt dialog), "#10 input 1" | It's hard to tell that these all mean the same machine. |
| Machine numbers | The first machine is #5, the first office #6, the second machine #10 (belts take numbers too) | The numbers look like a count of machines, but they aren't. |
| Hatches / service hatch | Cell editor step "2. Hatches" (door, inputs, output); machine legend "Orange cross: service hatch" | One word, two different things. |

### Machine statuses

| Name | Where | Why |
|---|---|---|
| "No operator" + "Stopped: out of …" | The inspector shows both at once | Which one is the real reason? |
| "No operator" after assigning | The inspector and equipment table, until the clock runs; the Quick start machine before Play | Reads as a bug. |
| "Operator away" / Staff "Working" / "Plant closed" | Saturday 3 PM: the equipment table, the Staff "Now" column and the header | Three different answers to "is she at work?". |
| "Waiting for materials" / "Stopped: out of Zinc ingot." | The equipment table and the inspector | One state, two wordings. |
| "Output blocked: belt full" | The equipment table | Clear, but missing from Needs attention. |
| "$ Selling" | The output pill in the inspector | The Sales page calls the same switch "Sell it?". |
| "By hand to the warehouse" | The output line, shown even when the output is belted | Wrong while a belt is attached. |

### Buttons, places and items

| Name | Where | Why |
|---|---|---|
| Return for refund / Sell ($…) / "Delete sells it" / "Sell it?" | Inspector buttons, floor help, Sales column | "Sell" means scrapping equipment and also selling goods. |
| Hand cart / Pallet jack | Catalog > Equipment says "Hand cart… lets an operator move a pallet at a time". The placed item says "PALLET JACK… the crew moves two boxes a trip". | Two names and two different descriptions. |
| Storage zone / Storage (pallets) / stored pallets / storage / Warehouse | Paint menu, floor legend, placement error, floor header, Purchasing | Five names for the same space. |
| desk / office / Cubicle | The checklist ("give them a desk"), the Catalog Offices tab ("Every office worker needs an office"), item "Cubicle #6" | The checklist asks for a desk; the Catalog sells offices. |
| Lay conveyor / belt | Toolbar, and everywhere else | Two words for the same thing. |
| Paint zones + "Safety zone" menu | Floor toolbar | Two controls for one action; the menu doesn't look tied to the button. |
| Go / Fix / Show me | Checklist and Needs attention | Three link words for "take me there". |
| Starting money / Scenario number | Title form | The design doc calls the starting-money options "scenarios"; the screen uses "scenario" for the seed. |
| Hire people / Hiring / Help-wanted ads / Job titles | Staff button, rail, Hiring headings | Several names for one place. |

### Text and numbers that don't match

| Name | Where | Why |
|---|---|---|
| "copper wire", and the last product named in the blurb | Title blurb | Neither is in the game. Magnet wire is; the office line doesn't make the product the blurb ends on. |
| "All fifty cities" | City table | There are 42 cities. |
| "null" | Status bar before leasing | Placeholder text shown to the player. |
| Office bonuses | Suite text: computer +25%, storage +10%, filing +5%. Ready-made Terminal office: +18%. | The same computer gives two different bonuses. |
| "Share of demand" | Sales chart 7% and Sales table 2%, at the same moment | One label, two numbers. |
| Experience | City: "11 months". Resume: "0 years". Hiring table: "9 yr". | Mixed units. |
| "Owner: Owner"; "Score" | Reports > General, with "Your name" blank | A placeholder repeats the label. Score equals net worth, with no explanation. |

### Memo senders and subjects

| Name | Where | Why |
|---|---|---|
| Plant manager, Finance, Market research, Leasing office, Business Journal, Prairie National Bank | In-basket senders | They mix staff roles that aren't hireable ("Plant manager"), departments with no staff ("Finance") and outsiders. Nothing tells you which ones are your own people. |
| "Urgent Getting started", "Urgent First order shipped" | In-basket | Good news and a tutorial are marked Urgent, and First order shipped pauses the clock. |
| "Resume: Line Worker — Martha Mitchell" / "Resume — Heather Palmer" | New-company and Quick start In-baskets | Same memo type, different subject format. |
| "Machine #5 broke down" / "(Die-casting cell)" / "an outside crew" | Breakdown memo | The machine number doesn't match the floor name, "cell" is ambiguous, and "crew" here means outside mechanics, not your workers. |
| "Getting started: The building is bare" | Quick start In-basket | Contradicts the Quick start memo that arrives next to it. |
