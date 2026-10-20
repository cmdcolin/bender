# Bends

Every bend models a real hardware fault, and none is a sample. The toy's chip
runs off one RC oscillator, and a divider splits that clock three ways into
pitch, tempo and envelopes, so a bend on the clock changes all three at once.

## Where the buses run

<img src="img/buses.svg" alt="the address, data and wave buses on each chip" width="620">

Several chips have a **Data line** control that means something different on
each, so the drawing shows which two blocks every bus runs between and how wide
it is. [buses.dot](img/buses.dot) is the source.

A knife on a bus sounds different on each side of the memory. An address bus
runs into the memory, so a knife there fetches the wrong thing and the chip then
plays it perfectly, with the tempo unchanged. A data bus carries the answer
back, so a knife there mangles a fetch that was correct. That is why the two
controls on one chip sound nothing alike.

Glint is the exception: both of its buses run the same way, into the register
file, because the processor writes the register file. A register holds the last
value written to it, so a fault there accumulates, and a byte that is written
wrong stays wrong until the processor writes that register again.

One wire is one voice on the drum data bus, in the order of the rows, and one
wire is one bit of the sample word on Parlor's, so a wire number means something
fixed on those two buses. A toy-chip data line carries a note code and an FM
data line carries whichever byte the processor was sending, so on those you find
a useful wire by trying them. The named cuts under _knife on the bus_ are
shortcuts, each a wire and a fault already found worth keeping.

The panel draws the same buses under each chip's bus box (the **pattern** box on
the drum machine), one trace a bit with the lowest on top. The knife rows, named
cuts and drawing show only while the box is open, and a board that arrives
knifed opens it. The box's wire turns red while a wire is cut. The drawing
follows the rows:

- The knifed trace turns red and shows its line name.
- A slash marks a cut, dotted across the gap while **Cut depth** leaves it
  conducting. A ground symbol or a +V bar marks a short to a rail, and a blob of
  solder joins a bridged pair.
- The drawing adds a wire for the toy's loop wire, the drum kit's counter reset,
  the kit's clock and Glint's strobe, and turns each one red once its knob is
  up.
- **Toy on bus** draws the toy's output soldered across Glint's lowest data
  lines, with a dot on each line it reaches.

## The shared power rail

The Power supply panel draws the rail as one wire from the cells to the
machines, with the reset chip watching it and the clip touching it. The cells
box opens first and holds starve, batteries, lead resistance and reservoir; the
reset chip box and the clip box each open a set of rows.

**Starve** sags the supply the toy keyboard, the drum machine, and the FM chip
all share. Starve is a resistor to ground, so it keeps drawing current even
after the chip has gone quiet. A quarter of the way up the knob, the toy runs
flat and dives; at three-quarters, it reboots several times a second. Past a
threshold the watchdog trips and resets the chip, restarting the tune from
wherever it was. Reboots come at irregular intervals, because the watchdog's
trip point drifts with heat and the reset line holds for between 40 and 130 ms,
long enough for the rail to move. The lamp above the keys displays the rail
voltage, 4.5 V on fresh cells, and **reboot** whenever the watchdog fires.

**Reservoir** is how much capacitance sits behind the supply, and it sets
whether a starve takes effect at once or sweeps. Stock, the rail follows its
load in under a millisecond, so a dive is instant. With Reservoir wound up, the
same starve sweeps: the pitch leaves from where it was, decelerates as the cap
and the pot reach balance, and settles at the bottom, taking tempo and envelopes
down with it because they share the rail. The travel is geometric from 17 ms to
two seconds, so the sweep spreads across the whole knob.

**Clip chatter** is a paperclip dragged across the supply pads by hand, which
chokes the rail without shorting it. The rail dips and recovers at the rate
Reservoir allows, a few tens of milliseconds at a time. The dips come in
clusters at irregular intervals, as a hand's timing does.

**Clip on clock** is the paperclip placed on the oscillator pin instead of the
supply. Starve alone lowers the pitch by at most about two-thirds of an octave
before the chip stops running; the clock has no such ceiling, so Clip on clock
reaches four octaves at the top of the knob and takes the whole timebase (pitch,
tempo, envelopes) down with it. The pitch leaves its normal value slowly,
because the paperclip charges a found capacitor through the contact, and returns
instantly, because lifting the clip removes that capacitor from the circuit.
Clip on clock works because the oscillator pin is the one high-impedance node on
an otherwise low-impedance board, and it needs a toy clocked from a bare RC
oscillator, as the cheap ones were, instead of a resonator.

**Latch-up** is the brownout that doesn't reboot. On a collapsing rail, CMOS can
jam instead of resetting: the die holds whatever note was sounding and keeps
drawing current while the output stage sits frozen, so one note screams and
dives for up to a second until the current collapses and the watchdog
power-cycles the chip. Latch-up happens more readily to a toy that has been
running a while and heated up than to one just switched on.

**Crystal drift** lets the toy's own clock wander off the ratio you set against
the drum machine. The two clocks never lock, so they drift out of alignment,
swing back close to it, and drift apart again for as long as the toy runs.

**Kit sync** and **Arp sync** derive the tune's and the arpeggio's rates from
the kit's beat, and every bend in this section still drags them. Arp sync on
sixty-fourths is a trill at 120 bpm; a clock pot turned up on it climbs into a
buzz pitched at the strike rate, as high as 800 Hz.

**Junk in the counter** happens when the rail recovers from a brownout. Pressing
play always starts the tune at step zero; a reboot doesn't, because the program
counter comes back holding whatever was in its latch when the rail failed, so
the tune as often resumes from the middle of itself as from the top.

**Batteries** and **Lead resistance** both model a degraded supply, in different
ways. Batteries sets how flat the cells are, and flat cells have a lower resting
voltage and more internal resistance, so the rail never fully recovers between
notes and the whole toy runs low and late: pitch, tempo and every envelope on
that divider stretch out together. Lead resistance is a resistor in series with
the cells that matters only under load. With nothing drawing current it drops no
voltage, so the rail rests where a stock board's would at any knob position.
Playing a note draws current, so the supply sags on the attack and climbs back
between hits. Batteries makes a toy that is running out; Lead resistance makes a
toy that whoops on every note and never runs low.

**Bend spot + pot** solders a virtual potentiometer straight onto the die, at
one of four points: the clock, the counter (which scrambles the melody), the DAC
bias, or the gate line.

