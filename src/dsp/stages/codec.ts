import { IDX } from '../../engine/params.ts'
import { DEST } from '../modbus.ts'
import { Burst } from '../util/burst.ts'
import { Mdct } from '../util/mdct.ts'
import { octaves } from '../util/pitch.ts'
import { mulberry32, type Rng } from '../util/rng.ts'
import { flushDenormal, softclip } from '../util/softclip.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

// A cheap perceptual codec, encoder and decoder back to back: an MDCT, a water
// level that hands out a frame's bits to the loudest bands first, and a decoder
// that conceals what the stream lost. Mid and side share one budget, and side
// pays a penalty for it, so a starved stream collapses towards mono.

export const CODEC_FRAMES = [128, 256, 512, 1024, 2048] as const
export const CODEC_FRAME_NAMES = ['short', 'normal', 'long', 'huge', 'giant']
export const CODEC_CONCEAL = ['repeat', 'mute', 'noise']
export const CODEC_SCRAMBLE = ['bands', 'rate', 'invert', 'pan']
export const CODEC_SCRAMBLE_HOLD = ['frame', 'hit']

const BANDS = 0
const RATE = 1
const INVERT = 2
const PAN = 3

const BAND_HZ = [
  0, 100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480, 1720, 2000, 2320,
  2700, 3150, 3700, 4400, 5300, 6400, 7700, 9500, 12000, 15500,
]
const SIDE_INFO_BITS = 6
const SIDE_PENALTY_DB = 6
const SIDE_FULL_KBPS = 64
const MAX_BITS = 15
const DEADZONE = 0.18
const SF_BIAS = 128
const MIN_KBPS = 1
const MAX_KBPS = 320
const LOWPASS_HZ = 3000
const LOWPASS_EXP = 0.6
const ERR_SF = 0.3
const ERR_BIN = 0.02
const ERR_DESYNC = 0.25
const LATE_JITTER = 0.2
const LATE_DROOP = 2
export const CODEC_MISREAD_KHZ = [44.1, 32, 24, 22.05, 16]
export const CODEC_INVERT_HZ = [250, 1400] as const
export const CODEC_PAN_FLOOR_HZ = 200
const MISREAD_RATES = CODEC_MISREAD_KHZ.map(khz => khz / 48)
const INVERT_OCTAVES = Math.log2(CODEC_INVERT_HZ[1] / CODEC_INVERT_HZ[0])
const ATTACK_FAST_S = 0.005
const ATTACK_SLOW_S = 0.06
const ATTACK_RISE = 1.5
const ATTACK_REARM = 1.2
const ATTACK_FLOOR = 1e-7

class Size {
  readonly mdct: Mdct
  readonly edges: Uint16Array
  readonly binHz: number
  constructor(n: number, sr: number) {
    this.mdct = new Mdct(n)
    const binHz = sr / 2 / n
    this.binHz = binHz
    const edges = [0]
    for (const hz of BAND_HZ.slice(1)) {
      const at = Math.min(Math.round(hz / binHz), n)
      if (at > edges.at(-1)!) edges.push(at)
    }
    if (edges.at(-1)! < n) edges.push(n)
    this.edges = Uint16Array.from(edges)
  }
}

const MAX_N = CODEC_FRAMES.at(-1)!
const MAX_BANDS = BAND_HZ.length + 1

class Lane {
  readonly input = new Float64Array(2 * MAX_N)
  readonly frame = new Float64Array(2 * MAX_N)
  readonly ready = new Float64Array(MAX_N)
  readonly tail = new Float64Array(MAX_N)
  readonly coef = new Float64Array(MAX_N)
  readonly held = new Float64Array(MAX_N)
  readonly db = new Float64Array(MAX_BANDS)
  readonly rms = new Float64Array(MAX_BANDS)
  readonly peak = new Float64Array(MAX_BANDS)
  readonly bits = new Uint8Array(MAX_BANDS)
  readonly filed = new Int8Array(MAX_BANDS).fill(-1)

