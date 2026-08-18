import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { octaves } from '../util/pitch'
import { QuadOsc } from '../util/lfo'

export class RingMod implements Stage {
  label = 'ringmod'
  private carrier = new QuadOsc()

  constructor(private readonly sr: number) {}

  when(p: Float32Array) {
    return p[IDX.ringMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const base = p[IDX.ringHz]!
    const mod = ctx.mod.read(DEST.ringHz)
    const square = Math.round(p[IDX.ringShape]!) === 1
    const mix = p[IDX.ringMix]!
    const micCarrier = Math.round(p[IDX.micPatch]!) === 4
    const carrier = this.carrier
    if (!mod) carrier.setRate(base, this.sr)

    for (let i = 0; i < io.n; i++) {
      let car: number
      if (micCarrier) {
        car = Math.min(Math.max(ctx.mic[i]! * 2, -1), 1)
      } else {
        if (mod) {
          carrier.setRate(
            Math.min(base * octaves(mod[i]! * 4), this.sr * 0.45),
            this.sr,
          )
        }
        carrier.step()
        const s = carrier.im
        car = square ? Math.sign(s) || 1 : s
      }
      io.l[i] = io.l[i]! * (1 - mix) + io.l[i]! * car * mix
      io.r[i] = io.r[i]! * (1 - mix) + io.r[i]! * car * mix
    }
  }

  panic() {
    this.carrier.reset()
  }
}
