import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import { rail } from '../util/bridged'
import { Transient } from '../util/follower'
import { lpCoef } from '../util/onepole'
import { mulberry32, type Rng } from '../util/rng'

import type { Ctx, Stage, StereoBlock } from '../stage'

// Six allpasses rather than three: the chirp is how far the low end lags the
// top through the chain, and three stages was a drip where a spring is a boing.
const AP_MS = [1.7, 2.9, 4.7, 6.3, 8.3, 11.9]
const COMB_MS = [31, 37, 41, 43]
const N_AP = AP_MS.length
const N_COMB = COMB_MS.length

const ringSize = (n: number) => 1 << Math.ceil(Math.log2(Math.max(n, 2)))

// A crash: the springs thrown against the housing. What comes off them is a
// clatter that lasts about this long and falls about this fast, and it goes in
// at the top of the chain so it disperses like anything else that hits a spring.
const CRASH_S = 0.05
const CRASH_AMP = 2.5

// One channel's tank, as flat memory rather than a graph of objects.
//
// Seven lines and four damping filters ran as seven DelayLine objects inside
// seven wrapper objects, and a sample cost fourteen method calls, each one
// loading a buffer, a mask and a cursor from a different place on the heap. The
// arithmetic was never the cost — the pointer chasing was. Same taps, same
// order, same numbers, laid out so the whole tank is three typed arrays and the
// loop stays in registers: 2.3x, measured.
class Tank {
  private readonly buf: Float32Array
  private readonly off = new Int32Array(N_AP + N_COMB)
  private readonly mask = new Int32Array(N_AP + N_COMB)
  private readonly whole = new Int32Array(N_AP + N_COMB)
  private readonly frac = new Float64Array(N_AP + N_COMB)
  private readonly pos = new Int32Array(N_AP + N_COMB)
  private readonly damp = new Float64Array(N_COMB)
  /** each comb's delay in seconds, which is what sets its feedback from decay */
  readonly delaySec: Float64Array

  constructor(delays: number[], sr: number) {
    let acc = 0
    for (let k = 0; k < delays.length; k++) {
      const d = Math.max(delays[k]!, 1)
      const size = ringSize(Math.ceil(d + 4))
      this.off[k] = acc
      this.mask[k] = size - 1
      this.whole[k] = Math.floor(d)
      this.frac[k] = d - Math.floor(d)
      acc += size
    }
    this.buf = new Float32Array(acc)
    this.delaySec = Float64Array.from(delays, d => d / sr)
  }

  /** Allpass cascade into the comb cluster; returns the summed wet sample. */
  step(x: number, boing: number, fb: Float64Array, dampCoef: number): number {
    const buf = this.buf
    const off = this.off
    const mask = this.mask
    const pos = this.pos

    for (let k = 0; k < N_AP; k++) {
      const o = off[k]!
      const m = mask[k]!
      const p = pos[k]! - 1 - this.whole[k]!
      const a = buf[o + (p & m)]!
      const d = a + this.frac[k]! * (buf[o + ((p - 1) & m)]! - a)
      const w = x + boing * d
      buf[o + pos[k]!] = w
      pos[k] = (pos[k]! + 1) & m
      x = d - boing * w
    }

    let wet = 0
    for (let j = 0; j < N_COMB; j++) {
      const k = N_AP + j
      const o = off[k]!
      const m = mask[k]!
      const p = pos[k]! - 1 - this.whole[k]!
      const a = buf[o + (p & m)]!
      const d = a + this.frac[k]! * (buf[o + ((p - 1) & m)]! - a)
      // the damping filter's state is a double that decays toward zero, so this
      // is one of the places the denormal guard actually earns its compare
      const y = this.damp[j]! + dampCoef * (d - this.damp[j]!)
      this.damp[j] = Math.abs(y) < 1e-15 ? 0 : y
      // A spring can only swing so far before it meets the box it is in, and
      // rail is transparent under that: how long the tank rings stays the
      // damping's business, and only a crash reaches the wall.
      buf[o + pos[k]!] = rail(x + fb[j]! * y)
      pos[k] = (pos[k]! + 1) & m
      wet += d
    }
    return wet
  }

