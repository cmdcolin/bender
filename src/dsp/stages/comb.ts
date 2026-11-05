import { IDX } from '../../engine/params.ts'
import { DEST, type ModBus } from '../modbus.ts'
import { DEAD_V } from '../toyRail.ts'
import { clamp01 } from '../util/clamp.ts'
import { DelayLine } from '../util/delayline.ts'
import { Follower, coef as timeCoef } from '../util/follower.ts'
import { SineOsc } from '../util/lfo.ts'
import { ampVoicing, LoopAmp, newVoicing } from '../util/loopamp.ts'
import { Highpass, Lowpass, OnePoleLP, lpCoef } from '../util/onepole.ts'
import { octaves } from '../util/pitch.ts'
import { softclip } from '../util/softclip.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

export const COMB_CHIP = [
  'Karplus',
  '1024 buckets',
  '256 buckets',
  '64 buckets',
]
const BUCKETS = [0, 1024, 256, 64]

// The filters either side of the chip sit a fraction of the way to its clock,
// two poles each, so a slow clock is a dark comb.
const PRE_OF_CLOCK = 1 / 3
const POST_OF_CLOCK = 1 / 4
const BAND_FLOOR = 150
const BAND_CEIL = 14000

// The clock's bleed is full from this clock down and gone above the top, which
// is where it would fold in a 48 kHz render rather than in the room.
const WHISTLE_TOP = 18000
const WHISTLE_FULL = 6000
const WHISTLE_MAX = 1.2
const WHISTLE_IDLE = 0.25

// An NE570-style 2:1 compander. REF is the level it passes at unity, and
// MAX_GAIN is as far as the compressor will lift a quiet signal.
const REF = 0.25
const MAX_GAIN = 8
const FLOOR = REF / (MAX_GAIN * MAX_GAIN)
const COMP_ATK = 0.004
const COMP_REL = 0.03
// Pump puts a cap this many times too big on the compressor's rectifier, so
// the two halves stop agreeing: a hit after a gap blooms, then collapses.
const PUMP_SLOW = 40

const RAIL_DRIVE = 6
const RAIL_ASYM = 0.7
// The top of the loop amp's travel drives the coupling cap into blocking, so
// the ring motorboats: it dies, rebuilds from the input, and dies again.
const RAIL_BLOCK = 0.4

// How far the comb's own output drags its RC clock, at full scale. The clock
// stops for good below the toy's dead voltage, and no slower than this.
const PULL_DEPTH = 0.5
const CLOCK_FLOOR = 0.02

// A kit hit on the trigger line couples into the chip's input pin as a pulse
// a millisecond wide.
const PLUCK_S = 0.001
const PLUCK_V = 0.9

const R_STRETCH = 1.003

// The loop is ac-coupled, so a one-sided pulse rings rather than latching.
const COUPLING_HZ = 10

const onePoleLag = (a: number) => (1 - a) / a

/** What both chips share this block: the loop around them. */
class Loop {
  fb = 0
  drive = 1
  dampCoef = 1
  coupleCoef = 0
  compAtk = 0
  compRel = 0
  expAtk = 0
  expRel = 0
  readonly voicing = newVoicing()
}

/** One chip's clock this block. */
class Clock {
  rate = 1
  delay = 1
  preCoef = 1
  postCoef = 1
  whistleK = 0
  whistleAmp = 0
}

class Brigade {
  readonly clock = new Clock()
  private readonly line: DelayLine
  private readonly amp = new LoopAmp()
  private readonly pre = new Lowpass(2)
  private readonly post = new Lowpass(2)
  private readonly damp = new OnePoleLP()
  private readonly coupling = new Highpass(1)
  private readonly compEnv = new Follower()
  private readonly expEnv = new Follower()
  private readonly whistle = new SineOsc()
  private held = 0
  private phase = 0
  private last = 0
  /** The sample in, the kit's pulse and the supply's share of the clock, and
      once `run` has gone the sample out: fields rather than arguments, because
      a call V8 declines to inline boxes every double that crosses it. */
  x = 0
  kick = 0
  supply = 1
  y = 0

  constructor(max: number) {
    this.line = new DelayLine(max)
  }

