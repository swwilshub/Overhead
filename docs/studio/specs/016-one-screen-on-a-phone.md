# 016 — Everything on one screen, on a phone

Backlog Sprint 6 · Pillars 1, 4 · Effort L · Save impact: none

## Problem

Sam: "For it to be a true mobile game everything needs to fit on one screen … we make better use of large tabs and left and
right navs, especially for clustered menus. We need to avoid vertical scrolling." And again, after the floor became the whole
window: "no, everything must be on one screen on mobile."

Measured today (screens tall at 390 × 844 / 360 × 740 / 844 × 390): floor 1.0 / 1.0 / 1.0, staff 1.0 / 1.1 / 2.1, hiring
1.0 / 1.3 / 2.1 (with no resumes waiting), inbox 1.0 / 1.0 / 1.8, reports 1.0 / 1.1 / 1.8, sales 1.9 / 2.3 / 4.1, purchasing
3.2 / 3.0 / 5.5, bank 2.9 / 3.5 / 5.2, city 4.5 / 5.4 / 10.2, catalog 6.1 / 7.4 / 10.9, options 6.7 / 8.3 / 13.9, research
11.3 / 13.7 / 26.6, nation 16.1 / 20.1 / 39.5 (`playtests/evidence/sprint-3/`, `sprint-6/`).

## Player story

As a player on a phone, every page is one screen. I move between pages with large tabs, with arrows at the thumb, or by swiping
left and right, and I never scroll down.

## Acceptance criteria

1. **A pager.** `pager()` (new `src/ui/pager.js`) turns a section into **groups** (the large tabs) made of **blocks** (cards, a
   table row, a chart). It measures the blocks and packs them into **pages** that fit the space; a group longer than one screen
   becomes several pages. It shows the current page only, with the tabs along the top, **Previous and Next** buttons and a
   "2 of 3" count, and a swipe left or right to move through every page of the section in order. On a landscape phone the tabs stand
   in a column at the left. The tab strip scrolls sideways when there are many groups (the Catalog has fifteen).
2. **Phones only.** The pager is used when the interface is compact (spec 007); desktop pages stay as they are. Both layouts are built
   from the same pieces.
3. **Every section fits.** At 390 × 844, 360 × 740 and 844 × 390, the Staff, Hiring, In-basket, Purchasing, Sales, Bank, Reports,
   Research, Catalog, City, Nation, Options and start pages never scroll vertically, with a large amount of content in them (many
   products, loans, memos, resumes, cities). A test sweeps them and fails on any overflow. The Floor already fits (spec 015).
4. **Dialogs fit.** The common dialogs (resume and offer, buy, loan confirmation, sell, retire, save, credit) fit without scrolling at
   360 × 740 and 844 × 390, by being shorter on a phone or by paging inside the dialog.
5. **Place kept.** Which group and page you are on is remembered per section and survives the one-second redraws; selecting something
   (a memo, a city) moves to the page that shows it.
6. **Accessibility.** Tabs are a `tablist` with arrow keys; the page change is announced ("Stock, page 2 of 3"); hidden pages are not in
   the tab order; nothing depends on swiping; axe is clean on every section in the phone layout.
7. **Large targets.** Tabs, arrows and the controls inside pages are at least 44 px.

## Out of scope

The desktop layout; a new look for the pages; the dialogs on a desktop; making content shorter by deleting it (everything stays
reachable, only moved into pages).

## Pillars served

1 Readable factory (one thing at a time, nothing hidden below the fold); 4 Accessible by default (tabs and arrows as well as
swiping, announced page changes, large targets).

## Accessibility notes

`role=tablist` / `tab` / `tabpanel` with the Catalog's key handling; `aria-live=polite` page announcement; Previous and Next are real
buttons with names; blocks on other pages use `display: none`, so they leave the tab order and the accessibility tree; reduced motion
turns off the slide.

## Balance knobs

None.

## Test plan

- **`test/one_screen_test.py` (new):** each section at the three sizes, loaded with extra content, asserts no vertical overflow,
  at least one tab or arrow works, the swipe moves a page, keyboard, announcements, 44 px targets, axe; dialogs listed above
  fit at 360 × 740 and 844 × 390.
- **Node `test/pager.mjs` (new):** the packing function (greedy pages, oversized block, empty, stable under a resize).
- Existing phone and UI tests updated for pages.

## Save impact

None.

## Files likely touched

`src/ui/pager.js` (new), `src/ui/views/*.js`, `src/ui/dom.js`, `src/ui/app.js`, `src/index.html`, tests, docs.
