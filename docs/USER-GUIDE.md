# User guide

## Play

![Plinky: the deck with REC, HOLD and the octave switches above three octaves of keys, letters printed on the sixteen keys under a typing hand.](img/guide-keyboard.jpg)

- Play the on-screen keys, the letter keys, or a MIDI controller. See
  [MIDI](MIDI.md).
- Remap the computer keys from ☰ → **computer keys**.
- **Hold** latches keys; alt-click pins one.
- **Rec** writes what you play into a 32-step melody memory with a piano roll.
- **Arpeggio**, **auto bass-chord** and **key lock** (major, minor, dorian,
  blues and more).
- **Kit sync** makes the tune count off the drum machine's tempo.

## Drum machine

![The toy drum machine's pad deck: eight numbered rubber pads, kick through cymbal, under the play and REC switches and a small copy of the drum pattern.](img/guide-drums.jpg)

- Sixteen steps, eight voices, ten factory patterns.
- **Tap** tempo, **Swing**, per-row lengths for polymeter.
- Dice steps fire at **Chance**.
- **Roll**, **Vary**, **Turnaround**, **Shift**, **Half**/**Double** rewrite the
  grid.
- Play it live on the pads or the number keys, and **Rec** hits in.
- **Kit** switches to a sampled version of itself; **ROM clock** pitches it
  down.
- Dozens of circuit bends. See [Bends](BENDS.md).

## More instruments

![Glint's keybed: a green circuit board with TOY GATE and HOLD switches, an octave switch, and rows of push-button keys.](img/guide-fm.jpg)

- **Glint:** eight-voice FM chip with a knife on its patch tables.
- **Parlor:** eight-bit sampler with pads, strings, choirs, and a **sampled**
  voice that plays your tape loop.
- **Growler:** three-oscillator monosynth with a ladder filter that
  self-oscillates.
- **Four-track:** four tape loops with EQ, a no-input mixer and a squeal through
  the echo.
- **Add instrument** and **Add pedal** put more faces on the bench.
- A second melody memory plays Growler, Glint or Parlor.

## The trigger patch

![The trigger patch diagram: Clatter, Plinky and Glint as three boxes, with the wires kit → keys, keys → kit, gate and kit → FM between them.](img/guide-trigger.jpg)

- **Kit fires keys:** a drum hit plays the keyboard.
- **Keys fire kit:** a note fires a drum voice.
- Both together make the machines play each other.
- **Kit voice that plays this chip** turns a drum pattern into a riff.

## Bend

- **Bend keys** turn the letter keys into sixteen dealt bends; hold to push,
  release to spring back.
- Six hand-picked throws: **spin**, **dive**, **brake**, **crash**, **drop**,
  **crush**.
- Dealer modes: **tame**, **wild**, **wreck**, **swell**.
- The kit's **bend** row fires bend keys as a sequence.
- **+ mod** solders an LFO wire onto any control.

![The patch bay: three of four LFO wires patched (LFO to toy level, envelope to FM level, drum hit to comb pitch), each with a depth slider and a + mod button.](img/guide-patchbay.jpg)

## Presets and rolls

- Click a preset to load a board; drag it sideways to morph partway.
- **Random**, **mutate**, **wreck it**, **slam**, **on the edge**, **dub**.
- **Hunt** tries six boards and keeps the loudest that doesn't bury the limiter.
- **Drift** wanders to new settings forever; **⟲ 10s** goes back.
- 18 demo songs, plus your own melody as the 19th.

## Record

- **Record wav** captures the output; **⟲ last 30s** saves what you just played.
- **Master + stems** adds one wav per source.
- **Varispeed** gives tape stops and spin-ups.

## Phone

- [`/pocket/`](https://cmdcolin.github.io/bender/pocket/) is a one-hand version:
  swipe presets, drag to bend, tilt to bend.

## Share and save

- The link carries the whole board, with no server.
- Edit a board by hand in the address: `#set=chipStarve:0.8,dlyFb:0.6`
- Sign in with Google to save named voices across machines. Everything else
  works signed out.

![The saved popover, signed out: "Sign in to keep voices under a name — they live on your Google account, so they follow you to another machine. Everything else here works signed out," with a "sign in with Google" button.](img/guide-saved.jpg)
