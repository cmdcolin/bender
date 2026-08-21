import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { flushDenormal } from '../util/softclip'
import { mulberry32, type Rng } from '../util/rng'

// White noise through a tilt, plus dirty-pot contact crackle: Poisson spikes
// rung through a 2-pole resonator.
export class Noise implements Stage {
  label = 'noise'
  private lpL = 0
  private lpR = 0
  private ring1 = 0
  private ring2 = 0
  private rng: Rng

  constructor(
    private readonly sr: number,
    seed = 303,
  ) {
    this.rng = mulberry32(seed)
  }

  when(p: Float32Array) {
    return p[IDX.noiseLevel]! > 0 || p[IDX.crackleAmp]! > 0
  }

  process(io: StereoBlock, p: Float32Array, _ctx: Ctx) {
    const level = p[IDX.noiseLevel]!
    const color = p[IDX.noiseColor]!
    const crackleAmp = p[IDX.crackleAmp]!
    const spikeProb = p[IDX.crackleRate]! / this.sr
    const tiltCoef = 0.1
    const r = 0.995
    const c = 2 * r * Math.cos((2 * Math.PI * 2800) / this.sr)

    for (let i = 0; i < io.n; i++) {
      let outL = 0
      let outR = 0
      if (level > 0) {
        const nl = this.rng() * 2 - 1
        const nr = this.rng() * 2 - 1
        this.lpL = flushDenormal(this.lpL + tiltCoef * (nl - this.lpL))
        this.lpR = flushDenormal(this.lpR + tiltCoef * (nr - this.lpR))
        outL = tilt(nl, this.lpL, color) * level * 0.4
        outR = tilt(nr, this.lpR, color) * level * 0.4
      }
      if (crackleAmp > 0) {
        const spike = this.rng() < spikeProb ? (this.rng() * 2 - 1) * 3 : 0
        const y = c * this.ring1 - r * r * this.ring2 + spike
        this.ring2 = this.ring1
        this.ring1 = flushDenormal(y)
        const crackle = y * crackleAmp * 0.5
        outL += crackle
        outR += crackle
      }
      io.l[i]! += outL
      io.r[i]! += outR
    }
  }

  panic() {
    this.lpL = 0
    this.lpR = 0
    this.ring1 = 0
    this.ring2 = 0
  }
}

function tilt(x: number, lp: number, color: number): number {
  if (color > 0) return x + color * (x - 2 * lp)
  if (color < 0) return x + -color * (2 * lp - x)
  return x
}
