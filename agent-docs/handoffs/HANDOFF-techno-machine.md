# Techno machine — handoff

The goal is a mutant techno machine: the kit's counter as the one grid, and
every step able to change anything. The owner wants the crazier call on design
questions, made without asking.

## Where the work is

`git log --oneline 7609cdf^..a3e5c34` lists what landed. Read these first:

- `src/dsp/trigbus.ts`: the kit's counter on the bus (`drumStep`, `kitStepHz`,
  `drumStepLen`)
- `src/lanes.ts` and `src/ui/StepLanes.tsx`: the step lanes
- `RATCHET_KEYS` and `NUDGE_KEYS` in `src/drums.ts`, with the scheduler in
  `src/dsp/stages/toyDrum.ts`
- `EVENT_KEYS` and `drumEventEvery` in `src/drums.ts`: cut, brake and freeze
  run in `src/dsp/stages/stepFaults.ts`, the last post stage; drop and reboot
  run in `Supplies.stepEvents` (`src/dsp/supplies.ts`) on the shared cells
- The three techno demos at the end of `demos.json`. The board dicts that
  generate their queries lived in a session scratchpad; edit the queries by
  hand, or rebuild one in the app and copy its link

## Unverified

- Nobody has listened to the ratchets, nudges, lanes, the event row or the three
  demos. Offline renders measure clean (no reboots where none were planned,
  limiter under 0.4 dB, every source sounding), but nobody has judged the sound.
- The event row's cells show one letter each (c, d, b, f, r). A headless Chrome
  screenshot at 1400 px wide shows them fitting; nobody has checked phone width.

## Next, in order

1. **Euclid and mini-notation.** Add Euclid fills on the grid rows, and accept
   `x(3,8)` and `[x x x]` in `bender.drums()` (`src/ui/agentApi.ts`).
2. **Trig conditions on the voice rows.** The event row has 1:1 to 8:8; give
   each voice row the same, plus "only after the previous step fired".
   Clatter's maybe masks cover part of this.
3. **Phrase-locked changes.** Quantize drift, morph and named cuts to 8- or
   16-bar boundaries, and let drift touch one heading at a time.
   `agent-docs/ideas/waiting-on-a-call/knob-automation.md` covers recorded
   sweeps.
4. **Rail pump.** A kick-only load setting on the shared cells, so the whole
   board ducks with the kick.

## Loose ends

- `bender.tune` and `bender.drums` cannot write accents, slides, lanes,
  ratchets, nudges or events yet.
- Drop and reboot always hit the shared cells, whichever supply the kit runs
  off. A kit on the bench supply keeps its bar through a reboot step.
- An event lands on the strobe and ignores the column's nudge and ratchet.
- A drop longer than about two steps at 128 bpm drains the cells to the
  watchdog and reboots the board.
- A freeze run over a kick stacks low end about 5 dB over the bar; on a clap
  it holds the bar's level.
- While Time sync is on, the Time knob on Wraith's pedal face does nothing.
- At kit Level 0 the kit's stage does not run, so every synced machine stalls.
  Mute the kit instead to keep the clock.
