# Sprint 1

One sprint, as Sam asked, focused on his request: "rename things to make them more clear, in particular with staff roles
like operators and sales." Five items, built on branches `sprint-1/001` to `005`, merged in that order on
`sprint-1/integration`. The save format is unchanged (still version 1).

## What shipped

| Spec | What the player sees |
|---|---|
| **001 Clearer names** | Staff have titles that say what they do: Machine Operator, Sales Rep, Sales Manager, Purchasing Manager, Materials Buyer, Finance Clerk, Marketer, Floor Supervisor, Research Engineer. Departments are Management, Sales and Purchasing. Every machine has one label ("Die-casting line machine #3") on every screen, and statuses match the job you hire for ("Out of materials", "Research: no engineer"). Storage replaces "warehouse"; the Hand cart is a Pallet jack. Old saves show the new titles. |
| **002 Broken text** | No more "[object HTMLElement]" in the side panel, "null" in the status bar, "nullnull" in the cell panel, or "All fifty cities" over 42 rows. The title blurb names only things in the game. |
| **003 Stalled machines** | A machine that has nothing to work on says **Out of materials**; one with nowhere to put its output says **Output blocked**. After 30 working minutes the Plant log sends one memo (at most three a day). Needs attention lists each stopped machine with a Show me button, updates by itself without taking focus, and the status bar counts the issues. The floor cursor and Cursor card read a machine's state aloud. Quick start no longer sends the "building is bare" memo. |
| **004 Keyboard and focus** | Space, `[`, `]`, `?` and `g` + letter work from the floor grid; focus stays put after pressing a button, including the status-bar issues button; repeated buttons say which row they belong to ("Place ad ($300), Plant Mechanic"). |
| **005 Spending guard** | Buying something that would dip into the credit line asks first ("Buy on credit?") and says how much would be borrowed. The clock stops while the question is open. Late-payment fees say how late the bill was paid, and a memo explains why suppliers charged them. |

Screenshots: [new titles on the Hiring page](evidence/sprint-1/s1-hiring-titles.png), [a stalled machine in Needs attention](evidence/sprint-1/s1-stalled-machine.png), [the Plant log memo](evidence/sprint-1/s1-stall-memo.png), [the credit dialog](evidence/sprint-1/s1-credit-dialog.png).

## What slipped

Nothing from the five items. Deferred from the playtest to later sprints: the lease screen legend and default building size, one-key tool switching, belt drawing by keyboard, dropped live-region messages, landmark names, belt wording in the inspector, Quick start ignoring the scenario number, and the scripted late game stalling (see the backlog). QA's follow-ups on 002 are backlog items 12 to 15.

## Review: what happened, honestly

The studio rule is that nobody grades their own work. It held for 002 and only partly for the rest, because an API rate limit stopped four agents mid-review and Sam then asked for the work to move back into the main session.

| Branch | Independent review | Result |
|---|---|---|
| 002 | QA and content review | Approved, no blocking findings |
| 001 | Content review. QA was cut off by the rate limit. | Content PASS. The producer ran every gate and a sweep for old names. |
| 003 | None. An engineer agent wrote the sim half; the producer finished the interface and tests. | Gates green, but **no independent QA or content review** |
| 004 | QA returned it once (strike 1 of 3): the status-bar issues button lost focus while the clock ran. Content review passed the original commit. | Producer fixed it and re-ran the gates and a new Tab-based test. **Fix not re-reviewed.** |
| 005 | QA returned it once (strike 1 of 3): the clock ran under the credit dialog, focus was lost afterwards, and a mouse click skipped Cancel's focus. Content review passed the original commit. | Producer fixed all three with tests. **Fixes not re-reviewed**; the one new string, "The amount to borrow is now $X, not $Y.", was not content-reviewed. |

**Before merging, 001, 003, 004 and 005 want an independent QA pass.** That is Sam's call.

## Gates on the final stack (`sprint-1/integration`)

- Build, 13 Node test files, 14 browser tests (axe reports zero violations on every screen tested), content scan and old-save load all pass.
- **Balance:** the three 24-month runs stay inside their bands. One early build of 003 pushed a month of growth to 1.32× against a 1.3× limit. The cause was a display change that also stopped idle machines wearing; the fix keeps the old wear rules and changes only what the player is told.
- **Stall notices:** never more than 3 on any day. A hands-off bot gets 216, 424 and 393 notices over two years in the three runs, which is a lot. Real players who buy materials will see far fewer, but this wants tuning (`STALL_REPEAT_MIN`) after the next playtest.
- **Performance:** sim tick 1.33 ms against a 4 ms budget. The floor frame is marginal on this runner: four alternating runs averaged 16.4 ms for the sprint's starting point and 16.0 ms for the final stack, against a 16 ms budget, with run-to-run swings of 3 ms. So nothing regressed, but the budget cannot be certified here. Backlog item 11 (render headroom) moves up.

## Process change for next sprint

Sam found spawning many agents inefficient, and the rate limit showed the cost. From sprint 2: the producer builds in the main session, and agents are used only for an independent QA and content review of each branch once its gates are green, run one or two at a time so timing tests stay trustworthy.

## For Sam

Nothing is pushed. The five branches and `sprint-1/integration` are local. In PR mode I need your go-ahead to push and open PRs. 001 builds on 002, and 003, 004 and 005 stack on top, so the clean way is one PR per spec merged in order 002, 001, 003, 004, 005, or a single combined PR. The studio setup commits also need squashing before anything is pushed.
