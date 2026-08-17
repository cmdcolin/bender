// Does the board get slower the longer it runs?
//
// Every envelope on it decays geometrically and most of them never reach zero,
// so anything left ringing quietly walks down into denormal range and stays
// there. Denormal arithmetic is twenty times slower here, which is a stage that
// costs nothing for the first minute and a fifth of the budget after ten.
//
//   pnpm soak 600
import { DEFAULT_CONTROLS, type Controls } from '../src/controls'
import { packParams } from '../src/engine/params'
import { buildBender } from '../src/dsp/build'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from '../src/dsp/stage'

const SR = 48000
const WINDOW_S = 20

// One note struck, then left alone: the case every decaying envelope walks into.
const BOARD: Partial<Controls> = {
  chipLevel: 0.6,
  drumLevel: 0.6,
  revMix: 0.4,
  dlyMix: 0.3,
  filtMix: 0.4,
  combMix: 0.3,
}

const seconds = Number(process.argv[2] ?? 300)
const built = buildBender(SR, 7)
const p = packParams({ ...DEFAULT_CONTROLS, ...BOARD })
const io: StereoBlock = {
  l: new Float32Array(BLOCK),
  r: new Float32Array(BLOCK),
  n: BLOCK,
}

const watch = ['toyChip', 'toyDrum', 'springVerb', 'tapeDelay', 'screech']
const ms = new Map<string, number>()
const all = [
  ...built.chain.sources,
  ...built.chain.bendById.filter((s): s is Stage => !!s),
  ...built.chain.pedals,
  ...built.chain.post,
]
for (const s of all) {
  if (!watch.includes(s.label)) continue
  const inner = s.process.bind(s)
  ms.set(s.label, 0)
  s.process = (b: StereoBlock, q: Float32Array, ctx: Ctx) => {
    const t = performance.now()
    inner(b, q, ctx)
    ms.set(s.label, ms.get(s.label)! + (performance.now() - t))
  }
}

// Play the tune and the kit for two seconds, then stop both and let everything
// on the board ring itself down.
built.transport.tune = true
built.transport.drums = true
for (let b = 0; b < (2 * SR) / BLOCK; b++) built.chain.process(io, p)
built.transport.tune = false
built.transport.drums = false

const perWindow = Math.round((WINDOW_S * SR) / BLOCK)
const windows = Math.ceil(seconds / WINDOW_S)
console.log(
  `silence after one bar, ${WINDOW_S}s windows, ms of cpu per window\n`,
)
console.log(['at'.padStart(6), ...watch.map(w => w.padStart(11))].join(''))
for (let w = 0; w < windows; w++) {
  for (const k of ms.keys()) ms.set(k, 0)
  const t0 = performance.now()
  for (let b = 0; b < perWindow; b++) built.chain.process(io, p)
  const total = performance.now() - t0
  console.log(
    [
      `${(w + 1) * WINDOW_S}s`.padStart(6),
      ...watch.map(k => ms.get(k)!.toFixed(1).padStart(11)),
      `${total.toFixed(0)}ms total`.padStart(16),
    ].join(''),
  )
}