  reset() {
    this.input.fill(0)
    this.ready.fill(0)
    this.tail.fill(0)
    this.held.fill(0)
    this.filed.fill(-1)
  }
}

export class Codec implements Stage {
  label = 'codec'
  private readonly sizes: Size[]
  private readonly mid = new Lane()
  private readonly side = new Lane()
  private readonly lanes = [this.mid, this.side]
  private readonly dryL = new Float32Array(2 * MAX_N)
  private readonly dryR = new Float32Array(2 * MAX_N)
  private dryAt = 0
  private live = false
  private heard = false
  private sizeIdx = -1
  private pos = 0
  private rng: Rng
  private loss: Burst
  private readonly sr: number
  private readonly thrown = new Int8Array(MAX_BANDS)
  private carrierHz = 0
  private rate = 1
  private rateNext = 1
  private rolledChance = 0
  private rolledKind = BANDS
  private envFast = 0
  private envSlow = 0
  private armed = true

  constructor(sr: number, seed = 0xc0dec) {
    this.sr = sr
    this.sizes = CODEC_FRAMES.map(n => new Size(n, sr))
    this.rng = mulberry32(seed)
    this.loss = new Burst(sr, 0.4)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const pick = Math.min(
      Math.max(Math.round(p[IDX.codecFrame]!), 0),
      CODEC_FRAMES.length - 1,
    )
    const mix = p[IDX.codecMix]!
    const entering = !this.live && this.heard
    if (!this.live) {
      if (mix <= 0) {
        this.listen(io)
        return
      }
      this.restart(pick)
    } else if (pick !== this.sizeIdx) this.restart(pick)
    const leaving = mix <= 0
    this.live = !leaving
    const size = this.sizes[pick]!
    const n = size.mdct.n
    const latency = 2 * n
    const ring = this.dryL.length
    const rateMod = ctx.mod.read(DEST.codecRate)
    const errMod = ctx.mod.read(DEST.codecErrors)
    const fb = p[IDX.codecFb]!
    const { mid, side } = this

    for (let i = 0; i < io.n; i++) {
      const l = io.l[i]!
      const r = io.r[i]!
      const m = mid.ready[this.pos]!
      const s = side.ready[this.pos]!
      mid.input[n + this.pos] = (l + r) / 2 + fb * softclip(m)
      side.input[n + this.pos] = (l - r) / 2 + fb * softclip(s)
      const back = (this.dryAt - latency + ring) % ring
      const dl = this.dryL[back]!
      const dr = this.dryR[back]!
      this.dryL[this.dryAt] = l
      this.dryR[this.dryAt] = r
      this.dryAt = (this.dryAt + 1) % ring
      const outL = dl * (1 - mix) + (m + s) * mix
      const outR = dr * (1 - mix) + (m - s) * mix
      if (entering || leaving) {
        const g = entering ? (i + 1) / io.n : 1 - (i + 1) / io.n
        io.l[i] = l + (outL - l) * g
        io.r[i] = r + (outR - r) * g
      } else {
        io.l[i] = outL
        io.r[i] = outR
      }

      this.pos++
      if (this.pos === n) {
        this.pos = 0
        const kbps = rateMod
          ? p[IDX.codecRate]! * octaves(rateMod[i]! * 3)
          : p[IDX.codecRate]!
        const errors = errMod
          ? p[IDX.codecErrors]! + errMod[i]!
          : p[IDX.codecErrors]!
        this.frame(size, p, kbps, errors, ctx.droop[i]!)
      }
    }
  }

  private listen(io: StereoBlock) {
    this.heard = true
    const ring = this.dryL.length
    for (let i = 0; i < io.n; i++) {
      this.dryL[this.dryAt] = io.l[i]!
      this.dryR[this.dryAt] = io.r[i]!
      this.dryAt = (this.dryAt + 1) % ring
    }
  }

