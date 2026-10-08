## What this changes

<!-- One or two sentences: what changes for players or contributors, and why. -->

## How it was tested

<!-- The commands you ran and anything you checked by hand (keyboard, screen reader, phone width). -->

## Checklist

- [ ] No content from other games: every name, text, number and piece of art here is new work or a real-world fact.
- [ ] `npm run scan` passes, and any new allowlist entry is a real-world term with a reason.
- [ ] `npm run test:node` passes, including the balance test if the world data or economy changed.
- [ ] `npm run test:ui` passes with zero axe violations.
- [ ] World changes are in `data/world.json` (not hand-edited in `src/gen/data.js`), and `docs/design/` is updated if the design changed.
