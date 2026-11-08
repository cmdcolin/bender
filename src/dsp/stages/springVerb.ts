import { IDX } from '../../engine/params.ts'
import { DEST } from '../modbus.ts'
import { BLOCK, type Ctx, type Stage, type StereoBlock } from '../stage.ts'
import { DEAD_V } from '../toyRail.ts'
import { rail } from '../util/bridged.ts'
import { ringSize } from '../util/delayline.ts'
import { Transient } from '../util/follower.ts'
import { SineOsc } from '../util/lfo.ts'
import { DcBlocker, lpCoef } from '../util/onepole.ts'
import { mulberry32, type Rng } from '../util/rng.ts'
import { flushDenormal, softclip } from '../util/softclip.ts'

const AP_MS = [1.7, 2.9, 4.7, 6.3, 8.3, 11.9]
const COMB_MS = [31, 37, 41, 43]
const N_AP = AP_MS.length
const N_COMB = COMB_MS.length

const WARBLE_MS = 12
const WARBLE_HZ = [0.2, 1.3]
const WARBLE_SPREAD = [1, 1.37, 0.71, 1.19]

const CRASH_S = 0.05
const CRASH_AMP = 2.5

const CHIRP_STAGES = 32
const LAP_STAGES = 4
const CHIRP_HZ = 2500
const DIFFUSE = 0.6

const HOWL_GAIN = 0.15
const HOWL_SUPPLY = 0.05

class Tank {
  private readonly buf: Float32Array
  private readonly off = new Int32Array(N_AP + N_COMB)
  private readonly mask = new Int32Array(N_AP + N_COMB)
  private readonly whole = new Int32Array(N_AP + N_COMB)
  private readonly frac = new Float64Array(N_AP + N_COMB)
  private readonly pos = new Int32Array(N_AP + N_COMB)
  private readonly damp = new Float64Array(N_COMB)
  private readonly swing = Array.from({ length: N_COMB }, () => new SineOsc())
  private readonly swingK = new Float64Array(N_COMB)
  private readonly chain: Float64Array
  private readonly mid = new Float64Array(BLOCK)
  private readonly stretch: number
  private cursor = 0
  readonly delaySec: Float64Array

  private readonly rateX: number

  constructor(delays: number[], sr: number, rateX: number) {
    this.rateX = rateX
    this.stretch = Math.max(Math.round(sr / (2 * CHIRP_HZ)), 1)
    this.chain = new Float64Array(
      (CHIRP_STAGES + N_COMB * LAP_STAGES) * this.stretch,
    )
    let acc = 0
    const warble = (WARBLE_MS / 1000) * sr
    for (let k = 0; k < delays.length; k++) {
      const d = Math.max(delays[k]!, 1)
      const size = ringSize(Math.ceil(d + 4 + (k >= N_AP ? warble : 0)))
      this.off[k] = acc
      this.mask[k] = size - 1
      this.whole[k] = Math.floor(d)
      this.frac[k] = d - Math.floor(d)
      acc += size
    }
    this.buf = new Float32Array(acc)
    this.delaySec = Float64Array.from(delays, d => d / sr)
  }

