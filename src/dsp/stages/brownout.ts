import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { flushDenormal } from '../util/softclip'
import { Burst } from '../util/burst'
import { mulberry32, type Rng } from '../util/rng'

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
  private sag = 0
  private dropRemaining = 0
  private humPhase = 0
  private rng: Rng
  private dropFault: Burst
  private crackleFault: Burst

  constructor(
    private readonly sr: number,
    seed = 707,
  ) {
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
    const humHz = Math.round(p[IDX.humHz]!) === 1 ? 60 : 50
    const cluster = p[IDX.faultCluster]!
    const couple = p[IDX.couple]!
    const attack = 1 - Math.exp(-1 / (0.02 * this.sr))
    const release = 1 - Math.exp(-1 / (0.4 * this.sr))

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
      const coef = x > this.sag ? attack : release
      this.sag = flushDenormal(this.sag + coef * (x - this.sag))
      ctx.sag[i] = this.sag

      let g = 1 / (1 + amt * 4 * this.sag)
      if (
        amt > 0 &&
        this.dropRemaining <= 0 &&
        this.dropFault.roll(dropProb * (1 + this.sag), cluster, this.rng)
      ) {
        this.dropRemaining = Math.floor(
          (0.01 + this.rng() * 0.08) * this.sr * (1 + this.sag),
        )
      }
      if (this.dropRemaining > 0) {
        this.dropRemaining--
        g *= 0.03
      }

      const crackle =
        crackleAmt > 0 &&
        this.crackleFault.roll(this.sag * 0.3, cluster, this.rng)
          ? (this.rng() * 2 - 1) * crackleAmt
          : 0

      // ground loop: mains fundamental plus rectifier buzz, louder as the
      // supply strains, with a ripple wobble in the rail gain itself
      let hum = 0
      if (humLevel > 0) {
        this.humPhase = (this.humPhase + humHz / this.sr) % 1
        const s = Math.sin(this.humPhase * 2 * Math.PI)
        const buzz = Math.abs(s) * 2 - 1
        hum = (s * 0.55 + buzz * 0.45) * humLevel * 0.25 * (1 + this.sag * 2.5)
        g *= 1 - humLevel * 0.25 * (0.5 + 0.5 * s) * (amt > 0 ? 1 : 0.4)
      }

      io.l[i] = io.l[i]! * g + crackle + hum
      io.r[i] = io.r[i]! * g + crackle + hum
    }
  }

  panic() {
    this.sag = 0
    this.dropRemaining = 0
    this.humPhase = 0
    this.dropFault.reset()
    this.crackleFault.reset()
  }
}
