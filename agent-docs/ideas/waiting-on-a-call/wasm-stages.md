---
name: wasm-stages
description:
  The amp's Channel in C→wasm is bit-exact, 1.6× faster and makes no garbage;
  moving stages over waits on picking a toolchain and how the worklet loads it.
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

## Before porting a real stage

- Toolchain. clang has no `wasm-ld` here; rustup's `rust-lld -flavor wasm`
  stands in. The other options are Rust (`wasm32-unknown-unknown`) and
  AssemblyScript (an npm dependency, no system toolchain). Either way, a built
  `.wasm` checked in with a check script keeps CI free of the compiler.
- Loading. The worklet gets the bytes through `processorOptions` and compiles
  them synchronously. Chrome's 4 KB sync-compile cap applies on the main thread
  only.
- What moves. The amp's per-sample loop also runs the sag, the sputter, the
  cabinet and the dry delay, so it moves whole. Per-sample knobs (`weakGm`,
  `railPow`) are computed inside it.
