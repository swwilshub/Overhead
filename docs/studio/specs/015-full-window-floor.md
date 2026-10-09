# 015 — The factory floor is the whole window

Backlog Sprint 5 · Pillars 1, 4 · Effort L · Save impact: none

## Problem

Sam: "Make it so the factory floor is the whole window, so touch events need to be done properly. Pull all the graphics
into that context."

Today the floor is one block inside a scrolling page: a heading, a Needs attention list, a toolbar, a frame with its own
scrollbars (at most 70% of the window tall) holding a canvas that is resized with CSS to zoom, a help paragraph, a
legend, the inspector beside or below it and an equipment table underneath. On a phone the player scrolls the page, then
scrolls the frame, and a drag can do either. The canvas is drawn at one resolution and stretched, so it is blurry on a
high-density screen.

## Player story

As a player, the factory fills my screen. I drag, pinch and tap it like a map, and everything else floats over it
and gets out of the way.

## Acceptance criteria

1. **One surface.** On the Floor page the plant is drawn in a single canvas that fills the whole content area (everything
   right of the side menu and below the top bar; on a phone, between the top bar and the bottom bar). There is no page
   scroll and no frame scrollbar on that page. The canvas is sized in device pixels (the screen's pixel ratio), so it is
   sharp on high-density screens, and it resizes with the window and when the phone turns.
2. **One context.** Everything graphical on the floor is drawn into that canvas's context: floor, machines, belts,
   boxes, workers, zones, the selection, the cursor, the ghost of an item being placed, input and output marks, stock
   gauges, the cell designer's overlays, and the ground around the building. Text and controls stay real page elements
   (so they can be read by assistive technology) and float over the canvas.
3. **A camera.** Pan and zoom are a camera (position and zoom) rather than scrolling. Zoom runs from ¼× to 4× and is
   continuous; the plant can be panned until a margin of it is still in view; if the plant is smaller than the window it
   is centred. **Fit** shows the whole plant. The first view fits the plant (between 1× and 2×).
4. **Touch done properly.** One pointer-event path for touch, pen and mouse, with pointer capture and
   `touch-action: none` on the surface, so the browser never scrolls, zooms or pulls to refresh underneath:
   - one finger drags the map in Select (a tap selects; a drag never selects); in Paint zones and Lay conveyor it paints;
     with an item being placed it moves the outline; a flick keeps moving and slows down;
   - two fingers pan and zoom together about their midpoint; lifting one finger ends the pinch and does not start a
     drag or a tap;
   - a touch that is cancelled by the system (a call, a gesture) leaves nothing half done;
   - controls floating over the floor are never "under" a drag: touches that start on them belong to them.
5. **Mouse and keyboard.** Click selects (or paints, or places, as before); dragging empty floor in Select pans it;
   middle-button drag pans in any mode; the wheel zooms about the pointer, Shift and the wheel pan, Ctrl and the wheel
   (a trackpad pinch) zooms; right click cancels. Arrow keys still move the cursor and the camera follows it. `+`, `-` and
   `0` zoom in, zoom out and fit.
6. **The controls float.** The toolbar (Select, Paint zones, Lay conveyor, Catalog, zoom and Fit) is a bar over the top
   left. Needs attention is a collapsible card under it. The inspector is a panel over the right edge (a bottom sheet on a
   phone, as in sprint 2). The site tabs, the storage summary, the placement bar (touch), Help, Legend and Equipment list
   buttons float over the edges. Help, Legend and the Equipment list open as panels; the equipment table is no longer a
   page section. Nothing floating covers the floor when it has nothing to say.
7. **Accessibility is unchanged.** The floor is still one focusable `application` region with the same keyboard model and
   spoken descriptions; the page has an `h1` ("Factory floor"); the equipment list and Needs attention stay reachable by
   keyboard and screen reader; focus stays on the floor after acting on it, as before.
8. **Nothing gets slower.** A frame draws only the part of the plant in view; the floor frame stays within its budget.

## Out of scope

Drawing text or buttons into the canvas (that would hide them from assistive technology); the other pages' canvases (the
catalog and city previews are small pictures on pages, not the floor); the pager for other pages (sprint 6).

## Pillars served

1 Readable factory (more of it on screen, sharp); 4 Accessible by default (same controls, no gesture is the only way, a
camera that never traps a page scroll).

## Accessibility notes

- The canvas stays `aria-hidden`; `#floor-app` keeps its role, label and help text (the visible Help button opens the same
  text).
- Floating panels are real regions or dialogs with headings; Escape closes the ones that open over the floor.
- Reduced motion turns off the flick's glide.
- Every gesture has a button or key: Fit, zoom buttons, `+ - 0`, arrow keys.

## Balance knobs

None.

## Test plan

- **Node `test/camera.mjs` (new):** the camera maths (zoom about a point keeps it fixed, clamping, centring, fit, reveal).
- **Playwright `test/floor_window_test.py` (new):** the canvas fills the area on desktop, phone and landscape, at the device
  pixel ratio, and resizes on rotation; no scrollbars; wheel zoom keeps the point under the pointer; mouse drag pans; a
  click selects; drag does not select; floating controls do not start pans; Help, Legend, Equipment list; axe.
- **`touch_test.py` (rewritten):** the 42 checks, on the camera instead of the scroll position, plus: flick glides and
  stops, a cancelled touch leaves nothing half done, page never scrolls.
- Existing floor tests (`belt_ui_test`, `cell_ui_test`, `move_ui_test`, `stall_ui_test`, `suite_ui_test`, `pick_test`,
  `keyboard_test`, `phone_test`, `ui_test`, `perf_ui_test`) updated for the new layout.

## Save impact

None. The camera is kept in the view state, not the save.

## Files likely touched

`src/ui/camera.js` (new), `src/ui/views/floor.js`, `src/ui/views/cellEditor.js` (focus only), `src/ui/app.js` (the page
class), `src/index.html`, `src/main.js` (a test hook), tests, docs.
