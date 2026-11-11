---
name: fm-bends
description:
  Further bends for the FM chip with hook points and measurements. Items 1–8,
  the exp table's bus, the allocator, cold boot and five effect scripts have
  landed with named cuts, and so has the phase generator (increment bus, carry,
  slot skew, mod into pitch) and four bass bends (sign line, ground loop, Glint
  on bus, latch clock) and the bends on the envelope generator and the octave
  wires (octave short, output on key line, envelope chain); the spare register
  bits, the envelope state bits and bay lanes for that last round are what is
  left.
---

# Further bends for the FM chip

Candidates, ranked, with where each one hooks. Written after the dead-bit pass
landed, so the first section is what that pass left behind rather than what it
did.

The open candidates are proposals. Each landed section records the design calls
made building it, and every new control defaults to the shipped sound.

**Twelve have landed since.** Items 1 to 8, the exp table's bus, the driver's
allocator, cold boot and five more effect scripts are all built, and their
sections say what came out. Every bend from the last three rounds has a named
cut, rig or preset; see _Named and measured_ below. What remains is the small
ones, ranked at the end. The numbers are how this document has been referred to
elsewhere, so nothing is renumbered.

## How to judge one of these before building it

Two scripts already answer the two questions.

`pnpm faults fm` asks whether a wire does anything, which is a fact about a ROM
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
| exp (12)       | melody | 59/60   | 0.61     | 0             | 4         |
|                | rhythm | 59/60   | 0.73     | 2             | 14        |
|                | wind   | 59/60   | 0.82     | 0             | 12        |

The wave data rows are item 2, measured. Of the buses that came before it, it is
the only one that reads the same in melody as in rhythm, which is the point of
it: it sits after the mode bit has decided anything, on the one datapath all
eight operators take their turn on. `pnpm faults fm` is stricter than this
report and calls 36 of its 40 audible; the four it does not are the bottom bit
of an eight-bit magnitude. The patch rows are item 4; see its section.

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
a ROM patch selected by a fault on the data bus is measured but never labelled
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
- **the rhythm register's 0x04 and 0x02** — the tom and the cymbal. Read since
  item 7 landed, at full width only; at the stock width the drums still have
  nowhere to go.
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
- The exp ROM's own address bus was left for later and has since landed; see
  _The exp table's address_ below.

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
  zero to the nibble, so a fault on the ROM rows by themselves would wait for a
  data-bus fault to pick a row.
- Every fetch reads the same wrong byte, and the patch comes back when the fault
  comes off. Neither side is in the path until a line is chosen.

Measured:

- `pnpm faults fm` calls 19 of the address side's 35 audible and 37 of the data
  side's 40. The 16 silent ones are cut, ground and bridge on the four row
  lines, which cannot move a row of zero.
- The patch buses are where this chip goes down: 11 address faults and 15 data
  faults land on the faults sweep's went-down list, against none for the wave
  data pins. The multiplier table's bottom entry is 0.5, and B0 to ground halves
  both operators' ratios, dropping the note an octave.

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

`fmBusCut` and `fmNoiseBlob` followed, which are the fault itself: how far
through the trace it went, and how far across the pins the solder ran. Neither
is a setting the factory shipped, which makes them the two strangest lanes in
the bay — an LFO on the cut depth is a fault that comes and goes in time. Every
line and fault selector on the chip has a lane too, hopping the way the toy's
and the kit's do.

The two clocks from 5 have lanes as well.

## 7. Rhythm at full width — landed

`RHY` defined three keys and the die has five. Built as a third position on
**Rhythm**, `full kit`: the bank starts at the second channel, the bass drum
there, hi-hat and snare on the next, and the tom and cymbal (`RHY.tom` 0x04,
`RHY.cymbal` 0x02) on the last, which leaves **one voice for the tune**. The
kit's tom line strikes the tom, and its bell and cymbal lines the cymbal
(`FULL_KIT_KEYS`). Design calls:

