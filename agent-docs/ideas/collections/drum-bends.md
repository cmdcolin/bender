---
name: drum-bends
description: Ranked further bends for the drum machine: a supply for the metal bank, tank-to-tank coupling, audio on the DAC reference, the pattern as a circulating shift register.
---

# Further bends for the drum machine

Candidates, ranked, with where each one hooks. The companion to
`agent-docs/ideas/collections/fm-bends.md`, written the same way and for the
same reason: nothing here is a decision, and the ones that are cheap and the
ones that change how the kit sounds with no knife on it are called out as such.

**Built:** items 1 (`drumSlip`), 2 (`drumBankStarve`, `drumBankGate`), 3 (the
accent on the data bus), 4 (`drumDice`), 5 (`drumTrigLoad`), 6 (`drumClapGap`,
`drumClapCount`), 7 (`drumPulseShare`), 8 (`DEST.drumBpm`), 9 (`drumLoop`), 10
(the sample ROM knife), 11 (`drumBankFm`, `drumBankSync`), 12 (`drumSweep`), 13
(`drumTankCouple`) and 14 (`drumRef`), plus the counter's reset wire
(`drumReset`) and a comparator on a tank's ring (`drumRingTrig`). Every other
numbered item is still a candidate.

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
tick, and so is `wordAt` up to the dice. Address and data faults are the same
wrong cell every lap, deliberately — that is the sentence at the top of `bus.ts`
and it is the right sentence. But it means every knife on this machine is a
different sixteen steps, and none of them is a machine that walks away from you.
The dice is the only thing that varies and it varies independently every lap,
which is white. Nothing on the kit is structured in time.

**The step counter has no fault surface at all.** The knife reaches the wires
_out_ of the counter and the wires _into_ the pattern memory. It does not reach
the counter, its clock, its reset, or the accent line — which is a wire the
panel names, draws a row for, and cannot cut. (The clock, the accent line and
the reset now do.)

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
leaves the toy on the same board playing straight. `docs/MIDI.md` already
documents that asymmetry ("What arrives is a tempo, not a downbeat"); a slip
bend is the first thing that makes it audible.

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

