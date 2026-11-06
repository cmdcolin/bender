# bender

A circuit bender in the browser, built on Web Audio's
[AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet).

![The whole app: keyboards, a drum box and pedals on the bench, the header and the signal path map.](public/guide/guide-app.jpg)

- [App](https://cmdcolin.github.io/bender/app/)
- [Pocket](https://cmdcolin.github.io/bender/pocket/), for phones
- [Home](https://cmdcolin.github.io/bender/), with your saved voices
- [Blog](https://cmdcolin.github.io/bender/blog/)
- [Jam of the day](https://cmdcolin.github.io/bender/jam/)

Watch Claude Code play it:
[Letting an AI agent drive bender](https://cmdcolin.github.io/bender/blog/agent-drives-the-app/)

Bold names are the app's own.

## Machines

Every machine is modelled down to its chips and buses, so a bend is a real
hardware fault: a paperclip on the clock pin, a solder blob on a bus wire, a pot
soldered onto the die.

- **Plinky** — a toy keyboard's square-wave chip, with ROM tunes and auto bass
  chords
- **Clatter** — a drum box whose step rows each run their own length
- **Glint** — a four-voice FM chip that plays along with Plinky
- **Parlor** — an eight-bit sampling keyboard of pads, strings, choirs and bells
- **Prattle** — a talking toy's speech chip that says what you type
- **Growler** — a Model D-style monosynth that plays Plinky's tune as a bassline
- **Howler** — a second Growler voiced as a lead, with its own melody

## Other sources

- **Sheet** — a struck steel sheet that rattles on the floor or swings from a
  corner
- **Bottle** — a glass bottle you tap and fill with water
- **Chaos osc** — two cross-modulated oscillators that motorboat on their own
- **Mic** — a live mic you can patch into a clock pin, a bus or Prattle's mouth

## Pedals

- **Gnash** — a distortion pedal, one circuit per mode: screamer, rat, muff and
  more
- **Wraith** — a three-head tape echo on a spliced five-second loop
- **Ricochet** — a delay that can play backwards or beat-repeat
- **Boing** — a spring reverb you can kick
- **Chorale** — a bucket-brigade chorus, ensemble and flanger
- **Ember** — a tube amp and speaker whose tone knobs load each other as in the
  real circuit

Ten more, among them **Ring mod**, **Crusher**, **Comb**, **Octave** and
**Codec**.

## Tape and samples

- **Spool** — a tape loop that plays a sample and records the board over it
- **Layercake** — a cassette four-track: four loops of different lengths behind
  a mixing desk
- Samples — any audio file, or 78s, numbers stations, NASA comms and old-time
  radio off archive.org

## Playing

- Sequencer — a piano roll and drum steps
- Patch bay — four wires modulating 183 destinations, each other included
- MIDI — plays the keys and turns the knobs
- Share — a link holds the whole board
- Presets — 190 boards, plus random, morph, hunt and drift
- Agent — Claude Code plays it
  ([blog post](https://cmdcolin.github.io/bender/blog/agent-drives-the-app/))

## Run

```sh
pnpm install
pnpm dev
```

Then open http://localhost:4321/bender/app/.

## Docs

- [User guide](docs/USER-GUIDE.md)
- [Features](docs/features.md) — every control
- [Bends](docs/BENDS.md)
- [How it works](docs/HOW-IT-WORKS.md)
- [MIDI](docs/MIDI.md)
- [AI usage](docs/AI-USAGE.md)
- [Development](docs/DEVELOPMENT.md)

## Credits

Started from a Claude Fable template and extensively vibecoded. See also
[videoskillet.com](https://videoskillet.com).
