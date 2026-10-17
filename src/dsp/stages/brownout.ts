import { IDX } from '../../engine/params.ts'
import { Burst } from '../util/burst.ts'
import { coef, Follower } from '../util/follower.ts'
import { SineOsc } from '../util/lfo.ts'
import { mulberry32, type Rng } from '../util/rng.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

// Master supply starve: loud passages sag the rail and pump the whole mix,
// a loose power jack drops out at random, and the harder the supply works the
// more it crackles.
//
// A jack that has started dropping out goes on dropping out — the plug is a
// little further out than it was and the contact is a little more oxidised for
// having arced — so both faults run off self-exciting timing rather than a flat
// rate the ear can average away.
export class Brownout implements Stage {
  label = 'brownout'
  private sag = new Follower()
  private dropRemaining = 0
  private hum = new SineOsc()
  private rng: Rng
  private dropFault: Burst
  private crackleFault: Burst

  private readonly sr: number
  private readonly attack: number
  private readonly release: number

  constructor(sr: number, seed = 707) {
    this.sr = sr
    this.attack = coef(0.02, sr)
    this.release = coef(0.4, sr)
    this.rng = mulberry32(seed)
    this.dropFault = new Burst(sr, 2.2)
    this.crackleFault = new Burst(sr, 0.5)
  }

  // Cross-coupling counts as a reason to run: this stage owns the supply strain
  // the coupling pulls against, and a board given only the half that opens up
  // has nothing shutting it back down.
  when(p: Float32Array) {
    return (
      p[IDX.brownAmt]! > 0 ||
      p[IDX.brownCrackle]! > 0 ||
      p[IDX.humLevel]! > 0 ||
      p[IDX.couple]! > 0
    )
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const amt = p[IDX.brownAmt]!
    const dropProb = p[IDX.brownRate]! / this.sr
    const crackleAmt = p[IDX.brownCrackle]!
    const humLevel = p[IDX.humLevel]!
    const humK = SineOsc.rate(
      Math.round(p[IDX.humHz]!) === 1 ? 60 : 50,
      this.sr,
    )
    const cluster = p[IDX.faultCluster]!
    const couple = p[IDX.couple]!

    for (let i = 0; i < io.n; i++) {
      this.dropFault.step()
      this.crackleFault.step()
      // Cross-coupling's negative half: a bright loop is a loop drawing current
      // in the register the supply is worst at holding, so it strains harder
      // than its level alone says it should — and the sag it causes shuts the
      // top end back down, several hundred milliseconds after the resonance
      // opened it up.
      const x =
        Math.max(Math.abs(io.l[i]!), Math.abs(io.r[i]!)) *
        (1 + couple * Math.max(ctx.bright[i]!, 0) * 1.6)
      const sag = this.sag.process(x, this.attack, this.release)
      ctx.sag[i] = sag

      let g = 1 / (1 + amt * 4 * sag)
      if (
        amt > 0 &&
        this.dropRemaining <= 0 &&
        this.dropFault.roll(dropProb * (1 + sag), cluster, this.rng)
      ) {
        this.dropRemaining = Math.floor(
          (0.01 + this.rng() * 0.08) * this.sr * (1 + sag),
        )
      }
      if (this.dropRemaining > 0) {
        this.dropRemaining--
        g *= 0.03
      }

      const crackle =
        crackleAmt > 0 && this.crackleFault.roll(sag * 0.3, cluster, this.rng)
          ? (this.rng() * 2 - 1) * crackleAmt
          : 0

      // ground loop: mains fundamental plus rectifier buzz, louder as the
      // supply strains, with a ripple wobble in the rail gain itself
      let hum = 0
      if (humLevel > 0) {
        const s = this.hum.step(humK)
        const buzz = Math.abs(s) * 2 - 1
        hum = (s * 0.55 + buzz * 0.45) * humLevel * 0.25 * (1 + sag * 2.5)
        g *= 1 - humLevel * 0.25 * (0.5 + 0.5 * s) * (amt > 0 ? 1 : 0.4)
      }

      io.l[i] = io.l[i]! * g + crackle + hum
      io.r[i] = io.r[i]! * g + crackle + hum
    }
  }

  panic() {
    this.sag.reset()
    this.dropRemaining = 0
    this.hum.reset()
    this.dropFault.reset()
    this.crackleFault.reset()
  }
}
