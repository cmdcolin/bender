# Optimizations

What this instrument has done to fit inside an audio callback, what it measured,
and what it tried and threw away.

The audio thread renders 128 samples at a time and gets 2.7 ms to do it, 375
times a second. Miss once and a buffer goes out unfilled, which is a click.
Nothing here is ordinary optimization, where a slow path costs patience: the
deadline is hard, it arrives 375 times a second, and the penalty is audible
rather than merely slow.

Two things follow from that, and most of this file is downstream of them. The
tail matters more than the mean — a board averaging a tenth of its budget still
clicks if its worst blocks are ten times its median. And allocation matters more
than arithmetic, because a collection lands where the collector chooses rather
than where the schedule has room.

Numbers here came off a shared 16-core Linux box under Node, and several were
taken while something else was using it. Ratios travel between machines;
absolutes do not. Where a number is a commit's own claim rather than something
re-measured for this file, it says so.

## Measure first, and know what the measurement can tell you

This section is first because everything after it is only worth what the
measurement behind it is worth, and the obvious way to measure here is wrong.

`pnpm bench` reports per-stage cost over a long render. `pnpm blocks` reports
the distribution — p50 through p99.9, and how many blocks went over budget —
because the mean is not what glitches. `pnpm cold` reports the first seconds,
before anything has tiered up. `pnpm ab <ref>` compares the working tree against
a git ref.

**The minimum across processes is a lottery.** `bench.ts` takes the best of
several passes, on the reasonable argument that anything else sharing the
machine only ever adds time, so the fastest pass is the least polluted. That
holds inside one process. It fails across two, and across two is how a
before-and-after gets read. Running the _same tree_ against itself in separate
processes produced a best-block-median 13% apart — a 13% improvement from
identical code, from nothing but which process got the luckier tier-up and page
placement.

So `ab.ts` does not compare two numbers. It alternates the trees pair by pair
and counts how often the new one won, then runs a sign test on the count. A busy
machine cannot answer that question wrongly, because both sides of a pair meet
the same machine. `pnpm ab HEAD` measures one tree against itself and is the
calibration: it should land near half the pairs, and whatever it reports is the
floor under anything else you read that day.

**Microbenchmarks measure latency; loops measure throughput.** Wrapping a phase
with `% 1` costs 16.5 ns in a loop where each turn waits for the last one, and
1.6 ns for a compare instead — which predicted about 6% of the board, since ten
phases a sample go through it. In place it was worth 0.65 ns a turn, because the
ten phases are independent and the hardware overlaps the fmods. The
microbenchmark measured a dependency chain the real code does not have. Build
the benchmark with as many independent chains as the code has.

**Watch for a shared call site going megamorphic.** An early version of that
same benchmark ran every case through one higher-order runner. The call site
went megamorphic after the first case and every case after it read about 28 ns
high — enough to make `Math.sqrt` look like it cost 29 ns. Give each case its
own loop.

## Denormals, which are the largest single effect here

A double that decays toward zero without arriving eventually lands in the
subnormal range, where arithmetic runs about 20× slower. Every envelope on this
board decays geometrically and most never reach zero, so the instrument used to
get slower the longer it was left switched on, and stay slower.

`flushDenormal` — `Math.abs(x) < 1e-15 ? 0 : x` — sits on every recursive double
the filters carry. The commit that added it puts it at 38× on the affected
paths. The tape delay's flutter walk decays by 0.995 a sample, reaches 4.9e-322
in about a minute and stays there: 91 ms per 10 s of audio instead of 50 ms, for
ever, on a board whose knobs read as untouched.

The toy chip's envelopes take the other route. `ENV_FLOOR` stops an envelope at
0.003 rather than halving toward zero for the rest of the session. Everything
there already treats that as silence — a voice under it can be stolen and none
of them are summed — so the last stretch was inaudible arithmetic, and not free.

**The guard does not belong on `Float32Array` writes.** The smallest thing that
survives a round trip through a float buffer is 1.4e-45, and that reads back out
as an ordinary double, three hundred decades clear of where doubles go slow.
`DelayLine.write` guarded every write and protected nothing, on a board that
writes into forty-odd lines a sample.

