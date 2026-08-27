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
the drawing itself changes as you patch the board.

![The app window with the panel boxed in red down the right-hand side and enlarged over the picture: the toy board and its shared supply at the top, the chaos oscillator, noise and sampler feeding the mix bus, the six bend slots beside the pedals and the tape machine, patch wires labelled with their depths arching in from the LFO and the envelope, and the feedback bus running back under the whole run](docs/img/panel-callout.jpg)

Full explanation in [How it works](docs/HOW-IT-WORKS.md).

## Features

- A toy keyboard, a drum machine and an FM chip sharing one starvable power
  supply — everything downstream of it dives, slows and reboots together.
- **Bends**: real hardware faults patched onto actual bus lines and rail nodes,
  not effects. Cut, ground, bridge or pull up a data or address line and the
  wrong byte lands. See [Bends](docs/BENDS.md) for the tour.
- Six reorderable bend slots, four pedals, a four-wire patch bay that modulates
  its own depths, three feedback loops, five slow "ageing" mechanisms, and a
  tape machine as the final stage.
- A melody memory with its own piano roll, and a sixteen-step drum machine with
  polymeter and pattern-rewriting rolls. Play both from the computer keyboard,
  the screen, or a controller.
- **A sampler that is also the tape.** Drop an audio file in, or roll one off
  archive.org, and play it at any speed either way round. Arm the record head
  and the board lays its own output back onto the reel, so what comes past next
  lap has been through the whole chain again — a bend in the path makes the loop
  diverge rather than fade. The reel is drawn: drag its two markers to trim the
  loop, drag the tape to move the head.
- A microphone into the mix, or soldered into the middle of the board — the
  chip's rail, an oscillator's FM input, the delay's feedback — and a body
  contact pad wired anywhere in the bay.
- 51 presets, 20 named cuts, and dice that roll a whole board, one stage, or a
  knife. **Morph** travels between two boards over up to thirty seconds instead
  of cutting, **hunt** auditions boards and keeps the one nearest the edge,
  **drift** never lets the board arrive anywhere, and ctrl+z walks back through
  every board you have been on.
- The panel _is_ the signal path: a live drawing that redraws as you patch, with
  a desk, meters, a scope and a rail lamp beside it.
- The whole board — settings, pattern and melody — lives in the URL, so a link
  is a patch: packed into a couple of dozen characters by default, or spelled
  out as `#set=chipStarve:0.8,dlyFb:0.6` when you would rather program the board
  by typing at the address bar. Record the output to wav.
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

## Demos

- Dubby drums
  https://cmdcolin.github.io/bender/#p=ABYAEgFkBgIAAwJgAAEAUABaAAkMjAEBiQEBhgEBhAEAggEBgAEAfQB8AHoAeAIBAFcCPwAtAAoATQAfAlEBAAEBAj0AkIACAIEBAICRAgKAgAIAgYECBQsBCAE5AAEDHgEBAAQCAxDIAQDLAwIaATEnAQm_AgEEAsUEAkwBvA8AMwBpASIFthIBCAANAHEAAwALAFUABwAFADEACQAHACEK-gsGXwADAAQWBA
