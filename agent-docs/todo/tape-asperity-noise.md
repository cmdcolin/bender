---
name: tape-asperity-noise
description:
  Modulation noise on the tape machine as noise sidebands around the programme,
  with the hiss floor held steady.
metadata:
  category: ready
  area: tape
  first_move: measure hiss level under a loud tone before and after
  order: 16
---

# Asperity noise

- The hiss level follows the programme envelope through `s.modNoise` in
  `TapeHead.process` (`src/dsp/stages/tape.ts`). Measured on 2026-11-11: up to
  2.9 dB of swell under a 100 Hz tone.
- Asperity noise multiplies the programme by low-passed noise, which roughens a
  tone and leaves the floor between notes alone.
- This changes the stock sound of every board with hiss up; say so in the
  commit.