`denormal.test.ts` walks the whole graph looking for this. It needs two passes:
one static param pack never finds a decay that starts at zero and never leaves
it, so a second pass winds every knob up and puts it back where it booted, which
is the only side a wound-up state is visible from.

## Stop calling libm every sample

| what                              | instead of                    | cost                                                       |
| --------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `softclip` — Padé (7,6)           | `Math.tanh`                   | holds to ~1e-4, stays odd, smooth and monotonic            |
| `SineOsc` — magic circle          | `Math.sin`                    | two multiplies a sample                                    |
| `QuadOsc` — full rotation         | `Math.sin` + `Math.cos`       | four multiplies for the pair                               |
| `gaussian` — 32k table + xorshift | Marsaglia polar               | 63.9 → 5.77 ns measured here; the commit claims 42.9 → 2.6 |
| `octaves` — `Math.exp(x * LN2)`   | `Math.pow(2, x)`              | 35 → 21 ns                                                 |
| `SEMI` — 144-entry ratio table    | `Math.pow(2, n/12)` per voice | eight pow calls a sample, gone                             |
| `d \| 0`                          | `Math.floor(d)`               | one instruction against a call                             |

The carriers are worth a note. The shifter, the ring modulator and the starved
stompbox's squeal each ran off `Math.sin` at a rate the block already knew;
moving them took the shifter from 96 ms to 77 ms and the ring modulator from 21
ms to 4 ms over 12 s of audio. The shifter could not take `SineOsc`, whose
second state trails the first by half a sample — a single-sideband shifter
cancels its unwanted sideband exactly as well as its carrier is 90° apart. So
`QuadOsc` rotates the whole angle instead, trading the exact amplitude invariant
for about 3e-12 of drift over twenty seconds.

`d | 0` is only the floor because the clamp above it already guarantees the
value is positive and inside the ring. Truncation and flooring part company on
negatives, so the clamp is load-bearing, not decoration.

`octaves` is not an approximation worth worrying about: it agrees with
`Math.pow(2, x)` to 8e-16 relative, which is 1.5e-12 cents, and the rendered
output came out bit-identical because it lands in a `Float32Array` where that
difference cannot be represented at all.

## Flat memory, not graphs of objects

The arithmetic was rarely the cost. Chasing a pointer to a different place on
the heap for each of six multiply-adds was the cost.

The spring tank was seven delay lines inside seven wrapper objects, so one
sample cost fourteen method calls, each loading a buffer, a mask and a cursor
from somewhere else. Same taps, same order, laid out as three typed arrays:
**2.3×** by the commit's measurement. The shifter's two allpass chains were
eight more objects and went the same way. A tape head's six one-pole filters
were six objects holding one double each, and the machine has two heads.

`fixedTap` and `readAt` are the same idea for delay taps. A tap that never moves
has no business clamping and flooring the same constant 48,000 times a second,
so it splits its delay once at construction and reads through `readAt` from
there.

Ring buffers are rounded up to a power of two so wrapping is a mask rather than
a modulo. `%` on a length the compiler cannot see is an integer divide every
time, and the spring tank alone was paying for fourteen of them a sample.

## Nothing allocates on the audio thread

A collection on the audio thread is a hole in the sound, so what the render loop
hands the collector matters as much as what it spends. The number to aim at is
none at all, and `bench.ts` reports it.

`Chain.process` built a `Set` and two spread arrays per block — 375 collections
a second. The slot params go into a buffer the chain owns, the duplicate check
is a bitmask, and the tail is two loops.

The worklet allocated a fresh 2 kB scope trace sixty times a second, a view
object per block from `subarray`, and a 128 kB pair of slabs per recorded chunk.
All of it is written into buffers it owns now.

**`postMessage` serializes on the thread that calls it.** Posting a buffer
without transferring it does not move the copy to the receiver — the structured
serializer runs synchronously on the caller. What it buys is the _kind_ of cost:
a 128 kB memcpy every 0.7 s is 13 µs inside a 2.7 ms block, landing where the
schedule can see it, where an allocation lands whenever the collector decides.
Because serialization is synchronous, reusing the buffer immediately afterwards
is safe.

