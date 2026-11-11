---
name: tape-voicing-calls
description:
  Two tape constants that wait on Colin's ears, Wraith's Bump ceiling and the
  tape machine's stock Hysteresis.
---

# Tape voicing calls

- **Wraith's Bump ceiling.** `dlyBump` tops out at 1.5
  (`src/ui/controls/pedals.ts`). At full Bump the loop runs away from about
  Feedback 0.9, because the lift about doubles the loop gain at the bump note.
- **Stock Hysteresis.** `tapeHyst` rests at 0.3 (`src/controls.ts`). A 220 Hz
  tone at -6 dBFS measured H2 -18.6 dB and H3 -27.4 dB on 2026-11-11. Biased
  tape is third-harmonic dominant, and a second harmonic that strong matches a
  magnetised head. About 0.1 would put H3 on top. Not checked against a
  datasheet.
