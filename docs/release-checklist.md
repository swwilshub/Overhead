# Release checklist

Run through this before tagging a release or merging a large content change.

| Check | How |
|---|---|
| Content scan passes | `npm run scan`. Any entry in `tools/ip_allowlist.json` is a real-world term with a one-line reason. |
| Generated data is current | `npm run build` regenerates `src/gen/data.js` from `data/world.json`, and `git diff src/gen/data.js` shows no change. Never edit it by hand. |
| Build succeeds | `npm run build` writes `dist/overhead.html`. |
| Simulation tests pass | `npm run test:node`, including the 24-month balance test (`docs/design/balance.md`). |
| Browser tests pass | `npm run test:ui`. The axe-core audits must report zero violations. |
| Docs are up to date | `docs/design/` reflects any change to the world, economy or balance, and `data/SOURCES.md` lists every outside data source. |
| Screenshots | If the look changed, rerun `python3 test/readme_shots.py`. |

## Results for 0.1.0

- `npm run scan`: passes, with no allowlist entries.
- `npm run test:node`: all 7 test files pass.
- `npm run test:ui`: all 11 browser tests pass, with zero axe violations.
