# User guide

## Play

![Plinky's deck: a voltage lamp, play, REC and HOLD switches, an octave switch, a speaker grille and a volume slider above two octaves of keys with letters printed on them.](img/guide-keyboard.jpg)

- **Models:** a toy keyboard chip. One RC oscillator clocks a divider, a ROM of
  tunes and the envelopes, on a battery that sags
- Keys, letters or [MIDI](MIDI.md)
- Record a melody onto a piano roll
- Arpeggiator, auto bass-chord, key lock

## Drum machine

![Clatter's deck: a record light, play and REC switches and a volume slider above a sixteen-step pattern strip and eight numbered pads, kick through cymbal.](img/guide-drums.jpg)

- **Models:** a toy drum box. A step counter reads a pattern memory and fires
  analog voices: one-shots, resonant tanks, a bank of metal oscillators and
  noise
- Eight voices, sixteen steps, polymeter, dice steps
- Pads, tap tempo, record hits live
- A sampled kit made from itself
- Dozens of [bends](BENDS.md)

## More instruments

![Glint's keybed: a green circuit board with a waveform mark and "2-op" in the header, REC and HOLD switches, an octave switch, a volume slider and two octaves of keys.](img/guide-fm.jpg)

- **Glint:** a two-operator, four-voice FM chip. A processor sets it up a byte
  at a time over a bus, so a wrong byte stays wrong until the processor writes
  that register again
- **Parlor:** an eight-bit sampling home keyboard. A ROM holds one short
  recording per voice, and a counter walks it at the rate each note asks for
- **Growler:** a Model D-style monosynth card: three oscillators with hard sync
  into a four-pole transistor ladder filter that self-oscillates
- **Four-track:** a cassette four-track. Four tape loops of different lengths
  run behind a desk with EQ and an aux send, and the desk can squeal with
  nothing plugged in
- **Spool:** a tape loop. Drop an audio file on the page and it loops through
  the board on a capstan the patch bay can drag
- **Mic:** a live microphone, soldered to the mix or to a supply rail, an FM
  pin, a delay or a trigger line

## The trigger patch

![The trigger patch diagram: Clatter and Plinky as two boxes with "kit plays keys" and "keys play kit" wires between them, and Glint, Parlor and Growler below with "kit hits" and "keyboard notes" wires running in.](img/guide-trigger.jpg)

- **Models:** jumper wires between boards. Plinky's gate line and Clatter's
  trigger lines are bare traces, and a jumper bridges one onto another machine's
  key input
- Drum hits play the keys, and keys fire the drums
- Glint, Parlor and Growler each take Plinky's notes through a jumper, and the
  kit's hits through a trigger bridge

## Power supply

- **Models:** one battery rail. Plinky, Clatter, Glint, Parlor and Growler run
  off it, so a sag drops the pitch of all five and slows the kit
- **Starve** drags the rail down
- **Clip chatter** is a paperclip dragged across the pads
- The reset chip reboots the chips at a voltage you set, or jams one

## Bend

- Letter keys become sixteen dealt bends
- Six throws: spin, dive, brake, crash, drop, crush
- **Knife on the bus:** cut, ground or bridge a data or address wire on the toy,
  the kit or Glint. Named cuts such as **machine-gun** set the wire for you

![The patch bay: three of four wires patched (LFO to toy level, envelope to FM level, drum hit to comb pitch), each with a depth slider and a + mod button.](img/guide-patchbay.jpg)

- **Models:** a patch bay. Four wires run from a source to any control
- **+ mod** wires an LFO to any control

## Bends and pedals

- **Bends:** seven stages for six slots, in an order you pick. Ring mod,
  crusher, clipper, comb, screech filter, glitch buffer and frequency shifter
- **Gnash:** six dirt-box circuits: screamer, rat, muff, germanium, octave, gate
- **Wraith:** a tape echo. A motor-driven capstan pulls a five-second loop past
  three play heads
- **Ricochet:** a delay pedal with a clean mode, a bucket-brigade mode, reverse
  and hold
- **Boing:** a spring reverb tank that crashes when you kick it
- **Chorale:** a bucket-brigade chorus, string ensemble, dimension and vibrato
- **Ember:** a tube amp with Fender and Marshall tone stacks, a push-pull power
  stage that sags, and a speaker

## Feedback and tape

- **Feedback bus:** the output fed back in, as a mixer with nothing plugged in
  squeals. Pick where the return lands
- **Tape machine:** the whole board printed to open reel, cassette or
  microcassette, with Dolby B or dbx, wow, flutter and shed oxide
- **Brownout:** the mains failing, with sag, dropouts, crackle and hum
- **Varispeed:** slows the whole board, tempo and pitch together, as the motor
  of a deck winds down

## Presets

- Click to load, drag to morph
- Random rolls, **wreck it**, **dub**
- **Drift** wanders on its own

## Record

- Wav export with stems
- Tape-stop varispeed

## Phone

- [`/pocket/`](https://cmdcolin.github.io/bender/pocket/): swipe, drag and tilt
  to bend

## Share

- The link is the whole board
- Sign in to save named voices