## Block rate against sample rate

A knob holds still for the length of a block, so anything derived only from
knobs belongs at the top of the loop. The spring verb worked out eight `pow`
calls a sample for a decay that had not moved; `Transient` called `coef` four
times a sample for four fixed time constants; the toy rail recomputed a `pow`
for a reservoir factor 48,000 times a second.

The limit is worth knowing. Hoisting the _constant_ coefficients — the ones that
depend only on the sample rate — measured about 0.1%. Being at block rate is not
by itself a reason to move something; being expensive and repeated is.

## Off the audio thread

The signal-path map used graphviz: a 1.35 MB wasm chunk that had to load before
the panel appeared, for a layout that is a column of boxes and a few wires round
the outside. Placing fifteen boxes is arithmetic, so `chain-map.ts` does it, and
both the live map and the README's drawing come out of the one layout and cannot
drift.

Owning the layout removed a 150 ms redraw throttle. The throttle came back later
for a different reason: two of the strings on the map are numbers printed on
wires, a morph moves them every frame, and React still gets a fresh tree of 179
SVG elements to diff — about half a millisecond to build and as much again to
reconcile, so roughly 32 ms of every second a board is travelling. The map reads
the board on its own clock: at once when it has been still, on the trailing edge
while it is moving.

### The panel is not what costs; one write a frame was

React was never the expensive thing here. On a board playing both machines with
a tape threaded, the panel's whole share of the main thread was 13% of wall —
2.1 ms of every 16.6 ms frame — and React's own render and commit was a fifth of
that. Two thirds of it was style, layout and paint, and all of that came from a
single line.

`RailLamp` wrote `style.background` and `textContent` on every animation frame,
whether or not the rail had moved — and on most boards it has not, so the same
two strings went in sixty times a second. A `textContent` write swaps the text
node whether the word changed or not, which dirties layout; the colour is a
`color-mix()` over a `var()`, which is a parse and a style invalidation. The
document went through layout on every frame the panel was up. Comparing before
writing, which the panic bar and the desk's meters already did:

| over 8 s, both machines running | before  | after  |
| ------------------------------- | ------- | ------ |
| main-thread task time           | 2028 ms | 659 ms |
| js in animation frames          | 689 ms  | 172 ms |
| paint                           | 399 ms  | 57 ms  |
| layout                          | 263 ms  | 31 ms  |
| style recalc                    | 42 ms   | 5.5 ms |

The lesson is not about the lamp. Anything that writes the DOM off a frame
callback has to hold what it last wrote and compare, because the browser will
not: an unchanged write is as expensive as a changed one.

Three smaller ones, measured the same way with a sampling profile of the
renderer:

- **The reel's envelope was 256 `fillRect`s a frame.** Two hundred and fifty-six
  draws for a drawing in two colours. Laid into two paths and filled twice, the
  reel went from 0.61% of the main thread to 0.40%.
- **The note report allocated four times a frame to say nothing had changed.**
  `mergeNotes` built a `subarray` and a `Set` per chip per meter post purely to
  compare sizes. Counting the distinct notes instead — nine of them, at most —
  took it from 0.13% to nothing.
- **`packParams` drew a fresh 361-float buffer per flush**, which during a morph
  is one a frame. It takes an `out` buffer now, the way `peaksOf` does, and the
  engine keeps one: `postMessage` serializes on the calling thread, so the
  buffer is free again the moment the post returns.

### A property read inside a sample loop

Dropping a file, or rolling one off archive.org, froze the tab for 212 ms. The
downmix to mono read `buf.numberOfChannels` — an attribute on the decoded
`AudioBuffer` — as the divisor of its inner loop, so ninety seconds of stereo
paid 8.6 million trips across the binding. Reading it once into a local, with
the same division and bit-identical output, took the loop from 135 ms to 25 ms
and the freeze to about half.

Same shape as the block-rate rule on the audio thread, and worth stating in the
general form: anything the loop did not compute itself is a constant, and a host
object's attribute is the most expensive kind of constant there is.

## What did not pay

Worth recording so nobody spends the afternoon twice.

