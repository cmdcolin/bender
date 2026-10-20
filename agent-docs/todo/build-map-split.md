---
name: build-map-split
description:
  Split the 1,100-line buildMap in chain-map.ts into layout and wiring passes,
  along videoskillet's panelChain / chainLayout / ChainMap cut.
metadata:
  category: ready
  area: map
  first_move: lift pickParts and measure out of buildMap behind one context
  order: 2
---

# Split `buildMap`

- `buildMap` in `src/ui/chain-map.ts` runs about 1,100 lines and holds topology,
  layout and every wire.
- videoskillet keeps the same job in three modules: `panelChain.ts` (topology),
  `chainLayout.ts` (geometry) and `ChainMap.tsx` (drawing).
- Suggested passes, sharing one context `{c, o, k, live, doors, wires}`:
  `pickParts`, `measure`, `layDown`, `layAcross`, `gutters`, `boardWires`,
  `bandWires`, `pathWires`, `feedbackWires`, `tapWires`.
- Move `no_trig` and `supply` node creation out of the wiring code and into
  `pickParts`.
- Fold the three copies of the box width formula (`natural`, `stageNeed`,
  `roomy`) into one, and give `rowEdge`/`footEdge` one bounding-box helper.

**Safety net:** the README byte-equality test in `chain-map.test.ts`,
`checkLayout` and the label-overlap test all pin the output.
