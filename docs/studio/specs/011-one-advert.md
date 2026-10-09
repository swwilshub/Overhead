# 011 — One simple advert; applicants at any level

Backlog Sprint 3 · Pillars 1, 3, 4 · Effort M · Save impact: none beyond spec 010's migration

## Problem

From the [sprint-3 playtest](../playtests/sprint-3.md): **F-2** Hiring is fourteen rows, each its own advert, 6.4
screens on a phone to place one ad.

## Player story

As an owner, I pick the kind of person I need, press one button, and over the next week people of different seniority
apply.

## Acceptance criteria

1. **One advert per family.** `placeAd(st, family)` places a seven-day advert for a family (or for the Plant Director)
   for a flat $300 ($550 for the Plant Director, as today). Only one advert per family runs at a time. Old adverts
   (`job`) are read as their family (spec 010 migration).
2. **Applicants arrive at any level.** Each resume from an advert is a Junior, Senior or Director drawn with
   `economy.seniority.resumeLevels` (starting point 70, 25, 5 percent), as `family_level` jobs. A Senior or Director
   applicant has the experience their level implies (a few more years of work, and a better spread of traits), asks for
   pay in line with their job, and starts with the experience their level begins at.
3. **Hiring page.** Large tabs, one per family (and the Plant Director), choose the family. The selected family shows
   its three levels as a line with three dots, each with its title, the city's average pay and how many you have of
   it; a **Place ad** button (or "Ad running until Friday" with no button while one runs); and under it Resumes on
   file, as today, with each applicant's title (which says their level), fit, asking pay and **Make offer**.
4. **Everything that named a job to hire still reads well.** Quick start, the checklist, the Staff notes and the
   Purchasing and Sales pages say "Hire a Junior Operator", "Hire a Junior Buyer" and so on (the level 1 title).

## Out of scope

Choosing the level you want in the advert, ad budgets that shift the odds, applicants poaching, and the Hiring page
fitting one phone screen exactly (spec 014, the one-screen sprint, does the pager; this page is already short).

## Pillars served

1 Readable factory (fewer things to read); 3 Business tension (a Senior is the expensive shortcut); 4 Accessible by
default (one control, large tabs, fewer rows).

## Accessibility notes

- The tabs are a proper `tablist` with arrow keys (as the Catalog's); the three-dot line is text underneath ("Junior,
  Senior, Director") and each dot is not the only way to read the level.
- "Ad running" is text; the button's name says which family it places an ad for.

## Balance knobs

`economy.seniority.resumeLevels`; the ad price (300 and 550) stays in code as today.

## Test plan

- **Node `test/seniority.mjs`:** an ad creates resumes at all three levels over many days in roughly the set
  proportions; a Senior applicant asks for more than a Junior; one advert per family at a time; the cost; a migrated
  old advert is a family advert.
- **Playwright `test/hire_ui_test.py` (new):** the family tabs, Place ad, the ladder line and counts, resumes with
  levels, Make offer hires at the right job; axe on the page; and at 390 × 844 the page needs no more than 1.5 screens
  of scrolling (down from 6.4).

## Save impact

None beyond spec 010 (`st.ads[].family`).

## Files likely touched

`src/sim/game.js` (`placeAd`, resume generation), `src/sim/people.js` (`makeCandidate` for a level),
`src/ui/views/people.js` (Hiring), `src/index.html`, tests.
