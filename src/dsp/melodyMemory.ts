import { IDX } from '../engine/params.ts'
import { asTuneLen, HOLD, isNote } from '../tune.ts'
import { SupplyTap, type Supplies } from './supplies.ts'

import type { Ctx } from './stage.ts'
import type { Transport } from './transport.ts'

const NO_STEP = -1000

export const MEMORY_SYNC_MODES = [
  'off',
  'sixteenths',
  'eighths',
  'dotted eighths',
  'quarters',
]
const MEMORY_SYNC_STEPS = [0, 1, 2, 3, 4]

// The second melody: a 32-step memory with a counter of its own, clocked off the
// toy's supply so it sags and stalls with the rest of the board. Its notes ride
// their own line on the trigger bus, and the control named Plays on decides which
// machine has that line soldered to its key input.
export class MelodyMemory {
  private pos = 0
  private clock = 1
  private fresh = true
  private stepSamples = 0

  /** Where the counter is standing, for the roll's playhead and the quantizer. */
  at = 0
  /** How far through that step it has got, 0 to 1. */
  get frac() {
    return Math.min(this.clock, 1)
  }
  stepMs = 0

  private readonly sr: number
  private readonly power: SupplyTap
  private readonly transport: Transport

  constructor(sr: number, supplies: Supplies, transport: Transport) {
    this.sr = sr
    this.power = new SupplyTap(supplies)
    this.transport = transport
  }

  private tick(rate: number, len: number, p: Float32Array): number {
    this.clock += rate / this.sr
    if (this.clock < 1) return NO_STEP
    this.clock -= 1
    return this.advance(rate, len, p)
  }

  // Steps when the kit's counter steps, so swing, a slipping clock and a
  // cleared counter reach the melody.
  private clocked(
    at: number,
    every: number,
    rate: number,
    len: number,
    p: Float32Array,
  ): number {
    this.clock = Math.min(this.clock + rate / this.sr, 1)
    if (at === 0 || (at - 1) % every !== 0) return NO_STEP
    this.clock = 0
    return this.advance(rate, len, p)
  }

  private advance(rate: number, len: number, p: Float32Array): number {
    this.pos = this.fresh ? 0 : (this.pos + 1) % len
    this.fresh = false
    this.at = this.pos
    this.stepSamples = this.sr / rate
    this.stepMs = 1000 / rate
    return p[IDX.monoSeqStep0 + this.pos]!
  }

  // A held step carries the note across, so the span runs to the next note.
  private run(len: number, p: Float32Array): number {
    let n = 1
    for (let k = this.pos + 1; k < len; k++) {
      if (p[IDX.monoSeqStep0 + k] !== HOLD) break
      n++
    }
    return n
  }

  process(n: number, p: Float32Array, ctx: Ctx) {
    const rail = this.power.pick(p[IDX.monoSupply]!)
    if (this.power.rebooted()) {
      this.fresh = true
    }
    const running =
      p[IDX.monoSeqOn]! > 0.5 &&
      this.transport.tune &&
      !rail.booting &&
      !rail.latched &&
      !rail.dead
    if (!running) {
      this.fresh = true
      this.clock = 1
      return
    }
    const len = asTuneLen(p[IDX.monoSeqLen]!)
    const every = MEMORY_SYNC_STEPS[Math.round(p[IDX.monoSeqSync]!)] ?? 0
    const kitHz = ctx.trig.kitStepHz
    const rate = every
      ? Math.max(kitHz / every, 0.01)
      : Math.max(p[IDX.monoSeqRate]!, 0.01) * rail.clockFactor
    for (let i = 0; i < n; i++) {
      const step = every
        ? this.clocked(ctx.trig.drumStep[i]!, every, rate, len, p)
        : this.tick(rate, len, p)
      if (step === NO_STEP || !isNote(step)) continue
      ctx.trig.seqStruck(i, step, this.stepSamples * this.run(len, p))
    }
  }

  panic() {
    this.fresh = true
    this.clock = 1
  }
}
