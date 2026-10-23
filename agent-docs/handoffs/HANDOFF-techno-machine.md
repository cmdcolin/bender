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

## Unverified

- Nobody has listened to any of it. Offline renders and tests measure the
  faults, the conditions and the pump, but nobody has judged how they sound.

## Next, in order

1. **Euclid on the grid.** `bender.drums()` reads `x(3,8)`; the grid itself has
   no Euclid fill yet.
2. **Phrase-locked changes.** Quantize drift, morph and named cuts to 8- or
   16-bar boundaries, and let drift touch one heading at a time.
   `agent-docs/ideas/waiting-on-a-call/knob-automation.md` covers recorded
   sweeps.
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
