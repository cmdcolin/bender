---
name: open-box-to-videoskillet
description:
  Give videoskillet bender's OpenBox card, Bend wires and PickPart, so its
  diagram wires press like bender's.
metadata:
  category: ready
  area: diagrams, cross-repo
  first_move: move OpenBox, PickPart and Bend into the diagram-parts sync region
  order: 5
---

# Port `OpenBox`, `Bend` and `PickPart` to videoskillet

- In bender's `src/ui/DiagramParts.tsx`, outside the sync region:
  - `OpenBox` frames the open box's rows with its name and a × hide button.
  - `Bend` makes a wire and its name one button over a 12px hit stroke.
  - `PickPart` turns any part of a drawing into a box opener.
- videoskillet's diagram wires do nothing when pressed. Sync H/V drive and the
  return wires would suit `Bend`.
- `.wireHit` and `.bendPick` in `Diagram.module.css` go with them; see
  [diagram-css-sync](diagram-css-sync.md).
- `useFlow` (wires light while signal runs) could follow later.
