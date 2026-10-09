# Changelog

Player-facing changes, newest first.

## Unreleased

- You are told when a machine stops. A machine with nothing left to work on reads **Out of materials** (stock that is
  still on its way reads "Waiting for materials"), and one whose output has nowhere to go reads "Output blocked". After
  30 minutes of working time the Plant log sends one memo with the reason and what to do, at most three a day. Needs
  attention on the floor lists every stopped machine with a Show me button, updates by itself without moving your
  place, and the status bar counts them ("3 issues").
- The floor cursor reads a machine's state, for example "Column 6, row 5: Die-casting line machine #5, out of
  materials: Zinc ingot", and the Cursor card shows the same words even while the clock is stopped. The machine panel
  shows one status; any other problem reads "Also: out of ...".
- Assigning or removing an operator updates the machine's status at once, and a staffed machine reads **Plant closed**
  outside working hours. "Order materials" in Getting started unticks while a machine is out of materials with nothing
  on order. Quick start no longer sends the "building is bare" memo, and its own memo is true when it arrives.
- Clearer names for staff. The people you hire now have titles that say what they do: Line Worker is **Machine
  Operator**, Account Rep is **Sales Rep**, Promotions Specialist is **Marketer**, Buyer is **Materials Buyer**, Office
  Assistant is **Finance Clerk**, Shift Supervisor is **Floor Supervisor** and Development Engineer is **Research
  Engineer**. The department leads are now **Finance Manager**, **Sales Manager** and **Purchasing Manager**.
- Departments match their screens: Commercial is now **Sales**, Supply is **Purchasing** and Front office is
  **Management**. The Staff page and memos use the same names.
- Every duty text on the Hiring page now starts with what the job does for your plant.
- Statuses and buttons name the job you hire: "Hire a Machine Operator", "Hire a Research Engineer", "Research: no
  engineer", "Research: engineer away" and "Out of materials". "A" and "an" now match the title ("an Operator" and "a
  Sales Rep" read correctly everywhere).
- One name for each machine everywhere: "Die-casting line machine #3" on the floor, in the panel, in memos, in Needs
  attention and in belt messages. Cells read "Die-casting cell #12" (no more "cell cell"). Lines are all called "...
  line": Die-casting line, Machining line and Furniture line.
- Storage is "Storage zone" for the painted squares and "storage" for what they hold. "Warehouse" is gone. The catalog
  calls the "Hand cart" a **Pallet jack**, matching the machine panel and to-do memos.
- Memos about the plant come from "Plant log" instead of a "Plant manager" you can't hire. Old saves keep their old
  memo text.
- Keyboard and screen reader: Space, `[`, `]`, `?` and `g` plus a letter now work on the factory floor too, focus
  stays where you were after pressing a button, and repeated buttons say which row they act on ("Details, Akron, OH").
- Movers on the construction site now wear the right department colours.
- Loading a save made by a newer version of the game now says so, instead of failing quietly.
- Stray code text is gone: the side panel no longer shows "[object HTMLElement]" after you click an empty square, and
  the status bar and cell Performance block no longer show "null". The city table now says "All 42 cities", and the
  title screen names only goods the game really makes.

## 0.1.0

First public release: 13 production lines, 106 items, 42 American cities, conveyor belts with real boxes, production
cells, office suites, relocation, research, monthly news, four starting scenarios, and full keyboard and
screen-reader play.
