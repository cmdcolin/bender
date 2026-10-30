import { DEFAULT_CONTROLS, type Controls } from '../../src/controls.ts'
import { Amp } from '../../src/dsp/stages/amp.ts'
import { packParams } from '../../src/engine/params.ts'

// The amp's Channel in TypeScript against channel.c in wasm: the same input
// through both, for time, garbage and whether every sample matches bit for bit.
//
//   scripts/wasm-spike/build.sh && node scripts/wasm-spike/bench.ts
import { readFileSync } from 'node:fs'
import { GCProfiler, getHeapStatistics } from 'node:v8'

const SR = 48000
const SECONDS = Number(process.env.SECONDS ?? 10)
const N = SECONDS * SR
const BLOCK = 128

// halfband.ts's design(), copied: the same code gives the same doubles.
const TAPS = 63
const CENTRE = (TAPS - 1) / 2
const BETA = 8
function besselI0(x: number): number {
  let sum = 1
  let term = 1
  for (let k = 1; k < 32; k++) {
    term *= (x / (2 * k)) ** 2
    sum += term
  }
  return sum
}
function design() {
  const side = new Float64Array((CENTRE + 1) / 2)
  let total = 0.5
  for (let j = 0; j < side.length; j++) {
    const off = 2 * j + 1
    const sinc = Math.sin((Math.PI * off) / 2) / (Math.PI * off)
    const w =
      besselI0(BETA * Math.sqrt(1 - (off / (CENTRE + 1)) ** 2)) / besselI0(BETA)
    side[j] = sinc * w
    total += 2 * side[j]!
  }
  for (let j = 0; j < side.length; j++) side[j]! /= total
  return { centre: 0.5 / total, side }
}
const HB = design()

const BOARDS: Record<string, Partial<Controls>> = {
  fender: { ampMix: 1, ampGain: 0.6, ampVoice: 0, ampMicro: 0 },
  marshall: {
    ampMix: 1,
    ampGain: 0.9,
    ampVoice: 1,
    ampMicro: 0.5,
    ampPresence: 0.7,
    ampCap: 0.4,
  },
}

interface ChannelWasm {
  memory: WebAssembly.Memory
  knobsPtr: () => number
  inPtr: () => number
  outPtr: () => number
  init: (
    c: number,
    seed: number,
    b0: number,
    b1: number,
    b2: number,
    a1: number,
    a2: number,
  ) => void
  process: (c: number, n: number) => void
  step: (c: number, x: number) => number
}

const wasmBytes = readFileSync(new URL('./channel.wasm', import.meta.url))
const instantiate = () =>
  new WebAssembly.Instance(new WebAssembly.Module(wasmBytes))
    .exports as unknown as ChannelWasm

function input() {
  const x = new Float64Array(N)
  let s = 12345
  for (let i = 0; i < N; i++) {
    s = (Math.imul(s, 1103515245) + 12345) | 0
    const t = i / SR
    x[i] =
      0.4 *
        Math.sin(2 * Math.PI * 110 * t) *
        (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.7 * t)) +
      0.2 * Math.sin(2 * Math.PI * 1337 * t) +
      0.05 * ((s >>> 8) / 16777216 - 0.5)
  }
  return x
}

// The knobs as Amp.voice leaves them, with a healthy tube on a full rail.
function ampFor(board: Partial<Controls>) {
  const amp = new Amp(SR)
  amp['voice'](packParams({ ...DEFAULT_CONTROLS, ...board }))
  const k = amp['k']
  k.weakGm = 1
  k.crackle = 0
  k.railPow = 1
  k.railPre = 1
  return { channel: amp['left'], k }
}

type Knobs = ReturnType<typeof ampFor>['k']

