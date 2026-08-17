import type { Rng } from './rng'

// Control sources that never come round again.
//
// An LFO hands its whole future over after two cycles, which is what makes a
// modulated board sound like a formula however deep the wire is. Neither of
// these repeats, and neither runs away: the walk bounces off its own walls and
// the attractor is held in by its geometry.

// A bounded walk. Reflecting walls rather than a clamp, so it keeps visiting the
// ends of its travel instead of parking against them the way a leaky integrator
// parks in the middle.
export class Drunk {
  private y = 0

  step(rateHz: number, sr: number, rng: Rng): number {
    this.y += (rng() * 2 - 1) * Math.min((rateHz * 6) / sr, 0.4)
    if (this.y > 1) this.y = 2 - this.y
    if (this.y < -1) this.y = -2 - this.y
    return this.y
  }

  reset() {
    this.y = 0
  }
}

// Rössler, forward Euler. One folded band that never closes on itself: it looks
// periodic on a scope and drifts a little further round the fold every lap, so
// a filter swept from it comes back near where it was but never to it. The orbit
// takes about six time units, so the rate knob still means roughly what it says.
const A = 0.2
const B = 0.2
const C = 5.7
const BOUND = 24

export class Chaos {
  private x = 1
  private y = 1
  private z = 0

  step(rateHz: number, sr: number): number {
    const dt = Math.min((rateHz * 6) / sr, 0.02)
    const { x, y, z } = this
    this.x = x + dt * (-y - z)
    this.y = y + dt * (x + A * y)
    this.z = z + dt * (B + z * (x - C))
    if (
      !Number.isFinite(this.x) ||
      Math.abs(this.x) > BOUND ||
      Math.abs(this.y) > BOUND ||
      Math.abs(this.z) > BOUND
    ) {
      this.reset()
    }
    return Math.min(Math.max(this.x / 9, -1), 1)
  }

  reset() {
    this.x = 1
    this.y = 1
    this.z = 0
  }
}