**Built** as `drumBankStarve` (0 to 1, three octaves at the top) and
`drumBankGate` (off, or a voice's trigger line), both in `ToyDrum.process`: the
trim multiplies the pitch factor `MetalBank.step` takes, and a shut gate hands
it zero. Measured on the metal voices alone (`pnpm spectrum` columns):

- Starve takes flatness from 0.49 to 0.96 and the level to 0.41×; the cowbell
  falls to 0.32× as its pair drops under its 500 Hz corner. Tune at 0.5 reads
  0.64 flat on the same voices, but on the whole board it moves the kick too
  (centroid 367 → 197 Hz) where starve leaves it (367 → 241 Hz, kick and tom
  bit-identical).
- Hats on a bank gated by a silent line keep 6% of their level.
- Self-gated hats still differ, because each hit starts where the last one
  stopped: consecutive hats differ by 1.4× their level against 1.1×
  free-running, and `drumBankSync` takes the same pair to 0.00. Gated on another
  voice, the metal speaks only under that voice, which no other bend on the kit
  does.

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
model half knows this already: `wordAt` and the noise voices draw from the same
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

Hook: `wordAt`, one line — compare against the junction rather than the stream.
`this.noiseGate` is already computed per sample and already in scope.

Cost: the cheapest thing on this list. Its interest is that it is a correction
rather than an invention.

**Built** as `drumDice`, free or on the junction. On the junction a maybe rolls
when `noiseGate > 0.5` at the arrival and otherwise repeats the voice's last
answer; free is the old line. Both draw one `rng()` per maybe per arrival, and
`burstRng` is untouched, so the hiss and the popcorn timing are the stream they
were; at full bias the two settings render bit-identical. Measured on a kick
maybe rolling every step at 120 bpm, Chance 0.5, share of arrivals that repeat
the last answer, free against on the junction:

| Noise bias | 1   | 0.9 | 0.7 | 0.5 | 0.3 | 0.1 | 0    |
| ---------- | --- | --- | --- | --- | --- | --- | ---- |
| free       | 51% | 51% | 51% | 51% | 51% | 51% | 51%  |
| junction   | 51% | 51% | 55% | 74% | 97% | 98% | 100% |

Holds shorter than a step did not keep the stickiness under a step or two, as
the estimate above expected. The share of time the junction conducts sets it,
and near the knee that share collapses, so at 0.3 a maybe holds for 37 steps on
average. At 0 the junction almost never conducts at an arrival, so a maybe keeps
its last answer, which on a fresh board is silence.

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

**Built** as `drumTrigLoad`, 0 to 1, off by default so neither the kit nor the
rail moves. Calls made:

- Two consequences of one fault, on one knob. The kit sums `pulseOut` each
  sample into a local sag on the bank's supply, paid back over 20 ms, and the
  bank's tuning drops `2 · load · s / (1 + s)` octaves for sag `s`, so a hit is
  an octave at the top and a crowded step approaches two. The tanks are not on
  that supply.
- The same charge goes to `ToyRail.spike` once a block, and the rail drains a
  quarter of its voltage per hit's worth, on a fresh board too: a rail with no
  lead resistance ignores `reported`, so the spike gets a drain of its own. The
  found cap slows it like every other drain.
- `decouple` stays as it is: the timebase reads the rail behind it, so the tempo
  drifts with the average and the pitch takes the spike.

Measured:

- The bank's own tuning, traced at the top of the travel: one kick −1.01 octave
  7.6 ms in, −0.47 at 30 ms, −0.12 at 60 ms; at half the travel −0.50; kick,
  snare and hat together −1.84. A ringing cowbell's loudest partial goes 800 →
  510 Hz over the 30 ms after a kick.
- One kick takes a fresh rail to 0.81 (0.91 at half). On the `pnpm spectrum`
  board the rail bottoms at 0.35 (0.67 at half); the toy's pitch sits 10% flat
  at the median, and the kit stem's centroid falls 442 → 361 Hz as its own
  tuning sags. Under a kick, snare and hat the toy reads 250 Hz against 300 for
  20 ms.
- `pnpm ab main` with this round's four bends at rest: the branch won 5 of 12
  pairs at a median ratio of 1.008, not separated from a box at load 57.

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

**Built** as `drumClapGap` (0.5 to 250 ms, 9 stock) and `drumClapCount` (1 to
64, 3 stock), both still counted off the rail. A burst also runs down within its
gap (`CLAP_GAP_MS / gap` on its fall, never slower than stock), because with the
stock 14 ms fall a 300 Hz train dipped 21% a cycle and did not buzz. Measured as
the clap's power at the burst rate against rates either side:

- 3.3 ms × 30 reads 4.0× (2.1× with the stock fall), 2 ms × 40 reads 4.8×
  (1.2×); the stock clap reads 1.1× at its own 111 Hz.
- 200 ms × 4 is four onsets 0.20 s apart.
- The spectrum stays put (centroid 4.1–4.2 kHz, flatness 0.57–0.66), so the bend
  changes the clap's rhythm and leaves its timbre.

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

**Built** as `drumPulseShare`, 0 to 1. Voices struck in one call to `hit` share
the rail: each runs at `1 / (1 + 2·share·(n − 1))` of the knob's width at the
same height, so two together run a third as long and four a seventh. Narrower at
the same height is less charge, which is what gives less body and a flatter
swoop; the click edge shortens with it. The scan bend separates the strikes, so
a slow scan undoes the steal. Measured:

- A kick under a hat and a clap, at the top of the travel: power under 120 Hz
  0.044 against 0.161 unshared (27%), swoop start 75 Hz against 100. At half the
  travel the body is 44%. A lone kick renders bit-identical.
- On the `pnpm spectrum` board the kit stem goes 1.00× → 0.66× and its centroid
  442 → 899 Hz (flatness 0.057 → 0.130). Accent sag moves the other way: with
  every step accented at 2×, sag takes the centroid 660 → 592 Hz and sharing
  takes it 660 → 1167. Sag darkens a busy pattern; sharing thins it, so it
  ships.

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

**Built** as `drumLoop`, a shadow register in the DSP: off, return inverted,
return a step late, each row into the next, return through an XOR. The writeback
question went the shadow's way. Calls made:

- Nothing writes the controls, so undo, the URL and presets never see it. The
  grid lights off `MeterMsg.hits`, so they show what struck.
- The register loads from the panel when the knife goes in, and a row loads
  again whenever the panel writes it, which is the panel writing into the loop.
  Off hands back the grid; a reboot reloads it.
- What re-enters is what played, dice included, so a maybe that came up is a hit
  in the loop from then on. The voices latch at each counter arrival, so a
  retriggered step plays what the register handed out.
- The accent stays on the panel and voices walk under it.
- The XOR taps the next stage. A sixteen-step row then comes back within 255
  bars (checked on the stock, four-on-the-floor, offbeat-hat and rock rows);
  taps of 3, 5 and 7 did not repeat in 4096 bars, which is noise, not a pattern.

Measured on the `pnpm spectrum` board, kit stem:

| knife                  | level | centroid | flat  | sub  | low  | high |
| ---------------------- | ----- | -------- | ----- | ---- | ---- | ---- |
| off                    | 1.00× | 442 Hz   | 0.057 | 0.85 | 0.09 | 0.03 |
| return inverted        | 1.72× | 1859 Hz  | 0.274 | 0.51 | 0.22 | 0.14 |
| return a step late     | 0.93× | 463 Hz   | 0.064 | 0.86 | 0.08 | 0.03 |
| each row into the next | 0.91× | 1931 Hz  | 0.301 | 0.37 | 0.31 | 0.17 |
| return through an XOR  | 1.18× | 514 Hz   | 0.068 | 0.71 | 0.20 | 0.04 |

Inverted fills the empty rows, so on odd bars all eight voices strike most
steps. A step late changes the spectrum least and the groove most: every row
moves a step a bar.

## 10. A knife on the sample ROM

No bend reaches the sampled kit's memory, and bending a sample ROM is the
best-known drum-machine bend (SK-1, RZ-1, HR-16).

- Lay the eight slabs end to end as one address space, so an address fault reads
  the kick from the cymbal's slab.
- An end-stop cut lets a voice run past its slab into the next one.
- A direction wire on the counter plays the slabs backwards.
- Data faults on the 12-bit words: a stuck top bit is a square-ish fuzz.

**Built** as `drumRomCount` and the `drumRom{Addr,Data}{Line,Fault}` pairs,
sharing `drumBusCut` with the pattern bus. No patch-bay lanes yet: the pcm
keyboard's `DEST.pcmAddrLine` lanes are the template if a sweep across the
address wires turns out to be worth having.

## 11. The metal bank into the tanks

- FM: `metal.clash` into the `f` argument of `tank.process` turns the kick into
  a gong.
- Sync: reset the bank's phases at each tank zero crossing, so the hats pitch to
  the kick and swoop with it. A sync once a cycle is a different sound from the
  sync once a trigger that "Not proposed" below turns down.

**Built.** FM goes through zero: `BANK_FM` is 12× the resting tuning, because
under 1× the bank runs too fast against a 48 Hz kick for the index to reach
anything audible. The level drops about 4× at the top of the travel.

## 12. A sweep trimmer

`TANKS[t].sweep` is a constant. A knob from about −1 to 4 gives Syndrum zaps at
the top and kicks that rise at the bottom. `BridgedT.process` computes
`w = f * (1 + sweep * env)`, which goes negative and blows the filter up, so the
negative end needs a floor. **Built** as `drumSweep`, −1 to 8, with
`SWEEP_FLOOR` at three octaves down.

## 13. Tank-to-tank coupling

Kick tank output into the tom tank's `drive`. With both rings past the latch,
two coupled self-oscillators beat, lock and go chaotic. Cost: small.

**Built** as `drumTankCouple`, 0 to 1, with `TANK_COUPLE` at 0.05 of the kick's
swing into the tom's drive per sample at the top; with no kick ringing the tom
renders bit-identical.

- A kick alone grows a tom ring under it: the added signal is 0.8× the kick's
  level at a quarter of the travel and 3–4× at the top, at 100–270 Hz against
  the kick's 33–75 Hz.
- On the `pnpm spectrum` board (kick and tom only) the top of the travel takes
  the centroid from 81 to 154 Hz and the low band from 0.11 to 0.66; Bank FM,
  the nearest bend, puts the same voices at 662 Hz with half the power in mid.
- Both latched (Ring 0.95), 90% of the power between 20 and 400 Hz sits in 3
  one-hertz bins uncoupled, 5–6 at 0.05–0.25, 16 at 0.5 and 7 at 1.

## 14. Audio on the DAC's reference

A multiplying DAC at `out = this.muxHeld * rail.ampFactor`: kit × toy chip is
ring mod ahead of the mux, kit × kit is squaring distortion an octave up. Cost
depends on whether the chip's output is in `ctx` by then.

**Built** as `drumRef` (fixed, the toy chip, the kit itself, the mic, the bus)
and `drumRefDepth` (1, with the `kit DAC ref` bay lane). The toy runs ahead of
the kit, so the chain writes its tap difference to `ctx.toy`, and only while the
kit asks for it. An op-amp at 4× feeds the pin and clips at ±1.5. The product is
taken every sample after the hold, so a coarse kit still carries the toy at full
resolution. Calls made:

- Full depth by default once a reference is picked, so a silent pin is a silent
  kit. Depth backs off from there.
- The bus is `io.l` as the kit finds it: the toy, the mic and the feedback
  return. On a stock board that equals the toy; with feedback up it is a loop.
- Self-squaring keeps the offset, so every hit has a thump under its octave.

Measured on the `pnpm spectrum` board, kit stem:

| reference         | level | centroid | flat  | sub  | low  | high |
| ----------------- | ----- | -------- | ----- | ---- | ---- | ---- |
| fixed             | 1.00× | 442 Hz   | 0.057 | 0.85 | 0.09 | 0.03 |
| toy chip          | 0.51× | 5146 Hz  | 0.409 | 0.00 | 0.01 | 0.72 |
| toy chip, ½ depth | 0.56× | 1184 Hz  | 0.135 | 0.71 | 0.08 | 0.14 |
| the kit itself    | 1.46× | 440 Hz   | 0.065 | 0.17 | 0.67 | 0.07 |
| bus, feedback 0.6 | 1.28× | 10323 Hz | 0.355 | 0.00 | 0.00 | 0.41 |

## Not proposed, and why

- **Per-voice level and tuning trimmers.** Real on the part, eight sliders on
  the panel, and the interesting half of it is already there as _Tune_ plus the
  tank table. Knobs, not bends.
- **Voice stealing.** The kit's eight voices are eight sets of parts, not a
  pool. The mux already models the one thing they genuinely share.
- **Resetting the metal bank on a trigger.** Covered by `drumBankSync`, which
  makes every hat on a kick the same hat through a mechanism the board has.
- **A second noise source.** The FM chip needed one. This kit has an avalanche
  junction, six oscillators and a converter that lurches at zero crossings.
