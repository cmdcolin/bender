---
name: wasm-stages
description:
  The amp's Channel in C→wasm is bit-exact, 1.6× faster and makes no garbage,
  but in Chrome the garbage costs under 1% of the audio thread; the case is the
  amp's CPU, about a quarter of the heavy board's.
---

# Heavy stages in WebAssembly

The garbage left on a warm board comes from V8 boxing doubles in the per-sample
code. Wasm has no boxed numbers and no collector.

## Spike: the amp's Channel

[`scripts/wasm-spike/`](../../../scripts/wasm-spike/) holds the amp's Channel
(upsampler, three triodes, tone stack, push-pull, transformer, half-band, DC
blocker) in C, built with clang's wasm32 target, and a bench against the
TypeScript Channel. It covers 10 s at 48 kHz, one channel, in Node 24:

| board    | TS: CPU, garbage  | wasm, 128-sample blocks | wasm, a call a sample |
| -------- | ----------------- | ----------------------- | --------------------- |
| fender   | 2.60 %, 10.8 MB/s | 1.60 %, 0.02 MB/s       | 1.70 %, 1.5 MB/s      |
| marshall | 3.39 %, 15.4 MB/s | 2.06 %, 0.01 MB/s       | 2.20 %, 1.5 MB/s      |

- Every sample matches bit for bit. The code is plain f64 arithmetic with
  `sqrt`, built with `-ffp-contract=off`. The coefficients are computed in JS
  and handed over, so `Math.sin` and `Math.pow` never need to agree with libm.
- `-msimd128` auto-vectorizes the half-band loops and comes out 5-10% slower.
- A call a sample boxes the returned double, about 32 bytes. Blocks are the
  shape that makes no garbage, so a port takes a stage's whole sample loop and
  not a helper.

## What the garbage costs in Chrome

The heavy board (every bend slotted, every machine and pedal up) and the stock
board were each played for 20 s in headless Chrome 2026-10-30 on an i9-9880H,
with the audio thread traced. Chrome wakes the worklet for four blocks at a
time, 10.7 ms.

| run            | block median, p99 | wakes over budget | minor GCs on the audio thread  |
| -------------- | ----------------- | ----------------- | ------------------------------ |
| heavy, AC      | 0.77, 2.49 ms     | 13 of 1873        | 31/s, median 0.24, max 1.06 ms |
| stock, AC      | 0.26, 1.53 ms     | 0 of 1876         | 6/s, median 0.25, max 1.19 ms  |
| heavy, battery | 1.69, 3.96 ms     | not measured      | 31/s, median 0.47, max 1.35 ms |

- V8 runs the scavenges as tasks between wakes, not inside `process()`. That
  totals 0.8% of the audio thread on AC.
- Every late wake had all four blocks slow together (2.3-4 ms each), and only 4
  of the 13 had a GC near them. They come from the CPU slowing down, not from
  pauses.
- So zero garbage alone buys little. CPU is what runs out, and throttling on
  battery more than doubles it.

`pnpm bench` puts the amp at 6.1% of a core on the heavy board, out of 21.3%;
nothing else is over 2%. A port at the spike's 1.6× would take about 11% off the
heavy board.

## Before porting a real stage

- Toolchain. Rust (`wasm32-unknown-unknown`, installed here), with plain
  `extern "C"` exports and no wasm-bindgen. AssemblyScript's objects are
  collected, so it would have to work on raw memory to stay garbage-free. Either
  way, a built `.wasm` checked in with a check script keeps CI free of the
  compiler.
- Loading. The worklet gets the bytes through `processorOptions` and compiles
  them synchronously. Chrome's 4 KB sync-compile cap applies on the main thread
  only.
- What moves. The amp's per-sample loop also runs the sag, the sputter, the
  cabinet and the dry delay, so it moves whole. Per-sample knobs (`weakGm`,
  `railPow`) are computed inside it.
