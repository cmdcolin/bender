---
name: architecture-review
description:
  What survived six independent architecture reviews of 2026-11-08 (a measured
  destination contract, stage sleep and tap needs, one kit clock) plus a list of
  bugs found along the way; waits on Colin picking where to start.
---

# Architecture review

Colin wants architecture, not line-count cuts. Drift between the param lists and
tap demand caused d27ba396, 1f87081e, c22ce7e0 and b39a1cde.

## Proposals

- **Destination contract.** A `DEST_LAW` table beside `DEST` in `src/dsp` (knob,
  law add|oct|hop|vca|custom, bounds, engages) that audio never reads; describe
  and the panel read it. A measured contract test holds it to the DSP: a sweep
  found 43 destinations bit-exact as add, 38 differing as expected and 11
  ignoring a wire. An `engaged(p, bay, dest)` helper replaces about seven
  hand-written gates. Applying the laws in the bus was declined: float32 lane
  rounding, about 35% of the laws custom, and bounds that stay in the stages.
- **Stage sleep.** An optional `sleep?(p)` called on the true-to-false edge of
  "on board and `when()`", with no default, since panic reboots chips and
  rewinds tapes. Clear echo, tapeDelay, spring, comb, amp, ensemble, shifter and
  stepFaults; clear rack, glitch and octave unless frozen; stagger big clears
  one per block. Tap demand moves from the `toyRef` special case in `chain.ts`
  into each consumer's `needs()`, and the choice of tap source into `routeOf`.
- **One kit clock.** The bent counter is the design, so no steady transport.
  Merge the four kit-rate fallbacks (`modbus.ts`, `chain.ts`, `arc.ts`,
  `brownout.ts`) into one TriggerBus clock. Probe a readback of the effective
  board first; then Cue with seconds as worklet ramps (queue glides) and the
  bend row on the step strobe. Drift-leg choice and bend envelopes stay on the
  main thread.
- **Params.** Delete `PARAM_DEFS`, keep an explicit smoothing map and pins for
  choice order, and keep facts name-keyed per layer. A full `PARAMS` spec and a
  `modded()` helper were declined.

## UI refactors left from the 2026-10-20 review

- A `useKnob` hook shared by `Slider` and `Dial`: Dial's arrows step 1 Hz on Mid
  freq, it has no wheel or typed entry, and right-click starts a drag.
- `deckSlider` in `DeviceVerbs.tsx` builds a new def each render, which leaks
  the `readoutChars` map.

## Bugs found, verified on 2026-11-08

Pedal tails; toyChip relax revival; kit choke on the kick and tom tanks; crusher
hold; sample-rate constants written as `** (48000/sr)`; stepFaults ignores the
drumWander wire (two reviews, measured); fmChip's stale script; a pcmKeys click;
the tape wow floor; queue glide durations and a late start; a stale hidden-tab
line in `agentApi.ts`.
