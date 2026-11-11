---
name: tape-head-clog
description:
  Head dirt on the tape machine, using Wraith's spacing loss, so treble sheds
  and recovers over seconds with no pitch change.
metadata:
  category: ready
  area: tape
  first_move: read clog and spacingPoles in src/dsp/stages/tapeDelay.ts
  order: 15
---

# Head clog on the tape machine

- Wraith models Wallace spacing loss per head (`clog` and `spacingPoles` in
  `src/dsp/stages/tapeDelay.ts`).
- Give the tape machine the same dirt on its replay head, with the tape speed
  taken from the `SPEED` row.
- Pitch stays put, which suits `agent-docs/reference/taste.md`, where tape wow
  is a dislike.