- A position on Rhythm rather than a control of its own, since width means
  nothing with the bank off. `off` and `kit` keep their values.
- The tom is a bare sine tuned from ROM (`TOM_FNUM`, `TOM_BLOCK`, 163 Hz), so
  the wave-bus faults reach it.
- The cymbal is the part's top-cymbal logic: three phase bits off the hi-hat
  channel's phase generator gated with two of its own. A first build rang a
  square against the hat slot's sign; with the hat idle that was a plain 2 kHz
  beep at 0.005 flat. The bit logic aliases into a hash instead: soloed, 12.5
  kHz centroid, 0.15 flat, 0.69 in the air band, against 9.5 kHz and 0.89 for
  the hat. The two halves are XORed rather than ORed as on the part, which read
  high seven times in eight and left 75% of the amplitude as DC.
- The hi-hat channel's phase generator free-runs for the cymbal, so anything
  that retunes the hat retunes the cymbal.

Measured on the sakura tune's FM stem with all eight kit lines clipped on,
against the three-drum kit: centroid 1.55 → 1.77 kHz, sub band 0.10 → 0.20,
deviation 0.72. Compounds as item 7 promised:

- Allocator stuck on 3, the hi-hat's channel: every note keys it, so the tune
  strikes the hat and snare at its own pitch and moves the cymbal's bits: 0.28
  flat, centroid 3.8 kHz. Named as the preset _the tune on the hi-hats_.
- Allocator stuck on 4: the tune strikes the tom and cymbal at its pitch, 0.21
  flat.
- DAC slot stuck on 4: only the tom and cymbal, four times over, centroid 7.2
  kHz.
- With E9 parted at 0.7 (below): 0.76 flat, the flattest take of this round.

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

## The exp table's address — landed

`logMul()` read `EXP_TABLE` by the low eight bits of the adder's sum and shifted
by the rest. Built as `fmExpLine` / `fmExpFault`, a `Bus(12)` on that sum: E0–E7
address the table, E8–E11 tell the shifter how many octaves down. Design calls:

- Twelve wires, not the eight first proposed, because the shifter lines are
  where the sound is. On the sakura board's FM stem E0–E3 measure under 0.11
  deviation whatever the fault; the ROM's own top line, E7, reaches 0.43 flat
  parted. The shifter lines reach further: E9 parted at 0.7 reads 0.70 flat with
  a 7.85 kHz centroid and 0.38 in the air band, and E8 bridged moves the take
  furthest, deviation 1.49.
- A line chosen with **Log adder** on linear runs the log path unwrapped,
  saturating at the bus's top, so the knife is heard alone. With no line chosen
  nothing changes.
- Every operator reads its level across these wires, eight or more times a
  sample, so a parted line is the "wrong operator" bend the wave data bus made
  for samples, made for levels.

E10 and E11 to +V are 24 and 48 dB of attenuation on everything: 0.09 and 0.01
of the level.

`pnpm spectrum fm` puts it in the table at the top: more broadband faults in
rhythm and wind than any other bus on the chip, since every one of them reaches
the kit's and the effect's operators as well as the tune's. E11 to +V is the one
silent fault of the sixty.

## The phase generator — landed

Every bend above reaches the chip through its registers, its tables or its
output. None reached the FM core itself: the multiplier that turns a note into a
step per sample, the accumulator that integrates it, and the latch between them.
Four bends now do, all in `advance()` and `fillSlots()` in `fmChip.ts`:

- **Increment line** (`fmIncLine` / `fmIncFault`): a `Bus(19)` on each
  operator's step, read as a 19-bit word. The 19 bits are the part's accumulator
  width, so the sine table reads the top ten.
- **Carry** (`fmCarry`, C0–C17): the carry out of one accumulator bit is lost.
- **Slot skew** (`fmSkew`): with that chance per operator per sample, the
  carrier takes its modulator's step and the modulator takes the step of the
  previous channel's carrier.
