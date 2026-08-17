import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'

export class RingMod implements Stage {
  label = 'ringmod'
  private phase = 0

  constructor(private readonly sr: number) {}

  when(p: Float32Array) {
    return p[IDX.ringMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const hz = p[IDX.ringHz]!
    const square = Math.round(p[IDX.ringShape]!) === 1
    const mix = p[IDX.ringMix]!
    const micCarrier = p[IDX.micPatch] === 4

    for (let i = 0; i < io.n; i++) {
      let car: number
      if (micCarrier) {
        car = Math.min(Math.max(ctx.mic[i]! * 2, -1), 1)
      } else {
        this.phase = (this.phase + hz / this.sr) % 1
        const s = Math.sin(this.phase * 2 * Math.PI)
        car = square ? Math.sign(s) || 1 : s
      }
      io.l[i] = io.l[i]! * (1 - mix) + io.l[i]! * car * mix
      io.r[i] = io.r[i]! * (1 - mix) + io.r[i]! * car * mix
    }
  }

  panic() {
    this.phase = 0
  }
}
