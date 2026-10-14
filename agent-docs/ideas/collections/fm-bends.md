---
name: fm-bends
description: Ranked further bends for the FM chip with hook points: rhythm at full width, DAC slot counter, log domain last; the instrument ROM bus and the two clocks have landed.
---

# Further bends for the FM chip

Candidates, ranked, with where each one hooks. Written after the dead-bit pass
landed, so the first section is what that pass left behind rather than what it
did.

Nothing here is a decision. Several of these are cheap and a couple are large
enough to change how the chip sounds with no knife on it at all, which is a
different kind of cost and is called out where it applies.

**Five have landed since.** The table's output pins (2), the shift register
soldered onto them (3), the instrument ROM's bus (4), the two clocks (5) and the
bay's reach onto the chip (6) are all built, and their sections say what came
out. The remaining candidates are 1, 7, 8 and the small ones, and they are
ranked against each other below rather than renumbered — the numbers are how
this document has been referred to elsewhere.

## How to judge one of these before building it

Two scripts already answer the two questions.

`pnpm knife fm` asks whether a wire does anything, which is a fact about a ROM
rather than about a knob. `pnpm spectrum fm` asks what it does, by frequency,
and its `reach` line is the one to watch: how much of the space a chip's whole
bend set covers.

Where those numbers stand, per bus and per mode:

| bus            | mode   | audible | flattest | with a bottom | broadband |
| -------------- | ------ | ------- | -------- | ------------- | --------- |
| data (8 wires) | melody | 37/40   | 0.21     | 1             | 0         |
|                | rhythm | 39/40   | 0.94     | 8             | 2         |
|                | wind   | 37/40   | 0.10     | 5             | 0         |
| address (6)    | melody | 23/30   | 0.38     | 1             | 3         |
|                | rhythm | 23/30   | 0.63     | 0             | 5         |
|                | wind   | 24/30   | 0.98     | 3             | 3         |
| wave (10)      | melody | 50/50   | 1.06     | 0             | 8         |
|                | rhythm | 50/50   | 1.07     | 0             | 10        |
|                | wind   | 50/50   | 1.00     | 0             | 6         |
| wave data (8)  | melody | 40/40   | 0.81     | 0             | 4         |
|                | rhythm | 40/40   | 0.81     | 0             | 5         |
|                | wind   | 40/40   | 0.43     | 0             | 2         |
| patch (7)      | melody | 35/35   | 0.53     | 0             | 2         |
|                | rhythm | 35/35   | 0.54     | 5             | 3         |
|                | wind   | 35/35   | 0.34     | 0             | 1         |
| patch data (8) | melody | 40/40   | 0.42     | 0             | 1         |
|                | rhythm | 40/40   | 0.40     | 9             | 1         |
|                | wind   | 40/40   | 0.32     | 0             | 3         |

The wave data rows are item 2, measured. Of the buses that came before it, it is
the only one that reads the same in melody as in rhythm, which is the point of
it: it sits after the mode bit has decided anything, on the one datapath all
eight operators take their turn on. `pnpm knife fm` is stricter than this report
and calls 36 of its 40 audible; the four it does not are the bottom bit of an
eight-bit magnitude. The patch rows are item 4; see its section.

The mode rows are new, and they corrected the premise this document was first
written on. Measured in melody alone, the data bus reads 0.21 flat with nothing
broadband, and the obvious conclusion is that the register file cannot make
noise and needs help. Measured with the percussion bank on, the same forty
faults read 0.94 flat with eight of them carrying a bottom. The register file
was never the problem.

What the two readings have in common is the answer. The chip's one broadband
source is the shift register, and every number above that is not near zero has
the shift register behind it: the wave bus reaches it because a parted address
line stops resolving to a sine at all, and the data bus reaches it in rhythm
because that is the mode where two operators are wired to it. **The interesting
candidates are the ones that let something reach the shift register, or give the
chip a second thing worth reaching.** That is a sharper test than "put a number
in the broadband column", and it moves item 3 up rather than down: soldering the
LFSR onto the melody side is no longer a guess about what would help, it is the
mechanism the rhythm row is already demonstrating, with the mode gate taken off.

One thing the measurement still cannot see: the instrument nibble only appears
under a fault, and the report sweeps one bus at a time against a clean board, so
a ROM patch selected by a knife on the data bus is measured but never labelled
as such. That is inherent to sweeping one wire at a time and probably not worth
fixing.

## The bits still with no reader

