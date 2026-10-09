# 012 — Profile cards with the three-dot line

Backlog Sprint 3 · Pillars 1, 4 · Effort M · Save impact: none

## Problem

From the [sprint-3 playtest](../playtests/sprint-3.md): the Staff page is a department summary and a wide table that is
1.9 screens on a phone, and it says nothing about how long someone has been learning.

## Player story

As an owner, I flick through my people one at a time, see at a glance how far each has come, and act on them.

## Acceptance criteria

1. **A profile card per person.** Name, title, department; a **line with three dots** (Junior, Senior, Director), filled
   up to the current level and the line filled toward the next dot as experience grows, with text such as "Senior,
   64 of 300 days to Director" (Directors: "Director, top of the ladder"); pay and how it compares with the city; skill,
   morale and stress; where they work and what they are doing now; and **Details** (the full profile with traits,
   review and raise, and Terminate, as today).
2. **A carousel.** The cards are shown one at a time with large **Previous** and **Next** buttons, a count ("3 of 8"),
   and a swipe left or right on a touch screen; the arrow keys move between cards when the carousel has focus. A
   department filter (large tabs: All and each department that has staff) narrows it.
3. **The Staff page keeps its summary** (department status) above the cards, shorter on a phone: the summary is a
   single line of pills. The old table is no longer shown.
4. **A reusable carousel.** The carousel is one small component (`carousel(items, render, opts)` in `dom.js`) with
   buttons, count, swipe and keyboard, so the one-screen sprint can reuse it for other lists.
5. **Fits a phone.** At 390 × 844 the Staff page needs no more than 1.2 screens, and the card itself fits on one.

## Out of scope

Sorting the cards, comparing two people side by side, photos or avatars, and promoting by hand.

## Pillars served

1 Readable factory (see each person's progress); 4 Accessible by default (one thing at a time, large buttons, text for
the level).

## Accessibility notes

- The carousel is a region labelled "Staff", the current card is announced when it changes ("3 of 8: Maria Lopez,
  Senior Operator"), and the buttons are real buttons at least 44 px.
- The three-dot line is decorative (`aria-hidden`); the level and progress are in the text beside it.
- Swiping is never the only way; reduced motion turns off any slide.

## Balance knobs

None.

## Test plan

- **Playwright `test/staff_ui_test.py` (new):** cards for each employee; the dot line and progress text for a Junior, a
  Senior and a Director (set up through the sim); Previous, Next, swipe and arrow keys; the department filter; Details
  opens the profile; axe; the phone page size above.
- Existing `ui_test.py` and `phone_test.py` updated for the new Staff page.

## Save impact

None.

## Files likely touched

`src/ui/views/people.js` (Staff), `src/ui/dom.js` (`carousel`), `src/index.html`, tests.
