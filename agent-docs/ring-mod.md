# Further ring mod for the bend slot

Candidates, ranked, with where each one hooks. Written after measuring the stage
as it stands against nine prototypes, so every number below is one this document
produced rather than one it assumed.

**Items 1, 2 and 3 are built.** Track, quadrature and the diode bridge all
landed, along with the test the last section asks for. What is still open is
section 4's reasons for leaving three things alone, section 5's setups — which
are worth knowing about and cost nothing — and the two non-gaps below, which are
the things to check before anyone reopens this.

The stage is `src/dsp/stages/ringmod.ts`, and it is the smallest bend on the
board: a `QuadOsc`, a sine or a hard `Math.sign` square, one multiply per
channel, a crossfade. Three controls — `ringHz`, `ringShape`, `ringMix`. It
costs 0.03% of a block, so nothing below is ruled out on price.

## What the stage already does that reads as missing

Two things look like gaps and are not. Check them before building either.

**The Mix knob is already a carrier balance.** The crossfade is
`x·(1−mix) + x·car·mix`, which multiplies out to `x·((1−mix) + mix·car)` — the
textbook AM envelope with depth `mix`. So the travel runs from dry, through
amplitude modulation with the programme's own spectrum intact beside the
sidebands, to double-sideband suppressed-carrier at the top. A separate balance,
bleed or AM-vs-ring control would be a second knob on the one that is there.
Measured: `AM depth 0.5` and `ringMix 0.5` are the same take.

**The square carrier aliases, and that is the house style.** Nothing here
proposes band-limiting it.

## The measurements everything below is ranked on

One board — the toy on `sakura`, kit at 160, four seconds — through each
prototype, read with `src/dsp/spectrum.ts`. `flat` is the flatness the FM report
uses: 0 is a sine, 1 is white noise. `corr` is how much the two output channels
agree, where 1 is mono.

| carrier 300 Hz | rms    | corr  | flat  | centroid |
| -------------- | ------ | ----- | ----- | -------- |
| sine (today)   | 0.1273 | 1.000 | 0.078 | 2490     |
| square (today) | 0.1800 | 1.000 | 0.212 | 3015     |
| quadrature     | 0.1273 | 0.000 | 0.078 | 2490     |
| diode ring     | 0.3117 | 1.000 | 0.115 | 2583     |
| two carriers   | 0.1273 | 0.044 | 0.078 | 2490     |
| self-ring      | 0.1496 | 1.000 | 0.199 | 3797     |

And the same prototypes against a single held A3, which is the only way to see
whether a carrier destroys the note's harmonic grid or moves along it. `on f0`
is the share of power sitting on a grid of 220 Hz; `on f0/2` the same for 110.

| against a held A3     | flat  | on f0 | on f0/2 |
| --------------------- | ----- | ----- | ------- |
| dry                   | 0.002 | 0.994 | 0.994   |
| fixed 300 Hz (today)  | 0.004 | 0.000 | 0.000   |
| fixed 1700 Hz (today) | 0.003 | 0.000 | 0.000   |
| tracked ×1, ×2, ×3    | 0.000 | 1.000 | 1.000   |
| tracked ×1.5, ×0.5    | 0.006 | 0.000 | 0.995   |
| tracked ×√2           | 0.006 | 0.000 | 0.001   |

## 1. Lock the carrier to the note the board is already sounding

The largest change available, and the note is already on the bus.

`ctx.trig.key[i]` carries `semitone + 128` for every note the toy sounds — the
ROM's, your hand's, or a drum hit that came back round and struck one — and
semitone 0 is A3 at 220 Hz. So the carrier frequency is
`220 · 2^((key − 128) / 12) · ratio`, set on the sample the gate stamps, and the
sample loop is otherwise the one that is there.

