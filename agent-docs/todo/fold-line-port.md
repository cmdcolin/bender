---
name: fold-line-port
description:
  Port videoskillet's FoldLine so rows behind a shut gate show as "N more
  controls need X" in place of vanishing.
metadata:
  category: ready
  area: diagrams
  first_move:
    read videoskillet diagram.ts shutBy/boxFold and its diagram.test.ts
  order: 3
---

# Show gated rows as one fold line

- bender's `rowShown` (`src/ui/diagram.ts`) hides a row whose gate is shut, so
  the player never sees that the knob exists.
- videoskillet collapses those rows into one line, "N more controls need X ·
  click to set". Pressing the line opens the gate.
  - `shutBy` and `boxFold` in videoskillet `src/ui/diagram.ts`
  - `FoldLine` in videoskillet `src/ui/DiagramParts.tsx`
  - tests in videoskillet `src/ui/diagram.test.ts`
- `BoxRows` has forked between the repos (bender has `verbs`, `under`,
  `inOrder`, `card`; videoskillet has `FoldLine`, `HelpLine`, scroll into view).
  Merging the two would let `BoxRows` become a synced region.
