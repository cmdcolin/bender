import { IDX } from '../../engine/params.ts'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from '../stage.ts'
import { N_DRUM_VOICES, voiceMask } from '../trigbus.ts'
import { mulberry32, type Rng } from '../util/rng.ts'

// A steel sheet with contact mics on it, measured against contact-mic
// recordings: agent-docs/reference/metal-sheet.md.

export const SHEET_KEY_CHOICE = N_DRUM_VOICES + 2

const MODES = 128
const GRID = 56
const WIDTH = 1.2
const DEPTH = 0.9
const KAPPA = 1.22
const LOWEST_HZ = 25
const TOP_HZ = 12000
const MODES_PER_HZ = ((Math.PI / 4) * WIDTH * DEPTH) / ((Math.PI / 2) * KAPPA)
const PICKUPS = [
  [0.31, 0.17],
  [0.83, 0.64],
] as const
const DRIVER = [0.74, 0.52] as const
const TILT_HZ = 1500
const SHAKE_TILT_HZ = 600
const MAX_BOOST = 4
const LOW_HZ = 400
const RING_SPREAD = 0.7
const HIGH_RING_S = 0.2
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
const LOUD = 1.2
const STRIKE_GAIN = 1
const SHAKE_GAIN = 0.004
const OUT_GAIN = 0.06
const FOLLOW_HZ = 20

const plateHz = (kx: number, ky: number) =>
  (Math.PI / 2) * KAPPA * ((kx / Math.PI) ** 2 + (ky / Math.PI) ** 2)

export class Sheet implements Stage {
  label = 'sheet'
  private readonly hz = new Float64Array(MODES)
  private readonly spread = new Float64Array(MODES)
  private readonly kx = new Float64Array(MODES)
  private readonly ky = new Float64Array(MODES)
  private readonly px = new Float64Array(MODES)
  private readonly py = new Float64Array(MODES)
  private readonly boost = new Float64Array(MODES)
  private readonly outL = new Float64Array(MODES)
  private readonly outR = new Float64Array(MODES)
  private readonly drive = new Float64Array(MODES)
  private readonly rattleIn = new Float64Array(MODES)
  private readonly low = new Uint8Array(MODES)
  private readonly struckIn = new Float64Array(MODES)
  private readonly a1 = new Float64Array(MODES)
  private readonly a2 = new Float64Array(MODES)
  private readonly y1 = new Float64Array(MODES)
  private readonly y2 = new Float64Array(MODES)
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
  private readonly sr: number

  constructor(sr: number, seed = 0x5ee7) {
    this.sr = sr
    this.seed = seed
    this.rng = mulberry32(seed)
    this.layout()
  }

  private layout() {
    const rng = mulberry32(this.seed ^ 0x1a7e)
    const grid: [number, number][] = []
    for (let m = 1; m < 40; m++)
      for (let n = 1; n < 40; n++) {
        const kx = (m * Math.PI) / WIDTH
        const ky = (n * Math.PI) / DEPTH
        if (plateHz(kx, ky) >= LOWEST_HZ) grid.push([kx, ky])
      }
    grid.sort((a, b) => plateHz(...a) - plateHz(...b))
    const gridTop = plateHz(...grid[GRID - 1]!)
    const sampled = MODES - GRID
    for (let j = 0; j < MODES; j++) {
      const inGrid = j < GRID
      const f = inGrid
        ? plateHz(...grid[j]!)
        : gridTop * (TOP_HZ / gridTop) ** ((j - GRID + rng()) / sampled)
      const k = Math.PI * Math.sqrt(f / ((Math.PI / 2) * KAPPA))
      const angle = rng() * 2 * Math.PI
      this.kx[j] = inGrid ? grid[j]![0] : k * Math.cos(angle)
      this.ky[j] = inGrid ? grid[j]![1] : k * Math.sin(angle)
      this.px[j] = inGrid ? 0 : rng() * 2 * Math.PI
      this.py[j] = inGrid ? 0 : rng() * 2 * Math.PI
      this.boost[j] = inGrid
        ? 1
        : Math.min(
            MAX_BOOST,
            Math.sqrt(
              (MODES_PER_HZ * f * Math.log(TOP_HZ / gridTop)) / sampled,
            ),
          )
      this.hz[j] = f * (1 + (rng() - 0.5) * 0.03)
      this.spread[j] = Math.exp(
        RING_SPREAD *
          Math.sqrt(-2 * Math.log(rng() + 1e-12)) *
          Math.cos(2 * Math.PI * rng()),
      )
      const tilt = 1 / (1 + f / TILT_HZ)
      this.outL[j] = this.shape(j, PICKUPS[0][0], PICKUPS[0][1]) * tilt
      this.outR[j] = this.shape(j, PICKUPS[1][0], PICKUPS[1][1]) * tilt
      this.drive[j] =
        this.shape(j, DRIVER[0], DRIVER[1]) / (1 + f / SHAKE_TILT_HZ)
      this.rattleIn[j] =
        (rng() * 2 - 1) * this.boost[j]! * Math.min(1, f / 2500)
      this.low[j] = f < LOW_HZ ? 1 : 0
    }
  }

