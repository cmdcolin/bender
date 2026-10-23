import { Crossings } from './crossings.ts'
import { lpCoef, OnePoleLP } from './onepole.ts'

const LOW_HZ = 40
const HIGH_HZ = 1500
const PRE_HZ = 800
const AGREE = 0.08
const SMOOTH = 0.5

// A zero-crossing pitch follower: the time between upward crossings of a
// low-passed signal. The pitch moves only when two periods in a row agree, so
// one stray crossing from a harmonic does not drag it, and it holds the last
// pitch it settled on when the signal stops.
export class PitchFollow {
  private readonly lp = [new OnePoleLP(), new OnePoleLP()]
  private readonly edges = new Crossings()
  private readonly coef: number
  private readonly sr: number
  private since = 0
  private last = 0
  private hz = 0

  constructor(sr: number) {
    this.sr = sr
    this.coef = lpCoef(PRE_HZ, sr)
  }

  /** The pitch in hertz, zero until two periods have agreed. */
  process(x: number): number {
    const y = this.lp[1]!.process(this.lp[0]!.process(x, this.coef), this.coef)
    this.since++
    if (!this.edges.rise(y)) return this.hz
    const hz = this.sr / this.since
    this.since = 0
    if (hz < LOW_HZ || hz > HIGH_HZ) {
      this.last = 0
      return this.hz
    }
    if (this.last > 0 && Math.abs(hz / this.last - 1) < AGREE) {
      this.hz =
        this.hz > 0 && Math.abs(hz / this.hz - 1) < 0.3
          ? this.hz + SMOOTH * (hz - this.hz)
          : hz
    }
    this.last = hz
    return this.hz
  }

  reset() {
    for (const stage of this.lp) stage.reset()
    this.edges.reset()
    this.since = 0
    this.last = 0
    this.hz = 0
  }
}
