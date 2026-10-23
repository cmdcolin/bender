# Techno machine — handoff

The goal is a mutant techno machine: the kit's counter as the one grid, and
every step able to change anything. The owner wants the crazier call on design
questions, made without asking.

## Where the work is

`git log --oneline 7609cdf^..main` lists what landed. Read these first:

- `src/dsp/trigbus.ts`: the kit's counter on the bus (`drumStep`, `kitStepHz`,
  `drumStepLen`)
- `src/lanes.ts` and `src/ui/StepLanes.tsx`: the step lanes
- `src/drums.ts`: the tracker rows (`RATCHET_KEYS`, `NUDGE_KEYS`, `EVENT_KEYS`),
  the voice rows' bar conditions (`COND_KEYS`, `condPlays`), `asKitSetting`, and
  the text forms `bender.drums()` reads (`euclid`, `parseRow`, `parseCells`)
- `src/dsp/stages/stepFaults.ts`: cut, brake and freeze on the whole mix; drop
  and reboot run in `Supplies.stepEvents` (`src/dsp/supplies.ts`)
- `src/ui/throws.ts`: the five fault throws (`. ; / i r`), which hold
  `drumEventLive`
- `brownKick` in `src/dsp/stages/brownout.ts`: the kick pump
- `phraseShape` and the `phrase` source in `src/dsp/modbus.ts`: a slow shape
  over 1 to 32 bars of the kit, on the patch bay
- `src/ui/bendEnvelope.ts`: the bend keys' envelopes (snap, swell, riser, pluck,
  wobble), which `holdBend` and `letGoBend` in `src/ui/bendKeys.ts` run
- `euclidMask` in `src/drums.ts`: the grid's hits column

## Unverified

- Nobody has listened to any of it. Offline renders and tests measure the
  faults, the conditions, the pump and the phrase, but nobody has judged how
  they sound.
- The owner asked for bends that climb and move over seconds while the beat
  runs faster, and suggested ADSR. The phrase source and the bend envelopes are
  the answer so far, and the owner has not tried them yet.

## Next, in order

1. **Phrase-locked changes.** Quantize drift, morph and named cuts to 8- or
   16-bar boundaries, and let drift touch one heading at a time. The phrase
   source already counts the bars (`modPhraseBars`).
   `agent-docs/ideas/waiting-on-a-call/knob-automation.md` covers recorded
   sweeps.
2. **An ADSR on the bay.** A source gated by a kit voice or a held key, with
   times in beats. The trigger bus marks a key only on the sample it strikes
   (`TriggerBus.keyHeld` too), so a key gate needs a held level first.
3. **Per-step conditions.** The voice rows have one condition a row; a groovebox
   has one a step, and "only after the previous step fired".

## Loose ends

- `bender.tune` cannot write accents or slides.
- Drop and reboot always hit the shared cells, whichever supply the kit runs
  off. A kit on the bench supply keeps its bar through a reboot step.
- An event lands on the strobe and ignores the column's nudge and ratchet.
- A drop longer than about two steps at 128 bpm drains the cells to the watchdog
  and reboots the board.
- A freeze run over a kick stacks low end about 5 dB over the bar; on a clap it
  holds the bar's level.
- The phrase runs on at the kit's tempo while the kit is stopped, and restarts
  on the downbeat when it starts.
- The bend envelopes run on animation frames, so they stall in a hidden tab.
  The grid's bend row ignores them and holds each key for its step.
