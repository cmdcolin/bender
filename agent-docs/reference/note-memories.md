---
name: note-memories
description:
  How Plinky's three memory lanes reach Glint, Parlor and Growler one lane each
  (per-lane gate taps), and the lane-lift cut that keeps a lane off Plinky.
---

# Independent note memories

Bass, chords and leads at once: each machine that follows Plinky can take one
lane of the melody memory instead of all of them merged.

## How it works

- Plinky's lanes (`bender.tune` with an array, `tuneStackA*`/`B*`) still strike
  the one shared gate line, `TriggerBus.key`, exactly as before. The line is one
  value a sample, so lanes struck together still collide there: last write wins.
- Each lane also stamps its own line, `TriggerBus.laneKey[lane]`. Lane 1 is the
  melody step, in `ToyChip`'s sequencer step, `kitStrike` and `restart`. Lanes 2
  and 3 are the stacks, in `strikeStacks`.
- The jumpers `fmKeyGate`, `pcmKeyGate` and `monoKeyGate` have five choices,
  `GATE_CHOICES` in `src/dsp/trigbus.ts`: `yes, soldered` (the shared line),
  `no, cut`, then `lane 1` to `lane 3`, appended so old links keep their
  meaning. `TriggerBus.keyLine` and `heldLine` pick what a machine reads. A
  memory lane never carries a held key.
- UI code asks `followsGate`, not `< 0.5`, whether a jumper reaches its machine.
- `tuneLift` is a bitmask of lanes lifted off Plinky's own output. A lifted lane
  still drives the gate lines. Lane 1 multiplies the melody oscillator by 0, and
  the oscillator keeps running for `melodyHz`. Lanes 2 and 3 skip the key-voice
  strike. It acts only while Plinky plays yours, as `tunePoly` does.
- `restart` puts step 0 on lane 1's line but not on the shared line, which has
  always skipped it. Changing the shared line would move the golden renders.
- `bender.tune` returns `lifted` and `played by`, the audible machines and the
  lane each follows.

## Not built

- A 32-step memory per machine: about 100 controls on the packed wire order and
  three editors, for a studio sequencer that does not fit the bent toy.
- More lanes on the line memory (`monoSeq`): doubles or triples its controls,
  and does nothing about the merged gate line.
