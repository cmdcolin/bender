import { IDX } from '../../engine/params.ts'
import { MIC } from '../micJacks.ts'
import { DEST } from '../modbus.ts'
import { SUPPLY, SupplyTap, type Supplies } from '../supplies.ts'
import { OnePoleLP, lpCoef } from '../util/onepole.ts'
import { octaves } from '../util/pitch.ts'
import { mulberry32, type Rng } from '../util/rng.ts'
import { flushDenormal, softclip } from '../util/softclip.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

function fold(x: number): number {
  // reflect off ±1 until inside
  x = ((((x + 1) % 4) + 4) % 4) - 1
  return x > 1 ? 2 - x : x
}

function shape(x: number, mode: number): number {
  switch (mode) {
    case 1:
      return Math.min(Math.max(x, -1), 1)
    case 2:
      return softclip(x * 1.5) * (x > 0 ? 1 : 0.6)
    case 3:
      return fold(x)
    case 4:
      return Math.abs(softclip(x)) * 2 - 1
    default:
      return softclip(x)
  }
}

export const STOCK_GAIN = 20
export const PIN_GAIN_MAX = 600

// The amp's supply pin: its own decoupling charged from whichever rail it
// sits on, emptied by its output current.
const AMP_FILL_S = 0.12
const AMP_SELF = 0.000005
const AMP_DRAW = 0.0015
// A saturated output stage draws more as the rail falls. With the current
// following the output alone, the loop settled into a sag at every Draw and
// never motorboated.
const CLIP_BOOST = 0.5
const OVER_MAX = 2
const HEAD_DROP = 0.12
const HEAD_MIN = 0.03
// An LM386 mutes below its minimum supply and won't come back until the
// bypass cap on pin 7 has recharged.
const AMP_OFF_V = 0.25
const AMP_HYST = 0.06
const MUTE_S = 0.06
const POP = 0.6
const POP_S = 0.012
// How hard the amp's supply current pulls the board's rail, per unit of draw.
const RAIL_PULL = 0.01
const XOVER = 0.6

// The gain cap across pins 1 and 8 trades bandwidth for gain, and past a few
// hundred times the amp's own phase margin runs out and it sings.
const BW_TOP = 40000
const BW_CEIL = 0.45
const DAMP_STABLE = 1.4
const DAMP_UNSTABLE = 2.4
const RING_LIMIT = 3
const IN_SAT = 1.5
const GBW_FLOOR = 0.1
const RETUNE_V = 0.002
const BYP_DROP = 0.85
const BYP_DAMP = 2.4

const RIPPLE_S = 0.08
const LEAD = 0.005
const LEAD_DRAW = 0.05
const RIPPLE_GAIN = 40
const MIC_RIPPLE = 0.05
const HISS = 2e-4

const BLOCK_CHARGE = 0.02

const CONE_LOW_HZ = 120
const CONE_SPAN = 8
const CONE_Q = 2.5
const CONE_XMAX = 1.2
const CONE_SHRINK = 0.85
const CONE_DOWN = 0.6
const RATTLE = 12
const RATTLE_S = 0.006
const GRIT = 0.35
const SLAP = 1

class Cone {
  x = 0
  v = 0
  rattle = 0
  grit = 0
  down = false

  reset() {
    this.x = 0
    this.v = 0
    this.rattle = 0
    this.grit = 0
    this.down = false
  }
}

class Side {
  s1 = 0
  s2 = 0
  over = 0
  blocked = 0
  cone = new Cone()

  reset() {
    this.s1 = 0
    this.s2 = 0
    this.over = 0
    this.blocked = 0
    this.cone.reset()
  }
}

export class Clipper implements Stage {
  label = 'clipper'
  private toneL = new OnePoleLP()
  private toneR = new OnePoleLP()
  private flipL = 1
  private flipR = 1
  private wasNegL = false
  private wasNegR = false

  private left = new Side()
  private right = new Side()
  private ampV = 1
  private rippleV = 1
  private current = 0
  private on = true
  private muted = 0
  private pop = 0
  private railWas = 1
  private gainWas = Number.NaN
  private openWas = 0
  private tunedV = 1
  private tanG = 0
  private damp = DAMP_STABLE
  private rng: Rng

  private readonly sr: number
  private readonly power: SupplyTap | null

  constructor(sr: number, supplies?: Supplies) {
    this.sr = sr
    this.power = supplies ? new SupplyTap(supplies) : null
    this.rng = mulberry32(0x386)
  }

  when(p: Float32Array) {
    return p[IDX.distMix]! > 0
  }

