---
name: verb-and-tape-extras
description:
  A pitch-shifting echo mode; verb comb modulation landed as Warble.
---

# Verb and tape extras

## Verb comb modulation

**Built** as `revWarble`, 0 to 1, with the `verb warble` bay lane
(`DEST.revWarble`). Each comb's delay swings on its own `SineOsc`: depth
`12 ms × knob`, rate `0.2 + 1.3 × knob` Hz, spread ×1, 1.37, 0.71, 1.19 across
the combs and ×1.09 on the right tank. At the top that is ±17% in pitch at up to
2.2 Hz, compounded every lap. At 0 the tank takes the old fixed-tap path, so the
shipped sound is bit-identical.

Depth went in linear on the knob: squared, 0.1 measured the same as off (frame
likeness 0.955 against 0.962).

One A3 held 0.3 s into a 20 s tank, tail from 1 to 5 s. `likeness` is the mean
spectral correlation between successive 85 ms windows (1 is a tail that never
moves); `bins` is how many 5 Hz bins hold 90% of the tail's power.

| Warble | tail rms | likeness | bins |
| ------ | -------- | -------- | ---- |
| 0      | 0.143    | 0.962    | 7    |
| 0.1    | 0.185    | 0.903    | 13   |
| 0.25   | 0.155    | 0.766    | 28   |
| 0.5    | 0.220    | 0.458    | 30   |
| 0.75   | 0.208    | 0.451    | 45   |
| 1      | 0.203    | 0.499    | 47   |

## Pitch-shifting echo mode

A pitch-shifting echo mode.
