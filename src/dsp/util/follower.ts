import { flushDenormal } from './softclip'

export const coef = (sec: number, sr: number) => 1 - Math.exp(-1 / (sec * sr))

export class Follower {
  private y = 0
  process(x: number, attack: number, release: number): number {
    const a = Math.abs(x)
    this.y = flushDenormal(
      this.y + (a > this.y ? attack : release) * (a - this.y),
    )
    return this.y
  }
  reset() {
    this.y = 0
  }
}

// A trigger line read as a control voltage: a hit snaps it up to whatever weight
// arrived, and from there it falls. An envelope follower would barely notice a
// spike one sample wide.
export class Decay {
  private y = 0
  process(x: number, fall: number): number {
    this.y = flushDenormal(x > this.y ? x : this.y * fall)
    return this.y
  }
  reset() {
    this.y = 0
  }
}

// Fires once per attack, with a lockout so one shout stays one hit.
export class Transient {
  private fast = new Follower()
  private slow = new Follower()
  private wait = 0

  constructor(private readonly sr: number) {}

  process(x: number, thresh: number): boolean {
    const f = this.fast.process(x, coef(0.002, this.sr), coef(0.02, this.sr))
    const s = this.slow.process(x, coef(0.15, this.sr), coef(0.4, this.sr))
    if (this.wait > 0) {
      this.wait--
      return false
    }
    if (f > thresh && f > s * 1.6) {
      this.wait = Math.floor(0.06 * this.sr)
      return true
    }
    return false
  }

  reset() {
    this.fast.reset()
    this.slow.reset()
    this.wait = 0
  }
}
