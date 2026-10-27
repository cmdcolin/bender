import { coef, Follower } from './follower.ts'

const GAIN = 4

export class GroundBounce {
  private fast = new Follower()
  private slow = new Follower()
  private readonly fastA: number
  private readonly fastR: number
  private readonly slowA: number
  private readonly slowR: number

  constructor(sr: number) {
    this.fastA = coef(0.0003, sr)
    this.fastR = coef(0.005, sr)
    this.slowA = coef(0.02, sr)
    this.slowR = coef(0.1, sr)
  }

  process(
    out: Float32Array,
    base: number,
    lane: Float32Array | null,
    gnd: Float32Array,
    n: number,
  ) {
    for (let i = 0; i < n; i++) {
      const x = out[i]!
      const f = this.fast.process(x, this.fastA, this.fastR)
      const s = this.slow.process(x, this.slowA, this.slowR)
      const amt = lane ? Math.min(Math.max(base + lane[i]!, 0), 1) : base
      gnd[i] = f > s ? amt * GAIN * (f - s) : 0
    }
  }

  reset() {
    this.fast.reset()
    this.slow.reset()
  }
}

export class GroundEdge {
  private high = false
  private readonly at: number

  constructor(at: number) {
    this.at = at
  }

  rise(v: number): boolean {
    if (this.high) {
      if (v < this.at * 0.5) this.high = false
      return false
    }
    if (v > this.at) {
      this.high = true
      return true
    }
    return false
  }

  reset() {
    this.high = false
  }
}