  private frame(
    size: Size,
    p: Float32Array,
    kbps: number,
    errors: number,
    droop: number,
  ) {
    const { mid, side, lanes, rng } = this
    const n = size.mdct.n
    const rate = Math.min(Math.max(kbps, MIN_KBPS), MAX_KBPS)
    const cutHz = Math.min(LOWPASS_HZ * (rate / 8) ** LOWPASS_EXP, this.sr / 2)
    const cut = Math.min(Math.round((cutHz / (this.sr / 2)) * n), n)
    const budget = (rate * 1000 * n) / this.sr
    const err = Math.min(Math.max(errors, 0), 1)

    for (const lane of lanes) {
      copy(lane.input, lane.frame, 2 * n)
      lane.input.copyWithin(0, n, 2 * n)
      size.mdct.forward(lane.frame, lane.coef)
      measure(lane, size.edges, cut)
    }
    const penalty = SIDE_PENALTY_DB * Math.max(1, SIDE_FULL_KBPS / rate)
    allocate(mid, side, size.edges, cut, budget, penalty)

    this.loss.coolFor(n)
    const lost = this.loss.roll(p[IDX.codecLoss]!, p[IDX.faultCluster]!, rng, n)
    const cpu = p[IDX.codecCpu]!
    const late =
      cpu > 0 && cpu * (1 + LATE_DROOP * droop) + LATE_JITTER * rng() > 1
    const freeze = Math.round(p[IDX.codecFreeze]!) === 1
    const conceal = Math.round(p[IDX.codecConceal]!)
    const swap = p[IDX.codecScramble]!
    const kind = Math.round(p[IDX.codecScrambleKind]!)
    const alias = p[IDX.codecAlias]!
    const hit = this.attack(n)
    const fresh =
      Math.round(p[IDX.codecScrambleHold]!) === 0 ||
      hit ||
      swap !== this.rolledChance ||
      kind !== this.rolledKind
    const bands = size.edges.length - 1

    for (const lane of lanes) {
      if (freeze) scatter(lane, n, rng)
      else if (lost || late) {
        if (conceal === 1) lane.coef.fill(0, 0, n)
        else if (conceal === 2) scatter(lane, n, rng)
        else copy(lane.held, lane.coef, n)
      } else {
        quantise(lane, size.edges, cut, n, err, rng)
        copy(lane.coef, lane.held, n)
      }
      if (swap > 0 && kind === BANDS) {
        if (fresh) file(lane.filed, bands, swap, rng)
        refile(lane.coef, lane.filed, size.edges, cut)
      }
    }

    this.rate = this.rateNext
    if (fresh) this.roll(kind, swap, bands)
    const top = Math.min(Math.round(this.carrierHz / size.binHz), n)
    if (top > 0) for (const lane of lanes) reverse(lane.coef, top)
    intensity(
      mid.coef,
      side.coef,
      this.thrown,
      size.edges,
      CODEC_PAN_FLOOR_HZ / size.binHz,
    )

    for (const lane of lanes) {
      size.mdct.inverse(lane.coef, lane.frame)
      for (let k = 0; k < n; k++) {
        lane.ready[k] = lane.tail[k]! + lane.frame[k]!
        lane.tail[k] = lane.frame[n + k]!
      }
      if (alias > 0) mirror(lane.ready, n, alias)
      if (this.rate < 1) slow(lane.ready, lane.frame, n, this.rate)
    }
  }

  private attack(n: number) {
    const hop = this.mid.input
    let e = 0
    for (let k = 0; k < n; k++) e += hop[k]! * hop[k]!
    const seconds = n / this.sr
    const was = this.envSlow
    const fast = flushDenormal(
      this.envFast +
        (e / n - this.envFast) * (1 - Math.exp(-seconds / ATTACK_FAST_S)),
    )
    this.envFast = fast
    this.envSlow = flushDenormal(
      was + (fast - was) * (1 - Math.exp(-seconds / ATTACK_SLOW_S)),
    )
    const hit = this.armed && fast > ATTACK_RISE * was + ATTACK_FLOOR
    this.armed = !hit && (this.armed || fast < ATTACK_REARM * was)
    return hit
  }

