# Changelog

Player-facing changes, newest first.

## Unreleased

- Phone layout, part 3: the floor works with a finger. Drag to look around, pinch to zoom (a quarter to four times),
  tap a machine to select it, and use Fit to see the whole plant. Painting zones and laying conveyor still work by
  dragging. When you place or move something, the outline follows your finger and nothing is bought until you press
  **Place here**; **Rotate** and **Cancel** sit beside it. The floor stays where you scrolled it, zoom buttons are
  finger-sized, and on a phone the plant starts fitted to the screen.
- Phone layout, part 2. Questions pop up as a sheet at the bottom of the screen with big full-width buttons. Tapping a
  machine opens a short sheet with its name and status, with Details for the rest and Close to dismiss it, so the plant
  stays in view. Messages now show under the top bar instead of over the bottom bar.
- Phone layout, part 1. On a phone the top bar is slim (company, money, the clock and four big speed buttons), a
  bottom bar has Floor, Staff, In-basket and Menu, and Menu opens a sheet with every section, net worth, city, Run
  until… and Sound. In landscape the bars shrink to leave room for the plant. Nothing on a phone scrolls sideways any
  more: wide tables no longer make the whole page zoom out, and Staff, In-basket, City and Nation fit one column.
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
- Buying something you can't cover from checking and savings now asks first ("Buy on credit?") and says how much
  would come from the credit line. Late-payment fees on the bank statement say how late the bill was paid, and a memo
  explains why suppliers charged them.
- Movers on the construction site now wear the right department colours.
- Loading a save made by a newer version of the game now says so, instead of failing quietly.
- Stray code text is gone: the side panel no longer shows "[object HTMLElement]" after you click an empty square, and
  the status bar and cell Performance block no longer show "null". The city table now says "All 42 cities", and the
  title screen names only goods the game really makes.

## 0.1.0

First public release: 13 production lines, 106 items, 42 American cities, conveyor belts with real boxes, production
cells, office suites, relocation, research, monthly news, four starting scenarios, and full keyboard and
screen-reader play.
