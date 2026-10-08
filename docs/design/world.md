# Overhead: world design

This is the design behind `data/world.json`. `tools/gen_world.mjs` turns that file into `src/gen/data.js`, and the
game reads every table from there. When you change the world, change the JSON (and this page if the idea changes),
then run `npm run gen`.

Overhead is set in the late 1990s, in a United States of mid-sized industrial cities. You lease a plant, fill it
with production lines, hire a crew and sell into the city market. The world is built around three ideas:

1. **A deep, shared parts tree.** Six component lines feed seven product lines. Most products need a component
   from another line, so a growing plant ends up wiring machines to each other with belts.
2. **Prices come from costs.** Only raw materials have hand-set prices. Every made item is priced from what goes
   into it, times a markup set by how advanced its line is. Change a material price and the whole tree follows.
3. **Seasons and news move demand.** Monthly events are mostly about the calendar and the local economy (heat
   waves, back-to-school, office building booms) rather than disasters.

## 1. Production lines and model tiers

There are 13 lines. A line is a kind of machine. Every machine of a line can make any of that line's products
once the product is known. Products that aren't known at the start are unlocked by research on a machine of
that line.

The tier sets the machine's look (the model generation shown on its nameplate) and, for product lines, roughly how
valuable its goods are.

| Key | Line | Code | Tier | Inputs | Price | MTBF (h) | Tool head |
|---|---|---|---|---|---|---|---|
| `extrusion` | Extrusion line | EX | Mk I | 2 | $68,000 | 420 | roller |
| `diecast` | Die-casting cell | DC | Mk I | 2 | $84,000 | 360 | ram |
| `winding` | Coil winding line | CW | Mk I | 3 | $76,000 | 400 | winder |
| `boards` | Board assembly line | BA | Mk I | 4 | $104,000 | 340 | gantry |
| `machining` | Machine shop | MS | Mk I | 2 | $72,000 | 460 | lathe |
| `sewing` | Cut-and-sew line | TX | Mk I | 3 | $58,000 | 500 | stitcher |
| `lighting` | Lighting line | LT | Mk II | 3 | $112,000 | 380 | turret |
| `furniture` | Furniture shop | FN | Mk II | 3 | $96,000 | 440 | saw |
| `appliance` | Small-appliance line | SA | Mk II | 4 | $138,000 | 360 | hoist |
| `outdoor` | Outdoor gear line | OG | Mk III | 3 | $152,000 | 400 | welder |
| `toys` | Toy and game line | TG | Mk III | 3 | $168,000 | 380 | mould |
| `electronics` | Home electronics line | AV | Mk III | 4 | $196,000 | 320 | scope |
| `office` | Office machine line | OM | Mk IV | 4 | $242,000 | 300 | robot arm |

*Inputs* is the number of input squares (and cell input hatches) a machine of the line has. A recipe on that
line uses at most that many different inputs.

Each line also defines its **production-cell stations** (station A, then station B) and two **cell extras**: a
basic one and one that needs a cell technology. These live in `world.json` under each line's `cell` key.

## 2. Parts tree

24 materials, 25 components and 57 products: 106 items and 82 recipes. Every made item has exactly one recipe.

### Materials (bought from vendors)

| Group | Materials |
|---|---|
| Polymers | ABS pellets, PVC compound, nylon resin, synthetic rubber, polyurethane foam |
| Metals | zinc ingot, aluminum billet, steel bar stock, sheet steel, magnet wire, silicon-steel laminations |
| Electronics | bare circuit board, IC assortment, solder paste, battery cells, lamp bulbs |
| Wood and glass | hardwood lumber, particleboard, float glass |
| Textiles | polyester yarn, cotton batting |
| Shop supplies | enamel paint, industrial adhesive, corrugated cartons |

### Components (Mk I lines)

| Line | Components |
|---|---|
| Extrusion | vinyl tubing, ABS housing, nylon cord, rubber gasket set |
| Die-casting | zinc housing, aluminum frame, heat sink, weighted base |
| Coil winding | fractional motor, power transformer, speaker driver, heating element |
| Board assembly | control board, power supply board, tuner module, LCD panel, logic board* |
| Machine shop | turned shaft, gear train, spring set, hinge and slide kit, steel tube frame |
| Cut-and-sew | fabric panel, seat cushion, strap and buckle set |

\* needs research.

### Products

| Line | Known at start | Needs research |
|---|---|---|
| Lighting | desk lamp, flashlight, floor lamp, ceiling fan, night light | camping lantern, track light kit, halogen work light |
| Furniture | bookcase, computer desk, office chair, futon frame, bar stool | four-drawer file cabinet, patio dining set, bunk bed |
| Small appliances | toaster, blender, hair dryer, electric kettle, space heater | steam iron, upright vacuum, microwave oven, rice cooker |
| Outdoor gear | dome tent, hiking backpack, folding camp chair, picnic cooler, sleeping bag | camp stove, mountain bike, inflatable raft |
| Toys and games | radio-controlled car, slot car racing set, building brick set, stunt kite, skateboard | handheld game console, electric train set, talking doll |
| Home electronics | clock radio, portable stereo, car stereo, cordless phone | pager, baby monitor, CD player, camcorder |
| Office machines | overhead projector, calculator, label maker, paper shredder | electric typewriter, cash register, time clock, desktop PC |

