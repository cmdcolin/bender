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
