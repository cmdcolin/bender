import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine } from '../util/delayline'
import { OnePoleLP, lpCoef } from '../util/onepole'
import { softclip } from '../util/softclip'
import { mulberry32, type Rng } from '../util/rng'

// Fractional delay with wow/flutter transport wobble and a saturating
// feedback loop that runs away musically past unity.
export class TapeDelay implements Stage {
  label = 'tapeDelay'
  private lineL: DelayLine
  private lineR: DelayLine
  private toneL = new OnePoleLP()
  private toneR = new OnePoleLP()
  private wowPhase = 0
  private flutterWalk = 0
  private rng: Rng

  constructor(private readonly sr: number) {
    const max = 2.2 * sr
    this.lineL = new DelayLine(max)
    this.lineR = new DelayLine(max)
    this.rng = mulberry32(606)
  }

  when(p: Float32Array) {
    return p[IDX.dlyMix]! > 0 || (p[IDX.fbDest] === 3 && p[IDX.fbAmt]! > 0)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const delaySamples = (p[IDX.delayMs]! / 1000) * this.sr
    const fb = p[IDX.dlyFb]!
    const wowDepth = (p[IDX.wowDepthMs]! / 1000) * this.sr
    const wowHz = p[IDX.wowHz]!
    const flutter = p[IDX.flutter]!
    const mix = p[IDX.dlyMix]!
    const coef = lpCoef(p[IDX.dlyToneHz]!, this.sr)
    const micInject = p[IDX.micPatch] === 3
    const fbInject = Math.round(p[IDX.fbDest]!) === 3

    for (let i = 0; i < io.n; i++) {
      this.wowPhase = (this.wowPhase + wowHz / this.sr) % 1
      this.flutterWalk += (this.rng() - 0.5) * flutter * 0.6
      this.flutterWalk *= 0.995
      const wobble =
        wowDepth * Math.sin(this.wowPhase * 2 * Math.PI) + this.flutterWalk * 0.002 * this.sr
      const d = Math.max(delaySamples + wobble, 1)

      const tapL = this.toneL.process(this.lineL.read(d), coef)
      const tapR = this.toneR.process(this.lineR.read(d * 1.007), coef)
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
  }
}
