import { asEvent, EVENT, EVENT_KEYS, STEPS } from '../../drums.ts'
import { IDX } from '../../engine/params.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

const EVENT_IDX = EVENT_KEYS.map(k => IDX[k])
const BUFFER_S = 4
const SEAM_S = 0.0015
const BRAKE_STOP = 0.9
const FREEZE_SLICES = 4
const WINDOW = 32

interface Voice {
  event: number
  t: number
  len: number
  start: number
  lag: number
}

const idle = (): Voice => ({ event: 0, t: 0, len: 0, start: 0, lag: 0 })

// The kit's event row on the whole mix, past the tape: a knife through the
// output lead, a tape brake, a glitch freeze. Each fault lasts its step and
// lands on the strobe; the drop and reboot steps act on the rail, in Supplies.
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
        const event = asEvent(p[EVENT_IDX[(tick - 1) % STEPS]!]!)
        if (event !== 0 || this.cur.event !== 0) this.begin(event, len)
      } else if (this.cur.event !== 0 && this.cur.t >= this.cur.len) {
        this.begin(0, 0)
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

  private begin(event: number, len: number) {
    const was = this.old
    this.old = this.cur
    was.event = event
    was.t = 0
    was.len = len
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
      const slice = Math.max(Math.round(v.len / FREEZE_SLICES), WINDOW * 2)
      if (v.t >= slice) {
        const k = v.t % slice
        at = v.start + k
        gain = Math.min(1, k / WINDOW, (slice - k) / WINDOW)
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
