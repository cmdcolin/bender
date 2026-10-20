---
name: patch-drawings-shared-parts
description:
  Redraw TriggerPatch and MicPatch with the shared Diagram, Pressable and Wire
  parts, so they get the chip look, markers and touch targets.
metadata:
  category: ready
  area: diagrams
  first_move: swap TriggerPatch's raw svg and press() for Diagram and Pressable
  order: 7
---

# Move the trigger and mic patches onto the shared parts

- The code in `src/ui/TriggerPatch.tsx` renders a raw `<svg>` and rebuilds
  `Pressable` (`press`), arrowheads (`arrowTo`, open chevrons), boxes and its
  own hint. Its Clatter and Plinky boxes open nothing, and it outlines them
  solid.
- `src/ui/MicPatch.tsx` does the same, and its mic box could open `micLevel`.
- Both took `role="group"` in d61b04d, so `pnpm diagram-shots` captures them.
