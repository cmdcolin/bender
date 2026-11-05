---
name: metal-sheet-source
description:
  A big steel sheet struck, scraped and fed back through a contact mic, for
  harsh noise; prototyped offline against real recordings, with the numbers it
  settled. Waits on whether to build it and on a CPU budget for the modes.
---

# Metal sheet source

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

## Open

- **CPU:** 1,660 modes is offline only. A worklet budget is perhaps 100–150
  modes plus something cheap for the dense top.
- **Playing it:** a pad to drag (speed, pressure) and click (strike); kit hits
  strike it too.

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