The dead-bit pass filled the flags bytes, both level bytes and the volume
register. What is left, and whether it is real on the part:

- **the shape byte's 0x20** — one bit, genuinely spare on the die too. Leave it.
- **the key register's 0xe0** — three bits. The lowest of them is real: on this
  family it is a per-channel sustain, separate from the patch's own hold bit,
  and it decides whether releasing a key lets the note fall at its release rate
  or at a slower one the die keeps for the purpose. Worth having, and it lands
  in the register that already carries the octave, the top of the frequency and
  the key itself — the most crowded byte on the chip.
- **the rhythm register's 0x04 and 0x02** — the tom and the cymbal. See _Rhythm
  at full width_ below; the bits are dead because the drums have nowhere to go,
  not because nothing reads them.
- **the test register's 0xf0** — four bits, and the one place on this chip where
  inventing hardware is defensible: the register is undocumented by
  construction, the driver only ever writes zero to it, and what the existing
  four switch is the counters and the latch rather than anything the register
  file can say. A fifth and sixth would be in keeping. No proposal for what they
  should be — that is the interesting part of the work.

## 1. Log domain, and an adder that wraps — landed

`fmChip.ts` multiplies: the operator output is `wave(...) * env * level`. The
real part has no multiplier. Its sine ROM stores −log₂|sin|, the envelope and
the level are _added_ to it as attenuation, and an exp ROM converts back. The
attenuation adder has a fixed width, so one that wraps instead of saturating
turns a note fading toward silence into one that comes back at full volume.

Built as `fmAdder`, **Log adder** (`linear`, then 11, 10, 9, 8 and 7 bits;
default `linear`) with a hop lane. Design calls:

- The log path is a switch, not a rewrite. `linear` runs the old expressions
  untouched, so the shipped sound and `pnpm spectrum cuts` are bit-identical by
  construction and the success condition above is met trivially.
- Any width puts every operator on the part's arithmetic: `logMul()` rounds
  −log₂ of the sample and of the gain (envelope × key scaling × tremolo × level
  or volume) to 256ths of an octave, adds them, masks the sum to the adder's
  width and reads a 256-entry exp table shifted by the octave.
- The log is taken of the word `wave()` returns, so the wave-bus faults still
  bite before it; the logarithm sees the faulted sample.
- The adder width is the knob, because width decides how often a fade explodes:
  every 48 dB at 11 bits, every 3 dB at 7. 12 bits was built and dropped: it
  measured 0.01 deviation from linear on the spectrum board, since nothing wraps
  that wide. 7 bits took its place.
- The bass drum's two operators and the two noise slots go through it too, so
  the kit wraps with the rest of the chip.
- The exp ROM's own address bus is not built; the adder carries the sound.

Measured on the `pnpm spectrum` board, FM stem, centroid and flatness against
1.66 kHz and 0.001 clean:

| adder   | level | deviation | centroid | flat |
| ------- | ----- | --------- | -------- | ---- |
| 11 bits | 1.01× | 0.17      | 1.96 kHz | 0.05 |
| 10 bits | 1.09× | 0.58      | 4.29 kHz | 0.15 |
| 9 bits  | 1.20× | 1.34      | 6.14 kHz | 0.27 |
| 8 bits  | 1.33× | 1.73      | 6.05 kHz | 0.27 |
| 7 bits  | 1.41× | 1.85      | 6.93 kHz | 0.39 |

- The bell at 7 bits: flatness 0.006 → 0.59, centroid 4.8 → 10.1 kHz.
- The kit at 9 bits: flatness 0.04 → 0.61. Wind at 9 bits: 0.002 → 0.82,
  centroid 0.7 → 8.9 kHz, the flattest thing this chip has measured.
- An e.piano note's tail (1 s on) over its head: 2.5× the linear ratio at 10
  bits.

## 2. The wave ROM's data pins — landed

`waveBus` was on the address side only. The table's output word is the other
half of it, and it behaves oppositely: an address fault reads a different
correct sample, a data fault reads a corrupted one — a sine with a step cut into
its amplitude at one bit position, on every operator's turn on the datapath.

Built as `fmWaveDataLine` / `fmWaveDataFault`, a `Bus(8)` on the way out of
`wave()` the way there was already one on the way in. The table keeps a
magnitude and takes the sign off the phase, exactly as the part does, which is
what makes the output a word of its own and why nothing on this side can move a
note. Neither side of the table is in the path on an unbent board: `wave()`
returns the float straight out of the table until a line is chosen or the blob
is up, so the eight-bit word only exists once something is across the pins.

