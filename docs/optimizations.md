# Optimizations

What this instrument has done to fit inside an audio callback, what it measured,
and what it tried and threw away.

The audio thread renders 128 samples at a time and gets 2.7 ms to do it, 375
times a second. Miss once and a buffer goes out unfilled, which is a click.

The hard deadline gives two rules, and most of this file applies them:

- A board averaging a tenth of its budget still clicks if its worst blocks are
  ten times its median, so the tail matters more than the mean.
- A collection runs whenever the collector decides, whether or not the schedule
  has room, so allocation matters more than arithmetic.

Numbers here came off a shared 16-core Linux box under Node, and several were
taken while something else was using it. Ratios hold across machines and
absolute times change. Where a number comes from a commit's message and was not
re-measured for this file, the number is marked as a commit's claim.

## Measure first, and know what the measurement can tell you

The obvious way to measure here is wrong, and every later result depends on the
measurement.

`pnpm bench` reports per-stage cost over a long render. `pnpm blocks` reports
the distribution — p50 through p99.9, and how many blocks went over budget —
because glitches come from the slowest blocks. `pnpm cold` reports the first
seconds, before anything has tiered up. `pnpm ab <ref>` compares the working
tree against a git ref. `pnpm cpu` runs the built app in Chrome and reports CPU
time per thread and the underruns Chrome counted.

**The minimum across processes varies by chance.** `bench.ts` takes the best of
several passes, on the reasonable argument that anything else sharing the
machine only ever adds time, so the fastest pass is the least polluted. That
holds inside one process and fails across two, which is how a before-and-after
gets compared. Running the _same tree_ against itself in separate processes
produced a best-block-median 13% apart, a 13% improvement from identical code,
because one process got the luckier tier-up and page placement.

`ab.ts` alternates the trees pair by pair, counts how often the new one won,
then runs a sign test on the count. A busy machine cannot skew that result,
because both sides of a pair run on the same machine. `pnpm ab HEAD` measures
one tree against itself and is the calibration: it should land near half the
pairs, and whatever it reports sets the noise floor for anything else you read
that day.

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
high — enough to make `Math.sqrt` look like it cost 29 ns. Give each case a
separate loop.

## Denormals, which are the largest single effect here

A double that decays toward zero without arriving eventually enters the
subnormal range, where arithmetic runs about 20× slower. Every envelope on this
board decays geometrically and most never reach zero, so without a guard the
instrument gets slower the longer it is left switched on, and stays slower.

`flushDenormal` — `Math.abs(x) < 1e-15 ? 0 : x` — is applied to every recursive
double the filters hold. The commit that added it puts it at 38× on the affected
paths. The tape delay's flutter walk decays by 0.995 a sample, reaches 4.9e-322
in about a minute and stays there, which costs 91 ms per 10 s of audio instead
of 50 ms indefinitely, with no knob touched.

The toy chip's envelopes take the other route. `ENV_FLOOR` stops an envelope at
0.003, where otherwise it would keep halving toward zero for the rest of the
session. Everything there already treats 0.003 as silence — a voice under it can
be stolen and none of them are summed — so the stretch below it was inaudible
arithmetic that cost time.

**A `Float32Array` write needs no guard.** The smallest thing that survives a
round trip through a float buffer is 1.4e-45, and that reads back out as an
ordinary double, three hundred decades clear of where doubles go slow.
`DelayLine.write` guarded every write and protected nothing, on a board that
writes into forty-odd lines a sample.

`denormal.test.ts` walks the whole graph looking for this, in two passes. One
static param pack never finds a decay that starts at zero and never leaves it,
so the second pass winds every knob up and puts it back where it booted, the
only position where a wound-up state shows.

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

The shifter, the ring modulator and the starved stompbox's squeal each ran their
carrier off `Math.sin` at a rate the block already knew; moving them took the
shifter from 96 ms to 77 ms and the ring modulator from 21 ms to 4 ms over 12 s
of audio. The shifter could not take `SineOsc`, whose second state trails the
first by half a sample — a single-sideband shifter cancels its unwanted sideband
exactly as well as its carrier is 90° apart. So `QuadOsc` rotates the whole
angle instead, trading the exact amplitude invariant for about 3e-12 of drift
over twenty seconds.

`d | 0` equals the floor because the clamp above it guarantees the value is
positive and inside the ring. Truncation and flooring differ on negatives, so
the clamp is required.

`octaves` agrees with `Math.pow(2, x)` to 8e-16 relative, which is 1.5e-12
cents, and the rendered output came out bit-identical because the result is
stored in a `Float32Array`, which cannot represent that difference.