  // Sub-octave: a flip-flop toggling on positive-going zero crossings, like a
  // vintage octave divider. On complex input it mistracks and glitches —
  // which is the charm.
  private sub(x: number, ch: 0 | 1): number {
    const neg = x < 0
    if (ch === 0) {
      if (this.wasNegL && !neg) this.flipL = -this.flipL
      this.wasNegL = neg
      return this.flipL
    }
    if (this.wasNegR && !neg) this.flipR = -this.flipR
    this.wasNegR = neg
    return this.flipR
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const bay = ctx.mod
    const amp =
      Math.round(p[IDX.distSupply]!) !== SUPPLY.bench ||
      p[IDX.distDraw]! > 0 ||
      p[IDX.distPinGain]! > STOCK_GAIN ||
      p[IDX.distBypass]! > 0 ||
      p[IDX.distBlock]! > 0 ||
      p[IDX.distSpeaker]! > 0 ||
      bay.read(DEST.distDraw) !== null ||
      bay.read(DEST.distPinGain) !== null ||
      Math.round(p[IDX.micPatch]!) === MIC.clipBypass
    if (amp) this.circuit(io, p, ctx)
    else this.stock(io, p)
  }

  private stock(io: StereoBlock, p: Float32Array) {
    const gain = Math.pow(10, p[IDX.driveDb]! / 20)
    const bias = p[IDX.distBias]!
    const mode = Math.round(p[IDX.distMode]!)
    const subLevel = p[IDX.subLevel]!
    const mix = p[IDX.distMix]!
    const coef = lpCoef(p[IDX.distToneHz]!, this.sr)

    for (let i = 0; i < io.n; i++) {
      let xl = io.l[i]!
      let xr = io.r[i]!
      if (subLevel > 0) {
        // gate the sub on signal presence so silence stays silent
        const gateL = Math.min(Math.abs(xl) * 30, 1)
        const gateR = Math.min(Math.abs(xr) * 30, 1)
        xl += this.sub(xl, 0) * subLevel * gateL * 0.7
        xr += this.sub(xr, 1) * subLevel * gateR * 0.7
      }
      const wl = this.toneL.process(shape(xl * gain + bias, mode), coef)
      const wr = this.toneR.process(shape(xr * gain + bias, mode), coef)
      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
  }

  // The toy's own output stage: an LM386 on one of the board's supplies,
  // into a small speaker.
  private circuit(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const sr = this.sr
    const n = io.n
    const drive = Math.pow(10, p[IDX.driveDb]! / 20)
    const bias = p[IDX.distBias]!
    const mode = Math.round(p[IDX.distMode]!)
    const subLevel = p[IDX.subLevel]!
    const mix = p[IDX.distMix]!
    const coef = lpCoef(p[IDX.distToneHz]!, sr)

    const choice = Math.round(p[IDX.distSupply]!)
    const rail =
      this.power && choice !== SUPPLY.bench ? this.power.pick(choice) : null
    const railTo = rail ? rail.v : 1
    const railFrom = this.railWas
    this.railWas = railTo

    const drawBase = p[IDX.distDraw]!
    const modDraw = ctx.mod.read(DEST.distDraw)
    const gainBase = p[IDX.distPinGain]!
    const modGain = ctx.mod.read(DEST.distPinGain)
    const open = p[IDX.distBypass]!
    const bypass = open * RIPPLE_GAIN
    const mute = Math.round(MUTE_S * (1 - open) * sr)
    const mic = Math.round(p[IDX.micPatch]!) === MIC.clipBypass ? ctx.mic : null
    const block = p[IDX.distBlock]!
    const blockKeep = Math.exp(-1 / ((0.03 + 0.4 * block) * sr))
    const speaker = p[IDX.distSpeaker]!

    const fill = 1 / (AMP_FILL_S * sr)
    const rippleK = 1 / (RIPPLE_S * sr)
    const popKeep = Math.exp(-1 / (POP_S * sr))

    const w0 = (2 * Math.PI * CONE_LOW_HZ * Math.pow(CONE_SPAN, speaker)) / sr
    const coneK = w0 * w0
    const coneDamp = w0 / CONE_Q
    const xUp = CONE_XMAX * (1 - CONE_SHRINK * speaker)
    const xDown = xUp * CONE_DOWN
    const rattleKeep = Math.exp(-1 / (RATTLE_S * sr))

    const left = this.left
    const right = this.right
    let pulled = 0
    for (let i = 0; i < n; i++) {
      const draw = modDraw
        ? Math.min(Math.max(drawBase + modDraw[i]!, 0), 1)
        : drawBase
      const src = railFrom + ((railTo - railFrom) * (i + 1)) / n
      const out = this.current * (AMP_SELF + AMP_DRAW * draw)
      this.ampV = Math.max(this.ampV + fill * (src - this.ampV) - out, 0)
      pulled += this.current * draw
      const pin = this.ampV - this.current * (LEAD + LEAD_DRAW * draw)
      this.rippleV += rippleK * (pin - this.rippleV)
      if (this.on) {
        if (this.ampV < AMP_OFF_V) {
          this.on = false
          this.muted = mute
        }
      } else if (--this.muted <= 0 && this.ampV > AMP_OFF_V + AMP_HYST) {
        this.on = true
        this.pop = POP
      }
      const head = Math.min(
        Math.max((this.ampV - HEAD_DROP) / (1 - HEAD_DROP), HEAD_MIN),
        1,
      )
      const xover = XOVER * head * (1 - head)

      const g = modGain
        ? Math.min(gainBase * octaves(modGain[i]! * 4), PIN_GAIN_MAX * 2)
        : gainBase
      if (
        g !== this.gainWas ||
        open !== this.openWas ||
        Math.abs(this.ampV - this.tunedV) > RETUNE_V
      )
        this.tune(g, open)
      const k = (drive * g) / STOCK_GAIN

      let ripple = (pin - this.rippleV) * bypass + HISS * (this.rng() - 0.5)
      if (mic) ripple += mic[i]! * MIC_RIPPLE * RIPPLE_GAIN

      let xl = io.l[i]!
      let xr = io.r[i]!
      if (subLevel > 0) {
        const gateL = Math.min(Math.abs(xl) * 30, 1)
        const gateR = Math.min(Math.abs(xr) * 30, 1)
        xl += this.sub(xl, 0) * subLevel * gateL * 0.7
        xr += this.sub(xr, 1) * subLevel * gateR * 0.7
      }
      let yl = this.stage(left, (xl + ripple) * k + bias, mode, head, block)
      let yr = this.stage(right, (xr + ripple) * k + bias, mode, head, block)
      if (block > 0) {
        left.blocked = flushDenormal(
          left.blocked * blockKeep + BLOCK_CHARGE * block * left.over,
        )
        right.blocked = flushDenormal(
          right.blocked * blockKeep + BLOCK_CHARGE * block * right.over,
        )
      }
      if (xover > 0) {
        yl = yl > xover ? yl - xover : yl < -xover ? yl + xover : 0
        yr = yr > xover ? yr - xover : yr < -xover ? yr + xover : 0
      }
      if (this.on) {
        this.current =
          (Math.abs(yl) +
            Math.abs(yr) +
            CLIP_BOOST * (left.over + right.over)) *
          0.5
      } else {
        this.current = 0
        yl = 0
        yr = 0
      }
      let wl = this.toneL.process(yl + this.pop, coef)
      let wr = this.toneR.process(yr + this.pop, coef)
      this.pop = flushDenormal(this.pop * popKeep)
      if (speaker > 0) {
        wl = this.cone(left.cone, wl, coneK, coneDamp, xUp, xDown, rattleKeep)
        wr = this.cone(right.cone, wr, coneK, coneDamp, xUp, xDown, rattleKeep)
      }
      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
    if (rail && pulled > 0) {
      rail.spiking += (RAIL_PULL * pulled) / n
      rail.drawing += pulled / n
    }
  }

  private tune(g: number, open: number) {
    this.gainWas = g
    this.openWas = open
    this.tunedV = this.ampV
    const rel = g / STOCK_GAIN
    const supply = Math.min(Math.max(this.ampV, GBW_FLOOR), 1)
    const fc =
      Math.min(BW_TOP / rel, BW_CEIL * this.sr) * (1 - BYP_DROP * open) * supply
    this.tanG = Math.tan((Math.PI * fc) / this.sr)
    const unstable = Math.max(Math.log2(rel) - 2, 0) / 3
    this.damp = DAMP_STABLE - DAMP_UNSTABLE * unstable - BYP_DAMP * open
  }

  private stage(
    s: Side,
    x: number,
    mode: number,
    head: number,
    block: number,
  ): number {
    if (block > 0) {
      const b = s.blocked
      x -= 0.5 * b
      x = x > b ? x - b : x < -b ? x + b : 0
    }
    x = softclip(x / IN_SAT) * IN_SAT
    const g = this.tanG
    const hp = (x - (this.damp + g) * s.s1 - s.s2) / (1 + this.damp * g + g * g)
    const bp = g * hp + s.s1
    s.s1 = flushDenormal(softclip((g * hp + bp) / RING_LIMIT) * RING_LIMIT)
    const lp = g * bp + s.s2
    s.s2 = flushDenormal(g * bp + lp)
    s.over = Math.min(Math.max(Math.abs(lp) - head, 0), OVER_MAX)
    return head * shape(lp / head, mode)
  }

  private cone(
    c: Cone,
    f: number,
    k: number,
    damp: number,
    xUp: number,
    xDown: number,
    rattleKeep: number,
  ): number {
    const was = c.v
    c.v += k * (f - c.x) - damp * c.v
    c.x += c.v
    const out = c.x > xUp || c.x < -xDown
    if (out) {
      c.x = c.x > 0 ? xUp : -xDown
      if (!c.down)
        c.rattle = Math.max(c.rattle, Math.min(Math.abs(c.v) * RATTLE, 1))
      c.v = 0
    }
    c.down = out
    c.grit += GRIT * (this.rng() * 2 - 1 - c.grit)
    const buzz = c.rattle * c.grit
    c.rattle = flushDenormal(c.rattle * rattleKeep)
    return Math.min(Math.max((c.v - was) / k, -SLAP), SLAP) + buzz
  }

  panic() {
    this.toneL.reset()
    this.toneR.reset()
    this.flipL = 1
    this.flipR = 1
    this.wasNegL = false
    this.wasNegR = false
    this.left.reset()
    this.right.reset()
    this.ampV = 1
    this.rippleV = 1
    this.current = 0
    this.on = true
    this.muted = 0
    this.pop = 0
    this.railWas = 1
    this.gainWas = Number.NaN
  }
}