The exact recipes are in `world.json`. Rules used when writing them:

- Each product uses one to four inputs and at least one component.
- Components are used across lines: the fractional motor goes into 14 recipes, the ABS housing into 22.
- Research products use the advanced logic board or two or more costly components, so they sit higher in value.

## 3. Pricing and costs

### Item prices

- **Materials** have a hand-set unit price, roughly a 1990s wholesale price for the unit used in the game (a pound
  of pellets, a board blank, a set of bulbs).
- **Made items:** `unit = cost of inputs per unit made × markup`, where the markup depends on the line's tier:

  | Tier | Markup |
  |---|---|
  | Mk I (components) | 1.30 |
  | Mk II | 1.24 |
  | Mk III | 1.27 |
  | Mk IV | 1.30 |

  Components carry the higher markup on purpose. A first machine is usually a component maker, and it has to pay
  its way alone. A plant that makes its own components earns both markups on its products.

  A recipe may override its markup (for example, a product whose recipe is very cheap). The generator rounds unit
  prices to cents.
- **Box size (pack):** the number of units in a box is picked so a box is worth about $350, from the steps 1, 2, 4,
  6, 10, 12, 20, 24, 50, 100, 200 and 500. `packCost = pack × unit`.

### Machines and equipment

- **Machine output value per hour** = machine price × 0.8% (`economy.outputRate`). Units an hour = that value ÷ the
  output's unit price. So a costlier machine makes more value per hour, and a cheap item comes out in greater
  numbers.
- **Running cost** while producing: price ÷ 9,000 per hour (power, tooling, consumables).
- **Retooling** to another product costs 7% of the machine price.
- **Outside repair** (no mechanic on staff) costs 3.5% of the machine price.

| Equipment | Price | Notes |
|---|---|---|
| Conveyor section | $140 | one square of belt |
| Storage bin | $1,500 | 2 × 2, links storage to a belt line |
| Pallet jack | $3,900 | operators carry two boxes a trip |
| Forklift | $14,500 | four boxes a trip, parks on forklift squares |

A machine is a **5 × 3** block. Its input squares are on the left side and the front. The output is on the right,
the operator's post is at the front between the inputs, and the service hatch is at the back. Belts may run onto
input and output squares. Nothing else may sit on any of these squares.

## 4. Cities

There are 42 real US cities. City and metro populations come from the US Census Bureau's Vintage 2024 population
estimates, using the April 1, 2020 estimates base (the 2020 Census count, adjusted). Coordinates come from the
2020 Census Gazetteer. All three files are public domain; see `data/SOURCES.md`. `tools/fetch_cities.mjs` fetches
them and writes the numbers into `world.json`, so the build never needs the network.

The list leans towards manufacturing towns in the Midwest, South and West, with a few very large metros for a
harder, pricier start:

Akron, Albuquerque, Allentown, Atlanta, Birmingham, Boise, Buffalo, Charlotte, Chattanooga, Chicago, Cleveland,
Dallas, Dayton, Denver, Des Moines, Detroit, Fort Wayne, Grand Rapids, Greenville, Houston, Knoxville, Louisville,
Memphis, Milwaukee, Minneapolis, Omaha, Peoria, Philadelphia, Phoenix, Pittsburgh, Portland, Reno, Rockford, Sacramento,
Spokane, Springfield (Missouri), Toledo, Tucson, Tulsa, Wichita, Worcester and Youngstown.

City size drives wages, rent and how experienced applicants are (`economy.city`):

- average salary = $25,500 + $6,100 × log10(metro ÷ 40,000)
- average rent = $0.34 + $0.14 × log10(metro ÷ 40,000) per square foot per month
- workforce experience = 5 + 5 × log10(metro ÷ 40,000) months

## 5. Organisation

There are six departments and 14 roles. The mechanics behind them: a crew runs machines, a supervisor lifts the
crew, mechanics repair machines, engineers do research, and office staff keep the books, buy materials and sell.
Office staff need a desk.

