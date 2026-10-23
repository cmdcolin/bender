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
- `src/engine/phraseClock.ts` and `queue` in `src/engine/engine.ts`: the land
  lock, which holds board and pattern changes for the kit's downbeat
- `runEnv` in `src/dsp/modbus.ts` and `src/dsp/util/adsr.ts`: the bay's ADSR;
  the worklet writes the held keys into `TriggerBus.keysDown`
- `STEP_CONDS` and `stepCondPlays` in `src/drums.ts`: the cond row, which
  `drumFill` (the F button) gates

## Unverified

- Nobody has listened to any of it. Offline renders and tests measure the
  faults, the conditions, the pump, the phrase and the ADSR, but nobody has
  judged how they sound.
- The owner asked for bends that climb and move over seconds while the beat runs
  faster, and suggested ADSR. The phrase source, the bend envelopes and the
  bay's ADSR are the answer so far, and the owner has not tried them yet.

## Next, in order

1. **Pattern chains.** The memory slots switch on the land lock's downbeat; a
   chain would play slot 1 for so many bars, then slot 2, as a groovebox song
   mode does.
2. **A key for the fill.** All thirty letters have a job, so F is a button only.
   A MIDI note or a modifier on a throw key would free the hands.
3. **Recorded sweeps.** `agent-docs/ideas/waiting-on-a-call/knob-automation.md`
   covers knob motion recorded onto the bar.

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
- The bend envelopes run on animation frames, so they stall in a hidden tab. The
  grid's bend row ignores them and holds each key for its step.
- `bender.drums()` reads and writes no text form for the cond row; agents set
  `drumStepCond0` to `drumStepCond15` by name.
- A morph that arrives on the downbeat sets every pattern mask the preset names
  as it lands, so a pattern queued for the same downbeat can lose to it.
