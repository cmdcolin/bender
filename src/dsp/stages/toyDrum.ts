import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { mulberry32, type Rng } from '../util/rng'

// 16 steps; bit 1 = kick, 2 = snare, 4 = hat.
const PATTERNS: number[][] = [
  // rock
  [1, 0, 4, 0, 2, 0, 4, 0, 1, 0, 4, 1, 2, 0, 4, 0],
  // disco
  [1, 0, 4, 4, 1, 2, 4, 4, 1, 0, 4, 4, 1, 2, 4, 4],
  // bossa
  [1, 0, 4, 1, 0, 4, 1, 0, 4, 0, 1, 4, 0, 1, 4, 0],
  // fill
  [1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2],
]

export class ToyDrum implements Stage {
  label = 'toyDrum'
  private stepClock = 0
  private pos = 0
  private retrigPhase = 0
  private kickPhase = 0
  private kickEnv = 0
  private snareEnv = 0
  private hatEnv = 0
  private snareLp = 0
  private lastReboot = 0
  private rng: Rng

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly transport: Transport,
  ) {
    this.rng = mulberry32(202)
  }

  when(p: Float32Array) {
    const on = p[IDX.drumLevel]! > 0
    if (!on) this.rail.reported = 0
    return on
  }

  private trigger(bits: number) {
    if (bits & 1) {
      this.kickEnv = 1
      this.kickPhase = 0
    }
    if (bits & 2) this.snareEnv = 1
    if (bits & 4) this.hatEnv = 1
  }

  process(io: StereoBlock, p: Float32Array, _ctx: Ctx) {
    const level = p[IDX.drumLevel]!
    const pattern = PATTERNS[Math.round(p[IDX.drumPattern]!)] ?? PATTERNS[0]!
    const stepHz = (p[IDX.drumBpm]! / 60) * 4
    const retrigHz = p[IDX.drumRetrigHz]!
    const rail = this.rail

    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.pos = 0
      this.stepClock = 0
    }

    let loadSum = 0
    for (let i = 0; i < io.n; i++) {
      if (this.transport.playing) {
        this.stepClock += stepHz / this.sr
        if (this.stepClock >= 1) {
          this.stepClock -= 1
          this.pos = (this.pos + 1) % pattern.length
          this.trigger(pattern[this.pos]!)
        }
      }
      // the bend: hammer the current step's trigger line at audio rate
      if (this.transport.playing && retrigHz > 0.5) {
        this.retrigPhase += retrigHz / this.sr
        if (this.retrigPhase >= 1) {
          this.retrigPhase -= 1
          this.trigger(pattern[this.pos]! || 1)
        }
      }

      let out = 0
      if (!rail.booting) {
        const pf = rail.pitchFactor
        if (this.kickEnv > 0.002) {
          const hz = (40 + 90 * this.kickEnv * this.kickEnv) * pf
          this.kickPhase = (this.kickPhase + hz / this.sr) % 1
          out += Math.sin(this.kickPhase * 2 * Math.PI) * this.kickEnv * 1.2
          this.kickEnv *= Math.exp(-9 / this.sr)
        }
        if (this.snareEnv > 0.002) {
          const noise = this.rng() * 2 - 1
          this.snareLp += 0.25 * (noise - this.snareLp)
          out += (noise - this.snareLp * 0.5) * this.snareEnv * 0.8
          this.snareEnv *= Math.exp(-22 / this.sr)
        }
        if (this.hatEnv > 0.002) {
          const noise = this.rng() * 2 - 1
          out += (noise - this.snareLp) * this.hatEnv * 0.35
          this.hatEnv *= Math.exp(-60 / this.sr)
        }
        // one cheap DAC for the whole kit
        out = Math.round(out * 64) / 64
        out *= rail.ampFactor
      }

      out *= level * 0.6
      loadSum += Math.abs(out)
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.reported = loadSum / io.n
  }

  panic() {
    this.kickEnv = 0
    this.snareEnv = 0
    this.hatEnv = 0
    this.snareLp = 0
  }
}
