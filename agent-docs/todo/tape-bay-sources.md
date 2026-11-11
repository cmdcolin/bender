---
name: tape-bay-sources
description:
  Make the tape machine a source in the patch bay, so its tension drift,
  dropouts and squeal can move other machines.
metadata:
  category: ready
  area: tape, bay
  first_move: read SRC in src/dsp/modbus.ts and how a source fills its lane
  order: 10
---

# Tape machine as a bay source

- `Tape.roll` in `src/dsp/stages/tape.ts` already computes three signals a wire
  could carry: `tension` (the slow drift), each head's `dropEnv`, and `span`
  (the squeal resonator).
- Add them to `SRC` in `src/dsp/modbus.ts`. Example patches: a dropout ducks
  Glint, the toy clock sags while the tape squeals.
- The destinations `machineLevel` to `machineAzimuth` landed in `e4ad7083`.
- An unwired bay stays bit-identical; check with `pnpm golden`.
