---
name: diagram-layout-helpers
description:
  Pull the copied row-spreading math and BoxSpec builders out of the stage
  drawings into diagram.ts helpers.
metadata:
  category: ready
  area: diagrams
  first_move:
    write spreadRow(widths, span) and port BusDiagram and FmDie onto it
  order: 6
---

# Shared layout helpers for the stage drawings

- **Spread boxes across a span:** the same math sits in `BusDiagram`,
  `MonoCardDiagram`, `FmDieDiagram`, `MonoPathDiagram` and `FmChipDiagram`.
- **Fixed-gap row:** `PcmKeysDiagram`, `ToyDrumDiagram`, `ToyDieDiagram`, and
  `KitWiringDiagram` (centred).
- **Box-to-box wires:** a `chainWires(boxes, y)` helper would replace the edge
  loops in `PcmKeys`, `FmChip`, `MonoCard`, `ToyDie` and `MonoPath`.
- **`box(id, x, y, w, keys, help)` builder:** copied in `PcmKeys`, `FmChip`,
  `ToyDrum`, `MonoPath`, `TapePath` and `Supply`.
- 10 drawings still wrap themselves in `<div className={chip.chips}>` where
  `ChipDrawing` does the same.

`pnpm diagram-shots <dir>` before and after shows any shift.
