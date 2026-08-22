import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine } from '../util/delayline'
import { Follower, coef as timeCoef } from '../util/follower'
import { SineOsc } from '../util/lfo'
import { OnePoleLP, lpCoef } from '../util/onepole'
import { octaves } from '../util/pitch'
import { gaussian, mulberry32, type Rng } from '../util/rng'
import { softclip } from '../util/softclip'

export const ECHO_MODE = {
  standard: 0,
  analog: 1,
  reverse: 2,
  modulate: 3,
} as const

// The switch's own legend, so the panel reads the modes off the box rather than
// keeping a second list of them in the order this one happens to be in.
export const ECHO_MODE_NAMES = Object.keys(ECHO_MODE)

const MAX_MS = 2000
const HEADROOM = 1.2
// Two 4096-stage chips in series, which is how a bucket brigade gets past a
// third of a second. The clock has to walk the charge through all of them
// inside the delay time, so a long setting is a slow clock, and the filters
// either side of the line sit a third of the way to it: the delay time is the
// bandwidth, on the same knob, and that is the whole of why an analog delay
// goes muddy as it gets longer. Two poles, because one is a tone control and
// what a bucket brigade has is a wall — it has to be, or the clock comes back
// through the line as a whistle.
const BBD_STAGES = 8192
const MOD_HZ = 0.7
const MOD_MS = 6

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
  private bbdL1 = new OnePoleLP()
  private bbdL2 = new OnePoleLP()
  private bbdR1 = new OnePoleLP()
  private bbdR2 = new OnePoleLP()
  private lfo = new SineOsc()
  private comp = new Follower()
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

    const standard = mode === ECHO_MODE.standard
    const reverse = mode === ECHO_MODE.reverse
    const bbd = mode === ECHO_MODE.analog
    const wobble =
      mode === ECHO_MODE.modulate
        ? p[IDX.echoMod]! * (MOD_MS / 1000) * this.sr
        : 0
    const bbdCoef = lpCoef(
      Math.min(Math.max((BBD_STAGES * this.sr) / (6 * target), 600), 14000),
      this.sr,
    )
    if (standard && this.fade >= 1 && Math.abs(target - this.cur) > 8) {
      this.next = target
      this.fade = 0
    }

    for (let i = 0; i < io.n; i++) {
      const bend = modTime ? octaves(2 * modTime[i]!) : 1
      let tapL = 0
      let tapR = 0
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
        const base = standard ? this.cur : this.glide
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
        tapL = this.bbdL2.process(this.bbdL1.process(tapL, bbdCoef), bbdCoef)
        tapR = this.bbdR2.process(this.bbdR1.process(tapR, bbdCoef), bbdCoef)
      }

      let wl = io.l[i]! + fb * tapL
      let wr = io.r[i]! + fb * tapR
      if (bbd) {
        // The compander's noise floor, which is loudest with nothing to hide
        // behind it — a bucket brigade breathes rather than hisses evenly.
        const quiet = 1 - Math.min(this.comp.process(wl, envA, envR), 1)
        const hiss = 0.004 * (0.2 + 0.8 * quiet)
        wl = softclip(1.5 * (wl + hiss * this.noise())) * 0.7
        wr = softclip(1.5 * (wr + hiss * this.noise())) * 0.7
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
    this.bbdL1.reset()
    this.bbdL2.reset()
    this.bbdR1.reset()
    this.bbdR2.reset()
    this.lfo.reset()
    this.comp.reset()
    this.primed = false
    this.cur = 0
    this.next = 0
    this.fade = 1
    this.glide = 0
    this.revPhase = 0
    this.revLen = 0
  }
}
