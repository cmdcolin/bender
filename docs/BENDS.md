# Bends

Nothing here is a sample. Every fault is a real mechanism, modelled the way the
actual hardware fails. The toy's whole chip runs off one RC oscillator, so
pitch, tempo and envelopes are the same clock divided three ways — anything that
touches the clock touches all three at once, and there's no setting where they
come apart.

## The shared power rail

**Starve** sags the supply the toy keyboard, the drum machine and the FM chip
all share. It's a resistor to ground, so it keeps drawing current even after the
chip has gone quiet — a quarter of the way up, the toy runs flat and dives;
three-quarters, it reboots several times a second. Past a threshold the watchdog
decides the supply has failed and resets the chip, restarting the tune from
wherever it was. Reboots never land on a metronome: the watchdog's own trip
point drifts with heat, and the reset line holds for somewhere between 40 and
130 ms, by which point the rail has moved somewhere different anyway. The lamp
above the keys reads the rail itself, in volts — 4.5 V on fresh cells — and
shows **reboot** whenever the watchdog fires.

**Reservoir** is how much capacitance sits behind the supply, and it decides
whether a starve lands or travels. Stock, the rail follows its load in under a
millisecond, so a dive arrives instantly. Wind Reservoir up and the same starve
gets a shape: the pitch leaves from where it was, decelerates as the cap and the
pot find balance, and settles at the bottom — taking tempo and envelopes down
with it, since they're all on the same rail. The travel runs from 17 ms to two
seconds, and it's geometric rather than linear, so the sweep sits through the
middle of the knob rather than crushed against one end.

**Clip chatter** is a paperclip dragged across the supply pads by hand: a choke,
not a short. The rail dips and recovers at whatever rate Reservoir allows, a few
tens of milliseconds at a time, at a rate that clusters rather than ticking
evenly, because a hand doesn't keep time.

**Clip on clock** is the same paperclip landed on the oscillator pin instead of
the supply. Starving the supply directly tops out at about two-thirds of an
octave before the chip stops running altogether; dividing the clock has no such
ceiling, so this reaches four octaves at the top of the knob and takes the whole
timebase — pitch, tempo, envelopes — down with it. Leaving is slow, since the
paperclip is charging a found capacitor through the contact; returning is
instant, since lifting the clip removes it from the circuit. This only works
because the oscillator pin is the one high-impedance node on an otherwise
low-impedance board — it needs a toy clocked off a bare RC oscillator rather
than a resonator, which is what the cheap ones used.

**Latch-up** is the brownout that doesn't reboot. On a collapsing rail, CMOS can
jam instead of resetting: the die holds whatever note was sounding and keeps
drawing current while the output stage sits frozen, so one note screams and
dives for up to a second before the current finally gives out and the watchdog
gets its power cycle. It happens more readily to a toy that's been running a
while and heated up, not to one just switched on.

**Crystal drift** lets the toy's own clock wander off the ratio you set against
the drum machine. Nothing pulls it back, so the two never lock: they drift out
of alignment, swing back close to it, and drift apart again, for as long as you
leave it running.

**Junk in the counter** is what happens on the way back from a brownout.
Pressing play always starts the tune at step zero; a reboot doesn't, because the
program counter comes back holding whatever was in its latch when the rail
failed, so the tune as often resumes from the middle of itself as from the top.

**Batteries** and **Lead resistance** both model a supply that's degraded, but
in different ways, and it's easy to conflate them. Batteries is how flat the
cells are: flat cells hold a lower resting voltage and more internal resistance,
so the rail never fully recovers between notes, and the whole toy runs low and
late — pitch, tempo and every envelope on that divider stretch out together.
Lead resistance is a resistor in series with the cells, and it only matters
under load: with nothing drawing current, it drops nothing, so the rail rests
exactly where a stock board would however far up the knob is. Play a note and
it's in the way — the supply sags on the attack and climbs back between hits.
Batteries is a toy running out; Lead resistance is a toy that whoops on every
note and never runs low to begin with.