function knobsInto(e: ChannelWasm, k: Knobs) {
  const v = k.voicing
  const { leak } = k.wire
  const values = [
    v.first.knee,
    v.first.sink,
    v.first.cutoff,
    v.second.knee,
    v.second.sink,
    v.second.cutoff,
    v.cascade ? 1 : 0,
    v.makeup,
    v.swing,
    v.coreSat,
    ...k.drive,
    ...k.degen,
    ...k.bypass,
    ...k.wire.missCoefs,
    k.gPower,
    k.bias,
    k.biasNorm,
    k.presence,
    k.railPre,
    k.railPow,
    k.blockAtk,
    k.blockRel,
    k.couplingCoef,
    k.wire.presenceCoef,
    k.wire.coreCoef,
    k.micro,
    k.weakGm,
    k.crackle,
    ...k.stack,
    leak.b0,
    leak.b1,
    leak.b2,
    leak.a1,
    leak.a2,
    HB.centre,
    ...HB.side,
  ]
  new Float64Array(e.memory.buffer, e.knobsPtr(), values.length).set(values)
}

function wasmFor(board: Partial<Controls>) {
  const e = instantiate()
  const { channel, k } = ampFor(board)
  knobsInto(e, k)
  const t = channel['tuned']
  e.init(0, 0x5a1, t.b0, t.b1, t.b2, t.a1, t.a2)
  return e
}

function tsRun(board: Partial<Controls>, x: Float64Array, out: Float64Array) {
  const { channel, k } = ampFor(board)
  for (let i = 0; i < x.length; i++) out[i] = channel.process(x[i]!, k)
}

function blockRun(
  board: Partial<Controls>,
  x: Float64Array,
  out: Float64Array,
) {
  const e = wasmFor(board)
  const inV = new Float64Array(e.memory.buffer, e.inPtr(), BLOCK)
  const outV = new Float64Array(e.memory.buffer, e.outPtr(), BLOCK)
  for (let at = 0; at < x.length; at += BLOCK) {
    for (let i = 0; i < BLOCK; i++) inV[i] = x[at + i]!
    e.process(0, BLOCK)
    for (let i = 0; i < BLOCK; i++) out[at + i] = outV[i]!
  }
}

function stepRun(board: Partial<Controls>, x: Float64Array, out: Float64Array) {
  const e = wasmFor(board)
  for (let i = 0; i < x.length; i++) out[i] = e.step(0, x[i]!)
}

// Every byte the heap took on, collected or not, as alloc.test.ts counts it.
function garbage(fn: () => void) {
  const profiler = new GCProfiler()
  const startedAt = getHeapStatistics().used_heap_size
  profiler.start()
  fn()
  const endedAt = getHeapStatistics().used_heap_size
  const profiled = profiler.stop()
  let bytes = 0
  let from = startedAt
  for (const gc of profiled?.statistics ?? []) {
    bytes += gc.beforeGC.heapStatistics.usedHeapSize - from
    from = gc.afterGC.heapStatistics.usedHeapSize
  }
  return bytes + endedAt - from
}

const RUNS = { ts: tsRun, block: blockRun, step: stepRun }

const x = input()
for (const [name, board] of Object.entries(BOARDS)) {
  const outs = Object.fromEntries(
    Object.keys(RUNS).map(run => [run, new Float64Array(N)]),
  )
  const row: string[] = []
  for (const [run, fn] of Object.entries(RUNS)) {
    const out = outs[run]!
    for (let w = 0; w < 2; w++) fn(board, x.subarray(0, SR), out)
    let best = Infinity
    let bytes = 0
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now()
      bytes = garbage(() => fn(board, x, out))
      best = Math.min(best, performance.now() - t0)
    }
    let mismatched = 0
    for (let i = 0; i < N; i++)
      if (!Object.is(out[i], outs.ts![i])) mismatched++
    row.push(
      `${run} ${((best / 1000 / SECONDS) * 100).toFixed(2)}% of real time, ${(bytes / SECONDS / 1e6).toFixed(3)} MB/s, ${mismatched} off`,
    )
  }
  console.log(`${name}: ${row.join(' | ')}`)
}