## Flat memory, not graphs of objects

Chasing a pointer to a different place on the heap for each of six multiply-adds
cost more than the arithmetic.

The spring tank was seven delay lines inside seven wrapper objects, so one
sample cost fourteen method calls, each loading a buffer, a mask and a cursor
from somewhere else. The same taps in the same order, laid out as three typed
arrays, run **2.3×** faster by the commit's measurement. The shifter's two
allpass chains were eight more objects and went the same way. A tape head's six
one-pole filters were six objects holding one double each, and the machine has
two heads.

`fixedTap` and `readAt` apply the same idea to delay taps. A tap that never
moves would clamp and floor the same constant 48,000 times a second, so it
splits its delay once at construction and reads through `readAt` from there.

Ring buffers are rounded up to a power of two so wrapping is a mask. `%` on a
length the compiler cannot see is an integer divide every time, and the spring
tank alone was running fourteen of them a sample.

## Nothing allocates on the audio thread

A collection on the audio thread causes a gap in the sound, so the garbage the
render loop produces matters as much as the time it spends. The target is zero
allocations, and `bench.ts` reports the count.

`Chain.process` built a `Set` and two spread arrays per block — 375 collections
a second. The slot params go into a buffer the chain owns, the duplicate check
is a bitmask, and the tail is two loops.

The worklet allocated a fresh 2 kB scope trace sixty times a second, a view
object per block from `subarray`, and a 128 kB pair of slabs per recorded chunk.
All of it is written into buffers it owns now.

**`postMessage` serializes on the thread that calls it.** Posting a buffer
without transferring it runs the structured serializer synchronously on the
caller, so the copy costs the posting thread. The cost is predictable: a 128 kB
memcpy every 0.7 s is 13 µs inside a 2.7 ms block and falls at a known point in
the schedule, while a collection runs whenever the collector decides. Because
serialization is synchronous, reusing the buffer immediately afterwards is safe.

**The chain allocates anyway, and `bench.ts` reported zero.** Its
`PerformanceObserver` delivers `gc` entries on a later tick, so the count
printed before any entry arrived. `GCProfiler` counts synchronously, and it puts
the heavy board at 82 collections per pass. A sampling heap profile of a Node
render measures 62 MB allocated per second of audio on the heavy board and 6.4
MB on the stock board. In Chrome the worklet allocated 34 MB a second on the
heavy board and ran about 20 scavenges a second on the audio thread, each around
0.35 ms on AC power.

Nearly all of the allocation is boxed doubles. V8 keeps a double unboxed inside
one optimized function and writes a double field in place, but a call that stays
out of line passes its double arguments and its double return value as heap
numbers. A micro-benchmark of one pole written both ways measured 489 ms and 305
collections for 20 million out-of-line calls that return the value, and 266 ms
and no collections when the callee stores it in a field and the caller reads the
field. TurboFan inlines a callee only while the caller's inlined bytecode stays
under 920 bytes, and several stage `process` methods are over 4,000 bytes of
bytecode on their own, so the helpers they call per sample stay out of line.

## Give V8 small loops to compile

A small method that runs a whole block gets a separate compile and a separate
inlining budget, so TurboFan inlines the helpers it calls:

| change                                                        | measured, paired               |
| ------------------------------------------------------------- | ------------------------------ |
| spring tanks run a whole block per call                       | heavy board 9% faster, 8 of 8  |
| safety tail and limiter moved out of `Chain.process`          | stock board 3% faster, 7 of 8  |
| multi-pole filters in one `Float64Array`, FM powers as tables | stock board 11% faster, 7 of 8 |

`--trace-turbo-inlining` shows the tail: `tail` inlines both dc blockers, all
three followers, the one-pole and both clippers. The tape heads took the same
block conversion and measured no change, because the per-sample body of a head
is large enough that its calls to `readHermite`, `softclip` and the noise
closure still stay out of line. The drum kit is the largest remaining case, at
half the DSP time and 60% of the allocation on the stock board, all inside one
`process` method.

## Block rate against sample rate

A knob holds still for the length of a block, so anything derived only from
knobs should be computed at the top of the loop. The spring verb worked out
eight `pow` calls a sample for a decay that had not moved; `Transient` called
`coef` four times a sample for four fixed time constants; the toy rail
recomputed a `pow` for a reservoir factor 48,000 times a second.

Hoisting the _constant_ coefficients — the ones that depend only on the sample
rate — measured about 0.1%. Moving a computation to block rate pays when the
computation is expensive and repeated.

## Off the audio thread

