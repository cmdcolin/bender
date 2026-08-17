import { IDX } from '../engine/params'
import { BLOCK } from './stage'
import { Follower, coef } from './util/follower'
import { mulberry32, type Rng } from './util/rng'

// Where a patch wire can land. Ids match the mod*Dest choices.
export const DEST = {
  filtHz: 0,
  ringHz: 1,
  combHz: 2,
  crushHz: 3,
  chipClock: 4,
  retrig: 5,
  tapeSpeed: 6,
  glitch: 7,
  fbAmt: 8,
} as const
export const N_DEST = 9

// Ids match the mod*Src choices.
const SRC = { off: 0, lfo: 1, supply: 2, env: 3, mic: 4, bodyX: 5, bodyY: 6, fb: 7 }

const WIRES = [
  [IDX.mod0Src, IDX.mod0Dest, IDX.mod0Depth],
  [IDX.mod1Src, IDX.mod1Dest, IDX.mod1Depth],
] as const

function lfoShape(phase: number, shape: number, sh: number): number {
  switch (shape) {
    case 1:
      return 2 * phase - 1
    case 2:
      return phase < 0.5 ? 1 : -1
    case 3:
      return sh
    default:
      return Math.sin(phase * 2 * Math.PI)
  }
}

export interface ModSources {
  mic: Float32Array
  droop: Float32Array
  env: Float32Array
  fb: Float32Array
}

// The patch bay: two wires, each soldered from a source onto a destination
// parameter. Stages ask for their lane and get null when nothing is wired
// there, so an unpatched board runs exactly as it did before.
export class ModBus {
  private readonly lanes: Float32Array[] = []
  private readonly live = new Uint8Array(N_DEST)
  private readonly lfo = new Float32Array(BLOCK)
  private readonly micEnv = new Float32Array(BLOCK)
  private readonly held = new Float32Array(BLOCK)
  private lfoPhase = 0
  private shValue = 0
  private mic = new Follower()
  private rng: Rng = mulberry32(808)

  constructor(private readonly sr: number) {
    for (let i = 0; i < N_DEST; i++) this.lanes.push(new Float32Array(BLOCK))
  }

  read(dest: number): Float32Array | null {
    return this.live[dest] ? this.lanes[dest]! : null
  }

  // Sources are sampled where they are cheapest to reach: supply droop, output
  // envelope and the feedback bus are a block old, the LFO, mic and body pad
  // are current. A block is 2.7 ms — under the resolution of every wire here.
  build(n: number, p: Float32Array, src: ModSources) {
    this.live.fill(0)
    const hz = p[IDX.modLfoHz]!
    const shape = Math.round(p[IDX.modLfoShape]!)
    const attack = coef(0.005, this.sr)
    const release = coef(0.12, this.sr)
    for (let i = 0; i < n; i++) {
      const prev = this.lfoPhase
      this.lfoPhase = (this.lfoPhase + hz / this.sr) % 1
      if (this.lfoPhase < prev) this.shValue = this.rng() * 2 - 1
      this.lfo[i] = lfoShape(this.lfoPhase, shape, this.shValue)
      this.micEnv[i] = Math.min(this.mic.process(src.mic[i]!, attack, release) * 2, 1)
    }

    for (const [srcIdx, destIdx, depthIdx] of WIRES) {
      const from = Math.round(p[srcIdx]!)
      const depth = p[depthIdx]!
      const dest = Math.round(p[destIdx]!)
      if (from === SRC.off || depth === 0 || dest < 0 || dest >= N_DEST) continue
      const lane = this.lanes[dest]!
      if (!this.live[dest]) {
        lane.fill(0, 0, n)
        this.live[dest] = 1
      }
      const wire = this.pick(from, n, p, src)
      for (let i = 0; i < n; i++) lane[i]! += depth * wire[i]!
    }
  }

  private pick(from: number, n: number, p: Float32Array, src: ModSources): Float32Array {
    switch (from) {
      case SRC.supply:
        return src.droop
      case SRC.env:
        return src.env
      case SRC.mic:
        return this.micEnv
      case SRC.fb:
        return src.fb
      case SRC.bodyX:
      case SRC.bodyY:
        this.held.fill(p[from === SRC.bodyX ? IDX.bodyX : IDX.bodyY]!, 0, n)
        return this.held
      default:
        return this.lfo
    }
  }

  panic() {
    this.live.fill(0)
    this.lfoPhase = 0
    this.shValue = 0
    this.mic.reset()
  }
}
