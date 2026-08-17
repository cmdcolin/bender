// What the board costs per block, offline. The worklet gets 2.7 ms to render
// 2.7 ms of audio; anything the whole chain spends past a few percent of that
// on one machine is what runs out of budget on a slower one.
//
//   pnpm bench            the everything-on board, 20 s
//   pnpm bench stock 10   the board as it boots
import { PerformanceObserver } from 'node:perf_hooks'
import { DEFAULT_CONTROLS, type Controls } from '../src/controls'
import { packParams } from '../src/engine/params'
import { buildBender } from '../src/dsp/build'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from '../src/dsp/stage'

const SR = 48000

// Every pedal wet, tape on, the supply dying, four wires in the bay and the
// faults rolling — and the bend slots named outright.
//
// Naming them matters: the rack has six slots for seven bends, so one always
// sits out, and a mix turned up on the one that is out costs nothing at all.
// Left to the stock slots this board set shiftMix and shiftFb on a shifter that
// was in no slot, which quietly kept the dearest bend on the board out of every
// number this script has ever printed. Glitch buffer sits out instead, as the
// cheapest of the seven — swap it in for whichever you want to read.
const HEAVY: Partial<Controls> = {
  bendSlot0: 1,
  bendSlot1: 2,
  bendSlot2: 3,
  bendSlot3: 4,
  bendSlot4: 6,
  bendSlot5: 7,
  chipLevel: 0.6,
  chipAccomp: 1,
  chipStarve: 0.3,
  chipBattery: 0.4,
  chipBendSpot: 1,
  chipBendPot: 0.3,
  chipDrift: 0.5,
  chipLatch: 0.2,
  drumLevel: 0.6,
  drumRetrigHz: 20,
  drumCross: 2,
  drumCrossAmt: 0.4,
  oscLevel: 0.3,
  oscXmod: 0.4,
  noiseLevel: 0.2,
  crackleAmp: 0.3,
  ringMix: 0.5,
  crushMix: 0.5,
  srHz: 12000,
  srJitter: 0.3,
  bits: 8,
  distMix: 0.5,
  subLevel: 0.4,
  filtMix: 0.5,
  filtRes: 1.2,
  combMix: 0.5,
  glitchMix: 0.5,
  shiftMix: 0.5,
  shiftFb: 0.4,
  stompMix: 0.6,
  stompLevel: -6,
  stompSag: 0.5,
  dlyMix: 0.5,
  wowDepthMs: 3,
  flutter: 0.4,
  revMix: 0.4,
  tapeMix: 0.7,
  tapeDrop: 0.3,
  tapePrint: 0.5,
  tapeAzimuth: 0.3,
  brownAmt: 0.4,
  brownCrackle: 0.3,
  humLevel: 0.3,
  fbAmt: 0.5,
  heatAmt: 0.5,
  faultCluster: 0.4,
  jointChatter: 0.3,
  relayRate: 0.2,
  couple: 0.5,
  modLfoHz: 3,
  mod0Src: 1,
  mod0Dest: 0,
  mod1Src: 3,
  mod1Dest: 8,
  mod2Src: 2,
  mod2Dest: 2,
  mod3Src: 9,
  mod3Dest: 6,
}

const BOARDS: Record<string, Partial<Controls>> = { heavy: HEAVY, stock: {} }

const REPS = 5

interface Row {
  label: string
  ms: number
}

function instrument(stages: Stage[], rows: Row[]) {
  for (const s of stages) {
    const inner = s.process.bind(s)
    const row: Row = { label: s.label, ms: 0 }
    rows.push(row)
    s.process = (io: StereoBlock, p: Float32Array, ctx: Ctx) => {
      const t = performance.now()
      inner(io, p, ctx)
      row.ms += performance.now() - t
    }
  }
}

function bench(overrides: Partial<Controls>, seconds: number) {
  const built = buildBender(SR, 7)
  built.transport.tune = true
  built.transport.drums = true
  const chain = built.chain
  const rows: Row[] = []
  instrument(
    [
      ...chain.sources,
      ...chain.bendById.filter((s): s is Stage => !!s),
      ...chain.pedals,
      ...chain.post,
    ],
    rows,
  )
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  for (let b = 0; b < 400; b++) chain.process(io, p)
  // Best of a few passes, not the mean. Anything else sharing the machine only
  // ever adds time, so the fastest pass is the one least polluted by it — and a
  // mean makes two runs an hour apart incomparable.
  let total = Infinity
  let best: Row[] = rows
  for (let pass = 0; pass < REPS; pass++) {
    for (const r of rows) r.ms = 0
    const t0 = performance.now()
    for (let b = 0; b < blocks; b++) chain.process(io, p)
    const took = performance.now() - t0
    if (took >= total) continue
    total = took
    best = rows.map(r => ({ ...r }))
  }
  best.sort((a, b) => b.ms - a.ms)
  return { total, blocks, rows: best }
}

const which = process.argv[2] ?? 'heavy'
const seconds = Number(process.argv[3] ?? 20)
const board = BOARDS[which]
if (!board) throw new Error(`no board '${which}' — try ${Object.keys(BOARDS)}`)

// A collection on the audio thread is a gap in the sound, so what the render
// loop hands the collector matters as much as what it spends. The number to
// aim at is none at all.
let collections = 0
let collectedMs = 0
new PerformanceObserver(list => {
  for (const e of list.getEntries()) {
    collections++
    collectedMs += e.duration
  }
}).observe({ entryTypes: ['gc'] })

const { total, blocks, rows } = bench(board, seconds)
const audioMs = (blocks * BLOCK * 1000) / SR
const pct = (ms: number) => `${((ms / audioMs) * 100).toFixed(2)}%`

console.log(`board: ${which}   audio: ${(audioMs / 1000).toFixed(1)}s`)
console.log(
  `wall: ${total.toFixed(0)}ms   realtime: ${(audioMs / total).toFixed(1)}x   one core: ${pct(total)}`,
)
console.log('\nper stage (share of one core):')
let stageMs = 0
for (const r of rows) {
  stageMs += r.ms
  if (r.ms / total > 0.005) {
    console.log(
      `  ${r.label.padEnd(12)} ${r.ms.toFixed(0).padStart(6)}ms  ${pct(r.ms)}`,
    )
  }
}
console.log(
  `  ${'chain'.padEnd(12)} ${(total - stageMs).toFixed(0).padStart(6)}ms  ${pct(total - stageMs)}`,
)
console.log(
  `\ncollections while rendering: ${collections}${collections ? ` (${collectedMs.toFixed(0)}ms)` : ''}`,
)
