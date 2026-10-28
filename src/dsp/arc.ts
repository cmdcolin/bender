import { STEPS } from '../drums.ts'
import { IDX, N_PARAMS } from '../engine/params.ts'

export const ARC_SHAPES = [
  'hold',
  'rise, snap back',
  'snap, fall back',
  'swell',
  'spikes',
  'weather',
] as const
export const ARC_BARS = [4, 8, 16, 32, 64, 128] as const
export const ARC_MOVES = ['glide', 'jump'] as const

export const BLEND_LINEAR = 0
export const BLEND_LOG = 1
export const BLEND_STEP = 2

const SHAPE = {
  hold: 0,
  rise: 1,
  fall: 2,
  swell: 3,
  spikes: 4,
  weather: 5,
} as const

const SPIKE_ODDS = 0.3
const WEATHER_BARS = 4

/** A number in [0, 1) that depends only on `n` and `seed`. */
export function hash01(n: number, seed: number) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** How far into the wild board the arc stands, 0 to 1, `bars` bars in. */
export function arcShape(
  shape: number,
  bars: number,
  cycle: number,
  seed: number,
): number {
  const phase = (((bars % cycle) + cycle) % cycle) / cycle
  const bar = Math.floor(bars)
  switch (shape) {
    case SHAPE.rise:
      return phase
    case SHAPE.fall:
      return 1 - phase
    case SHAPE.swell:
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase)
    case SHAPE.spikes:
      return hash01(bar, seed) < SPIKE_ODDS ? Math.sqrt(1 - (bars - bar)) : 0
    case SHAPE.weather: {
      const at = bars / WEATHER_BARS
      const knot = Math.floor(at)
      const a = hash01(knot, seed ^ 0x77)
      const b = hash01(knot + 1, seed ^ 0x77)
      return (a + (b - a) * smooth(at - knot)) ** 1.5
    }
    default:
      return 1
  }
}

/** The wild board, as the main thread rolled it: the params it moves, the
    value each moves to, where along the arc each starts moving, and how. */
export interface WildPack {
  idx: Int16Array
  to: Float32Array
  start: Float32Array
  blend: Uint8Array
}

/** Bends the board's params toward the wild board by the arc, once a block. */
export class Arc {
  readonly out = new Float32Array(N_PARAMS)
  pos = 0
  private wild: WildPack | null = null
  private bars = 0
  private lastTick = -1

  setWild(wild: WildPack | null) {
    this.wild = wild
  }

  /** The params to play this block: `board` itself while the arc rests.
      `kitStepHz` is the kit's step rate, 0 while it stands still. */
  step(
    board: Float32Array,
    n: number,
    sr: number,
    kitTick: number,
    kitStepHz: number,
  ): Float32Array {
    const depth = Math.min(Math.max(board[IDX.arcDepth]!, 0), 1)
    const kitRunning = kitStepHz > 0
    const bpm = Math.max(board[IDX.drumBpm]!, 1)
    this.bars += kitRunning
      ? (n / sr) * (kitStepHz / STEPS)
      : (n / sr) * (bpm / (4 * 60))
    if (kitRunning && kitTick !== this.lastTick && kitTick % STEPS === 0)
      this.bars = Math.round(this.bars)
    this.lastTick = kitTick
    const wild = this.wild
    if (!wild || depth <= 0) {
      this.pos = 0
      return board
    }
    const cycle = ARC_BARS[Math.round(board[IDX.arcBars]!)] ?? 16
    const shape = Math.round(board[IDX.arcShape]!)
    const seed = Math.round(board[IDX.arcSeed]!)
    const jump = Math.round(board[IDX.arcMoves]!) === 1
    let at = arcShape(
      shape,
      jump ? Math.floor(this.bars) : this.bars,
      cycle,
      seed,
    )
    if (jump) at = Math.round(at * 2) / 2
    const pos = depth * at
    this.pos = pos
    const out = this.out
    out.set(board)
    for (let k = 0; k < wild.idx.length; k++) {
      const i = wild.idx[k]!
      const start = wild.start[k]!
      const local = Math.min(Math.max((pos - start) / (1 - start), 0), 1)
      if (local <= 0) continue
      const from = board[i]!
      const to = wild.to[k]!
      const blend = wild.blend[k]!
      if (blend === BLEND_STEP) out[i] = local >= 0.5 ? to : from
      else if (blend === BLEND_LOG && from > 0 && to > 0)
        out[i] = from * (to / from) ** local
      else out[i] = from + (to - from) * local
    }
    return out
  }
}
