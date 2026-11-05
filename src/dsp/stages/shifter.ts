import { IDX } from '../../engine/params.ts'
import { DEST } from '../modbus.ts'
import { clamp01 } from '../util/clamp.ts'
import { QuadOsc, RATE_MASK } from '../util/lfo.ts'
import { octaves } from '../util/pitch.ts'
import { mulberry32 } from '../util/rng.ts'
import { flushDenormal, softclip } from '../util/softclip.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

// Two allpass chains whose outputs stay about 90° apart across the band.
const COEF_A = [0.6923878, 0.9360654322959, 0.988229522686, 0.9987488452737]
const COEF_B = [
  0.4021921162426, 0.856171088242, 0.9722909545651, 0.9952884791278,
]

const A2 = Float64Array.from([...COEF_A, ...COEF_B], c => c * c)
const N_SEC = COEF_A.length

// Each section's break, as the tangent its coefficient is built from, so a part
// that walks off value moves the break by a ratio.
const BREAK = A2.map(a => (1 - a) / (1 + a))

export const SHIFT_OUTS = ['one sideband', 'up left, down right']
const OUT_SPLIT = 1

// How far the pairs' parts walk at full Drift, as the log of the ratio each
// break moves by. A walk of 0.1 leaks the other sideband at −18 dB, 0.4 at
// −6 dB, 0.8 passes both equally, and past it bands flip direction. Cold they
// sit at 0.18. The parts heat with the power through them, so a programme at
// 0.25 rms warms them to 1.2 a quarter second later and one at half that only
// to 0.48; board heat doubles the lot.
const DRIFT_SPAN = 1.2
const DRIFT_COLD = 0.15
const DRIFT_HEAT = 1
const WARM_S = 0.25
const WARM_REF = 0.25
const TOL_FLOOR = 0.4

const QUARTER = Math.PI / 2
const KNOCK_S = 0.12

// A sag of a quarter of the rail stops the carrier at full Rail, and half
// runs it backwards at the shift it had. The integrators clip at the rail too,
// squaring the carrier up.
const RAIL_SWING = 4
const RAIL_HEAD = 2
const HEAD_FLOOR = 0.1

const LEAK_CARRIER = 0.3