Two of the forty are named in the cuts row — the top pin to +V, which is a floor
under every sample, and the same pin parted, which leaves it holding whichever
of the eight operators went last.

## 3. The shift register on the melody side — landed

There is an LFSR on the die — `Lfsr` in `fmChip.ts` — and exactly two operator
slots could reach it, only in rhythm mode. The measurement above said that gate
was carrying more weight than anything else on the chip: the same forty data-bus
faults are 0.21 flat with the bank off and 0.94 flat with it on, and the only
thing that changed is which operators are wired to the shift register.

Built as `fmNoiseBlob`, a blob of solder from the register's output onto the
wave ROM's data pins. It sits on the pins from the least significant up, so a
touch of it is dirt riding on the sample and all the way across is eight pins
holding one bit — the sine gone, and a square at the carrier gated by the
register, since the sign line is not a data pin and still comes off the phase.
The pin at the edge of the blob is only sometimes under it, which is what makes
the travel a sweep rather than eight steps.

It is a hardware mod rather than a register write, so nothing the CPU does
touches it: it survives every patch, every effect and every panic. Measured on
the melody board with the rhythm button up, high-band energy against rms goes
from 0.06 with no blob to 0.24 at 0.85 of the travel, and the flatness of the
chip's own stem from 0.001 to 0.67.

One thing fell out of it that was not designed: the register has one clock, and
the bank's own slot is what runs it. So the blob's divider runs it only while
the mode bit is clear, and pressing Rhythm hands the register's clock back to
the hi-hat — the blob goes on working and changes grain. Both clocks count off
the rail, so a starving board turns the sand into a rumble either way.

## 4. The instrument ROM's own bus — landed

The instrument nibble addresses fifteen patches on the die: a table with an
address bus and a data bus, the shape `roms.ts` has for the toy's tune ROM.

Built as `fmPatchLine` / `fmPatchFault` and `fmPatchDataLine` /
`fmPatchDataFault`, a `Bus(7)` and a `Bus(8)` in `fetchPatch()`:

- Three address wires pick the byte and four the row. Row zero is the register
  file, so the processor's patch crosses the same wires as the die's.
- Row zero on the bus is what makes it audible alone. The driver only writes
  zero to the nibble, so a knife on the ROM rows by themselves would wait for a
  data-bus fault to pick a row.
- Every fetch reads the same wrong byte, and the patch comes back when the knife
  comes off. Neither side is in the path until a line is chosen.

Measured:

- `pnpm knife fm` calls 19 of the address side's 35 audible and 37 of the data
  side's 40. The 16 silent ones are cut, ground and bridge on the four row
  lines, which cannot move a row of zero.
- The patch buses are where this chip goes down: 11 address faults and 15 data
  faults land on knife's went-down list, against none for the wave data pins.
  The multiplier table's bottom entry is 0.5, and B0 to ground halves both
  operators' ratios, dropping the note an octave.

## 5. Two clocks — landed

`fmEffects.ts` makes a point of the CPU keeping its own time while the chip
starves underneath it. The two crystals are independent by construction, so they
are two controls:

- `fmClockX`, the chip's crystal, scales pitch, the envelope rates, the LFO and
  the shift register's clock together. **lock** sets it to the toy's
  `chipClockX`, so the two chips play the key line in tune.
- `fmCpuClockX`, the CPU's crystal, scales `script.hz` and the `offIn` note
  timers.

Both copy `chipClockX`: 0.05× to 16× on a log curve, default 1, and a bay lane
(`fmClock`, `fmCpuClock`) worth three octaves a full push. At 1× every product
is a multiply by one, so the shipped sound is unchanged.

Measured on the FM stem, on the board `pnpm spectrum` uses:

- The chip's crystal is a transposition. The melody stem's centroid runs from 80
  Hz at 0.05× to 15.4 kHz at 16× (1.66 kHz at 1×), with flatness at or under
  0.016 throughout, and the sub band holds 0.89 of the power at the bottom. With
  the rhythm bank on it runs 279 Hz to 15.2 kHz.
- The CPU's crystal leaves the spectrum alone in melody (centroid 1.1–1.7 kHz)
  and moves the take by note length: 0.50 of its rms when slowed, 0.94 at 16×.
  With the bank on, slowing it changes 0.06, because the kit's hits keep no note
  timer. Its one new sound is the effect ROM run fast: crickets at 16× go from
  0.03 flat to 0.29, with the centroid up from 1.9 kHz to 4.6 kHz.