- **Mod into pitch** (`fmPitchWire`): the modulator's output is added to the
  carrier's step, at up to `PITCH_WIRE_HZ`.

Design calls, toward the wilder option:

- Order on the die is multiplier → increment bus → skew latch → pitch wire →
  accumulator, so all four stack.
- The increment bus and the carry reach the kit's operators too, through
  `advance()`. The pitch wire and skew are melody only.
- `PITCH_WIRE_HZ` is 16 kHz, not the 2 kHz first built. At 2 kHz the organ's
  centroid moved 0.85 → 0.84 kHz, because the modulator's output rarely nears
  full swing. At 16 kHz with brightness up it reaches 9 kHz. The swing is in
  hertz rather than in ratios, so low notes run through zero and high ones only
  buzz.
- Skew is random below the top of the knob, like **Slip the strobe**, so it
  sweeps from smear (bell chord flatness 0.16 at 0.3) to the clean cross-channel
  FM at 1.
- The melody path keeps the inline phase step unless a line or carry is set or
  the wire is up. With the call made unconditionally, the everything-on board's
  `fmChip` cost rose from 130 to 157 and 160 ms on `pnpm bench`; with the guard
  it measured 124 and 133.

Measured on the sakura board's FM stem (4 s), against a 1.67 kHz centroid clean:

| setting     | level | centroid | air band | flat  |
| ----------- | ----- | -------- | -------- | ----- |
| I11 to +V   | 1.00× | 2.33 kHz | 0.00     | 0.001 |
| I12 to gnd  | 1.00× | 0.37 kHz | 0.00     | 0.000 |
| I14 to +V   | 1.00× | 6.90 kHz | 0.64     | 0.001 |
| I12 cut 0.7 | 1.11× | 1.43 kHz | 0.00     | 0.020 |
| C10         | 0.97× | 1.37 kHz | 0.00     | 0.000 |
| C12         | 0.57× | 4.31 kHz | 0.90     | 0.006 |
| skew 1      | 1.12× | 0.80 kHz |          | 0.000 |

They stay tonal, with flatness under 0.03, which is the point of them: they
change which partials a note has, not how much noise is in it. Lines I0–I5 and
carries C0–C7 measure as no change on that stem. I13 to I18 parted do nothing,
since those bits are almost never set on a step.

Named cuts: _every ratio off by the same hertz_ (I11 to +V), _the tune on a
bugle_ (C10), _each note on the one before_ (skew 1), _the modulator on the
pitch wire_ (wire 1).

Still open from the same survey:

- **Feedback tap.** The modulator's feedback averages its last two samples;
  cutting one tap gives the period-two instability the averaging was there to
  stop. Small, and close to the feedback booster.
- **Vibrato on the wrong bit.** The LFO's step is added to the frequency a few
  bits down; a fault there moves the vibrato depth from cents to semitones.
- **Envelope state bits.** A fault on the two-bit stage register would trap
  operators in attack or send decay straight to release.

## Three loops toward the bass — landed

Asked for bends heavy in the bass, every one built to move the stem's share
under 120 Hz (`lowEnergy` over rms, 0.12 on the clean sakura stem):

- **Sign line** (`fmSign`): the wave table's sign wire off a divider counting
  each operator's wraps (÷2 to ÷32), or off the operator ahead on the table
  (slot before). 0.35 at ÷2, 0.83 at ÷32, level unchanged. Slot before is a ring
  modulator and reads 0.19.
- **Ground loop** (`fmGroundLoop`): the output, low-passed at 80 Hz, onto every
  melody operator's phase. 0.79 at 0.3, 0.92 at 1, flatness near 0.2. Unfiltered
  it read 0.98 flat, white noise, so the 80 Hz pole stays.
- **Glint on bus** (`fmSelfBus`): **Toy on bus** carrying Glint's own output
  latch. 0.39 at one bit, 0.91 at four. Low notes change the bits slowly, so the
  loop sinks to the bottom octaves without anything biasing it there.