const CLIP_DRIVE = 5
const CLIP_LOPSIDE = 0.7

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
  coef = A2
  private readonly st = new Float64Array(A2.length * 4)
  private held = 0

  private chain(x: number, from: number): number {
    const st = this.st
    const coef = this.coef
    for (let k = from; k < from + N_SEC; k++) {
      const o = k * 4
      const y = coef[k]! * (x + st[o + 3]!) - st[o + 1]!
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

// One channel's pair as built: each part off its value by its own tolerance,
// chain A's breaks low and chain B's high, so whatever walks them walks the two
// chains apart rather than together.
class Pair {
  readonly coef = new Float64Array(A2.length)
  private readonly tol = new Float64Array(A2.length)
  warm = 0

  constructor(seed: number) {
    const parts = mulberry32(seed)
    for (let k = 0; k < A2.length; k++) {
      const off = TOL_FLOOR + (1 - TOL_FLOOR) * parts()
      this.tol[k] = k < N_SEC ? -off : off
    }
  }

  walk(drift: number, heat: number) {
    const by =
      drift *
      DRIFT_SPAN *
      (DRIFT_COLD +
        (1 - DRIFT_COLD) * Math.min(this.warm / (WARM_REF * WARM_REF), 1) +
        DRIFT_HEAT * heat)
    for (let k = 0; k < A2.length; k++) {
      const t = BREAK[k]! * Math.exp(by * this.tol[k]!)
      this.coef[k] = (1 - t) / (1 + t)
    }
  }
}

// Bode-style frequency shifter: every partial moves by the same number of Hz,
// not the same ratio, so harmonic input comes out inharmonic. With feedback
// each lap shifts again and partials climb forever — and inside the global
// loop it stops the squeal ever settling on a pitch.
//
// Past stock it is the analog box: two allpass pairs whose parts warm with the
// programme and the board, a quadrature oscillator that can be trimmed off 90°
// and knocked further off by the kit's hits, run off the board's rail and
// leaking into the output, both sideband outputs, and an input amp where the
// feedback comes back in that clips lopsided.
export class Shifter implements Stage {
  label = 'shifter'
  private hL = new Hilbert()
  private hR = new Hilbert()
  private carrier = new QuadOsc()
  private fbL = 0
  private fbR = 0
  private pairL = new Pair(0xb0de)
  private pairR = new Pair(0xb0de ^ 0x5eed)
  private knock = 0

  private readonly sr: number

  constructor(sr: number) {
    this.sr = sr
  }

  when(p: Float32Array) {
    return p[IDX.shiftMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const deep =
      p[IDX.shiftDrift]! > 0 ||
      p[IDX.shiftQuad]! > 0 ||
      p[IDX.shiftKnock]! > 0 ||
      p[IDX.shiftSplit]! >= 0.5 ||
      p[IDX.shiftClip]! > 0 ||
      p[IDX.shiftRail]! > 0 ||
      p[IDX.shiftLeak]! > 0 ||
      ctx.mod.read(DEST.shiftDrift) !== null ||
      ctx.mod.read(DEST.shiftQuad) !== null
    if (deep) this.circuit(io, p, ctx)
    else this.stock(io, p, ctx)
  }

  private stock(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const dir = Math.round(p[IDX.shiftDir]!) === 1 ? -1 : 1
    const fb = p[IDX.shiftFb]!
    const mix = p[IDX.shiftMix]!
    const baseHz = p[IDX.shiftHz]!
    const mod = ctx.mod.read(DEST.shiftHz)
    // A shift that holds still turns the carrier by the same angle every
    // sample, so the rate is set once a block. A wire on it resets the rate
    // every eighth sample.
    const carrier = this.carrier
    if (!mod) carrier.setRate(baseHz, this.sr)
    this.hL.coef = A2
    this.hR.coef = A2
    this.knock = 0

    for (let i = 0; i < io.n; i++) {
      if (mod && (i & RATE_MASK) === 0) {
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

  private circuit(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const dir = Math.round(p[IDX.shiftDir]!) === 1 ? -1 : 1
    const dirR = Math.round(p[IDX.shiftSplit]!) === OUT_SPLIT ? -dir : dir
    const fb = p[IDX.shiftFb]!
    const mix = p[IDX.shiftMix]!
    const baseHz = p[IDX.shiftHz]!
    const mod = ctx.mod.read(DEST.shiftHz)
    const n = io.n
    const { hL, hR, pairL, pairR, carrier } = this

    const modDrift = ctx.mod.read(DEST.shiftDrift)
    const drift = modDrift
      ? clamp01(p[IDX.shiftDrift]! + modDrift[0]!)
      : p[IDX.shiftDrift]!
    if (drift > 0) {
      const settle = 1 - Math.exp(-n / (this.sr * WARM_S))
      let msL = 0
      let msR = 0
      for (let i = 0; i < n; i++) {
        msL += io.l[i]! * io.l[i]!
        msR += io.r[i]! * io.r[i]!
      }
      pairL.warm += (msL / n - pairL.warm) * settle
      pairR.warm += (msR / n - pairR.warm) * settle
      pairL.walk(drift, ctx.heat)
      pairR.walk(drift, ctx.heat)
      hL.coef = pairL.coef
      hR.coef = pairR.coef
    } else {
      hL.coef = A2
      hR.coef = A2
    }

    const quadBase = p[IDX.shiftQuad]!
    const modQuad = ctx.mod.read(DEST.shiftQuad)
    const knockAt = p[IDX.shiftKnock]! * Math.PI
    const relax = Math.exp(-1 / (this.sr * KNOCK_S))
    const bits = ctx.trig.drumBits
    const gain = ctx.trig.drumGain
    if (knockAt === 0) this.knock = 0
    const offBase = Math.min(quadBase * QUARTER + this.knock, Math.PI)
    let cosE = Math.cos(offBase)
    let sinE = Math.sin(offBase)

    const clip = p[IDX.shiftClip]!
    const drive = 1 + CLIP_DRIVE * clip
    const floor = -(1 - CLIP_LOPSIDE * clip)
    const makeup = 1 / Math.sqrt(drive)
    const rail = p[IDX.shiftRail]!
    const leak = p[IDX.shiftLeak]! * LEAK_CARRIER

    if (!mod && rail === 0) carrier.setRate(baseHz, this.sr)

    for (let i = 0; i < n; i++) {
      const sag = rail * ctx.droop[i]!
      if ((mod || rail > 0) && (i & RATE_MASK) === 0) {
        const hz = mod
          ? Math.min(baseHz * octaves(mod[i]! * 4), this.sr * 0.4)
          : baseHz
        carrier.setTurn(hz * (1 - RAIL_SWING * sag), this.sr)
      }
      if (knockAt > 0) {
        this.knock *= relax
        if (bits[i]! !== 0)
          this.knock = Math.max(this.knock, knockAt * Math.min(gain[i]!, 1))
      }
      if (knockAt > 0 || modQuad) {
        const quad = modQuad ? clamp01(quadBase + modQuad[i]!) : quadBase
        const off = Math.min(quad * QUARTER + this.knock, Math.PI)
        cosE = Math.cos(off)
        sinE = Math.sin(off)
      }
      carrier.step()
      const head = Math.max(1 - RAIL_HEAD * sag, HEAD_FLOOR)
      const re = Math.min(Math.max(carrier.re, -head), head) / head
      const im = Math.min(Math.max(carrier.im, -head), head) / head
      const c = re
      const s = im * cosE + c * sinE
      const cR = -im
      const sR = c * cosE - im * sinE

      const inL =
        clip > 0
          ? Math.min(Math.max((io.l[i]! + fb * this.fbL) * drive, floor), 1) *
            makeup
          : io.l[i]! + softclip(fb * this.fbL)
      const inR =
        clip > 0
          ? Math.min(Math.max((io.r[i]! + fb * this.fbR) * drive, floor), 1) *
            makeup
          : io.r[i]! + softclip(fb * this.fbR)
      hL.process(inL)
      hR.process(inR)
      const wl = hL.re * c - dir * hL.im * s + leak * c
      const wr = hR.re * cR - dirR * hR.im * sR + leak * cR
      this.fbL = wl
      this.fbR = wr

      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
    this.knock = flushDenormal(this.knock)
  }

  panic() {
    this.hL.reset()
    this.hR.reset()
    this.carrier.reset()
    this.fbL = 0
    this.fbR = 0
    this.pairL.warm = 0
    this.pairR.warm = 0
    this.knock = 0
  }
}
