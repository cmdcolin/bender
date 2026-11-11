---
name: tape-low-judder
description:
  A second stick-slip resonator on the tape machine in the bass, for a growl
  beside the squeal.
metadata:
  category: ready
  area: tape
  first_move:
    copy the span resonator in Tape.roll at a low frequency and measure it
  order: 14
---

# Low judder on the tape machine

- The squeal is one resonator with friction-dependent damping (the `SQ_*`
  constants and the `spanOn` block in `src/dsp/stages/tape.ts`). Its notes sit
  in the `squealHz` column of `SPEED`.
- Add a second span at a `judderHz` column well under the head bump's octave,
  with a larger share of `SQ_FM_MS` so the programme wobbles at that rate.
- Unheard so far. Measure the share under 120 Hz, and whether the limit cycle
  starts and stops with tension the way the squeal does.
