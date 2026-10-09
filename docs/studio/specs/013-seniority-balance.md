# 013 — Balance for seniority (economist)

Backlog Sprint 3 · Pillar 3 · Effort S · Save impact: none

## Problem

Spec 010 raises pay and skill together. If pay rises faster than output, learning is a trap; if output rises faster,
every game snowballs. The 24-month balance bands in `docs/design/balance.md` must still hold.

## Acceptance criteria

1. **The bands hold.** `test/long.mjs` passes for all three seeds, with the player bot hiring juniors as before:
   the bands for end net worth, sales growth, the biggest one-month gain and prices are unchanged.
2. **Learning is worth it, a little.** Over 24 months, the staffed plant's total pay rises by 15 to 40 percent from
   promotions, and its output per employee rises by 5 to 15 percent. Reported by a new line in the long test.
3. **Promotions happen at the pace the spec says.** In the long test, the first Senior Operator appears between months
   5 and 8, and the first Director between months 18 and 24 (for a hire in month 1).
4. **Nobody promotes in a rush or never.** No more than 3 promotions in one game day across the plant; at least one
   promotion in a 24-month game with 3 or more staff.
5. The numbers chosen and the report are written into `docs/design/balance.md` and `docs/design/economy.md`.

## Out of scope

New strategies for the bot (a bot that fires and re-hires, or one that buys only Seniors).

## Balance knobs

`xpToSenior`, `xpToDirector`, `growthPerLevel`, `growthWithinLevel`, the pay multiples in spec 010, and `resumeLevels`.

## Test plan

`test/long.mjs`: promotions per run, first Senior and first Director dates, payroll and output-per-employee change,
all asserted against the ranges above, for careful, greedy and idle play.

## Save impact

None.

## Files likely touched

`data/world.json` (numbers), `test/long.mjs`, `docs/design/balance.md`, `docs/design/economy.md`.
