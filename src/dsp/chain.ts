import { IDX } from '../engine/params'
import { DEST, ModBus } from './modbus'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from './stage'
import { Thermal } from './thermal'
import { Burst } from './util/burst'
import { Follower, coef } from './util/follower'
import { TriggerBus } from './trigbus'
import { DcBlocker, OnePoleLP, lpCoef } from './util/onepole'
import { mulberry32, type Rng } from './util/rng'
import { flushDenormal, softclip } from './util/softclip'
import { DelayLine } from './util/delayline'

const LIMIT_CEIL = 0.891 // −1 dBFS

const SLOT_IDX = [
  IDX.bendSlot0,
  IDX.bendSlot1,
  IDX.bendSlot2,
  IDX.bendSlot3,
  IDX.bendSlot4,
  IDX.bendSlot5,
]

// Where the brightness bus sits at zero: a programme-like split of high against
// total energy. Above it the loop is running brighter than the thing it started
// as, which is what a squeal climbing its own feedback does.
const BRIGHT_REF = 0.35

// A cold joint under a bend slot. Solder that has crystallised passes signal
// until it doesn't: the stage leaves the path outright for a few milliseconds
// rather than fading down, so what it was ringing is cut off where it stood.
// Block granularity, which is 2.7 ms — the resolution a chattering contact
// actually works at.
class Joint {
  private openFor = 0
  private burst: Burst
  private wasOpen = false

  constructor(
    private readonly sr: number,
    private readonly rng: Rng,
  ) {
    this.burst = new Burst(sr, 1.2)
  }

  /** True when the joint is passing. `changed` says it just moved. */
  pass(chatter: number, cluster: number, n: number) {
    for (let i = 0; i < n; i++) this.burst.step()
    if (this.openFor > 0) this.openFor -= n
    else if (chatter > 0) {
      const perBlock = ((0.4 + chatter * 9) * n) / this.sr
      if (this.burst.roll(perBlock, cluster, this.rng)) {
        this.openFor = Math.floor(
          (0.002 + this.rng() * 0.09 * chatter) * this.sr,
        )
      }
    }
    const open = this.openFor > 0
    const changed = open !== this.wasOpen
    this.wasOpen = open
    return { passing: !open, changed }
  }

