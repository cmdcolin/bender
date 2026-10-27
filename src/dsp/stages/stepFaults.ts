import {
  asEvent,
  asEventEvery,
  EVENT,
  EVENT_EVERY,
  EVENT_KEYS,
  STEPS,
} from '../../drums.ts'
import { IDX } from '../../engine/params.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'
import type { TriggerBus } from '../trigbus.ts'

const EVENT_IDX = EVENT_KEYS.map(k => IDX[k])
const BUFFER_S = 4
const SEAM_S = 0.0015
const BRAKE_STOP = 0.9
const WINDOW = 32
// A held throw has no end the stage can see, so it shapes itself to a beat:
// the brake stops in one and stays stopped while the key is down.
const LIVE_RUN = 4

interface Voice {
  event: number
  t: number
  len: number
  step: number
  start: number
  lag: number
}

/** The fault on the kit's step `tick`, as the trigger bus carries it: one past
    the counter. A held fault throw wins over the row; a row set to fire every
    few bars fires on the last of them; Wander's fault fills a bar the row
    leaves empty. */
export function eventOn(
  p: Float32Array,
  tick: number,
  trig?: TriggerBus,
): number {
  const live = asEvent(p[IDX.drumEventLive]!)
  if (live !== 0) return live
  const every = EVENT_EVERY[asEventEvery(p[IDX.drumEventEvery]!)]!
  const bar = Math.floor((tick - 1) / STEPS)
  const col = (tick - 1) % STEPS
  const set = (bar + 1) % every === 0 ? asEvent(p[EVENT_IDX[col]!]!) : 0
  if (set !== 0 || !trig || trig.wanderBar !== bar) return set
  return trig.wanderEvents[col]!
}

/** How many steps from `tick` on carry the same fault, so a run plays as one. */
function runOf(
  p: Float32Array,
  tick: number,
  event: number,
  trig: TriggerBus,
): number {
  if (asEvent(p[IDX.drumEventLive]!) !== 0) return LIVE_RUN
  let n = 1
  while (n < STEPS && eventOn(p, tick + n, trig) === event) n++
  return n
}

const idle = (): Voice => ({
  event: 0,
  t: 0,
  len: 0,
  step: 0,
  start: 0,
  lag: 0,
})

// The kit's event row on the whole mix, past the tape: a knife through the
// output lead, a tape brake, a glitch freeze. Each fault lands on the strobe
// and lasts its step, or the whole run when the steps after it carry the same
// fault. The drop and reboot steps act on the rail, in Supplies.
export class StepFaults implements Stage {
  label = 'stepFaults'
  private readonly bufL: Float32Array
  private readonly bufR: Float32Array
  private readonly size: number
  private readonly seamLen: number
  private readonly sr: number
  private w = 0
  private cur = idle()
  private old = idle()
  private seam = 0
  private outL = 0
  private outR = 0

  constructor(sr: number) {
    this.sr = sr
    this.size = Math.ceil(sr * BUFFER_S)
    this.bufL = new Float32Array(this.size)
    this.bufR = new Float32Array(this.size)
    this.seamLen = Math.max(1, Math.round(sr * SEAM_S))
  }

  when(p: Float32Array) {
    if (this.cur.event !== 0 || this.seam > 0) return true
    if (p[IDX.drumEventLive]! !== 0) return true
    if (p[IDX.drumWander]! !== 0) return true
    for (const idx of EVENT_IDX) if (p[idx]! !== 0) return true
    return false
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const steps = ctx.trig.stepNow
    const len = Math.min(
      ctx.trig.stepLenNow > 0 ? ctx.trig.stepLenNow : this.sr / 8,
      this.size - 1,
    )
    for (let i = 0; i < io.n; i++) {
      const tick = steps[i]!
      if (tick > 0) {
        const event = eventOn(p, tick, ctx.trig)
        const joins =
          event !== 0 && event === this.cur.event && this.cur.t < this.cur.len
        if (!joins && (event !== 0 || this.cur.event !== 0))
          this.begin(event, len, runOf(p, tick, event, ctx.trig))
      } else if (this.cur.event !== 0 && this.cur.t >= this.cur.len) {
        this.begin(0, 0, 1)
      }

      const l = io.l[i]!
      const r = io.r[i]!
      this.bufL[this.w] = l
      this.bufR[this.w] = r

      this.render(this.cur, l, r)
      if (this.seam > 0) {
        const curL = this.outL
        const curR = this.outR
        this.render(this.old, l, r)
        const x = 1 - this.seam / this.seamLen
        io.l[i] = this.outL + (curL - this.outL) * x
        io.r[i] = this.outR + (curR - this.outR) * x
        this.seam--
      } else {
        io.l[i] = this.outL
        io.r[i] = this.outR
      }
      this.w = (this.w + 1) % this.size
    }
  }

  private begin(event: number, len: number, run: number) {
    const was = this.old
    this.old = this.cur
    was.event = event
    was.t = 0
    was.len = Math.min(len * run, this.size - 1)
    was.step = len
    was.start = this.w
    was.lag = 0
    this.cur = was
    this.seam = this.seamLen
  }

  private render(v: Voice, l: number, r: number) {
    let gain = 1
    let at = Number.NaN
    if (v.event === EVENT.cut) gain = 0
    else if (v.event === EVENT.brake) {
      const speed = Math.max(0, 1 - v.t / (v.len * BRAKE_STOP))
      v.lag += 1 - speed
      at = this.w - v.lag
      gain = Math.sqrt(speed)
    } else if (v.event === EVENT.freeze) {
      // Each step of a run loops half as much of the run's first step as the
      // step before, so a run rolls faster and faster into a buzz.
      const k = Math.floor(v.t / v.step)
      const slice = Math.max(Math.round(v.step / 2 ** (k + 1)), WINDOW * 2)
      if (v.t >= slice) {
        const phase = (v.t - k * v.step) % slice
        at = v.start + phase
        gain = Math.min(1, phase / WINDOW, (slice - phase) / WINDOW)
      }
    }
    v.t++
    if (Number.isNaN(at)) {
      this.outL = l * gain
      this.outR = r * gain
      return
    }
    const pos = ((at % this.size) + this.size) % this.size
    const i0 = Math.floor(pos)
    const i1 = (i0 + 1) % this.size
    const f = pos - i0
    this.outL = (this.bufL[i0]! + (this.bufL[i1]! - this.bufL[i0]!) * f) * gain
    this.outR = (this.bufR[i0]! + (this.bufR[i1]! - this.bufR[i0]!) * f) * gain
  }

  panic() {
    this.bufL.fill(0)
    this.bufR.fill(0)
    this.cur = idle()
    this.old = idle()
    this.seam = 0
  }
}
