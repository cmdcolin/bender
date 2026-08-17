import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { flushDenormal } from '../util/softclip'
import { mulberry32, type Rng } from '../util/rng'

// Master supply starve: loud passages sag the rail and pump the whole mix,
// a loose power jack drops out at random, and the harder the supply works the
// more it crackles.
export class Brownout implements Stage {
  label = 'brownout'
  private sag = 0
  private dropRemaining = 0
  private rng: Rng

  constructor(private readonly sr: number) {
    this.rng = mulberry32(707)
  }

  when(p: Float32Array) {
    return p[IDX.brownAmt]! > 0 || p[IDX.brownCrackle]! > 0
  }

  process(io: StereoBlock, p: Float32Array, _ctx: Ctx) {
    const amt = p[IDX.brownAmt]!
    const dropProb = p[IDX.brownRate]! / this.sr
    const crackleAmt = p[IDX.brownCrackle]!
    const attack = 1 - Math.exp(-1 / (0.02 * this.sr))
    const release = 1 - Math.exp(-1 / (0.4 * this.sr))

    for (let i = 0; i < io.n; i++) {
      const x = Math.max(Math.abs(io.l[i]!), Math.abs(io.r[i]!))
      const coef = x > this.sag ? attack : release
      this.sag = flushDenormal(this.sag + coef * (x - this.sag))

      let g = 1 / (1 + amt * 4 * this.sag)
      if (amt > 0 && this.dropRemaining <= 0 && this.rng() < dropProb * (1 + this.sag)) {
        this.dropRemaining = Math.floor((0.01 + this.rng() * 0.08) * this.sr * (1 + this.sag))
      }
      if (this.dropRemaining > 0) {
        this.dropRemaining--
        g *= 0.03
      }

      const crackle =
        crackleAmt > 0 ? (this.rng() < this.sag * 0.3 ? (this.rng() * 2 - 1) * crackleAmt : 0) : 0
      io.l[i] = io.l[i]! * g + crackle
      io.r[i] = io.r[i]! * g + crackle
    }
  }

  panic() {
    this.sag = 0
    this.dropRemaining = 0
  }
}