Stacked, the sign line on ÷8 with Glint on bus at four bits reads 0.95, centroid
83 Hz. Two candidates were built and dropped; the comments in `fmChip.ts` give
the numbers: a wire from the envelope's floor back to key-on, and the envelope
dropping the block an octave per halving.

A second round added **Latch clock** (`fmLatch`): the output latch clocked off
one channel's carrier wraps. Chords alias into their difference tones: 0.29 to
0.94 under 120 Hz on a held organ chord, 0.65 on the sakura stem. Named cut:
_every chord on its difference tones_. Four more were built and dropped, with
their numbers at the code: a sync wire and a carry chain between channels (0.14
and 0.26 on sakura), the busy flag ignored, and a latch enable opened by kit
hits (both silent).

Named cuts: _the tune five octaves down_ (÷32), _a rumble the chip feeds itself_
(ground loop 1), _the chip writing its own octave_ (four bits).

## The envelope generator and the octave wires — landed

Asked for further complex bends, with loops and one part of the chip reaching
another ranked over static colour. These landed, all in `fmChip.ts`:

- **Octave short** (`fmBlockShort`: apart, low wins, high wins): the four
  channels' block wires joined into one set. Each sounding channel drives the
  wires, and each reads back the bits every sounding channel has (low wins) or
  the bits any has (high wins). A4 and A5 held together both sound at 55 Hz on
  low wins and at 7 kHz on high wins.
- **Output on key line** (`fmKeyLoop`): the rectified output on a capacitor
  across the key line. Past 0.7 of full scale every key reads up; once the
  capacitor drains to the rearm level, every key the register file still holds
  down strikes again, drums included.
- **Envelope chain** (`fmEnvChain`): a carrier envelope under the trip level
  strikes the channel after it, once per strike, at the pitch that channel's
  registers hold. The ring keeps running after the tune stops.

Measured on the FM stem: the sakura tune (4 s), a held organ chord (A2 E3 A3),
and the sakura tune with **Rhythm** on and the kit's lines clipped on. Clean
they read 0.12, 0.29 and 0.35 under 120 Hz.

| setting                  | board  | level | under 120 Hz | centroid | flat  |
| ------------------------ | ------ | ----- | ------------ | -------- | ----- |
| octave short, low wins   | sakura | 1.00× | 0.41         | 1.19 kHz | 0.000 |
|                          | chord  | 1.17× | 0.57         | 207 Hz   | 0.000 |
|                          | kit    | 1.00× | 0.48         | 383 Hz   | 0.013 |
| octave short, high wins  | sakura | 1.00× | 0.10         | 4.60 kHz | 0.002 |
|                          | kit    | 1.03× | 0.16         | 6.49 kHz | 0.175 |
| key line 0.1             | sakura | 0.55× | 0.18         | 890 Hz   | 0.000 |
|                          | chord  | 0.32× | 0.43         | 298 Hz   | 0.000 |
|                          | kit    | 0.58× | 0.67         | 541 Hz   | 0.065 |
| key line 1               | sakura | 0.85× | 0.19         | 895 Hz   | 0.004 |
|                          | chord  | 0.56× | 0.37         | 384 Hz   | 0.001 |
|                          | kit    | 0.88× | 0.58         | 1.12 kHz | 0.158 |
| chain 0.8                | sakura | 1.05× | 0.13         | 1.60 kHz | 0.000 |
|                          | kit    | 1.32× | 0.34         | 1.58 kHz | 0.124 |
| chain 1                  | sakura | 1.11× | 0.13         | 1.64 kHz | 0.001 |
|                          | kit    | 1.59× | 0.34         | 2.54 kHz | 0.324 |
| chain 0.9 with low wins  | sakura | 1.09× | 0.59         | 235 Hz   | 0.000 |
|                          | kit    | 1.45× | 0.62         | 290 Hz   | 0.013 |
| key line 1 with low wins | chord  | 0.90× | 0.77         | 111 Hz   | 0.000 |
|                          | kit    | 1.06× | 0.71         | 285 Hz   | 0.025 |

