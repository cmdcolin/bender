import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { flushDenormal, softclip } from '../util/softclip'

// Two allpass chains whose outputs stay about 90° apart across the band.
const COEF_A = [0.6923878, 0.9360654322959, 0.988229522686, 0.9987488452737]
const COEF_B = [
  0.4021921162426, 0.856171088242, 0.9722909545651, 0.9952884791278,
]

class Ap2 {
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  constructor(private readonly a2: number) {}

  process(x: number): number {
    const y = this.a2 * (x + this.y2) - this.x2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = flushDenormal(y)
    return y
  }

  reset() {
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
  }
}

// The analytic pair a single-sideband shift needs: re and im carry the same
// signal a quarter cycle apart, at every frequency at once.
class Hilbert {
  re = 0
  im = 0
  private a = COEF_A.map(c => new Ap2(c * c))
  private b = COEF_B.map(c => new Ap2(c * c))
  private held = 0

  process(x: number) {
    let a = x
    for (const s of this.a) a = s.process(a)
    let b = x
    for (const s of this.b) b = s.process(b)
    this.re = this.held
    this.held = a
    // chain B leads chain A, so negating it gives the quadrature pair the
    // usual sign: im lags re by 90°, and summing the sidebands shifts up
    this.im = -b
  }

  reset() {
    for (const s of this.a) s.reset()
    for (const s of this.b) s.reset()
    this.re = 0
    this.im = 0
    this.held = 0
  }
}

// Bode-style frequency shifter: every partial moves by the same number of Hz,
// not the same ratio, so harmonic input comes out inharmonic. With feedback
// each lap shifts again and partials climb forever — and inside the global
// loop it stops the squeal ever settling on a pitch.
export class Shifter implements Stage {
  label = 'shifter'
  private hL = new Hilbert()
  private hR = new Hilbert()
  private phase = 0
  private fbL = 0
  private fbR = 0

  constructor(private readonly sr: number) {}

  when(p: Float32Array) {
    return p[IDX.shiftMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const dir = Math.round(p[IDX.shiftDir]!) === 1 ? -1 : 1
    const fb = p[IDX.shiftFb]!
    const mix = p[IDX.shiftMix]!
    const baseHz = p[IDX.shiftHz]!
    const mod = ctx.mod.read(DEST.shiftHz)
    const incBase = baseHz / this.sr

    for (let i = 0; i < io.n; i++) {
      const inc = mod
        ? Math.min(baseHz * Math.pow(2, mod[i]! * 4), this.sr * 0.4) / this.sr
        : incBase
      this.phase = (this.phase + inc) % 1
      const c = Math.cos(this.phase * 2 * Math.PI)
      const s = Math.sin(this.phase * 2 * Math.PI)

      this.hL.process(io.l[i]! + softclip(fb * this.fbL))
      this.hR.process(io.r[i]! + softclip(fb * this.fbR))
      // the right channel's carrier runs a quarter turn behind, which spreads
      // the sidebands without changing what either channel is doing
      const wl = this.hL.re * c - dir * this.hL.im * s
      const wr = this.hR.re * -s - dir * this.hR.im * c
      this.fbL = wl
      this.fbR = wr

      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
  }

  panic() {
    this.hL.reset()
    this.hR.reset()
    this.phase = 0
    this.fbL = 0
    this.fbR = 0
  }
}
