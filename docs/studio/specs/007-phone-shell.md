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
3. **The menu lists everything.** **Menu** opens a full-height sheet with every section of the game, grouped as the
   desktop menu is, plus Net worth, City, Run until… and Sound. Choosing a section closes it and opens that section.
   Escape, a tap outside, or **Close** closes it, and focus returns to **Menu**.
4. **Same game, same names.** Every section is reachable in at most two taps. The links are the desktop menu's links
   (the same `nav` element, restyled), so keys such as `g` then a letter keep working.
5. **Landscape works.** At 844 × 390 the top bar is one line and nothing needed is off screen; the page does not scroll
   sideways at any width from 320 px up.
6. **Desktop is unchanged.** At 1280 × 800 the layout is exactly today's.

## Out of scope

Swipe gestures between sections, a different layout for tablets, and a customisable bottom bar.

## Pillars served

1 Readable factory (more room to see it); 4 Accessible by default (large targets, a menu that does not hide links).

## Accessibility notes

- **Landmarks:** the bottom bar is a `nav` named "Main"; the menu sheet is the existing "Departments" `nav`. Both are
  real lists of links and buttons.
- **Menu button:** `aria-expanded` and `aria-controls`; the open sheet traps focus, and the page behind is inert.
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
