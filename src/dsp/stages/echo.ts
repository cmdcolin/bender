import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine } from '../util/delayline'
import { Follower, coef as timeCoef } from '../util/follower'
import { SineOsc } from '../util/lfo'
import { Lowpass, OnePoleLP, lpCoef } from '../util/onepole'
import { octaves } from '../util/pitch'
import { gaussian, mulberry32, type Rng } from '../util/rng'
import { softclip } from '../util/softclip'

export const ECHO_MODE = {
  standard: 0,
  analog: 1,
  reverse: 2,
  modulate: 3,
  hold: 4,
} as const

// The switch's own legend, so the panel reads the modes off the box rather than
// keeping a second list of them in the order this one happens to be in.
export const ECHO_MODE_NAMES = Object.keys(ECHO_MODE)

const MAX_MS = 2000
const HEADROOM = 1.2
// Two 4096-stage chips in series, which is how a bucket brigade gets past a
// third of a second. The clock has to walk the charge through all of them
// inside the delay time, so a long setting is a slow clock — and the line
// really is clocked here: the input is sampled once a tick and held, so
// anything above half the clock folds back down into the band rather than
// disappearing. The filters either side of the line sit a fraction of the way
// to the clock, two poles each, which is what the pedals had: enough to keep
// the fold quiet at a third of a second and nowhere near enough past a second,
// where a bucket brigade turns to grit before it turns to mud. What the filter
// cannot stop of the clock itself comes through as a whistle, dropping into
// earshot as the time goes up.
const BBD_STAGES = 8192
const WHINE = 0.004
const MOD_HZ = 0.7
const MOD_MS = 6
// Hold: a hit lifts the record head. The window the time knob names is taken
// from the hit onward and then goes round with nothing new written over it,
// each lap the feedback quieter, until the next hit takes another. A hit is
// anything on the kit's trigger line, a key going down, or an attack at the
// input past this — so a box with no trigger wired still catches its own
// beats. An attack fires once: the detector rearms only after the input has
// dropped well under the line, so a held note is one hit and a roll is many.
// The seam gets a millisecond each side, which is a tick rather than a click;
// the tick is part of the sound.
const HOLD_SLAM = 0.3
const HOLD_REARM = 0.5 * HOLD_SLAM
const HOLD_EDGE_MS = 1

// The normal pedal on a board of abused ones: a digital delay with a mode
// switch. Standard crosses between two read heads when the time moves, so the
// repeats already in the buffer keep their pitch — which is the one thing that
// tells it apart from the tape machine next door, where the head is dragged and
// everything on the tape dives with it.
export class Echo implements Stage {
  label = 'echo'
  private lineL: DelayLine
  private lineR: DelayLine
  private toneL = new OnePoleLP()
  private toneR = new OnePoleLP()
  private preL = new Lowpass(2)
  private preR = new Lowpass(2)
  private postL = new Lowpass(2)
  private postR = new Lowpass(2)
  private clock = 0
  private heldL = 0
  private heldR = 0
  private whine = new SineOsc()
  private lfo = new SineOsc()
  private comp = new Follower()
  private slam = new Follower()
  private armed = true
  private holdLeft = 0
  private holdLen = 0
  private holdPhase = 0
  private holdGain = 1
  private noise: Rng
  private primed = false
  private cur = 0
  private next = 0
  private fade = 1
  private glide = 0
  private revPhase = 0
  private revLen = 0
  private readonly maxDelay: number
  private readonly maxRead: number
  private readonly fadeStep: number

  constructor(private readonly sr: number) {
    this.maxDelay = (MAX_MS / 1000) * sr
    // A backwards head walks away from the write head at twice the rate, so it
    // reaches a whole window past the window it is playing: reverse needs a
    // buffer twice as deep as the longest time on the knob.
    this.maxRead = 2 * this.maxDelay
    this.lineL = new DelayLine(this.maxRead + 8)
    this.lineR = new DelayLine(this.maxRead + 8)
    this.noise = gaussian(mulberry32(0x0dd8))
    this.fadeStep = 1 / (0.025 * sr)
  }

