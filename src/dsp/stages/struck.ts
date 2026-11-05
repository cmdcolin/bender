import { IDX } from '../../engine/params.ts'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from '../stage.ts'
import { N_DRUM_VOICES, voiceMask } from '../trigbus.ts'
import { mulberry32, type Rng } from '../util/rng.ts'

// Something hard with contact mics on it, struck at random, by a kit voice, a
// key or a hand, shaken by the board's own output and rattling when loud. A
// Body says what it is: agent-docs/reference/metal-sheet.md has the numbers.

export const KEY_CHOICE = N_DRUM_VOICES + 2

const HOLD_RANGE = 6
const SOFTEST_S = 0.004
const HARDEST_S = 0.0003
const BOUNCE_ODDS = 0.45
const BOUNCE_S = [0.05, 0.18] as const
const BOUNCE_LOSS = 0.35
const RISE = 0.025
const RATTLE_FLOOR = 0.5
const RATTLE_FILL = 6
const RATTLE_EMPTY_S = 0.15
const RATTLE_HZ = 35
const RATTLE_KICK = 0.05
const STRIKE_GAIN = 1
const FOLLOW_HZ = 20
const EDGE = 0.04

export interface Couplings {
  readonly hz: Float64Array
  readonly outL: Float64Array
  readonly outR: Float64Array
  readonly drive: Float64Array
  readonly rattleIn: Float64Array
  readonly low: Uint8Array
}

export interface Body {
  /** A multiple of four. */
  readonly modes: number
  readonly outGain: number
  /** The low modes' level a full strike reaches. */
  readonly loud: number
  readonly shakeGain: number
  lay(c: Couplings): void
  /** How a strike at x and y, as fractions of the face, couples into mode j. */
  shape(j: number, x: number, y: number): number
  /** Seconds mode j takes to fall 60 dB at f Hz, held as hold (1 to 6). */
  ring(j: number, f: number, hold: number): number
  /** The body's own knobs, as a factor on each mode's pitch and on its ring. */
  retune?(p: Float32Array, pitch: Float64Array, ring: Float64Array): void
}

const keysOf = (name: 'sheet' | 'bottle') => ({
  level: IDX[`${name}Level`],
  strikes: IDX[`${name}Strikes`],
  struckBy: IDX[`${name}StruckBy`],
  hard: IDX[`${name}Hard`],
  size: IDX[`${name}Size`],
  hold: IDX[`${name}Hold`],
  shake: IDX[`${name}Shake`],
  rattle: IDX[`${name}Rattle`],
})

export class Struck implements Stage {
  readonly label: string
  private readonly body: Body
  private readonly keys: ReturnType<typeof keysOf>
  private readonly modes: number
  private readonly c: Couplings
  private readonly pitch: Float64Array
  private readonly ringBy: Float64Array
  private readonly struckIn: Float64Array
  private readonly a1: Float64Array
  private readonly a2: Float64Array
  private readonly y1: Float64Array
  private readonly y2: Float64Array
  private readonly struck = new Float64Array(BLOCK)
  private readonly shaken = new Float64Array(BLOCK)
  private readonly rattled = new Float64Array(BLOCK)
  private readonly wetL = new Float64Array(BLOCK)
  private readonly wetR = new Float64Array(BLOCK)
  private readonly lows = new Float64Array(BLOCK)
  private rng: Rng
  private readonly seed: number
  private pulseLeft = 0
  private pulseLen = 1
  private pulseAmp = 0
  private bounceIn = 0
  private bounceAmp = 0
  private loud = 0
  private reservoir = 0
  private rattleLeft = 0
  private rattleAmp = 0
  private handX = 0
  private handY = 0
  private handGain = 0
  private hushed = true
  private readonly sr: number

  constructor(label: 'sheet' | 'bottle', sr: number, seed: number, body: Body) {
    this.label = label
    this.sr = sr
    this.seed = seed
    this.body = body
    this.keys = keysOf(label)
    this.rng = mulberry32(seed)
    const m = body.modes
    this.modes = m
    this.c = {
      hz: new Float64Array(m),
      outL: new Float64Array(m),
      outR: new Float64Array(m),
      drive: new Float64Array(m),
      rattleIn: new Float64Array(m),
      low: new Uint8Array(m),
    }
    this.pitch = new Float64Array(m).fill(1)
    this.ringBy = new Float64Array(m).fill(1)
    this.struckIn = new Float64Array(m)
    this.a1 = new Float64Array(m)
    this.a2 = new Float64Array(m)
    this.y1 = new Float64Array(m)
    this.y2 = new Float64Array(m)
    body.lay(this.c)
  }

  // At level 0 the chain stops running it, so it rests there: turned back up it
  // starts still, and a hand on it while it was silent never lands.
  when(p: Float32Array) {
    const on = p[this.keys.level]! > 0
    if (!on) {
      if (!this.hushed) this.hush()
      this.handGain = 0
    }
    this.hushed = !on
    return on
  }

