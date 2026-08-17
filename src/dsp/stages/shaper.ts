import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { OnePoleLP, lpCoef } from '../util/onepole'

function fold(x: number): number {
  // reflect off ±1 until inside
  x = ((((x + 1) % 4) + 4) % 4) - 1
  return x > 1 ? 2 - x : x
}

function shape(x: number, mode: number): number {
  switch (mode) {
    case 1:
      return Math.min(Math.max(x, -1), 1)
    case 2:
      return Math.tanh(x * 1.5) * (x > 0 ? 1 : 0.6)
    case 3:
      return fold(x)
    case 4:
      return Math.abs(Math.tanh(x)) * 2 - 1
    default:
      return Math.tanh(x)
  }
}

export class Shaper implements Stage {
  label = 'shaper'
  private toneL = new OnePoleLP()
  private toneR = new OnePoleLP()
  private flipL = 1
  private flipR = 1
  private wasNegL = false
  private wasNegR = false

  constructor(private readonly sr: number) {}

  when(p: Float32Array) {
    return p[IDX.distMix]! > 0
  }

  // Sub-octave: a flip-flop toggling on positive-going zero crossings, like a
  // vintage octave divider. On complex input it mistracks and glitches —
  // which is the charm.
  private sub(x: number, ch: 0 | 1): number {
    const neg = x < 0
    if (ch === 0) {
      if (this.wasNegL && !neg) this.flipL = -this.flipL
      this.wasNegL = neg
      return this.flipL
    }
    if (this.wasNegR && !neg) this.flipR = -this.flipR
    this.wasNegR = neg
    return this.flipR
  }

  process(io: StereoBlock, p: Float32Array, _ctx: Ctx) {
    const gain = Math.pow(10, p[IDX.driveDb]! / 20)
    const bias = p[IDX.distBias]!
    const mode = Math.round(p[IDX.distMode]!)
    const subLevel = p[IDX.subLevel]!
    const mix = p[IDX.distMix]!
    const coef = lpCoef(p[IDX.distToneHz]!, this.sr)

    for (let i = 0; i < io.n; i++) {
      let xl = io.l[i]!
      let xr = io.r[i]!
      if (subLevel > 0) {
        // gate the sub on signal presence so silence stays silent
        const gateL = Math.min(Math.abs(xl) * 30, 1)
        const gateR = Math.min(Math.abs(xr) * 30, 1)
        xl += this.sub(xl, 0) * subLevel * gateL * 0.7
        xr += this.sub(xr, 1) * subLevel * gateR * 0.7
      }
      const wl = this.toneL.process(shape(xl * gain + bias, mode), coef)
      const wr = this.toneR.process(shape(xr * gain + bias, mode), coef)
      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
  }

  panic() {
    this.toneL.reset()
    this.toneR.reset()
    this.flipL = 1
    this.flipR = 1
  }
}
