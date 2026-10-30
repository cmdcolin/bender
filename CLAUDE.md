# bender

A circuit bender in the browser, built on Web Audio. videoskillet
(`~/src/videoskillet`) is its sibling app.

<!-- CROSS_REPO_SYNC(agent-sync-rules) -->

## Cross-repo sync

videoskillet and bender share a design system, a site shape and most of their
account code. Regions marked `CROSS_REPO_SYNC` must stay identical across the
two repos; [`docs/CROSS_REPO_SYNC.md`](docs/CROSS_REPO_SYNC.md) covers the
markers and the workflow.

- Before editing a marked region, port the same change to the sibling repo
  (`~/src/videoskillet` or `~/src/bender`) and run `pnpm sync:check` in either.
- When a change applies to both apps but touches unmarked code, make it in both
  anyway, and mark the result once the two copies match.
- Keep product-specific values in constants outside a region.

<!-- CROSS_REPO_SYNC_END(agent-sync-rules) -->

<!-- CROSS_REPO_SYNC(commit-conventions) -->

## Commits

Use Conventional Commits (`type(scope): description`). `cliff.toml` groups the
changelog by type and renders the scope inline. `Release vX.Y.Z` commits come
from `scripts/push.mjs` and stay out of the changelog.

<!-- CROSS_REPO_SYNC_END(commit-conventions) -->

Scope is optional; when used, pick from `dsp`, `engine`, `ui`, `home`, `midi` or
`docs`.

## Browsers

Current Chrome, Firefox and Safari, down to Safari 16. `tsconfig.json` keeps
`lib` at ES2022 plus `es2023.array` for that reason; anything newer, such as
`Set.prototype.difference` or `AbortSignal.any`, needs a fallback.

## Hardware

`hardware/toy/` is a hardwired board modelled on the toy chip
([`README`](hardware/toy/README.md)). It reads the ROM tunes from `src/`, but
`board.ts` is hand-written.

- After changing the toy chip's ROM, tunes, address, data or bank lines, run
  `pnpm toy` and `pnpm test hardware/toy`.
- After changing the toy chip's circuit behaviour, edit `hardware/toy/board.ts`
  to match, or note in the commit that the board now differs.

## Tests and typecheck

Agents run `pnpm test` and `pnpm typecheck`, never bare `vitest` or `tsc`. Both
queue on `BENDER_HEAVY_SLOTS` machine-wide slots (default 2,
`scripts/heavy-run-slot.sh`), so four agents at once do not slow the box to a
crawl. `BENDER_HEAVY_SLOTS=0` turns the gate off.
