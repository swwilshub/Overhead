# 006 — Touch controls for the floor

Backlog Sprint 2 · Pillars 1, 4 · Effort L · Save impact: none

## Problem

From the [sprint-2 playtest](../playtests/sprint-2.md): **M-1** a finger cannot pan or zoom the floor (the canvas has
`touch-action: none` and only mouse handlers); **M-2** every touch acts at once, so the first touch of a drag selects,
paints or places; **M-9** the zoom buttons are tiny.

## Player story

As a player on a phone or tablet, I drag to look around my plant, pinch to zoom, tap to select, and I only place
something when I say so.

## Definitions

"Touch" means a pointer event with `pointerType` `touch` (or `pen`), on any screen size. Mouse behaviour is unchanged.
Zoom is a number from the plant-fits-the-frame minimum ("fit") up to 4×.

## Acceptance criteria

1. **Pan.** In Select mode, a one-finger drag scrolls the floor, following the finger. A touch that moves less than
   10 px and lasts under 500 ms is a tap. Two fingers pan in every mode.
2. **Pinch zoom.** Two fingers zoom between ¼× and 4×, keeping the point between the fingers where it is. The number
   beside the buttons shows it ("1.5×"). The zoom buttons step through ¼, ½, ¾, 1, 1.5, 2, 3 and 4, and a new **Fit**
   button shows the whole plant. Zoom and the scrolled position survive a redraw and are kept while the game is open.
   On a phone the floor starts fitted to the screen (between 1× and 2×); everywhere else it still starts at 2×.
3. **Tap selects, drag does not.** A tap on a square moves the cursor there and selects (or clears) as a click does. A
   drag in Select mode never selects.
4. **Placing needs a confirm.** On a touch screen (primary pointer coarse), when a machine, office, bin or other item
   is being placed or moved, a touch moves the ghost (a drag moves it with the finger) and lifting does nothing; a new
   item starts in the middle of what is on screen. A bar under the floor, sticking to the bottom of the screen, offers
   **Place here** (or **Move here**), **Rotate** and **Cancel**. Nothing is bought until Place here. Paint zones and Lay
   conveyor keep their drag-to-paint behaviour with one finger, and on a phone the zone picker appears once Paint zones
   is chosen.
5. **Everything has a button.** Anything a gesture does can be done with a button or the keyboard (zoom −, +, Fit;
   Place here, Rotate, Cancel; the existing keys). Buttons used by touch are at least 44 × 44 CSS px.
6. **No regression.** Mouse and keyboard behaviour is identical to today; the credit dialog, focus rules from spec 004
   and the render budget hold.

## Out of scope

Rotating with two fingers, long press menus, inertia scrolling, undo, and drawing a belt between two machines by
drag-and-drop (Connect by belt stays as it is).

## Pillars served

1 Readable factory (you can see all of it); 4 Accessible by default (a second way to do everything, no accidental
purchases).

## Accessibility notes

- **Screen readers and keyboard:** unchanged. The floor stays one `application` element; the action bar is ordinary
  buttons in the toolbar group, reached with Tab, and announces "Placing X. Place here, Rotate or Cancel."
- **Announcements:** pinch end announces the zoom once ("Zoom 150 percent"), not during the gesture.
- **Reduced motion:** panning follows the finger and has no animation of its own.
- **Long press:** a long press does not count as a right click (which cancels), and the browser's own menu is blocked.
- **Help text:** on a touch screen the line under the floor describes the gestures and keeps a short keyboard line.
- **Not colour only:** the action bar uses text labels.

## Balance knobs

None. Constants in `floor.js`: `TAP_PX = 10`, `TAP_MS = 500`, `ZOOM_MIN = 0.25`, `ZOOM_MAX = 4`, `ZOOM_STEPS`.

## Test plan

- **Playwright, touch context (`test/touch_test.py`, new):** drag in Select mode scrolls `#floor-app` and selects
  nothing; a tap selects the machine; a pinch (CDP `Input.synthesizePinchGesture`) changes the zoom, keeps the focal
  tile under the fingers and announces once; the Fit button shows the whole plant; place mode: touching moves the
  ghost, buying only on Place here, Cancel buys nothing; paint and conveyor still drag; axe on the floor with the bar.
- **Existing tests:** `belt_ui_test`, `move_ui_test`, `pick_test`, `keyboard_test` pass unchanged (mouse path).

## Save impact

None. Zoom and any pan position live in the view state, not in the save.

## Files likely touched

`src/ui/views/floor.js` (canvas input, toolbar, zoom, action bar), `src/ui/topdown.js` only if the canvas size needs
it, `src/index.html` (toolbar and bar CSS).