  run(loop: Loop, pull: number) {
    const c = this.clock
    const speed = Math.max(this.supply * (1 + pull * this.last), CLOCK_FLOOR)
    const back = this.post.process(this.line.read(c.delay / speed), c.postCoef)
    const env = this.expEnv.process(back, loop.expAtk, loop.expRel)
    const bleed =
      c.whistleAmp * (WHISTLE_IDLE + this.held) * this.whistle.step(c.whistleK)
    const pin = this.coupling.process(
      (back * Math.max(env, REF / MAX_GAIN)) / REF + bleed,
      loop.coupleCoef,
    )

    this.amp.y =
      loop.drive * (this.x + loop.fb * this.damp.process(pin, loop.dampCoef))
    this.amp.process(loop.voicing)
    const w = this.amp.y / loop.drive

    const level = this.compEnv.process(w, loop.compAtk, loop.compRel)
    const squeezed = w * Math.sqrt(REF / Math.max(level, FLOOR))
    const into = this.pre.process(squeezed + this.kick, c.preCoef)
    this.phase += c.rate * speed
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase)
      this.held = into
    }
    this.line.write(this.held)
    this.last = w
    this.y = this.amp.y + bleed
  }

  reset() {
    this.line.reset()
    this.amp.reset()
    this.pre.reset()
    this.post.reset()
    this.damp.reset()
    this.coupling.reset()
    this.compEnv.reset()
    this.expEnv.reset()
    this.whistle.reset()
    this.held = 0
    this.phase = 0
    this.last = 0
    this.y = 0
  }
}

// Karplus-style feedback resonator. Feedback past unity self-oscillates at the
// comb pitch, held by the in-loop saturation.
//
// Past stock it is a bucket brigade on each side: the loop runs through an
// op-amp, a compander and a chip whose clock is the pitch, so a short chip or a
// low note clocks into earshot, folds and whistles.
export class Comb implements Stage {
  label = 'comb'
  private lineL: DelayLine
  private lineR: DelayLine
  private dampL = new OnePoleLP()
  private dampR = new OnePoleLP()

  private readonly left: Brigade
  private readonly right: Brigade
  private readonly loop = new Loop()
  private kickLeft = 0
  private kickV = 0

  private readonly sr: number
  private readonly compAtk: number
  private readonly compRel: number
  private readonly coupleCoef: number

  constructor(sr: number) {
    this.sr = sr
    const max = sr / 20 + 4
    this.lineL = new DelayLine(max)
    this.lineR = new DelayLine(max)
    this.compAtk = timeCoef(COMP_ATK, sr)
    this.compRel = timeCoef(COMP_REL, sr)
    this.coupleCoef = lpCoef(COUPLING_HZ, sr)
    this.left = new Brigade(max * R_STRETCH)
    this.right = new Brigade(max * R_STRETCH)
  }

