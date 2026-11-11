---
name: prattle-bends
description:
  Survey of Prattle's speech chip past its bus faults — a slipping coefficient
  stack, an overshooting interpolator and a pitch counter reset by another
  machine are built; the chirp ROM's clock and a tap inside the lattice are
  candidates.
---

# Bends for the speech chip

`src/dsp/stages/prattle.ts` had faults on its three buses, its frame counter and
its clock, a stuck voicing gate and the board's output on the excitation line.
This round took the parts between the ROM and the mouth: the coefficient stack,
the interpolator and the pitch counter.

Measured on "kill the bass" said round and round for six seconds, Prattle alone.
Low is the share of the level under 120 Hz.

| control    | setting | level | low  | centroid |
| ---------- | ------- | ----- | ---- | -------- |
| (stock)    |         | 0.032 | 0.26 | 2540 Hz  |
| Stack slip | 0.2     | 0.040 | 0.19 | 1696 Hz  |
| Stack slip | 1       | 0.038 | 0.21 | 1771 Hz  |
| Overshoot  | 0.25    | 0.037 | 0.29 | 2421 Hz  |
| Overshoot  | 0.5     | 0.055 | 0.49 | 2143 Hz  |
| Overshoot  | 1       | 0.118 | 0.48 | 1321 Hz  |
| both       | 1       | 0.153 | 0.48 | 894 Hz   |

With the frame clock stopped on a voiced frame and a key held on Plinky, **Pitch
reset from** Plinky puts over twenty times more of the key's fundamental in the
take than the drone has without it, at 220 Hz and at 330 Hz.

- **Stack slip** (`talkStackSlip`): the odds, per frame, that the load misses a
  shift pulse and every coefficient lands one stage along. Ten misses bring the
  stack back in line. Each coefficient stays under one, so the lattice stays
  stable in every rotation, and the level rises by about a fifth.
- **Overshoot** (`talkOvershoot`): the interpolator's step scaled up to three
  times. Coefficients and energy wrap as ten-bit signed registers and the pitch
  period as an eight-bit one. Up to half the knob each frame rings and settles;
  past it the error grows from frame to frame.
- **Pitch reset from** (`talkSingFrom`): a rising edge on Plinky's pin or
  another machine's output restarts the chirp. While edges keep arriving within
  50 ms the counter stops wrapping at the ROM's period.

Calls made toward the wilder sound:

- At 0 the stack realigns on the next frame, so a bend key lets go cleanly. The
  rotation carries across phrases while the knob is up.
- The overshoot runs on all three registers through the one interpolator. A
  period that wraps to a few samples whines for a frame, and one that wraps near
  the top of the register croaks near 31 Hz.
- The reset replaces the ROM's period while the source sounds, so the buzz has
  one pitch. Both running at once is unbuilt.

Named cuts: `ten wrong mouths`, `croak and squeal`, `sings the toy’s tune`.

## Candidates

- **Chirp clock:** the chirp ROM's address counter clocked off another machine,
  so the glottal pulse stretches and shrinks with that machine's pitch.
- **A tap inside the lattice:** the DAC wired to a middle stage, which carries
  the signal ahead of the lower formants.
- **Energy on the kit:** a kit trigger line across the energy register's load,
  so hits open the mouth and the phrase's own loudness is ignored.
- **Bay lanes** for Stack slip and Overshoot.
