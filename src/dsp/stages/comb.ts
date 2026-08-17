import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine } from '../util/delayline'
import { OnePoleLP, lpCoef } from '../util/onepole'
import { softclip } from '../util/softclip'

// Karplus-style feedback resonator. Feedback past unity self-oscillates at the
// comb pitch, held by the in-loop saturation.
export class Comb implements Stage {
  label = 'comb'
  private lineL: DelayLine
  private lineR: DelayLine
  private dampL = new OnePoleLP()
  private dampR = new OnePoleLP()

  constructor(private readonly sr: number) {
    const max = sr / 20 + 4
    this.lineL = new DelayLine(max)
    this.lineR = new DelayLine(max)
  }

  when(p: Float32Array) {
    return p[IDX.combMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const baseHz = p[IDX.combHz]!
    const mod = ctx.mod.read(DEST.combHz)
    const delayBase = this.sr / baseHz
    const fb = p[IDX.combFb]!
    const mix = p[IDX.combMix]!
    const coef = lpCoef(p[IDX.combDampHz]!, this.sr)

    for (let i = 0; i < io.n; i++) {
      const delay = mod
        ? this.sr / Math.min(Math.max(baseHz * Math.pow(2, mod[i]! * 2), 20), 4000)
        : delayBase
      const wl = softclip(io.l[i]! + fb * this.dampL.process(this.lineL.read(delay), coef))
      const wr = softclip(io.r[i]! + fb * this.dampR.process(this.lineR.read(delay * 1.003), coef))
      this.lineL.write(wl)
      this.lineR.write(wr)
      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
  }

  panic() {
    this.lineL.reset()
    this.lineR.reset()
    this.dampL.reset()
    this.dampR.reset()
  }
}
