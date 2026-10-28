import { IDX } from '../../engine/params.ts'
import { Bus } from '../bus.ts'
import { DEST } from '../modbus.ts'
import { BiquadState, lowpass, type Biquad } from '../util/biquad.ts'
import { SineOsc } from '../util/lfo.ts'
import { octaves } from '../util/pitch.ts'
import { mulberry32, type Rng } from '../util/rng.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

export const RACK_BASE_HZ = 29761
export const RACK_LINES = 16
export const RACK_WORDS = 1 << RACK_LINES
const MASK = RACK_WORDS - 1
const MID = 0x8000
const FILTER_HZ = 10000
const FILTER_Q = 0.6
const OUT_GAIN = 0.6
const MIN_TICK_HZ = 400
const DRAG = 0.7
const CLOCK_MOD_OCT = 2
const DECAY_MOD = 0.5
const EXCURSION = 48
const WANDER_HZ = [0.7, 0.93] as const
const LEAK_RATE = 0.08
const SPARE = 64

const PRE = 0
const IN = [1, 2, 3, 4] as const
const IN_GAIN = [0.75, 0.75, 0.625, 0.625] as const
const L_AP1 = 5
const L_D1 = 6
const L_AP2 = 7
const L_D2 = 8
const R_AP1 = 9
const R_D1 = 10
const R_AP2 = 11
const R_D2 = 12
const BASE = [
  0, 142, 107, 379, 277, 672, 4453, 1800, 3720, 908, 4217, 2656, 3163,
]
const TANK_WORDS = BASE.reduce((a, b) => a + b, 0)

const TAP_LINE = Int32Array.from([
  R_D1,
  R_D1,
  R_AP2,
  R_D2,
  L_D1,
  L_AP2,
  L_D2,
  L_D1,
  L_D1,
  L_AP2,
  L_D2,
  R_D1,
  R_AP2,
  R_D2,
])
const TAP_AT = [
  266, 2974, -1913, 1996, -1990, -187, -1066, 353, 3627, -1228, 2673, -2111,
  -335, -121,
]
const TAPS = TAP_AT.length / 2

const dac = (x: number) => Math.min(Math.max(x, -1), 1)

export const RACK_MAX_SIZE =
  (RACK_WORDS - 2 * SPARE - 2 * EXCURSION) / TANK_WORDS

export class RackVerb implements Stage {
  label = 'rackVerb'
  private readonly mem = new Uint16Array(RACK_WORDS).fill(MID)
  private readonly start = new Int32Array(BASE.length)
  private readonly len = new Float64Array(BASE.length)
  private readonly tapAt = new Int32Array(TAP_AT.length)
  private readonly addr: Bus
  private readonly data: Bus
  private readonly wander = [new SineOsc(), new SineOsc()]
  private readonly aaL = new BiquadState()
  private readonly aaR = new BiquadState()
  private readonly reL = new BiquadState()
  private readonly reR = new BiquadState()
  private readonly filter: Biquad
  private rng: Rng
  private ptr = 0
  private phase = 0
  private outL = 0
  private outR = 0
  private tailL = 0
  private tailR = 0
  private dampL = 0
  private dampR = 0
  private aLine = -1
  private aFault = 0
  private dLine = -1
  private dFault = 0
  private cut = 0
  private keep = 0xffff
  private readonly seed: number

  constructor(sr: number, seed = 0x5eb) {
    this.seed = seed
    this.rng = mulberry32(seed)
    this.addr = new Bus(RACK_LINES, seed ^ 0xadd)
    this.data = new Bus(RACK_LINES, seed ^ 0xda7)
    this.filter = lowpass(FILTER_HZ, FILTER_Q, sr)
  }

