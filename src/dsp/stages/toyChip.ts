import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import { mulberry32, type Rng } from '../util/rng'

// Semitone offsets from A4-ish base; -1 is a rest.
const TUNES: number[][] = [
  // lullaby
  [0, 0, 7, 7, 9, 9, 7, -1, 5, 5, 4, 4, 2, 2, 0, -1],
  // march
  [0, -1, 0, 4, 7, -1, 7, 4, 0, 4, 7, 12, 7, 4, 0, -1],
  // arp
  [0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 16, 12, 7, 4, 0, 4],
  // demo
  [0, 2, 4, 5, 7, 9, 11, 12, 12, 11, 9, 7, 5, 4, 2, 0],
]

const BASE_HZ = 220
const STEP_HZ = 3.2

export class ToyChip implements Stage {
  label = 'toyChip'
  private phase = 0
  private keyPhase = 0
  private pos = 0
  private stepClock = 0
  private env = 0
  private keyEnv = 0
  private keyNote = -1
  private gateState = 1
  private gateClock = 0
  private clockWalk = 0
  private lastReboot = 0
  private rng: Rng

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
  ) {
    this.rng = mulberry32(101)
  }

  noteOn(semitone: number) {
    this.keyNote = semitone
    this.keyEnv = 1
  }

  noteOff(semitone: number) {
    if (this.keyNote === semitone) this.keyNote = -1
  }

  // Also true when only the drums play: this stage owns the shared rail tick.
  when(p: Float32Array) {
    return p[IDX.chipLevel]! > 0 || p[IDX.drumLevel]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.chipLevel]!
    const tune = TUNES[Math.round(p[IDX.chipTune]!)] ?? TUNES[0]!
    const clockX = p[IDX.chipClockX]!
    const starve = p[IDX.chipStarve]!
    const spot = Math.round(p[IDX.chipBendSpot]!)
    const pot = p[IDX.chipBendPot]!
    const micToRail = p[IDX.micPatch] === 1
    const rail = this.rail

    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.pos = 0
      this.stepClock = 0
      this.env = 0
    }

    for (let i = 0; i < io.n; i++) {
      // clock bend: the pot shorts the RC — wildly fast and unstable
      let clock = clockX
      if (spot === 1 && pot > 0) {
        this.clockWalk += (this.rng() - 0.5) * pot * 0.2
        this.clockWalk *= 0.999
        clock *= 1 + pot * 24 * (1 + 0.4 * Math.sin(this.clockWalk))
      }

      // sequencer
      this.stepClock += (STEP_HZ * clock) / this.sr
      if (this.stepClock >= 1) {
        this.stepClock -= 1
        let next = this.pos + 1
        // counter bend: program counter corruption
        if (spot === 2 && this.rng() < pot * 0.7) {
          next = this.rng() < 0.5 ? this.pos : Math.floor(this.rng() * tune.length)
        }
        this.pos = next % tune.length
        this.env = tune[this.pos]! >= 0 ? 1 : this.env
      }

      // gate bend: the gate line buzzes open and shut
      if (spot === 4 && pot > 0) {
        this.gateClock += ((30 + pot * 400) * (0.5 + this.rng())) / this.sr
        if (this.gateClock >= 1) {
          this.gateClock -= 1
          this.gateState = this.rng() < 0.5 + pot * 0.3 ? 1 - this.gateState : this.gateState
        }
      } else {
        this.gateState = 1
      }

      const envDecay = Math.exp(-(2.5 * clock) / this.sr)
      this.env *= envDecay
      this.keyEnv = this.keyNote >= 0 ? 1 : this.keyEnv * envDecay

      let out = 0
      if (!rail.booting && !(starve > 0 && rail.stalled)) {
        // bias bend shifts the square's duty cycle
        const duty = spot === 3 ? 0.5 + pot * 0.45 : 0.5
        const note = tune[this.pos]!
        if (note >= 0 && this.env > 0.003) {
          const hz = BASE_HZ * Math.pow(2, note / 12) * clock * rail.pitchFactor
          this.phase = (this.phase + hz / this.sr) % 1
          out += (this.phase < duty ? 1 : -1) * this.env
        }
        if (this.keyEnv > 0.003 && this.keyNote >= 0) {
          const hz = BASE_HZ * Math.pow(2, this.keyNote / 12) * clock * rail.pitchFactor
          this.keyPhase = (this.keyPhase + hz / this.sr) % 1
          out += (this.keyPhase < duty ? 1 : -1) * this.keyEnv
        }
        out *= this.gateState * rail.ampFactor
        if (spot === 3) out += pot * 0.4
      }

      out *= level * 0.4
      rail.tick(Math.abs(out), starve, micToRail ? Math.abs(ctx.mic[i]!) * 2 : 0)
      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.phase = 0
    this.keyPhase = 0
    this.env = 0
    this.keyEnv = 0
    this.rail.reset()
  }
}