The signal-path map used graphviz: a 1.35 MB wasm chunk that had to load before
the panel appeared, for a layout that is a column of boxes and a few wires round
the outside. Placing fifteen boxes is arithmetic, so `chain-map.ts` computes the
layout directly, and the live map and the README's drawing both use that layout,
so they cannot differ.

With the layout computed in `chain-map.ts`, the 150 ms redraw throttle went
away. The throttle came back later for a different reason: two of the strings on
the map are numbers printed on wires, a morph moves them every frame, and React
still gets a fresh tree of 179 SVG elements to diff — about half a millisecond
to build and as much again to reconcile, so roughly 32 ms of every second a
board is travelling. The map reads the board immediately when the board has been
still, and on the trailing edge of the throttle while it is moving.

### Every thread, and on battery

`pnpm cpu` reads each Chrome thread's run time from `/proc`, so it covers the
audio thread, the compositor and the GPU process as well as the main thread, and
it reads the underrun count from `AudioContext.playbackStats`. On the i9-9880H
laptop this was measured on, with the heavy board playing and a tape threaded,
battery power roughly tripled the audio thread's cost:

| thread, % of one core | on battery | on AC |
| --------------------- | ---------- | ----- |
| audio worklet         | 67         | 20    |
| GPU process main      | 48         | 16    |
| renderer main         | 19         | 7     |

Node renders the same board at 21% of a core on battery. The worklet renders in
bursts of two or three quanta per device callback, and a power-saving CPU
governor keeps the core at a low frequency between bursts.

The stock board with nothing playing cost 14% of a core on the audio thread, 5%
on the renderer main thread, 4% on the compositor and 14% in the GPU process, on
battery. The scope, the reel and the desk each ran a `requestAnimationFrame`
loop for as long as they were mounted and repainted a canvas every frame, so a
silent board kept the compositor and the GPU process drawing. They now request a
frame when a meter post has something new to draw, and the scope stops once it
has drawn a flat trace.

### The panel is not what costs; one write a frame was

On a board playing both machines with a tape threaded, the panel's whole share
of the main thread was 13% of wall — 2.1 ms of every 16.6 ms frame — and React's
own render and commit was a fifth of that. Two thirds of it was style, layout
and paint, and all of that came from a single line.

`RailLamp` wrote `style.background` and `textContent` on every animation frame,
whether or not the rail had moved — and on most boards it has not, so the same
two strings went in sixty times a second. A `textContent` write swaps the text
node whether the word changed or not, which dirties layout; the colour is a
`color-mix()` over a `var()`, which is a parse and a style invalidation. The
document went through layout on every frame the panel was up. Comparing before
writing, as the panic bar and the desk's meters already did, gave:

| over 8 s, both machines running | before  | after  |
| ------------------------------- | ------- | ------ |
| main-thread task time           | 2028 ms | 659 ms |
| js in animation frames          | 689 ms  | 172 ms |
| paint                           | 399 ms  | 57 ms  |
| layout                          | 263 ms  | 31 ms  |
| style recalc                    | 42 ms   | 5.5 ms |

A frame callback that writes the DOM has to hold what it last wrote and compare,
because the browser does not skip an unchanged write, which costs as much as a
changed one.

### So is React dropping frames? Only when a stage opens

`pnpm panel` reports what fraction of the wall clock React held the main thread
for and the longest unbroken stretch it held it, which decides whether a frame
is missed. A render averaging half a millisecond a frame and a render that
arrives as one twenty-millisecond burst have the same mean, but only the burst
misses frames.

Eight seconds each, heavy board, tape threaded, both machines running:

| scene                    | frames | react, of wall | react's longest render |
| ------------------------ | ------ | -------------- | ---------------------- |
| playing, nothing touched | 61/s   | 0.2%           | 0.6 ms                 |
| a board travelling       | 61/s   | 1.8%           | 2.0–3.9 ms             |
| a slider under a hand    | 61/s   | 0.4%           | 1.8 ms                 |
| stage after stage opened | 62/s   | 1.9%           | 14–20 ms               |

For the first three the answer is no, and not narrowly: React's worst single
render is under 4 ms of a 16.7 ms frame, and no task of any kind overran the
budget. Those runs do report one or two gaps wider than a frame per eight
seconds, but so does the run with nothing touched, where React is on the thread
for 0.2% of the time, so those gaps come from the machine the measurement ran
on. In the morph the board writes every control every frame, 441 renders in
eight seconds, and React still costs under 2% of the wall. The map, which is
expensive to rebuild, updates on a 120 ms clock, and everything else reads a
single number from the board.

Opening a stage is the exception: mounting a rack of controls is a single render
around the length of a frame, and it is the only interaction in the app where
React accounts for the main-thread time.

