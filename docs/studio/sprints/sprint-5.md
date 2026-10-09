# Sprint 5

Sam's request: "Make it so the factory floor is the whole window, so touch events need to be done properly. Pull all the graphics
into that context." One spec (015, effort L), built on `sprint-5/integration`, stacked on `studio/sprint-4` (PR #4, still
open). The save format is unchanged. The page-and-swipe pager for the other pages is now sprint 6.

## What shipped

| Part | What changed |
|---|---|
| **One surface** | The Floor page is one canvas filling the content area (right of the side menu; on a phone between the top and bottom bars), sized in device pixels, resized with the window and when a phone turns. The page itself cannot scroll or pull to refresh underneath. |
| **One context** | Floor, machines, belts, boxes, workers, zones, selection, cursor, the ghost of what you are placing, stock gauges, the cell designer's overlays and the ground around the building are all drawn into that canvas. |
| **A camera** | Pan and zoom are a camera (¼× to 4×, continuous). A plant smaller than the window is centred; a larger one can be panned until a margin is empty. **Fit** and the first view fit the plant between the floating controls (never bigger than 2×). The maths lives in `src/ui/camera.js` with 19 Node checks. |
| **Touch, pen and mouse, one path** | Pointer events with capture and `touch-action: none`. One finger pans in Select (a tap selects, a drag never does), paints with the paint tools, moves the outline when placing; a flick glides and slows to a stop; two fingers pan and zoom about their midpoint; a lifted finger never becomes a drag or tap; a cancelled touch ends cleanly. Mouse: click selects, drag on empty floor or the middle button pans, the wheel zooms about the pointer (Shift pans, Ctrl zooms), right click cancels. Keys: `+`, `-` and `0` zoom and fit. |
| **Floating controls** | The toolbar, Needs attention (now a fold-down card), the item panel (a bottom sheet on a phone, hideable on a desktop), the zoom buttons, the placement bar and Help, Legend, Equipment list and Checklist buttons. The equipment table moved into the Equipment list panel. A landscape phone puts the tools in a column on the left. |

Screenshots: [desktop, machine selected](evidence/sprint-5/s5-desktop-selected.png), [phone](evidence/sprint-5/s5-phone.png),
[phone with the item sheet](evidence/sprint-5/s5-phone-selected.png), [landscape](evidence/sprint-5/s5-landscape.png).

## A bug found on the way, on every page

The two screen-reader live regions were positioned at the bottom of the page and pushed the document one pixel past the window on
every page. On the Floor page that is a scroll; the new test caught it. They are now fixed-position.

## What I decided without asking, and one open question

I read "pull all the graphics into that context" as: everything that is *drawn* goes into the one canvas. **Text and buttons are not
drawn into the canvas**; they float over it as real elements, so keyboards and screen readers still work. **If you meant the controls
too, say so**; that is a much larger, different job and it trades away accessibility.

Also recorded in `decisions.md`: the mouse controls (drag to pan, wheel to zoom), the equipment table moving into a panel, and the first
view fitting between the controls.

## What slipped

- Each frame still composes a picture of the *whole* plant at one pixel per game pixel and then puts the visible part on screen.
  Only the on-screen step is limited to the visible region. The frame time did not get worse (below), so I left the scene drawing alone.
- A landscape phone has little height; the whole plant fits, but small (about ½×). The controls take a column and a row.
- A change of the screen's pixel ratio without a resize (dragging a window to another monitor) is not noticed until the next resize.
- Phone, tablet and desktop were checked in headless Chromium only (see below).

## Review: what happened, honestly

Built and checked by the producer alone. **No independent QA or content review has run.** My review was a read of the diff in
`floor.js` (the pointer path, the camera, the layout), `camera.js`, and the CSS, plus the tests, which I wrote against the spec.
**Not tested on a real phone or a trackpad.** Touch was emulated with real multi-touch sequences through the DevTools protocol. Flick
speed, pinch feel, iOS Safari's handling of pointer capture and the dynamic toolbar, and how a trackpad's two-finger scroll behaves on
the wheel handler (it zooms) all need a real-device pass. The flick test retries up to four times because its timing depends on how
fast the test's touch events arrive; it passed on the first try in the final run.

## Gates on this branch

- Build, 15 Node test files (new `camera.mjs`: 19 checks) and the content scan pass.
- Browser tests: all 20 files pass in the final full run. New
  `floor_window_test.py` (39 checks: fills the area on desktop, phone and landscape, device-pixel sizing and resize, no page scroll,
  click, drag, wheel zoom about the pointer, limits, keys, middle button, floating controls, Help, Legend, Equipment list, panel,
  keyboard camera follow, 2× screens, axe). `touch_test.py` rewritten for the camera (54 checks, adding flick, cancel, one-finger
  lift, floating controls). `pick_test.py` is now a real test (16 of 16 squares picked at three camera positions); before, it printed
  a result and never failed. `ui_test`, `keyboard_test`, `phone_test`, `belt_ui_test` and `charts_test` select machines through a
  test hook or the Equipment list panel.
- **Performance:** floor frame 13.8 to 15.8 ms over three runs (budget 16 ms), against 16 to 17 ms on sprint 4's build, so it is not
  slower and the check passed in the full run. The runner's timing is noisy; I would not certify it.

## For Sam

Nothing from this sprint is pushed. The branch is stacked on `studio/sprint-4` (PR #4). Pushing and opening a PR need your go-ahead.
