# Further bends for the drum machine

Candidates, ranked, with where each one hooks. The companion to `fm-bends.md`,
written the same way and for the same reason: nothing here is a decision, and
the ones that are cheap and the ones that change how the kit sounds with no
knife on it are called out as such.

**Items 1 and 3 are built** — `drumSlip` and the accent on the data bus. Their
sections are kept as written, with a note at the end of each saying what landed
and what was decided differently. Everything from 2 down is still a candidate.

## How to judge one of these before building it

`pnpm knife kit` and `pnpm spectrum kit` already answer the two questions, and
for the kit they answer the first one so completely that it stops being a
question. Where the numbers stand today:

| bus            | audible | centroid    | flattest | with a bottom | broadband |
| -------------- | ------- | ----------- | -------- | ------------- | --------- |
| data (9 wires) | 45/45   | 188–4161 Hz | 0.60     | 45            | 2         |
| address (4)    | 20/20   | 187–1849 Hz | 0.21     | 20            | 0         |

The data bus was eight wires when this was written; the accent wire (item 3) is
the ninth, and all five of its faults are audible — 1.42× the level held high,
0.87× held low or bridged to a cymbal row with nothing on it.

Every wire on both buses does something. That is the opposite of the FM chip,
where the interesting reading was the 23/30 and the argument was about which
lines the program never drives — the kit has no dead wires, because a drum
pattern touches every step and every voice, and because the kit already owns the
two broadband sources the FM chip had to go looking for: a noise transistor and
six oscillators that share no harmonics.

So "put a number in the broadband column" is not the test here. Three sharper
ones fall out of reading the stage:

**The kit has no bend that accumulates.** `stepAt` is a pure function of the
tick, and so is `bitsAt` up to the dice. Address and data faults are the same
wrong cell every lap, deliberately — that is the sentence at the top of `bus.ts`
and it is the right sentence. But it means every knife on this machine is a
different sixteen steps, and none of them is a machine that walks away from you.
The dice is the only thing that varies and it varies independently every lap,
which is white. Nothing on the kit is structured in time.

**The step counter has no fault surface at all.** The knife reaches the wires
_out_ of the counter and the wires _into_ the pattern memory. It does not reach
the counter, its clock, its reset, or the accent line — which is a wire the
panel names, draws a row for, and cannot cut. (The clock and the accent line now
do; the reset still does not.)

**Every voice on the kit sees one supply.** `toyChip.ts` gives its bass and
melody voices separate rail trims through `pitchFactorAt`/`ampFactorAt`;
`toyDrum.ts` calls the bare `rail.pitchFactor` once and hands it to everything.
Four of the eight voices are RC oscillators across the supply and three are
tuned networks around a transistor, and on a real board those two do not sag
alike.

## 1. The step clock: a counter that misses edges

The kit's first accumulating fault, and the classic bend on a machine of this
kind — the one people build the Beat Bearing to get.

Everything the pattern bus does assumes the counter counted correctly. A
marginal trace on the counter's clock input does not change which cell answers;
it changes _how many times the counter has been asked_. A missed edge holds the
step, so a step plays twice and the bar is seventeen steps long that lap. Pick
up a neighbour's edge instead and the counter double-clocks, a step is never
fetched, and the bar is fifteen. Either way the phase never comes back: the kit
runs the pattern you wrote, in order, at the tempo you set, arriving somewhere
else every bar.

Nothing else on the board makes that sound. The cut fault has memory — a
floating pin drags after its neighbour a lap behind — but it stands still in the
bar. A slipped clock walks, and it walks against everything with a period of its
own: the rows whose lengths differ from sixteen, the accent row (which carries
its own length, and drifting the voices under a fixed accent is the whole of why
that length is there), the tape loop, and the chip if you have wired anything
across.