A fifth of that cost was not React. `OpenGroup` scrolled the stage it had just
opened into view from an effect. The scroll reads what overflows, how tall a box
is and where it sits, and those reads need a laid-out document, which the commit
had just invalidated. The reads forced style and layout of the whole freshly
mounted rack _inside_ the render that built it: `scrollParent` alone was 54 ms
of the 233 ms React spent in ten seconds of opening stages, 23% of it, and the
commit phase was 95 ms. The scroll now runs in the next animation frame, where
the browser has done that layout anyway and a smooth scroll starting one frame
later is invisible. The whole call disappears from the profile; commit goes to
36 ms and React's total to 187, paired and alternated.

Like the rail lamp, this cost came from touching the DOM at the wrong time. The
lamp wrote it when nothing had changed; here the code read it at the one moment
it is guaranteed to be dirty. A frame callback is the cheap place to do either.

What is left is first-mount cost spread across many functions: the render phase
is unchanged at 135 ms for nineteen opens, and nothing under it exceeds 7 ms —
`Tip` on nearly every row, `createElement`, `setInitialProperties`,
`appendChild`, the map's rebuild. No hotspot is left, and the only saving is
mounting fewer elements, which the panel's density rules out.

In the first three scenes the panel still costs 6% of one core sitting still and
14% with a board travelling, and almost none of that is React. Sitting still,
the cost is the two canvases and the compositor; travelling, it is paint and
layerize from replacing the signal-path drawing every 120 ms.

Three smaller ones, measured the same way with a sampling profile of the
renderer:

- **The reel's envelope was 256 `fillRect`s a frame**, for a drawing in two
  colours. Building two paths and filling each once took the reel from 0.61% of
  the main thread to 0.40%.
- **The note report allocated four times a frame to say nothing had changed.**
  `mergeNotes` built a `subarray` and a `Set` per chip per meter post purely to
  compare sizes. It now counts the distinct notes, nine at most, which took it
  from 0.13% to nothing.
- **`packParams` allocated a fresh 361-float buffer per flush**, which during a
  morph is one a frame. It takes an `out` buffer now, the way `peaksOf` does,
  and the engine keeps one: `postMessage` serializes on the calling thread, so
  the buffer is free again the moment the post returns.

### A property read inside a sample loop

Dropping a file, or rolling one off archive.org, froze the tab for 212 ms. The
downmix to mono read `buf.numberOfChannels` — an attribute on the decoded
`AudioBuffer` — as the divisor of its inner loop, so ninety seconds of stereo
made 8.6 million reads through the binding. Reading it once into a local, with
the same division and bit-identical output, took the loop from 135 ms to 25 ms
and the freeze to about half.

The block-rate rule from the audio thread applies here in general form: any
value the loop does not compute is a constant, and a host object's attribute is
an expensive one.

## What did not pay

- **Hoisting constant coefficients.** Looks obvious, measured ~0.1%.
- **A polynomial sine.** `Math.sin` is 8.8 ns; a 5th-order minimax on the
  half-wave is 15.6 ns, so libm is faster.
- **A polynomial exp2.** 32 ns against `Math.exp`'s 16 — and the polynomial
  needs a `2 ** n` for the integer part, which is the very call being avoided.
- **The `% 1` phase wrap.** 0.65 ns a turn in place. It stayed because it is
  exact and reads no worse.
- **A bigger internal block.** Measured +15%, at the cost of 8 ms of latency and
  a change to the feedback character the README leans on.
- **Wasm and SIMD.** A last resort for another 2–4× that costs the readability
  the rest of this depends on.
- **Replacing floating-ui with a hand-rolled tip.** Twelve seconds of hovering,
  twenty tips up and down: not one floating-ui function appears in the top
  twenty by self time, React holds the thread for 0.4% of it, its longest render
  is 2.1 ms, and nothing overran a frame. The panel is _less_ busy under a
  hovering pointer (1.48 ms a frame) than under a travelling board (2.27 ms).

  The current tip is built the way a hand-rolled one would have to be. `Bubble`
  is a separate component and the only thing that calls `useFloating`, so an
  idle tip costs one state hook and no listeners, and the drum grid alone holds
  a hundred and twenty of them. The bubble is already a native `popover` in the
  top layer, so the library supplies flip and shift, which keep a tip on a
  slider at the foot of the panel from opening off the bottom of the window.

  Removing floating-ui would save 8.1 kB gzipped, 4% of the bundle, measured by
  stubbing the import out and rebuilding. That saving matters at load time and
  not per frame. CSS anchor positioning (`position-anchor`,
  `position-try-fallbacks: flip-block`) does flip and shift declaratively with
  no javascript, but it is Chromium-only for now, so it needs a fallback, which
  brings back most of the code.

