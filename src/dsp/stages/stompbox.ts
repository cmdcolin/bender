import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { octaves } from '../util/pitch'
import { Follower, coef } from '../util/follower'
import { SineOsc } from '../util/lfo'
import { DcBlocker, OnePoleLP, lpCoef } from '../util/onepole'
import { flushDenormal, softclip } from '../util/softclip'

// Ids match the stompCircuit choices.
const SCREAMER = 0
const RAT = 1
const MUFF = 2
const GERMANIUM = 3
const OCTAVE = 4
const GATE = 5

// Silicon across the op-amp's feedback loop: rounds into the rail and stays.
const diode = (x: number, ceil: number) => ceil * softclip(x / ceil)

// Germanium cuts off early on one half. The even harmonics and the DC offset
// both fall out of that lopsidedness.
const asym = (x: number, ceil: number) =>
  x > 0 ? ceil * softclip(x / ceil) : 0.55 * ceil * softclip(x / (0.55 * ceil))

// Diodes clipped to ground instead, with the knee real ones have. The harder
// edge is most of what separates a rat from a screamer.
function clipToGround(x: number, ceil: number): number {
  const t = x / (2 * ceil)
  const a = Math.abs(t)
  if (a <= 1 / 3) return x
  if (a >= 2 / 3) return t > 0 ? ceil : -ceil
  const k = 2 - 3 * a
  return (t > 0 ? ceil : -ceil) * ((3 - k * k) / 3)
}

// The little transformer the octave pedals rectified into: it rings, and that
// ring is the whole voice of the thing.
class Ring {
  private low = 0
  private band = 0
  process(x: number, f: number): number {
    this.low = flushDenormal(this.low + f * this.band)
    this.band = flushDenormal(this.band + f * (x - this.low - 0.6 * this.band))
    return this.band
  }
  reset() {
    this.low = 0
    this.band = 0
  }
}

// What the knobs decided this block, shared by both channels.
interface Voicing {
  circuit: number
  tone: number
  sag: number
  bias: number
  pull: number
  couple: number
  toneLp: number
  ring: number
  /** the starved squeal's rate, already turned into a step for SineOsc */
  squealK: number
  thresh: number
}

// One channel of pedal. Each circuit uses its own handful of the filters here;
// the supply, the coupling cap and the output cap are common to all of them,
// because every one of these was a couple of transistors hung off a 9V battery.
class Box {
  private couple = new OnePoleLP()
  private load = new OnePoleLP()
  private mid = new OnePoleLP()
  private inter = new OnePoleLP()
  private tone = new OnePoleLP()
  private scoop = new OnePoleLP()
  private ring = new Ring()
  private dc = new DcBlocker()
  private env = new Follower()
  private drag = new Follower()
  private slew = 0
  private rail = 1
  private gate = 0
  private gated = false
  private squeal = new SineOsc()

  private readonly envA: number
  private readonly envR: number
  private readonly dragA: number
  private readonly dragR: number
  private readonly railCoef: number
  private readonly gateA: number
  private readonly gateR: number
  private readonly dcCoef: number
  private readonly slewStep: number
  private readonly midCoef: number
  private readonly interCoef: number
  private readonly rectCoef: number
  private readonly loadCoef: number
  private readonly scoopCoef: number

  constructor(private readonly sr: number) {
    this.envA = coef(0.004, sr)
    this.envR = coef(0.12, sr)
    this.dragA = coef(0.02, sr)
    this.dragR = coef(0.18, sr)
    this.railCoef = coef(0.05, sr)
    this.gateA = coef(0.002, sr)
    this.gateR = coef(0.03, sr)
    this.dcCoef = 1 - (2 * Math.PI * 12) / sr
    // an op-amp that can't keep up: fast edges leave as ramps before anything
    // downstream gets to clip them, which is the fizz rather than the buzz
    this.slewStep = 12000 / sr
    this.midCoef = lpCoef(6000, sr)
    this.interCoef = lpCoef(250, sr)
    this.rectCoef = lpCoef(50, sr)
    this.loadCoef = lpCoef(4500, sr)
    this.scoopCoef = lpCoef(1200, sr)
  }