What it buys is the third row of the second table. A fixed carrier moves every
partial by the same number of hertz, so nothing lands on the grid it started on
and the note is destroyed: `on f0` reads 0.000 whether the carrier is at 300 Hz
or 1700. A carrier locked to an integer ratio of the note puts the sidebands at
`f0·(n ± k)`, which are back on the same grid: 1.000, exactly. The ring mod
stops being a clang and becomes a timbre — the same stage, playing in tune.

The half-integer ratios are the interesting middle. A fifth or a sub-octave
reads 0.000 against f0 and 0.995 against f0/2: every sideband lands on a grid an
octave below the note, so the effect writes a new fundamental under what you
played rather than wrecking it. That is an octave divider, out of a stage that
already exists.

And ×√2 is the one to keep: it tracks the tune while staying off every grid, so
the clang follows the melody instead of sitting still under it. None of these
three behaviours is reachable today at any setting.

Hooks: `ctx.trig.key` in `process`, a `ringTrack` choice (off / ratios) beside
`ringShape`. The ratio list wants to be named intervals rather than a number —
sub, unison, fifth, octave, octave+fifth, two octaves, tritone — because the
whole point is which grid the sidebands land on.

Two things to settle before building. The key line is stamped by `ToyChip`
alone, so a board playing only the FM chip or the sampler tracks nothing and has
to fall back to `ringHz`. And at unison the level halves — 0.1192 against 0.2620
for every other ratio — because the carrier's own fundamental beats against the
note it is multiplying; either trim it, or leave it as the reason unison sounds
like a different effect.

## 2. Give the right channel the carrier that is already computed

Free, and it is one character.

`QuadOsc.step()` computes `re` and `im` — a full quadrature pair, which is why
the shifter uses it — and the ring mod reads `im` twice and throws `re` away.
Reading `re` on the right channel instead drops the output correlation from
1.000 to 0.000 with the spectrum, the centroid, the band split and the rms all
unchanged to four figures. The stage adds no width of its own today; this is the
whole of what it takes to fix that, and `Shifter` already does it two files
over.

The sub-audio end is where it pays twice. A carrier at 3 Hz is the tremolo the
help text promises, and today it is a mono tremolo; a quarter turn between the
channels makes it an auto-panner, with no new control and no new state.

The cost is 3 dB folded to mono, and only 3 dB: the sum is `x·√2·sin(θ + π/4)`,
the same effect at a different phase, so there is no cancellation and no comb —
measured at 0.707 of today's mono level at both 3 Hz and 430 Hz.

Whether it wants to be switchable is the only open question. It is a change to
how every existing board with the ring mod up sounds, which is the kind of
change worth being suspicious of even when it is an improvement.

## 3. A diode bridge instead of a multiply

The only candidate that makes the stage answer to how hard it is played.

A four-quadrant multiplier is not what a ring modulator is. The name is four
diodes in a ring, and what they do that a multiply does not is fail to conduct
near zero: quiet signal gets crossover distortion and grit, loud signal pushes
through into something close to the clean product. Modelled as
`d(v) = v > 0 ? v² / (v + vt) : 0` across the bridge, that is the measured
behaviour, and nothing else on the list has it:

| same programme, normalised | −24 dB | −12 dB | 0 dB   |
| -------------------------- | ------ | ------ | ------ |
| sine (today) flatness      | 0.0163 | 0.0163 | 0.0163 |
| square (today) flatness    | 0.0627 | 0.0627 | 0.0627 |
| diode bridge flatness      | 0.0397 | 0.0304 | 0.0139 |
| diode bridge centroid      | 892    | 795    | 633    |

The two shapes on the board are the same three numbers three times over, which
is what a multiplier is: level in, level out, spectrum unmoved. The bridge runs
from brighter-than-square when it is barely driven to cleaner-than-sine when it
is slammed. No knob can fake it, because the one saturation upstream of the
bends is the summing amp and it is upstream of all six of them at once.