  reset() {
    this.openFor = 0
    this.wasOpen = false
    this.burst.reset()
  }
}

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
  private readonly brightLp = new OnePoleLP()
  private readonly hfEnv = new Follower()
  private readonly allEnv = new Follower()
  private fbCombL: DelayLine
  private fbCombR: DelayLine
  private outEnv = new Follower()
  private limitEnv = 0
  // The six slot params, read once a block into a buffer this owns, and one bit
  // per bend id for the duplicates. Nothing in process() allocates: a Set and a
  // spread per block is 375 collections a second on the audio thread.
  private readonly slots = new Float32Array(6)
  private thermal: Thermal
  private relayBurst: Burst
  private rng: Rng
  private joints: Joint[]
  // What the board has re-soldered for itself: a running permutation of the six
  // slot positions, and however many pins the feedback return has walked. Both
  // sit on top of the params rather than in them, so the settings on screen stay
  // the settings you gave it — the order and the routing are what moved.
  private order = [0, 1, 2, 3, 4, 5]
  private fbShift = 0

  /**
   * How hard the limiter leaned on the last block, 0 to 1. Read by nothing in
   * the audio path — it goes up to the main thread, where it is the only thing
   * that can tell a board sitting on the edge of running away from one that is
   * merely loud, or already pinned flat against the ceiling.
   */
  duck = 0

  sources: Stage[] = []
  bendById: (Stage | undefined)[] = []
  pedals: Stage[] = []
  post: Stage[] = []

  constructor(
    readonly sr: number,
    seed = 1,
  ) {
    this.ctx = {
      sr,
      mic: new Float32Array(BLOCK),
      fb: new Float32Array(BLOCK),
      railV: new Float32Array(BLOCK).fill(1),
      sag: new Float32Array(BLOCK),
      droop: new Float32Array(BLOCK),
      env: new Float32Array(BLOCK),
      step: new Float32Array(BLOCK),
      bright: new Float32Array(BLOCK),
      heat: 0,
      fbDest: 0,
      mod: new ModBus(sr, seed ^ 0x51f),
      trig: new TriggerBus(),
    }
    this.fbCombL = new DelayLine(0.5 * sr + 4)
    this.fbCombR = new DelayLine(0.5 * sr + 4)
    this.thermal = new Thermal(sr)
    this.rng = mulberry32(seed ^ 0x9e37)
    this.relayBurst = new Burst(sr, 3)
    this.joints = SLOT_IDX.map(
      (_, i) => new Joint(sr, mulberry32(seed ^ (0x4a17 + i))),
    )
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
    this.brightLp.reset()
    this.hfEnv.reset()
    this.allEnv.reset()
    this.fbCombL.reset()
    this.fbCombR.reset()
    this.outEnv.reset()
    this.ctx.mod.panic()
    this.ctx.trig.panic()
    this.ctx.railV.fill(1)
    this.ctx.sag.fill(0)
    this.ctx.droop.fill(0)
    this.ctx.env.fill(0)
    this.ctx.step.fill(0)
    this.ctx.bright.fill(0)
    this.ctx.heat = 0
    this.thermal.reset()
    this.relayBurst.reset()
    for (const j of this.joints) j.reset()
    this.order = [0, 1, 2, 3, 4, 5]
    this.fbShift = 0
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
    // Last block's kit hits become the ones a bridged trigger line can read.
    ctx.trig.swap(n)
    ctx.mod.build(n, p, ctx)
    ctx.railV.fill(1, 0, n)
    ctx.sag.fill(0, 0, n)
    ctx.step.fill(0, 0, n)

    const cluster = p[IDX.faultCluster]!
    this.updateHeat(p, n)
    this.updateRelay(p, n, cluster)

    io.l.fill(0, 0, n)
    io.r.fill(0, 0, n)
    // Whatever pin the return is on now, which the relay may have walked off
    // the one on screen. Every stage that consumes the return reads it here
    // rather than off the param, so they all agree about where it went.
    ctx.fbDest = (Math.round(p[IDX.fbDest]!) + this.fbShift) % 4
    if (ctx.fbDest === 0) {
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
      if (!s.when || s.when(p, ctx)) s.process(io, p, ctx)
    }

    this.runBends(io, p, n, cluster)

    for (const s of this.pedals) {
      if (!s.when || s.when(p, ctx)) s.process(io, p, ctx)
    }
    for (const s of this.post) {
      if (!s.when || s.when(p, ctx)) s.process(io, p, ctx)
    }

    const gain = Math.pow(10, p[IDX.outGain]! / 20)
    const dcCoef = 1 - (2 * Math.PI * 10) / this.sr
    const envA = coef(0.005, this.sr)
    const envR = coef(0.08, this.sr)
    const hfCoef = lpCoef(2000, this.sr)
    const brightA = coef(0.008, this.sr)
    const brightR = coef(0.05, this.sr)
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
      // The brightness bus, for next block: how much of what is going round is
      // top end. A loop feeding on itself climbs; a loop choking on its own
      // supply falls.
      const mono = 0.5 * (l + r)
      const lp = this.brightLp.process(mono, hfCoef)
      const hf = this.hfEnv.process(mono - lp, brightA, brightR)
      const all = this.allEnv.process(mono, brightA, brightR)
      ctx.bright[i] =
        all > 1e-4
          ? Math.min(Math.max((hf / all - BRIGHT_REF) * 2.5, -1), 1)
          : 0
    }

    this.computeFeedback(io, p)

    const rel = Math.exp(-1 / (0.1 * this.sr))
    let held = 0
    for (let i = 0; i < n; i++) {
      const peak = Math.max(Math.abs(io.l[i]!), Math.abs(io.r[i]!))
      this.limitEnv = flushDenormal(Math.max(peak, this.limitEnv * rel))
      const g = this.limitEnv > LIMIT_CEIL ? LIMIT_CEIL / this.limitEnv : 1
      held += 1 - g
      io.l[i]! *= g
      io.r[i]! *= g
    }
    this.duck = held / n

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

  // Everything the board is being made to dissipate, on one scale. Signal is
  // most of it; a starved rail, a strained supply and a wound-up pedal are the
  // rest, because a circuit fighting its own bias runs hot with nothing coming
  // out of it.
  private updateHeat(p: Float32Array, n: number) {
    let sum = 0
    for (let i = 0; i < n; i++) sum += this.ctx.env[i]!
    const strain =
      1.1 * (sum / n) +
      0.3 * p[IDX.chipStarve]! +
      0.25 * p[IDX.brownAmt]! +
      0.2 * Math.min(p[IDX.fbAmt]!, 1) +
      0.15 * (p[IDX.stompDrive]! / 40) +
      0.1 * p[IDX.chipBattery]!
    this.thermal.tick(strain, n)
    this.ctx.heat = p[IDX.heatAmt]! * this.thermal.value
  }

  // The board re-soldering itself. Two slots swap, or the feedback return walks
  // to the next pin — the settings don't move, the topology does.
  private updateRelay(p: Float32Array, n: number, cluster: number) {
    const rate = p[IDX.relayRate]!
    for (let i = 0; i < n; i++) this.relayBurst.step()
    if (rate <= 0) return
    const perBlock = ((0.02 + rate * 1.2) * n) / this.sr
    if (!this.relayBurst.roll(perBlock, cluster, this.rng)) return
    if (this.rng() < 0.7) {
      const a = Math.floor(this.rng() * this.order.length)
      const b = Math.floor(this.rng() * this.order.length)
      const swap = this.order[a]!
      this.order[a] = this.order[b]!
      this.order[b] = swap
    } else {
      this.fbShift = (this.fbShift + 1 + Math.floor(this.rng() * 3)) % 4
    }
  }

  // The bend slots, in whatever order the board is wired in this block, each
  // through its own joint. A slot whose joint has opened is not in the path at
  // all: no fade, and a click at each end of the gap, which is what a contact
  // breaking under signal actually does.
  private runBends(
    io: StereoBlock,
    p: Float32Array,
    n: number,
    cluster: number,
  ) {
    const chatter = p[IDX.jointChatter]!
    const slots = this.slots
    for (let i = 0; i < SLOT_IDX.length; i++) slots[i] = p[SLOT_IDX[i]!]!
    let seen = 0
    for (let k = 0; k < SLOT_IDX.length; k++) {
      const id = Math.round(slots[this.order[k]!]!)
      if (id <= 0 || seen & (1 << id)) continue
      seen |= 1 << id
      const s = this.bendById[id]
      if (!s) continue
      // An empty slot has no joint, because it has nothing soldered into it.
      const { passing, changed } = this.joints[k]!.pass(chatter, cluster, n)
      if (changed) {
        const click = Math.min(this.ctx.env[0]! * 1.5, 0.5)
        io.l[0]! += click
        io.r[0]! += click
      }
      if (!passing) continue
      if (!s.when || s.when(p, this.ctx)) s.process(io, p, this.ctx)
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