  run(
    input: Float64Array,
    wet: Float64Array,
    n: number,
    boing: number,
    fb: Float64Array,
    dampCoef: number,
    swingDepth: number,
    swingK: number,
    chirp: number,
  ) {
    const buf = this.buf
    const chain = this.chain
    const mid = this.mid
    const stretch = this.stretch
    let cursor = this.cursor
    const off = this.off
    const mask = this.mask
    const pos = this.pos
    const whole = this.whole
    const frac = this.frac
    const damp = this.damp
    const swing = this.swing
    const ks = this.swingK
    for (let j = 0; j < N_COMB; j++)
      ks[j] = swingK * WARBLE_SPREAD[j]! * this.rateX

    for (let i = 0; i < n; i++) {
      let x = input[i]!
      for (let k = 0; k < N_AP; k++) {
        const o = off[k]!
        const m = mask[k]!
        const p = pos[k]! - 1 - whole[k]!
        const a = buf[o + (p & m)]!
        const d = a + frac[k]! * (buf[o + ((p - 1) & m)]! - a)
        const w = x + boing * d
        buf[o + pos[k]!] = w
        pos[k] = (pos[k]! + 1) & m
        x = d - boing * w
      }
      mid[i] = flushDenormal(x)
    }

    for (let s = 0; s < CHIRP_STAGES; s++) {
      const ring = s * stretch
      for (let phase = 0; phase < stretch; phase++) {
        const slot = ring + ((cursor + phase) % stretch)
        let held = chain[slot]!
        for (let i = phase; i < n; i += stretch) {
          const w = mid[i]! + chirp * held
          mid[i] = held - chirp * w
          held = w
        }
        chain[slot] = flushDenormal(held)
      }
    }

    for (let i = 0; i < n; i++) {
      const x = mid[i]!
      let sum = 0
      for (let j = 0; j < N_COMB; j++) {
        const k = N_AP + j
        const o = off[k]!
        const m = mask[k]!
        let d: number
        if (swingDepth > 0) {
          const at = whole[k]! + frac[k]! + swingDepth * swing[j]!.step(ks[j]!)
          const w = at | 0
          const p = pos[k]! - 1 - w
          const a = buf[o + (p & m)]!
          d = a + (at - w) * (buf[o + ((p - 1) & m)]! - a)
        } else {
          const p = pos[k]! - 1 - whole[k]!
          const a = buf[o + (p & m)]!
          d = a + frac[k]! * (buf[o + ((p - 1) & m)]! - a)
        }
        const y = damp[j]! + dampCoef * (d - damp[j]!)
        damp[j] = Math.abs(y) < 1e-15 ? 0 : y
        let v = rail(x + fb[j]! * y)
        const first = (CHIRP_STAGES + j * LAP_STAGES) * stretch + cursor
        for (let s = 0; s < LAP_STAGES; s++) {
          const slot = first + s * stretch
          const held = chain[slot]!
          const w = flushDenormal(v + chirp * held)
          chain[slot] = w
          v = held - chirp * w
        }
        buf[o + pos[k]!] = v
        pos[k] = (pos[k]! + 1) & m
        sum += d
      }
      wet[i] = sum
      cursor = cursor + 1 === stretch ? 0 : cursor + 1
    }
    this.cursor = cursor
  }

  reset() {
    this.buf.fill(0)
    this.pos.fill(0)
    this.damp.fill(0)
    this.chain.fill(0)
    this.cursor = 0
    for (const s of this.swing) s.reset()
  }
}

export class SpringVerb implements Stage {
  label = 'springVerb'
  private tankL: Tank
  private tankR: Tank
  private readonly fbL = new Float64Array(N_COMB)
  private readonly fbR = new Float64Array(N_COMB)
  private readonly inL = new Float64Array(BLOCK)
  private readonly inR = new Float64Array(BLOCK)
  private readonly wetL = new Float64Array(BLOCK)
  private readonly wetR = new Float64Array(BLOCK)
  private readonly slam: Transient
  private readonly dcL = new DcBlocker()
  private readonly dcR = new DcBlocker()
  private readonly dcCoef: number
  private readonly noise: Rng
  private crashEnv = 0
  private readonly crashFall: number

  private readonly sr: number

  constructor(sr: number) {
    this.sr = sr
    this.slam = new Transient(sr)
    this.dcCoef = 1 - (2 * Math.PI * 10) / sr
    this.noise = mulberry32(0x5c4a)
    this.crashFall = Math.exp(-1 / (CRASH_S * sr))
    const ms = (x: number) => (x / 1000) * sr
    this.tankL = new Tank([...AP_MS.map(ms), ...COMB_MS.map(ms)], sr, 1)
    this.tankR = new Tank(
      [...AP_MS.map(x => ms(x) * 1.05), ...COMB_MS.map(x => ms(x + 1.7))],
      sr,
      1.09,
    )
  }