Rates, on notes held or released by hand:

- Key line: a held organ note re-keys 6.8 times a second at 0.1, 13 at 0.5 and
  51 at 1. Brass reaches 109 and strings 238 at the top, the e.piano 23. A lone
  bell note peaks under the trip level and plays clean.
- Chain, two organ notes released: 1.5 strikes a second at 0.2, 3.8 at 0.5, 22
  at 0.8, 69 at 0.9 and 270 at 1. At 1 brass strikes 82 times a second, the
  e.piano 45, the bell 29 and strings 12.
- Chain, four notes released with low wins: 0.48 under 120 Hz on the organ, 0.75
  on brass, 0.76 on the e.piano and 0.80 on strings, centred at 98 Hz.

Design calls, toward the wilder option:

- Octave short reads sounding channels only, so a lone note plays at its pitch
  and the octave jumps as notes start and die away. With an idle register
  driving the slot after it, the sakura stem read 0.48, and a lone note played
  in the wrong octave whenever the register before it held another block.
- The drums drive the octave wires in rhythm mode. The bass drum's block is 1
  and the noise pair's is 5, so a ringing bass drum drops the hi-hat's clock
  four octaves.
- The key line's capacitor holds the peak of the rectified output and drains in
  20 ms. The knob moves the rearm level from 0.25 to 0.9 of the trip level, so
  it sets how far the notes fall before they restart.
- The key line strikes every drum whose key bit is set. The kit leaves those
  bits set after a hit, so one bass drum hit rolls until the knob comes down.
- A register write that lands while the keys read up moves no envelope. The key
  it wrote strikes when the keys read down again.
- The chain's trip level runs from the envelope's floor to 0.98 on a squared
  curve, which puts the fast laps in the top fifth of the knob.
- A channel struck off the chain with its key up skips sustain, so a sustained
  patch falls away and hands the strike on.
- No bay lanes this round, to keep parallel branches mergeable.

Built and dropped, with a sentence and a number at the code in `fmChip.ts`:

- Envelope skew with each operator on the envelope of the slot before (the
  stem's centroid fell from 1.67 kHz to 0.49 kHz), and with each channel on the
  envelopes of the channel before (0.48 under 120 Hz on the kit board).
- The envelope counter clocked off one carrier's wraps (0.11 on sakura).
- A fault on the envelope's seven-bit attenuation word (0.31 to 0.37 deviation
  to ground, 0.56 and 0.08 of the level to +V).
- The LFO's divider skipped by a test bit (0.001 flat with both wired).
- Octave short to the slot before alone (0.28 on sakura).
- The key line through an averaging capacitor with the trip level on the knob (9
  re-keys a second at every setting).

Named cuts: _chords on the octave bits they share_ (low wins), _loud notes
re-key themselves_ (key line 1), _the chip plays on by itself_ (chain 1), _a
ring of four in the bottom octaves_ (chain 0.9 with low wins).

## Named and measured

Every bend from the last two rounds has a name on the panel. Numbers are
`pnpm spectrum cuts` on its board, the whole mix against the same board with the
fault off; the rigs are the FM stem on the `pnpm spectrum` board.

