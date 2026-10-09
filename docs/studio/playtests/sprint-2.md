# Playtest, sprint 2: the game on a phone

Owner request: "make the game work on mobile, so there will need to be some work on menus and popups. Maybe a pinch to
zoom screen." Played by the producer in headless Chromium with touch emulation (390 × 844 CSS pixels, device scale 2,
touch events on, mobile viewport), on the sprint 1 build. Screenshots and the raw measurements are in
[evidence/sprint-2](evidence/sprint-2). The measurements come from a script that walks every screen and counts
horizontal overflow, controls smaller than 40 × 36 pixels and dialogs that do not fit.

## Findings

| # | Sev | What happens on a phone | Evidence |
|---|---|---|---|
| M-1 | 1 | **The floor cannot be panned or zoomed with a finger.** The canvas sets `touch-action: none` and has only mouse-style handlers, so a drag does nothing. The only way to move around a plant that is twice the screen width is the scroll bars. | [phone-floor.png](evidence/sprint-2/phone-floor.png) |
| M-2 | 1 | **Every touch acts at once.** `pointerdown` runs the primary action, so the first touch of a drag selects, paints or places. Placing a machine happens the moment a finger lands. | `floor.js` `pointerdown` |
| M-3 | 1 | **The panel for a selected machine is out of sight.** Tapping a machine selects it, but its details, Move and Sell buttons are below the canvas, off the bottom of the screen. Nothing visible happens. | [phone-floor-selected.png](evidence/sprint-2/phone-floor-selected.png) |
| M-4 | 2 | **The top of the screen is mostly chrome.** The status bar (two rows of figures, six buttons) plus the section bar use about 260 of 844 pixels, a third of the screen, before any content. | [phone-floor.png](evidence/sprint-2/phone-floor.png) |
| M-5 | 2 | **The menu is a sideways-scrolling strip of 13 links.** "Hiring" is cut off after "Staff" and there is no sign that more are to the right. | [phone-catalog.png](evidence/sprint-2/phone-catalog.png) |
| M-6 | 2 | **Tables are wider than the screen.** Sales is 790 px wide, Purchasing 500, Hiring 492, the Nation page 461 on a 390 px screen. Columns are clipped ("EXPE…") and the table scrolls sideways inside its card. | [phone-hiring-table.png](evidence/sprint-2/phone-hiring-table.png) |
| M-7 | 2 | **The Nation page shows a thumbnail of the map** squeezed beside the city card, and 92 controls smaller than 40 × 36 px. | [phone-nation.png](evidence/sprint-2/phone-nation.png) |
| M-8 | 2 | **Pop-ups sit in the middle of the screen** with buttons right-aligned and wrapping onto three rows ("Run the clock until…"). They fit, but the buttons are at the thumb's far corner and two to a row. | [phone-dialog.png](evidence/sprint-2/phone-dialog.png) |
| M-9 | 3 | **Small touch targets.** Between 6 and 32 controls per screen are smaller than 40 × 36 px (tabs, links in tables, the zoom buttons, the speed buttons are close at 44 px but the "−" and "+" are not). | `phone-audit-390x844.json` |
| M-10 | 3 | **Toasts cover content** at the bottom of the screen and have no room above a bottom bar. | [phone-catalog.png](evidence/sprint-2/phone-catalog.png) |
| M-11 | 3 | **Catalog tabs wrap to four rows**, pushing the machines down. | [phone-catalog.png](evidence/sprint-2/phone-catalog.png) |
| M-12 | 3 | **Landscape is untested and likely worse:** at 844 × 390 the layout is the desktop one, and the status bar alone would fill the height. | not played; width rule is `max-width: 860px` |

What works: no page error on any screen, no horizontal scroll of the page itself on most screens (the overflow is in
tables), dialogs fit the screen, the text is readable without zooming, the buttons in the status bar are close to
finger size.

## What a first-timer on a phone would do

Open the page, tap Quick start, see a factory, try to drag it around (nothing), try to tap the machine (a blue marker
moves, nothing else seems to happen, M-3), scroll the page to find the panel, and give up on pinch because it does
nothing.