  /** A hand on it: where, as fractions of its face, and how hard. */
  strikeAt(x: number, y: number, gain: number) {
    this.handX = Math.min(Math.max(x, 0), 1)
    this.handY = Math.min(Math.max(y, 0), 1)
    this.handGain = gain
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const sr = this.sr
    const n = io.n
    const k = this.keys
    const level = p[k.level]!
    const strikeOdds = p[k.strikes]! / sr
    const struckBy = Math.round(p[k.struckBy]!)
    const mask = voiceMask(struckBy)
    const hard = Math.min(Math.max(p[k.hard]!, 0), 1)
    const pulse = Math.max(
      2,
      Math.round(sr * SOFTEST_S * (HARDEST_S / SOFTEST_S) ** hard),
    )
    const size = Math.max(p[k.size]!, 0.05)
    const hold = HOLD_RANGE ** Math.min(Math.max(p[k.hold]!, 0), 1)
    const shake = p[k.shake]! ** 2 * this.body.shakeGain
    const rattle = p[k.rattle]!
    this.body.retune?.(p, this.pitch, this.ringBy)
    this.tune(size, hold)

    const { struck, shaken, rattled } = this
    const over = Math.max(0, this.loud / this.body.loud - RATTLE_FLOOR)
    const fill = (RATTLE_FILL * rattle * over * over) / sr
    const empty = 1 / (RATTLE_EMPTY_S * sr)
    let anyStruck = false
    let anyRattle = false
    if (this.handGain > 0) {
      this.land(this.handGain, pulse, this.handX, this.handY)
      this.handGain = 0
    }
    for (let i = 0; i < n; i++) {
      if (this.rng() < strikeOdds) this.strike(0.5 + 0.5 * this.rng(), pulse)
      if (struckBy > 0) {
        const hit =
          struckBy === KEY_CHOICE
            ? ctx.trig.key[i]! > 0
            : (Math.round(ctx.trig.drumBits[i]!) & mask) !== 0
        if (hit) this.strike(Math.max(ctx.trig.drumGain[i]!, 0.6), pulse)
      }
      if (this.bounceIn > 0) {
        this.bounceIn--
        if (this.bounceIn === 0) this.hitAgain(pulse)
      }
      struck[i] =
        this.pulseLeft > 0
          ? this.pulseAmp *
            Math.sin((Math.PI * this.pulseLeft--) / this.pulseLen)
          : 0
      this.reservoir += fill - this.reservoir * empty
      if (
        this.rattleLeft === 0 &&
        this.rng() < (this.reservoir * RATTLE_HZ) / sr
      ) {
        this.rattleLeft = 2 + Math.floor(this.rng() * 12)
        this.rattleAmp =
          (this.rng() < 0.5 ? -RATTLE_KICK : RATTLE_KICK) * (0.3 + this.rng())
      }
      rattled[i] = this.rattleLeft > 0 ? this.rattleAmp : 0
      this.rattleLeft = Math.max(0, this.rattleLeft - 1)
      shaken[i] = ctx.out[i]! * shake
      anyStruck ||= struck[i] !== 0
      anyRattle ||= rattled[i] !== 0
    }

    const { wetL, wetR, lows } = this
    wetL.fill(0)
    wetR.fill(0)
    lows.fill(0)
    for (let j = 0; j < this.modes; j += 4)
      this.ring(j, n, anyStruck, shake !== 0, anyRattle)

    const follow = 1 - Math.exp((-2 * Math.PI * FOLLOW_HZ) / sr)
    const gain = this.body.outGain * level
    for (let i = 0; i < n; i++) {
      this.loud += follow * (Math.abs(lows[i]!) - this.loud)
      io.l[i]! += wetL[i]! * gain
      io.r[i]! += wetR[i]! * gain
    }
    this.loud = this.loud < 1e-15 ? 0 : this.loud
    this.reservoir = this.reservoir < 1e-15 ? 0 : this.reservoir
  }

