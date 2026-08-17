import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { mulberry32, type Rng } from '../util/rng'

// Bit depth quantizer plus a jittered sample-and-hold. The hold phases are
// offset per channel so heavy crush smears into stereo hash.
export class Crusher implements Stage {
  label = 'crusher'
  private holdL = 0
  private holdR = 0
  private countL = 0
  private countR: number
  private rng: Rng

  constructor(private readonly sr: number) {
    this.rng = mulberry32(404)
    this.countR = 2
  }

  when(p: Float32Array) {
    return p[IDX.crushMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const bits = p[IDX.bits]!
    const srHz = p[IDX.srHz]!
    const jitter = p[IDX.srJitter]!
    const mix = p[IDX.crushMix]!
    const mod = ctx.mod.read(DEST.crushHz)
    const steps = Math.pow(2, bits - 1)
    const holdBase = Math.max(this.sr / Math.max(srHz, 1), 1)

    for (let i = 0; i < io.n; i++) {
      // the clock is only read where a hold latches, as the real divider does
      const hold = mod
        ? Math.max(this.sr / Math.min(Math.max(srHz * Math.pow(2, mod[i]! * 4), 20), this.sr), 1)
        : holdBase
      this.countL -= 1
      if (this.countL <= 0) {
        this.holdL = Math.round(io.l[i]! * steps) / steps
        this.countL = hold * (1 + jitter * (this.rng() * 2 - 1))
      }
      this.countR -= 1
      if (this.countR <= 0) {
        this.holdR = Math.round(io.r[i]! * steps) / steps
        this.countR = hold * (1 + jitter * (this.rng() * 2 - 1))
      }
      io.l[i] = io.l[i]! * (1 - mix) + this.holdL * mix
      io.r[i] = io.r[i]! * (1 - mix) + this.holdR * mix
    }
  }

  panic() {
    this.holdL = 0
    this.holdR = 0
    this.countL = 0
    this.countR = 2
  }
}
