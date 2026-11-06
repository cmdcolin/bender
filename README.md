# bender

A circuit bender in the browser, built on Web Audio's
[AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet).

- [App](https://cmdcolin.github.io/bender/app/)
- [Pocket](https://cmdcolin.github.io/bender/pocket/), laid out for phones
- [Home page](https://cmdcolin.github.io/bender/), with the blog and your saved
  voices
- [Jam of the day](https://cmdcolin.github.io/bender/jam/), recordings made in
  bender

## Features

- Bend a toy keyboard, a drum machine, an FM synth and a ladder-filter mono
  synth
- A 12-bit ROM mode that lets the kit sample itself
- Pedals: tape delay, reverb, distortion, ensemble and tube amp
- Tape: a re-recording loop, a varispeed deck, a tape machine and a cassette
  four-track
- Piano roll and drum sequencer
- Patch bay with LFOs and other modulation
- MIDI controllers, tap tempo, randomize buttons and shareable URLs

Click a box in the signal path diagram to open its settings. Every control is in
[docs/features.md](docs/features.md).

To watch Claude Code play it, see
[Letting an AI agent drive bender](https://cmdcolin.github.io/bender/blog/agent-drives-the-app/).

## Run

```sh
pnpm install
pnpm dev
```

## Docs

- [User guide](docs/USER-GUIDE.md) — the machines, the trigger patch and bends
- [Bends](docs/BENDS.md) — what each fault does to the circuit, and why
- [How it works](docs/HOW-IT-WORKS.md) — the signal path map and architecture
- [MIDI](docs/MIDI.md) — setting up a controller
- [AI usage](docs/AI-USAGE.md) — scripting bender through `window.bender`
- [Development](docs/DEVELOPMENT.md) — testing, benchmarking, releases
- [Data flow](docs/dataflow.md) — how a block renders across the two threads
- [Optimizations](docs/optimizations.md) — fitting inside an audio callback

## Credits

Started from a Claude Fable template and extensively vibecoded. Follows in the
footsteps of [ntsc.js](https://github.com/cmdcolin/ntsc.js).
