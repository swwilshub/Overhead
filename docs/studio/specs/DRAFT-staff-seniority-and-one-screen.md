# DRAFT: staff seniority and a one-screen phone game

Not a spec yet. A design brief for the owner to react to, written from his message: "everything needs to fit on one
screen… large tabs and left and right navs, especially for clustered menus… avoid vertical scrolling… stack some game
elements: almost all job roles have levels of seniority… staff start at the bottom and 'learn' through 3 stages,
indicated by a line with 3 dots on their profile card… one simple job advert, and sometimes level 1, 2 or 3 people will
apply… Junior, senior, director… staff gain exp as they go." Evidence: [sprint 3 playtest](../playtests/sprint-3.md).

## The two ideas fit together

The longest, most repetitive screen on a phone is Hiring (14 job rows, 6.4 screens). Seniority replaces those 14 rows
with **one advert** and a small set of **role families**, so it removes content while adding depth. It also gives the
Staff screen a natural phone shape: one **profile card** per person, swiped left and right. So the staff change is also
the first step of the one-screen change, and doing it first means Hiring and Staff are designed once.

## Part 1: staff learn (the seniority system)

**Role families and levels.** Seven families, three levels each, plus the Plant Director (not laddered):

| Family | Level 1, Junior | Level 2, Senior | Level 3, Director |
|---|---|---|---|
| Operations | Junior Operator | Senior Operator (can supervise: speeds the floor) | Operations Director |
| Maintenance | Junior Mechanic | Senior Mechanic | Maintenance Director |
| Engineering | Junior Engineer | Senior Engineer | Engineering Director |
| Finance | Finance Clerk | Bookkeeper | Finance Director |
| Sales | Junior Sales Rep | Senior Sales Rep | Sales Director |
| Promotions | Junior Promoter | Senior Promoter | Promotions Director |
| Purchasing | Junior Buyer | Senior Buyer | Purchasing Director |

The names are a first draft; every name passes the content scan like any other. Today's 14 jobs already hint at the
ladders (Finance Clerk, Bookkeeper and Finance Manager are three Finance levels), and today's separate "Manager" and
"Supervisor" jobs become the Director and Senior levels.

**Levels change three things:** pay (a Senior costs about 1.5 times a Junior, a Director about 2.4 times), how well they
do the job, and what else they do (a Senior Operator can supervise; a Director leads the department and makes everyone
in it more productive, as managers do now).

**Learning.** Each person has experience points. They earn them on days they actually do their job (an operator whose
machine ran, an engineer who researched, an office worker whose effect applied), a little faster for people with the
right traits. At a threshold they step up one level on their own: a raise, a short memo, and a toast. Proposed targets
for the economist to tune: Senior after about 6 months of steady work, Director after about 20 months. So a plant
that hires juniors grows its own seniors within a normal 24-month game, and bringing in a Senior or Director is the
expensive shortcut.

**The profile card.** Name, family and title, a line with three dots (filled up to the current level, the line filling
toward the next dot as experience builds), pay, skill, and what the person does. Swipe or press the arrows for the next
person; one card fills a phone screen.

**One simple advert.** Hiring becomes: choose a family with large tabs, press **Place ad**. Over the next week
applicants arrive as resumes, mostly Juniors, sometimes a Senior, rarely a Director (proposed 70 / 25 / 5 percent,
better in bigger cities and with a better-paid ad). You pick whom to make an offer to, as you do now.

**Old saves.** The save format changes (version 2). Each person becomes the nearest family and level (Finance Manager is
a Finance Director, Bookkeeper a Senior, and so on), with experience set to match, and nothing breaks. A test loads the
version 1 fixture.

**Balance.** Pay and speed move together, so the 24-month balance bands in `docs/design/balance.md` must still hold
for careful, greedy and idle play; the economist re-runs them after every change.

## Part 2: one screen per section

**The pattern.** Every section is a small set of pages that each fit the screen. You move between pages with **large
tabs** along the top or bottom and by **swiping left and right** (with arrows and a dot indicator, since gestures are
never the only way). Long lists become a card carousel (one card, big arrows) or a short list with a "more" sheet. No
page needs vertical scrolling at 390 × 844, 360 × 740 or 844 × 390.

**A rough split, to be refined with the owner** (pages per section):

| Section | Pages |
|---|---|
| Floor | The plant fills the screen. A bottom row of large tool buttons; Needs attention and Getting started are badges that open sheets |
| Catalog | One tab per line, swipe between lines; one machine per page |
| Research | Cell technologies as a carousel |
| Staff | Profile cards, one per screen, grouped by department tab |
| Hiring | One page: family tabs and Place ad; resumes arrive as swipeable cards |
| In-basket | List and reader as two pages |
| Purchasing | Stock, Orders, Targets |
| Sales | Overview, Products, Charts |
| Bank | Loans, Statement |
| City / Nation | Map, Details, List |
| Options | Display, Sound, Saves, Help |

## Suggested order (the owner's call)

1. **Sprint 3: staff learn.** Data and save change, learning and promotion, the one advert, the profile card, balance.
   Large work (one large item), so the sprint is small around it.
2. **Sprint 4: one screen.** The page-and-swipe component, then each section split as above.

## Open choices (my default in bold)

1. Order: **seniority first**, one screen second (or the reverse).
2. Titles: **Junior / Senior / Director with the family names above** (or other names).
3. Promotion: **automatic when experience is enough** (or the player presses Promote and pays the raise).
4. Promotions (today's Marketer, who raises brand awareness) as its own family (**yes**) or folded into Sales.
5. The Plant Director stays as today, unladdered (**yes**).
