import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine } from '../util/delayline'
import { OnePoleLP, lpCoef } from '../util/onepole'

const AP_MS = [4.7, 8.3, 11.9]
const COMB_MS = [31, 37, 41, 43]

class Allpass {
  private line: DelayLine
  constructor(
    sr: number,
    private readonly delay: number,
  ) {
    this.line = new DelayLine(delay + 4)
  }
  process(x: number, g: number): number {
    const d = this.line.read(this.delay)
    const w = x + g * d
    this.line.write(w)
    return d - g * w
  }
  reset() {
    this.line.reset()
  }
}

class DampedComb {
  private line: DelayLine
  private damp = new OnePoleLP()
  constructor(
    sr: number,
    readonly delaySec: number,
  ) {
    this.line = new DelayLine(delaySec * sr + 4)
  }
  process(
    x: number,
    fb: number,
    dampCoef: number,
    delaySamples: number,
  ): number {
    const d = this.line.read(delaySamples)
    this.line.write(x + fb * this.damp.process(d, dampCoef))
    return d
  }
  reset() {
    this.line.reset()
    this.damp.reset()
  }
}

// Cheap and deliberately springy: dispersive allpass cascade into a cluster of
// short parallel combs — metallic, boingy, lo-fi.
export class SpringVerb implements Stage {
  label = 'springVerb'
  private apL: Allpass[]
  private apR: Allpass[]
  private combsL: DampedComb[]
  private combsR: DampedComb[]

  constructor(private readonly sr: number) {
    this.apL = AP_MS.map(ms => new Allpass(sr, (ms / 1000) * sr))
    this.apR = AP_MS.map(ms => new Allpass(sr, (ms / 1000) * sr * 1.05))
    this.combsL = COMB_MS.map(ms => new DampedComb(sr, ms / 1000))
    this.combsR = COMB_MS.map(ms => new DampedComb(sr, (ms + 1.7) / 1000))
  }

  when(p: Float32Array) {
    return p[IDX.revMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, _ctx: Ctx) {
    const decay = p[IDX.revDecayS]!
    const mix = p[IDX.revMix]!
    const boing = 0.35 + 0.5 * p[IDX.revBoing]!
    const dampCoef = lpCoef(p[IDX.revToneHz]!, this.sr)

    for (let i = 0; i < io.n; i++) {
      let xl = io.l[i]!
      let xr = io.r[i]!
      for (const ap of this.apL) xl = ap.process(xl, boing)
      for (const ap of this.apR) xr = ap.process(xr, boing)
      let wl = 0
      let wr = 0
      for (const c of this.combsL) {
        const fb = Math.pow(10, (-3 * c.delaySec) / decay)
        wl += c.process(xl, fb, dampCoef, c.delaySec * this.sr)
      }
      for (const c of this.combsR) {
        const fb = Math.pow(10, (-3 * c.delaySec) / decay)
        wr += c.process(xr, fb, dampCoef, c.delaySec * this.sr)
      }
      io.l[i] = io.l[i]! * (1 - mix) + wl * 0.3 * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * 0.3 * mix
    }
  }

  panic() {
    for (const ap of [...this.apL, ...this.apR]) ap.reset()
    for (const c of [...this.combsL, ...this.combsR]) c.reset()
  }
}
