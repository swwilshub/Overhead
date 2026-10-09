# Playtest, sprint 3: does each screen fit on one phone screen?

Owner request: "For it to be a true mobile game everything needs to fit on one screen… We need to avoid vertical
scrolling." Measured by the producer on the sprint 2 build, in headless Chromium with touch emulation, by opening every
section from the Menu and dividing the section's content height by the height of the screen area it sits in. A figure of
1.0 means it fits; 2.7 means you scroll through nearly three screens. Raw numbers:
[evidence/sprint-3/screen-fit-measurements.json](evidence/sprint-3/screen-fit-measurements.json).

| Section | 390 × 844 | 360 × 740 | 844 × 390 (landscape) |
|---|---|---|---|
| Floor | 2.7 | 3.3 | 5.5 |
| Catalog | 6.1 | 7.4 | 10.9 |
| Research | 11.3 | 13.6 | 26.6 |
| Staff | 1.9 | 2.2 | 4.0 |
| Hiring | 6.4 | 8.2 | 14.3 |
| In-basket | 1.0 | 1.0 | 1.8 |
| Purchasing | 1.8 | 3.0 | 5.5 |
| Sales | 1.9 | 2.3 | 4.1 |
| Bank | 2.5 | 3.0 | 4.5 |
| Reports | 1.0 | 1.1 | 1.8 |
| City map | 4.5 | 5.4 | 10.2 |
| Nation | 16.1 | 20.1 | 39.5 |
| Options & help | 6.7 | 8.3 | 13.9 |

## Findings

| # | Sev | What happens |
|---|---|---|
| F-1 | 1 | **Only two of thirteen sections fit one screen** on a normal phone, none on a small phone (360 × 740) or in landscape. The worst are Nation (16 screens), Research (11), Options, Hiring and Catalog (6 or 7). |
| F-2 | 1 | **Hiring is the longest list the player must work through to do something simple.** Fourteen job rows, each its own advert, each a card on a phone: 6.4 screens to place one ad. |
| F-3 | 2 | **Lists of cards scroll forever.** Sprint 2 turned tables into cards, which fixed the sideways scrolling and made the vertical scrolling worse (Nation 16 screens, Research 11). |
| F-4 | 2 | **The floor is 2.7 screens** because the toolbar, notices, help text and legend sit around a plant that is itself taller than what is left. |
| F-5 | 3 | **Small phones and landscape are worse everywhere** (up to 2× the height), so a fixed one-screen target has to be set for 360 × 740 and for landscape, not only 390 × 844. |
