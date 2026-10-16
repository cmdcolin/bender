---
name: sides
description:
  A side is a list of boards with long morphs between them, so a piece can slide
  from clean to worn to noise over twenty minutes; waits on moving the glide
  onto the audio thread and on where a side is saved.
---

# Sides

A side is three to five boards, each with a travel time and a hold, running for
example from clean to worn to a noise wall to a bent breakdown. Each step is a
board, so a side needs no knob automation (`knob-automation.md`).

- **The glide has to move.** `Engine.travel` steps a `Glide` off
  `requestAnimationFrame`, and so does the param flush, so a morph stops in a
  hidden tab or with a phone's screen off. A side lasts minutes, so the worklet
  would interpolate between two param packs itself, beside the `Smoother`.
- **Longer morphs.** `MORPH_SECONDS` stops at 30 s; a side wants 2, 5 and 20
  minutes.
- **Where a side lives.** Whether a side is a list of board hashes in the URL
  (`#side=`), a saved voice or both is the call this waits on.
- **The panel.** Add the board you are on as a step, set its travel and hold,
  play the side, and see where along it you are.
