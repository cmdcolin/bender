---
name: wraith-dbx-loop
description:
  A dbx decoder in Wraith's regeneration as a fault, where the expander makes
  every lap louder.
metadata:
  category: ready
  area: tape, Wraith
  first_move:
    wrap Dbx from tapeNr.ts round the regen write and measure the runaway
  order: 17
---

# dbx decode in Wraith's loop

- A prototype loop round the tape machine with dbx on play only reached +5.5
  dBFS on 2026-11-11.
- `Dbx` in `src/dsp/stages/tapeNr.ts` takes a `decode` flag, and the four-track
  already holds a pair per loop.
- One switch on Wraith, off at rest. The lamp (`dlyLamp`) holds the level once
  the loop runs away.