  reset() {
    this.buf.fill(0)
    this.pos.fill(0)
    this.damp.fill(0)
  }
}

// Cheap and deliberately springy: dispersive allpass cascade into a cluster of
// short parallel combs — metallic, boingy, lo-fi.
export class SpringVerb implements Stage {
  label = 'springVerb'
  private tankL: Tank
  private tankR: Tank
  private readonly fbL = new Float64Array(N_COMB)
  private readonly fbR = new Float64Array(N_COMB)
  private readonly slam: Transient
  private readonly noise: Rng
  private crashEnv = 0
  private readonly crashFall: number

  constructor(private readonly sr: number) {
    this.slam = new Transient(sr)
    this.noise = mulberry32(0x5c4a)
    this.crashFall = Math.exp(-1 / (CRASH_S * sr))
    const ms = (x: number) => (x / 1000) * sr
    this.tankL = new Tank([...AP_MS.map(ms), ...COMB_MS.map(ms)], sr)
    this.tankR = new Tank(
      [...AP_MS.map(x => ms(x) * 1.05), ...COMB_MS.map(x => ms(x + 1.7))],
      sr,
    )
  }

  // Out of the path entirely with both knobs down, which is the boot state: the
  // dry cut is the only thing here that does anything at a mix of zero.
  when(p: Float32Array) {
    return p[IDX.revMix]! > 0 || p[IDX.revDryCut]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    // A tank is springs and a coil: how long it rings is a block-rate thing, so
    // a wire on the decay is read once at the top of the block rather than eight
    // pow calls a sample down inside it.
    const mod = ctx.mod.read(DEST.revDecay)
    const decay = Math.min(
      Math.max(p[IDX.revDecayS]! * (mod ? Math.pow(2, 2 * mod[0]!) : 1), 0.05),
      30,
    )
    const mix = p[IDX.revMix]!
    const boing = 0.35 + 0.5 * p[IDX.revBoing]!
    const dampCoef = lpCoef(p[IDX.revToneHz]!, this.sr)
    // A tank's feedback follows the decay knob, and the knob holds still for the
    // block: eight pow calls a sample is eight for nothing.
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
    // The two are separate decisions, which is the whole point of the pair: the
    // tank comes back on its own fader, the way the delay does off a send, and
    // how much board goes into it with the springs is this. A crossfade made one
    // knob of both, so asking for more spring traded away the dry it was
    // supposed to sit behind — and the return is dark and smeared by
    // construction, damped per comb and dispersed before that, so the trade read
    // as the board going dull rather than as more room.
    const dry = 1 - p[IDX.revDryCut]!
    const kick = p[IDX.revKick]!
    // What it takes to throw the springs: a slam at the input past this, or a
    // hit on the kit's trigger line that lands this hard, scaled by the knob.
    // The trigger line is a wire, so the kit kicks the amp however quiet it is.
    const slamAt = 0.03 + 1.5 * (1 - kick) * (1 - kick)
    const hitAt = 1.7 - 1.5 * kick
    const trig = ctx.trig
    for (let i = 0; i < io.n; i++) {
      let inL = l[i]!
      let inR = r[i]!
      if (kick > 0) {
        const slammed = this.slam.process(0.5 * (inL + inR), slamAt)
        const hit = trig.drumBits[i]! !== 0 && trig.drumGain[i]! >= hitAt
        if (slammed || hit) this.crashEnv = 1
      }
      if (this.crashEnv > 1e-4) {
        this.crashEnv *= this.crashFall
        const a = CRASH_AMP * this.crashEnv
        inL += a * (this.noise() - 0.5)
        inR += a * (this.noise() - 0.5)
      }
      const wl = this.tankL.step(inL, boing, fbL, dampCoef)
      const wr = this.tankR.step(inR, boing, fbR, dampCoef)
      l[i] = l[i]! * dry + wl * wetGain
      r[i] = r[i]! * dry + wr * wetGain
    }
  }

  panic() {
    this.tankL.reset()
    this.tankR.reset()
    this.slam.reset()
    this.crashEnv = 0
  }
}
