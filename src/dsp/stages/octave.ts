import { IDX } from '../../engine/params.ts'
import { DEST } from '../modbus.ts'
import { lpCoef } from '../util/onepole.ts'
import { octaves } from '../util/pitch.ts'
import { flushDenormal } from '../util/softclip.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

// MicroSputter V2, after a friend's design: a comparator with hysteresis clocks
// a divider for the sub, an XOR against its own delayed edge doubles it for the
// octave up, and a 4066 samples the input on every divider rise. Volts are
// relative to the 6 V reference.

export const OCT_DIVISIONS = [1, 2, 4, 8] as const
export const OCT_DIV_NAMES = ['÷1', '÷2', '÷4', '÷8']
export const OCT_SUB_SOURCES = ['divider', 'hold']
export const OCT_BOUNCE = ['off', 'hard', 'smooth']
export const OCT_CLOCKS = ['free', 'note', 'step']

const INPUT_V = 0.5
const RAIL_V = 4.5
const HYST_V = 0.1255
const XOR_S = 0.000326
const OCT_LP_HZ = 3386
const AC_HZ = 8
const SUB_LP_HZ = 2200
const SUB_V = 0.38
const OCT_SCALE = 1 / 6
const NOTE_V = 0.25
const APERTURE_S = 180e-6
const CAP_F = 1e-9
const LEAK_OHM = 10e6
const ON_OHM = 300
const FADE_S = 0.022
const HOLD_GAIN = 2

class Side {
  readonly delay: Uint8Array
  pos = 0
  lp = 0
  detector = 0
  count = 0
  selected = 0
  recovery = 0
  env = 0
  note = 0
  held = 0
  window = 0
  octLp = 0
  octDc = 0
  subLp = 0
  outDc = 0

  constructor(delay: number) {
    this.delay = new Uint8Array(delay)
  }

  reset() {
    this.delay.fill(0)
    this.pos = 0
    this.lp = 0
    this.detector = 0
    this.count = 0
    this.selected = 0
    this.recovery = 0
    this.env = 0
    this.note = 0
    this.held = 0
    this.window = 0
    this.octLp = 0
    this.octDc = 0
    this.subLp = 0
    this.outDc = 0
  }
}

export class Octave implements Stage {
  label = 'octave'
  private readonly sr: number
  private readonly dt: number
  private readonly sides: [Side, Side]
  private readonly octA: number
  private readonly acA: number
  private readonly subA: number
  private readonly attack: number
  private readonly release: number
  private readonly trackK: number
  private readonly trackTarget: number
  private readonly holdK: number
  private readonly fadeA: number
  private phase = 0
  private bounce = 0
  private cross = 0
  private lastStep = 0
  private noteWas = 0

  constructor(sr: number) {
    this.sr = sr
    const dt = 1 / sr
    this.dt = dt
    const taps = Math.max(1, Math.round(XOR_S * sr))
    this.sides = [new Side(taps), new Side(taps)]
    this.octA = lpCoef(OCT_LP_HZ, sr)
    this.acA = lpCoef(AC_HZ, sr)
    this.subA = lpCoef(SUB_LP_HZ, sr)
    this.attack = 1 - Math.exp(-dt / 0.001)
    this.release = 1 - Math.exp(-dt / 0.047)
    const onLeak = 1 / (1 / ON_OHM + 1 / LEAK_OHM)
    this.trackK = 1 - Math.exp(-dt / (onLeak * CAP_F))
    this.trackTarget = LEAK_OHM / (LEAK_OHM + ON_OHM)
    this.holdK = Math.exp(-dt / (LEAK_OHM * CAP_F))
    this.fadeA = 1 - Math.exp(-dt / FADE_S)
  }

