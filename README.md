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

Each picture opens that part in the app.

<table>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=UHgzZKQCeA&v=3"><img src="public/guide/guide-map.jpg" alt="The signal path map: power supply, the machines, mix bus, a pedal and output." width="100%"></a><br>The signal path; click a box to open it</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/"><img src="public/guide/guide-die.jpg" alt="Plinky's chip: keyboard, key matrix, tune ROM, bus, voices, envelope, output pin and clock." width="100%"></a><br><b>Plinky</b>'s chip, keys to output pin</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/"><img src="public/guide/guide-drum-voices.jpg" alt="Clatter's drum voices: triggers, one-shots, tanks, metal bank, noise, amps, DAC and sample ROM." width="100%"></a><br><b>Clatter</b>'s drum voices</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=UHg&v=3"><img src="public/guide/guide-glint-path.jpg" alt="Glint's chip: key, processor, bus, modulator, carrier and output." width="100%"></a><br><b>Glint</b>'s FM chip</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=mgN4&v=3"><img src="public/guide/guide-parlor-path.jpg" alt="Parlor's chip: keys, counter, ROM, envelope, tone and mix, with its address and data buses." width="100%"></a><br><b>Parlor</b>'s sample ROM and buses</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=qQN4&v=3"><img src="public/guide/guide-growler-card.jpg" alt="Growler's voice card: three oscillators, mixer, filter and loudness, with feedback paths." width="100%"></a><br><b>Growler</b>'s voice card</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=rgFk&v=3"><img src="public/guide/guide-wraith-path.jpg" alt="Wraith's tape loop: send, record and play heads, feedback and tone." width="100%"></a><br><b>Wraith</b>'s tape loop and heads</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=0ATIAQ&v=3"><img src="public/guide/guide-ember-path.jpg" alt="Ember's path: preamp, tone stack, power amp and speaker, with the tone stack's and speaker's curves." width="100%"></a><br><b>Ember</b>'s amp and tone curves</td></tr>
<tr><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=bsgBBvQDAPgK&v=3"><img src="public/guide/guide-spool.jpg" alt="Spool's deck: load, rec, undo and the reel with its loop markers." width="100%"></a><br><b>Spool</b>'s deck</td><td width="50%" valign="top"><a href="https://cmdcolin.github.io/bender/app/#p=igR4&v=3"><img src="public/guide/guide-fourtrack.jpg" alt="Layercake's desk: four channel strips above four tape loops." width="100%"></a><br><b>Layercake</b>'s desk</td></tr>
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