Two things it does not drag, and they are worth knowing before building it. _Kit
sync_ is a tempo lock rather than a clock wire — `toyChip.ts` computes
`kitStepHz(p[IDX.drumBpm], sync)` off the tempo control, so the toy follows the
number the kit was asked for and never the edges the counter produced. MIDI
clock out is the other way round: `midi.ts` counts it off the steps the kit
actually clocks, so a slipping counter drags every follower on the wire and
leaves the toy on the same board playing straight. That asymmetry is already
documented in `HANDOFF-tempo-lock.md` as "the lock follows a tempo and never a
downbeat"; a slip bend is the first thing that makes it audible.

Hook: `ToyDrum.process`, the `if (this.stepClock >= span)` block. A rate knob, a
draw per step boundary, and `this.tick` advances by 0, 1 or 2. Counted off the
rail like every other duration here, so a flat board slips more.

One detail to get right rather than to fall into: a held step arrives with
`tick` unchanged, so `rolledAt === tick` and `wordAt` will not re-roll the dice.
The repeated step replays the maybes it decided a moment ago.

Cost: small. ~20 lines in the stage, one control, one row in the panel.

**Built.** `drumSlip`, 0 to 1, shy, under _knife on the bus_ above the address
row, with a named cut (_the bar walks_) at 0.16. Off its own RNG stream, so a
board nobody has touched renders the samples it always did — pinned by
`a clock nobody has touched is the kit it always was`.

The dice question above was settled the other way, on consistency: the existing
rule is that a maybe rolls once per _counter arrival_, which is also why the
retrigger bend does not re-roll a step it hammers a thousand times a second. A
missed edge is not an arrival, so the doubled step is an exact repeat, maybes
included. It reads as a stutter rather than as noise, which is the better of the
two sounds anyway.

## 2. The metal bank on its own supply

Four of the eight voices — both hats, the cowbell and the cymbal — are the same
six oscillators, and the stage says exactly what they are: "six RC oscillators
across the supply, and the only thing that ever silenced one was the supply
going away." Nothing on the panel reaches them as a group. _Tune_ is the kit's
one trimmer and moves the tanks with them; _Bank spread_ widens the six and
explicitly does not transpose; _Squarer bias_ is downstream of the oscillators
altogether. So the one thing a hand on a real board does to that section — lean
on its supply — is the thing this kit cannot do.

Two bends fall out of one hook, and they are different sounds.

**Starve the bank.** A resistor into the bank's supply drops all four metal
voices together and leaves the kick and the tom where they are, which is a
hat-and-cymbal pitch control the kit has never had. It also slows the beating
between the six, because they are six RC oscillators and they all slow together
— so the cowbell's two-oscillator beat and the cymbal's clatter stretch out with
the pitch rather than just transposing. `MetalBank.step` already takes a pitch
factor; this is a second trim multiplied into it.

**Gate the bank.** Solder a trigger line to that supply and the six stop between
hits. The stage's own comment is the argument for why this is interesting:
nothing on the board stops the bank, which is why "two hats in a row are two
different hats" and why an 808 hat has a life a sample of one does not. Take
that away deliberately and the hats collapse toward being the same hat every
time — but not quite, because the phase they come back at depends on how long
the gap was, so a pattern with even spacing gets a machine that sounds sampled
and a pattern with uneven spacing does not. That is a more interesting result
than a hard sync would be, and it is the cheaper thing to model: hold `inc` at
zero while the gate is shut rather than resetting `phase`.

Hook: `MetalBank.tune`/`step` for the trim, `ToyDrum.process` for where the gate
comes from (the choke wiring's list of voices is the obvious source of the
choice — it is already the "which trigger is soldered where" control).

Cost: small. The bank is 40 lines and both changes live inside it.

## 3. The accent line has no knife

`bitsAt` runs the voice word through `this.dataBus`, eight wires wide. The
accent does not go through it — `accentAt` reads its own bit straight out of the
param, and the stage says so: "the accent rides a line of its own and is not in
this word." Its _address_ is knifed along with everyone else's, because
`accentAt` calls `stepAt`; its data wire is the one wire on the pattern bus that
nothing can reach.

