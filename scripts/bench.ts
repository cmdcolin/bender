// What the board costs per block, offline. The worklet gets 2.7 ms to render
// 2.7 ms of audio; anything the whole chain spends past a few percent of that
// on one machine is what runs out of budget on a slower one.
//
//   pnpm bench            the everything-on board, 20 s
//   pnpm bench stock 10   the board as it boots
import { DEFAULT_CONTROLS, type Controls } from '../src/controls'
import { packParams } from '../src/engine/params'
import { buildBender } from '../src/dsp/build'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from '../src/dsp/stage'

const SR = 48000

// Every bend in a slot, every pedal wet, tape on, the supply dying, four wires
// in the bay and the faults rolling.
const HEAVY: Partial<Controls> = {
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
  for (const r of rows) r.ms = 0
  const t0 = performance.now()
  for (let b = 0; b < blocks; b++) chain.process(io, p)
  const total = performance.now() - t0
  rows.sort((a, b) => b.ms - a.ms)
  return { total, blocks, rows }
}

const which = process.argv[2] ?? 'heavy'
const seconds = Number(process.argv[3] ?? 20)
const board = BOARDS[which]
if (!board) throw new Error(`no board '${which}' — try ${Object.keys(BOARDS)}`)

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
