---
name: tape-extras
description:
  Follow-ups to the cassette formats, noise reduction and the four-track:
  automatic level on a dictaphone, bouncing and crosstalk on the four-track,
  longer loops, and field recordings onto tape.
---

# Tape extras

- **Automatic level control** on the microcassette, and as a switch for a
  boombox cassette: a fast-attack, slow-release gain on the record side that
  pulls the room up in every gap.
- **Bouncing.** Route two of the four-track's loops through the desk onto a
  third, a generation down, as a Portastudio does to free tracks.
- **Crosstalk** between adjacent tracks of the four-track, a few tens of dB down
  and mostly low end.
- **A desk view** for the four-track, with four strips side by side showing each
  one's input, EQ and fader, like the mixer's desk, in place of four folds of
  rows.
- **More bay lanes**: each loop's erase and record, and the other channels'
  mids.
- **Longer loops.** Loops are float at 48 kHz, so four 60 s loops are 46 MB.
  Int16 storage halves that, as `stem-extras.md` proposes for stems.
- **Field recordings.** Record the mic straight onto a loop or the sampler's
  reel without the board in the path, and add a field-recordings pool to the
  archive roll in `src/engine/archive.ts` (check the collection ids).
- **Reel rot on the sampler.** The four-track's wear map on the sampler's reel,
  so a dropped file can come apart the way a loop does.
