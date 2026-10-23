# Techno machine — handoff

The goal is a mutant techno machine: the kit's counter as the one grid, and
every step able to change anything. The owner wants the crazier call on design
questions, made without asking.

## Where the work is

`git log --oneline 7609cdf^..21dc091` lists what landed. Read these first:

- `src/dsp/trigbus.ts`: the kit's counter on the bus (`drumStep`, `kitStepHz`)
- `src/lanes.ts` and `src/ui/StepLanes.tsx`: the step lanes
- `RATCHET_KEYS` and `NUDGE_KEYS` in `src/drums.ts`, with the scheduler in
  `src/dsp/stages/toyDrum.ts`

## Unverified

- The full suite never ran on `21dc091`. Claude Code stopped the run because the
  machine was low on memory, and the owner chose to land without it. Run
  `pnpm test` first.
- No screenshot shows the ratchet and nudge rows.
- Nobody has listened to any of the four changes.

## Next, in order

1. **Event rows.** These are grid steps that fire a fault for one step: a knife
   cut, a rail dropout, a tape brake, a glitch freeze or a reboot. The `bend`
   row in `src/ui/DrumGrid.tsx` (`BendRow`, `src/ui/bendKeys.ts`) already fires
   bend keys per step from a session store, so start there. Store an event row
   in controls, as the ratchet row is, so a link carries it.
2. **Euclid and mini-notation.** Add Euclid fills on the grid rows, and accept
   `x(3,8)` and `[x x x]` in `bender.drums()` (`src/ui/agentApi.ts`).
3. **Trig conditions.** Let a step fire only on fills, on the 3rd of every 4
   bars, or only after the previous step fired. Clatter's maybe masks cover part
   of this.
4. **Phrase-locked changes.** Quantize drift, morph and named cuts to 8- or
   16-bar boundaries, and let drift touch one heading at a time.
   `agent-docs/ideas/waiting-on-a-call/knob-automation.md` covers recorded
   sweeps.
5. **Rail pump.** A kick-only load setting on the shared cells, so the whole
   board ducks with the kick.

## Loose ends

- `bender.tune` and `bender.drums` cannot write accents, slides, lanes, ratchets
  or nudges yet.
- Lanes jump from step to step with no slew, so a pitch destination may click.
- While Time sync is on, the Time knob on Wraith's pedal face does nothing.
- At kit Level 0 the kit's stage does not run, so every synced machine stalls.
