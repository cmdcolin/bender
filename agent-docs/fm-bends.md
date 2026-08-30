# Further bends for the FM chip

Candidates, ranked, with where each one hooks. Written after the dead-bit pass
landed, so the first section is what that pass left behind rather than what it
did.

Nothing here is a decision. Several of these are cheap and a couple are large
enough to change how the chip sounds with no knife on it at all, which is a
different kind of cost and is called out where it applies.

## How to judge one of these before building it

Two scripts already answer the two questions.

`pnpm knife fm` asks whether a wire does anything, which is a fact about a ROM
rather than about a knob. `pnpm spectrum fm` asks what it does, by frequency,
and its `reach` line is the one to watch: how much of the space a chip's whole
bend set covers.

Where those numbers stand now:

| bus            | audible | flattest | with a bottom | broadband |
| -------------- | ------- | -------- | ------------- | --------- |
| data (8 wires) | 37/40   | 0.21     | 1             | 0         |
| address (6)    | 23/30   | 0.38     | 1             | 3         |
| wave (10)      | 50/50   | 1.06     | 0             | 8         |

The wave bus is still carrying the chip. The standing complaint — a part whose
only primitive is a sine cannot get near the top of a flatness column — is
answered for the wave ROM and the percussion bank and is not answered anywhere
else. **A candidate that puts a number in the data bus's broadband column is
worth more than one that does not**, and the three at the top of the list below
are picked on that basis.

Two things the measurement cannot see, worth fixing whenever somebody is next in
`scripts/spectrum.ts`: its FM board never presses Rhythm and never loads an
effect, so the two newest features are invisible to the tool built to judge
them. The instrument nibble is invisible for the same reason — it only appears
under a fault, and the board is measured one bus at a time.

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

## 1. Log domain, and an adder that wraps

The chip does none of what it is modelling. `fmChip.ts` multiplies: the operator
output is `wave(...) * env * level`. The real part has no multiplier anywhere.
The sine ROM stores −log₂|sin|, the envelope and the level are _added_ to it as
attenuation, and an exp ROM converts back at the end.

Two things fall out that no bend here can currently make.

The exp ROM is a second table with its own address lines — a fourth bus, and the
only one that carries an amplitude rather than a phase or a byte. And the
attenuation adder has a fixed width, so a knife that makes it wrap instead of
saturate means a note fading toward silence crosses the top of the adder and
comes back at full volume. A fade that periodically explodes is not a sound
anything else on this board makes.

Hook points are narrow, which is the good news: `rates()` builds a linear level
through `atten()`, `readOperators()` passes it, `stepEnv()` walks a linear
envelope, and `wave()` returns a linear sample. Those four.

The cost is the honest problem. Every existing wave-bus bend changes character,
because a bent address would then perturb a logarithm — and the wave bus is the
eight-broadband column that currently carries the chip. So this is the one
proposal on the list whose _success_ condition includes not moving things:
`pnpm spectrum cuts` prints the whole named-cuts row, and a run of it before and
after is what says whether this chip's ten named cuts still sound like their
names. There is no golden-render mechanism in the repo to lean on instead.

## 2. The wave ROM's data pins

`waveBus` is on the address side only. The table's output word is the other half
of it, and it behaves oppositely: an address fault reads a different correct
sample, a data fault reads a corrupted one — a sine with a step cut into its
amplitude at one bit position, on every operator's turn on the datapath.

About fifteen lines. `Bus` already does all of it; `wave()` grows a second
`read` on the way out the way it has one on the way in.

Do this one before 1, whatever happens to 1. It is cheap, it is independent, and
if log domain does land later then these pins are the mantissa of a logarithm
and get stranger rather than redundant.

## 3. The shift register on the melody side

The docs state the problem outright: nothing anywhere in the register file makes
noise. There is an LFSR on the die — `Lfsr` in `fmChip.ts` — and exactly two
operator slots can reach it, only in rhythm mode.

The bender's move is a blob of solder from the shift register's output onto the
wave ROM's data pins. It is a hardware mod rather than a register write, so
nothing the CPU does touches it and it survives every patch, every effect and
every panic. It composes with 2 because it is the same pins.

