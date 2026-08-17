import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { flushDenormal, softclip } from '../util/softclip'

class Svf {
  low = 0
  band = 0
  process(x: number, f: number, damp: number, mode: number): number {
    this.low = flushDenormal(this.low + f * this.band)
    const high = x - this.low - damp * this.band
    // saturating the band path is what turns negative damping into a held
    // scream instead of a blowup
    this.band = softclip(this.band + f * high)
    switch (mode) {
      case 1:
        return this.band
      case 2:
        return high
      default:
        return this.low
    }
  }
  reset() {
    this.low = 0
    this.band = 0
  }
}

// MS-20-flavored resonant 2-pole. Resonance past 1.0 goes to negative damping
// and the filter self-oscillates at the cutoff — ping it with crackle, or park
// it inside the global feedback loop and let it pick the squeal's pitch.
export class Screech implements Stage {
  label = 'screech'
  private svfL = new Svf()
  private svfR = new Svf()

  constructor(private readonly sr: number) {}

  when(p: Float32Array) {
    return p[IDX.filtMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const nyq = this.sr * 0.22
    const base = p[IDX.filtHz]!
    const mod = ctx.mod.read(DEST.filtHz)
    const fBase = 2 * Math.sin((Math.PI * Math.min(base, nyq)) / this.sr)
    const res = p[IDX.filtRes]!
    const damp = 2 * (1 - Math.min(res, 1)) + (res > 1 ? -(res - 1) * 1.5 : 0)
    const mode = Math.round(p[IDX.filtMode]!)
    const gain = Math.pow(10, p[IDX.filtDriveDb]! / 20)
    const mix = p[IDX.filtMix]!

    for (let i = 0; i < io.n; i++) {
      const f = mod
        ? 2 *
          Math.sin(
            (Math.PI * Math.min(Math.max(base * Math.pow(2, mod[i]! * 4), 10), nyq)) / this.sr,
          )
        : fBase
      const wl = this.svfL.process(softclip(io.l[i]! * gain), f, damp, mode)
      const wr = this.svfR.process(softclip(io.r[i]! * gain), f, damp, mode)
      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
  }

  panic() {
    this.svfL.reset()
    this.svfR.reset()
  }
}