| Department | Role | Lead? | Works in | Job |
|---|---|---|---|---|
| Front office | Plant Director | yes | office | lifts every office department |
| Finance | Finance Chief | yes | office | leads the books |
| Finance | Bookkeeper | | office | invoices, payments, payroll |
| Finance | Office Assistant | | office | filing and data entry for Finance |
| Commercial | Commercial Lead | yes | office | leads sales and promotion |
| Commercial | Account Rep | | office | wins orders |
| Commercial | Promotions Specialist | | office | raises product awareness |
| Supply | Supply Lead | yes | office | leads buying |
| Supply | Buyer | | office | places material orders |
| Production | Shift Supervisor | yes | floor | lifts machine output, lowers crew stress |
| Production | Line Worker | | floor | runs a machine or works in a cell |
| Engineering | Chief Engineer | yes | office | speeds up all research |
| Engineering | Development Engineer | | floor | runs research machines and cell technology research |
| Engineering | Plant Mechanic | | floor | services and repairs machines |

The pay multiples (of the city average salary) run from 0.6 (Office Assistant) to 2.3 (Plant Director).

### Traits

Every person has 31 traits in five groups, each scored 0 to 100. A role's job fit is a weighted average of a few
traits (weights in `world.json`). Three traits are drawbacks, where a high score is bad: coffee breaks, smoking
and grumbling.

| Group | Traits |
|---|---|
| Mind | numeracy, reasoning, wordcraft, spatial sense, memory |
| Body | fitness, strength, endurance, nimbleness |
| Work habits | diligence, timekeeping, neatness, coffee breaks*, smoking* |
| Temperament | drive, calm, grumbling*, confidence, teamwork, caution |
| Know-how | bookkeeping, selling, haggling, promotion, engineering, tinkering, drafting, programming, keyboarding, paperwork, leadership |

What some traits do in the simulation, besides job fit:

- Timekeeping sets lateness. Diligence sets early leaving and goofing off.
- Coffee breaks and smoking set the breaks a person takes. Smokers without a smoking area lose morale.
- Grumbling lowers morale. Low calm raises stress.
- Caution cuts accidents at unguarded machine inputs.
- Drive sets how far below the asking salary a person will still accept an offer.

## 6. Offices

There are five ready-made office tiers. Each seats one person. The bonus is added to that person's output.

| Office | Price | Bonus | Kit |
|---|---|---|---|
| Cubicle | $2,900 | 0% | desk, chair, phone |
| Filing office | $3,600 | +8% | adds a filing cabinet and a storage cabinet |
| Terminal office | $5,400 | +18% | adds a computer terminal |
| Workstation office | $6,900 | +28% | computer, filing cabinet and storage cabinet |
| Corner office | $9,800 | +34% | all of the above, a window and a plant; +4 morale |

**Office suites** are rooms the player designs, as an alternative. The kit on each desk counts separately:
computer +18%, storage cabinet +6%, filing cabinet +4% (a fully kitted desk matches the Workstation office). There
are also room-wide extras and comfort items.

## 7. Events and scenarios

### Monthly news

Each month, firms in town grow, shrink, close or open, and AI firms sometimes learn a product we haven't
researched yet. Then, about half the time, one piece of news:

| Event | Effect for the month |
|---|---|
| Supply squeeze | supply of one material or component falls to a quarter |
| Clearance dump | a plant dumps surplus: supply of one material or component ×4 |
| Bulk contract | a local firm wants one of our products: demand ×1.4, and sales of it earn 15% extra |
| Seasonal and local demand | demand ×1.6 for a group of products (below) |
| Freight delays | deliveries take two extra days |
| Power rate hike | running costs ×1.35 |
| Trade show | product awareness +0.08 if we sell anything |

Seasonal and local demand events (the products affected are listed in `world.json`):

- **Heat wave:** ceiling fans, coolers, rafts and blenders.
- **Cold snap:** space heaters, sleeping bags, electric kettles and hair dryers.
- **Back to school:** calculators, backpacks, desk lamps, desks, bookcases and label makers.
- **Holiday rush:** toys, games and portable electronics.
- **Office building boom:** office machines, office chairs and file cabinets.
- **Camping season:** outdoor gear and lanterns.
- **Blackout:** flashlights, lanterns, portable stereos and camp stoves.
- **New subdivision:** furniture, small appliances and lighting.

Labour unrest: if floor staff are paid well below the city average and morale is low, they may walk out. A
walkout ends when you grant an 8% raise, or after two weeks of arbitration.

Records: "best month yet" for sales and output, and a warning after three falling months of sales.

### Scenarios

| Scenario | Start | Condition |
|---|---|---|
| Garage start | $250,000 of your own | none |
| Family loan | $380,000 | reach $650,000 net worth within 30 months, or repay $200,000 |
| Angel round | $850,000 | reach $1,800,000 within 30 months, or the angel takes 35% |
| Leveraged start | $520,000, of which $320,000 is a five-year bank loan | none |

The lease on the first building runs 18 months. There is no penalty for moving early.

### Advisers

- **Business advisor:** $3,000 for a written assessment of the business.
- **Market intelligence brief:** $3,500 for a profile of one company in town.

## 8. Calendar

Play starts on January 1, 1998. Paydays are every other Friday. Rent is due on the first of the month.
