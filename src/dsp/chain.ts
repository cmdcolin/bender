import { IDX } from '../engine/params'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from './stage'
import { DcBlocker, OnePoleLP, lpCoef } from './util/onepole'
import { flushDenormal, softclip } from './util/softclip'
import { DelayLine } from './util/delayline'

const LIMIT_CEIL = 0.891 // −1 dBFS

// The full signal path in one place: sources sum (plus feedback return and
// mic), reorderable bend slots, fixed pedals, brownout, then the always-on
// safety tail: dc block → softclip → feedback tap → limiter.
export class Chain {
  private readonly ctx: Ctx
  private readonly fbRetL = new Float32Array(BLOCK)
  private readonly fbRetR = new Float32Array(BLOCK)
  private readonly dcL = new DcBlocker()
  private readonly dcR = new DcBlocker()
  private readonly fbTiltLpL = new OnePoleLP()
  private readonly fbTiltLpR = new OnePoleLP()
  private fbCombL: DelayLine
  private fbCombR: DelayLine
  private limitEnv = 0

  sources: Stage[] = []
  bendById: (Stage | undefined)[] = []
  pedals: Stage[] = []
  post: Stage[] = []

  constructor(readonly sr: number) {
    this.ctx = { sr, mic: new Float32Array(BLOCK) }
    this.fbCombL = new DelayLine(0.5 * sr + 4)
    this.fbCombR = new DelayLine(0.5 * sr + 4)
  }

  private allStages(): Stage[] {
    return [
      ...this.sources,
      ...(this.bendById.filter(Boolean) as Stage[]),
      ...this.pedals,
      ...this.post,
    ]
  }

  panic() {
    for (const s of this.allStages()) s.panic()
    this.fbRetL.fill(0)
    this.fbRetR.fill(0)
    this.dcL.reset()
    this.dcR.reset()
    this.fbTiltLpL.reset()
    this.fbTiltLpR.reset()
    this.fbCombL.reset()
    this.fbCombR.reset()
    this.limitEnv = 0
  }

  process(io: StereoBlock, p: Float32Array, mic?: Float32Array) {
    const { n } = io
    const ctx = this.ctx

    const micLevel = p[IDX.micLevel]!
    for (let i = 0; i < n; i++) ctx.mic[i] = micLevel * (mic?.[i] ?? 0)

    io.l.fill(0, 0, n)
    io.r.fill(0, 0, n)
    for (let i = 0; i < n; i++) {
      io.l[i] = this.fbRetL[i]!
      io.r[i] = this.fbRetR[i]!
    }
    if (p[IDX.micPatch] === 0) {
      for (let i = 0; i < n; i++) {
        io.l[i]! += ctx.mic[i]!
        io.r[i]! += ctx.mic[i]!
      }
    }

    for (const s of this.sources) {
      if (!s.when || s.when(p)) s.process(io, p, ctx)
    }

    const seen = new Set<number>()
    for (const slot of [
      p[IDX.bendSlot0]!,
      p[IDX.bendSlot1]!,
      p[IDX.bendSlot2]!,
      p[IDX.bendSlot3]!,
      p[IDX.bendSlot4]!,
    ]) {
      const id = Math.round(slot)
      if (id <= 0 || seen.has(id)) continue
      seen.add(id)
      const s = this.bendById[id]
      if (s && (!s.when || s.when(p))) s.process(io, p, ctx)
    }

    for (const s of [...this.pedals, ...this.post]) {
      if (!s.when || s.when(p)) s.process(io, p, ctx)
    }

    const gain = Math.pow(10, p[IDX.outGain]! / 20)
    const dcCoef = 1 - (2 * Math.PI * 10) / this.sr
    for (let i = 0; i < n; i++) {
      io.l[i] = softclip(this.dcL.process(io.l[i]! * gain, dcCoef))
      io.r[i] = softclip(this.dcR.process(io.r[i]! * gain, dcCoef))
    }

    this.computeFeedback(io, p)

    const rel = Math.exp(-1 / (0.1 * this.sr))
    for (let i = 0; i < n; i++) {
      const peak = Math.max(Math.abs(io.l[i]!), Math.abs(io.r[i]!))
      this.limitEnv = flushDenormal(Math.max(peak, this.limitEnv * rel))
      const g = this.limitEnv > LIMIT_CEIL ? LIMIT_CEIL / this.limitEnv : 1
      io.l[i]! *= g
      io.r[i]! *= g
    }

    if (
      !Number.isFinite(io.l[0]!) ||
      !Number.isFinite(io.l[n - 1]!) ||
      !Number.isFinite(io.r[0]!) ||
      !Number.isFinite(this.fbRetL[0]!)
    ) {
      this.panic()
      io.l.fill(0, 0, n)
      io.r.fill(0, 0, n)
    }
  }

  // Post-softclip tap → gain → tilt → per-sample saturated comb → next block's
  // return. The comb is where kHz mixer squeal lives; the block-rate global
  // loop alone is too slow for it.
  private computeFeedback(io: StereoBlock, p: Float32Array) {
    const { n } = io
    const amt = p[IDX.fbAmt]!
    if (amt <= 0) {
      this.fbRetL.fill(0)
      this.fbRetR.fill(0)
      return
    }
    const tilt = p[IDX.fbTone]!
    const tiltCoef = lpCoef(800, this.sr)
    const combDelay = Math.max((p[IDX.fbDelayMs]! / 1000) * this.sr, 1)
    const combG = Math.min(amt, 1.05)
    for (let i = 0; i < n; i++) {
      let xl = io.l[i]! * amt
      let xr = io.r[i]! * amt
      const lpL = this.fbTiltLpL.process(xl, tiltCoef)
      const lpR = this.fbTiltLpR.process(xr, tiltCoef)
      if (tilt > 0) {
        xl += tilt * (xl - 2 * lpL)
        xr += tilt * (xr - 2 * lpR)
      } else if (tilt < 0) {
        xl += -tilt * (2 * lpL - xl)
        xr += -tilt * (2 * lpR - xr)
      }
      const wl = softclip(xl + combG * this.fbCombL.read(combDelay))
      const wr = softclip(xr + combG * this.fbCombR.read(combDelay))
      this.fbCombL.write(wl)
      this.fbCombR.write(wr)
      this.fbRetL[i] = wl
      this.fbRetR[i] = wr
    }
  }
}
