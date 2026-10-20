---
name: open-box-to-videoskillet
description:
  Give videoskillet bender's OpenBox card, once the two BoxRows forks merge, and
  put its wires on the shared Bend.
metadata:
  category: ready
  area: diagrams, cross-repo
  first_move: merge the two BoxRows forks, then share OpenBox
  order: 5
---

# Port `OpenBox` to videoskillet

- `PickPart` and `Bend` sit in the shared `diagram-parts` region since 0441c7d,
  with `.wireHit` and `.bendPick` in `diagram-core`. No videoskillet drawing
  uses `Bend` yet; sync H/V drive and the return wires would suit it.
- `OpenBox` in bender's `src/ui/DiagramParts.tsx` frames the open box's rows
  with its name and a × hide button. It wraps `BoxRows`, which has forked:
  bender has `verbs`, `under`, `inOrder` and `card`; videoskillet has
  `FoldLine`, `HelpLine` and scroll into view. See
  [fold-line-port](fold-line-port.md).
- `useFlow` (wires light while signal runs) could follow later.
