---
name: map-touched-dot-badge
description:
  Draw the map's touched dot as a badge on the box corner to free the 18px
  COUNT_COL every box reserves.
metadata:
  category: needs-a-call
  area: map
  first_move: mock the corner dot on a busy board and show the user
  order: 9
---

# Touched dot as a corner badge

- `COUNT_COL` (18px) in `src/ui/chain-map.ts` reserves room for the touched dot
  in every map box. The top row (Plinky, Glint, Parlor) sets the band's width,
  so the column costs the band about 54px.
- A dot on the box's top-right corner takes no width, and a box still keeps its
  size when a control moves.
- It changes how the map looks, so it needs the user's eye first.