This is the direct attack on `0 broadband` for the two buses that need it, and
it is the cheapest thing on the list that could move that column.

## 4. The instrument ROM's own bus

New, and only possible because the instrument nibble landed. There are fifteen
patches on the die now and the nibble addresses them, which means there is a
table with an address bus and a data bus that nothing has put a knife on —
exactly the shape `roms.ts` already has for the toy's tune ROM, down to the
`ROM_ADDR_LINES` / `ROM_DATA_LINES` pair.

What it buys is the thing a corrupted _selection_ cannot: fractions of patches.
The nibble picks a whole instrument; a fault on the table's address lines picks
byte 3 from the violin and byte 5 from the trumpet, the same wrong pairing every
time that byte is fetched. Four bits of address and eight of data, and the patch
that comes out is a chimera that is nonetheless perfectly stable — which is the
register file's whole personality, arrived at from a direction the register file
cannot reach.

Cheap: `ROM_PATCH_BYTES` is read in one place, in `readPatch()`.

## 5. Two clocks, and nothing reaches either

`fmEffects.ts` makes a point of the CPU keeping its own time while the chip
starves underneath it. Neither clock is a knob, and they are independent by
construction, so they are two controls rather than one:

- **the chip's crystal** — scales pitch, the envelope rates, the LFO and the
  LFSR's clock together. This is where the FM chip's missing bottom octave
  lives. The melody driver always picks the tightest block for the note it is
  given, so the register file cannot go down; the crystal can.
- **the CPU's crystal** — scales `script.hz` and the `offIn` note timers. A bird
  call at half speed over a chip running normally, which is the effect ROM's
  independence made into a control instead of a fact.

Both are classic clock-injection bends and both belong in the patch bay as well
as on the panel.

## 6. The patch bay cannot reach this chip

`DEST` has 25 lanes and none of them is FM. It is the only source on the board
nothing can modulate.

`fmBright` first, for a second-order reason specific to how the chip is built:
the driver only re-sends the patch when a knob _moves_ (`fmChip.ts`, the `sent`
comparison). Put an LFO on brightness and the driver never stops writing — which
converts a fault that bites four times a note into one that bites continuously.
That is the effect ROM's traffic profile, reached from the panel, on any patch.

Then the two clocks from 5, then `fmBusCut` so the knife itself can be
modulated.

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

## 8. One DAC, four channels, a slot counter

`TEST.dacSkew` skews the output latch in time. It does not model the thing
underneath: four channels time-multiplexed through a single converter, one slot
each.

A stuck slot counter is one channel's sample going out in every slot — one voice
four times as loud and the other three gone. A slipped one is channels getting
each other's samples. Neither corrupts anything, which is what makes it worth
building: it is `Strobe`'s failure mode moved from the address side to the
output side, and this chip has nothing like it.

## Smaller

- **More effect scripts.** Telephone, doorbell, steam, applause. Pure content,
  and since the effect ROM is the busiest thing the bus ever carries, each one
  is also a new context for every bend that already exists.
- **Mono.** `io.l[i] += out; io.r[i] += out`. True to the part, and a bodge wire
  putting one channel hard left is one more byte on the bus.
- **Cold boot.** `panic()` zeroes the register file. A real one comes up with
  whatever the die felt like, and the driver's first writes are what clear it —
  so a garbage boot plus a cut on the bus is a chip that never finishes booting.
  Overlaps `scripts/cold.ts` in name only.
- **The driver's allocator.** `pick()` is CPU-side, like `Strobe` and the note
  timers. A round-robin stuck on one channel is a four-voice chip playing
  monophonically while still being told about four notes.

## Two compositions to try before building anything

Both are already possible and neither is surfaced.

**A brightness LFO against a marginal strobe.** Needs 6 to exist. A control-rate
write storm through a latch that sometimes does not clock means the patch smears
continuously across the register file instead of four times a note.

**A knife on the block bits, now that key scaling reads them.** KSL wired the
octave into the level, so a fault on the frequency's top bits moves pitch,
whether the note happens _and_ how loud it is — three things off one wire.
`pnpm knife fm` will find the good ones; some of them probably deserve names in
the cuts row.