`rates()` used to multiply each envelope time by the rail's `clockFactor`, so a
starving rail shortened the envelopes while the comment said it stretched them.
It now divides by the rail and the crystal together, the way the pitch moves:

- On the stock board `clockFactor` is exactly 1, so nothing unstarved changed.
- With `chipStarve` at 0.45, an e.piano note's tail-over-head ratio goes from
  0.36 (the old direction, against 0.34 unstarved) to 0.51.

## 6. The patch bay cannot reach this chip — landed

`DEST` had 25 lanes and none of them was FM. It was the only source on the board
nothing could modulate.

`fmBright` went in first, for a second-order reason specific to how the chip is
built: the driver only re-sends the patch when a knob _moves_ (`fmChip.ts`, the
`sent` comparison). Put an LFO on brightness and the driver never stops writing
— which converts a fault that bites four times a note into one that bites
continuously. That is the effect ROM's traffic profile, reached from the panel,
on any patch. It writes `REG.modLevel` alone rather than the whole patch, so
what an LFO there floods the bus with is the one byte it is actually moving.

`fmBusCut` and `fmNoiseBlob` followed, which are the knife itself: how far
through the trace it went, and how far across the pins the solder ran. Neither
is a setting the factory shipped, which makes them the two strangest lanes in
the bay — an LFO on the cut depth is a fault that comes and goes in time. Every
line and fault selector on the chip has a lane too, hopping the way the toy's
and the kit's do.

The two clocks from 5 have lanes as well.

## 7. Rhythm at full width

`RHY` defines three keys and the die has five. `RHYTHM_CH = 2` gives the bank
two channels; the comment above it already says "five drums into three voices"
while the code implements three drums in two.

Move it to 1 and the arithmetic is the real part's: bass drum on its own
channel, hi-hat and snare sharing the next, tom and cymbal sharing the last —
and **one voice left for the tune**. That trade is worth more than the drums
are. Ask this chip for the whole kit and it can barely play a melody, which is
the kind of constraint the rest of this board is made of.

It also lights `DRUM_KEYS`, which currently folds eight trigger lines onto three
drums because there are only three places to put them.

## 8. One DAC, four channels, a slot counter — landed

`TEST.dacSkew` skews the output latch in time. Item 8 models the thing
underneath: four channels time-multiplexed through a single converter, one slot
each.

Built as two controls under a new **die and driver** fold, each with a bay lane:

- `fmDacSlot` (`counting`, `stuck on 1`–`4`, default `counting`) is a stuck
  counter: one channel's sample in all four slots, so that voice goes into the
  output stage four times as loud and the other three are gone. Chosen over a
  mode-plus-slot pair because one selector with a hop lane is a channel
  sequencer: an LFO on `FM DAC slot` walks the slots through a chord.
- `fmDacSlip` (0–1, default 0) is a counter running slow by 0.75·slip² slots per
  slot, so it reads one channel twice and skips the next 3·slip²·sr times a
  second. A sum of the four in another order is the same sum, so a fixed offset
  would be inaudible; a rate error is what makes a slip heard. The square spends
  the bottom of the knob on flutter and buzz and the top on folding.

With both at default the loop takes the old `sum` path untouched.

Measured on the `pnpm spectrum` board, FM stem:

- Stuck: level 1.59×, 1.77×, 1.50× and 1.15× for slots 1–4. On the slower
  `scale` tune slot 4 is silent: the song never needs a fourth voice. A held
  note's own slot plays it over 2.5× louder and any other slot is silent.
- Slip: centroid 1.66 kHz clean, 2.6 kHz at 0.3, 5.5 kHz at 0.6, 10.2 kHz at
  0.82 (a counter at half rate, which mirrors the song about 12 kHz) and 6.9 kHz
  at 1, where the air band holds 0.50 of the power. Deviation from the clean
  take is 0.10 at slip 0.1 and 0.92 at 1.

## Smaller

