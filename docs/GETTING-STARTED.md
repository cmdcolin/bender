# Getting started

bender is a virtual toy keyboard and drum machine that runs on a modelled power
supply. Turn a knob and you're not adjusting a "glitch" parameter — you're
starving the rail, cutting a bus wire, or dragging a paperclip across a pad, and
the reboots, pitch dives and screams fall out of the same mechanisms that make a
real cheap toy do that.

It runs in the browser, on one AudioWorklet. There's nothing to install.

**[Open the app →](https://cmdcolin.github.io/bender/)**

## Things to try

- **Play it.** Click the on-screen keys, or use your keyboard — the letter keys
  are labelled on the keys themselves. Drag across the board to play a run, and
  `z`/`x` shift the whole thing two octaves.
- **Click a preset**, or hit **random** in the dice row. Drag a preset sideways
  instead and it only morphs part of the way there.
- **Turn Starve up** while a chord is playing. The rail sags, the pitch dives,
  and past a point the watchdog reboots the chip mid-tune.
- **Click a box on the signal path map** at the top of the panel. Every control
  on the instrument is one click from there.
- **Hit Share.** The whole board lives in the URL, so a link is a patch you can
  send someone.

## Where next

- [User guide](USER-GUIDE.md) — the keyboard, the drum machine, the FM chip,
  presets and rolls
- [Bends](BENDS.md) — what each fault actually does to the circuit, and why
- [How it works](HOW-IT-WORKS.md) — the signal path map and the app's own
  architecture
- [Features](features.md) — every control, generated from the app's own tables
- [MIDI](MIDI.md) — setting up a controller
