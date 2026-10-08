# Contributing to Overhead

Thanks for helping. This page covers setting up, the checks every change must pass, and the few rules that keep the
project healthy.

## Set up

You need Node.js 20 or later and Python 3.10 or later.

```
npm install                         # esbuild, the map data and axe-core
pip install playwright              # the browser tests are written in Python
python -m playwright install chromium
npm run build                       # writes dist/overhead.html
```

Open `dist/overhead.html` in a browser to play. There's no server: the whole game is that one file.

## Checks

Run these before you open a pull request. CI runs the same ones.

| Command | What it checks |
|---|---|
| `npm run scan` | The content scan (see below). Must pass. |
| `npm run build` | Regenerates `src/gen/data.js` from `data/world.json` and builds the game |
| `npm run test:node` | Simulation tests: belts and material flow, cells, office suites, relocation, rare code paths, and the 24-month balance test |
| `npm run test:ui` | Browser tests with Playwright, including axe-core accessibility audits (zero violations allowed) |

If Playwright can't find its browser, set `CHROMIUM_PATH` to a Chromium or Chrome binary.

## Rules

1. **No content from other games.** Don't copy names, text, data tables, numbers, art or sounds from any other game,
   including ones you remember. Design new content from first principles. Real-world facts are fine: the names of
   real cities, common product names, standard part names.
2. **The content scan must pass.** `tools/ip_scan.mjs` checks every file against lists of hashed names and
   phrases that must not appear in this project (`tools/ip_denylist.json` and `tools/ip_banned.json`). If it flags something you wrote, rename or rewrite it. Only a
   genuine real-world term may be added to `tools/ip_allowlist.json`, with a one-line reason. Never edit the scanner
   or its hash lists to make a check pass.
3. **Keep it accessible.** Everything must work with a keyboard and a screen reader. New UI needs labels, focus
   handling and live-region announcements where they make sense, and the axe audits in `npm run test:ui` must report
   zero violations.
4. **Change the world in data, not code.** Items, recipes, lines, jobs, offices, events and scenarios live in
   `data/world.json`. Edit it, run `npm run gen`, and check `node test/long.mjs` still passes its balance bands.
   Explain design changes in `docs/design/`. Never edit `src/gen/data.js` by hand.
5. **Tests look things up by role, not by id.** Use the helpers in `test/lib.mjs` (`chainPair()`, `hire(st, 'operator')`,
   `recipeOf('desk_lamp')`), so a test survives changes to the world data.

## Pull requests

- Keep each pull request to one change, and say what it changes and why.
- Fill in the checklist in the pull request template, including "No content from other games".
- By contributing, you agree that your code is licensed under the MIT licence (`LICENSE`), and your game content,
  art and writing under CC BY 4.0 (`LICENSE-ASSETS`).

## Where things are

| Path | What |
|---|---|
| `data/world.json` | The game world: lines, items, recipes, cities, jobs, traits, offices, events, scenarios, economy constants |
| `tools/gen_world.mjs` | Builds `src/gen/data.js` from the world data and the us-atlas map, and validates the world |
| `tools/fetch_cities.mjs` | Refreshes city populations and coordinates from US Census files (needs the network) |
| `src/sim/` | The simulation: city and market, floor and placement, people, the clock and money, cells, suites, events |
| `src/ui/` | The interface: views, the pixel-art renderers, charts, sound, saves |
| `test/` | Node tests (`*.mjs`) and Playwright browser tests (`*_test.py`) |
| `docs/design/` | Design notes: the world, the economy and the balance targets |