Held high, every step is accented. With _Accent sag_ up that is not a loud kit
and it is not a compressor either: the cap never gets a lap to recover in, so
what comes out is weighted by how many voices each step strikes, and the kit
pumps against its own pattern density with no knob moving and nothing in the
signal path. Held low is a row you can see and never hear, which is the same
sentence the data bus already earns for the voices.

Hook: widen `this.dataBus` to nine and put the accent bit in the top, or give it
its own two-choice control. The former is more honest about the part and gets
"bridged" for free — an accent bridged to the cymbal's trigger is a machine that
only accents what it crashes on.

Cost: very small, and it closes a gap the panel already implies.

**Built**, the first way. `DATA_LINES` in `drums.ts` is `GRID_ROWS.length`;
`bitsAt` became `wordAt` and folds the accent into bit 8 before the bus read;
`fire` splits the word back out. The _Data line_ slider is nine wires wide, D8
is the accent, and there is a named cut (_accent on everything_). Existing links
are untouched — the voice wires kept their numbers, so D0–D7 still mean what
they meant. `pnpm knife kit` and `pnpm spectrum kit` sweep the new wire for
free: both read the slider's max.

## 4. The dice, as a comparator on the noise transistor

There is no random number generator on a board like this. What decides a "maybe"
step is a comparator on the hiss, and `chance` is where its threshold sits. The
model half knows this already: `bitsAt` and the noise voices draw from the same
`this.rng` stream, and the separate `burstRng` exists precisely so that _hold
times_ do not perturb the hiss. What is missing is the other direction — the
dice reads the raw stream and never the junction's state, so `noiseBias` does
not reach it.

Connect them and the noise knob acquires a second job. Near the knee the
junction latches in and out instead of conducting steadily, `noiseGate`
collapses toward zero, and a comparator on it stops crossing its threshold: the
maybe steps freeze into whatever the junction last decided instead of rolling.
The snare and the hats are already breaking up when this happens, so the kit's
pattern goes rigid exactly when its voices start spitting, which is one fault
with two consequences rather than two faults.

Be honest about the size of it. `BURST_LONG` is 80 ms and a step at stock tempo
is 127 ms, so the correlation is under a step: what you get is a dice whose
_rate_ moves with the noise knob and which is sticky over a step or two, not a
pattern that sits still for bars. Making it sit still for bars means longer hold
times, and that is a claim about the transistor rather than a knob — it would
move the popcorn bend as well, which is a real sound somebody has already tuned.

Hook: `bitsAt`, one line — compare against the junction rather than the stream.
`this.noiseGate` is already computed per sample and already in scope.

Cost: the cheapest thing on this list. Its interest is that it is a correction
rather than an invention.

## 5. Trigger current, per hit, on the rail

The kit loads the shared supply: `rail.reported = loadSum / io.n`, read by
`ToyRail` a block later because the chip owns the tick. But `loadSum` is
rectified _output_, averaged over 128 samples. What actually dips a supply on a
drum machine is the trigger pulse — a one-shot dumping charge into a network —
and that is a spike an order of magnitude shorter and in a different place in
time from the sound it produces.

The consequence is the crosstalk everyone knows a cheap kit for and this one
does not have: the bank's pitch flicking down on every kick, before the kick
arrives rather than during it. The bank is across the supply and the tanks are
not, so the same dip does two different things to the two halves of the kit —
which is item 2's asymmetry again, arriving for free once the voices stop
sharing one factor.

`this.pulse[v]` is already the per-sample charge into every network. The work is
a second load term off it and a decision about whether the rail's `decouple`
part should average it (a chord does not stutter the tempo; a kick probably
should still be allowed to flick a hat).

Cost: small in the kit, but it touches `ToyRail`, which everything else on the
board hangs off — and it changes how the kit sounds with no knife on it, which
is the cost that matters. Measure `pnpm ab` before and after.

## 6. The clap's burst oscillator

