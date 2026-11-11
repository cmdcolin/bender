---
name: wraith-record-curve
description:
  Put the tape machine's pre-emphasis, saturation and self-erase in Wraith's
  regeneration, so a runaway dulls as it gets loud.
metadata:
  category: ready
  area: tape, Wraith
  first_move:
    read TapeHead.record in tape.ts and the regen write in tapeDelay.ts
  order: 12
---

# Record curve in Wraith's loop

- Wraith has Bump and Hiss since `2a14c32b`. The regeneration still clips
  through `softclip(regen * tap)` in `src/dsp/stages/tapeDelay.ts`.
- Run the write through the record curve of `TapeHead.record`
  (`src/dsp/stages/tape.ts`): pre-emphasis, the offset curve, de-emphasis, and
  the self-erase that lowers the replay corner with level.
- Gate it behind a control that rests at 0, so stock stays bit-identical.
- The half-band filters add latency; take it off the first head's tap.
