---
name: drum-recordings
description:
  Real drum recordings to measure Clatter's voices and its retrigger bend
  against, where to get them and what they measured. Read before voicing a kit
  voice or retuning a retrig bend.
---

# Drum recordings

Keep the files in a scratchpad, never in the repo.

## TR-808 one-shots

Michael Fischer's set, with no licensing restrictions, on jsdelivr:
`https://cdn.jsdelivr.net/npm/@fluid-music/tr-808@0.0.2/TR808WAV/<DIR>/<NAME>.WAV`,
listed at
`https://data.jsdelivr.com/v1/package/npm/@fluid-music/tr-808@0.0.2/flat`. Names
encode the knobs: `BD/BD5050` is tone 50, decay 50. 44.1 kHz mono.

The 2026-10-22 kit voicing rendered each voice solo through `renderStems` (stem
1 is the drums) and compared −20 and −40 dB decay times, band energies (<100,
−400, −1.5k, −5k, −10k, 10k+ Hz) and waveform plots against these.

## Colin's bent Kawasaki kit

`~/ten million drum hits (live) [290850306].m4a`, 5.5 min: Colin's live
recording of a Kawasaki toy drum kit bent to retrigger, one of his favourite
bends, and the target for `drumRetrigHz` and the retrig row. Measure it with
per-section cycle stacks: band shares and pitch tracking alone mistake the drum
body's pitch for the restart rate.

- About half the take is a 17–40 ms slice of a sampled drum restarted 25–60
  times a second, most often 33.8 ms (29.6 Hz). Each slice holds about four
  cycles of a ~118 Hz body, plus 1–8 kHz grit that varies per restart.
- The period holds for tens of seconds (cycle-to-cycle correlation 0.90), then
  steps in plateaus: 39.5, then 34.6, 33.7, 32.7 ms.
- Shorter sections: a rough growl at 90–140 Hz, and screams at 630–960 Hz with
  gliding pitch. No step pattern underneath, only swells near 1 Hz.
- Made with bare fingers and a paperclip across the board, no fixed mod: the
  plateaus are the clip holding then slipping, the grit is skin resistance, and
  the exact 60/120/180 Hz lines are mains hum through the body.
- 53% of the energy sits at 90–300 Hz; crest factor 13.9 dB, no clipping.
