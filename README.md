# bender

virtual web based circuit bender

https://cmdcolin.github.io/bender/

## The signal path

You interact with the audio using the signal path diagram. Clicking on buttons
there opens settings panels.

![The panel drawn large on the left and the whole app small beside it, with the panel ringed in red where it sits down the right-hand side of the window: the toy board and its shared supply at the top, the chaos oscillator, noise and sampler feeding the mix bus, the bend slots beside the pedals and the tape machine, and the feedback bus running back under the whole run](docs/img/panel-callout.jpg)

Full explanation in [How it works](docs/HOW-IT-WORKS.md).

## Features

- Circuit bend a toy keyboard, drum machine, and basic FM synth
- Tape delay, reverb, and distortion 'guitar pedals'
- Allows custom piano roll and drum sequences
- Patch bay with LFO and other modulations
- Buttons to easily randomize settings
- Connect MIDI controller (works with Chrome, Firefox Nightly)
- "Tape loop" sampler that has tape head re-recording-over-the-loop effect
- Shareable URLs

Uses AudioWorklet API...surpringly powerful and fast
https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

See full feature list - [docs/features.md](docs/features.md)

## User interface

You can see from the above screenshot it's all kind of compact and wrapped into
that signal diagram. It is a little tricky but it is better than just having 100
sliders all visible at once.

For maximum control to get e.g. super tactile control I'd recommend getting a
MIDI controller. I got one just because i made this! This one though of course
any will do "Akai Professional MPK Mini" (has drum pad, 8 dials, keys)

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

Initial template with Claude Fable and extensively vibecoded. Follows in
footsteps of https://github.com/cmdcolin/ntsc.js

## Demos

- Dubby drums
  https://cmdcolin.github.io/bender/#p=ACwAJAHIAQYEAAYCwAEAAgCgAQC0AQASDBgBEgEMAQgABAEAAAUABwALAA8CBgCuAQKuAgCMAQAYAJoBAD4CogEBAAECAnoAoIAEAIICAICiBAKAgAQAgoIEBRYBEAFyAAIDQAECAAgCBhCQAwB2AjQBZCcCCaYFAQgC7gkCmAEBoB8AZgDyAgFEBfAkARAAGgAaAAYAFgAdAA4ACgBlABIADgCFAQr2FwYJAAYACBYI

- More dubby drum with wandering synth
  https://cmdcolin.github.io/bender/#p=AAAAJAFSAA4HAgACAQIAqAEAyAEFCAcEAAQACgAMAAQADgAGAAoABwAFAAMACgABAAAAAgEWAMgBAMQCALQBAJgCAMoIBH4AVgHIAQiAZgDwnQEAgAQA8B8HyAEABgCsAQAMABoAFAAWANwCAAQABgICAAIAHAN6AORDAMACAIB9AAIAWADIAQACNQIAbgAOAHcD4iwAgAEBAgFkBNAQA4IBABQBIgBOAbQBAAoBAgDEAQAOABwAqAEADgAsADkADgASABkGzhMAIgEGALQHACwAaACUAgAIAIwBAccBAH4AMgsuCHAAyAEAwAEAlgEBBAAEAAYABgAIAAoADAAOABIAFAAKAAgABAAEAAQABAcUABIAEgASABIAEgASABIAEgASABQAFAAWHBQ

- Glitch voice
  https://cmdcolin.github.io/bender/#p=AIwBACQBWgEYEQAlBAICD8gBAWwADAQCAAoFZAPcJApQAAoBAgCMAQA8Awgd_gEKVgIOAqYFCYQFAaINBMgBAGoB8CQBEAAiALkBAAQAEACvAQAWAZMBASQAqAECCgKMAQG8AQAEALABA6Y7CAADeAIKBAoEegBuAoIB

- Aimless stalling lullaby
  http://localhost:5174/#p=AKoBAnYAxAEBjAEACAAEAAYNLBisAQPiEAAKDsSJAQCAAwCABQB4CMgBAbgBFgEBJinyAQE8CEgAZAS6BQmqBwMGAwQByAEDZh8WAQIBVANiCQhYoAEQ6MABAJh_
