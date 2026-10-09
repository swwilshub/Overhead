# 010 — Seniority ladders: three levels, experience and promotion

Backlog Sprint 3 · Pillars 1, 3 · Effort L · Save impact: **yes, version 2 with a migration**

## Problem

From the [sprint-3 brief](DRAFT-staff-seniority-and-one-screen.md): fourteen separate jobs mean a long, flat Hiring list,
and staff never change. The `growth` field on every employee exists but nothing ever sets it. Players have no reason to
keep people, and a bigger plant is just more of the same hires.

## Player story

As an owner, I hire people at the bottom, they learn the job and step up on their own, and I can pay more to bring in
someone already senior.

## Definitions

A **family** is a line of work (Operations, Maintenance, Engineering, Finance, Sales, Promotions, Purchasing). A
**level** is 1 Junior, 2 Senior or 3 Director. Each (family, level) is one job record in `data/world.json`, keyed
`<family>_<level>` (for example `operations_1`), with `family`, `level` and `next` (the key of the level above, none at
3). The Plant Director stays a single job with no family, as today.

## Acceptance criteria

1. **Twenty-one laddered jobs plus the Plant Director replace the old fourteen.** Titles, departments and pay (as a
   multiple of the city's average salary, level 1 / 2 / 3):

   | Family (department) | Level 1 | Level 2 | Level 3 |
   |---|---|---|---|
   | Operations (Production) | Junior Operator .64 | Senior Operator 1.0 | Operations Director 1.5, supervises |
   | Maintenance (Engineering) | Junior Mechanic .88 | Senior Mechanic 1.15 | Maintenance Director 1.55 |
   | Engineering (Engineering) | Junior Engineer 1.1 | Senior Engineer 1.45 | Engineering Director 1.9, leads research |
   | Finance (Finance) | Finance Clerk .6 | Bookkeeper 1.0 | Finance Director 1.65, leads |
   | Sales (Sales) | Junior Sales Rep .95 | Senior Sales Rep 1.3 | Sales Director 1.8, leads |
   | Promotions (Sales) | Junior Promoter .92 | Senior Promoter 1.25 | Promotions Director 1.75, leads |
   | Purchasing (Purchasing) | Junior Buyer .82 | Senior Buyer 1.1 | Purchasing Director 1.5, leads |

   Roles are as the old jobs had them (operator, researcher, maintenance, finance, sales, marketing, purchasing); the
   level 3 jobs add the supervising or leading role the old manager jobs had. Level 3 Engineering is a desk job, as
   the old Chief Engineer was. Every name passes `npm run scan`; any that does not is replaced, not allowlisted.
2. **Experience.** Each employee has `xp`. At the end of each workday they earn
   `min(1, minutes worked ÷ 480) × (0.7 + 0.6 × job fit)` points, so a full day at an average fit earns about one.
   Constants in `economy.seniority`: `xpToSenior = 130`, `xpToDirector = 430` (about 6 and 20 months of steady work).
3. **Promotion is automatic.** When `xp` reaches the next threshold the employee's job becomes `next`. Their salary
   keeps the same ratio to the city average for the new job (so a well-paid junior becomes a well-paid senior), their
   last-raise date resets, their morale lifts a little, and a non-urgent memo from Personnel says who is now what.
4. **Learning shows in skill.** `growth` is set from level and progress: `0.05 × (level − 1) + 0.05 × progress to the next
   level` (progress is 1 at level 3), so a Director is up to 0.15 better than their fit alone. Constants in
   `economy.seniority`: `growthPerLevel`, `growthWithinLevel`.
5. **Old saves migrate.** `VERSION` becomes 2. A version 1 save maps each old job to the nearest (family, level):
   Machine Operator → operations_1, Floor Supervisor → operations_3, Plant Mechanic → maintenance_1, Research Engineer →
   engineering_1, Chief Engineer → engineering_3, Finance Clerk, Bookkeeper, Finance Manager → finance_1, _2, _3,
   Sales Rep → sales_1, Sales Manager → sales_3, Marketer → promotions_1, Materials Buyer → purchasing_1, Purchasing
   Manager → purchasing_3, Plant Director unchanged. Each employee starts at the experience their level begins at. The
   same mapping applies to running ads and to applicants waiting in the In-basket. A newer save is still refused.
6. **Nothing else breaks.** The old effects still work through roles: office families produce through their department
   power, Directors lead, Level 3 Operations supervises, and everything that asked "is there an operator / a mechanic /
   an engineer" is still answered. Quick start, checklist and memo text that name a job to hire name the level 1 job.

## Out of scope

Demotion, training courses or paying for training, leaving for another firm after promotion, per-person career
choices, and a level 4.

## Pillars served

1 Readable factory (people visibly grow); 3 Business tension (payroll rises as people improve, against output).

## Accessibility notes

- The level is always written as text (the job title carries it), never only by colour or position.
- Promotion memos use the normal In-basket announcement; no extra live message.

## Balance knobs

`economy.seniority`: `xpToSenior`, `xpToDirector`, `growthPerLevel`, `growthWithinLevel`, `resumeLevels`. Pay per
job in `data/world.json`. Spec 013 sets and checks them.

## Test plan

- **Node `test/seniority.mjs` (new):** the ladder data (every family has 3 jobs linked by `next`; level 3 has none);
  a worked employee earns experience and is promoted at the thresholds, once; salary ratio kept; growth follows level;
  an employee who never works earns nothing; Directors lead and supervise; promotion memo sent once.
- **Node `test/saves.mjs`:** the version 1 fixture loads, every employee has a valid new job, the mapping holds, 30
  days run with no NaN; a new `test/fixtures/save-v2.json` loads; a newer version is refused.
- **Node `test/names.mjs`, `test/blurb.mjs`, `test/lib.mjs`:** updated to the new titles; `job(role)` returns level 1.

## Save impact

Yes. `VERSION = 2`; `migrate()` rewrites `employee.job`, adds `xp`, rewrites `st.ads[].job` to `family`, and rewrites
`job` inside waiting resumes. A fixture and a test for each version.

## Files likely touched

`data/world.json`, `tools/gen_world.mjs` (validate ladders), `src/core/content.js` (`ladder`, `levelOf`, `jobAt`),
`src/sim/people.js` (hire, skill, experience), `src/sim/game.js` (end-of-day learning, promotion, `migrate`,
`VERSION`), docs (`docs/design/world.md`, `README.md`), tests.
