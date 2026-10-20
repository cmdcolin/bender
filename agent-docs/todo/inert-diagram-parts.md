---
name: inert-diagram-parts
description:
  The diagram wires and labels that still do nothing when pressed, mostly in
  BusDiagram.
metadata:
  category: ready
  area: diagrams
  first_move:
    make BusDiagram's tap, inject and feed wires Bends that move their key
  order: 8
---

# Parts of the drawings that still do nothing when pressed

- `BusDiagram`'s tap, inject and feed wires each carry a control key, and
  pressing one does nothing.
- Labels: "patch" and "booster" in `FmVoiceDiagram`, "rec" in `TapeLoopDiagram`.
- The strip's return wire from the loop to IN. The In knob that sets it sits in
  the lane row, outside the drawing.
- `FeedbackLoops` keeps `'cross'` open after the cross label disappears.
- The kit wiring drawing shows its eight voice boxes dashed, and they open
  nothing. Each could open its voice's knobs.
