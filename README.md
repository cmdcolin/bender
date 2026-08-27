# bender

A virtual toy keyboard and drum machine on a modelled supply rail. Starve the
rail, solder a pot onto the die, listen to what falls out. Nothing plays a
"glitch sample" — the reboots and pitch dives come out of the mechanisms.

**Live: https://cmdcolin.github.io/bender/**

## The signal path

The panel draws the chain live: sources into the mix bus, through the bend
slots, the pedals, the tape machine, out, and the feedback bus back again. Click
a box for its controls. The drawing changes as you patch.

![The panel drawn large on the left and the whole app small beside it, with the panel ringed in red where it sits down the right-hand side of the window: the toy board and its shared supply at the top, the chaos oscillator, noise and sampler feeding the mix bus, the bend slots beside the pedals and the tape machine, and the feedback bus running back under the whole run](docs/img/panel-callout.jpg)

Full explanation in [How it works](docs/HOW-IT-WORKS.md).

## Features

- Simulates circuit bending toy keyboard, toy drum machine, and basic FM synth
- Effects, including tape delay and guitar-pedal styles
- A patch bay where modulators can modulate other modulators
- Buttons to easily randomize all the settings
- Connect MIDI controller via WebMIDI (works with Chrome, Firefox Nightly)
- Shareable URLs

Uses AudioWorklet API...surpringly powerful and fast
https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

See full feature list - [docs/features.md](docs/features.md)

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

This app inspired by hunching over broken keyboards on the floor and conjuring
harsh noise out of the ether

## Demos

- Dubby drums
  https://cmdcolin.github.io/bender/#p=ABYAEgFkBgIAAwJgAAEAUABaAAkMjAEBiQEBhgEBhAEAggEBgAEAfQB8AHoAeAIBAFcCPwAtAAoATQAfAlEBAAEBAj0AkIACAIEBAICRAgKAgAIAgYECBQsBCAE5AAEDHgEBAAQCAxDIAQDLAwIaATEnAQm_AgEEAsUEAkwBvA8AMwBpASIFthIBCAANAHEAAwALAFUABwAFADEACQAHACEK-gsGXwADAAQWBA
