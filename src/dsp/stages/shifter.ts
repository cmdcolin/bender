import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { octaves } from '../util/pitch'
import { QuadOsc } from '../util/lfo'
import { flushDenormal, softclip } from '../util/softclip'

// Two allpass chains whose outputs stay about 90° apart across the band.
const COEF_A = [0.6923878, 0.9360654322959, 0.988229522686, 0.9987488452737]
const COEF_B = [
  0.4021921162426, 0.856171088242, 0.9722909545651, 0.9952884791278,
]

const A2 = Float64Array.from([...COEF_A, ...COEF_B], c => c * c)
const N_SEC = COEF_A.length

// The analytic pair a single-sideband shift needs: re and im carry the same
// signal a quarter cycle apart, at every frequency at once.
//
// Eight second-order allpass sections, held as four numbers each in one flat
// state array rather than eight objects. Two chains of four ran as sixteen
// method calls a sample per channel, and every one of them reloaded its four
// fields from a different object; the sections themselves are six flops.
class Hilbert {
  re = 0
  im = 0
  private readonly st = new Float64Array(A2.length * 4)
  private held = 0

  private chain(x: number, from: number): number {
    const st = this.st
    for (let k = from; k < from + N_SEC; k++) {
      const o = k * 4
      const y = A2[k]! * (x + st[o + 3]!) - st[o + 1]!
      st[o + 1] = st[o]!
      st[o] = x
      st[o + 3] = st[o + 2]!
      st[o + 2] = flushDenormal(y)
      x = y
    }
    return x
  }

  process(x: number) {
    const a = this.chain(x, 0)
    const b = this.chain(x, N_SEC)
    this.re = this.held
    this.held = a
    // chain B leads chain A, so negating it gives the quadrature pair the
    // usual sign: im lags re by 90°, and summing the sidebands shifts up
    this.im = -b
  }

  reset() {
    this.st.fill(0)
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
  private carrier = new QuadOsc()
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
    // A shift that holds still turns the carrier by the same angle every
    // sample, so the rate is set once and the pair costs four multiplies from
    // there. A wire on it moves the angle per sample, which is the two library
    // calls back — no worse than it was, and only while something is wired.
    const carrier = this.carrier
    if (!mod) carrier.setRate(baseHz, this.sr)

    for (let i = 0; i < io.n; i++) {
      if (mod) {
        carrier.setRate(
          Math.min(baseHz * octaves(mod[i]! * 4), this.sr * 0.4),
          this.sr,
        )
      }
      carrier.step()
      const c = carrier.re
      const s = carrier.im

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
    this.carrier.reset()
    this.fbL = 0
    this.fbR = 0
  }
}