  private roll(kind: number, chance: number, bands: number) {
    const { rng, thrown } = this
    this.rolledChance = chance
    this.rolledKind = kind
    this.rateNext =
      kind === RATE && rng() < chance
        ? MISREAD_RATES[Math.floor(rng() * MISREAD_RATES.length)]!
        : 1
    this.carrierHz =
      kind === INVERT && rng() < chance
        ? CODEC_INVERT_HZ[0] * 2 ** (rng() * INVERT_OCTAVES)
        : 0
    for (let b = 0; b < bands; b++)
      thrown[b] = kind === PAN && rng() < chance ? (rng() < 0.5 ? 1 : -1) : 0
  }

  private restart(pick: number) {
    this.sizeIdx = pick
    this.mid.reset()
    this.side.reset()
    this.pos = 0
    this.thrown.fill(0)
    this.carrierHz = 0
    this.rate = 1
    this.rateNext = 1
    this.rolledKind = -1
  }

  panic() {
    this.restart(-1)
    this.dryL.fill(0)
    this.dryR.fill(0)
    this.live = false
    this.heard = false
    this.loss.reset()
    this.envFast = 0
    this.envSlow = 0
    this.armed = true
  }
}

function copy(from: Float64Array, to: Float64Array, n: number) {
  for (let k = 0; k < n; k++) to[k] = from[k]!
}

function measure(lane: Lane, edges: Uint16Array, cut: number) {
  for (let b = 0; b + 1 < edges.length; b++) {
    const lo = edges[b]!
    const hi = Math.min(edges[b + 1]!, cut)
    let e = 0
    let peak = 0
    for (let k = lo; k < hi; k++) {
      const c = lane.coef[k]!
      e += c * c
      peak = Math.max(peak, Math.abs(c))
    }
    const mean = hi > lo ? e / (hi - lo) : 0
    lane.rms[b] = Math.sqrt(mean)
    lane.peak[b] = peak
    lane.db[b] = mean > 1e-20 ? 10 * Math.log10(mean) : -200
  }
}

function bitsAt(db: number, level: number) {
  return Math.min(Math.max(Math.ceil((db - level) / 6.02), 0), MAX_BITS)
}

function cost(
  lane: Lane,
  edges: Uint16Array,
  cut: number,
  level: number,
  penalty: number,
) {
  let total = 0
  for (let b = 0; b + 1 < edges.length; b++) {
    const width = Math.min(edges[b + 1]!, cut) - edges[b]!
    if (width <= 0) continue
    const bits = bitsAt(lane.db[b]! - penalty, level)
    if (bits > 0) total += bits * width + SIDE_INFO_BITS
  }
  return total
}

function allocate(
  mid: Lane,
  side: Lane,
  edges: Uint16Array,
  cut: number,
  budget: number,
  penalty: number,
) {
  let lo = -200
  let hi = 200
  for (let it = 0; it < 18; it++) {
    const level = (lo + hi) / 2
    const spent =
      cost(mid, edges, cut, level, 0) + cost(side, edges, cut, level, penalty)
    if (spent > budget) lo = level
    else hi = level
  }
  assign(mid, edges, cut, hi, 0)
  assign(side, edges, cut, hi, penalty)
}

function assign(
  lane: Lane,
  edges: Uint16Array,
  cut: number,
  level: number,
  penalty: number,
) {
  for (let b = 0; b + 1 < edges.length; b++) {
    const width = Math.min(edges[b + 1]!, cut) - edges[b]!
    lane.bits[b] = width > 0 ? bitsAt(lane.db[b]! - penalty, level) : 0
  }
}

