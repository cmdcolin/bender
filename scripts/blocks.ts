// What the board costs per *block*, and how unevenly. bench.ts reports the mean
// over a long render; the mean is not what glitches. The worklet gets 2.7 ms to
// render 2.7 ms of audio and it gets that budget 375 times a second — one block
// over it is a hole in the sound, and a board averaging a tenth of the budget
// can still be clicking if its worst blocks are ten times its median.
//
//   pnpm blocks             the everything-on board, 20 s
//   pnpm blocks 20 4        the same, with four keys held down and retriggered
import { DEFAULT_CONTROLS } from '../src/controls'
import { packParams } from '../src/engine/params'
import { buildBender } from '../src/dsp/build'
import { BLOCK, type StereoBlock } from '../src/dsp/stage'
import { HEAVY } from './boards'

const SR = 48000
const seconds = Number(process.argv[2] ?? 20)
const poly = Number(process.argv[3] ?? 0)

const built = buildBender(SR, 7)
built.transport.tune = true
built.transport.drums = true
const p = packParams({ ...DEFAULT_CONTROLS, ...HEAVY })
const io: StereoBlock = {
  l: new Float32Array(BLOCK),
  r: new Float32Array(BLOCK),
  n: BLOCK,
}

for (let b = 0; b < 2000; b++) built.chain.process(io, p)

const blocks = Math.ceil((seconds * SR) / BLOCK)
const times = new Float64Array(blocks)
const budget = (BLOCK * 1000) / SR

for (let b = 0; b < blocks; b++) {
  // A chord struck and released every 40 blocks, so the render covers voices
  // being stolen and envelopes overlapping rather than one steady note.
  if (poly && b % 40 === 0) {
    for (let v = 0; v < poly; v++)
      built.toyChip.noteOn(36 + ((b / 40 + v * 5) % 36), 1)
  }
  if (poly && b % 40 === 20) {
    for (let v = 0; v < poly; v++)
      built.toyChip.noteOff(36 + ((b / 40 + v * 5) % 36))
  }
  const t = process.hrtime.bigint()
  built.chain.process(io, p)
  times[b] = Number(process.hrtime.bigint() - t) / 1e6
}

const sorted = Float64Array.from(times).sort()
const at = (f: number) => sorted[Math.min(Math.floor(f * blocks), blocks - 1)]!
const pct = (ms: number) => `${((ms / budget) * 100).toFixed(1)}%`
let sum = 0
for (const t of times) sum += t
let over = 0
for (const t of times) if (t > budget) over++

console.log(
  `blocks: ${blocks}   budget: ${budget.toFixed(3)}ms   keys held: ${poly}`,
)
console.log(`mean ${(sum / blocks).toFixed(4)}ms  ${pct(sum / blocks)}`)
for (const f of [0.5, 0.9, 0.99, 0.999]) {
  console.log(
    `  p${(f * 100).toFixed(1).padStart(5)}  ${at(f).toFixed(4)}ms  ${pct(at(f))}`,
  )
}
console.log(
  `  max     ${sorted[blocks - 1]!.toFixed(4)}ms  ${pct(sorted[blocks - 1]!)}`,
)
console.log(`blocks over budget: ${over}`)
// The number to watch on a slower machine: how far the worst blocks sit above
// the middle ones. A flat board can be scaled down onto weaker hardware; a
// spiky one runs out of budget at the spikes first.
console.log(`spread p99.9/p50: ${(at(0.999) / at(0.5)).toFixed(2)}x`)
