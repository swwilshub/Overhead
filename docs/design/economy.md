# Overhead: economy and cost model

How money moves through a game. All constants live in `data/world.json` under `economy`. The code that uses them is
in `src/sim/world.js` (cities and markets) and `src/sim/game.js` (the plant, people and the bank).

## Prices

Every item has a **base unit price**. Materials are priced by hand. Made items are priced from their recipe:
input cost per unit made × the markup for their line's tier (see `world.md`).

Each month the city's **market price** moves towards

    base × (demand ÷ supply) ^ priceExp        (clamped to priceMin … priceMax)

with `priceExp` 0.25 and a range of 0.65 to 1.5 times base. The price moves halfway to that target each month, with
±3% noise. What we sold last month counts as supply, and what we bought counts as demand. So flooding a market pushes
its price down, and buying it up pushes the price up.

## Supply and demand in a city

- **AI manufacturers.** Each runs one recipe. A city has 40 to 130 firms, rising with the log of its metro
  population, and about 13% of them are material vendors. When the city is generated, each made item's AI supply is
  scaled to *tightness* × demand. Tightness is drawn per item: 0.75 to 1.15 for products, 0.85 to 1.2 for
  components. Below 1 leaves room for us; above 1 means a crowded market.
- **Material vendors** stock the larger of 1.35 × what the AI firms use and `vendorFloor` ($40,000) of stock per
  vendor. Each vendor sells us at most 40% of its monthly stock.
- **Households** spend `spend` (0.18) × the city's market size, in dollars, on each product each month. The market
  size grows with the square root of the metro population, around a reference of one million (`refMetro`,
  `exponent` 0.5). So Chicago is about three times the market of a million-person metro, not nine times.
- **Out-of-town buyers** add a baseline for every made item: about $80,000 a month per product and $120,000 per
  component, ±30%.

## Selling

At 3 pm every workday, each product in stock sells to two kinds of buyer:

- **Open demand** (demand the AI firms don't cover). We take a share of it set by our price against the market and
  by how good our sales staff are.
- **Contested demand.** We split this with the AI producers, weighted by attractiveness: sales staff, product
  awareness from marketing, quality, and price^-3.

Customers pay 14 days after delivery, plus however many days Finance is behind.

## Costs

| Cost | How it is worked out |
|---|---|
| Rent | building sq ft × the city's rent per sq ft, monthly; $0.34 + $0.14 × log10(metro ÷ 40,000) per sq ft |
| Wages | job pay multiple × the city's average salary, paid every other Friday, plus 8% payroll overhead |
| Materials | the vendor's box price; bills are due 10 days after delivery, with late fees when Finance runs behind |
| Running a machine | machine price ÷ 9,000 per hour while it produces (power, tooling, consumables) |
| Repairs | free with a Plant Mechanic on staff, or 3.5% of the machine's price for an outside crew |
| Retooling | 7% of the machine's price |
| Offices | $40 a month per desk |
| Depreciation | equipment loses 1.5% of its value each month |
| Bank | savings earn 4%; the credit line costs 17%; loans cost 7.9% + 0.4% per year of term, more with other loans or a drawn credit line |

## Production

A machine's rated output is its price × `outputRate` (0.8%) in dollars of product per hour, so units an hour =
that ÷ the product's base unit price. Actual output is the rating × efficiency. Efficiency is set by:

- the operator's skill and morale;
- a Floor Supervisor's boost;
- the machine's service level (credits, kept up by a mechanic);
- time lost carrying boxes;
- materials running out, or the output tray filling.

A typical hand-fed machine with a mid-skill operator runs at 55–70%. Belts, pallet jacks and forklifts raise that.

## Why this shape

- The first machine has to roughly pay its way in a modest building, so a careful start doesn't end in bankruptcy.
- Making your own components earns two markups, so vertical integration is the main route to growth.
- Market size grows more slowly than population, so a giant metro is a bigger opportunity but not an endless one.

`docs/design/balance.md` lists the target bands the test suite checks.
