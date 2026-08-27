import { IDX, MAX_SOURCES, N_TAPS, TAP_BUS, TAP_MIC } from '../engine/params'
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
import { LoopAmp, ampVoicing, type AmpVoicing } from './util/loopamp'

const LIMIT_CEIL = 0.891 // −1 dBFS

/** where the summing amp is lined up: the level a busy bus already peaks at,
    and so the level the drive knob is being asked to do something to. */
const BUS_REF = 0.6

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
  /** Set by pass(): the joint has just broken, or just come back. */
  moved = false

  constructor(
    private readonly sr: number,
    private readonly rng: Rng,
  ) {
    this.burst = new Burst(sr, 1.2)
  }

  /** True when the joint is passing; `moved` says it just changed its mind. */
  pass(chatter: number, cluster: number, n: number): boolean {
    this.burst.coolFor(n)
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
    this.moved = open !== this.wasOpen
    this.wasOpen = open
    return !open
  }

  reset() {
    this.openFor = 0
    this.wasOpen = false
    this.moved = false
    this.burst.reset()
  }
}

// How many send/return loops the desk has. One is a squeal: a single delay
// round a single saturation settles into a mode and stays in it. Three
// cross-fed is a different instrument — a ring of coupled nonlinear delays has
// no mode to settle into, so it hunts, bifurcates and falls over on its own,
// which is what people are actually doing when they play a mixer with nothing
// plugged into it.
const N_LOOPS = 3

// One channel strip of the no-input desk: a send off the output bus, a tilt, a
// delay standing for however long that patch cord and its circuit take, and the
// amplifier it all comes back through.
//
// The amp is the loop's own, not a shared one, because blocking and slew both
// carry state that is about *this* loop's history — two loops through one amp
// would cut each other off, which is a thing a desk with one shared bus amp
// does and a desk with three returns does not.
class DeskLoop {
  private readonly lineL: DelayLine
  private readonly lineR: DelayLine
  private readonly ampL = new LoopAmp()
  private readonly ampR = new LoopAmp()
  private readonly tiltLpL = new OnePoleLP()
  private readonly tiltLpR = new OnePoleLP()
  private tilt = 0
  private tiltCoef = 0
  private delay = 1
  /** Fader up and a line to come back down: what makes this strip exist. */
  on = false
  amt = 0
  combG = 0
  /** This sample's read off the line, taken before anything writes, so a ring
      of them all see the same instant rather than each other's next one. */
  dL = 0
  dR = 0
  /** This sample's return, which is what the bus sums and what the line keeps. */
  wL = 0
  wR = 0

  constructor(sr: number) {
    this.lineL = new DelayLine(0.5 * sr + 4)
    this.lineR = new DelayLine(0.5 * sr + 4)
  }

  open(amt: number, ms: number, tilt: number, sr: number) {
    this.on = amt > 0
    this.setAmt(amt)
    this.delay = Math.max((ms / 1000) * sr, 1)
    this.tilt = tilt
    this.tiltCoef = lpCoef(800, sr)
  }

  setAmt(amt: number) {
    this.amt = amt
    this.combG = Math.min(amt, 1.05)
  }

  read() {
    this.dL = this.lineL.read(this.delay)
    this.dR = this.lineR.read(this.delay)
  }

  // The send, tilted: which end of the band this strip gives back decides which
  // register it screams in, and three strips tilted differently is three squeals
  // that never quite agree.
  private send(x: number, lp: OnePoleLP): number {
    const y = x * this.amt
    const low = lp.process(y, this.tiltCoef)
    if (this.tilt > 0) return y + this.tilt * (y - 2 * low)
    if (this.tilt < 0) return y + -this.tilt * (2 * low - y)
    return y
  }

