// What the first seconds cost, before anything has tiered up.
//
//   pnpm cold            the board as it boots, which is the one that loads
//   pnpm cold heavy 4    everything on, four keys held
//
// bench.ts renders 400 blocks before it starts timing and blocks.ts renders
// 2000, both for the good reason that a steady-state number should be steady.
// The effect is that neither can see the one part of this instrument's
// performance a listener is guaranteed to meet: its first few seconds. V8
// arrives interpreting, tiers up under load, and deoptimises a few dozen times
// on the way — all of it on the thread with a 2.7 ms deadline it cannot miss.
//
// Nothing here is a steady-state problem. Every block over budget in this
// report is a dropout on page load, and they are gone by the time the other two
// scripts start looking.
import { DEFAULT_CONTROLS } from '../src/controls'
import { packParams } from '../src/engine/params'
import { buildBender } from '../src/dsp/build'
import { BLOCK, type StereoBlock } from '../src/dsp/stage'
import { BOARDS } from './boards'

const SR = 48000
const which = process.argv[2] ?? 'stock'
const poly = Number(process.argv[3] ?? 0)
const board = BOARDS[which]
if (!board) throw new Error(`no board '${which}' — try ${Object.keys(BOARDS)}`)

const built = buildBender(SR, 7)
built.transport.tune = true
built.transport.drums = true
const p = packParams({ ...DEFAULT_CONTROLS, ...board })
const io: StereoBlock = {
  l: new Float32Array(BLOCK),
  r: new Float32Array(BLOCK),
  n: BLOCK,
}

// No warm-up, deliberately: the first block timed here is the first block the
// audio thread would ever render.
const N = 6000
const t = new Float64Array(N)
for (let b = 0; b < N; b++) {
  if (poly && b % 40 === 0) {
    for (let v = 0; v < poly; v++)
      built.toyChip.noteOn(36 + ((b / 40 + v * 5) % 36), 1)
  }
  if (poly && b % 40 === 20) {
    for (let v = 0; v < poly; v++)
      built.toyChip.noteOff(36 + ((b / 40 + v * 5) % 36))
  }
  const t0 = process.hrtime.bigint()
  built.chain.process(io, p)
  t[b] = Number(process.hrtime.bigint() - t0) / 1e6
}

const budget = (BLOCK * 1000) / SR
const settled = Array.from(t.slice(N / 2)).sort((a, b) => a - b)
const steady = settled[Math.floor(settled.length / 2)]!
const at = (b: number) => ((b * BLOCK) / SR).toFixed(2)

console.log(
  `board: ${which}   keys held: ${poly}   budget: ${budget.toFixed(3)}ms   settled p50: ${steady.toFixed(4)}ms`,
)
console.log('\nhow long it takes to arrive:')
const spans = [0, 10, 50, 200, 500, 1000, 2000, 4000, N]
for (let s = 0; s + 1 < spans.length; s++) {
  const a = spans[s]!
  const b = spans[s + 1]!
  const win = Array.from(t.slice(a, b))
  const mean = win.reduce((x, y) => x + y, 0) / win.length
  const late = win.filter(x => x > budget).length
  console.log(
    `  ${at(a).padStart(5)}s-${at(b).padStart(5)}s  mean ${mean.toFixed(4)}ms  ${(mean / steady).toFixed(1).padStart(4)}x settled  max ${Math.max(...win).toFixed(2)}ms  over budget: ${late}`,
  )
}

let over = 0
let overMs = 0
for (const x of t) {
  if (x > budget) {
    over++
    overMs += x - budget
  }
}
// The number to watch. Each of these is a buffer the audio thread failed to
// fill in time, which is a click — and they all land in the first few seconds,
// while someone is deciding whether the thing works.
console.log(
  `\nblocks over budget in the first ${at(N)}s: ${over}   total overrun ${overMs.toFixed(1)}ms`,
)
