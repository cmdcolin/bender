---
name: metal-sheet
description:
  The steel sheet behind the Sheet instrument: what an offline prototype settled,
  the contact-mic recordings it was measured against, and their sources.
---

# Metal sheet

A contact mic on junk metal, run hot into dirt and feedback, is a harsh-noise
staple. An offline prototype (2026-11-05) synthesised a glass bottle tapped, a
steel sheet hit and dragged, and the sheet in an amp → transducer → piezo loop,
and ran each through the board with the mic jacked into the mix. The prototype
script was not kept; the calls below are what it settled.

## Model

- **Sheet:** 1.2 × 0.9 m, 0.8 mm steel. Every plate mode under 2.5 kHz (about
  1,060) plus 600 sampled above with random wavenumber angles, scaled up for the
  missing density. Filtered noise for the top read as a hiss bed.
- **Damping:** a sheet on a floor. T60 = 0.05 + 1.6 · 50 / (f + 50) s, spread
  per mode by exp(0.7 · N(0, 1)), capped at 0.2 s above 2 kHz. Long, uniform
  decays read as a plate reverb.
- **Pitch:** up to 2.5 % sharp while loud, falling as it rings out.
- **Cascade:** a reservoir fed by the square of the energy in the modes below
  400 Hz, emptying in 0.15 s, firing sparse rattle impulses into the sheet. Fed
  from the whole output it kept itself going; as smooth noise it was hiss.
  Explicit cubic coupling between modes went NaN above strength 1 before it
  moved any energy upward.
- **Scrape:** a tool tip that sticks and slips under friction falling with speed
  (constant friction never re-sticks), a rough surface read at the contact,
  sparse catches, and the contact force rung through the tool's own resonances
  near 1.1, 1.9 and 2.75 kHz.
- **Piezo:** output tilt 1 / (1 + f / 1500). A 600 Hz corner starved the 0.8–3
  kHz band that scrapes live in.
- **Feedback loop:** 3 ms delay, speaker band 90 Hz–5 kHz, tanh; a hand on the
  sheet damps the modes under it. Loop gain 0.08 never holds and 0.3 locks one
  tone; 0.1 howls in the quiet, glides under the hand and collapses when it
  lifts.
- **Bottle:** shell modes n = 2–6 as split doublets on a 760 Hz base, plus the
  base's thunk. Liked as it was.

## Targets from real recordings

Contact mic unless noted, measured on 128 kbps previews.

- Hits lose the highs first: 20 dB down within 0.02–0.12 s above 8 kHz, 0.1–0.3
  s at 3–8 kHz, 0.13–0.26 s at 0.8–3 kHz. No late bloom up top.
- A thunder sheet's crash is sparse spikes over a wobbling band under 2 kHz.
- Scrapes put 40–70 % of their energy at 0.8–3 kHz and jitter 2.7–3.8 dB frame
  to frame (5 ms RMS). Rubbing rings the same few partials as hitting.
- The prototype reached 0.05–0.1 s on hit highs, but only 18–22 % at 0.8–3 kHz
  and 1.9–2.6 dB of jitter on scrapes.

## In the Sheet instrument

`src/dsp/stages/sheet.ts` keeps the damping, pitch, rattle and piezo tilt above
with 128 modes (56 from the grid, 72 log-spaced to 12 kHz, the density boost
capped at 4 so no one mode sings), at about 2 % of a core. Four modes run per
loop: one mode a loop cost 6.7 ns per mode-sample, four cost 2.

- **Not built:** scraping. It wants a pad to drag.
- **Shake** drives the sheet from the board's output a block late, tilted 1 /
  (1 + f / 600). Untilted and at the first gain it drove the high modes into
  steady tones and pinned the limiter. The output includes the sheet, so Shake
  is also the prototype's feedback loop: at Level 0.8 and Hold 0.8 a strike dies
  away below 0.75, sustains near 0.9 and howls into the clipper at 1.
- It was a bend for a day; it is a source so it can be played from its face.

## The Bottle instrument

`src/dsp/stages/bottle.ts` is the prototype's bottle on the same engine
(`src/dsp/stages/struck.ts`): rings n = 2 to 6 on a 760 Hz base, each a pair
0.45 % apart, at three heights (1, 1.14 and 1.35 times), plus a 165 Hz thunk and
a 2.9 kHz click. 32 modes, about a third of the sheet's cost. Across the face is
the angle round the bottle and down it is the height along the wall.

- **Ring:** walls take min(2.5 s, 2000 / f) times Hold to the 0.6; the thunk
  0.09 s, the click 0.02 s.
- **Fill** lowers the walls by 1 / sqrt(1 + 0.9 fill), the thunk by 0.3 fill,
  and divides the walls' ring by 1 + 2 fill.

## Sources

Recordings on Freesound. Search and sound pages fetch without a login, and each
sound page links an `-hq.mp3` preview.

- [418460](https://freesound.org/s/418460/): contact mic on a metal tray, hits
  (CC0)
- [832547](https://freesound.org/s/832547/): contact mic, hitting and rubbing a
  railing (CC0)
- [425591](https://freesound.org/s/425591/): contact mic, scraping a baking
  sheet (attribution)
- [219059](https://freesound.org/s/219059/): contact mic, keys on a gate (CC0)
- [241777](https://freesound.org/s/241777/): thunder sheet (CC0)
- [583955](https://freesound.org/s/583955/): large sheet hit, air mic
- [547979](https://freesound.org/s/547979/): sheet bang (CC0)
- [62332](https://freesound.org/s/62332/): sheet shaken and dragged (CC0)

Papers:

- [Observation of wave turbulence in vibrating plates](https://arxiv.org/pdf/0810.0891)
- [Wave turbulence buildup in a vibrating plate](https://arxiv.org/pdf/1509.02737)
- [Energy-conserving modal synthesis for thin plates in a strongly nonlinear regime](https://hal-ensta-paris.archives-ouvertes.fr/hal-01194569)
- [Real-time gong synthesis, DAFx 2023](https://www.dafx.de/paper-archive/2023/DAFx23_paper_19.pdf)
- [Avanzini and Marogna, efficient pitch glides, JASA](https://air.unimi.it/retrieve/dfa8b99e-b482-748b-e053-3a05fe0a3a96/avanzini_jasa12.pdf)
- [Thin-shell sound with wave turbulence](https://www.cs.columbia.edu/~cxz/publications/waveturb.pdf)