  when(p: Float32Array) {
    return p[IDX.rackMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const mix = p[IDX.rackMix]!
    const freeze = Math.round(p[IDX.rackFreeze]!) === 1
    const clockMod = ctx.mod.read(DEST.rackClock)
    const decayMod = ctx.mod.read(DEST.rackDecay)
    const clock = p[IDX.rackClock]!
    const drag = p[IDX.rackDrag]!
    const damp = freeze ? 0 : Math.min(Math.max(p[IDX.rackDamp]!, 0), 0.99)
    const leak = LEAK_RATE * p[IDX.rackRefresh]! ** 3
    const bits = Math.min(Math.max(Math.round(p[IDX.rackBits]!), 1), 16)
    this.keep = (0xffff << (16 - bits)) & 0xffff
    this.aLine = Math.round(p[IDX.rackAddrLine]!) - 1
    this.aFault = Math.round(p[IDX.rackAddrFault]!)
    this.dLine = Math.round(p[IDX.rackDataLine]!) - 1
    this.dFault = Math.round(p[IDX.rackDataFault]!)
    this.cut = p[IDX.rackBusCut]!
    const excursion = this.layout(
      p[IDX.rackSize]!,
      p[IDX.rackPre]!,
      EXCURSION * p[IDX.rackWander]!,
    )
    const k0 = SineOsc.rate(WANDER_HZ[0], RACK_BASE_HZ * clock)
    const k1 = SineOsc.rate(WANDER_HZ[1], RACK_BASE_HZ * clock)
    const sr = ctx.sr
    const f = this.filter

    for (let i = 0; i < io.n; i++) {
      const l = io.l[i]!
      const r = io.r[i]!
      const x = (this.aaL.process(l, f) + this.aaR.process(r, f)) / 2
      let hz = RACK_BASE_HZ * clock * (1 - DRAG * drag * ctx.droop[i]!)
      if (clockMod) hz *= octaves(clockMod[i]! * CLOCK_MOD_OCT)
      hz = Math.min(Math.max(hz, MIN_TICK_HZ), sr)
      this.phase += hz / sr
      while (this.phase >= 1) {
        this.phase -= 1
        const decay = freeze
          ? 1
          : p[IDX.rackDecay]! + (decayMod ? DECAY_MOD * decayMod[i]! : 0)
        this.tick(freeze ? 0 : x, decay, damp, excursion, k0, k1)
        if (leak > 0 && this.rng() < leak) this.rot(bits)
      }
      const wl = this.reL.process(this.outL, f)
      const wr = this.reR.process(this.outR, f)
      io.l[i] = l * (1 - mix) + wl * mix
      io.r[i] = r * (1 - mix) + wr * mix
    }
  }

  private layout(size: number, preMs: number, excursion: number) {
    const s = Math.min(Math.max(size, 0.05), RACK_MAX_SIZE)
    for (let k = 1; k < BASE.length; k++)
      this.len[k] = Math.max(Math.round(BASE[k]! * s), 2)
    const reach = Math.min(
      excursion,
      this.len[L_AP1]! - 2,
      this.len[R_AP1]! - 2,
    )
    let at = 0
    for (let k = 1; k < BASE.length; k++) {
      this.start[k] = at
      at +=
        this.len[k]! + (k === L_AP1 || k === R_AP1 ? Math.ceil(reach) + 2 : 1)
    }
    const room = RACK_WORDS - SPARE - at
    this.len[PRE] = Math.max(
      Math.min(Math.round((preMs / 1000) * RACK_BASE_HZ), room),
      1,
    )
    this.start[PRE] = at
    for (let j = 0; j < TAP_AT.length; j++) {
      const line = TAP_LINE[j]!
      const t = Math.round(
        (Math.abs(TAP_AT[j]!) / BASE[line]!) * this.len[line]!,
      )
      this.tapAt[j] = Math.min(Math.max(t, 1), this.len[line]!)
    }
    return reach
  }

  private tick(
    x: number,
    decay: number,
    damp: number,
    excursion: number,
    k0: number,
    k1: number,
  ) {
    const g2 = Math.min(Math.max(decay + 0.15, 0.25), 0.5)
    this.write(PRE, x)
    let a = this.read(PRE, this.len[PRE]!)
    for (let j = 0; j < IN.length; j++) a = this.allpass(IN[j]!, a, IN_GAIN[j]!)

    const wl = excursion * this.wander[0]!.step(k0)
    const wr = excursion * this.wander[1]!.step(k1)
    let tl = this.wobbly(L_AP1, a + decay * this.tailR, -0.7, wl)
    let tr = this.wobbly(R_AP1, a + decay * this.tailL, -0.7, wr)

    this.write(L_D1, tl)
    this.write(R_D1, tr)
    tl = this.read(L_D1, this.len[L_D1]!)
    tr = this.read(R_D1, this.len[R_D1]!)
    this.dampL = tl + damp * (this.dampL - tl)
    this.dampR = tr + damp * (this.dampR - tr)
    tl = this.allpass(L_AP2, this.dampL * decay, g2)
    tr = this.allpass(R_AP2, this.dampR * decay, g2)
    this.write(L_D2, tl)
    this.write(R_D2, tr)
    this.tailL = this.read(L_D2, this.len[L_D2]!)
    this.tailR = this.read(R_D2, this.len[R_D2]!)

    this.outL = dac(OUT_GAIN * this.taps(0))
    this.outR = dac(OUT_GAIN * this.taps(TAPS))
    this.ptr = (this.ptr - 1) & MASK
  }

  private taps(from: number) {
    let sum = 0
    for (let j = from; j < from + TAPS; j++) {
      const v = this.read(TAP_LINE[j]!, this.tapAt[j]!)
      sum += TAP_AT[j]! < 0 ? -v : v
    }
    return sum
  }

  private allpass(line: number, x: number, g: number) {
    const d = this.read(line, this.len[line]!)
    const u = x - g * d
    this.write(line, u)
    return d + g * u
  }

  private wobbly(line: number, x: number, g: number, swing: number) {
    const t = this.len[line]! + swing
    const lo = Math.floor(t)
    const frac = t - lo
    const d = this.read(line, lo) * (1 - frac) + this.read(line, lo + 1) * frac
    const u = x - g * d
    this.write(line, u)
    return d + g * u
  }

  private at(line: number, t: number) {
    const a = (this.ptr + this.start[line]! + t) & MASK
    return this.aLine < 0
      ? a
      : this.addr.read(a, this.aLine, this.aFault, this.cut)
  }

  private read(line: number, t: number) {
    let word = this.mem[this.at(line, t)]!
    if (this.dLine >= 0)
      word = this.data.read(word, this.dLine, this.dFault, this.cut)
    return (word - MID) / MID
  }

  private write(line: number, v: number) {
    const word = Math.min(Math.max(Math.round(v * MID) + MID, 0), 0xffff)
    this.mem[this.at(line, 0)] = word & this.keep
  }

  private rot(bits: number) {
    const a = Math.floor(this.rng() * RACK_WORDS)
    const bit = 1 << (16 - 1 - Math.floor(this.rng() * bits))
    this.mem[a] = (a >> 8) & 1 ? this.mem[a]! | bit : this.mem[a]! & ~bit
  }

  panic() {
    this.mem.fill(MID)
    this.addr.reset()
    this.data.reset()
    this.rng = mulberry32(this.seed)
    for (const s of this.wander) s.reset()
    for (const b of [this.aaL, this.aaR, this.reL, this.reR]) b.reset()
    this.ptr = 0
    this.phase = 0
    this.outL = 0
    this.outR = 0
    this.tailL = 0
    this.tailR = 0
    this.dampL = 0
    this.dampR = 0
  }
}
