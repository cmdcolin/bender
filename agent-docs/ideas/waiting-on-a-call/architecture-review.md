---
name: architecture-review
description:
  What is left of the 2026-11-08 architecture reviews after stage sleep, tap
  needs, one kit rate, the heard() probe and the destination law table landed —
  normalising wire depth, worklet ramps, the PARAM_DEFS cut and four small bugs;
  waits on Colin picking where to start.
---

# Architecture review

Colin wants architecture, not line-count cuts. Drift between the param lists and
tap demand caused d27ba396, 1f87081e, c22ce7e0 and b39a1cde. Stage `sleep()`,
stage `needs()`, `toyDrum.stepHz` with `trig.stepHzOr`, `bender.heard()` and the
bugs they exposed landed in 0a369ac2..997f2d34.

## Proposals

- **Depth units.** `DEST_LAW` in `src/dsp/destLaw.ts` gives every live
  destination its law (add, octaves, steps, gain or custom) and `describe()`
  words it; `pnpm contract` holds the add and step laws to the DSP sample for
  sample, and a unit test holds each step count to its control's settings. A
  full push is a different amount on each law: the whole knob on an add, 1 to 4
  octaves on an octave law, one lap of the settings on a step law. Normalising
  that changes the sound of every patched board and shared link, so it waits on
  Colin. The octave spans were read off the code, not measured. An
  `engaged(p, bay, dest)` helper was dropped: the 2026-11-08 sweep of all 222
  read destinations found no knob-only gate left that a wire would be heard
  through, and the gates use different thresholds.
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