  when(p: Float32Array) {
    return p[IDX.octMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const sr = this.sr
    const dt = this.dt
    const gain = p[IDX.octGain]! * INPUT_V
    const lpA = lpCoef(Math.min(p[IDX.octTone]!, sr * 0.45), sr)
    const baseTrack = p[IDX.octTrack]!
    const breakHz = Math.max(40, p[IDX.octBreakHz]!)
    const division = OCT_DIVISIONS[Math.round(p[IDX.octDiv]!)] ?? 2
    const up = p[IDX.octUp]!
    const subLevel = p[IDX.octSub]!
    const hold = Math.round(p[IDX.octSubSrc]!) === 1
    const bounceMode = Math.round(p[IDX.octBounce]!)
    const clock = Math.round(p[IDX.octClock]!)
    const baseRate = p[IDX.octRate]!
    const frozen = p[IDX.octFreeze]! >= 0.5
    const mix = p[IDX.octMix]!
    const rateMod = ctx.mod.read(DEST.octRate)
    const chaosMod = ctx.mod.read(DEST.octChaos)
    const { octA, acA, subA, attack, release } = this
    const { trackK, trackTarget, holdK } = this
    const freezeDivider = frozen && !hold

    for (let i = 0; i < io.n; i++) {
      const track = chaosMod
        ? Math.min(1, Math.max(0, baseTrack - chaosMod[i]!))
        : baseTrack
      const chaos = 1 - track
      const recoverS = (chaos * chaos) / breakHz

      let flip = false
      if (clock === 1) {
        const env = Math.max(this.sides[0].env, this.sides[1].env)
        const was = this.noteWas
        const now = was ? env >= NOTE_V * 0.65 : env >= NOTE_V
        this.noteWas = now ? 1 : 0
        flip = now && !was
      } else if (clock === 2) {
        const s = ctx.step[i]!
        flip = s < this.lastStep - 0.5
        this.lastStep = s
      } else {
        const rate = rateMod
          ? Math.min(baseRate * octaves(rateMod[i]! * 4), sr * 0.4)
          : baseRate
        this.phase += rate * dt
        if (this.phase >= 1) {
          this.phase -= Math.floor(this.phase)
          flip = true
        }
      }
      if (flip) this.bounce = 1 - this.bounce
      this.cross = flushDenormal(
        this.cross + this.fadeA * (this.bounce - this.cross),
      )
      const sel = bounceMode === 2 ? this.cross : this.bounce

      for (let c = 0; c < 2; c++) {
        const s = this.sides[c]!
        const buf = c === 0 ? io.l : io.r
        const x = buf[i]!
        const pre = Math.max(-RAIL_V, Math.min(RAIL_V, x * gain))
        s.lp = flushDenormal(s.lp + lpA * (pre - s.lp))

        // Harmonic residue, divider feedback and a finite retrigger recovery:
        // the breakup region, where the detector catches extra or missed edges.
        const pitch =
          s.lp * (0.6 + 0.4 * track) +
          (pre - s.lp) * chaos * 0.8 +
          (s.selected ? 1 : -1) * chaos * s.env * 0.12
        const old = s.detector
        s.recovery = Math.max(0, s.recovery - dt)
        const wants =
          (old === 0 && pitch >= HYST_V) || (old === 1 && pitch <= -HYST_V)
        if (wants && s.recovery <= 0) {
          s.detector = 1 - old
          s.recovery = recoverS
        }
        const wasSelected = s.selected
        if (!freezeDivider) {
          if (s.detector && !old) s.count++
          s.selected =
            division === 1
              ? s.detector
              : s.count % division >= division / 2
                ? 1
                : 0
        }
        if (s.selected && !wasSelected && !frozen) s.window = APERTURE_S

        const rect = Math.abs(pre)
        s.env = flushDenormal(
          s.env + (rect > s.env ? attack : release) * (rect - s.env),
        )

        if (s.window > 0 && !frozen) {
          s.held += trackK * (pre * trackTarget - s.held)
        } else s.held = flushDenormal(s.held * holdK)
        s.window = Math.max(0, s.window - dt)

        const delayed = s.delay[s.pos]!
        s.delay[s.pos] = s.detector
        s.pos = s.pos + 1 === s.delay.length ? 0 : s.pos + 1
        s.octLp = flushDenormal(
          s.octLp + octA * ((s.detector ^ delayed ? 6 : 0) - s.octLp),
        )
        s.octDc = flushDenormal(s.octDc + acA * (s.octLp - s.octDc))
        const octVoice = (s.octLp - s.octDc) * OCT_SCALE

        const gate = Math.min(1, s.env / 0.12)
        s.subLp = flushDenormal(
          s.subLp + subA * ((s.selected ? SUB_V : -SUB_V) * gate - s.subLp),
        )
        const subVoice = hold ? s.held * HOLD_GAIN : s.subLp

        const wet =
          bounceMode === 0
            ? octVoice * up + subVoice * subLevel
            : octVoice * up * sel + subVoice * subLevel * (1 - sel)
        s.outDc = flushDenormal(s.outDc + acA * (wet - s.outDc))
        buf[i] = x * (1 - mix) + (wet - s.outDc) * mix
      }
    }
  }

  panic() {
    this.sides[0].reset()
    this.sides[1].reset()
    this.phase = 0
    this.bounce = 0
    this.cross = 0
    this.lastStep = 0
    this.noteWas = 0
  }
}
