---
name: four-track-lay-latency
description:
  Take the oversampler's latency back off the four-track's record head, so a
  track that re-records its own tape stays in place.
metadata:
  category: ready
  area: tape, four-track
  first_move: keep a continuous laid-to position in Loop.lay
  order: 19
---

# Four-track record latency

- Since `043d990d` a take lands `LATENCY` frames behind where it was heard
  (`Loop.record` in `src/dsp/stages/fourTrack.ts`).
- It accumulates only when a track's input is its own tape.
- Offsetting `behind` by `LATENCY * vel` each sample skips or rewrites a frame
  when `vel` moves. Track where the last write ended and continue from there.
