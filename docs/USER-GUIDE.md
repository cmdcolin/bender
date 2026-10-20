# User guide

Open the app and press keys. Everything else is something to try.

- **Play:** click the keys, or type. Letters are printed on them
- **Click a preset**, or hit **random**
- **Click a box on the map** to open its knobs
- **Turn Starve up** under Power supply while a chord rings
- **Hit share.** The link is the whole board

Each machine's panel opens on a drawing of its circuit. Press a box in a drawing
to open that part's controls.

## Plinky

![Plinky's deck: a voltage lamp, play, REC and HOLD switches, an octave switch, a speaker grille and a volume slider above two octaves of keys with letters printed on them.](../public/guide/guide-keyboard.jpg)

A toy keyboard chip on a battery that sags. One RC oscillator clocks a divider,
a ROM of tunes and the envelopes. Record a melody, hold a chord, turn on the
arpeggiator.

![Plinky's chip drawing: the keyboard feeds a key matrix into the voices, the tune ROM feeds the voices over a bus, and the voices run through the envelope to the output pin. The clock box stands apart.](../public/guide/guide-die.jpg)

## Clatter

![Clatter's deck: a record light, play and REC switches and a volume slider above a sixteen-step pattern strip and eight numbered pads, kick through cymbal.](../public/guide/guide-drums.jpg)

A toy drum box. A step counter reads a pattern memory and fires analog voices.
Tap pads, tap the tempo, or draw steps in the strip.

![Clatter's voice drawing: the pads and the pattern fire the triggers, which feed the one-shots, tanks, metal bank and noise, then the amps and the DAC. A sample ROM also feeds the DAC.](../public/guide/guide-drum-voices.jpg)

## More machines

Add them from the **Add instrument** menu.

### Glint

![Glint's keybed: a green circuit board with a waveform mark and "2-op" in the header, REC and HOLD switches, an octave switch, a volume slider and two octaves of keys.](../public/guide/guide-fm.jpg)

A two-operator, four-voice FM chip. A processor sets it up a byte at a time over
a bus, so a wrong byte stays wrong until the processor writes that register
again.

![Glint's drawing: the key feeds a processor, then a bus, a modulator, a carrier and the output, with clocks above the modulator and carrier and the die below them.](../public/guide/guide-glint-path.jpg)

### Parlor

![Parlor's keybed: a grey case with a voltage lamp, REC and HOLD switches, an octave switch, a volume slider and two octaves of keys.](../public/guide/guide-parlor.jpg)

An eight-bit sampling home keyboard. A ROM holds one short recording per voice,
and a counter walks it at the rate each note asks for.

![Parlor's drawing: keys, counter, ROM, envelope, tone and mix in a row, with vibrato above the counter and the address and data buses under the counter and the ROM.](../public/guide/guide-parlor-path.jpg)

### Growler

![Growler's keybed: a dark case with wooden end cheeks, REC and HOLD switches, an octave switch, a volume slider and two octaves of keys.](../public/guide/guide-growler.jpg)

A Model D-style monosynth card. Three oscillators with hard sync feed a
four-pole transistor ladder filter that self-oscillates.

![Growler's voice card drawing: keys into three oscillators with sync and FM, a mixer with noise and a feedback line from the output, the filter, the loudness stage, modulation back to the oscillators and filter, and the voice card under the loudness stage.](../public/guide/guide-growler-card.jpg)

### Four-track

![The four-track desk: four channel strips of trim, aux, EQ, pan and fader controls above four tape lanes, with speed, side and noise-reduction switches underneath.](../public/guide/guide-fourtrack.jpg)

A cassette four-track. Four tape loops of different lengths run behind a desk
with EQ and an aux send, and the desk squeals with nothing plugged in.

### Also on the bench

- **Spool:** a tape loop. Drop an audio file on the page
- **Mic:** your microphone, soldered into the board

## The trigger patch

![The trigger patch diagram: Clatter and Plinky as two boxes with "kit plays keys" and "keys play kit" wires between them, and Glint, Parlor and Growler below with "kit hits" and "keyboard notes" wires running in.](../public/guide/guide-trigger.jpg)

Jumper wires between machines: Plinky's gate line and Clatter's trigger lines
are bare traces, and a jumper bridges one onto another machine's key input. Drum
hits play the keys, keys fire the drums, and the FM chip, Parlor and Growler
listen to both.

## Power supply

![The power supply drawing: the cells feed a rail running out to the machines, with a reset chip and a clip on the rail.](../public/guide/guide-power.jpg)

One battery rail runs Plinky, Clatter, Glint, Parlor and Growler, so a sag drops
the pitch of all five and slows the kit. A reset chip reboots the chips at a
voltage you set, or jams one.

## Bend it

- **Starve** drags the shared battery rail down
- **Clip chatter** drags a paperclip across the pads
- **Letter keys** switch on sixteen dealt bends
- **Knife on the bus** cuts, grounds or bridges a wire inside a chip
- **Pedals:** add tape echo, spring reverb, chorus, a tube amp or dirt boxes
  from the **Add pedal** menu

![The patch bay: three of four wires patched (LFO to toy level, envelope to FM level, drum hit to comb pitch), each with a depth slider and a + mod button.](../public/guide/guide-patchbay.jpg)

**+ mod** wires an LFO to any control. The patch bay holds four wires from a
source to a knob.

## Pedals and tape

- **Gnash:** six dirt-box circuits: screamer, rat, muff, germanium, octave, gate
- **Wraith:** a tape echo. A motor-driven capstan pulls a five-second loop past
  three play heads
- **Ricochet:** a delay pedal with a clean mode, a bucket-brigade mode, reverse
  and hold
- **Boing:** a spring reverb tank that crashes when you kick it
- **Chorale:** a bucket-brigade chorus, string ensemble, dimension and vibrato
- **Ember:** a tube amp with Fender and Marshall tone stacks, a push-pull power
  stage that sags, and a speaker
- **Feedback bus:** the output fed back in, as a mixer with nothing plugged in
  squeals
- **Tape machine:** the whole board printed to open reel, cassette or
  microcassette, with Dolby B or dbx, wow, flutter and shed oxide
- **Brownout:** the mains failing, with sag, dropouts, crackle and hum
- **Varispeed:** slows the whole board, tempo and pitch together, as the motor
  of a deck winds down

## Keep it

- **Wav export** with stems
- **Share** copies a link to the board
- **Sign in** to save named voices
- **On a phone,** the simple version swipes and tilts to bend
