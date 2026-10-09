# Overhead: balance targets

`test/long.mjs` plays three 24-month games with a scripted "reasonable player" and checks the results against the
bands below (also in `test/balance.mjs`, which the test imports). Run it with `node test/long.mjs`. To watch one game
month by month, run `node test/long.mjs SEED CITY normal`.

## The reasonable player

- Leases a building of about 36,000 sq ft. Buys the machine that looks most profitable in that city, making
  something from bought materials. Paints safety zones, buys a pallet jack, and hires a Junior Operator, a Junior Sales Rep
  and a Finance Clerk.
- Each month, if cash allows, adds the next most promising line it can source (materials, components sold in town,
  or what it already makes). It belts the new machine to any machine that feeds it, and hires an operator.
- Hires support staff as the plant grows: a Junior Mechanic, a Junior Buyer, an Operations Director (the foreman), a Junior Promoter, a second Junior Sales Rep
  and a second Finance Clerk, with offices for them. It always hires Juniors (the level 1 job of each family) except for the foreman, which is a Director-level job; it never fires, so everyone it hires learns.
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
| Seniority, first Senior | the first promotion to Senior comes in month 5 to 8 |
| Seniority, first Director | the first promotion to Director comes in month 18 to 24 |
| Seniority, pace | at least one promotion in 24 months, and never more than 3 in a game day |
| Seniority, payroll | after 24 months the payroll is 35% to 65% above what the same people would cost unpromoted |

## Where the game sits now

With the current constants, the three test games (Dayton, Grand Rapids and Tulsa on normal difficulty) end at about
13 to 15.5 times their starting money (seniority included). Across a wider sample of 14 cities, results range from about 5× (Akron, Spokane)
to about 15× (Phoenix), and all 14 survive.

A player who never grows past one machine in a large building loses money slowly. The memos and the Getting started
checklist push towards a second line and belts.

## Seniority (specs 010 and 013)

People learn on the job and are promoted, so pay and skill both rise. The test games promote 14 to 15 people in
24 months; the first Senior arrives in month 5.3 to 5.5 and the first Director in month 22.7 to 23.3. Payroll ends
about 50% above what the same people would cost had nobody been promoted, because everyone reaches Senior in the
first year and a Senior costs 1.4 to 1.6 times a Junior.

Is learning worth it? Running the same seeds with promotion switched off (`NOLEARN=1 node test/long.mjs SEED CITY`)
ends within about 13% of the version with learning (Dayton 13% lower with learning, Grand Rapids 1% higher, Tulsa 5%
higher). Skill growth (+0.10 a level, +0.08 across a level) roughly pays for the raise for a player who never
fires, and a Director foreman and the leads of the office departments pay for themselves. The bot makes different
choices after the first differing month, so a difference of a few percent between runs is noise. The spec's
output-per-employee band (5 to 15 percent) is not asserted: output per employee depends mostly on which products the bot
picks. Raising `growthPerLevel` to 0.15 broke one test game (the bot's loan timing went wrong), so the knobs are kept
moderate.

Foreman: the foreman effect is the Operations Director's (`foreman` role, level 3 only), not a cheap level 1 hire.
A new player cannot buy a foreman on day one; they get one by promoting an operator (about two years) or by an advert
that brings a Director (5% of applicants). The boost is
averaged over foremen, so more than one does not stack.

## Changing the balance

The constants with the most effect, in `data/world.json`:

- `economy.markup`: margin per stage. The component markup decides whether a first machine pays its way.
- `economy.outputRate`: revenue per machine-hour. Lowering it makes early failures more likely, more than it slows
  a strong late game.
- `economy.market.spend` and the `national*` baselines: the size of each market. The late game is limited by
  demand, so these cap runaway growth.
- `economy.market.tight*`: how much room the AI firms leave.
- `economy.runningDivisor`: running costs per machine-hour.
- `economy.seniority`: `xpToSenior`, `xpToDirector`, `growthPerLevel`, `growthWithinLevel`, `resumeLevels`; and each job's `pay`. Rerun `node test/seniority.mjs` and the long test after any change.

After any change, run `npm run gen` and `node test/long.mjs`, and update this page if the results move.
