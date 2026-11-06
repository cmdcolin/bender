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

## Machines

- **Plinky** — a toy keyboard
- **Clatter** — a drum machine
- **Glint** — an FM synth
- **Parlor** — a sampling keyboard
- **Prattle** — a speech chip that says what you type
- **Growler** — a bass synth
- **Howler** — a lead synth

## Other sources

- **Sheet** — a steel sheet you hit
- **Bottle** — a glass bottle you tap
- **Chaos osc** — an oscillator that runs wild on its own
- **Mic** — your microphone

## Pedals

- **Gnash** — distortion
- **Wraith** — tape echo
- **Ricochet** — delay
- **Boing** — spring reverb
- **Chorale** — chorus
- **Ember** — tube amp

Also **Ring mod**, **Crusher**, **Comb**, **Octave**, **Codec** and others.

## Tape and samples

- **Spool** — a tape loop you can record onto
- **Layercake** — a cassette four-track
- Samples — any audio file, or old records and radio from archive.org

## Playing

- Sequencer — a piano roll and drum steps
- Patch bay — wire modulation onto the controls
- MIDI — plug in a controller
- Share — a link holds the whole board
- Presets — boards to start from
- Agent — Claude Code plays it
  ([blog post](https://cmdcolin.github.io/bender/blog/agent-drives-the-app/))

## Gallery

Each picture opens its board in the app.

### Signal path

<a href="https://cmdcolin.github.io/bender/app/#p=UHhdZPoBeKYByAE&v=3"><img src="docs/readme/signal-path.jpg" alt="The whole app, with a zoom of the signal path map: power supply, the machines, mix bus, pedals and output." width="100%"></a>

Every sound runs through one signal path, drawn at the top right. Click a box on
it to open that part.

### Instruments

<table>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/"><img src="docs/readme/plinky.jpg" alt="The app with Plinky open; a zoom shows its chip from keyboard to output pin." width="100%"></a><br><b>Plinky</b> — keys to output pin</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/"><img src="docs/readme/clatter.jpg" alt="The app with Clatter open; a zoom shows its drum voices, from triggers to DAC." width="100%"></a><br><b>Clatter</b> — the drum voices</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=UHg&v=3"><img src="docs/readme/glint.jpg" alt="The app with Glint open; a zoom shows its path from key through modulator and carrier." width="100%"></a><br><b>Glint</b> — the FM signal path</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=mgN4&v=3"><img src="docs/readme/parlor.jpg" alt="The app with Parlor open; a zoom shows its counter stepping through the sample ROM." width="100%"></a><br><b>Parlor</b> — sample playback</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=qQN4&v=3"><img src="docs/readme/growler.jpg" alt="The app with Growler open; a zoom shows its voice card of oscillators, mixer, filter and loudness." width="100%"></a><br><b>Growler</b> — the voice card</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=igSMAQ&v=3"><img src="docs/readme/layercake.jpg" alt="The app with Layercake open; a zoom shows one track's channel strip." width="100%"></a><br><b>Layercake</b> — one track's channel strip</td></tr>
</table>

### Pedals

<table>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=rgFk&v=3"><img src="docs/readme/wraith.jpg" alt="The app with Wraith open; a zoom shows its tape loop, heads and feedback." width="100%"></a><br><b>Wraith</b> — the tape loop and heads</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=0ATIAQ&v=3"><img src="docs/readme/ember.jpg" alt="The app with Ember open; a zoom shows preamp, tone stack, power amp and speaker with their curves." width="100%"></a><br><b>Ember</b> — the amp and its tone curves</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=igFk&v=3"><img src="docs/readme/clipper.jpg" alt="The app with Clipper open; a zoom shows the LM386 amp with its coupling cap and speaker." width="100%"></a><br><b>Clipper</b> — the LM386 amp</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=4gFk&v=3"><img src="docs/readme/tape-machine.jpg" alt="The app with the tape machine open; a zoom shows its record and replay heads." width="100%"></a><br><b>Tape machine</b> — record and replay heads</td></tr>
</table>

### Chips

<table>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/"><img src="docs/readme/plinky-bus.jpg" alt="The app with Plinky's bus open; a zoom shows song select, counter, ROM, note table and divider wired by their lines." width="100%"></a><br><b>Plinky</b> — the tune ROM's bus</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=UHg&v=3"><img src="docs/readme/glint-die.jpg" alt="The app with Glint's die open; a zoom shows its allocator, registers and voices." width="100%"></a><br><b>Glint</b> — the die</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=mgN4&v=3"><img src="docs/readme/parlor-bus.jpg" alt="The app with Parlor's bus open; a zoom shows the counter, sample ROM and DAC." width="100%"></a><br><b>Parlor</b> — the sample ROM's bus</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=qQN4&v=3"><img src="docs/readme/growler-memory.jpg" alt="The app with Growler open; a zoom shows its counter, RAM and voice on the memory bus." width="100%"></a><br><b>Growler</b> — the sequence memory</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=vQh4&v=3"><img src="docs/readme/prattle-bus.jpg" alt="The app with Prattle's bus open; a zoom shows its frame ROM, coefficient ROM and lattice." width="100%"></a><br><b>Prattle</b> — the speech ROMs</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=hAFk&v=3"><img src="docs/readme/crusher-bus.jpg" alt="The app with Crusher open; a zoom shows its converter and DAC on the data bus." width="100%"></a><br><b>Crusher</b> — the converter's bus</td></tr>
</table>

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
