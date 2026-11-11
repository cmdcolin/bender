---
name: tape-replay-head-pickup
description:
  An unshielded replay head on the tape machine that picks up the trigger bus
  and the toy rail as low thumps.
metadata:
  category: ready
  area: tape
  first_move: list what ctx carries (trig, railV, droop) in src/dsp/stage.ts
  order: 13
---

# Unshielded replay head

- A replay head is a coil and picks up nearby fields. Feed `ctx.trig` pulses and
  the toy rail (`ctx.railV`, `ctx.droop`) into the replay input in
  `TapeHead.process`, ahead of the head bump.
- The bump and the replay corner shape the pickup, so trigger ticks arrive as
  low thumps. Measure the share under 120 Hz.
- One control, resting at 0.
