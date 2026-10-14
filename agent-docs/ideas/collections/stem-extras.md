---
name: stem-extras
description:
  Follow-ups to stem recording, in order of value; an engine test of which
  stems get saved, a mic stem, and int16 encoding on arrival to lift the 120 s
  stem cap.
---

# Stem extras

- **Engine test of `keepStems` / `saveTake`.** A silent source gets no file and
  the names match `STEM_FILES`. Needs a fake `RecMsg` in
  `src/engine/engine.test.ts`.
- **A mic stem**, if anyone asks. The mic is not a `Stage`, so `Chain.process()`
  needs a separate tap for it beside `TAP_MIC`.
- **Progressive encoding**, if the 120 s cap (`REC_MAX_STEM_S`) bites. The
  engine would encode each slab to int16 on arrival and drop the float copy in
  `stemTake`, halving the resident cost so the cap can go back up.
