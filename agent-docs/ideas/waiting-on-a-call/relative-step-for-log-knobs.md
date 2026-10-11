---
name: relative-step-for-log-knobs
description:
  The 17 remaining log knobs park many values on one position; fixing it needs a
  relative step in SliderDef and rescales packed links.
---

# Relative step for the other 17 log knobs

The other 17 log knobs are sticky and I'd leave them. It's structural, not a
bug: equal travel per decade against an absolute step puts ~10 values across
~40% of the track (revDecayS parks 89 positions on 0.2). Fixing it needs a
relative step — a new concept in SliderDef — and would rescale packed links for
all 17. sampleSpeed was worth it because its band was a dead value at the end
you reach for.
