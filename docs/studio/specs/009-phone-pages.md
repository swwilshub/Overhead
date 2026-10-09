# 009 — Pages that fit a phone

Backlog Sprint 2 · Pillars 1, 4 · Effort M · Save impact: none

## Problem

From the [sprint-2 playtest](../playtests/sprint-2.md): **M-6** tables are wider than the screen (Sales 790 px,
Purchasing 500, Hiring 492, Nation 461 on a 390 px screen); **M-7** the Nation page shrinks the map to a thumbnail and
has 92 small controls; **M-9** many controls are under 40 × 36 px; **M-11** Catalog tabs wrap to four rows.

## Player story

As a player on a phone, I read and use every screen without scrolling sideways or hitting the wrong button.

## Definitions

**Compact** is as in spec 007. **Coarse** means `(pointer: coarse)`: a touch screen at any width.

## Acceptance criteria

1. **Tables become lists of cards.** In compact mode every table shows each row as a card: the row's first cell as its
   title and each other cell as "Label: value", with the row's buttons at the bottom. The table keeps its table
   semantics for screen readers (row and column headers are still announced). No table scrolls sideways.
2. **Sorting still works.** A table that can be sorted shows a "Sort by" menu above its cards in compact mode, listing
   each column both ways ("Metro population, high to low", "City, A to Z"). The header sort buttons are not rendered
   in that layout, so nothing hidden can take focus.
3. **Nation page.** In compact mode the map is a full-width picture above the city card (not a set of controls), and
   each city is chosen from the list below, so no dot has to be hit with a fingertip. The page does not scroll sideways.
4. **Big enough to tap.** On coarse screens every button, tab, link, select, slider, checkbox and radio is at least 44 px
   high and wide, or has a 44 px tap area (an invisible hit box around a text link). Checkboxes and radios are drawn by
   the page at 44 px for this. The only exception is the hidden skip link.
5. **Catalog tabs scroll in one row** in compact mode, with the selected tab kept in view and a fade at the edge that
   shows more are there. (The city map's building cells are 44 px on coarse screens too.)
6. **No sideways scroll anywhere.** At 320, 360, 390 and 430 px wide, the page and every section have no horizontal
   scroll, on every screen of the game.

## Out of scope

New phone-only layouts for charts (they already resize), the cell designer on a phone (keeps its own scroll area; spec
for a later sprint), and changing what any table shows.

## Pillars served

1 Readable factory and business (see the numbers); 4 Accessible by default (tap targets, no sideways scrolling,
screen-reader semantics kept).

## Accessibility notes

- **Semantics:** the card layout keeps `table`, `row`, `cell`, `columnheader` roles on the elements (set explicitly,
  since the layout changes their `display`), and each value cell shows its column label as visible text.
- **Sort menu:** a labelled `select` that does what the column header button does, and announces the new order.
- **Focus order and names** from spec 004 are unchanged.
- **Zoom:** layouts hold at the largest text size and at browser zoom up to 200%.

## Balance knobs

None.

## Test plan

- **Playwright, phone context (`test/phone_test.py`):** for every screen at 320, 390 and 430 px wide, `scrollWidth`
  equals the viewport; Hiring renders cards with labels; Sort by reorders; Nation shows the map above the card; tap
  targets of at least 44 px (a measured sweep with the listed exceptions); Catalog tabs in one row; axe zero
  violations on each; the accessibility tree still shows row and column headers for a card table.
- **Existing tests** pass at 1366 × 900 (tables unchanged).

## Save impact

None.

## Files likely touched

`src/ui/dom.js` (`table()` writes labels and roles and a sort menu), `src/ui/views/*.js` (Nation, Catalog tabs),
`src/index.html` (compact and coarse CSS).