It also lands between the two existing shapes on flatness — 0.115 against 0.078
and 0.212 — so it is a third point in the space rather than a louder copy of one
of them.

Hooks: a third `ringShape` choice. A named choice list may only grow at its end
— see `packed.ts` on what a list growing anywhere else does to links already in
the world — and 'diode' after 'square' is exactly that, so this one costs no old
boards.

Two details. It costs 0.11% of a block against 0.03% — 3.3× the stage, and still
nothing. And it is about 8 dB louder than the multiply, so it wants a trim of
~0.4 or switching shape is a jump in level rather than in character; measured
0.37 quiet to 0.48 loud, and leaving that drift in is what keeps the level
dependence audible.

## 4. Not worth building

**A second detuned carrier.** Two oscillators a fifth apart, one per channel,
decorrelate exactly as well as item 2 and read identically on every spectral
column — 0.078 flat, centroid 2490, the same numbers as one carrier. It is a
second `QuadOsc` and a second control to arrive where reading `re` already is.

**Self-ring, the programme as its own carrier.** `ctx.out` is last block's
output and would make this four lines. It measures interesting on its own terms
— 0.199 flat, centroid 3797, and it moves the band split further than anything
else here — but the carrier frequency stops meaning anything, so it is a
waveshaper wearing the ring mod's controls. It is really an octave-up fuzz, and
if it is wanted it wants to be that, in the clipper.

**A carrier bleed control.** See the note on the Mix knob above.

## Setups the board can already be put in

Measured on the same board against a plain 430 Hz ring at `ringMix` 0.9 — the
`vs ring` column is how far each take sits from that one, where 0 is the same
sound. None of these needs a line of code, and none of them is written down
anywhere.

| setup                | flat  | centroid | vs ring |
| -------------------- | ----- | -------- | ------- |
| plain ring 430 Hz    | 0.107 | 3110     | 0.00    |
| carrier on drum hit  | 0.905 | 5118     | 1.37    |
| carrier on the LFO   | 0.592 | 4291     | 1.39    |
| carrier on chaos LFO | 0.549 | 3680     | 1.40    |
| carrier on ROM step  | 0.448 | 3136     | 1.40    |
| square @ 430         | 0.267 | 3795     | 0.47    |
| carrier on the heat  | 0.183 | 3378     | 1.38    |
| ring in the fb desk  | 0.148 | 3266     | 0.44    |
| ring then comb       | 0.042 | 2623     | 0.61    |

The patch bay is where the ring mod's range actually lives, and the lane is four
octaves wide. **A wire from the drum hit onto the carrier reads 0.905 flat** —
the kit slams the carrier up four octaves on every hit and the sidebands smear
into something very near white noise, which is the broadest thing on this table
and is one wire. The bay's own chaos and drunk shapes on the same lane give
0.549 without the rhythm; the ROM step gives 0.448 and stays locked to the tune;
the heat gives 0.183 and takes minutes to get there.

At the other end, **ring then comb** is the poor relation of item 1: the comb
re-tunes the ring's inharmonic mess back onto a pitch, dropping flatness to
0.042 and the centroid to 2623. It is the way to make the clang musical with the
board as it stands, and it spends a second bend slot doing what a tracked
carrier would do in the first.

Worth a line in `docs/BENDS.md` either way. The ring mod's own help text stops
at "sub-audio is tremolo; audio rates put metallic sidebands everywhere", which
is true of the knob and says nothing about the lane.

## Before any of this

**The stage had no test.** Every assertion in the repo that named `ringHz` or
`ringMix` was about the chain map, a preset, or the patch bay proving a wire
does something, and items 1, 2 and 3 all change what comes out of the stage.
`src/dsp/stages/ringmod.test.ts` went in first and holds the numbers above: the
grid a tracked carrier lands on at each ratio, the channel correlation and what
survives a fold to mono, and the one thing only the bridge does — sine and
square measuring the same flatness at two input levels where the bridge does
not.
