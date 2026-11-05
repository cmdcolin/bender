---
name: note-memories
description:
  Bass, chords and two leads at once. Today Plinky's three lanes reach Glint,
  Parlor and Growler merged on one gate line; tap each lane on its own line
  instead.
---

# Independent note memories

## What happens now

- Plinky's three lanes (`bender.tune` with an array, `tuneStackA*`/`B*`) all
  strike through `ToyChip.strike`, which latches one `keyNote` and stamps it on
  the one gate line, `TriggerBus.key` (`src/dsp/stages/toyChip.ts`,
  `strikeStacks` and `keyStruck`).
- `fmKeyGate`, `pcmKeyGate` and `monoKeyGate` are on/off jumpers on that line,
  so Glint, Parlor and Growler follow every lane.
- The line is one value a sample. When lanes strike together, the last write
  wins: lane 1 in the sequencer's step, a stack in `kitStrike`. So a follower
  gets a mix of the lanes, not all of them.
- Parlor's chord memory (`pcmChord`) chords whatever arrives, so a lead on the
  gate becomes chords.
- The line memory (`bender.line`, `monoSeq*`) is the only other source. It rides
  its own line, `TriggerBus.seqKey`, to one machine picked by `monoSeqTo`.
- Most parts possible today: Plinky (all lanes) plus one line-memory part.

## Options

### Per-lane gate taps (a lane-select on each jumper)

- Hardware story: Plinky's chip drives one gate per voice channel, and the loom
  ties them into one wire. A bender lifts the tie and runs one channel's gate to
  one jumper.
- Code: `TriggerBus` gains a key line per lane; `strike` takes the lane; each
  machine reads the line its jumper names. The three jumpers grow choices at the
  end of the list (`lane 1`, `lane 2`, `lane 3`), so 0 stays "all lanes" and old
  links and presets load unchanged.
- It also ends the last-write-wins collision, since each lane has its own line.
- Cost: small. About 100 lines across `trigbus.ts`, `toyChip.ts`, `fmChip.ts`,
  `pcmKeys.ts`, `monoSynth.ts` and the three control defs, plus tests. Golden
  renders stay put because the default is the merged line.
- Gap: Plinky still sounds all three lanes. Lowering `chipLevel` drops the
  lane-1 lead too. A fix is a "lane out" cut that lifts one lane's voice off the
  chip's own output (the voice's output resistor, desoldered). It is optional
  and a few lines more.

### A memory per machine

- Glint, Parlor and Growler each get a 32-step memory like the line memory.
- Hardware story: weak. It is a studio sequencer, not a bent toy.
- Cost: large. That is 32 steps plus accent and slide for each machine, about
  100 controls on the packed wire order, three editors in the UI and an
  agent-API verb per machine.

### More lanes on the line memory

- `monoSeq` grows a second and third lane, each with its own `monoSeqTo`.
- Hardware story: fair. It is the bassline box with more tracks.
- Cost: medium to large. It doubles or triples the line memory's controls and
  editor, and it does nothing about the merged gate line.

## Recommendation

- Per-lane gate taps. They are the cheapest and fit the bent-loom story. Every
  machine can already follow the gate, so the change only adds which lane it
  follows.
- With them, a four-part arrangement works. Plinky plays lane 1 as the lead,
  with Glint on lane 1 doubling it or on lane 3 as a second lead. Parlor on lane
  2 uses its chord memory for the chords, and Growler takes the line memory for
  the bass with its gate jumper cut.
- Add the lane-out cut if Plinky sounding lanes 2 and 3 gets in the way.