  process(x: number, gain: number, droop: number, v: Voicing): number {
    const env = this.env.process(x, this.envA, this.envR)
    // A dying 9V: the harder the pedal is working the further its rail falls,
    // and it shares the board's supply, so Starve and Brownout drag it too.
    // The draw saturates rather than clipping, so the rail keeps answering how
    // hard you are playing instead of pinning at the bottom on every note.
    const draw = env * v.pull
    const want = 1 - v.sag * Math.min(Math.max(draw / (1 + draw), droop), 1)
    this.rail = flushDenormal(this.rail + this.railCoef * (want - this.rail))
    const ceil = Math.max(this.rail, 0.03)
    const hp = x - this.couple.process(x, v.couple)
    let y: number

    switch (v.circuit) {
      case RAT: {
        const driven = gain * hp
        const step = Math.min(
          Math.max(driven - this.slew, -this.slewStep),
          this.slewStep,
        )
        this.slew = flushDenormal(this.slew + step)
        y = this.tone.process(clipToGround(this.slew + v.bias, ceil), v.toneLp)
        break
      }
      case MUFF: {
        // Two clipping stages with a coupling cap between them, then a tone
        // stack that scoops the middle out from between a low-pass and a
        // high-pass. Nothing decays: the second stage is still clipping on
        // whatever the first one has left.
        const one = diode(gain * hp + v.bias, ceil)
        const damped = this.mid.process(one, this.midCoef)
        const two = diode(
          1.8 * (damped - this.inter.process(damped, this.interCoef)),
          ceil,
        )
        // The arms of the stack overlap, so the middle of the knob is a dip
        // and not a hole: the note has to survive its own tone control.
        const lo = this.tone.process(two, v.toneLp)
        const hi = two - this.scoop.process(two, this.scoopCoef)
        y = 1.8 * ((1 - v.tone) * lo + v.tone * hi)
        break
      }
      case GERMANIUM: {
        // A low input impedance loads the source, and the bias rides down on
        // the rectified signal: it splutters as a note dies and cleans up when
        // you back off the input.
        const loaded = this.load.process(hp, this.loadCoef)
        const drag = this.drag.process(loaded, this.dragA, this.dragR)
        y = this.tone.process(
          asym(gain * (loaded - drag * 0.45) + v.bias, ceil),
          v.toneLp,
        )
        break
      }
      case OCTAVE: {
        // The transformer's centre tap turns both halves positive, so what
        // comes out sits an octave over what went in. It rectifies the shape
        // and clips afterwards: fold a wave that is already square and both
        // halves are the same height, which is no octave at all.
        const rect = 2 * Math.abs(hp)
        const oct = asym(
          gain * (rect - this.inter.process(rect, this.rectCoef)) + v.bias,
          ceil,
        )
        // A little of the straight fuzz alongside it is the ghosting: on one
        // note that is an octave, on two it is the two of them gargling.
        y = 0.85 * this.ring.process(oct, v.ring) + 0.25 * asym(gain * hp, ceil)
        break
      }
      case GATE: {
        // Misbiased to the edge of cutoff: it gates hard on the way down, and
        // starved further it stops needing an input at all.
        const u = clipToGround(gain * hp + v.bias + (1 - this.rail) * 1.5, ceil)
        this.gated = env > (this.gated ? v.thresh * 0.5 : v.thresh)
        const target = this.gated ? 1 : 0
        this.gate = flushDenormal(
          this.gate +
            (this.gated ? this.gateA : this.gateR) * (target - this.gate),
        )
        const squeal =
          v.sag * (1 - this.gate) * 0.3 * this.squeal.step(v.squealK)
        y = this.tone.process(u * this.gate + squeal * ceil, v.toneLp)
        break
      }
      default: {
        // Diodes inside the feedback loop clip the boost only, and the dry
        // input walks along underneath — the reason a screamer never quite
        // lets go of the note it was given.
        const boost = diode(gain * hp + v.bias, ceil)
        y = this.tone.process(0.5 * x + 0.8 * boost, v.toneLp)
      }
    }

    return this.dc.process(y, this.dcCoef)
  }