  private shape(j: number, x: number, y: number) {
    return (
      this.boost[j]! *
      Math.sin(this.kx[j]! * x + this.px[j]!) *
      Math.sin(this.ky[j]! * y + this.py[j]!)
    )
  }

  when(p: Float32Array) {
    return p[IDX.sheetLevel]! > 0
  }

  /** A hand on the sheet: where, as fractions of its width and depth, and how hard. */
  strikeAt(x: number, y: number, gain: number) {
    this.handX = Math.min(Math.max(x, 0), 1)
    this.handY = Math.min(Math.max(y, 0), 1)
    this.handGain = gain
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const sr = this.sr
    const n = io.n
    const level = p[IDX.sheetLevel]!
    const strikeOdds = p[IDX.sheetStrikes]! / sr
    const struckBy = Math.round(p[IDX.sheetStruckBy]!)
    const mask = voiceMask(struckBy)
    const hard = Math.min(Math.max(p[IDX.sheetHard]!, 0), 1)
    const pulse = Math.max(
      2,
      Math.round(sr * SOFTEST_S * (HARDEST_S / SOFTEST_S) ** hard),
    )
    const size = Math.max(p[IDX.sheetSize]!, 0.05)
    const hold = HOLD_RANGE ** Math.min(Math.max(p[IDX.sheetHold]!, 0), 1)
    const shake = p[IDX.sheetShake]! ** 2 * SHAKE_GAIN
    const rattle = p[IDX.sheetRattle]!
    this.tune(size, hold)

    const { struck, shaken, rattled } = this
    const over = Math.max(0, this.loud / LOUD - RATTLE_FLOOR)
    const fill = (RATTLE_FILL * rattle * over * over) / sr
    const empty = 1 / (RATTLE_EMPTY_S * sr)
    let anyStruck = false
    let anyRattle = false
    if (this.handGain > 0) {
      this.land(this.handGain, pulse, this.handX * WIDTH, this.handY * DEPTH)
      this.handGain = 0
    }
    for (let i = 0; i < n; i++) {
      if (this.rng() < strikeOdds) this.strike(0.5 + 0.5 * this.rng(), pulse)
      if (struckBy > 0) {
        const hit =
          struckBy === SHEET_KEY_CHOICE
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
    for (let j = 0; j < MODES; j += 4)
      this.ring(j, n, anyStruck, shake !== 0, anyRattle)

    const follow = 1 - Math.exp((-2 * Math.PI * FOLLOW_HZ) / sr)
    for (let i = 0; i < n; i++) {
      this.loud += follow * (Math.abs(lows[i]!) - this.loud)
      io.l[i]! += wetL[i]! * OUT_GAIN * level
      io.r[i]! += wetR[i]! * OUT_GAIN * level
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
    const { a1, a2, struckIn, drive, rattleIn, outL, outR, low } = this
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
    const rise = 1 + RISE * Math.min(1, (this.loud / LOUD) ** 2)
    for (let j = 0; j < MODES; j++) {
      const f = (this.hz[j]! / size) * rise
      const ring = hold * (0.05 + (1.6 * 50) / (f + 50)) * this.spread[j]!
      const t60 = f > 2000 ? Math.min(ring, HIGH_RING_S * hold) : ring
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
      0.05 + this.rng() * (WIDTH - 0.1),
      0.05 + this.rng() * (DEPTH - 0.1),
    )
  }

  private land(amp: number, pulse: number, x: number, y: number) {
    for (let j = 0; j < MODES; j++) this.struckIn[j] = this.shape(j, x, y)
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
    this.y1.fill(0)
    this.y2.fill(0)
    this.rng = mulberry32(this.seed)
    this.pulseLeft = 0
    this.bounceIn = 0
    this.loud = 0
    this.reservoir = 0
    this.rattleLeft = 0
    this.handGain = 0
  }
}