**Bend spot + pot** solders a virtual potentiometer straight onto the die, at
one of four points: the clock, the counter (which scrambles the melody), the DAC
bias, or the gate line.

Each of the keyboard's four voices also has its own independent output stage on
this same rail, which is why a starved chord collapses raggedly rather than all
at once — see **Part spread** under [the parts rack](#the-parts-rack) below.

## The FM chip's register bus

The FM chip isn't played — it's configured, one byte at a time, by a processor
that decides what the sound should be and writes it. A register holds whatever
it was last told until something writes it again, which makes these faults
sticky in a way the rail faults aren't: a starved rail recovers the instant you
let go of the knob, but a byte that landed wrong stays wrong until the next
write happens to touch that register.

Four things can happen to any one of these wires: forced **to ground**, forced
**to +V**, **bridged** to its neighbour, or **cut**. A bridged pair can no
longer disagree, so whichever driver pulls low wins. A cut wire floats, and a
floating wire is the only one of the four that will not stand still: it starts
on whatever the bus was carrying at the moment it was cut, but the parted trace
still runs the length of the board beside the one next to it, and a few
picofarads of that is enough to drag a pin nobody is driving after its
neighbour's edges. So the bit holds for a word or two and then sets off after
the traffic next door, always a lap behind and never quite arriving. **Cut
depth** is how far through the trace the knife went: back it off and it still
conducts some of the time, and every write that lands slams the bit back to the
truth in between, so the melody flickers between the version the processor sent
and the version the wire drifted to.

The most obvious result is the key-up bit getting stuck. A note ends when the
processor writes that bit back down and the chip sees it change; hold the wire
high and it never changes, so the note simply never ends, and later notes arrive
as pitch changes under an envelope that never restarted. Hold it low instead and
the key never goes down, which is a chip that plays nothing. The frequency's top
bit shares a byte with the key-on bit, so a fault there moves pitch and whether
the note happens at all together. Volume goes out as its own nibble, so a stuck
bit there leaves one of the four voices at the wrong level for good. **Address
line** faults are the more violent case: the byte arrives intact but gets filed
under the wrong register entirely, so whatever should have landed there never
does.

**Slip the strobe** is a different failure altogether, and it corrupts nothing.
A register write is two things arriving together — a number naming the register,
and the value to put there — and a pulse called the strobe is what tells the
chip to latch both at once. Make that pulse marginal and the chip sometimes
misses it, so the value commits to whichever register the last pulse that did
land had named. Every byte crossing the bus is still exactly what the processor
sent; it's just paired with the wrong register, one write late. Misses compound:
two in a row is two writes of lag, and wound all the way over, the chip never
advances past the first register it ever latched. On a single note, four writes,
this reads as a smear. The built-in effects fire hundreds of writes a second, so
the same fault turns a chirping cricket sound into one continuous drone — the
same place a stuck key-up bit lands, arrived at from the opposite direction.

**Cut the wave ROM** targets the one bus on this chip the processor never
touches. There's no sine computed here — the operators look one up in a
256-entry table addressed directly by phase, with the top bits mirroring and
flipping the sign to build the rest of the cycle. **Wave line** cuts one of
those address wires. Nothing accumulates here, so releasing the knife gives you
a clean sample on the very next read. Which wire matters more than whether you
cut it: hold the mirror bit and the quarter-wave runs twice instead of turning
around, giving a sawtooth edge and an extra octave; hold the sign bit and every
read comes from the top half of the table, an all-octave rectified tone; cut low
enough down the bus and the effect is nearly inaudible.

**The hidden test register** is undocumented — the factory used it to test the
die, and the only write a driver ever makes to it is the one that clears it at
power-on, since a chip that booted with a stray test bit set would never sound
right. A **Data line** fault on that clearing write sets bits nothing in normal
operation ever sets, and every later patch change sends the clear again, over
the same broken wire, corrupting it identically each time. What those bits
switch isn't part of the normal register vocabulary at all: every operator
forced wide open turns envelopes into a plain gate, the envelope counter forced
to its fastest step collapses every note to the same four-millisecond click, the
output latch skips every other slot for half the sample rate and full aliasing,
and the latch's sign line held rectifies everything reaching the pin. No
combination of legal patch bytes produces any of that.

**The effect ROM** is the source of the chip's canned effects — a bird call,
surf, wind, a siren, crickets — and none of them are samples. Each is a short
program in the processor firing register writes at the chip hundreds of times a
second: sweeps and key-ons for the bird, the modulator's feedback pushed into
noise for surf, that same noise under a random walk for wind, and so on. Because
an effect is the busiest traffic the bus ever carries, the dataline bend scales
with it — every one of those writes lands wrong, and under **Cut** the drifting
bit is chasing that traffic, so the corruption tracks the effect's own motion
rather than sitting at a fixed offset. Running an effect also borrows the whole
patch and a fourth voice, so the keyboard drops to three voices while it plays.
Starving the rail underneath decouples the two: the processor's clock is a
resonator that doesn't care what the supply is doing, so the effect keeps
arriving at its usual rate while the chip it's addressed to dives and slurs
underneath it.

## Inside the drum voices

The kit's pitched voices — kick, tom, and the body under the snare — aren't
oscillators with envelopes on them. Each one is a bridged-T network: a handful
of parts around a transistor that does nothing until the trigger dumps a pulse
into it, and then rings. The ringing is the drum, which means the decay isn't a
shape laid over a tone. It's how much of each swing the transistor hands back.

**Ring** is that fraction, and a fraction has a far side. Under about nine
tenths of the travel the network gives back less than it took and a kick is a
kick. At the crossing it gives back exactly what it took and never stops. Past
it, it makes up the difference every cycle and grows into its own clipping — so
the pitched voices stop being drums and become notes, which the pattern retunes
rather than restrikes. The trigger floor is wired to the same fact: a network
that never drains never gets back under the floor, so a latched voice is also a
voice the sequencer can't strike again.

The pitch falling through a hit comes off the same part rather than being drawn
on. The pulse drives the transistor a long way from where it settles, and what
the network is tuned to depends on what the transistor looks like from outside,
so a big swing is a high tuning that comes down as the swing does. Hit it harder
and the swoop starts higher and lasts longer — an accent is a pitch as well as a
weight, which no envelope shape can say.

**Trigger pulse** is how long the one-shot holds that line down. The charge is
the same either way, so this is where it goes rather than how much of it there
is: narrow is a tall spike that gets through the coupling cap as a click and
shocks the network cleanly, wide is a shove spread across a good part of a
cycle, which the cap blocks and the network partly cancels — no click, less
body, and least of both on the voices pitched high enough that the pulse
outlasts them.

**Snappy** is what the snare is made of. All the way up is the noise transistor
alone, which is the snare the kit used to have; down, the two tuned networks
under it come through instead, beating against each other. Tune reaches those
and doesn't reach the hiss, so a snare with any tone in it moves with the rest
of the kit.

## The metal bank

The other four voices are one part. The cowbell, the two hats and the cymbal all
come off a single bank of six square oscillators, tuned so that no two of them
share a harmonic. Nothing on the board ever stops that bank: a trigger opens an
amplifier and that's all it does, so every hit catches the six wherever they
happen to be and no two hats start on the same edge.

The six go into a stage with nothing like the headroom for six of them, which is
what makes a clatter out of them rather than six tones. Summed and left alone,
the loudest harmonics in the pile all belong to the fastest oscillator and the
hat comes out ringing on a note; squared off, the edges of all six land in it at
times that never come round. The cowbell is soldered in ahead of that stage,
which is why it's the one metal voice with a pitch left in it.

**Metal** is the pot on the hats' amplifier, between that bank and the noise
transistor the hat used to be made of — the same transistor the snare and the
clap are still hanging off. Down the travel is the old hat, and every hit off it
is the same hit; up it, no two are.

**Bank spread** leans on the one resistor chain that sets all six. The ends of
the chain move and the middle stays, so the bank widens rather than transposing
— that's Tune's job. Every metal voice moves at once because they're the same
six parts: wind it up and the cowbell detunes, the cymbal turns to glass and the
hats get grittier.

**Cymbal tone** is a wiper between two taps on the cymbal's own filter rather
than a corner being swept, which is why it's a tone control and not a second
volume. Down it keeps the body the hats throw away; up it's most of the way to
being a hat.

The two hats share one cap, which is what a hi-hat pedal is. A closed step
doesn't silence a ringing open hat — it drains what's left of it in a hurry, so
writing hats under an open one is a foot on the pedal rather than a mute. What
does the draining is one resistor across that cap, and **Choke** is where it's
soldered: move the wire and any voice does that to any other. _Kick cuts the
kit_ is a gate on everything; _each cuts the next_ passes it round the ring. The
hats keep their pedal wherever the wire goes, because that pair is wired in the
metal rather than on the panel. It listens to the trigger line, so a pad, the
mic and a bridged wire choke exactly as well as the sequencer does.

**Accent** and **Accent sag** make the accent row a circuit rather than a flag.
The accent is one cap feeding every voice on the board, and sag is how much each
accented step takes off it. Left at nothing the bus is stiff and every accent is
the full one. Wound up, a step stacking four voices hands each of them less than
a step stacking one, and a second accent arriving before the cap has caught up
lands softer than the first — so a roll comes out shaped without a knob moving.

## The drum machine's pattern bus

The same four wire faults apply here, between the step counter and the pattern
memory instead of the ROM. Nothing malfunctions: the counter keeps counting and
the playhead keeps tracking the step it always did — what changes is which cell
the memory answers with.

**Address line** faults change which step you get. A0 held low files every odd
step on top of the even one below it, halving the pattern's resolution; A3 held
high hands you only the back half of the bar and never the front. A row's length
lives in the counter rather than the memory, so a leaned-on address line can
reach cells a short row could never have played on its own.

**Data line** here is the trigger line itself, not an amplifier — that's what
separates it from cross-patch. Force one high and that voice fires for real on
every step the machine fetches, and every other instrument listening to that
trigger line hears it too. Force one low and it's a row you can see and never
hear. Bridge a pair and the two fire only where both rows agree, thinning a busy
pattern down to what they have in common.

## The trigger patch's other faults

See [the trigger patch](USER-GUIDE.md#the-trigger-patch) for how to wire it;
these are what happen once it's live.

**Retrigger** hammers the drum machine's trigger line, and past roughly 40 Hz
the retrigger period stops sounding like rhythm and becomes the pitch. **Trigger
floor** sets how far a voice has to have decayed before its one-shot will answer
the trigger line again — at zero, every pulse strikes; at maximum, a voice won't
restrike until it's fully finished. It sits on the trigger line itself, so the
sequencer, pads, mic and keyboard all queue behind it too.

**Cross-patch** bridges two drum voices' envelope pins, so one voice's amplifier
ends up hearing another voice's envelope — a hit you can hear opens a channel
nothing struck. **Rotate** cycles this through the original three voices;
**Whole kit** extends it to every voice on the board, so a voice with no steps
of its own can still fire off another voice's pattern.

**Mic patch** wires the mic past the mixer entirely, onto one of several points:
the chip's supply rail, the oscillator's FM input, the delay's feedback path,
the ring modulator's carrier, or the trigger line of the drum machine or the
glitch buffer.

**Struck by** puts a dropped audio file on a trigger line of your choice — one
of the kit's voices, any hit at all, a keyboard note, or the mic. With
**Ending** set to one-shot, the file plays as one more drum voice, retriggered
from the top on every hit; left as a loop, each hit just drops the needle back
at the start of whatever's already playing.

## The patch bay and body pad

The patch bay is four free wires. Its sources: the bay's own LFO, the sag on
whichever supply is dying, the output envelope, the mic, an axis of the body
pad, the feedback bus itself, the chip's sequencer ramping across each ROM step
(the one source that stays locked to the tune), either box's trigger line, or
how hot the board has gotten — the slowest thing on the board, and the one that
never resets to where it started. Its destinations: a filter cutoff, a carrier,
a clock, the shift or word-length controls, tape speed or delay time, glitch
chance, stompbox drive, the kit's trimmer, the spring tank's decay, the drum
cross-patch amount, the feedback amount, or another wire's own depth. One
destination, **starve**, isn't a stage at all — it's the shared rail, so a wire
landed there reaches everything powered from it at once, whether that's a drum
hit browning the chip out on every kick or an LFO that ages the rail in time.

The bay's oscillator also offers two shapes beyond the usual LFO set: **chaos**,
which folds along a Rössler-style band and passes near where it's been without
ever landing there twice, and **drunk**, a bounded random walk that reflects off
the ends of its own travel.

The **body pad** is a pair of bare contacts: touching both makes your own body
resistance the control. It does nothing until a wire in the bay is soldered to
it — the same as the real thing.

## Effects and pedals

**Brake + supply drag** treats the tape delay's capstan as a motor with weight:
existing echoes sag on the way down and spin back up on release, and wiring the
motor to the supply means the repeats dive whenever the power fails.

**Freq shifter** moves every partial by the same number of hertz rather than the
same ratio, so harmonic input comes out inharmonic. Its own feedback shifts
every lap again — the barber-pole effect — which keeps the squeal inside the
global feedback loop from ever settling on a pitch.

**Patched into** re-solders where the feedback bus returns: the source mix, the
oscillator's FM input, the toy's own rail (so the output browns out the toy that
made it), or straight into the tape.

**Ground hum** leaks mains fundamental and rectifier buzz in proportion to how
hard the supply is straining, riding the same ripple that's sagging the rail.

**Sub octave** is a flip-flop divider ahead of the clipper that mistracks on
complex input, the same way the vintage pedals it's modelled on did.

**The stompbox** is six circuits, and each clips somewhere structurally
different rather than running the same curve through a different formula: the
**screamer** clips inside the op-amp's own feedback loop, so the dry note walks
underneath it; the **rat** clips to ground behind an op-amp too slow to keep up,
which is the fizz; the **muff** runs two clipping stages into a scooped tone
stack; the **germanium** circuit is lopsided, and its bias rides down with the
signal, so it splutters as a note decays and cleans up as you back off; the
**octave** circuit rectifies before it clips, coming out an octave up on one
note and gargling on two; the **gate** circuit sits misbiased at the edge of
cutoff. **Battery** is how dead the stompbox's own 9V is — the rail sags as the
pedal works, so notes bloom and collapse, and it shares the board's supply, so
Starve and Latch-up drag it down too.

Every feedback path in the instrument — the delay, the comb filter, the screech
filter, the global feedback bus — is designed to run past unity on purpose.

## The parts rack

Every number below was compiled into the model from one real board: how hard a
paperclip chokes, where the reset chip gives up, how big the oscillator's
capacitor is. A bent toy is a board whose parts aren't the ones on the
schematic, so here they're knobs instead of constants.

**Timing pin** is the oscillator's own decoupling capacitor, as the time window
it averages the rail over. Stock, a single note's current draw is gone before
the clock notices it, which is why a chord sags the pitch without the beat
stumbling. Scrape it off and every note in a chord trips the tune; wind it up
and the timebase stops hearing the rail at all, so the pitch dives while the
tempo holds steady — something no chip with a single oscillator can normally do.

**Watchdog** sets the voltage where the reset chip decides the supply has
failed. It can't go below the point where the die itself stops running, so at
the bottom of the knob the reboot is the last thing that happens after you've
already heard the whole dive; at the top, the toy resets while it's still
perfectly able to run, so a sag it used to ride out now knocks it offline.

**Latch hold** is where a jammed die and its dying supply settle against each
other — low is a growl under the floor, high is a shriek that nearly resolves.

**Clip bite, dwell, charge** and **release** describe the paperclip itself: how
hard it chokes, how long a touch lasts on average, and how fast the clock leaves
and returns while it's down and after it lifts. Stock, release is ten times
faster than charge, and that asymmetry is the entire reason Clip chatter reads
as a dive rather than a warble — pressing down has to charge a capacitor through
the contact, while lifting off just removes it from the circuit. Bring release
down toward charge and dives turn into a warble.

**Clock drag** sets how many octaves the oscillator pin's capacitor can divide —
four octaves stock, with no ceiling the way starving the supply directly has.

**Part spread** is how far apart the four output stages came out of the parts
bin. At zero, all four are identical and a starved chord collapses in lockstep;
wound up, they scatter, and the chord falls apart over about a second with the
last voice still going — this is the mechanism behind the ragged chord collapse
under Starve, above.

**Mixer drive** is the headroom in the single small output stage all four voices
share. Low leaves room for all four cleanly; high squares off once two notes are
playing, so playing harder changes the timbre rather than just the level.

**Part grade**, on the drum kit, is which reel the ladder DAC's resistors were
sold off — it sets how uneven the converter's steps are. The kit's converter
itself has three more controls worth knowing: **Bit depth** is the word length
of the DAC the whole kit shares, and winding it down trims the quiet tails off a
decay before it trims the hits themselves. **Ladder** governs the resistor
tolerance in that converter, and because the error scales with the size of the
bit changing, a cheap ladder doesn't sound like hiss — it sounds like one lurch,
right at the code where every bit flips at once, which for a signal is the zero
crossing. That lands hardest on whatever's quietest, and a decaying tail is
nothing but zero crossings. **Overflow** decides what happens when a step's sum
doesn't fit the accumulator: left to wrap, a step stacking several voices under
an accent comes out inside-out, while the quiet steps around it stay untouched.

**Voice slot** is the third, and it's the one that says out loud that there's
one converter and eight voices. The chip works through whatever is sounding a
voice at a time and writes the ladder once it's been round them all, so the
kit's sample rate isn't a constant — it's the slot divided into a pass, and a
pass is as long as the step is busy. A kick on its own comes out at whatever
rate the board can manage; the same kick under five other voices comes out
coarser — the second thing a crowded step does to a voice, and it comes off the
same fact as the accent bus sagging. A slot is counted off the chip's own
oscillator like the tempo and the envelopes, so a board going down with its
batteries goes coarse as well as slow. At nothing the chip keeps up and the kit
is the kit it shipped as.

The dice skip this whole rack. A roll here asks for a different way of playing
this board, not a different board — randomizing the watchdog or the timing pin
would just produce boards nobody could tell apart from a bug.

## Ageing

Five slow mechanisms, all off by default, that describe what the board does over
minutes rather than what happens inside a single note.

**Heat** builds over about a minute off whatever you're making the board
dissipate — a screaming feedback loop, a starved rail, an overdriven pedal — and
falls back off over about two. As it builds, the rail holds less, the watchdog
trips sooner, and the spring tank drifts flat. It never settles anywhere fixed,
since where it ends up depends on what you played on the way there.

**Fault clustering** decides whether faults arrive at a steady rate or in runs.
Wound up, each fault makes the next one more likely for a couple of seconds, so
the same average rate gets redistributed into a minute of nothing followed by a
dozen faults at once, rather than actually increasing.

**Dry joints** makes the solder under the bend slots intermittent: a stage
simply isn't in the signal path some of the time, cutting cleanly in and out
with no crossfade.

**Re-solder** changes the board's topology on its own — two bend slots swap
places, or the feedback return jumps to a different pin — without touching any
bend's own settings.

**Cross-coupling** wires the feedback loop's own brightness against the supply
it strains: more top end opens the screech filter's resonance, which draws more
current, which sags the rail and shuts the resonance back down a moment later.
Two opposite-sign loops on different time constants never find a level to sit
at, so a squeal hunts around a pitch instead of settling on one, with no LFO
involved at all.

Underneath all five: the noise, the fault timing and the reboots are seeded from
the clock at boot, so two takes of the exact same settings are still two
different takes.

## The tape machine

The tape machine is the last stage, sitting after brownout — everything upstream
is the room, and this is what it's recorded onto. Signal crosses the record head
through a pre-emphasis curve and comes back through its exact inverse, so the
highs saturate and transients round off before anything sounds distorted;
running both curves from the same corner instead leaves a small lift around 1.2
kHz baked in as the machine's own presence. Hiss lives in the medium rather than
the mix — the replay head colours it, speed sets how loud it is, and it breathes
a little with the signal, the way biased oxide does.

**Speed** moves the machine as a whole rather than as one knob among many: the
head gap's high-frequency rolloff, the replay bump's frequency, the
hiss-versus-wow tradeoff, and how long print-through takes to arrive all move
together with it. 3¾ ips is dark, noisy and unsteady; 15 ips is nearly a wire.

The top of the band has less headroom than the bottom, the way real tape does —
short wavelengths demagnetise themselves, so a machine driven hard goes dull
before it goes loud, while the same machine wound down at the same settings is
nearly transparent. That's most of why tape takes the edge off a cymbal where a
plain clipper only adds to it.

**Bias** runs from underbiased — bright and crunchy — to overbiased — dull and
squashed — with distortion and top end trading off against each other, carrying
its own record-tilt behavior rather than following the head gap alone.

**Hysteresis** is the half of tape saturation a simple clipper can't reproduce.
A symmetric saturator only ever makes odd harmonics; tape's magnetization curve
is asymmetric, arriving at the gap already magnetised in proportion to how hard
it's been driven, which produces genuine second harmonic. Because that offset
tracks level rather than the note itself, it blooms in over a couple of
milliseconds as you play into the machine and takes about a twentieth of a
second to release, which is why a quiet phrase right after a loud one still
comes back warm. It ships wound partway on, since a tape machine you have to ask
to sound like tape is one nobody asks.

**Head bump** is the low end every tape machine adds without being told to — the
lift where the wavelength passing the replay head matches the head's own size.
It isn't a single peak: flux recirculates through the core, so the lift is
paired with a scoop in the low mids, and Speed decides where along the band the
pair sits.

**Dropouts** shed highs before they shed level, which is what separates oxide
wearing thin from a simple power cut. **Print-through** is the layer of tape
wound underneath bleeding through as a dull ghost one wrap behind. **Azimuth**
lags the right channel and eats its top end, so the recording collapses badly if
folded down to mono. **Wow** is slow drift plus capstan eccentricity that never
lets pitch settle; **Flutter** is the faster wobble plus the scrape of tape
dragging across the head.

**Squeal** comes from that same free span of tape between the guides acting as a
resonator whose friction drops as the tape starts to move. Below a threshold
that just adds a bit of grain around the resonant note; past it, the damping
goes negative and the span takes off on its own into a self-sustaining limit
cycle — nothing needs to excite it, it excites itself. Speed sets the note,
since a faster tape pulls the span tighter; Tension decides whether it takes off
at all, and how often. You hear it twice: the squeal itself sounding into the
room, and everything already recorded on the tape wobbling at the same rate,
since what's squealing is the tape's own speed past the head.