| name                             | where             | level | centroid | flat |
| -------------------------------- | ----------------- | ----- | -------- | ---- |
| a patch that will not hold still | cut, P2 cut 0.85  | 1.03× | 2.99 kHz | 0.41 |
| nine times the note              | cut, B3 to +V     | 0.84× | 5.48 kHz | 0.08 |
| levels from the wrong operator   | cut, E9 cut 0.7   | 0.97× | 5.11 kHz | 0.46 |
| one voice, four times over       | cut, die & driver | 1.27× | 1.84 kHz | 0.02 |
| the song upside down             | cut, slip 0.82    | 1.10× | 8.12 kHz | 0.05 |
| one finger                       | cut, allocator    | 0.88× | 1.74 kHz | 0.07 |
| garbage at power-on              | cut, cold boot    | 1.01× | 1.70 kHz | 0.05 |
| fades that explode               | cut, 10 bits      | 1.04× | 3.55 kHz | 0.17 |
| sines folded to grit             | cut, 7 bits       | 1.19× | 5.74 kHz | 0.38 |
| below the keybed                 | rig, Clock 0.05×  | 1.11× | 80 Hz    | 0.00 |
| bird on fast-forward             | rig, CPU clock 16 | 0.67× | 8.98 kHz | 0.69 |
| never finishes booting           | preset            |       | 4.99 kHz | 0.23 |
| reboot loop                      | preset            |       | 250 Hz   | 0.00 |
| tune on the bass drum            | preset            |       | 1.63 kHz | 0.23 |
| bird fight                       | preset            |       | 9.62 kHz | 0.29 |
| standing ovation                 | preset            |       | 9.84 kHz | 0.83 |
| dissolves every two bars         | preset            |       | 3.92 kHz | 0.45 |
| the tune on the hi-hats          | preset            |       | 4.57 kHz | 0.34 |

Design calls:

- The new die-level controls sit under their own fold, **die and driver**, so
  each gets cuts the way the fault does.
- The clocks have no fold, so they get rigs on the FM chip's own row. Clock is
  shown at its floor, a sub rumble with 0.87 of the stem under the sub band; CPU
  clock at its ceiling under the bird, which is flatter than any other rig.
- The patch-table cuts are the flattest address fault and the brightest data
  fault in `pnpm spectrum fm`: P2 parted at 0.85 reads 0.53 flat on the FM stem,
  and B3 to +V puts 0.83 of it in the air band.
- Three combinations needed a whole board: cold boot with the address fault,
  cold boot on an LFO, and the allocator on a channel the kit or an effect owns.
  They are presets.

## What is left, ranked against each other

Items 7 and the exp table's bus landed in this order; the numbers below are kept
so the doc can still be cited by them.

Mono landed as the two bodge wires.

4. **The test register's 0xf0 and the key register's sustain bit**, as above.
   The proposals left for 0xf0 are the phase held still and the shift register
   on every accumulator's bottom bit. Increment lines I0 to I5 measured as no
   change, so the bottom bit is likely to be silent. The LFO's divider skipped
   was built and read 0.001 flat. Cold boot, rot and data faults reach the
   register, so these would come and go.
5. **Envelope skew** was built and dropped; see _The envelope generator and the
   octave wires_ above.
6. **Bay lanes for the envelope and octave bends.** A square wire on **Envelope
   chain** would start and stop the ring in time, and a hop lane on **Octave
   short** would switch a chord between its shared octave and its top one.
7. **Envelope state bits**, from the phase generator survey: a fault on the
   two-bit stage register.
8. **A key line per channel.** The output on one channel's key only, so a loud
   passage re-keys one voice and the others ring through it.

## Compositions to try

All four are possible now; one is surfaced.

**A brightness LFO against a marginal strobe.** A control-rate write storm
through a latch that sometimes does not clock means the patch smears
continuously across the register file instead of four times a note.

**An LFO on the cut depth — surfaced** as the preset _dissolves every two bars_,
on the exp table's E9 rather than on the data bus. A two-bar sine LFO works the
cut between 0 and 0.8 under a clarinet, and the stem's flatness swings 0.00 to
0.53 and back each cycle. The data-bus version (D5 parted on the same clock)
only hung notes and stayed at 0.00 flat throughout.

**The blob against a fault on the wave address.** They are the two halves of the
same table, and one is now broadband: a parted address line that no longer
resolves to a sine, reading a word the shift register is holding down.

**A fault on the block bits, now that key scaling reads them.** KSL wired the
octave into the level, so a fault on the frequency's top bits moves pitch,
whether the note happens _and_ how loud it is — three things off one wire.
`pnpm faults fm` will find the good ones; some of them probably deserve names in
the cuts row.