  when(p: Float32Array) {
    return p[IDX.echoLevel]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const mode = Math.round(p[IDX.echoMode]!)
    const target = Math.min(
      Math.max((p[IDX.echoMs]! / 1000) * this.sr, 1),
      this.maxDelay - 8,
    )
    // The knob as the board booted, rather than a time of its own to walk from:
    // a pedal switched on already at 500 ms has not just been moved there.
    if (!this.primed) {
      this.primed = true
      this.cur = target
      this.next = target
      this.glide = target
      this.revLen = Math.max(target, 2)
    }
    const fb = p[IDX.echoFb]!
    const level = p[IDX.echoLevel]!
    const toneCoef = lpCoef(p[IDX.echoToneHz]!, this.sr)
    const modTime = ctx.mod.read(DEST.echoMs)
    const glideCoef = timeCoef(0.04, this.sr)
    const lfoK = SineOsc.rate(MOD_HZ, this.sr)
    const envA = timeCoef(0.01, this.sr)
    const envR = timeCoef(0.25, this.sr)

    const reverse = mode === ECHO_MODE.reverse
    const bbd = mode === ECHO_MODE.analog
    const hold = mode === ECHO_MODE.hold
    // The two digital modes cross heads; the brigade has a clock to walk.
    const crosses = !reverse && !bbd && !hold
    const edgeN = (HOLD_EDGE_MS / 1000) * this.sr
    const slamA = timeCoef(0.002, this.sr)
    const slamR = timeCoef(0.02, this.sr)
    const trig = ctx.trig
    const wobble =
      mode === ECHO_MODE.modulate
        ? p[IDX.echoMod]! * (MOD_MS / 1000) * this.sr
        : 0
    const clockHz = (BBD_STAGES * this.sr) / target
    const preCoef = lpCoef(Math.min(Math.max(clockHz / 3, 600), 14000), this.sr)
    const postCoef = lpCoef(
      Math.min(Math.max(clockHz / 4, 600), 14000),
      this.sr,
    )
    const whineK = SineOsc.rate(clockHz, this.sr)
    const whine = WHINE * Math.min(Math.max((16000 - clockHz) / 12000, 0), 1)
    if (crosses && this.fade >= 1 && Math.abs(target - this.cur) > 8) {
      this.next = target
      this.fade = 0
    }

    for (let i = 0; i < io.n; i++) {
      const bend = modTime ? octaves(2 * modTime[i]!) : 1
      let tapL = 0
      let tapR = 0
      if (hold) {
        const inL = io.l[i]!
        const inR = io.r[i]!
        const loud = this.slam.process(0.5 * (inL + inR), slamA, slamR)
        let struck = trig.drumBits[i]! !== 0 || trig.key[i]! > 0
        if (this.armed && loud > HOLD_SLAM) {
          struck = true
          this.armed = false
        } else if (!this.armed && loud < HOLD_REARM) {
          this.armed = true
        }
        if (struck) {
          this.holdLen = Math.max(Math.round(target), 4)
          this.holdLeft = this.holdLen
          this.holdPhase = 0
          this.holdGain = 1
        }
        if (this.holdLeft > 0 || this.holdLen === 0) {
          if (this.holdLeft > 0) this.holdLeft--
          this.lineL.write(inL)
          this.lineR.write(inR)
          continue
        }
        const len = this.holdLen
        const d = Math.max(len - 1 - this.holdPhase, 1)
        const edge = Math.min(
          1,
          this.holdPhase / edgeN,
          (len - this.holdPhase) / edgeN,
        )
        const g = this.holdGain * edge
        tapL = this.toneL.process(g * this.lineL.readHermite(d), toneCoef)
        tapR = this.toneR.process(g * this.lineR.readHermite(d), toneCoef)
        // A wire on the time is a wire on how fast the window goes round.
        this.holdPhase += bend
        if (this.holdPhase >= len) {
          this.holdPhase -= len
          this.holdGain = Math.min(this.holdGain * fb, HEADROOM)
        }
        io.l[i] = inL + tapL * level
        io.r[i] = inR + tapR * level
        continue
      }
      if (reverse) {
        this.revPhase++
        if (this.revPhase >= this.revLen) {
          this.revPhase = 0
          this.revLen = Math.max(target, 2)
        }
        const half = this.revLen * 0.5
        const back =
          this.revPhase < half ? this.revPhase + half : this.revPhase - half
        // Two heads half a window apart, each playing its own pass backwards
        // and handing over where the other is at full stretch, so the seam
        // falls where the outgoing one has already gone quiet.
        const x = this.revPhase / this.revLen
        const y = back / this.revLen
        const wa = x * (1 - x)
        const wb = y * (1 - y)
        const norm = 1 / (wa + wb)
        const ga = Math.sqrt(wa * norm)
        const gb = Math.sqrt(wb * norm)
        const da = this.tap(1 + 2 * this.revPhase, bend)
        const db = this.tap(1 + 2 * back, bend)
        tapL = ga * this.lineL.readHermite(da) + gb * this.lineL.readHermite(db)
        tapR = ga * this.lineR.readHermite(da) + gb * this.lineR.readHermite(db)
      } else {
        this.glide += glideCoef * (target - this.glide)
        if (this.fade < 1) {
          this.fade += this.fadeStep
          if (this.fade >= 1) {
            this.fade = 1
            this.cur = this.next
          }
        }
        const v = wobble ? wobble * this.lfo.step(lfoK) : 0
        const base = crosses ? this.cur : this.glide
        const dl = this.tap(base + v, bend)
        const dr = this.tap(base - v, bend)
        tapL = this.lineL.readHermite(dl)
        tapR = this.lineR.readHermite(dr)
        if (this.fade < 1) {
          const nl = this.lineL.readHermite(this.tap(this.next + v, bend))
          const nr = this.lineR.readHermite(this.tap(this.next - v, bend))
          // Smoothstep rather than a straight ramp: a linear crossfade arrives
          // and leaves with its slope still on, so both ends of the move put a
          // kink in the wave where the point of crossing at all was not to.
          const g = this.fade * this.fade * (3 - 2 * this.fade)
          tapL += g * (nl - tapL)
          tapR += g * (nr - tapR)
        }
      }

      tapL = this.toneL.process(tapL, toneCoef)
      tapR = this.toneR.process(tapR, toneCoef)
      if (bbd) {
        const w = whine * this.whine.step(whineK)
        tapL = this.postL.process(tapL, postCoef) + w
        tapR = this.postR.process(tapR, postCoef) + w
      }

      let wl = io.l[i]! + fb * tapL
      let wr = io.r[i]! + fb * tapR
      if (bbd) {
        // The compander's noise floor, which is loudest with nothing to hide
        // behind it — a bucket brigade breathes rather than hisses evenly.
        const quiet = 1 - Math.min(this.comp.process(wl, envA, envR), 1)
        const hiss = 0.004 * (0.2 + 0.8 * quiet)
        wl = this.preL.process(
          softclip(1.5 * (wl + hiss * this.noise())) * 0.7,
          preCoef,
        )
        wr = this.preR.process(
          softclip(1.5 * (wr + hiss * this.noise())) * 0.7,
          preCoef,
        )
        this.clock += BBD_STAGES / this.glide
        if (this.clock >= 1) {
          this.clock -= Math.floor(this.clock)
          this.heldL = wl
          this.heldR = wr
        }
        wl = this.heldL
        wr = this.heldR
      } else {
        wl = Math.min(Math.max(wl, -HEADROOM), HEADROOM)
        wr = Math.min(Math.max(wr, -HEADROOM), HEADROOM)
      }
      this.lineL.write(wl)
      this.lineR.write(wr)
      io.l[i] = io.l[i]! + tapL * level
      io.r[i] = io.r[i]! + tapR * level
    }
  }

  private tap(d: number, bend: number) {
    return Math.min(Math.max(d * bend, 1), this.maxRead)
  }

  panic() {
    this.lineL.reset()
    this.lineR.reset()
    this.toneL.reset()
    this.toneR.reset()
    this.preL.reset()
    this.preR.reset()
    this.postL.reset()
    this.postR.reset()
    this.clock = 0
    this.heldL = 0
    this.heldR = 0
    this.whine.reset()
    this.lfo.reset()
    this.comp.reset()
    this.slam.reset()
    this.armed = true
    this.holdLeft = 0
    this.holdLen = 0
    this.holdPhase = 0
    this.holdGain = 1
    this.primed = false
    this.cur = 0
    this.next = 0
    this.fade = 1
    this.glide = 0
    this.revPhase = 0
    this.revLen = 0
  }
}
