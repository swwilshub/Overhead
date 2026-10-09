# 008 — Pop-ups and panels as bottom sheets

Backlog Sprint 2 · Pillars 1, 4 · Effort M · Save impact: none

## Problem

From the [sprint-2 playtest](../playtests/sprint-2.md): **M-3** the panel for a selected machine is below the canvas,
out of sight; **M-8** pop-ups sit mid-screen with right-aligned, wrapping buttons; **M-10** toasts cover content.

## Player story

As a player on a phone, a question appears where my thumb is, the machine I tapped shows its details right there, and
messages do not hide what I am doing.

## Definitions

**Compact** is as in spec 007.

## Acceptance criteria

1. **Dialogs are bottom sheets.** In compact mode every dialog is anchored to the bottom, full width, with rounded top
   corners, at most 85% of the screen high (it scrolls inside if longer), clear of the home-bar area. Its buttons are
   full width, at least 48 px high, one per row, the main action first. Wide dialogs (the Catalog's cell designer
   is not one) use the same rule.
2. **The selected item's panel is a sheet.** On the Factory floor in compact mode, selecting something opens its panel
   as a sheet above the bottom bar, at most 55% of the screen high, scrolling inside. The floor above stays tappable.
   **Close** (a 44 px button) or tapping an empty square clears the selection and closes it. With nothing selected
   the panel (Getting started, Cursor) is not shown as a sheet but is under the floor as today.
3. **Focus rules hold.** Opening the sheet from a tap does not steal focus from the floor grid; closing returns focus
   to the grid. The keyboard `i` key still moves focus into the panel, and Escape clears the selection and closes it.
4. **Toasts stay clear.** In compact mode toasts show at the top under the top bar, at most two at a time, and do not
   take taps.
5. **Desktop is unchanged.** At 1280 × 800 dialogs, the panel and toasts look as they do today.

## Out of scope

Dragging a sheet to resize or dismiss it, a sheet for the Catalog's machine list, and changing dialog wording.

## Pillars served

1 Readable factory (what you tapped is shown); 4 Accessible by default (large buttons, reachable with a thumb).

## Accessibility notes

- **Dialogs** stay native `dialog` elements (modal, labelled, Escape closes); only their placement and button layout
  change.
- **The panel sheet** keeps its headings and region labels; "Close" is a real button named "Close panel".
- **Screen readers:** selecting announces as it does now; opening the sheet adds no extra announcement.
- **Reduced motion:** no slide animation when it is on; a short fade otherwise.

## Balance knobs

None.

## Test plan

- **Playwright, phone context (`test/phone_test.py`):** a dialog (Run until…, Sell) is bottom anchored, full width,
  buttons at least 48 px and stacked; the panel sheet appears on selecting a machine, is at most 55% high, closes with
  Close, Escape and an empty-square tap, and focus returns to the grid; toasts are at the top and at most two; axe with
  a dialog and with the sheet open.
- **Existing tests** pass at 1366 × 900.

## Save impact

None.

## Files likely touched

`src/ui/views/floor.js` (panel container and Close), `src/ui/dom.js` (dialog placement class), `src/index.html`.