`clapsLeft = 3` and a 9 ms gap, both compiled in — though the gap is at least
counted off the rail, so a sagging board already spreads the three into a flam.
The generator making those three is a small oscillator, and the interesting
thing about small oscillators on this board is what happens when you take them
somewhere they were not meant to go: the retrigger bend already documents that
past roughly 40 Hz "the retrigger period stops sounding like rhythm and becomes
the pitch". A clap whose bursts are at 300 Hz is a buzz with a noise timbre —
one the metal bank cannot make, because it is noise rather than squares — and a
clap at 4 Hz is four handclaps arriving separately.

Cost: very small. One voice, ~10 lines, and the count wants to come with it or
the fast end runs out of bursts before it is audible.

## 7. The one-shots share a timing rail

Eight monostables in one package come off one supply, and simultaneous triggers
steal charge from each other. So a step stacking four voices is four narrower
pulses than the same voices struck alone.

The kit is already unusually well set up to make that matter. Pulse width is not
a volume here — it is where the charge goes: narrow is a spike the coupling cap
passes as a click, wide is a shove the cap blocks. And the tanks' pitch sweep
comes off drive, so a narrower pulse is also a lower start to the swoop. A busy
step would come out with less click, less body and a flatter kick than a bare
one — a third thing a crowded step does to a voice, alongside the accent cap
that is already there and the mux slot that is already there.

The risk is that it is a third helping of the same idea. Accent sag is amplitude
and this is spectrum, so they are not the same, but they move together and
somebody with both knobs up may not be able to tell which is doing what. Worth
building only if it measures as a different thing on `pnpm spectrum`.

Cost: small.

## 8. Tempo as a modulation destination

`DEST` has 27 entries and `chipClock` is one of them. The kit's step clock is
not. So the patch bay can wire an LFO, a body-pad axis or the feedback bus onto
the toy's timebase and cannot do it to the machine that actually keeps time on
this board.

Cheap, obviously useful, and slightly dull on its own — modulating a tempo is
not a bend, it is a feature. It gets more interesting downstream: the body pad
onto the tempo is scrubbing the kit by hand, and with MIDI clock out on it the
whole wire lurches with you.

Cost: very small. One `DEST` entry, one read in `process`, one row in the panel.

## 9. The pattern as a circulating shift register

The large one, and the one to be suspicious of.

Cheap machines of this vintage do not hold the bar in RAM the sequencer
addresses. They circulate it: a shift register clocked by the step counter,
output tied back to input, with the panel writing into the loop. Put the knife
_in the loop_ — invert a bit, delay the return by a step, tie one voice's output
to another's input — and the pattern rewrites itself as it plays. Deterministic,
period-finite, and the first thing on this machine that composes with itself.

It is the answer to the framing at the top of this file, and it is also the item
whose cost is not in DSP. The pattern lives in the param pack, which the main
thread owns and the worklet only reads. A self-modifying pattern either needs a
worklet→control writeback path — `MeterMsg` already carries `hits` up every
frame, so the channel exists, but writing controls from it lands in undo, in the
URL and in the preset system, and none of those want sixteen writes a second —
or it lives as a shadow register in the DSP, in which case the grid on screen
stops describing what the machine is playing. Both are real designs. Neither is
small.

And it destroys the pattern. That is authentic — it is what the bend does on the
part — but it is a different relationship with the undo stack than every other
knife on this board, all of which you can take back out.

Worth writing down. Not worth starting without deciding the writeback question
first.

## Not proposed, and why

- **Per-voice level and tuning trimmers.** Real on the part, eight sliders on
  the panel, and the interesting half of it is already there as _Tune_ plus the
  tank table. Knobs, not bends.
- **Voice stealing.** The kit's eight voices are eight sets of parts, not a
  pool. The mux already models the one thing they genuinely share.
- **Resetting the metal bank on a trigger.** Covered by item 2's gate, which is
  the same sound arrived at through a mechanism the board has.
- **A second noise source.** The FM chip needed one. This kit has an avalanche
  junction, six oscillators and a converter that lurches at zero crossings.