  panic() {
    this.couple.reset()
    this.load.reset()
    this.mid.reset()
    this.inter.reset()
    this.tone.reset()
    this.scoop.reset()
    this.ring.reset()
    this.dc.reset()
    this.env.reset()
    this.drag.reset()
    this.slew = 0
    this.rail = 1
    this.gate = 0
    this.gated = false
    this.squeal.reset()
  }
}

// The dirt box at the front of the board: six pedal circuits, each clipping
// somewhere different in its own gain stage, on a battery you can starve.
export class Stompbox implements Stage {
  label = 'stompbox'
  private left: Box
  private right: Box
  private readonly v: Voicing = {
    circuit: 0,
    tone: 0.5,
    sag: 0,
    bias: 0,
    pull: 1,
    couple: 0,
    toneLp: 0,
    ring: 0,
    squealK: 0,
    thresh: 0,
  }

  constructor(private readonly sr: number) {
    this.left = new Box(sr)
    this.right = new Box(sr)
  }

  when(p: Float32Array) {
    return p[IDX.stompMix]! > 0
  }

  // Every circuit's tone control is a different network, so the knob means
  // something different on each: a low-pass here, the scoop blend on the muff,
  // where the transformer rings on the octave, what pitch the starved one
  // squeals at.
  private voice(p: Float32Array, gain: number) {
    const v = this.v
    const t = p[IDX.stompTone]!
    v.circuit = Math.round(p[IDX.stompCircuit]!)
    v.tone = t
    v.sag = p[IDX.stompSag]!
    v.bias = p[IDX.stompBias]!
    v.pull = Math.min(Math.sqrt(gain), 6)
    // On the gate circuit the two knobs do the two things the real starved
    // ones do: bias walks it toward cutoff, so it shuts higher up, and a flat
    // battery is what sets it howling.
    v.thresh = 0.005 + Math.max(v.bias, 0) * 0.35
    v.squealK = SineOsc.rate(80 * Math.pow(30, t), this.sr)
    v.ring =
      2 *
      Math.sin(
        (Math.PI * Math.min(400 * Math.pow(7.5, t), this.sr * 0.2)) / this.sr,
      )
    switch (v.circuit) {
      case RAT:
        v.couple = lpCoef(90, this.sr)
        v.toneLp = lpCoef(350 * Math.pow(26, t), this.sr)
        break
      case MUFF:
        v.couple = lpCoef(80, this.sr)
        v.toneLp = lpCoef(600, this.sr)
        break
      case GERMANIUM:
        v.couple = lpCoef(60, this.sr)
        v.toneLp = lpCoef(700 * Math.pow(11.5, t), this.sr)
        break
      case OCTAVE:
        // where the transformer rings is this one's tone control, so the
        // low-pass sits open
        v.couple = lpCoef(400, this.sr)
        v.toneLp = 1
        break
      case GATE:
        v.couple = lpCoef(150, this.sr)
        v.toneLp = lpCoef(500 * Math.pow(14, t), this.sr)
        break
      default:
        v.couple = lpCoef(720, this.sr)
        v.toneLp = lpCoef(600 * Math.pow(10, t), this.sr)
    }
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const base = Math.pow(10, p[IDX.stompDrive]! / 20)
    const level = Math.pow(10, p[IDX.stompLevel]! / 20)
    const mix = p[IDX.stompMix]!
    const mod = ctx.mod.read(DEST.stompDrive)
    this.voice(p, base)
    const v = this.v

    for (let i = 0; i < io.n; i++) {
      const gain = mod ? Math.min(base * octaves(mod[i]! * 4), 4000) : base
      const droop = ctx.droop[i]!
      const wl = this.left.process(io.l[i]!, gain, droop, v)
      const wr = this.right.process(io.r[i]!, gain, droop, v)
      io.l[i] = io.l[i]! * (1 - mix) + wl * level * mix
      io.r[i] = io.r[i]! * (1 - mix) + wr * level * mix
    }
  }

  panic() {
    this.left.panic()
    this.right.panic()
  }
}
