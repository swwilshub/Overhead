# Overhead: balance targets

`test/long.mjs` plays three 24-month games with a scripted "reasonable player" and checks the results against the
bands below (also in `test/balance.mjs`, which the test imports). Run it with `node test/long.mjs`. To watch one game
month by month, run `node test/long.mjs SEED CITY normal`.

## The reasonable player

- Leases a building of about 36,000 sq ft. Buys the machine that looks most profitable in that city, making
  something from bought materials. Paints safety zones, buys a pallet jack, and hires a Machine Operator, a Sales Rep
  and a bookkeeper.
- Each month, if cash allows, adds the next most promising line it can source (materials, components sold in town,
  or what it already makes). It belts the new machine to any machine that feeds it, and hires an operator.
- Hires support staff as the plant grows: a mechanic, a Materials Buyer, a Floor Supervisor, a Marketer, a second Sales Rep
  and a second bookkeeper, with offices for them.
- Takes a three-year loan for a new line once the business has made money for three months.
- Retools or replaces a line that loses money for three months running.
- Moves to a building about twice the size when the floor is full.
- Settles walkouts and grants raise requests.

## Bands

| Check | Band |
|---|---|
| Survives 24 months | no bankruptcy |
| Early safety | net worth stays above 50% of the starting money for the first six months |
| Credit | the credit line never goes over its limit |
| Steady growth | net worth after 24 months is 2.5× to 18× the starting money |
| Sales keep growing | average monthly sales in months 19–24 are at least 1.4× months 4–9 |
| No runaway money | no single month adds more than 1.3× the starting money to net worth |
| Sane prices | every market price stays within 0.6× to 1.55× its base price |

## Where the game sits now

With the current constants, the three test games (Dayton, Grand Rapids and Tulsa on normal difficulty) end at about
14 to 15 times their starting money. Across a wider sample of 14 cities, results range from about 5× (Akron, Spokane)
to about 15× (Phoenix), and all 14 survive.

A player who never grows past one machine in a large building loses money slowly. The memos and the Getting started
checklist push towards a second line and belts.

## Changing the balance

The constants with the most effect, in `data/world.json`:

- `economy.markup`: margin per stage. The component markup decides whether a first machine pays its way.
- `economy.outputRate`: revenue per machine-hour. Lowering it makes early failures more likely, more than it slows
  a strong late game.
- `economy.market.spend` and the `national*` baselines: the size of each market. The late game is limited by
  demand, so these cap runaway growth.
- `economy.market.tight*`: how much room the AI firms leave.
- `economy.runningDivisor`: running costs per machine-hour.

After any change, run `npm run gen` and `node test/long.mjs`, and update this page if the results move.