  private ring(
    j: number,
    n: number,
    struck: boolean,
    shaken: boolean,
    rattled: boolean,
  ) {
    const { a1, a2, struckIn } = this
    const { drive, rattleIn, outL, outR, low } = this.c
    const pa = a1[j]!
    const pb = a1[j + 1]!
    const pc = a1[j + 2]!
    const pd = a1[j + 3]!
    const qa = a2[j]!
    const qb = a2[j + 1]!
    const qc = a2[j + 2]!
    const qd = a2[j + 3]!
    const sa = struck ? struckIn[j]! : 0
    const sb = struck ? struckIn[j + 1]! : 0
    const sc = struck ? struckIn[j + 2]! : 0
    const sd = struck ? struckIn[j + 3]! : 0
    const da = shaken ? drive[j]! : 0
    const db = shaken ? drive[j + 1]! : 0
    const dc = shaken ? drive[j + 2]! : 0
    const dd = shaken ? drive[j + 3]! : 0
    const ka = rattled ? rattleIn[j]! : 0
    const kb = rattled ? rattleIn[j + 1]! : 0
    const kc = rattled ? rattleIn[j + 2]! : 0
    const kd = rattled ? rattleIn[j + 3]! : 0
    const la = outL[j]!
    const lb = outL[j + 1]!
    const lc = outL[j + 2]!
    const ld = outL[j + 3]!
    const ra = outR[j]!
    const rb = outR[j + 1]!
    const rc = outR[j + 2]!
    const rd = outR[j + 3]!
    const ma = low[j]! * la
    const mb = low[j + 1]! * lb
    const mc = low[j + 2]! * lc
    const md = low[j + 3]! * ld
    const s = this.struck
    const h = this.shaken
    const r = this.rattled
    const wl = this.wetL
    const wr = this.wetR
    const lows = this.lows
    let ya = this.y1[j]!
    let yb = this.y1[j + 1]!
    let yc = this.y1[j + 2]!
    let yd = this.y1[j + 3]!
    let za = this.y2[j]!
    let zb = this.y2[j + 1]!
    let zc = this.y2[j + 2]!
    let zd = this.y2[j + 3]!
    for (let i = 0; i < n; i++) {
      const si = s[i]!
      const hi = h[i]!
      const ri = r[i]!
      const na = pa * ya + qa * za + si * sa + hi * da + ri * ka
      const nb = pb * yb + qb * zb + si * sb + hi * db + ri * kb
      const nc = pc * yc + qc * zc + si * sc + hi * dc + ri * kc
      const nd = pd * yd + qd * zd + si * sd + hi * dd + ri * kd
      const va = na - ya
      const vb = nb - yb
      const vc = nc - yc
      const vd = nd - yd
      za = ya
      zb = yb
      zc = yc
      zd = yd
      ya = na
      yb = nb
      yc = nc
      yd = nd
      wl[i]! += va * la + vb * lb + vc * lc + vd * ld
      wr[i]! += va * ra + vb * rb + vc * rc + vd * rd
      lows[i]! += va * ma + vb * mb + vc * mc + vd * md
    }
    this.settle(j, ya, za)
    this.settle(j + 1, yb, zb)
    this.settle(j + 2, yc, zc)
    this.settle(j + 3, yd, zd)
  }

  private settle(j: number, y1: number, y2: number) {
    const quiet = Math.abs(y1) < 1e-15 && Math.abs(y2) < 1e-15
    this.y1[j] = quiet ? 0 : y1
    this.y2[j] = quiet ? 0 : y2
  }

  private tune(size: number, hold: number) {
    const sr = this.sr
    const rise = 1 + RISE * Math.min(1, (this.loud / this.body.loud) ** 2)
    for (let j = 0; j < this.modes; j++) {
      const f = (this.c.hz[j]! / size) * rise * this.pitch[j]!
      const t60 = this.body.ring(j, f, hold) * this.ringBy[j]!
      const radius = Math.exp(-6.91 / (t60 * sr))
      this.a1[j] =
        f < 0.45 * sr ? 2 * radius * Math.cos((2 * Math.PI * f) / sr) : 0
      this.a2[j] = f < 0.45 * sr ? -radius * radius : 0
    }
  }

  private strike(amp: number, pulse: number) {
    this.land(
      amp,
      pulse,
      EDGE + this.rng() * (1 - 2 * EDGE),
      EDGE + this.rng() * (1 - 2 * EDGE),
    )
  }

  private land(amp: number, pulse: number, x: number, y: number) {
    for (let j = 0; j < this.modes; j++)
      this.struckIn[j] = this.body.shape(j, x, y)
    this.bounceAmp = amp * BOUNCE_LOSS
    this.bounceIn =
      this.rng() < BOUNCE_ODDS
        ? Math.round(
            this.sr * (BOUNCE_S[0] + this.rng() * (BOUNCE_S[1] - BOUNCE_S[0])),
          )
        : 0
    this.pulseOf(amp, pulse)
  }

  private hitAgain(pulse: number) {
    const amp = this.bounceAmp
    this.bounceAmp *= BOUNCE_LOSS
    this.bounceIn =
      this.rng() < BOUNCE_ODDS * 0.5
        ? Math.round(this.sr * BOUNCE_S[0] * (0.5 + this.rng()))
        : 0
    this.pulseOf(amp, pulse)
  }

  private pulseOf(amp: number, pulse: number) {
    this.pulseLen = pulse
    this.pulseLeft = pulse
    this.pulseAmp = (amp * STRIKE_GAIN * Math.PI) / (2 * pulse)
  }

  panic() {
    this.hush()
    this.rng = mulberry32(this.seed)
  }

  private hush() {
    this.y1.fill(0)
    this.y2.fill(0)
    this.pulseLeft = 0
    this.bounceIn = 0
    this.loud = 0
    this.reservoir = 0
    this.rattleLeft = 0
    this.handGain = 0
  }
}
