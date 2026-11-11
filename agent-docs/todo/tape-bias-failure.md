---
name: tape-bias-failure
description:
  A record head with no bias on the tape machine, where quiet signals vanish and
  loud ones come through with crossover fuzz.
metadata:
  category: ready
  area: tape
  first_move: measure a dead-zone curve against softclip in TapeHead.record
  order: 11
---

# Bias failure on the tape machine

- `tapeBias` at its lowest only raises drive and tilts the top (`recordDrive`
  and `s.tilt` in `src/dsp/stages/tape.ts`).
- Unbiased oxide has a dead zone around zero field. Add a control that opens one
  in the record curve inside `TapeHead.record`, which runs at twice the rate.
- Expected sound: hats and hiss-level signals drop out, a kick passes with
  crossover distortion. Measure the share under 120 Hz against the stock curve.
- The control rests at 0 and stock stays bit-identical.