  when(p: Float32Array) {
    return p[IDX.combMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const buckets = BUCKETS[Math.round(p[IDX.combChip]!)] ?? 0
    if (buckets > 0) this.brigade(io, p, ctx, buckets)
    else this.stock(io, p, ctx)
  }

  private stock(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const baseHz = p[IDX.combHz]!
    const mod = ctx.mod.read(DEST.combHz)
    // The line hands back one sample more than it is asked for, read before
    // the write the way every stage reads it, so the period asked for is one
    // short of the pitch.
    const delayBase = this.sr / baseHz - 1
    const fb = p[IDX.combFb]!
    const mix = p[IDX.combMix]!
    const coef = lpCoef(p[IDX.combDampHz]!, this.sr)

    for (let i = 0; i < io.n; i++) {
      const delay = mod
        ? this.sr /
            Math.min(Math.max(baseHz * octaves(mod[i]! * 2), 20), 4000) -
          1
        : delayBase
      const wl = softclip(
        io.l[i]! + fb * this.dampL.process(this.lineL.read(delay), coef),
      )
      const wr = softclip(
        io.r[i]! +
          fb * this.dampR.process(this.lineR.read(delay * 1.003), coef),
      )
      this.lineL.write(wl)
      this.lineR.write(wr)
      io.l[i] = io.l[i]! * (1 - mix) + wl * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * mix
    }
  }

  private lane(p: Float32Array, bay: ModBus, key: number, dest: number) {
    const m = bay.read(dest)
    return m ? clamp01(p[key]! + m[0]!) : p[key]!
  }

  // The clock is the pitch: a chip of this many buckets has to walk the charge
  // through all of them once a period. The filters and the hold either side of
  // it add their own lag, which comes off the line so the comb stays in tune.
  private tune(c: Clock, hz: number, buckets: number, whistle: number) {
    const sr = this.sr
    const clock = buckets * hz
    const pre = lpCoef(
      Math.min(Math.max(clock * PRE_OF_CLOCK, BAND_FLOOR), BAND_CEIL),
      sr,
    )
    const post = lpCoef(
      Math.min(Math.max(clock * POST_OF_CLOCK, BAND_FLOOR), BAND_CEIL),
      sr,
    )
    c.rate = clock / sr
    c.preCoef = pre
    c.postCoef = post
    c.whistleK = SineOsc.rate(clock, sr)
    c.whistleAmp =
      WHISTLE_MAX *
      whistle *
      clamp01((WHISTLE_TOP - clock) / (WHISTLE_TOP - WHISTLE_FULL))
    c.delay =
      sr / hz - 1 - 2 * onePoleLag(pre) - 2 * onePoleLag(post) - 0.5 / c.rate
  }

  private brigade(io: StereoBlock, p: Float32Array, ctx: Ctx, buckets: number) {
    const bay = ctx.mod
    const sr = this.sr
    const pump = this.lane(p, bay, IDX.combPump, DEST.combPump)
    const rail = this.lane(p, bay, IDX.combRail, DEST.combRail)
    const pluck = this.lane(p, bay, IDX.combPluck, DEST.combPluck)
    const whistle = this.lane(p, bay, IDX.combWhistle, DEST.combWhistle)
    const sag = this.lane(p, bay, IDX.combSag, DEST.combSag)
    const pull = PULL_DEPTH * this.lane(p, bay, IDX.combPull, DEST.combPull)
    const mod = bay.read(DEST.combHz)
    const hz = Math.min(
      Math.max(p[IDX.combHz]! * (mod ? octaves(mod[0]! * 2) : 1), 20),
      4000,
    )
    const mix = p[IDX.combMix]!

    const loop = this.loop
    const slow = 1 + PUMP_SLOW * pump
    loop.fb = p[IDX.combFb]!
    loop.drive = 1 + RAIL_DRIVE * rail
    loop.dampCoef = lpCoef(p[IDX.combDampHz]!, sr)
    loop.coupleCoef = this.coupleCoef
    loop.compAtk = pump > 0 ? timeCoef(COMP_ATK * slow, sr) : this.compAtk
    loop.compRel = pump > 0 ? timeCoef(COMP_REL * slow, sr) : this.compRel
    loop.expAtk = this.compAtk
    loop.expRel = this.compRel
    ampVoicing(
      rail,
      RAIL_ASYM * rail,
      0,
      RAIL_BLOCK * rail * rail,
      sr,
      loop.voicing,
    )
    this.tune(this.left.clock, hz, buckets, whistle)
    this.tune(this.right.clock, hz / R_STRETCH, buckets, whistle)

    const trig = ctx.trig
    const pulse = Math.round(PLUCK_S * sr)
    for (let i = 0; i < io.n; i++) {
      if (pluck > 0 && trig.drumBits[i]! !== 0) {
        this.kickLeft = pulse
        this.kickV = PLUCK_V * pluck * Math.min(trig.drumGain[i]!, 1.5)
      }
      const kick = this.kickLeft > 0 ? this.kickV : 0
      if (this.kickLeft > 0) this.kickLeft--
      const supply =
        sag > 0
          ? 1 - sag + sag * Math.max((ctx.railV[i]! - DEAD_V) / (1 - DEAD_V), 0)
          : 1
      const { left, right } = this
      left.x = io.l[i]!
      right.x = io.r[i]!
      left.kick = right.kick = kick
      left.supply = right.supply = supply
      left.run(loop, pull)
      right.run(loop, pull)
      io.l[i] = io.l[i]! * (1 - mix) + left.y * mix
      io.r[i] = io.r[i]! * (1 - mix) + right.y * mix
    }
  }

  panic() {
    this.lineL.reset()
    this.lineR.reset()
    this.dampL.reset()
    this.dampR.reset()
    this.left.reset()
    this.right.reset()
    this.kickLeft = 0
    this.kickV = 0
  }
}
