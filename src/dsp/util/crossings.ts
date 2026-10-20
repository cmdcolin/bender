import { flushDenormal } from './softclip.ts'

const HYSTERESIS = 0.02

// A Schmitt trigger: true on each upward crossing of zero. The dead band keeps
// a quiet mic's hiss from firing it.
export class Crossings {
  private high = false

  rise(x: number): boolean {
    if (this.high) {
      if (x < -HYSTERESIS) this.high = false
      return false
    }
    if (x > HYSTERESIS) {
      this.high = true
      return true
    }
    return false
  }

  reset() {
    this.high = false
  }
}

// How many upward crossings a second, averaged over about 50 ms. With nothing
// crossing the rate falls to zero.
export class CrossingRate {
  private edges = new Crossings()
  private hz = 0
  private readonly k: number
  private readonly sr: number

  constructor(sr: number) {
    this.sr = sr
    this.k = 1 - Math.exp(-1 / (0.05 * sr))
  }

  process(x: number): number {
    const kick = this.edges.rise(x) ? this.sr : 0
    this.hz = flushDenormal(this.hz + this.k * (kick - this.hz))
    return this.hz
  }

  reset() {
    this.edges.reset()
    this.hz = 0
  }
}
