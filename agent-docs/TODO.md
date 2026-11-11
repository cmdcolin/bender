---
name: todo
description:
  Index of the open action items in todo/, grouped by what to do first. Read
  when picking up work, and before filing anything new here.
---

# Todo

One file per item under [todo/](todo/). Each carries its table row in its own
frontmatter: `metadata.category` picks the table, `area` and `first_move` are
the columns, `order` is where it sits. This index has no generator, so add or
remove a row here when you add or remove an entry.

## Ready

| Item                                                               | Area                 | First move                                               |
| ------------------------------------------------------------------ | -------------------- | -------------------------------------------------------- |
| [Fold line for gated rows](todo/fold-line-port.md)                 | diagrams             | read videoskillet diagram.ts shutBy/boxFold and its test |
| [OpenBox to videoskillet](todo/open-box-to-videoskillet.md)        | diagrams, cross-repo | merge the two BoxRows forks, then share OpenBox          |
| [Tape machine as a bay source](todo/tape-bay-sources.md)           | tape, bay            | read SRC in modbus.ts and how a source fills its lane    |
| [Bias failure on the tape machine](todo/tape-bias-failure.md)      | tape                 | measure a dead-zone curve against softclip               |
| [Record curve in Wraith's loop](todo/wraith-record-curve.md)       | tape, Wraith         | read TapeHead.record and Wraith's regen write            |
| [Unshielded replay head](todo/tape-replay-head-pickup.md)          | tape                 | list what ctx carries in stage.ts                        |
| [Low judder on the tape machine](todo/tape-low-judder.md)          | tape                 | copy the span resonator at a low frequency               |
| [Head clog on the tape machine](todo/tape-head-clog.md)            | tape                 | read clog and spacingPoles in tapeDelay.ts               |
| [Asperity noise](todo/tape-asperity-noise.md)                      | tape                 | measure hiss under a loud tone                           |
| [dbx decode in Wraith's loop](todo/wraith-dbx-loop.md)             | tape, Wraith         | wrap Dbx round the regen write                           |
| [Shorter half-band for the tape heads](todo/tape-halfband-cost.md) | tape, performance    | parameterise the tap count in halfband.ts                |
| [Four-track record latency](todo/four-track-lay-latency.md)        | tape, four-track     | keep a continuous laid-to position in Loop.lay           |
| [Bend ends for Wraith's Bump and Hiss](todo/wraith-bend-ends.md)   | bend keys            | pnpm bend-ends                                           |
