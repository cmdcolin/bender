import { IDX } from '../engine/params'
import { DEST, ModBus } from './modbus'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from './stage'
import { Follower, coef } from './util/follower'
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
  private outEnv = new Follower()
  private limitEnv = 0
  // The six slot params, read once a block into a buffer this owns, and one bit
  // per bend id for the duplicates. Nothing in process() allocates: a Set and a
  // spread per block is 375 collections a second on the audio thread.
  private readonly slots = new Float32Array(6)

  sources: Stage[] = []
  bendById: (Stage | undefined)[] = []
  pedals: Stage[] = []
  post: Stage[] = []

  constructor(readonly sr: number) {
    this.ctx = {
      sr,
      mic: new Float32Array(BLOCK),
      fb: new Float32Array(BLOCK),
      railV: new Float32Array(BLOCK).fill(1),
      sag: new Float32Array(BLOCK),
      droop: new Float32Array(BLOCK),
      env: new Float32Array(BLOCK),
      step: new Float32Array(BLOCK),
      mod: new ModBus(sr),
    }
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
    this.outEnv.reset()
    this.ctx.mod.panic()
    this.ctx.railV.fill(1)
    this.ctx.sag.fill(0)
    this.ctx.droop.fill(0)
    this.ctx.env.fill(0)
    this.ctx.step.fill(0)
    this.limitEnv = 0
  }

  process(io: StereoBlock, p: Float32Array, mic?: Float32Array) {
    const { n } = io
    const ctx = this.ctx

    const micLevel = p[IDX.micLevel]!
    for (let i = 0; i < n; i++) ctx.mic[i] = micLevel * (mic?.[i] ?? 0)

    // Supply droop and the mod lanes are built from last block's buses, then
    // the supplies are handed back to whoever owns them at their stock values.
    for (let i = 0; i < n; i++) {
      ctx.fb[i] = 0.5 * (this.fbRetL[i]! + this.fbRetR[i]!)
      ctx.droop[i] = Math.min(Math.max(1 - ctx.railV[i]!, ctx.sag[i]!), 1)
    }
    ctx.mod.build(n, p, ctx)
    ctx.railV.fill(1, 0, n)
    ctx.sag.fill(0, 0, n)
    ctx.step.fill(0, 0, n)

    io.l.fill(0, 0, n)
    io.r.fill(0, 0, n)
    const fbDest = Math.round(p[IDX.fbDest]!)
    if (fbDest === 0) {
      for (let i = 0; i < n; i++) {
        io.l[i] = this.fbRetL[i]!
        io.r[i] = this.fbRetR[i]!
      }
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

    const slots = this.slots
    slots[0] = p[IDX.bendSlot0]!
    slots[1] = p[IDX.bendSlot1]!
    slots[2] = p[IDX.bendSlot2]!
    slots[3] = p[IDX.bendSlot3]!
    slots[4] = p[IDX.bendSlot4]!
    slots[5] = p[IDX.bendSlot5]!
    let seen = 0
    for (let i = 0; i < slots.length; i++) {
      const id = Math.round(slots[i]!)
      if (id <= 0 || seen & (1 << id)) continue
      seen |= 1 << id
      const s = this.bendById[id]
      if (s && (!s.when || s.when(p))) s.process(io, p, ctx)
    }

    for (const s of this.pedals) {
      if (!s.when || s.when(p)) s.process(io, p, ctx)
    }
    for (const s of this.post) {
      if (!s.when || s.when(p)) s.process(io, p, ctx)
    }

    const gain = Math.pow(10, p[IDX.outGain]! / 20)
    const dcCoef = 1 - (2 * Math.PI * 10) / this.sr
    const envA = coef(0.005, this.sr)
    const envR = coef(0.08, this.sr)
    for (let i = 0; i < n; i++) {
      const l = softclip(this.dcL.process(io.l[i]! * gain, dcCoef))
      const r = softclip(this.dcR.process(io.r[i]! * gain, dcCoef))
      io.l[i] = l
      io.r[i] = r
      ctx.env[i] = this.outEnv.process(
        Math.max(Math.abs(l), Math.abs(r)),
        envA,
        envR,
      )
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
    const base = p[IDX.fbAmt]!
    const modAmt = this.ctx.mod.read(DEST.fbAmt)
    if (base <= 0 && !modAmt) {
      this.fbRetL.fill(0)
      this.fbRetR.fill(0)
      return
    }
    const tilt = p[IDX.fbTone]!
    const tiltCoef = lpCoef(800, this.sr)
    const combDelay = Math.max((p[IDX.fbDelayMs]! / 1000) * this.sr, 1)
    for (let i = 0; i < n; i++) {
      const amt = modAmt
        ? Math.min(Math.max(base + modAmt[i]! * 1.5, 0), 1.5)
        : base
      const combG = Math.min(amt, 1.05)
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
