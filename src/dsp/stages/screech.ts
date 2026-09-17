import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import { octaves } from '../util/pitch'
import { mulberry32, type Rng } from '../util/rng'
import { softclip } from '../util/softclip'
import { dampAt, Svf } from '../util/svf'

import type { Ctx, Stage, StereoBlock } from '../stage'

// The floor the coupled damping can be driven to: as far negative as the
// resonance knob alone reaches at its top, and no further.
const DAMP_FLOOR = -1

const RES_MAX = 1.3

// A dropped filter. Popcorn: a junction flipping between two levels, faster
// the louder the input, stepping the integrators so each flip rings at the
// cutoff. Arc: the cap shorts when its swing passes breakdown. Wiper: the
// cutoff pot loses contact while it moves.
const POP_IDLE_HZ = 4
const POP_LOUD_HZ = 900
const POP_V = 0.35
const POP_FADE_S = 0.004
const ARC_KEEP = 0.08
const WIPER_HZ = 60
const MOTION_CAP = 50

// MS-20-flavored resonant 2-pole. Resonance past 1.0 goes to negative damping
// and the filter self-oscillates at the cutoff — ping it with crackle, or park
// it inside the global feedback loop and let it pick the squeal's pitch.
//
// Cross-coupling is the positive half of the argument the board has with itself:
// top end already in the chain opens the resonance, which makes more top end.
// The supply is the half pulling the other way, and because the two run on
// different time constants the pair never finds a level to sit at.
export class Screech implements Stage {
  label = 'screech'
  private svfL = new Svf()
  private svfR = new Svf()
  private rng: Rng
  private env = 0
  private popSign = 1
  private popV = 0
  private arcHoldL = 0
  private arcHoldR = 0
  private fPrev = 0
  private motion = 0
  private liftLeft = 0
  private liftF = 0

  constructor(
    private readonly sr: number,
    seed = 404,
  ) {
    this.rng = mulberry32(seed)
  }

  when(p: Float32Array) {
    return p[IDX.filtMix]! > 0
  }

  private arc(svf: Svf, hold: number, at: number): number {
    if (hold > 0) return hold - 1
    if (Math.abs(svf.band) < at) return 0
    svf.band *= ARC_KEEP
    svf.low *= 0.5
    return Math.round((0.002 + 0.03 * this.rng()) * this.sr)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const nyq = this.sr * 0.22
    // A hot tank drifts flat, the way every cheap filter does.
    const base = p[IDX.filtHz]! * (1 - 0.08 * ctx.heat)
    const mod = ctx.mod.read(DEST.filtHz)
    const fBase = 2 * Math.sin((Math.PI * Math.min(base, nyq)) / this.sr)
    const res = p[IDX.filtRes]!
    const modRes = ctx.mod.read(DEST.filtRes)
    const damp = dampAt(res)
    const resTop = Math.max(res, RES_MAX)
    const mode = Math.round(p[IDX.filtMode]!)
    const gain = Math.pow(10, p[IDX.filtDriveDb]! / 20)
    const mix = p[IDX.filtMix]!
    const couple = p[IDX.couple]!
    const pop = p[IDX.filtPop]!
    const arc = p[IDX.filtArc]!
    const arcAt = 0.9 * Math.pow(0.05, arc)
    const wiper = p[IDX.filtWiper]!
    const envK = 1 / (0.03 * this.sr)
    const popFade = Math.exp(-1 / (POP_FADE_S * this.sr))
    const motionK = 1 / (0.05 * this.sr)
    const liftOdds = (wiper * WIPER_HZ) / (MOTION_CAP * this.sr)
    const fTop = 2 * Math.sin((Math.PI * nyq) / this.sr)
    const fBottom = 2 * Math.sin((Math.PI * 30) / this.sr)

    for (let i = 0; i < io.n; i++) {
      let f = mod
        ? 2 *
          Math.sin(
            (Math.PI *
              Math.min(Math.max(base * octaves(mod[i]! * 4), 10), nyq)) /
              this.sr,
          )
        : fBase
      if (wiper > 0) {
        const moved = Math.abs(f - this.fPrev) / (this.fPrev + 1e-4)
        this.fPrev = f
        this.motion +=
          motionK * (Math.min(moved * this.sr, MOTION_CAP) - this.motion)
        if (this.liftLeft > 0) {
          this.liftLeft--
          f = this.liftF
        } else if (this.rng() < liftOdds * this.motion) {
          this.liftLeft = Math.round((0.001 + 0.012 * this.rng()) * this.sr)
          this.liftF = this.rng() < 0.5 ? fTop : fBottom
        }
      }
      const dampHere = modRes
        ? dampAt(Math.min(Math.max(res + modRes[i]! * RES_MAX, 0), resTop))
        : damp
      const d =
        couple > 0
          ? Math.max(dampHere - couple * ctx.bright[i]! * 0.9, DAMP_FLOOR)
          : dampHere
      let inL = softclip(io.l[i]! * gain)
      let inR = softclip(io.r[i]! * gain)
      if (pop > 0) {
        this.env += envK * (Math.abs(inL) + Math.abs(inR) - this.env)
        const hz = pop * (POP_IDLE_HZ + POP_LOUD_HZ * this.env)
        if (this.rng() * this.sr < hz) {
          this.popSign = -this.popSign
          this.popV = this.popSign * pop * POP_V * (0.3 + 0.7 * this.rng())
        }
        inL += this.popV
        inR += this.popV
        this.popV *= popFade
      }
      const wl = this.svfL.process(inL, f, d, mode)
      const wr = this.svfR.process(inR, f, d, mode)
      if (arc > 0) {
        this.arcHoldL = this.arc(this.svfL, this.arcHoldL, arcAt)
        this.arcHoldR = this.arc(this.svfR, this.arcHoldR, arcAt)
      }
      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
  }

  panic() {
    this.svfL.reset()
    this.svfR.reset()
    this.env = 0
    this.popV = 0
    this.arcHoldL = 0
    this.arcHoldR = 0
    this.motion = 0
    this.liftLeft = 0
  }
}