- **Hoisting constant coefficients.** Looks obvious, measured ~0.1%.
- **A polynomial sine.** `Math.sin` is 8.8 ns; a 5th-order minimax on the
  half-wave is 15.6 ns. libm is good now.
- **A polynomial exp2.** 32 ns against `Math.exp`'s 16 — and the polynomial
  needs a `2 ** n` for the integer part, which is the very call being avoided.
- **The `% 1` phase wrap.** 0.65 ns a turn in place. It stayed because it is
  exact and reads no worse, not because it showed up.
- **A bigger internal block.** Measured +15%, at the cost of 8 ms of latency and
  a change to the feedback character the README leans on.
- **Wasm and SIMD.** An honest last resort for another 2–4×, and it costs the
  readability that makes the rest of this possible.

## Still open

- **The first five seconds.** The stock board settles at 0.0585 ms a block and
  takes about five seconds to get there, putting 67 blocks over budget on the
  way — 67 clicks on page load, every load. `bench.ts` renders 400 blocks before
  it starts timing and `blocks.ts` renders 2000, so neither can see it;
  `pnpm cold` exists to. Nothing is deoptimizing in steady state (a 4 s render
  deopts 81 times, a 40 s render 67), so this is tier-up, not a bug. A throwaway
  warm-up chain halves it and costs 700 ms of silence at load; faulting the
  delay lines in with `panic()` is nearly free and worth about a tenth. Neither
  finishes it, and none of it is measured where it happens — this is Node, the
  worklet is Chrome. That wants a DevTools profile of the first seconds.
- **`toyChip`** holds its voices as an array of objects and is the most
  expensive stage on the board. Same treatment as the spring tank.
- **The chain's safety tail** runs eight filter objects a sample.
- **`computeFeedback`** reads its comb through the clamping `read()` although
  the delay is fixed for the block.
- **The tape's print-through** takes a second 4-point Hermite read whose output
  goes straight into a 2500 Hz lowpass at 0.05 gain, where linear would do.
- **Paint and layerize, while the map is moving.** `pnpm panel morph` puts them
  at 0.49 and 0.29 ms a frame, which is the two largest columns and more than
  all the javascript. It is the signal-path drawing: 179 SVG elements replaced
  every 120 ms, and the compositor re-recording that corner of the document each
  time. Nothing cheap suggests itself — the throttle is already there, and the
  next step down is either a canvas or memoising the subtrees that did not move.
- **The scope's trace** is the largest single thing javascript does per frame at
  about 0.25% of one core, and it is already close to minimal: 512 `lineTo` into
  a backing store 2216 pixels wide, so the trace is sparser than the canvas and
  there is nothing to decimate. Only drawing it less often would help, and that
  is the one thing on screen you read a shape off.
- **`peaksOf` over a freshly dropped file** is the 19 ms still inside the sample
  load's long task, and it is a full scan of ninety seconds of audio to fill 256
  bins.

## Techniques from elsewhere

Not measured here, and listed because they are the next places to look rather
than because this instrument needs them.

- **FTZ/DAZ is unreachable from JavaScript.** Native audio code sets the CPU
  flags that make denormals flush to zero for free. JS cannot, which is why the
  explicit compare above exists and why it is worth 38× rather than nothing.
- **Never lock, never allocate, never wait on the audio thread.** The standard
  main-to-audio channel is a `SharedArrayBuffer` ring with atomics, not
  `postMessage`, once the traffic is more than occasional.
- **Watch for megamorphic call sites in hot loops.** The chain calls
  `s.process()` over fifteen different stage classes, which is megamorphic — but
  it happens twenty times a block, not per sample, so it costs nothing. The same
  shape inside a sample loop would not be free.
- **`Float32Array` halves memory traffic** against `Float64Array` and costs a
  conversion on every read and write. Delay lines here are f32 because they are
  large and streamed; filter state is f64 because it is small, hot, and
  recursive.
- **Branch-free arithmetic** pays where a branch is genuinely unpredictable, and
  costs where the predictor would have got it right. Measure before
  straightening one out.
- **Table-driven transcendentals** still win for anything with a rejection loop
  in it, as the gaussian did. For a plain `sin` or `exp`, libm has caught up.