The keyboard's four voices each have a separate output stage on this rail, so a
starved chord collapses raggedly instead of all at once. See **Part spread**
under [the parts rack](#the-parts-rack) below.

## The toy chip's pins

The Plinky panel is one drawing of the parts these bends reach. The keyboard box
at its top left opens first and holds the playing rows: tune, level, tone,
accompaniment, arpeggio and key lock. The key matrix and the tune ROM strike the
voices, each voice's envelope sets its level, and the output pin carries every
voice off the chip. A small _clk_ tag marks each part the clock reaches;
pressing a tag opens the clock, and the tags brighten while it is open. The
envelope's tag reads _PWM_ and the output pin's reads _scan_ while those bends
are on, and crosstalk draws a red wire from the output up to the clock. A bend
turns its part or wire red, and the drawing hangs the **Bend spot** pot off the
part it is soldered to. The clock, tune ROM, envelope and output pin boxes each
open **Bend spot** and **Bend pot**, and pressing the pot opens the box it hangs
on.

The drawing shows each feedback bend as a red wire:

- **Step tap** runs from the voices up to the tune ROM.
- **PWM tap** runs from the voices to the envelope, and the envelope's tag goes
  back to _clk_.
- **Envelope on divider** runs from the envelope back to the voices.
- **Envelope relax** loops over the envelope.
- **Output on address** and **Output on data** light the tune ROM.

**Crosstalk** is the output trace running beside the timing pin. The chip's own
sound frequency-modulates its clock at audio rate, and the clock also drives the
tempo and envelopes, so all three shake together.

- A lone note stays periodic, brightens and climbs in pitch.
- A chord cross-modulates: each voice bends every other voice's pitch, and past
  halfway the chord measures as noise.
- A decaying note sweeps its timbre, because the modulation depth falls with the
  envelope.

**Scan** is the one output pin all nine voices share: the melody, the bass,
three chord notes and four keys. A scan counter connects the pin to each
sounding voice in turn and skips silent ones, so a lone note holds the pin.

- Low on the knob, a chord buzzes at the scan rate.
- Around three quarters, a chord flutters.
- At the top, a held chord plays as an arpeggio, about six notes a second.

The counter runs off the chip clock, so Clip on clock or a flat battery slows
the scan along with the tune.

**Loop wire** is a jumper from one pin of the note latch back to the ROM, which
feeds each note into the address of the next.

- **Onto an address pin**, the two pins form a bridged pair and the low one
  wins. The address bit stays high only where the last note had that bit, and
  the note's bit stays high only where the counter has the address bit. The song
  takes a new path through the ROM, the same path every lap.
- **Onto reset**, the jumper goes through a capacitor, so each rising edge of
  that bit sends the counter back to step zero. The song loops on the stretch
  before the bit first rises: on _für elise_ D1 loops seven steps and D4
  sixteen.

**Song line** is a knife on the five wires that pick which song the ROM serves,
the memory you played in included. Each step reads the same address from
whichever song the faulted wires select, so the tune keeps its tempo and length
and plays another song's notes. A wire that already matches the fault changes
nothing: _für elise_ is song 4, so S2 held high leaves it alone, and S0 held
high plays _ode to joy_.

**Divider line** is a knife on the twelve-bit word each note loads into its
pitch divider. The pitch is a master clock divided by that word, and A3
loads 512.

- A low wire nudges the top of the keyboard, where the word is small.
- A high wire moves notes by octaves: N8 held high turns A3's 512 into 768, two
  thirds of the pitch.
- A note loads its word when it strikes, so a held note keeps its pitch until
  the next one.

**Volume PWM** is how the chip sets each voice's level: the output switches on
for a share of each carrier cycle, and the envelope sets the share. The knob
taps the carrier from 20 kHz down ten octaves of the clock divider, where it
whines under every note and a fade becomes a change of tone. A note at full
level is on for the whole cycle, so held keys sound clean until they fade.

**Envelope cap** swaps the capacitor every note's envelope runs on.

- **Reversed** turns each note upside down: silent at the strike, swelling to
  full, then cut off. Held keys swell and cut too, because the hold switch sits
  across the same cap.
- **Leaky** stops the cap draining below 0.3, so every note drones until a rest,
  a new note or a voice steal replaces it. Four held-and-released keys pile up
  into a four-voice drone.

**Voice short** solders every voice output onto one node, where the lowest
driver wins. A lone note passes through. A chord intermodulates into a buzz,
because the node follows whichever voice is lowest at each instant. The knob
crossfades the normal mix into the short.

**Ghost keys** lifts the diodes off the key matrix. Two held keys in different
rows and columns close the other two corners of their rectangle, and those
corners sound as held keys. The row width sets the intervals: four wide, A3 and
F#4 add A#3 and F4. The arpeggiator walks the ghosts along with the real keys.

**Step tap** clocks the tune's counter off a stage of the melody's pitch divider
in place of the tempo divider.

- Each note sets how long it lasts, so high notes rush and low ones linger. A
  rest keeps the last note's rate, because the divider keeps counting the last
  word it loaded.
- The knob moves the wire from the ninth stage to the first. At the top the tune
  steps at half the note's pitch, a hundred or more steps a second, and the song
  plays as one buzzing tone.

**Envelope relax** puts a leak and a trigger across the envelope cap. The leak
drains each note up to seven octaves faster, and when the cap reaches a quarter
the trigger charges it full again, so every note restrikes itself until a rest,
a new note or a voice steal replaces it. Low on the knob the notes stutter, and
at the top they buzz around 200 Hz. The drain runs off the chip clock, so clock
bends move the rate, and with Volume PWM each restrike sweeps the tone.

**Envelope on divider** bridges the envelope's counter onto the divider word. A
note's pitch falls as its envelope fades, by up to three octaves at the top of
the knob, so every note becomes a zap. The bass, chords and keys each fall as
their envelopes fade.

**Output on address** solders the output pin onto one ROM address line, A0 to
A4. The pin drives the line high on the positive half of each cycle and low on
the negative half, so the ROM serves one of two neighbouring steps from moment
to moment. The melody's divider loads whichever note comes back without
restriking it, and that note's pitch sets how fast the pin swings next. A rest
on one side gates the note on and off at the note's pitch.

**Output on data** solders the output pin onto one wire of the note code, D0 to
D5. Each wire is one bit of the note number, so the swing moves the note by a
fixed interval: D0 a semitone, D2 a major third, D3 eight semitones, D5 about
two and a half octaves. The melody flips between its note and the other one at
audio rate, and the note the ROM returns sets how fast it flips back. A note
whose other side codes a rest or a hold gates itself.

**PWM tap** takes the volume PWM carrier off the melody's pitch divider in place
of the master clock, so it runs a whole number of octaves under the note, one at
the bottom of the knob and six at the top. A fading note grows a sub-octave
growl whose tone changes as it fades, and the chords and keys are chopped at the
melody's rate. A note at full level is on for the whole cycle, so a held key
stays clean. The tap replaces the Volume PWM carrier while it is up.

**FM on clock** wires the FM chip's output onto the toy's timing pin through the
coupling Crosstalk uses, so Glint's sound bends the toy's pitch, tempo and
envelopes together, by up to four octaves. The toy runs first in each block, so
it receives Glint's output a block late, 2.7 ms. Glint plays the notes the toy
strikes, so each chip's timing moves the other's notes. With **Toy on bus** up
on Glint as well, the toy writes Glint's registers and Glint's sound bends what
the toy writes next, a loop through both chips. FM on clock does nothing while
Glint is down.

**Output hold** puts a latch between the voices and the output pin and strobes
it off the melody's pitch divider, so the pin holds each level until the next
strobe. At the bottom of the knob the strobe runs five octaves over the note and
the sound turns gritty. At the top it runs three octaves under, and every note
becomes a coarse staircase locked to the melody's pitch. The strobe follows the
melody's divider, so Step tap, the clock pot and Crosstalk move it with the
tune. Output on address and Output on data read the held pin, which slows their
flips to the strobe rate.

**Hard sync** runs a free oscillator on the die, 30 Hz at the bottom of the knob
and four and a half octaves up at the top, and resets every voice's divider on
each of its cycles.

- A note above the oscillator is cut short each cycle, so the oscillator's pitch
  sounds with a note-dependent edge on top.
- Sweeping the knob across a held note produces the hard-sync scream.
- A note below the oscillator never finishes a cycle and falls silent, so the
  bass drops out first as the knob rises.
- The oscillator counts off the chip clock, so clock bends move it with the
  tune.

**Voice XOR** multiplies the voice mix by the sign of every sounding voice but
the first, so each extra voice flips the mix whenever that voice is low. A lone
note passes through. A chord turns into sum and difference tones, a
ring-modulated clang that follows the keys. The knob crossfades the normal mix
into the XOR.

**Envelope bits** shortens the envelope counter, so a fade runs in steps: 32 at
the bottom of the knob, one at the top, where a note is a gate that cuts at
half. Held keys stay at full level. With Volume PWM up, each step is a different
tone.

**Duty on envelope** ties the pulse width to the envelope. A note strikes as a
spike 4% wide and opens to the width the tone selector holds as it fades. Held
keys stay thin.

## Glint's register bus

Glint is configured one byte at a time by a processor that writes the settings
for each sound. A register holds the last value written to it until the next
write to that register, so these faults stay after they occur. A starved rail
recovers the instant you let go of the knob; a byte that landed wrong stays
wrong until a write touches that register again.

Four faults can hit any one of these wires: forced **to ground**, forced **to
+V**, **bridged** to its neighbour, or **cut**.

- A bridged pair cannot disagree, so whichever driver pulls low wins.
- A cut wire floats, and it is the only one of the four that drifts. It starts
  at whatever the bus was carrying when it was cut, but the parted trace still
  runs the length of the board beside its neighbour, and a few picofarads of
  that coupling are enough to drag the undriven pin after the neighbour's edges.
  The bit holds for a word or two and then follows the traffic next door, always
  a lap behind.
- **Cut depth** is how far through the trace the knife went. At a partial depth
  the wire still conducts some of the time, and every write that lands resets
  the bit to the truth in between, so the melody flickers between the version
  the processor sent and the version the wire drifted to.

A common result is the key-up bit getting stuck. A note ends when the processor
writes that bit back down and the chip sees it change; hold the wire high and it
never changes, so the note simply never ends, and later notes arrive as pitch
changes under an envelope that never restarted. Hold it low instead and the key
never goes down, which is a chip that plays nothing. The frequency's top bit
shares a byte with the key-on bit, so a fault there moves pitch and whether the
note happens at all together. Volume goes out as its own nibble, so a stuck bit
there leaves one of the four voices at the wrong level for good. **Address
line** faults are the more violent case: the byte arrives intact but gets filed
under the wrong register, so the intended register never receives its value.

**Slip the strobe** corrupts no byte. A register write is two things arriving
together, a number naming the register and the value to put there, and a pulse
called the strobe tells the chip to latch both at once. Make that pulse marginal
and the chip sometimes misses it, so the value commits to whichever register the
last pulse that did land had named. Every byte crossing the bus is still exactly
what the processor sent, paired with the wrong register, one write late. Misses
compound: two in a row is two writes of lag, and wound all the way over, the
chip never advances past the first register it ever latched. A single note takes
four writes and smears. The built-in effects fire hundreds of writes a second,
so the same fault turns a chirping cricket sound into one continuous drone, the
same result as a stuck key-up bit reached from the opposite direction.

**Cut the wave ROM** targets the one bus on this chip the processor never
touches. The chip computes no sine: the operators look one up in a 256-entry
table addressed directly by phase, with the top bits mirroring and flipping the
sign to build the rest of the cycle. **Wave line** cuts one of those address
wires. Releasing the knife gives a clean sample on the very next read, because
wave-ROM faults leave nothing behind. Which wire you cut matters more than
whether you cut it:

- Hold the mirror bit and the quarter-wave runs twice instead of turning around,
  giving a sawtooth edge and an extra octave.
- Hold the sign bit and every read comes from the top half of the table, an
  all-octave rectified tone.
- Cut low enough down the bus and the effect is nearly inaudible.

**Wave line** is the way into the table and **Wave data line** is the way out.
They behave oppositely: an address fault reads a different sample, correctly,
and a data fault reads the sample it asked for with a step cut into its
amplitude at one bit position. The table keeps a magnitude and takes the sign
off the phase, the way the part does, so nothing on this side of it can move a
note. Hold the top pin high and no sample the chip reads is worth less than half
of full scale, which fills in the quiet parts of every wave and leaves the note
buzzing at the pitch it always was. Part the same pin instead and it holds
whichever of the eight operators in a sample went last, so the amplitude comes
from a different operator every turn and the chip sounds like gravel.

**Noise blob** is a bodge wire, not a knife, on those same eight pins. The shift
register the percussion bank runs on is the only broadband source on this die,
and without the blob pressing Rhythm is the only way to hear it. The blob is a
solder bridge from the register's output onto the table's pins. The blob sits on
them from the least significant up, so a touch of it is dirt riding on the note
and all the way across is eight pins holding one bit: no sine remains, and the
output is the carrier's square gated by the register, since the sign is not one
of these pins. The blob applies on every patch, under an effect and through a
panic, which no other bend on this chip does, because the processor cannot touch
it.

**Patch line** and **Patch data line** cut the table the operators read their
patch from. It is sixteen rows of eight bytes: row zero is the register file the
processor writes, and the other fifteen are the die's own bank, which the
instrument nibble selects. The chip fetches every channel's patch over these
wires every few milliseconds, so a fault here lasts exactly as long as the
knife: every fetch reads the same wrong byte, and the patch comes back the
moment the knife comes off.

- A byte line (P0–P2) pairs a patch's bytes wrongly: P0 to ground reads each
  even byte twice, so the carrier gets the modulator's settings.
- A row line (P3–P6) held at +V swaps every channel onto one of the die's
  patches, past every knob that rewrote the register file's copy. The processor
  only asks for row zero, so the other faults on a row line wait for a data-line
  knife to pick another row.
- A data line moves the same bit in all eight bytes at once. B0 is the bottom of
  both multipliers and drops the note an octave; B5 is the hold bit, so a struck
  voice rings for as long as the key is down.

**The hidden test register** is undocumented. The factory used it to test the
die, and the only write a driver ever makes to it is the one that clears it at
power-on, since a chip that booted with a stray test bit set would never sound
right. A **Data line** fault on that clearing write sets bits nothing in normal
operation ever sets, and every later patch change sends the clear again, over
the same broken wire, corrupting it identically each time. Those bits switch
behaviours that no combination of legal patch bytes produces:

- Every operator forced wide open turns envelopes into a plain gate.
- The envelope counter forced to its fastest step collapses every note to the
  same four-millisecond click.
- The output latch skips every other slot, for half the sample rate and full
  aliasing.
- The latch's sign line held rectifies everything reaching the pin.

**The percussion bank** is the register next door to the test one. Whatever the
knife finds on this chip, the result comes out high, and the cause is
structural. The key line supplies 220 Hz and up, the driver picks the tightest
block for every note it is given, and a chip whose only primitive is a sine
cannot make a sound that is not a sum of sines. So faults that set a bit go up
several octaves, faults that clear one mostly clear a bit that was already
clear, and nothing in the register file makes noise except the percussion bank.

Pressing **Rhythm** gives the top two channels to the percussion bank. Their
operators are re-tapped onto a kit held in ROM: a bass drum an octave under the
bottom of the keyboard, and a pair of slots cut off from the sine table
altogether and wired instead to a shift register that has been free-running
since power-on. That register is the only noise on the part. The two slots take
it at different rates off one divider, so they do not sound alike: the hi-hat
gets every bit and comes out as sand, and the snare latches one in eight and
holds it, a rattle with a body under it. Every note strikes the bass drum; the
snare and the hi-hat need the kit's trigger lines, which **Kit voice that plays
this chip** clips on.

With the bank switched over, the same knives land somewhere new. A wire that
moves a note by an octave with the bank off moves how coarse the hiss is,
because the frequency registers those two slots no longer use for a pitch clock
the shift register. Wind it down and the kit turns into a rumble; wind it up and
it turns into sand, a sweep no other control on this chip makes.

The bank is one byte, and its mode bit and all three drum keys cross the data
bus together, so a wire held low is a rhythm button that does nothing, and a
wire held high is a drum that never lifts, the same bend as the note that never
ends, one register down.

A wire held high on the "no drums" byte also switches the bank on. The driver
sends the bank setting with every patch, the same way it clears the test
register with every patch, so the byte meaning "no drums" crosses the bus like
any other, and a wire held high turns it into the byte meaning drums. The chip
switches over with nobody having pressed anything, and because the driver does
not know it happened, it goes on sending those two channels notes: the melody
reaches the die as strikes, and the tuning the kit would have had was never
sent. The kit's rates are stored in ROM, not in the register file, so a knife on
the patch bytes cannot reach them, and the drums stay crisp on a board where
nothing else does. An effect uses the same two channels, so pressing one turns
the other off.

**The bits the register map has no button for.** A byte is eight wires, and
three of this chip's registers read five bits and discard the rest as far as the
panel is concerned. The bits in those gaps control hardware that a patch shares
and does not own, and they are reachable from the bus and nowhere else.

The die has one LFO, which has been running since the board came up. No register
sets its rate or depth or starts or stops it; a patch byte says only whether an
operator is wired to it. The top bit of each flags byte wires the operator to
the tremolo and the next one down wires it to the vibrato. **Vibrato** on the
panel is that pair of bits and nothing else, which is why it takes a patch write
to apply and why a knife can leave the button down with nothing wobbling.
Because the LFO counts off the same divider as everything else on this board,
starving the toy slows the wobble along with the pitch, the envelopes and the
tempo. Because one button wires both operators, most of the tremolo is hidden in
a two-operator patch: the modulator going up and down is a brightness going up
and down, which moves the level the opposite way from the carrier doing the same
thing. With the modulator off, the same setting becomes obvious.

Key scaling is two more bits at the top of each of two level bytes. It wires the
octave into the volume: a patch with it set loses level the higher it is played,
so one set of eight bytes covers a keyboard without shrieking at the top. The
octave already shares a byte with the key-down bit and the top of the frequency
count, so one wire there already moved the pitch and whether the note sounds,
and now it also moves the loudness. A fourth bit does the same to the envelope
rates, so a patch that rings for a second at the bottom of the keyboard can stop
ringing at the top.

**The instrument nibble** is the one fault on this chip that adds sounds instead
of damaging them. Each channel's volume register holds how loud that channel is
in its low nibble and _which instrument it is playing_ in its high one. Zero
means the eight bytes in the register file — the patch the panel just sent — and
the driver writes zero there with every note, because zero is the only answer it
has. One to fifteen are patches burned into the die, and the case has buttons
for eight of them. The other seven are on the board, wired to nothing: a violin,
a flute, an oboe, a trumpet, a horn, a harpsichord and a vibraphone that no
button reaches and the processor has no reason to name. A wire held high under
that nibble is a channel that stops reading the register file mid-note and
starts reading ROM, and since the nibble is per channel, one voice can be
somewhere else entirely while its neighbours play what you asked for.

**The effect ROM** is the source of the chip's canned effects: a bird call,
surf, wind, a siren, crickets, a phone, a doorbell, a steam train, applause and
a laser, none of them samples. Each is a short program in the processor firing
register writes at the chip hundreds of times a second: sweeps and key-ons for
the bird, the modulator's feedback pushed into noise for surf, that same noise
under a random walk for wind, and so on. An effect is the busiest traffic the
bus carries, so the **Data line** bend scales with it: every one of those writes
comes out wrong, and under **Cut** the drifting bit follows that traffic, so the
corruption tracks the effect's motion instead of sitting at a fixed offset.
Running an effect also borrows the whole patch and a fourth voice, so the
keyboard drops to three voices while it plays. Starving the rail underneath
decouples the two, because the processor's clock is a resonator that ignores the
supply, so the effect keeps its usual rate while the chip it addresses dives and
slurs.

The five later scripts each give the bends a new kind of traffic:

- **phone** strikes a bell patch twenty times a second in a double ring and
  rewrites the modulator's level every pass. With the key wire held high the
  ring becomes one held tone.
- **doorbell** strikes a chime a major third down every four seconds and writes
  a tremolo into the volume between strikes.
- **steam** chuffs the feedback noise through the volume register, closer
  together each one, then writes the feedback down to zero for a whistle: the
  one script that rewrites a patch byte as it runs.
- **applause** strikes the noise at random pitches, up to seventy times a
  second, swelling and dying away. Through a 9-bit **Log adder** it is a wall of
  white noise.
- **laser** drops a bright note six octaves in a sixth of a second, three shots
  a burst, rewriting the frequency four hundred times a second.

**Clock** and **CPU clock** are the board's two crystals, one each side of the
bus:

- **Clock** is the chip's. Pitch, the envelope rates, the LFO and the shift
  register count off it together, so turning it down transposes the chip without
  changing its timbre, down to octaves under the bottom of its keybed. **lock**
  sets it to the toy's crystal, so a dragged toy and this chip play the key line
  in tune.
- **CPU clock** is the processor's. Note length and the effect scripts count off
  it, so a slow one holds every note longer and a bird calls at half speed over
  a chip still in tune. At 16× the crickets script writes faster than the
  envelopes can follow and comes out close to noise.

Clock and CPU clock have bay lanes, **FM clock** and **FM CPU clock**, which
move three octaves to a full push, as the toy's clock lane does.

The drawing under the **die** box shows the parts these faults reach. The
allocator feeds the register file, four voices run off it, and one converter
takes a slot from each. Each fault shows as a red reading on its part. A stuck
allocator or slot counter also shows the one channel it leaves as a red wire.

**DAC slot** and **Slot slip**, under **die and driver**, are the converter. The
four channels share one, a slot each per sample, and a counter selects the slot:

- **Stuck** on a slot, the counter sends that channel's sample in all four: one
  voice four times as loud into the output stage and the other three gone. The
  driver assigns each note the first free channel, so only the notes assigned to
  that slot sound. A wire on **FM DAC slot** walks the slots through a chord.
- **Slipping**, the counter runs slow and now and then reads a channel twice and
  skips the next. A touch is a flutter, the middle a buzz pitched by how often
  it slips, and the top gives each channel a whole sample in turn, which folds
  every note into images a quarter of the sample rate apart.

**Allocator** is the driver's, on the processor's side of the bus. Stuck, it
sends every note to one channel, so a four-voice chip plays one note at a time
while the driver still treats it as four voices: each note cuts the last one's
tail off, and a chord comes out as its last note. In melody the four channels
are interchangeable, so which one it sticks on matters only where a channel
belongs to something else:

- **stuck on 3** with **Rhythm** on puts every note into the bass drum's
  registers, so the tune retunes the drum and strikes it.
- **stuck on 4** with **Rhythm** on lands the notes on the snare and hi-hat's
  channel, where the frequency sets how fast the shift register's gate runs.
- **stuck on 4** with an effect running has the tune and the script writing the
  same channel, so the song fights a bird call for its frequency.

**Cold boot** is what the register file holds at power-on. On **garbage** the
chip comes up holding random bytes. Switching it on power-cycles the chip into
them, and so does every panic, with fresh garbage each time:

- A channel whose key bit came up set is already sounding, at a random pitch on
  a random instrument, and drones until a note is played on it.
- The driver's first patch write clears the test and rhythm registers. With a
  knife on the bus that write can miss, and the chip never finishes booting: on
  the first boot, A0 to ground leaves the test register wide open, skewed and
  rectified.
- A wire on **FM cold boot** power-cycles the chip each time it crosses halfway,
  so a square LFO on it is a stutter of random chords.

**Log adder** puts the chip on the part's own arithmetic. The board as built
multiplies; the real die has no multiplier. Its sine table holds −log₂|sin|,
every envelope and level is added to that as attenuation, and an exp table turns
the sum back into a level. Any width on the control switches every operator to
that path, with an adder of that many bits that wraps instead of saturating:

- A sound fading past the adder's top comes back at full scale, so a decay
  explodes back every 48 dB at 11 bits and every 3 dB at 7.
- The quiet middle of every sine sits deep in attenuation, so a narrow adder
  folds it up into a harsh digital buzz at the note's own pitch.
- The kit and the effect scripts go through the same adder; wind at 9 bits is
  close to white.

**Toy on bus** solders the toy keyboard's output onto the low bits of this
chip's data bus through a crude converter, the toy's loudest bit on the bus's
lowest wire. Each time one of those bits changes, the edge fires the write
strobe, and the latch commits the bus into whichever register the processor last
addressed. That register holds the toy's level until the processor writes there
again, so the damage builds up as the toy plays.

- The processor's last write is usually a key register, whose low bits are the
  top bit of the pitch, then the octave, then the key. One bit jumps the pitch
  at the toy's own rate, four throw the note between octaves, and five key the
  note on and off.
- At eight bits the register follows the toy's waveform, and Glint comes out
  close to noise.
- The control counts bits, 1 to 8. The toy has to be sounding, since a silent
  toy drives nothing onto the bus.

## Inside the drum voices

The Clatter panel is one drawing of the kit's voices. The pads box at its top
left opens first and holds level, tempo, swing, chance, tune, decay and mute,
with the drum pattern above them when it is shown.

The kit's pitched voices (kick, tom and the body under the snare) are bridged-T
networks, each a handful of parts around a transistor that does nothing until
the trigger dumps a pulse into it, and then rings. The ringing is the drum, so
the decay is how much of each swing the transistor gives back, with no envelope
shape laid over a tone.

**Ring** is that fraction.

- Under about nine tenths of the travel, the network gives back less than it
  took, and the voice stays a drum.
- At the crossing, it gives back exactly what it took and never stops.
- Past the crossing, it makes up the difference every cycle and grows into its
  own clipping, so the pitched voices become notes, which the pattern retunes
  instead of restriking.

The trigger floor depends on the same fraction: a network that never drains
never gets back under the floor, so the sequencer cannot strike a latched voice
again.

The pitch falling through a hit comes from the same part. The pulse drives the
transistor a long way from where it settles, and what the network is tuned to
depends on what the transistor looks like from outside, so a big swing is a high
tuning that comes down as the swing does. Hit it harder and the swoop starts
higher and lasts longer, so an accent is a pitch as well as a weight, which no
envelope shape can express.

**Sweep** is the bias trimmer behind that swoop, as a multiple of where the kit
shipped:

- At 1 the kit swoops as it shipped.
- At 8 a kick starts several octaves up and falls like a Syndrum zap.
- Below 0 a hard swing pulls the tuning down instead, so a kick starts low and
  rises as it rings out. Three octaves under the resting pitch is the floor.

**Bank FM** solders the metal bank's squarer onto the bias of the kick, tom and
snare networks, so the bank's clatter shakes their tuning. A little turns a kick
metallic. Past about a third of the travel the tuning swings through zero and
the network runs backwards for part of each swing, so the kick becomes a
quieter, brighter clang, with its spectral centroid near 500 Hz at the top
against 67 Hz stock.

**Bank sync** resets all six metal oscillators each time the kick or tom swings
up through zero. While that drum rings, the hats, cowbell and cymbal repeat at
its pitch and fall with its swoop, and every hat struck with a kick comes out
the same hat. Once the drum stops, the bank runs free again. With Bank FM up as
well, the bank shakes the network that resets the bank.

**Tank coupling** wires the kick's network into the tom's drive, so every kick
rings the tom as well, about an octave up. Past a quarter of the travel the tom
answers louder than the kick that drove it. With Ring past the latch the two
networks are two oscillators, one forcing the other: low on the travel they lock
to one pitch, and around halfway the pair smears across the low end.

**Trigger pulse** is how long the one-shot holds the trigger line down. The
charge is the same at any width, so the knob changes how the charge is spread.
Narrow is a tall spike that gets through the coupling cap as a click and shocks
the network cleanly. Wide is a shove spread across a good part of a cycle, which
the cap blocks and the network partly cancels: no click, less body, and least of
both on the voices pitched high enough that the pulse outlasts them.

**Pulse sharing** puts all eight one-shots on one timing rail, so voices fired
together steal charge from each other. Each runs short at the same height, so
the network receives less charge and the swoop starts lower. A kick struck with
a hat and a clap keeps 27% of its body under 120 Hz at the top of the travel,
and its swoop starts at 75 Hz against 100; a lone kick is untouched. On the
measuring board the kit's centroid rises from 440 Hz to 900, where Accent sag on
every step pulls it down.

**Trigger load** is the drain those one-shots put on the supply. Each one dumps
its charge at the front of its hit, before the sound it starts:

- The metal bank sits across the kit's local supply, so the dip affects it at
  once. At the top of the travel a kick drags a ringing cowbell or cymbal down
  an octave and lets it back over about 60 ms; a kick, snare and hat together
  drag it nearly two.
- The same spike reaches the board's shared rail a block later. On the measuring
  board the rail dips to 0.35, so Plinky goes flat under every busy step, and
  the kit's own tuning sags with it.
- The tempo circuit sees the rail through its own decoupling, so it drifts only
  with the average.

**Snappy** mixes the snare's sources. All the way up is the noise transistor
alone, the kit's plain noise snare; down, the two tuned networks under it come
through instead, beating against each other. Tune reaches those networks and
does not reach the hiss, so a snare with any tone in it moves with the rest of
the kit.

**Noise bias** sets the reverse bias on the one transistor that makes the hiss
for those voices. The transistor is a base-emitter junction run backwards until
it avalanches, which is the source of all the hiss on this board. Give it plenty
of reverse bias and it conducts steadily. Back it toward the knee and it latches
into conducting and out again at random, holding each state for between a third
of a millisecond and a tenth of a second. Popcorn noise is a documented failure
of marginal parts, named for what it sounds like.

The snare, both hats and the clap all use that one transistor, so they break up
together and mid-hit instead of one voice at a time: half a snare's crack goes
missing and the hat over it misses the same half. Down the travel the kit's
noise stutters; near the bottom it only spits, and what remains is the half of
each voice that isn't hiss, so Snappy and Metal set what a spitting kit still
sounds like. The avalanche timing is also the only duration on this board not
counted off the chip's oscillator. No clock drives an avalanche, so a rail
dragging the tempo does not drag it.

**Dice** wires the kit's dice to the noise junction. Free, a maybe step rolls
fresh every time the counter reaches it. On the junction, the dice is a
comparator on the transistor: it rolls while the junction conducts and holds its
last answer while it doesn't. Down the Noise bias travel the maybe steps stick
just as the snare and hats start to spit. At a bias of 0.5 a maybe repeats its
last answer 74% of the time against 51% free; at 0.3 it repeats 97% of the time,
two bars or more at a stretch. With the bias all the way up the two settings are
the same.

**Clap gap** sets the period of the clap's burst oscillator, 9 ms stock, and
**Clap bursts** sets how many bursts it fires before the clap rings out, three
stock.

- Each burst runs down within its gap, so under about 3 ms the train becomes a
  buzz with a noise timbre, which the metal bank can't make. The buzz needs
  dozens of bursts to last long enough to hear.
- At a few hundred milliseconds each burst is a separate clap.
- The gap is counted off the chip's oscillator, so a sagging rail spreads the
  bursts into a flam.

## The metal bank

The other four voices, the cowbell, the two hats and the cymbal, are one part: a
single bank of six square oscillators, tuned so that no two of them share a
harmonic. The six run continuously: a trigger only opens an amplifier, so every
hit catches the six wherever they happen to be and no two hats start on the same
edge.

The six go into a stage with far too little headroom for them, which makes a
clatter of them instead of six tones. Summed and left alone, the loudest
harmonics in the pile all belong to the fastest oscillator and the hat comes out
ringing on a note; squared off, the edges of all six fall in it at times that
never repeat. The cowbell is soldered in ahead of that stage, which is why it's
the one metal voice with a pitch left in it.

**Squarer bias** is the resistor that makes that stage a comparator, and backing
it off is the one control that returns the six tones. The stage is a gate with a
resistor from its output to its input, which parks it at its own trip point,
where the gain is in the thousands, so any input swings the output to a rail.
Lean on the resistor and the feedback starts setting a gain instead of a
threshold: the gate stops switching and starts amplifying, the sum comes through
as a sum, and the hat, the open hat and the cymbal turn into a metal chord
beating against itself. It measures three times as tonal at the bottom of the
travel as at the top while the band it comes out of stays where it was, which
distinguishes it from a tone control. The cowbell taps out ahead of the stage,
so it is the one metal voice Squarer bias never reaches, the mirror of Bank
spread, which reaches all four.

**Metal** is the pot on the hats' amplifier that blends the metal bank with the
noise transistor, the same transistor the snare and the clap use. Down the
travel is the noise hat, and every hit is the same hit; up the travel, no two
hits are the same.

**Bank spread** leans on the one resistor chain that sets all six. The ends of
the chain move and the middle stays, so the bank widens instead of transposing,
which is Tune's job. Every metal voice moves at once because they're the same
six parts: wind it up and the cowbell detunes, the cymbal turns to glass and the
hats get grittier.

**Bank starve** puts a resistor into the bank's own supply. All six slow down
together, up to three octaves, so the cowbell drops and its beat stretches out,
and the hats and cymbal thin from a clatter to a crackle. The kick, tom and
snare are not on that supply, so Bank starve moves the metal half of the kit and
leaves the drums at the pitch Tune sets.

**Bank gate** solders a trigger line onto that supply. The six run only while
the chosen voice sounds and hold their phases in between, so gated on the kick
the hats, cowbell and cymbal speak only under a ringing kick. Gated on a metal
voice, each hit starts where the last one stopped, so two hats in a row still
differ; Bank sync is the bend that makes them the same hat.

**Cymbal tone** is a wiper between two taps on the cymbal's filter, so it works
as a tone control and not a second volume. Down it keeps the body the hats throw
away; up it's most of the way to being a hat.

The hat and the open hat share one cap, which models a hi-hat pedal. A closed
step drains a ringing open hat quickly instead of silencing it, so writing hats
under an open one acts as a foot on the pedal, not a mute. One resistor across
that cap does the draining, and **Choke** sets where it is soldered: move the
wire and any voice drains any other. _Kick cuts the kit_ is a gate on
everything; _each cuts the next_ passes it round the ring. The hats keep their
pedal wherever the wire goes, because that pair is hard-wired. The choke follows
the trigger line, so a pad, the mic and a bridged wire choke exactly as well as
the sequencer does.

**Accent** and **Accent sag** make the accent row a circuit. The accent is one
cap feeding every voice on the board, and sag is how much each accented step
takes off it. Left at nothing the bus is stiff and every accent is the full one.
Wound up, a step stacking four voices gives each of them less than a step
stacking one, and a second accent that comes before the cap has recovered is
softer than the first, so a roll comes out shaped without a knob moving.

## Parlor's sample bus

Parlor is the simplest machine on the board and has no oscillator. A ROM holds
one short recording of each voice, an attack segment and then a loop, and a
counter walks that ROM at the rate set by the note. The whole instrument is a
counter, a memory and a DAC, and a knife reaches two of the three.

**Address line** is the counter's wires, running into the memory, so it behaves
the way the toy chips' address buses do: every word that comes back is a real
word from the wrong place, and the note never moves. A low wire held down reads
each word more than once, which drops the voice an octave and coarsens it; a
high one folds the whole recording onto a fixed half of itself, so a voice loops
inside its own attack and never reaches the part it was cut for. There are
fourteen wires because the counter has to reach the sample memory as well as the
wave ROM, and the wave ROM fits under the top two, so on every voice but
_sampled_ the top two wires are never driven high.

**Data line** is the answer coming back. The address is right, the sample is
not, and it is wrong on every word of every voice, so the note keeps its pitch
and loses its surface. D7 is the top of the word: held high, the bottom half of
every wave folds up onto the top of it and a string pad comes back as a
rectified buzz at the pitch it always was. The lower wires punch a notch through
each word, which is the gravel. A bridge forces two of them to the same value,
which puts the words on a lattice, so the wave comes out in steps.

Two properties of the clock shape the sound as much as the ROM does:

- The ROM was cut at 9.9 kHz and nothing interpolates on the way out, so every
  voice has images sitting over it. _Tone_ is the two-pole reconstruction
  filter, and the only filter between you and them.
- The rate is a twelve-bit _divider_ rather than a frequency, so the chip plays
  the nearest number the counter can be told: dead in tune at the bottom of the
  keyboard and a few cents sharp at the top, which is why one of these never
  quite sounded in tune with anything.

_ROM clock_ drags that counter directly, and pitch and aliasing move together
because on this part they are the same thing.

## Growler's voice card

Growler is a clean instrument with seven parts on its voice card that fail the
way analog synth parts do.

The drawing under the **voice card** box shows the card's signal path through
the key DAC, pitch hold, exponential converter, oscillators, ladder and VCA. A
regulator sits over the converter and the ladder, and the two contour generators
sit under the ladder and the VCA. Each fault shows as a red reading on its part.

**Hot converter** is the exponential converter's transistor pair with no heater.
The pair turns a control voltage into a frequency, and its scale depends on
temperature, so the three oscillators drift in different directions and the
octave widths stretch apart. Low notes stay close to in tune and high notes
disagree, and the board's own heat adds to the drift.

**Leaky VCA** leaves the amplifier slightly open, so some of the filter output
passes with no key down. The oscillators drone under every note and between
them.

**Contour caps** swaps the timing capacitors in both contour generators for
bigger ones. Every attack, decay and release stretches by the same factor, so a
pluck turns into a swell and a short riff into one long smeared note.

**Mismatched pair** puts one transistor pair in the ladder up to three times off
the cutoff of the other three stages. The resonant peak moves and widens, and
the pitch the filter self-oscillates at shifts away from the cutoff.

**Pitch droop** is the sample-and-hold capacitor that keeps the pitch voltage
between key presses, leaking toward 0 V. A held note sinks, faster the higher it
started, and each new key resets it.

**Key DAC bit** holds one bit of the key-to-voltage converter high. A key whose
number already has the bit set plays as written; every other key jumps up by the
bit's weight in semitones, so a riff comes out with half its notes moved.

**Sag** is a weak regulator on the card. Loud notes pull the supply down, the
pitch dips and the filter closes on each hit, and both recover as the note
fades. The card also sits on the toy's own rail, so **Starve** and a brownout
drag its pitch with the other chips.

## The drum machine's pattern bus

The pattern bus runs between the step counter and the pattern memory, and the
four wire faults (to ground, to +V, bridged, cut) apply to it. The counter keeps
counting and the playhead keeps tracking the step it always did; what changes is
which cell the memory answers with.

**Address line** faults change which step you get. A0 held low files every odd
step on top of the even one below it, halving the pattern's resolution; A3 held
high plays only the back half of the bar. A row's length is set in the counter,
so a knifed address line can reach cells a short row could never have played on
its own.

**Data line** here is the trigger line itself, not an amplifier, which
distinguishes it from cross-patch. Force one high and that voice fires for real
on every step the machine fetches, and every other instrument listening to that
trigger line hears it too. Force one low and it's a row you can see and never
hear. Bridge a pair and the two fire only where both rows agree, thinning a busy
pattern down to what they have in common.

There are nine wires on that side and eight voices. The ninth wire is the
accent, on the same bus as the voices: one line a row, in the order of the grid,
so D8 is the accent, and it is the one wire that says how hard a voice is
struck, not whether.

- Held high, the machine fetches the accent bus on every step. With the bus
  stiff the kit has one weight again; with **Accent sag** wound up the kit is
  weighted by how many voices each step strikes, pumping against its own pattern
  with nothing in the signal path.
- Held low, it is the accent row you can see and never hear.
- Bridged to the row beside it, the accent fires only where that row does: an
  accent on the crashes and nowhere else.

## The counter's own clock

The faults above leave the counter counting and change what comes back. Clock
slip leaves the cell right and puts the counter behind.

**Clock slip** is the wire clocking the step counter, and how often an edge
comes out too slow to get over the threshold. Every fetch is correct: the strobe
lands, the memory answers and the voices the step names fire, but the counter
has not moved, so that step plays a second time and the bar comes out a step
longer than the one before it.

Clock slip is the only fault on this board that accumulates. A knifed address
line is the same wrong cell every lap, for as long as you leave it; a slipped
clock never comes back to where it started, so the pattern walks against the
accent row, against every row whose length is not sixteen, and against anything
following the kit. The playhead walks with it, because the playhead _is_ the
counter, which is how you tell a slipped clock from a bus fault, where the grid
keeps chasing the step it always did.

MIDI clock out counts the steps the kit actually clocks, so every follower on
the wire is dragged along. _Kit sync_ locks the toy to the tempo the kit was
asked for instead of to the edges the counter produced, so a slipping kit and a
locked toy drift apart. All the way up, no edge gets over the threshold and the
machine stays on one step at the step rate, with the tempo unchanged.

**Counter reset** solders a voice's trigger line to the counter's clear pin. The
clear is synchronous, so when that voice strikes, the next clock edge loads step
one:

- The bar ends on the step the voice strikes. On the rock beat, the snare on
  step five makes a five-step bar.
- Every row restarts together, so rows of different lengths line back up at each
  reset.
- A maybe step on the reset voice rolls the bar's length each lap.
- A pad, the mic or the keyboard striking that voice restarts the bar by hand.
- A reset voice on step one holds the machine on step one, at the step rate.

**Pattern loop** treats the pattern memory as a shift register clocked by the
counter, with its output tied back to its input, as a cheap machine of this kind
has. A knife in that loop changes each step as it goes back in, so the pattern
rewrites itself a lap at a time:

- _Return inverted_ plays every row's gaps every other bar. Empty rows fill, so
  on the stock beat the odd bars strike all eight voices on most steps.
- _Return a step late_ slides every row one step later each bar, under an accent
  row that stays put.
- _Each row into the next_ passes each part down the grid a bar at a time: the
  kick's part on the snare, then the hat, round to the kick after eight bars.
- _Return through an XOR_ mixes each step with its neighbour, growing a row into
  patterns it never had. A sixteen-step row comes back within 255 bars.

The knife leaves the panel's controls unchanged. Writing a step loads that row
into the loop again, and switching the knife off restores the grid. The lights
show what struck.

**Scan** is how long the chip takes to get from one voice to the next. Slow it
and a step that strikes several voices comes out as a flam, in row order.

## The drum machine's sample ROM

The sampled kit stores its eight slabs end to end in one part, kick first and
cymbal last, and every voice reads that part over the same wires. Those wires
appear under **Sample ROM** once the kit is switched to sampled.

**Slab counter** is two pins on the counter that walks a slab:

- With the end stop cut, the counter runs on through every slab after the
  voice's own, so one kick hit plays about four seconds of the whole kit.
- With the up/down pin wired, a slab plays backwards: the tail swells into the
  attack.
- With both, the counter runs backwards to the start of the ROM, and one cymbal
  hit plays the whole kit in reverse.

**ROM address** works like every other address bus on the board, with one
difference: the memory holds every voice, so a wrong address is often another
voice's slab. A0 held low reads each word twice. A16 held high puts the kick's
counter in the open hat's tail and then the cymbal's attack. With a bridge, the
counter reads the slabs in clumps.

**ROM data** is the twelve-bit word coming back. D11 is the top of the word, and
a fault there folds each hit into a square-edged blat at about 1.7 times the
level. The low wires sit under the quiet tails and are barely audible.

The ROM address and ROM data knives share **Cut depth** with the pattern bus.

## The trigger patch's other faults

See [the trigger patch](USER-GUIDE.md#the-trigger-patch) for how to wire it. The
faults below apply once it is live.

**Retrigger** pulses the drum machine's trigger line, and past roughly 40 Hz the
retrigger period stops sounding like rhythm and becomes the pitch. **Trigger
floor** sets how far a voice has to have decayed before its one-shot will answer
the trigger line again: at zero, every pulse strikes; at maximum, a voice does
not restrike until it has fully finished. Trigger floor sits on the trigger line
itself, so it gates the sequencer, pads, mic and keyboard as well.

**Ring trigger** puts a comparator on one tank's ring and solders its output
onto other voices' trigger lines. The comparator strikes once a cycle while the
ring is loud:

- _Kick fires hat_ rattles the hat at the kick's pitch, falling with the kick's
  swoop, for as long as the kick rings.
- _Kick fires itself_ pumps the kick's network every cycle, and the kick drones
  around 100 Hz and never stops. **Trigger floor** lowers the drone and, at
  maximum, divides it out.
- _Kick fires the kit_ strikes all seven other voices on every cycle.
- In the sampled kit the comparator reads the slab's output.

**Cross-patch** bridges two drum voices' envelope pins, so one voice's amplifier
follows another voice's envelope, and a hit you can hear opens a channel nothing
struck. **Rotate** cycles the cross-patch through the original three voices;
**Whole kit** extends it to every voice on the board, so a voice with no steps
of its own can still fire off another voice's pattern.

The _triggers and cross-patch_ fold draws these wires between the pattern, the
eight voices and their amps:

- A dashed red wire runs from the trigger line that chokes a voice to that
  voice. The grey one is the hats' own pedal, which every choke keeps.
- A solid red wire leaves a voice for a ring trigger and joins the trigger lines
  it fires.
- A cross-patch draws a red wire from a voice to the amp it now drives, and the
  amp's own wire goes dashed. In the sampled kit those wires stay grey.

**Mic patch** wires the mic past the mixer entirely, onto one of several points:
the chip's supply rail, the oscillator's FM input, the delay's feedback path,
the ring modulator's carrier, or the trigger line of the drum machine or the
glitch buffer.

**Restarts the file on** puts a dropped audio file on a trigger line of your
choice: one of the kit's voices, any hit at all, a keyboard note, or the mic.
With **Ending** set to one-shot, the file plays as one more drum voice,
retriggered from the top on every hit; left as a loop, each hit restarts the
file from the beginning.

## The patch bay and body pad

The patch bay is four free wires.

- Sources: the bay's own LFO, the sag on whichever supply is dying, the output
  envelope, the mic, an axis of the body pad, the feedback bus itself, the
  chip's sequencer ramping across each ROM step (the one source that stays
  locked to the tune), either box's trigger line, or how hot the board has
  gotten, the slowest source on the board, which never resets to where it
  started.
- Destinations: a filter cutoff, a carrier, a clock, the shift or word-length
  controls, tape speed or delay time, glitch chance, stompbox drive, the kit's
  trimmer, the spring tank's decay, the drum cross-patch amount, the feedback
  amount, or another wire's depth.

One destination, **starve**, is the shared rail and not a stage, so a wire there
affects everything powered from the rail at once, whether that is a drum hit
browning the chip out on every kick or an LFO that ages the rail in time.

Twelve lanes reach [the toy chip's pins](#the-toy-chips-pins): **crosstalk**,
**scan**, **PWM** and **short** move every sample, and the envelope cap, ghost
keys, loop wire and the song and divider knives step through their choices once
a block, the way the other knife lanes do.

- Drum hit onto scan chops a held chord into an arpeggio on every kick.
- An LFO onto the envelope cap turns notes backwards and leaky in turn.
- The ROM step onto the divider line retunes the melody in time with itself.

Six more lanes reach the toy's feedback bends: **step tap**, **envelope relax**,
**envelope on divider** and **PWM tap** move every sample, and the output's
address and data lines step through their choices once a block. A seventh, **FM
toy on bus**, steps through the bit counts. **FM on clock** and **hold** move
every sample.

- Drum hit onto step tap throws the tune into a buzz on every kick.
- An LFO onto envelope relax sweeps every note between a stutter and a buzz.
- A sample-and-hold onto the output's data line moves the flip interval to a new
  wire on every tick.

Five lanes reach the kit: **tempo**, **swing**, **chance**, **decay** and
**ring**. Drum hit onto chance makes every hit raise the odds of the next maybe
step, so fills feed themselves.

The bay's oscillator also offers two shapes beyond the usual LFO set: **chaos**,
which folds along a Rössler-style band and passes near where it has been without
ever visiting the same point twice, and **drunk**, a bounded random walk that
reflects off the ends of its travel.

The **body pad** is a pair of bare contacts, and touching both makes your own
body resistance the control. The pad has no effect until a wire in the bay is
soldered to it, as on the real device.

## Effects and pedals

**Brake + supply drag** treats the tape delay's capstan as a motor with weight:
existing echoes sag on the way down and spin back up on release, and wiring the
motor to the supply means the repeats dive whenever the power fails.

**Ring** puts a multiplier inside the tape delay's regeneration, ahead of the
sum that writes the tape, so every repeat is shifted again and the tail builds a
lattice rather than a row of copies.

- At unison with the note, the even harmonics appear a lap at a time: the toy's
  square has none, and the product adds them.
- An octave under, the echoes have a new fundamental below the note while what
  you played stays clean.
- A few hertz puts each repeat a little further out of tune with the last, so
  the cluster round every harmonic widens as the tail goes on.

**Ring depth** crossfades the plain tap against the product, which is the depth
of the modulation. The ring path is raised by √2, because otherwise a sine
carrier would lose 3 dB a lap from the tail and the repeats would die sooner. A
dc block sits on the multiplied tap, since at unison the product has a constant
term and the tone filter is a low-pass rather than a block.

**Loop filter** is a resonant filter inside the regeneration: sweep it while the
repeats ring, the dub delay move. **Lamp** is a bulb in the same loop. The lamp
dims as it heats, so Feedback past 1 swells and backs off instead of pinning.

**Warble** swings the length of each of the spring tank's four combs on a slow
sine. A long decay stops ringing on the same few resonances and smears across
the notes around them; at the top the combs swing a third of their length, every
lap bends the pitch again, and the tail wobbles. The bay's **verb warble** lane
rides on the knob.

The delay pedal's **shift** mode moves every repeat by the interval set by
**Shift**, and since the repeat is what goes back round, every lap moves again.
Up a fifth, one note comes back as a staircase of fifths, ten times its pitch by
the sixth lap; up an octave it is past the top of the band by then and folds
back down as grit. Down an octave it spirals into the floor and rumbles there. A
third of a semitone either way is a smear that drifts further out of tune each
lap.

**Freq shifter** moves every partial by the same number of hertz rather than the
same ratio, so harmonic input comes out inharmonic. The shifter's feedback
shifts every lap again (the barber-pole effect), which keeps the squeal inside
the global feedback loop from ever settling on a pitch.

**Ring mod** does the same thing to a note that the shifter does, and **Track**
controls whether that ruins the note. Left off, the carrier stands still and the
sidebands fall on a grid unrelated to the note's, which gives the clang the
effect is known for. Soldered to the note the toy is sounding, the ratio picks
which grid comes out:

- A whole ratio (unison, octave, oct+5th, two oct) puts the sidebands back on
  the note's harmonics, so the note stays in tune and only its timbre changes.
- A half ratio (sub, fifth) puts them an octave under and adds a new fundamental
  below what you played.
- The tritone puts them on no harmonic, so the clang is still a clang but it
  follows the melody.

The key line follows only the notes the toy strikes, so a board playing Glint or
the sampler stays on the Carrier knob.

**Track**'s four step positions lock the carrier to the sequencer rather than to
the note: one whole turn per ROM step, or four, sixteen, sixty-four of them. At
×1 that is a tremolo landing on the same phase on every step; at ×64 it is an
audio-rate carrier whose pitch follows the toy's clock, so a starve, a drift or
a hand on the clock multiplier bends the ring along with the tune, and its phase
restarts on every note. Stop the sequencer and the Carrier knob controls the
carrier again.

**Carrier shape**'s third position is a diode bridge, four diodes in a ring,
which is the circuit the effect is named after, and it is the only shape that
responds to how hard you play. The bridge stops conducting near zero, so a quiet
passage comes out gritty and crossover-distorted where a loud one pushes through
to something close to the clean multiply.

**Carrier from** takes the carrier from another machine on the board instead of
the stage's own oscillator, which disables the Carrier knob and Track.

- The kit is a gate: the programme sounds only through the hits, and Mix brings
  the dry signal back underneath.
- The chaos oscillator never repeats, so its sidebands never settle, and it is
  the furthest source from a plain ring the board offers.
- Glint and the toy are pitched, so the output is intermodulation on a grid, not
  a clang.
- The noise source is white.

Whichever machine you pick has to be up in the mix to make a carrier at all, so
it is also in the programme it is multiplying.

**toy step late** and **toy beat late** multiply the toy by itself one of its
steps or one of the kit's beats ago. Two different notes meet in the multiply,
so their difference tone appears as a bass line under the tune that nobody
wrote, and the sum tones fizz above it; where the old note and the new one are
the same, the product is that note's octaves. The step follows the toy's clock,
so a hand on Clock or a pot on the timing pin drags the delay and bends the old
note's pitch on its way out.

**Mix** on a ring modulator is the depth of the modulation rather than a balance
beside it: the travel runs from clean, through amplitude modulation with the
note still audible under its own sidebands, to the suppressed-carrier ring at
the top. The bay's lane on it therefore acts as a VCA on the carrier: a wire
from the drum hit clangs every kick and fades back to the clean note, and one
from the output envelope rings only the loud passages.

The carrier is also one of the patch bay's destinations, and that lane is four
octaves wide, which is where most of this bend's range is. A wire from the drum
hit onto it pushes the carrier up an octave or more on every kick and smears the
sidebands into something very near noise; the bay's chaos and drunk shapes do
the same without the rhythm; the ROM step does it locked to the tune; the heat
does it over minutes.

**Patched into** re-solders where the feedback bus returns: the source mix, the
oscillator's FM input, the toy's own rail (so the output browns out the toy that
made it), or straight into the tape.

**Ground hum** leaks mains fundamental and rectifier buzz in proportion to how
hard the supply is straining, riding the same ripple that's sagging the rail.

**Sub octave** is a flip-flop divider ahead of the clipper that mistracks on
complex input, the same way the vintage pedals it's modelled on did.

**The stompbox** is six circuits, and each clips in a structurally different
place:

- The **screamer** clips inside the op-amp's feedback loop, so the dry note
  walks underneath it.
- The **rat** clips to ground behind an op-amp too slow to keep up, which is the
  fizz.
- The **muff** runs two clipping stages into a scooped tone stack.
- The **germanium** circuit is lopsided, and its bias rides down with the
  signal, so it splutters as a note decays and cleans up as you back off.
- The **octave** circuit rectifies before it clips, coming out an octave up on
  one note and gargling on two.
- The **gate** circuit sits misbiased at the edge of cutoff.

**Battery** is how dead the stompbox's own 9V is. The rail sags as the pedal
works, so notes bloom and collapse, and it shares the board's supply, so Starve
and Latch-up drag it down too.

Every feedback path in the instrument (the delay, the comb filter, the screech
filter, the global feedback bus) is built to run past unity.

The screech filter's **dropped** fold is a filter that fell off the rack.
**Popcorn** is a bad junction whose crackle rides the input and rings at the
cutoff. **Arcing cap** shorts the resonance when it swings too far. **Dirty
pot** jumps the cutoff while it sweeps.

## The parts rack

Every number below was taken from one real board and compiled into the model:
how hard a paperclip chokes the rail, where the reset chip trips, how big the
oscillator's capacitor is. A bent toy is a board whose parts differ from the
schematic, so the parts rack makes them parameters instead of constants.

**Timing pin** is the oscillator's own decoupling capacitor, as the time window
it averages the rail over. Stock, a single note's current draw is gone before
the clock responds to it, which is why a chord sags the pitch without the beat
stumbling. Scrape it off and every note in a chord trips the tune; wind it up
and the timebase stops following the rail at all, so the pitch dives while the
tempo holds steady, which no chip with a single oscillator can normally do.

**Watchdog** sets the voltage at which the reset chip trips. It cannot go below
the point where the die stops running, so at the bottom of the knob the reboot
comes last, after the whole dive has been heard; at the top, the toy resets
while it can still run, so a sag it would otherwise ride out knocks it offline.

**Latch hold** is where a jammed die and its dying supply settle against each
other: low is a growl under the floor, high is a shriek that nearly resolves.

**Clip bite, dwell, charge** and **release** describe the paperclip itself: how
hard it chokes, how long a touch lasts on average, and how fast the clock leaves
and returns while it's down and after it lifts. Stock, release is ten times
faster than charge, which makes Clip chatter sound like a dive and not a warble:
pressing down has to charge a capacitor through the contact, while lifting off
removes it from the circuit. Bring release down toward charge and dives turn
into a warble.

**Clock drag** sets how many octaves the oscillator pin's capacitor can divide
the clock: four octaves stock, without the ceiling that starving the supply
directly has.

**Part spread** is how much the components of the four output stages differ from
one another. At zero, all four are identical and a starved chord collapses in
lockstep; wound up, they scatter, and the chord falls apart over about a second
with the last voice still going. Part spread produces the ragged chord collapse
under Starve, above.

**Mixer drive** is the headroom in the single small output stage all four voices
share. At low settings the stage has room for all four cleanly; at high settings
it squares off once two notes are playing, so playing harder changes the timbre
and not just the level.

**Part grade**, on the drum kit, is the tolerance grade of the ladder DAC's
resistors, and it sets how uneven the converter's steps are. The kit's converter
has further controls:

- **Bit depth** is the word length of the DAC the whole kit shares. Winding it
  down trims the quiet tails off a decay before it trims the hits themselves.
- **Ladder** sets the resistor tolerance in that converter. The error scales
  with the size of the bit changing, so a cheap ladder sounds like one lurch
  instead of hiss, right at the code where every bit flips at once, which for a
  signal is the zero crossing. The lurch matters most for the quietest sounds,
  and a decaying tail is nothing but zero crossings.
- **Overflow** sets what happens when a step's sum does not fit the accumulator.
  Left to wrap, a step stacking several voices under an accent comes out
  inside-out, while the quiet steps around it stay untouched.

**Voice slot** models the kit's one converter shared by eight voices. The chip
works through the sounding voices one at a time and writes the ladder once it
has been round all of them, so the kit's sample rate is not constant: it is the
slot divided into a pass, and a pass is as long as the step is busy. A kick on
its own comes out at whatever rate the board can manage; the same kick under
five other voices comes out coarser, which is the second thing a crowded step
does to a voice and has the same cause as the accent bus sagging. A slot is
counted off the chip's oscillator like the tempo and the envelopes, so a board
going down with its batteries goes coarse as well as slow. At zero the chip
keeps up and the kit sounds as it shipped.

**DAC reference** is the pin that converter multiplies every code by, and a
multiplying DAC accepts audio there as well as a fixed voltage:

- On the toy chip the kit ring-modulates the melody. Each hit becomes a burst of
  the tune's sidebands, and with the toy silent the kit is silent too. On the
  measuring board the kit's centroid moves from 440 Hz to 5.1 kHz.
- On the kit itself every hit is squared: an octave up, with a thump under it
  from the square's own offset.
- On the mic the kit sounds only while you speak.
- On the bus it takes everything ahead of the kit, so with the feedback bus up
  the kit multiplies its own return and screams.

**Reference depth** crossfades the pin between that signal and the fixed
voltage, and the patch bay can wire it.

The dice skip this rack, because randomizing the watchdog or the timing pin
would produce boards nobody could tell apart from a bug.

## Ageing

Ageing holds five slow mechanisms, all off by default, that change the board
over minutes instead of inside a single note.

**Heat** builds over about a minute off whatever you're making the board
dissipate — a screaming feedback loop, a starved rail, an overdriven pedal — and
falls back off over about two. As it builds, the rail holds less, the watchdog
trips sooner, and the spring tank drifts flat. It never settles anywhere fixed,
since where it ends up depends on what you played on the way there.

**Fault clustering** sets whether faults come at a steady rate or in runs. Wound
up, each fault makes the next one more likely for a couple of seconds, so the
same average rate gets redistributed into a minute of nothing followed by a
dozen faults at once, with no increase in the rate.

**Dry joints** makes the solder under the bend slots intermittent: a stage is
out of the signal path some of the time, cutting in and out with no crossfade.

**Re-solder** changes the board's topology without touching any bend's settings:
two bend slots swap places, or the feedback return jumps to a different pin.

**Cross-coupling** wires the feedback loop's own brightness against the supply
it strains: more top end opens the screech filter's resonance, which draws more
current, which sags the rail and shuts the resonance back down a moment later.
Two opposite-sign loops on different time constants never reach a steady level,
so a squeal hunts around a pitch instead of settling on one, with no LFO
involved.

The noise, the fault timing and the reboots are seeded from the clock at boot,
so two takes with identical settings differ.

## The tape machine

The tape machine is the last stage, after brownout: everything upstream is the
room, and the tape machine is what it is recorded onto. Signal crosses the
record head through a pre-emphasis curve and comes back through its exact
inverse, so the highs saturate and transients round off before anything sounds
distorted; running both curves from the same corner instead leaves a small lift
around 1.2 kHz as the machine's presence. Hiss belongs to the medium, not the
mix: the replay head colours it, speed sets how loud it is, and it varies a
little with the signal, as biased oxide does.

**Speed** changes the whole machine: the head gap's high-frequency rolloff, the
replay bump's frequency, the hiss-versus-wow tradeoff, and how long
print-through takes to appear all move with it. 3¾ ips is dark, noisy and
unsteady; 15 ips is nearly a wire.

The top of the band has less headroom than the bottom, as on real tape: short
wavelengths demagnetise themselves, so a machine driven hard goes dull before it
goes loud, while the same machine wound down at the same settings is nearly
transparent. That is most of why tape takes the edge off a cymbal where a plain
clipper only adds to it.

**Bias** runs from underbiased (bright and crunchy) to overbiased (dull and
squashed), trading distortion against top end, and has a record-tilt behavior of
its own in addition to the head gap's.

**Hysteresis** is the half of tape saturation a simple clipper can't reproduce.
A symmetric saturator only ever makes odd harmonics; tape's magnetization curve
is asymmetric: the tape arrives at the gap already magnetised in proportion to
how hard it has been driven, which produces second harmonic. Because that offset
tracks level rather than the note itself, it builds up over a couple of
milliseconds as you play into the machine and takes about a twentieth of a
second to release, which is why a quiet phrase right after a loud one still
comes back warm. Hysteresis defaults to partway on, so the machine sounds like
tape without being asked.

**Head bump** is the low-end lift every tape machine adds, where the wavelength
passing the replay head matches the head's size. The bump is not a single peak:
flux recirculates through the core, so the lift is paired with a scoop in the
low mids, and Speed sets where in the band the pair sits.

- **Dropouts** shed highs before they shed level, so they sound like oxide
  wearing thin and not like a simple power cut.
- **Print-through** is the layer of tape wound underneath bleeding through as a
  dull ghost one wrap behind.
- **Azimuth** lags the right channel and removes its top end, so the recording
  collapses badly if folded down to mono.
- **Wow** is slow drift plus capstan eccentricity, so the pitch never settles;
  **Wraith** is the faster wobble plus the scrape of tape dragging across the
  head.

**Squeal** comes from the free span of tape between the guides acting as a
resonator whose friction drops as the tape starts to move. Below a threshold the
span adds a bit of grain around the resonant note; past it, the damping goes
negative and the span enters a self-sustaining limit cycle that needs no
excitation. Speed sets the note, since a faster tape pulls the span tighter;
Tension sets whether the squeal starts at all, and how often. You hear it twice:
the squeal itself sounding into the room, and everything already recorded on the
tape wobbling at the same rate, since the squeal is the tape's own speed past
the head.
