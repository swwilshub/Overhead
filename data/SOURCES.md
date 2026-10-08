# Data sources

Everything in `data/world.json` was written for this project, except the outside data listed here.

| Data | Source | Licence | Used for |
|---|---|---|---|
| City populations | US Census Bureau, *City and Town Population Totals: 2020–2024* (Vintage 2024), file `sub-est2024.csv`, column `ESTIMATESBASE2020` (the April 1, 2020 estimates base). <https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv> | Public domain (US federal government work) | `cities[].pop` |
| Metro populations | US Census Bureau, *Metropolitan and Micropolitan Statistical Areas Population Totals: 2020–2024* (Vintage 2024), file `cbsa-est2024-alldata.csv`, column `ESTIMATESBASE2020`, metropolitan statistical areas only. <https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/metro/totals/cbsa-est2024-alldata.csv> | Public domain | `cities[].metro` |
| City coordinates | US Census Bureau, *2020 Census Gazetteer Files*, places, internal point (`INTPTLAT`, `INTPTLONG`). <https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_place_national.zip> | Public domain | `cities[].lat`, `cities[].lon` (projected onto the map by `tools/gen_world.mjs`) |
| US map outline and state borders | [us-atlas](https://github.com/topojson/us-atlas) 3.x, `states-albers-10m.json`, derived from the Census Bureau's cartographic boundary files | ISC (us-atlas); the underlying boundaries are public domain | `US_NATION_PATH`, `US_BORDER_PATH` in `src/gen/data.js` |

`tools/fetch_cities.mjs` downloads the three Census files and writes the `cities` list into `world.json`. It
records the exact Census place and metro area names it matched (`place`, `cbsa`), so each number can be checked
against the source.

The city list itself (which 42 cities) is our own choice. The names of US cities and states are facts, not
anyone's content.

## Not from outside sources

These were all made up for Overhead, with no outside data behind them:

- Material prices, recipes, box sizes, markups and machine prices.
- Job titles, trait groups, office tiers, events and scenarios.
- Applicant first and last names, which are drawn from lists of common US names written for this project.
- Street names and company names in generated cities.