  run(
    l: number,
    r: number,
    retL: number,
    retR: number,
    rail: number,
    v: AmpVoicing,
  ) {
    const inL = this.send(l, this.tiltLpL) + this.combG * retL
    const inR = this.send(r, this.tiltLpR) + this.combG * retR
    this.wL = this.ampL.process(inL, rail, v)
    this.wR = this.ampR.process(inR, rail, v)
    this.lineL.write(this.wL)
    this.lineR.write(this.wR)
  }

  reset() {
    this.lineL.reset()
    this.lineR.reset()
    this.ampL.reset()
    this.ampR.reset()
    this.tiltLpL.reset()
    this.tiltLpR.reset()
    this.on = false
    this.dL = 0
    this.dR = 0
    this.wL = 0
    this.wR = 0
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
  private readonly brightLp = new OnePoleLP()
  private readonly hfEnv = new Follower()
  private readonly allEnv = new Follower()
  private readonly loops: DeskLoop[]
  /** Which strip each one's Cross send lands on, settled once a block. */
  private readonly across = new Int32Array(N_LOOPS)
  // The supply the return amps share, and how loaded they are having it. The
  // desk is on the same board as everything else, so Starve and Brownout pull
  // it down from under them as well.
  private readonly deskEnv = new Follower()
  private deskRail = 1
  private deskLast = 0
  private outEnv = new Follower()
  private limitEnv = 0
  // The six slot params, read once a block into a buffer this owns, and one bit
  // per bend id for the duplicates. Nothing in process() allocates: a Set and a
  // spread per block is 375 collections a second on the audio thread.
  private readonly slots = new Float32Array(6)
  // The bus as each source found it, so the next one's difference is its own
  // channel and nothing else's.
  private readonly tapPrev = new Float32Array(BLOCK)
  private thermal: Thermal
  private relayBurst: Burst
  private rng: Rng
  private joints: Joint[]
  // What the board has re-soldered for itself: a running permutation of the six
  // slot positions, and however many pins the feedback return has walked. Both
  // sit on top of the params rather than in them, so the settings on screen stay
  // the settings you gave it — the order and the routing are what moved.
  private order = [0, 1, 2, 3, 4, 5]
  /**
   * What the chain is actually doing, as against what it was set to. Both of
   * the Solder controls rewrite the path from inside the audio thread — the
   * relay swaps two positions and a dry joint drops one out mid-note — and
   * neither of them touches a control, so the panel has no other way to know.
   * A rack drawn off the board alone is a drawing of the chain you asked for
   * while a different one plays.
   *
   * `walk[k]` is the position the signal reads at its kth step, and bit k of
   * `dropped` says that step's joint was open for this block. Both are read
   * every block and posted with the meter; nothing in the audio path reads
   * them.
   */
  readonly walk = Uint8Array.from(SLOT_IDX.map((_, i) => i))
  dropped = 0
  private fbShift = 0

  /**
   * How hard the limiter leaned on the last block, 0 to 1. Read by nothing in
   * the audio path — it goes up to the main thread, where it is the only thing
   * that can tell a board sitting on the edge of running away from one that is
   * merely loud, or already pinned flat against the ceiling.
   */
  duck = 0

  /**
   * How loud each source, the mic and the bus itself have been since the last
   * read, held at the peak rather than averaged — a kick every half second is
   * a channel doing something, and a mean over that window says it is nearly
   * silent. Whoever reads it clears it; nothing in the audio path reads it.
   */
  readonly taps = new Float32Array(N_TAPS)

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
      out: new Float32Array(BLOCK),
      step: new Float32Array(BLOCK),
      bright: new Float32Array(BLOCK),
      heat: 0,
      fbDest: 0,
      mod: new ModBus(sr, seed ^ 0x51f),
      trig: new TriggerBus(),
    }
    this.loops = Array.from({ length: N_LOOPS }, () => new DeskLoop(sr))
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
    this.brightLp.reset()
    this.hfEnv.reset()
    this.allEnv.reset()
    for (const lp of this.loops) lp.reset()
    this.outEnv.reset()
    this.ctx.mod.panic()
    this.ctx.trig.panic()
    this.ctx.railV.fill(1)
    this.ctx.sag.fill(0)
    this.ctx.droop.fill(0)
    this.ctx.env.fill(0)
    this.ctx.out.fill(0)
    this.ctx.step.fill(0)
    this.ctx.bright.fill(0)
    this.ctx.heat = 0
    this.thermal.reset()
    this.relayBurst.reset()
    for (const j of this.joints) j.reset()
    this.order = [0, 1, 2, 3, 4, 5]
    this.walk.set(this.order)
    this.dropped = 0
    this.fbShift = 0
    this.limitEnv = 0
    this.deskEnv.reset()
    this.deskRail = 1
    this.deskLast = 0
    this.taps.fill(0)
    this.tapPrev.fill(0)
  }

  process(io: StereoBlock, p: Float32Array, mic?: Float32Array) {
    const { n } = io
    const ctx = this.ctx

    const micLevel = p[IDX.micLevel]!
    let micPeak = 0
    for (let i = 0; i < n; i++) {
      const v = micLevel * (mic?.[i] ?? 0)
      ctx.mic[i] = v
      const a = v < 0 ? -v : v
      if (a > micPeak) micPeak = a
    }
    if (micPeak > this.taps[TAP_MIC]!) this.taps[TAP_MIC] = micPeak

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
    if (Math.round(p[IDX.micPatch]!) === 0) {
      for (let i = 0; i < n; i++) {
        io.l[i]! += ctx.mic[i]!
        io.r[i]! += ctx.mic[i]!
      }
    }

    // Each source's own channel, taken as the difference it made to the sum
    // rather than from inside the stage: every one of them adds into the bus,
    // so the difference is what that machine put there, and no stage has to be
    // taught to meter itself. A source its own `when` skipped added nothing, so
    // it costs nothing to leave out — which on a stock board is four of the six.
    //
    // The left channel alone, because a meter is a glance: five of the six write
    // the same sample to both, and the noise is the one that does not, so it
    // reads a hair under what it is really putting on the bus.
    //
    // Copied by hand rather than through subarray: a view is an object, and an
    // object per block is 375 of them a second on the thread that cannot afford
    // a collection.
    const prev = this.tapPrev
    for (let i = 0; i < n; i++) prev[i] = io.l[i]!
    for (let k = 0; k < this.sources.length; k++) {
      const s = this.sources[k]!
      if (!s.when || s.when(p, ctx)) {
        s.process(io, p, ctx)
        let peak = 0
        for (let i = 0; i < n; i++) {
          const l = io.l[i]!
          const d = l - prev[i]!
          const a = d < 0 ? -d : d
          if (a > peak) peak = a
          prev[i] = l
        }
        // There are six slots and the instrument is built with six sources; a
        // seventh would still sound, and a test holds the two numbers together
        // rather than letting a stray channel land on the mic's meter.
        if (k < MAX_SOURCES && peak > this.taps[k]!) this.taps[k] = peak
      }
    }

    // The summing amp the six of them meet in. Every desk has one and it is
    // never a wire: at unity it is skipped outright, because a soft clipper
    // asked to pass a bus that already peaks at 0.6 is a decibel of squash
    // nobody dialled in. Wound up it is the one saturation upstream of the
    // bends, so the whole board is driven into them together instead of each
    // stage being driven on its own — and the feedback return lands here, so
    // a howl saturates in the amp it is coming back through.
    const driveDb = p[IDX.mixDrive]!
    let busPeak = 0
    if (driveDb === 0) {
      for (let i = 0; i < n; i++) {
        const l = io.l[i]!
        const r = io.r[i]!
        const a = Math.max(l < 0 ? -l : l, r < 0 ? -r : r)
        if (a > busPeak) busPeak = a
      }
    } else {
      const g = Math.pow(10, driveDb / 20)
      // What the amp took off a bus already sitting at the reference, given
      // back — so a bus that loud comes out that loud wherever the knob is, and
      // what the travel buys is density rather than level. The crest factor
      // still falls from nearly three to just over one.
      //
      // Half the gain back was the rule before, and half of a fixed ceiling is
      // still a fixed ceiling: the amp's own maximum fell a decibel for every
      // two on the knob, twelve of them by the top. So the knob peaked at +6
      // and was a fader above it, and since this is the one saturation upstream
      // of the bends — and where the feedback return lands — a board wound up
      // to slam them arrived twelve dB down instead, which is the opposite of
      // what a hand on a drive knob is asking for.
      const makeup = softclip(BUS_REF) / softclip(BUS_REF * g)
      for (let i = 0; i < n; i++) {
        const l = softclip(io.l[i]! * g) * makeup
        const r = softclip(io.r[i]! * g) * makeup
        io.l[i] = l
        io.r[i] = r
        const a = Math.max(l < 0 ? -l : l, r < 0 ? -r : r)
        if (a > busPeak) busPeak = a
      }
    }
    if (busPeak > this.taps[TAP_BUS]!) this.taps[TAP_BUS] = busPeak

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
      // For next block, so a record head somewhere back up the path can lay
      // down what the board put out down here.
      ctx.out[i] = 0.5 * (l + r)
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
    this.relayBurst.coolFor(n)
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
  // through the joint of the position it is sitting in. A slot whose joint has
  // opened is not in the path at all: no fade, and a click at each end of the
  // gap, which is what a contact breaking under signal actually does.
  //
  // The joint belongs to the position rather than to the bend, because it is
  // the socket that is badly soldered — the relay re-seats which bend sits in
  // which socket and the dry joint stays where it was.
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
    let dropped = 0
    for (let k = 0; k < SLOT_IDX.length; k++) {
      this.walk[k] = this.order[k]!
      const id = Math.round(slots[this.order[k]!]!)
      const first = id > 0 && !(seen & (1 << id))
      if (id > 0) seen |= 1 << id
      const joint = this.joints[k]!
      const s = first ? this.bendById[id] : undefined
      // A position with nothing soldered into it has no joint to break, so its
      // joint comes back at rest. Leaving it standing would freeze it mid-break
      // instead: a socket emptied while its contact was open used to hold that
      // break — and the excitement behind it — until something was patched back
      // in, which then arrived already gone.
      if (!s) {
        joint.reset()
        continue
      }
      const passing = joint.pass(chatter, cluster, n)
      if (joint.moved) {
        const click = Math.min(this.ctx.env[0]! * 1.5, 0.5)
        io.l[0]! += click
        io.r[0]! += click
      }
      if (!passing) {
        dropped |= 1 << k
        continue
      }
      if (!s.when || s.when(p, this.ctx)) s.process(io, p, this.ctx)
    }
    this.dropped = dropped
  }

  // The no-input desk. Each strip takes a send off the post-softclip tap, tilts
  // it, recirculates it through its own delay and its own amplifier, and drops
  // the return on the bus for next block. The delay is where kHz mixer squeal
  // lives; the block-rate loop round the whole board is far too slow for it.
  //
  // What makes three strips more than three times one is Cross. At rest each
  // recirculates itself, which is the single loop this was for years. Wound up,
  // each one recirculates its *neighbour* instead, and three delays passing a
  // saturated signal round a ring is a system with no fixed point to find: it
  // climbs into one mode, sits there, and falls out of it into another without
  // anything being touched. The strips have to read before any of them writes,
  // or the ring is really a chain and the last one is hearing the future.
  private computeFeedback(io: StereoBlock, p: Float32Array) {
    const { n } = io
    const base = p[IDX.fbAmt]!
    const modAmt = this.ctx.mod.read(DEST.fbAmt)
    const loops = this.loops
    loops[0]!.open(base, p[IDX.fbDelayMs]!, p[IDX.fbTone]!, this.sr)
    loops[1]!.open(p[IDX.fb2Amt]!, p[IDX.fb2Ms]!, p[IDX.fb2Tone]!, this.sr)
    loops[2]!.open(p[IDX.fb3Amt]!, p[IDX.fb3Ms]!, p[IDX.fb3Tone]!, this.sr)
    // A wire on the amount can bring the first strip up from a fader that is
    // all the way down, so the desk is running whenever anything could open it.
    if (modAmt) loops[0]!.on = true

    let live = 0
    for (const lp of loops) if (lp.on) live++
    if (live === 0) {
      this.fbRetL.fill(0)
      this.fbRetR.fill(0)
      return
    }

    // Which strip each one is patched across to. A send into a channel whose
    // fader is down is a loop that is simply cut, so Cross skips the strips that
    // aren't there and lands on the next one that is — and with only one strip
    // up it comes back to itself, because there is nothing to cross to.
    const across = this.across
    for (let k = 0; k < N_LOOPS; k++) {
      let j = k
      for (let hop = 1; hop <= N_LOOPS; hop++) {
        const cand = (k + hop) % N_LOOPS
        if (loops[cand]!.on) {
          j = cand
          break
        }
      }
      across[k] = j
    }
    const cross = p[IDX.fbCross]!
    const near = 1 - cross
    const sag = p[IDX.fbSag]!
    // Current goes the instant it is asked for; it comes back through whatever
    // is feeding the reservoir. Held at one rate both ways the rail found a
    // level and sat on it, which is a compressor on the desk. Dumping in
    // milliseconds and refilling over a third of a second is not a level at
    // all: the loop screams, takes the supply out from under itself, dies, and
    // has to wait to be able to do it again.
    const railFall = coef(0.008, this.sr)
    const railRise = coef(0.35, this.sr)
    const deskA = coef(0.004, this.sr)
    const deskR = coef(0.12, this.sr)
    const amp = ampVoicing(
      p[IDX.fbRails]!,
      p[IDX.fbAsym]!,
      p[IDX.fbSlew]!,
      p[IDX.fbBlock]!,
      this.sr,
    )

    for (let i = 0; i < n; i++) {
      if (modAmt) {
        loops[0]!.setAmt(Math.min(Math.max(base + modAmt[i]! * 1.5, 0), 1.5))
      }
      const l = io.l[i]!
      const r = io.r[i]!
      // What the amps are drawing, and what is left of the rail to draw it
      // from. Read off what the desk itself put out last sample rather than off
      // the bus: the bus is everything, and what loads this supply is these
      // three amplifiers. The draw saturates rather than clipping, so a desk
      // being played hard keeps answering how hard rather than pinning on the
      // floor.
      let rail = 1
      if (sag > 0) {
        const draw = this.deskEnv.process(this.deskLast, deskA, deskR) * 3
        const want =
          1 - sag * Math.min(Math.max(draw / (1 + draw), this.ctx.droop[i]!), 1)
        this.deskRail = flushDenormal(
          this.deskRail +
            (want < this.deskRail ? railFall : railRise) *
              (want - this.deskRail),
        )
        rail = Math.max(this.deskRail, 0.05)
      }
      for (const lp of loops) if (lp.on) lp.read()
      let sumL = 0
      let sumR = 0
      for (let k = 0; k < N_LOOPS; k++) {
        const lp = loops[k]!
        if (!lp.on) continue
        const other = loops[across[k]!]!
        lp.run(
          l,
          r,
          near * lp.dL + cross * other.dL,
          near * lp.dR + cross * other.dR,
          rail,
          amp,
        )
        sumL += lp.wL
        sumR += lp.wR
      }
      this.deskLast = 0.5 * (sumL + sumR)
      this.fbRetL[i] = sumL
      this.fbRetR[i] = sumR
    }
  }
}
