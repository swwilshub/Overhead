# 004 — Keyboard and focus

Backlog Sprint 1 · Pillar 4 · Effort M · Save impact: none

## Problem

From the [sprint-1 playtest](../playtests/sprint-1.md), keyboard and screen-reader personas:

- **P2-1:** *"Tab into the floor grid, then press `g` `h`, Space, `]` or `?`… none of them works. Space selects the
  item under the cursor instead of starting the clock. The checklist says 'Start the clock (Play or space bar)'."*
  Cause: `installKeys()` in `src/ui/app.js` ignores keys from `[role="application"]`, which is the floor grid.
- **P2-2:** *"Press Enter on… 'Place ad', 'Suggest targets', 'Purchase all to target', or cell editor > 'Standard
  layout'… focus lands on the page body each time."* ([p2-keyboard-log.txt](../playtests/evidence/sprint-1/p2-keyboard-log.txt))
  Cause: a redraw restores focus only to controls with an `id` or `data-key`, and "Place ad" turns into a pill once
  the ad runs. Views that redraw every second while the clock runs drop focus the same way.
- **P3-3:** *"Hiring has 14 buttons named only 'Place ad ($300)' or 'Place ad ($550)'. Research has 14 buttons named
  'Start'. Nation has 42 named 'Details'"*, and the equipment table repeats "Select" ([names-transcript.txt](../playtests/evidence/sprint-1/names-transcript.txt)).

## Player story

As a keyboard or screen-reader player, the shortcuts work wherever I am, an action leaves me where I was, and every
button tells me what it acts on.

## Acceptance criteria

1. **Global keys work from the floor grid,** in every floor mode including the cell editor: `[`, `]`, `?` and `g`
   plus a letter do what they do elsewhere. **Space starts or pauses the clock; Enter selects or places.** After `g`,
   the next key within 1.5 s goes to navigation only (`g m` opens the City map and doesn't start a move; `g r` and
   `g i` don't rotate or jump to the inspector). With single-key shortcuts turned off in Options, the grid keeps its
   own keys and Space acts like Enter, as today. The floor help line and the Options keyboard table say this.
2. **Focus stays on the control after an action.** After Enter on "Place ad", "Suggest targets", "Purchase all to
   target", "Standard layout", "Clear all", "Assign", "Retool", "Add operator", "Mark all read" and any other button
   that redraws its view, focus is on the same control. If it no longer exists, focus goes to the nearest control in
   the same table row, then the next control in the same section, then that section's heading. It never lands on the
   page body or the skip link.
3. **Redraws keep focus.** In views that redraw while the clock runs (floor inspector, Purchasing, Sales, In-basket and
   the others marked `live`), a focused button, input or select keeps focus across redraws: every one has a stable
   key.
4. **Distinct accessible names.** A button repeated down a table is named by its visible text and then its row, for
   example "Place ad ($300), Plant Mechanic", "Details, Akron, OH", "Select, Extrusion line machine #5", and the cell
   technology "Start" buttons with their technology name. The visible text doesn't change. No two buttons on one
   screen share an accessible name unless they do the same thing.
5. **"Purchase all to target" says what it did.** The message it already builds ("Placed 3 orders." or "Stock is
   already at target levels.") reaches `#live-polite`; in the playtest nothing was announced. With focus staying put,
   this is the only sign that it worked.
6. axe reports zero violations on every screen, and no new control is reachable by mouse only.

## Out of scope

- One-key tool switching on the floor (P2-3) and belt drawing by keyboard (P2-4).
- Other live-region problems (P3-4) and landmark names (P3-5). Criterion 5 takes only the "Purchase all" case from
  P3-4, because criterion 2 depends on it.
- Changing the visible text of any button.

## Pillars served

4, Accessible by default: the keyboard path is as quick as the mouse, and screen readers can tell buttons apart.

## Accessibility notes

- **Keyboard path:** Tab into the grid, Space to run the clock, `g h` to Hiring, Enter on "Place ad" for three jobs in a
  row without leaving the table, `g f` back to the floor.
- **Screen readers:** names come from `aria-labelledby` pointing at the button itself and its row header, so they
  follow any rename (spec 001) without extra strings, and the visible text comes first (label in name).
- **No colour-only cues:** none added. The focus ring stays visible after every redraw.

## Balance knobs

None. The 1.5 s `g` window already exists in `app.js`.

## Test plan

- **Playwright `test/keyboard_test.py` (new):**
  - Criterion 1: focus the grid, press Space (clock runs, polite "Clock running"), Space (paused), `]`, `g h` (H1
    "Hiring"), back, `?` (Options). `g m` from the grid opens the City map and starts no move. With shortcuts off,
    Space selects.
  - Criteria 2 and 5: for each button listed, press Enter and assert `document.activeElement` is not `body` and is the
    same control or its row's next control. "Purchase all to target" puts text in `#live-polite`.
  - Criterion 3: focus "Suggest targets", run the clock 5 s, focus unchanged.
  - Criterion 4: on Hiring, Research, Nation and the floor, collect accessible names of buttons and assert no
    duplicates among buttons that do different things.
- **Existing `test/ui_test.py`:** axe on every screen (criterion 6).

## Save impact

None. No game state changes; the shortcut option is an existing preference.

## Files likely touched

`src/ui/app.js` (`installKeys`, `render`/`restoreFocus`), `src/ui/dom.js` (`table()` option for row-named buttons,
focus fallback), `src/ui/views/floor.js` (grid `keydown`, help line), `src/ui/views/cellEditor.js` (`refreshPanel`),
`src/ui/views/people.js` (Hiring, In-basket), `src/ui/views/business.js` (Purchasing, cell technology, Options
keyboard table), `src/ui/views/nation.js`, new `test/keyboard_test.py`.

**Overlap:** 001 renames the job titles and labels that become part of these names; 001's names win and need no
extra work here. 002 edits `app.js` (`statusBar`) and `nation.js` (caption); 003 edits `floor.js` and `app.js`; 005
adds confirm dialogs in `floor.js` and `cellEditor.js`, which must return focus to the grid or button that opened
them. Expect merge conflicts in `app.js` and `floor.js`, not design conflicts.
