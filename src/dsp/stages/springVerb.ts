import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine, fixedTap } from '../util/delayline'
import { OnePoleLP, lpCoef } from '../util/onepole'

const AP_MS = [4.7, 8.3, 11.9]
const COMB_MS = [31, 37, 41, 43]

// Neither tap in the tank ever moves, so both split their delay once and read
// through readAt from there.
class Allpass {
  private line: DelayLine
  private whole: number
  private frac: number
  constructor(delay: number) {
    this.line = new DelayLine(delay + 4)
    ;({ whole: this.whole, frac: this.frac } = fixedTap(delay, delay))
  }
  process(x: number, g: number): number {
    const d = this.line.readAt(this.whole, this.frac)
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
  private whole: number
  private frac: number
  constructor(
    readonly delaySec: number,
    delay: number,
  ) {
    this.line = new DelayLine(delay + 4)
    ;({ whole: this.whole, frac: this.frac } = fixedTap(delay, delay))
  }
  process(x: number, fb: number, dampCoef: number): number {
    const d = this.line.readAt(this.whole, this.frac)
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
  private readonly fbL = new Float64Array(COMB_MS.length)
  private readonly fbR = new Float64Array(COMB_MS.length)

  constructor(private readonly sr: number) {
    const comb = (ms: number) => new DampedComb(ms / 1000, (ms / 1000) * sr)
    this.apL = AP_MS.map(ms => new Allpass((ms / 1000) * sr))
    this.apR = AP_MS.map(ms => new Allpass((ms / 1000) * sr * 1.05))
    this.combsL = COMB_MS.map(comb)
    this.combsR = COMB_MS.map(ms => comb(ms + 1.7))
  }

  when(p: Float32Array) {
    return p[IDX.revMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    // A tank is springs and a coil: how long it rings is a block-rate thing, so
    // a wire on the decay is read once at the top of the block rather than eight
    // pow calls a sample down inside it.
    const mod = ctx.mod.read(DEST.revDecay)
    const decay = Math.min(
      Math.max(p[IDX.revDecayS]! * (mod ? Math.pow(2, 2 * mod[0]!) : 1), 0.05),
      30,
    )
    const mix = p[IDX.revMix]!
    const boing = 0.35 + 0.5 * p[IDX.revBoing]!
    const dampCoef = lpCoef(p[IDX.revToneHz]!, this.sr)
    // A tank's feedback follows the decay knob, and the knob holds still for the
    // block: eight pow calls a sample is eight for nothing.
    const fbL = this.fbL
    const fbR = this.fbR
    const decayFb = (c: DampedComb) => Math.pow(10, (-3 * c.delaySec) / decay)
    for (let j = 0; j < fbL.length; j++) {
      fbL[j] = decayFb(this.combsL[j]!)
      fbR[j] = decayFb(this.combsR[j]!)
    }

    for (let i = 0; i < io.n; i++) {
      let xl = io.l[i]!
      let xr = io.r[i]!
      for (const ap of this.apL) xl = ap.process(xl, boing)
      for (const ap of this.apR) xr = ap.process(xr, boing)
      let wl = 0
      let wr = 0
      for (let j = 0; j < fbL.length; j++) {
        wl += this.combsL[j]!.process(xl, fbL[j]!, dampCoef)
        wr += this.combsR[j]!.process(xr, fbR[j]!, dampCoef)
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