- **`flushDenormal` as two compares.** `x < 1e-15 && x > -1e-15 ? 0 : x` returns
  the same value as the `Math.abs` form for every input and is 20 bytes of
  bytecode against 28, under V8's 27-byte limit for inlining regardless of
  budget. Paired against the `Math.abs` form it measured 0.996 on the stock
  board and 1.029 on the heavy board, so V8 already inlined it where it counted.
- **Skipping silent toy-chip voices.** Skipping the fade on a voice at zero,
  reading the rail's amp factor only when the melody sounds and skipping the mix
  clipper on a zero sum measured 1.021 on the stock board, 4 of 8.
- **Tape heads a block at a time.** 1.037 on the heavy board, 3 of 8. See
  [Give V8 small loops to compile](#give-v8-small-loops-to-compile).

## Still open

- **The first five seconds.** The stock board settles at 0.0585 ms a block and
  takes about five seconds to get there, putting 67 blocks over budget on the
  way — 67 clicks on page load, every load. `bench.ts` renders 400 blocks before
  it starts timing and `blocks.ts` renders 2000, so neither can see it;
  `pnpm cold` measures it. Steady state shows no deoptimization (a 4 s render
  deopts 81 times, a 40 s render 67), so the cause is tier-up and not a bug. A
  throwaway warm-up chain halves it and costs 700 ms of silence at load;
  faulting the delay lines in with `panic()` takes almost no time and is worth
  about a tenth. Neither finishes it, and the measurements come from Node while
  the worklet runs in Chrome. A DevTools profile of the first seconds is needed.
- **`toyChip`** holds its voices as an array of objects and is the most
  expensive stage on the board. The spring tank's flat-memory layout would apply
  to it.
- **The chain's safety tail** runs eight filter objects a sample.
- **`computeFeedback`** reads its comb through the clamping `read()` although
  the delay is fixed for the block.
- **The tape's print-through** takes a second 4-point Hermite read whose output
  goes straight into a 2500 Hz lowpass at 0.05 gain, where linear would do.
- **Opening a stage** is still a 14–20 ms React render, the largest in the app,
  and still around the length of a frame after the forced layout came out of it.
  The cost is a rack of controls being mounted with no hotspot in it, so the
  remaining saving is rendering fewer elements, which changes the panel and not
  React.
- **Paint and layerize, while the map is moving.** `pnpm panel morph` reports
  them at 0.49 and 0.29 ms a frame, which are the two largest columns and more
  than all the javascript. The cost comes from the signal-path drawing: 179 SVG
  elements replaced every 120 ms, and the compositor re-recording that corner of
  the document each time. No cheap fix is known: the throttle is already in
  place, and the next step is a canvas or memoising the subtrees that did not
  move.
- **The scope's trace** is the largest single thing javascript does per frame at
  about 0.25% of one core, and it is already close to minimal: 512 `lineTo` into
  a backing store 2216 pixels wide, so the trace is sparser than the canvas and
  there is nothing to decimate. The remaining saving is drawing it less often,
  and the trace is the one thing on screen read for its shape.
- **`peaksOf` over a freshly dropped file** is the 19 ms still inside the sample
  load's long task, and it is a full scan of ninety seconds of audio to fill 256
  bins.

## Techniques from elsewhere

Each technique below is unmeasured here and marks a place to look next.

- **FTZ/DAZ is unreachable from JavaScript.** Native audio code sets the CPU
  flags that make denormals flush to zero with no extra code. JS cannot set
  them, so the explicit compare above is needed, and it is worth 38×.
- **Never lock, never allocate, never wait on the audio thread.** The standard
  main-to-audio channel is a `SharedArrayBuffer` ring with atomics, not
  `postMessage`, once the traffic is more than occasional.
- **Watch for megamorphic call sites in hot loops.** The chain calls
  `s.process()` over fifteen different stage classes, which is megamorphic — but
  it happens twenty times a block and not per sample, so its cost is negligible.
  The same call pattern inside a sample loop would be expensive.
- **`Float32Array` halves memory traffic** against `Float64Array` and costs a
  conversion on every read and write. Delay lines here are f32 because they are
  large and streamed; filter state is f64 because it is small, hot, and
  recursive.
- **Branch-free arithmetic** pays where a branch is unpredictable, and costs
  where the predictor would have got it right. Measure before straightening one
  out.
- **Table-driven transcendentals** still win for anything with a rejection loop
  in it, as the gaussian did. For a plain `sin` or `exp`, libm has caught up.
