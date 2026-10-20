---
name: diagram-css-sync
description:
  Mark the shared core of Diagram.module.css and the route/arrowhead helpers as
  CROSS_REPO_SYNC with videoskillet, after two look calls.
metadata:
  category: needs-a-call
  area: diagrams, cross-repo
  first_move: ask which name size and lit-name colour both apps take
  order: 1
---

# Sync the diagram CSS and wire routing with videoskillet

- `Diagram.module.css` matches videoskillet's for about 70% of its rules, with
  no marker. The copies differ on:
  - name size: 9px in bender, 9.5px in videoskillet
  - box stroke at rest: `--border-hover` against `--border`
  - lit name: `--fg` in bender since 8715568, `--accent` in videoskillet
  - alarm token: `--alarm` against `--danger`
  - unity dash: `3 2` against `4 2`
- videoskillet's `src/ui/wire.ts` copied `route`/`arrowhead` from bender's
  `src/ui/svg.ts`. The copies have drifted: videoskillet guards empty input,
  rounds to 0.001 and takes separate `len`/`half`.

**Calls first:** the name size and the lit-name colour, since each changes how
one app looks.

**Then:** alias `--danger` to `--alarm`, move the core rules (`.box*`, `.name*`,
`.wire*`, `.head*`, `.pick`) into a marked region, and make the guarded `route`
one region in both repos. Run `pnpm sync:check` in either.
