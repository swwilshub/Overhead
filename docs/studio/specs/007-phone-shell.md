# 007 — Phone shell: a compact top bar and a menu

Backlog Sprint 2 · Pillars 1, 4 · Effort M · Save impact: none

## Problem

From the [sprint-2 playtest](../playtests/sprint-2.md): **M-4** the status bar and section bar use a third of a phone
screen; **M-5** the menu is a sideways strip of 13 links with the later ones hidden; **M-12** landscape is untested.

## Player story

As a player on a phone, I see my money and the clock at a glance, reach every part of the game from a menu, and keep
most of the screen for the factory.

## Definitions

**Compact** screens match `(max-width: 700px), (max-height: 500px)`: phones in portrait and landscape. Everything
else keeps today's layout.

## Acceptance criteria

1. **A slim top bar.** In compact mode the status bar is at most 96 px tall (two lines): company name, checking, the
   issues button, the clock, and four speed buttons (Pause, Play, Fast, Faster) at least 44 px square. Net worth and
   city move into the menu. **Run until…** and **Sound** move into the menu, with the same labels and behaviour.
2. **A bottom bar.** A bar fixed to the bottom has **Floor**, **Staff**, **In-basket** (with the unread count) and
   **Menu**, at least 48 px high, clear of the home-bar area (`env(safe-area-inset-bottom)`).
3. **The menu lists everything.** **Menu** opens a sheet from the bottom (88% of the screen, the game visible above it)
   with every section of the game, grouped as the desktop menu is, plus Net worth, City, Run until… and Sound.
   Choosing a section closes it and opens that section. Escape, a tap on the screen above it, or **Close** closes it,
   and focus returns to **Menu**.
4. **Same game, same names.** Every section is reachable in at most two taps, under the desktop menu's names, so keys
   such as `g` then a letter keep working.
5. **Landscape works, and nothing scrolls sideways.** At 844 × 390 the top bar is one line and nothing needed is off
   screen. On every section the page is no wider than the screen at 320, 390 and 430 px. (Building this found the
   page was zooming out on phones because screen-reader-only text beside a table's last column escaped the table's
   clipping; tables and the main area are now positioned boxes, and four grids became one column.)
6. **Desktop is unchanged.** At 1280 × 800 the layout is exactly today's.

## Out of scope

Swipe gestures between sections, a different layout for tablets, and a customisable bottom bar.

## Pillars served

1 Readable factory (more room to see it); 4 Accessible by default (large targets, a menu that does not hide links).

## Accessibility notes

- **Landmarks:** the bottom bar is a `nav` named "Main"; the Menu sheet holds a `nav` named "Departments" (the side
  menu is not on the page in compact mode, so there is one of each). The sheet's items are buttons, because choosing
  one changes the section without changing the address.
- **Menu button:** `aria-haspopup="dialog"`; the open sheet is a native modal dialog, so focus is held in it, Escape
  closes it, the page behind is inert and focus returns to the button.
- **Screen readers:** the clock and cash keep their labels; hidden-for-space items are removed from the page in
  compact mode, not just hidden by colour or size.
- **Text size:** the four text sizes still work; at the largest, the bars wrap rather than clip.

## Balance knobs

None.

## Test plan

- **Playwright, phone context (`test/phone_test.py`, new):** at 390 × 844 and 844 × 390: the top bar height, the
  bottom bar, Menu opens and closes (Escape, outside tap, Close), focus returns, every section reachable, and the page
  does not scroll sideways on any section (also at 320 px). axe zero violations in compact mode, menu open and closed.
- **Existing tests** pass at 1366 × 900.

## Save impact

None.

## Files likely touched

`src/ui/app.js` (status bar, nav, menu state), `src/index.html` (compact CSS), `src/ui/dom.js` if a helper is needed.