  when(p: Float32Array) {
    return p[IDX.revMix]! > 0 || p[IDX.revDry]! < 1
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const mod = ctx.mod.read(DEST.revDecay)
    const decay = Math.min(
      Math.max(p[IDX.revDecayS]! * (mod ? Math.pow(2, 2 * mod[0]!) : 1), 0.05),
      30,
    )
    const mix = p[IDX.revMix]!
    const warbleMod = ctx.mod.read(DEST.revWarble)
    const warble = Math.min(
      Math.max(p[IDX.revWarble]! + (warbleMod ? warbleMod[0]! : 0), 0),
      1,
    )
    const swingDepth = warble * (WARBLE_MS / 1000) * this.sr
    const swingK = SineOsc.rate(WARBLE_HZ[0]! + WARBLE_HZ[1]! * warble, this.sr)
    const chirp = 0.75 * p[IDX.revBoing]!
    const dampCoef = lpCoef(p[IDX.revToneHz]!, this.sr)
    const fbL = this.fbL
    const fbR = this.fbR
    const perSec = -3 / decay
    for (let j = 0; j < N_COMB; j++) {
      fbL[j] = Math.pow(10, this.tankL.delaySec[N_AP + j]! * perSec)
      fbR[j] = Math.pow(10, this.tankR.delaySec[N_AP + j]! * perSec)
    }

    const l = io.l
    const r = io.r
    const wetGain = 0.3 * mix
    const dry = p[IDX.revDry]!
    const kick = p[IDX.revKick]!
    const slamAt = 0.03 + 1.5 * (1 - kick) * (1 - kick)
    const hitAt = 1.7 - 1.5 * kick
    const trig = ctx.trig
    const n = io.n
    const inL = this.inL
    const inR = this.inR
    const dcCoef = this.dcCoef
    const howlMod = ctx.mod.read(DEST.revHowl)
    const howl =
      HOWL_GAIN *
      Math.min(Math.max(p[IDX.revHowl]! + (howlMod ? howlMod[0]! : 0), 0), 1)
    const wetL = this.wetL
    const wetR = this.wetR
    for (let i = 0; i < n; i++) {
      let xl = this.dcL.process(l[i]!, dcCoef)
      let xr = this.dcR.process(r[i]!, dcCoef)
      if (howl > 0) {
        const swing =
          HOWL_SUPPLY * Math.max((ctx.railV[i]! - DEAD_V) / (1 - DEAD_V), 0.05)
        xl += swing * softclip((howl * wetL[i]!) / swing)
        xr += swing * softclip((howl * wetR[i]!) / swing)
      }
      const slammed = this.slam.process(0.5 * (xl + xr), slamAt)
      if (kick > 0) {
        const hit = trig.drumBits[i]! !== 0 && trig.drumGain[i]! >= hitAt
        if (slammed || hit) this.crashEnv = 1
      }
      if (this.crashEnv > 1e-4) {
        this.crashEnv *= this.crashFall
        const a = CRASH_AMP * this.crashEnv
        xl += a * (this.noise() - 0.5)
        xr += a * (this.noise() - 0.5)
      }
      inL[i] = xl
      inR[i] = xr
    }
    this.tankL.run(
      inL,
      this.wetL,
      n,
      DIFFUSE,
      fbL,
      dampCoef,
      swingDepth,
      swingK,
      chirp,
    )
    this.tankR.run(
      inR,
      this.wetR,
      n,
      DIFFUSE,
      fbR,
      dampCoef,
      swingDepth,
      swingK,
      chirp,
    )
    for (let i = 0; i < n; i++) {
      l[i] = l[i]! * dry + this.wetL[i]! * wetGain
      r[i] = r[i]! * dry + this.wetR[i]! * wetGain
    }
  }

  panic() {
    this.tankL.reset()
    this.tankR.reset()
    this.slam.reset()
    this.dcL.reset()
    this.dcR.reset()
    this.crashEnv = 0
  }
}
