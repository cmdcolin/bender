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
// Clustering has to redistribute faults rather than manufacture them, or the
// knob is a rate control wearing a disguise. So the excitement is written as a
// branching ratio: each fault spawns, on average, `n` further faults, and the
// resting rate is scaled by `1 - n` to pay for them. The mean comes out at
// exactly the rate asked for whatever n is, while the variance climbs with it —
// and because n stays under 1 the chain always dies out instead of running away,
// at any base rate, which is what lets one class serve a per-sample dropout and
// a per-slice glitch alike.
const MAX_BRANCH = 0.9

// A unit jump in excitement is worth this many samples of raised probability, so
// the cap bounds how far ahead the process can borrow.
const MAX_EXCITE = 40

export class Burst {
  private excite = 0
  private readonly cool: number
  private readonly kick: number

  constructor(sr: number, coolS = 1.6) {
    this.cool = Math.exp(-Math.LN2 / (coolS * sr))
    // What a unit of excitement has to add per sample for the whole decay to be
    // worth exactly one extra fault.
    this.kick = 1 - this.cool
  }

  /** One sample of cooling off, whether or not this was a moment to roll. */
  step() {
    this.excite = flushDenormal(this.excite * this.cool)
  }

  roll(prob: number, cluster: number, rng: Rng): boolean {
    if (prob <= 0) return false
    const n = Math.min(Math.max(cluster, 0), 1) * MAX_BRANCH
    const p = n > 0 ? prob * (1 - n) + n * this.kick * this.excite : prob
    if (rng() >= Math.min(p, 1)) return false
    this.excite = Math.min(this.excite + 1, MAX_EXCITE)
    return true
  }

  reset() {
    this.excite = 0
  }
}
