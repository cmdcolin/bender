# bender

A circuit bender in the browser, built on Web Audio's
[AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet).

- [App](https://cmdcolin.github.io/bender/app/)
- [Pocket](https://cmdcolin.github.io/bender/pocket/), for phones
- [Home](https://cmdcolin.github.io/bender/), with your saved voices
- [Blog](https://cmdcolin.github.io/bender/blog/)
- [Jam of the day](https://cmdcolin.github.io/bender/jam/)

Watch Claude Code play it:
[Letting an AI agent drive bender](https://cmdcolin.github.io/bender/blog/agent-drives-the-app/)

## Machines

Each machine is modelled down to its chips, buses and power rail, so every bend
is a real hardware fault.

- Plinky — a toy keyboard chip on a battery
- Clatter — a toy drum box with a sample ROM
- Glint — a two-operator FM chip
- Parlor — an eight-bit sampling keyboard
- Growler — a Model D-style monosynth
- Howler — Growler's card voiced as a lead

## Effects and tape

- Pedals — delay, reverb, distortion, chorus and a tube amp
- Spool — a tape loop that records over itself
- Four-track — a cassette desk with four tape loops

## Playing

- Sequencer — a piano roll and drum steps
- Patch bay — LFOs and other modulation on any control
- MIDI — plays the keys and turns the knobs
- Share — a link holds the whole board

Every control: [features.md](docs/features.md)

## Run

```sh
pnpm install
pnpm dev
```

## Docs

- [User guide](docs/USER-GUIDE.md)
- [Bends](docs/BENDS.md)
- [How it works](docs/HOW-IT-WORKS.md)
- [MIDI](docs/MIDI.md)
- [AI usage](docs/AI-USAGE.md)
- [Development](docs/DEVELOPMENT.md)

## Credits

Started from a Claude Fable template and extensively vibecoded. Follows
[ntsc.js](https://github.com/cmdcolin/ntsc.js).
