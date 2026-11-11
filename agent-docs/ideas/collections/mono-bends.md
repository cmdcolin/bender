---
name: mono-bends
description:
  Survey of Growler and Howler's voice card for bends that loop the output back
  into the card — out to sync, out to cutoff and a hold strobe off osc 3 are
  built; rail coupling between the oscillators and a looping contour are
  candidates.
---

# Bends for the voice card

Growler and Howler are two builds of `src/dsp/stages/monoVoice.ts`. Before this
round the card had static part faults (converter, VCA, caps, ladder pair, hold,
key DAC, regulator) and three cables from the output: **Feedback**, **Out to
pitch** and **Out to gate**. The survey looked for more loops through the output
and for parts that clock each other.

Measured on a bare voice at 48 kHz. Low is the share of the level under 120 Hz
(`lowEnergy` over `rms`). The riff is a 16-step line at eight steps a second and
the held note is C2 for three seconds.

## Built

| control       | setting             | patch               | measured                                   |
| ------------- | ------------------- | ------------------- | ------------------------------------------ |
| Out to sync   | 0.7                 | 110 Hz saw, no ring | 145 Hz at a 200 Hz cutoff, 227 Hz at 1600  |
| Out to sync   | 1                   | three squares, C2   | 57 → 33 Hz, low 0.93 → 0.96, level +12%    |
| Out to cutoff | 0.6                 | ladder ringing, 220 | second harmonic 0.001 → 0.33 of the first  |
| Out to cutoff | 1                   | ladder ringing, 220 | 398 Hz, second harmonic 0.53               |
| Out to cutoff | 1                   | dark bass, C2       | low 0.92 → 0.96                            |
| Out to cutoff | 1                   | screaming riff      | flatness 0.00 → 0.17, low 0.64 → 0.84      |
| Hold strobe   | 1, osc 3 lo at 2 Hz | key change at 0.1 s | old key until 0.5 s, then the new key      |
| Hold strobe   | 1, with droop 0.5   | A3 held             | 220 Hz falls to 94 Hz, refilled each 0.5 s |

- **Out to sync** (`monoLoopSync`, `leadLoopSync`): the output, through the
  jack's coupling cap, on the sync input of osc 1 and osc 2. The comparator
  holds both cores in reset while it is high. The knob lowers its threshold from
  above the loudest peaks to zero.
- **Out to cutoff** (`monoLoopCutoff`, `leadLoopCutoff`): the same signal on the
  ladder's cutoff control input, up to 24 octaves per unit of output at full,
  clamped to five octaves either way.
- **Hold strobe** (`monoStrobe`, `leadStrobe`): the pitch hold samples the
  summed pitch voltage (key, glide, modulation, Out to pitch) on each wrap of
  osc 3. Below 1 the switch leaks toward the live voltage.

Calls made toward the wilder sound:

- The sync comparator is level-sensitive. A reset on the edge alone, taken off
  the ladder ahead of the VCA, raised every note and thinned it: a held acid
  bass fell from low 0.86 to 0.66.
- A parked pulse sits high. Parked low, a held square bass squealed at 483 Hz
  with low 0.30, against 33 Hz and 0.96.
- The hold samples the whole pitch sum, so Out to pitch reaches the oscillators
  through it. On the key voltage alone the strobe would only delay notes.
- With the strobe on, pitch droop drains the held sum and stops draining the key
  voltage, so each strobe restores the pitch.

Presets: `cutoff plays the tune`, `stalled square`, `ladder eats its tail`,
`late for every note`.

## Candidates

- **Rail coupling between the oscillators:** each core's reset threshold rides
  on the ripple the other two put on the supply, so near-unison oscillators pull
  into lock and snap apart. Expected to be subtle at low depth and noise at
  high; unmeasured.
- **Looping contour:** the end of a contour's decay trips the gate comparator,
  so a held note pulses at a rate set by the attack and decay knobs. A melody
  memory gates faster than the contour loops, so it would only show on held
  keys.
- **Bay lanes** for the three new knobs. None has a `DEST` lane yet.
