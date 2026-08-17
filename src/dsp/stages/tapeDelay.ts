import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine } from '../util/delayline'
import { coef as timeCoef } from '../util/follower'
import { OnePoleLP, lpCoef } from '../util/onepole'
import { flushDenormal, softclip } from '../util/softclip'
import { mulberry32, type Rng } from '../util/rng'

// Fractional delay with wow/flutter transport wobble and a saturating
// feedback loop that runs away musically past unity. The capstan is a real
// motor: it has weight, it answers the brake, and it can be wired to the same
// dying supply as the toy.
export class TapeDelay implements Stage {
  label = 'tapeDelay'
  private lineL: DelayLine
  private lineR: DelayLine
  private toneL = new OnePoleLP()
  private toneR = new OnePoleLP()
  private wowPhase = 0
  private flutterWalk = 0
  private motor = 1
  private slide = 0
  private readonly maxDelay: number
  private rng: Rng

  constructor(private readonly sr: number) {
    this.maxDelay = 4.5 * sr
    this.lineL = new DelayLine(this.maxDelay + 4)
    this.lineR = new DelayLine(this.maxDelay + 4)
    this.rng = mulberry32(606)
  }

  when(p: Float32Array, ctx: Ctx) {
    return p[IDX.dlyMix]! > 0 || (ctx.fbDest === 3 && p[IDX.fbAmt]! > 0)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const baseDelay = (p[IDX.delayMs]! / 1000) * this.sr
    const fb = p[IDX.dlyFb]!
    const wowDepth = (p[IDX.wowDepthMs]! / 1000) * this.sr
    const wowHz = p[IDX.wowHz]!
    const flutter = p[IDX.flutter]!
    const mix = p[IDX.dlyMix]!
    const coef = lpCoef(p[IDX.dlyToneHz]!, this.sr)
    const micInject = p[IDX.micPatch] === 3
    const fbInject = ctx.fbDest === 3
    const brake = p[IDX.tapeBrake]!
    const railDrag = p[IDX.tapeMotorRail]!
    const modSpeed = ctx.mod.read(DEST.tapeSpeed)
    // Two ways to move the repeats, and they don't sound alike: the motor has
    // weight, so a wire on the speed dives in pitch on its way there, while a
    // wire on the time moves the head itself — the tap jumps and the repeat that
    // was already on the tape comes back at a new spacing.
    const modTime = ctx.mod.read(DEST.delayMs)
    const inertia = timeCoef(0.3, this.sr)
    const recenter = 1 / (3 * this.sr)

    for (let i = 0; i < io.n; i++) {
      const delaySamples = modTime
        ? Math.min(
            Math.max(baseDelay * Math.pow(2, 2 * modTime[i]!), 1),
            this.maxDelay - 8,
          )
        : baseDelay
      this.wowPhase = (this.wowPhase + wowHz / this.sr) % 1
      this.flutterWalk += (this.rng() - 0.5) * flutter * 0.6
      this.flutterWalk *= 0.995
      const wobble =
        wowDepth * Math.sin(this.wowPhase * 2 * Math.PI) +
        this.flutterWalk * 0.002 * this.sr

      let want = (1 - brake) * (1 - railDrag * ctx.droop[i]!)
      if (modSpeed) want *= Math.pow(2, modSpeed[i]! * 1.5)
      this.motor += inertia * (Math.min(Math.max(want, 0), 4) - this.motor)
      // the read head runs at motor speed against a fixed write head, so the
      // gap opens while the transport is slow — that gap is the pitch dive
      this.slide = flushDenormal(
        this.slide + (1 - this.motor) - this.slide * recenter,
      )
      this.slide = Math.min(
        Math.max(this.slide, 1 - delaySamples),
        this.maxDelay - delaySamples - 4,
      )
      const d = Math.min(
        Math.max(delaySamples + this.slide + wobble, 1),
        this.maxDelay,
      )

      const tapL = this.toneL.process(this.lineL.readHermite(d), coef)
      const tapR = this.toneR.process(this.lineR.readHermite(d * 1.007), coef)
      let wl = io.l[i]! + softclip(fb * tapL)
      let wr = io.r[i]! + softclip(fb * tapR)
      if (micInject) {
        wl += ctx.mic[i]!
        wr += ctx.mic[i]!
      }
      if (fbInject) {
        wl += ctx.fb[i]!
        wr += ctx.fb[i]!
      }
      this.lineL.write(wl)
      this.lineR.write(wr)
      io.l[i] = io.l[i]! * (1 - mix) + tapL * mix
      io.r[i] = io.r[i]! * (1 - mix) + tapR * mix
    }
  }

  panic() {
    this.lineL.reset()
    this.lineR.reset()
    this.toneL.reset()
    this.toneR.reset()
    this.flutterWalk = 0
    this.motor = 1
    this.slide = 0
  }
}
