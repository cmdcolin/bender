import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { mulberry32, type Rng } from '../util/rng'
import { ROMS } from './roms'

const BASE_HZ = 220

export class ToyChip implements Stage {
  label = 'toyChip'
  private phase = 0
  private keyPhase = 0
  private pos = 0
  private note = -1
  private stepClock = 0
  private env = 0
  private keyEnv = 0
  private keyNote = -1
  private gateState = 1
  private gateClock = 0
  private clockWalk = 0
  private lastReboot = 0
  private wasPlaying = false
  private rng: Rng

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly transport: Transport,
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

  private restart(tune: number[]) {
    this.pos = 0
    this.stepClock = 0
    const step = tune[0]!
    this.note = step >= 0 ? step : -1
    this.env = step >= 0 ? 1 : 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.chipLevel]!
    const rom = ROMS[Math.round(p[IDX.chipTune]!)] ?? ROMS[0]!
    const tune = rom.steps
    const clockX = p[IDX.chipClockX]!
    const starve = p[IDX.chipStarve]!
    const spot = Math.round(p[IDX.chipBendSpot]!)
    const pot = p[IDX.chipBendPot]!
    const micToRail = p[IDX.micPatch] === 1
    const fbToRail = Math.round(p[IDX.fbDest]!) === 2
    const modClock = ctx.mod.read(DEST.chipClock)
    const rail = this.rail
    const maxHz = this.sr * 0.49

    // a reboot, and pressing play, both drop the needle on step 0
    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.restart(tune)
    }
    if (this.transport.playing !== this.wasPlaying) {
      this.wasPlaying = this.transport.playing
      if (this.wasPlaying) this.restart(tune)
    }

    for (let i = 0; i < io.n; i++) {
      // clock bend: the pot shorts the RC — wildly fast and unstable
      let clock = clockX
      if (spot === 1 && pot > 0) {
        this.clockWalk += (this.rng() - 0.5) * pot * 0.2
        this.clockWalk *= 0.999
        clock *= 1 + pot * 24 * (1 + 0.4 * Math.sin(this.clockWalk))
      }
      if (modClock) clock *= Math.pow(2, modClock[i]! * 3)

      // sequencer — the run/stop line freezes it where it stands
      if (this.transport.playing) this.stepClock += (rom.stepHz * clock) / this.sr
      if (this.stepClock >= 1) {
        this.stepClock -= 1
        let next = this.pos + 1
        // counter bend: program counter corruption
        if (spot === 2 && this.rng() < pot * 0.7) {
          next = this.rng() < 0.5 ? this.pos : Math.floor(this.rng() * tune.length)
        }
        this.pos = next % tune.length
        // -2 holds whatever is ringing; -1 drops the voice; anything else strikes
        const step = tune[this.pos]!
        if (step >= 0) {
          this.note = step
          this.env = 1
        } else if (step === -1) {
          this.note = -1
        }
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

      // one envelope generator, timed off the ROM's own step rate the way a
      // cheap chip ties decay to its tempo clock
      const envDecay = Math.exp(-(0.8 * rom.stepHz * clock) / this.sr)
      this.env *= envDecay
      this.keyEnv = this.keyNote >= 0 ? 1 : this.keyEnv * envDecay

      let out = 0
      if (!rail.booting && !(starve > 0 && rail.stalled)) {
        // bias bend shifts the square's duty cycle
        const duty = spot === 3 ? 0.5 + pot * 0.45 : 0.5
        const note = this.transport.playing ? this.note : -1
        if (note >= 0 && this.env > 0.003) {
          const hz = Math.min(BASE_HZ * Math.pow(2, note / 12) * clock * rail.pitchFactor, maxHz)
          this.phase = (this.phase + hz / this.sr) % 1
          out += (this.phase < duty ? 1 : -1) * this.env
        }
        if (this.keyEnv > 0.003 && this.keyNote >= 0) {
          const hz = Math.min(
            BASE_HZ * Math.pow(2, this.keyNote / 12) * clock * rail.pitchFactor,
            maxHz,
          )
          this.keyPhase = (this.keyPhase + hz / this.sr) % 1
          out += (this.keyPhase < duty ? 1 : -1) * this.keyEnv
        }
        out *= this.gateState * rail.ampFactor
        if (spot === 3) out += pot * 0.4
      }

      out *= level * 0.4
      const extra =
        (micToRail ? Math.abs(ctx.mic[i]!) * 2 : 0) + (fbToRail ? Math.abs(ctx.fb[i]!) * 2 : 0)
      rail.tick(Math.abs(out), starve, extra)
      ctx.railV[i] = rail.v
      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.note = -1
    this.phase = 0
    this.keyPhase = 0
    this.env = 0
    this.keyEnv = 0
    this.rail.reset()
  }
}
