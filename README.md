# bender

A virtual toy keyboard and drum machine run on a modelled supply rail; you
starve the rail, solder a pot onto the die, patch a microphone into the circuit,
and listen to what falls out. Nothing here plays a "glitch sample" — the
reboots, pitch dives and screams emerge from the mechanisms.

Real-time in the browser, on one AudioWorklet.

**Live: https://cmdcolin.github.io/bender/**

## The signal path

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/chain-dark.svg">
  <img alt="Sources — the toy keyboard, the drum machine, the FM chip, the chaos oscillator, noise and the mic — sum into the mix bus, which runs into the slot rack, then through the bends themselves, the stompbox, tape delay, delay pedal, spring verb, brownout, tape machine and output, with the feedback bus wired from output back to the mix" src="img/chain-light.svg" width="420">
</picture>

The panel is a live drawing of this chain: click a box to open its controls, and
the drawing itself changes as you patch the board. Full explanation in
[How it works](docs/HOW-IT-WORKS.md).

## Features

- A toy keyboard, a drum machine and an FM chip sharing one starvable power
  supply — everything downstream of it dives, slows and reboots together.
- **Bends**: real hardware faults patched onto actual bus lines and rail nodes,
  not effects. See [Bends](docs/BENDS.md) for the tour.
- Six reorderable bend slots, a four-wire patch bay, MIDI, five slow "ageing"
  mechanisms, and a tape machine as the final stage.
- A melody memory with its own piano roll, and a sixteen-step drum machine with
  polymeter and pattern-rewriting rolls.
- The whole board — settings, pattern and melody — lives in the URL, so a link
  is a patch.
- Everything runs inside one audio callback with a fixed safety tail, so no
  setting can blow up the output.

See [docs/features.md](docs/features.md) for every control, generated straight
from the app's own tables.

## Run

```sh
pnpm install
pnpm dev
```

## Docs

- [Getting started](docs/GETTING-STARTED.md)
- [User guide](docs/USER-GUIDE.md) — playing the keyboard, the drum machine, the
  FM chip, presets and rolls
- [Bends](docs/BENDS.md) — what each fault does to the circuit, and why
- [How it works](docs/HOW-IT-WORKS.md) — the signal path map and the app's own
  architecture
- [Features](docs/features.md) — every control, generated from the app's own
  tables
- [MIDI](docs/MIDI.md) — setting up a controller
- [Development](docs/DEVELOPMENT.md) — testing, benchmarking, releases
- [Data flow](docs/dataflow.md) — how a block gets rendered across the two
  threads
- [Optimizations](docs/optimizations.md) — what this has done to fit inside an
  audio callback

## Footnote

Initial template with Claude Fable. Follows in footsteps of
https://github.com/cmdcolin/ntsc.js