function quantise(
  lane: Lane,
  edges: Uint16Array,
  cut: number,
  n: number,
  err: number,
  rng: Rng,
) {
  const c = lane.coef
  const desyncAt =
    err > 0 && rng() < err * ERR_DESYNC
      ? Math.floor(n / 8 + rng() * (cut - n / 8))
      : n
  for (let b = 0; b + 1 < edges.length; b++) {
    const lo = edges[b]!
    const hi = Math.min(edges[b + 1]!, cut)
    const bits = lane.bits[b]!
    if (hi <= lo) continue
    if (bits === 0) {
      for (let k = lo; k < hi; k++)
        c[k] = k >= desyncAt ? (rng() * 2 - 1) * lane.rms[b]! : 0
      continue
    }
    let sf = Math.ceil(4 * Math.log2(lane.peak[b]! * 2 ** (1 - bits)))
    if (err > 0 && rng() < err * ERR_SF) {
      sf = ((sf + SF_BIAS) ^ (1 << Math.floor(rng() * 5))) - SF_BIAS
    }
    const step = 2 ** (sf / 4)
    const top = 2 ** (bits - 1)
    for (let k = lo; k < hi; k++) {
      let q: number
      if (k >= desyncAt) q = Math.round((rng() * 2 - 1) * top)
      else {
        const x = c[k]! / step
        q =
          Math.sign(x) * Math.min(Math.floor(Math.abs(x) + 0.5 - DEADZONE), top)
        if (err > 0 && rng() < err * ERR_BIN) q = rng() < 0.5 ? top : -top
      }
      c[k] = q * step
    }
  }
  c.fill(0, cut, n)
}

function scatter(lane: Lane, n: number, rng: Rng) {
  for (let k = 0; k < n; k++)
    lane.coef[k] = rng() < 0.5 ? lane.held[k]! : -lane.held[k]!
}

function file(filed: Int8Array, bands: number, chance: number, rng: Rng) {
  for (let b = 0; b < bands; b++)
    filed[b] = rng() < chance ? Math.floor(rng() * bands) : -1
}

function refile(
  c: Float64Array,
  filed: Int8Array,
  edges: Uint16Array,
  cut: number,
) {
  for (let b = 0; b + 1 < edges.length; b++) {
    const o = filed[b]!
    const width =
      o < 0 ? 0 : Math.min(edges[b + 1]! - edges[b]!, edges[o + 1]! - edges[o]!)
    for (let k = 0; k < width; k++) {
      const i = edges[b]! + k
      const j = edges[o]! + k
      if (i >= cut && j >= cut) break
      const t = c[i]!
      c[i] = c[j]!
      c[j] = t
    }
  }
}

function reverse(c: Float64Array, top: number) {
  for (let i = 0, j = top - 1; i < j; i++, j--) {
    const t = c[i]!
    c[i] = c[j]!
    c[j] = t
  }
}

function intensity(
  mid: Float64Array,
  side: Float64Array,
  thrown: Int8Array,
  edges: Uint16Array,
  floor: number,
) {
  for (let b = 0; b + 1 < edges.length; b++) {
    const to = thrown[b]!
    if (to !== 0 && edges[b]! >= floor)
      for (let k = edges[b]!; k < edges[b + 1]!; k++) {
        const m = mid[k]! * Math.SQRT1_2
        mid[k] = m
        side[k] = to * m
      }
  }
}

function slow(x: Float64Array, scratch: Float64Array, n: number, rate: number) {
  copy(x, scratch, n)
  for (let k = 0; k < n; k++) {
    const at = k * rate
    const i = Math.floor(at)
    const a = scratch[i]!
    x[k] = a + (at - i) * (scratch[i + 1]! - a)
  }
}

function mirror(x: Float64Array, n: number, amount: number) {
  const g = 1 / Math.sqrt(1 + amount * amount)
  for (let k = 0; k < n / 2; k++) {
    const a = x[k]!
    const b = x[n - 1 - k]!
    x[k] = (a + amount * b) * g
    x[n - 1 - k] = (b + amount * a) * g
  }
}
