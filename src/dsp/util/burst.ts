import { flushDenormal } from './softclip'
import type { Rng } from './rng'

// Self-exciting fault timing.
//
// A flat probability rolled every sample is a stationary process, and the ear
// averages a stationary process out inside a second — after that it stops being
// an event and becomes the sound of the knob position. Real intermittent faults
// don't arrive that way. A joint that arcs is hotter and dirtier for having
// arced, so the next fault is likelier while the last one is still cooling off:
// a minute of nothing, then a dozen in a second, then nothing again.
//
// Each hit excites the process that fires the next one. Cluster at zero leaves
// the flat process that was here before, and winding it up redistributes the
// same faults into bursts rather than simply making more of them — the resting
// rate comes down as the excitement gain goes up.
export class Burst {
  private excite = 0
  private readonly cool: number

  constructor(
    sr: number,
    coolS = 1.6,
    private readonly gain = 12,
    private readonly ceiling = 4,
  ) {
    this.cool = Math.exp(-Math.LN2 / (coolS * sr))
  }

  /** One sample of cooling off, whether or not this was a moment to roll. */
  step() {
    this.excite = flushDenormal(this.excite * this.cool)
  }

  /** How much likelier a fault is than its resting rate, right now. */
  get heat() {
    return 1 + this.gain * this.excite
  }

  roll(prob: number, cluster: number, rng: Rng): boolean {
    if (prob <= 0) return false
    const p =
      cluster > 0
        ? prob * (1 - 0.7 * cluster) * (1 + cluster * (this.heat - 1))
        : prob
    if (rng() >= Math.min(p, 1)) return false
    this.excite = Math.min(this.excite + 1, this.ceiling)
    return true
  }

  reset() {
    this.excite = 0
  }
}
