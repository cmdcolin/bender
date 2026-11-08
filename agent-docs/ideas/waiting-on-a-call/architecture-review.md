---
name: architecture-review
description:
  What is left of the 2026-11-08 architecture reviews after stage sleep, tap
  needs, one kit rate and the heard() probe landed — a measured destination
  contract, worklet ramps, the PARAM_DEFS cut and four small bugs; waits on
  Colin picking where to start.
---

# Architecture review

Colin wants architecture, not line-count cuts. Drift between the param lists and
tap demand caused d27ba396, 1f87081e, c22ce7e0 and b39a1cde. Stage `sleep()`,
stage `needs()`, `toyDrum.stepHz` with `trig.stepHzOr`, `bender.heard()` and the
bugs they exposed landed in 0a369ac2..997f2d34.

## Proposals

- **Destination contract.** A `DEST_LAW` table beside `DEST` in `src/dsp` (knob,
  law add|oct|hop|vca|custom, bounds, engages) that audio never reads; describe
  and the panel read it. A measured contract test holds it to the DSP: a sweep
  found 43 destinations bit-exact as add, 38 differing as expected and 11
  ignoring a wire. An `engaged(p, bay, dest)` helper replaces about seven
  hand-written gates. Applying the laws in the bus was declined: float32 lane
  rounding, about 35% of the laws custom, and bounds that stay in the stages.
  The open call is whether depth units should ever be normalised, which changes
  the sound.
- **Worklet ramps.** Cue with seconds, so queued glides start on the step the
  cue lands on rather than a meter period later, and the bend row on the step
  strobe. Drift-leg choice and bend envelopes stay on the main thread. Mid-ramp
  verbs (`stopMorph`, a knob grabbed mid-glide) read `heard()`.
- **Tap sources in the routing plan.** Which source feeds the carrier and logic
  taps (`ringFrom`, `crushWith`) belongs with the planned `routeOf(params)`
  routing plan; stages already say whether they read a tap.
- **Params.** Delete `PARAM_DEFS`, keep an explicit smoothing map and pins for
  choice order, and keep facts name-keyed per layer. A full `PARAMS` spec and a
  `modded()` helper were declined.

## UI refactors left from the 2026-10-20 review

- A `useKnob` hook shared by `Slider` and `Dial`: Dial's arrows step 1 Hz on Mid
  freq, it has no wheel or typed entry, and right-click starts a drag.
- `deckSlider` in `DeviceVerbs.tsx` builds a new def each render, which leaks
  the `readoutChars` map.

## Bugs still open, verified on 2026-11-08

- fmChip keeps running the old effect script for up to a block after `stepHeat`
  calls `powerUp()`.
- pcmKeys zeroes a sounding voice's envelope on retrigger and steal, a click;
  old chips did this too, so keeping it is Colin's call. Fixing it changes
  golden.
- The tape head delay flattens against its 4-sample floor at 15/16 ips with Wow
  near 1.
- fmChip allocates on the audio thread (`noteOn` queue, `dacGains`, rng closures
  in `powerUp`), all under the alloc budget.
