# bender

A circuit bender in the browser, built on Web Audio's
[AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet).

- [App](https://cmdcolin.github.io/bender/app/)
- [Pocket](https://cmdcolin.github.io/bender/pocket/), for phones
- [Home](https://cmdcolin.github.io/bender/), with the blog and saved voices
- [Jam of the day](https://cmdcolin.github.io/bender/jam/)

## Features

- Bend a toy keyboard, drum machine, FM synth and mono synth
- Pedals, tape loops, a varispeed deck and a cassette four-track
- Sequencer, patch bay, MIDI and shareable URLs

See [features.md](docs/features.md) for every control, and
[Letting an AI agent drive bender](https://cmdcolin.github.io/bender/blog/agent-drives-the-app/)
to watch Claude Code play it.

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
