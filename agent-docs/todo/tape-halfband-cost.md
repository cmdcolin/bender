---
name: tape-halfband-cost
description:
  Cut the CPU the oversampled tape heads cost with a shorter half-band filter.
metadata:
  category: ready
  area: tape, performance
  first_move: parameterise the tap count in src/dsp/util/halfband.ts
  order: 18
---

# Shorter half-band for the tape heads

- `043d990d` put the tape machine and four-track record heads between the amp's
  half-band filters. On ada the everything-on board's median block went from
  13.8% to 15.1% of the budget.
- A filter about half as long would cost about half as much, with less rejection
  between 16 and 24 kHz.
- `src/dsp/tape.test.ts` holds the response at 16 kHz and the fold test; both
  must still pass. Compare with paired `scripts/blocks.ts` runs on ada.
- `LATENCY` changes with the tap count, and `Tape.roll` reads it.