- **More effect scripts — landed.** Five, appended to `EFFECTS` so old links
  keep their indices: `phone`, `doorbell`, `steam`, `applause` and `laser`, the
  last added as the wildest gesture a frequency register can make. Each writes
  over 150 times a second, the floor the traffic test holds for all but the
  crickets. Rendered alone for 8 s on the effect's own board:

  | script   | rms   | centroid | flat  | note                                |
  | -------- | ----- | -------- | ----- | ----------------------------------- |
  | phone    | 0.059 | 7.1 kHz  | 0.03  | 20 Hz hammer, double ring every 3 s |
  | doorbell | 0.022 | 955 Hz   | 0.000 | 659 Hz then 523 Hz                  |
  | steam    | 0.031 | 3.1 kHz  | 0.03  | 2.75 chuffs/s early, 4.3 late       |
  | applause | 0.027 | 9.9 kHz  | 0.81  | the flattest effect                 |
  | laser    | 0.087 | 1.6 kHz  | 0.20  | 6 kHz to 94 Hz in 175 ms            |

  New contexts for old bends: the key wire to +V turns phone and laser into one
  held tone each (quiet fraction 0.46 → 0); a 9-bit **Log adder** takes applause
  to 0.95 flat and steam to 0.88.

- **Mono.** `io.l[i] += out; io.r[i] += out`. True to the part, and a bodge wire
  putting one channel hard left is one more byte on the bus.
- **Cold boot — landed.** `panic()` zeroed the register file. Built as
  `fmColdBoot` (`clean`, `garbage`, default `clean`) with a lane,
  `FM cold boot`. Design calls:
  - Switching it on is itself a power cycle, so the bend is heard without
    pressing panic; every panic while it is on boots again.
  - Each boot draws fresh garbage off one seeded generator, so the first boot is
    the same every time and the next ones differ.
  - A channel whose garbage key bit is set starts in attack, so the boot drones.
  - The driver sends no register sweep. Its patch write clears the patch, test
    and rhythm registers, and per-channel registers stay garbage until a note
    lands there.
  - The lane power-cycles on each upward crossing of half.

  Measured on the FM stem:
  - Gate cut, nothing playing: rms 0 → 0.040, a drone centred at 233 Hz on ROM
    instruments 3, 11, 2 and 7.
  - On the `pnpm spectrum` board: deviation 0.46, low energy 0.13 → 0.19 of rms.
  - With A0 to ground the test register keeps 0x2d (wide open, skewed,
    rectified): flatness 0.19 against 0.012 for A0 alone, and the air band 0.32.
  - A 12 Hz square on the lane: 1 → 8 bursts, level 0.46×, low energy 0.41.

- **The driver's allocator — landed.** `pick()` is CPU-side, like `Strobe` and
  the note timers. Built as `fmAlloc` (`free`, `stuck on 1`–`4`, default `free`)
  with a hop lane, `FM allocator`. Every note goes to one channel, and `noteOff`
  also searches that channel, so a held key still lifts when it is an effect's
  or the kit's. On the `pnpm spectrum` board's FM stem:
  - In melody the four stuck settings render identically, since the channels are
    interchangeable: level 0.67× (the tails are cut), deviation 0.78.
  - With the rhythm bank on, stuck on 3 is the tune playing the bass drum:
    flatness 0.04 → 0.31, sub band 0.10 → 0.01. Stuck on 4 retunes the noise
    pair's gate: low energy 0.29 → 0.67 of rms.
  - Under the bird, stuck on 4 has the song and the script writing one channel:
    flatness 0.06 → 0.23, centroid 2.9 → 6.2 kHz, 2 → 7 bursts.
  - Kept all four slots, toward the wilder option: the choice is inaudible in
    melody but picks which of the kit's or the effect's channels the tune lands
    in.

## What is left, ranked against each other

7 and 8 are structural and worth doing together, since both are about what four
voices and one output stage can actually carry. 1 stays last and stays the one
to be suspicious of.

## Compositions to try

All four are possible now and none is surfaced.

**A brightness LFO against a marginal strobe.** A control-rate write storm
through a latch that sometimes does not clock means the patch smears
continuously across the register file instead of four times a note.

**An LFO on the cut depth.** A knife whose trace conducts in time: most writes
land, and the ones that do not land on the beat. Nothing else on this board has
a fault that comes and goes on a clock.

**The blob against a knife on the wave address.** They are the two halves of the
same table, and one is now broadband: a parted address line that no longer
resolves to a sine, reading a word the shift register is holding down.

**A knife on the block bits, now that key scaling reads them.** KSL wired the
octave into the level, so a fault on the frequency's top bits moves pitch,
whether the note happens _and_ how loud it is — three things off one wire.
`pnpm knife fm` will find the good ones; some of them probably deserve names in
the cuts row.
