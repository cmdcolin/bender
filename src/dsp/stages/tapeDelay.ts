import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import { DelayLine, fixedTap } from '../util/delayline'
import { coef as timeCoef } from '../util/follower'
import { QuadOsc, SineOsc } from '../util/lfo'
import { DcBlocker, OnePoleLP, lpCoef } from '../util/onepole'
import { octaves } from '../util/pitch'
import { mulberry32, type Rng } from '../util/rng'
import { flushDenormal, softclip } from '../util/softclip'
import { dampAt, Svf, svfF } from '../util/svf'

import type { Ctx, Stage, StereoBlock } from '../stage'

// The reel is a loop, joined once. How long the join is past the heads, and
// how much of it is tape with no oxide on it.
const GAP_MS = 12
const THUMP = 0.5

// Three play heads along the tape, one, two and three spacings from the
// record head, and which of them the switch brings up. Their bits, in the
// switch's order.
export const HEAD_CHOICES = ['1', '1+2', '1+3', '2+3', '1+2+3'] as const
const HEAD_MASKS = [1, 3, 5, 6, 7]

// A sine carrier at full depth costs the tail 3 dB a lap, so the repeats die
// faster for no reason anyone asked for. √2 is exactly what the modulation took
// out, handed back to the ring path alone.
const RING_MAKEUP = Math.SQRT2

// A bulb in the regeneration: its filament heats with what goes round and its
// resistance pulls the loop gain down, so feedback past unity swells, backs
// off and swells again instead of pinning.
const LAMP_GAIN = 12

// Fractional delay with wow/flutter transport wobble and a saturating
// feedback loop that runs away musically past unity. The capstan is a real
// motor: it has weight, it answers the brake, and it can be wired to the same
// dying supply as the toy.
//
// The buffer is the tape, and the tape is a loop: what the record head lays
// down comes back round to it one revolution later, where the erase head is
// meant to wipe it before the new take goes on. An erase head that misses lets
// the last lap through underneath, and the splice that closes the loop is a
// gap in the oxide that goes past both heads once a lap — recorded as a gap,
// so the play head finds it however slowly the transport is dragging.
export class TapeDelay implements Stage {
  label = 'tapeDelay'
  private lineL: DelayLine
  private lineR: DelayLine
  private toneL = new OnePoleLP()
  private toneR = new OnePoleLP()
  private wow = new SineOsc()
  // The multiplier inside the regeneration, and the block that keeps a unison
  // carrier's DC term from circulating — the tone filter is a low-pass and
  // passes DC straight round the loop.
  private ring = new QuadOsc()
  private ringDcL = new DcBlocker()
  private ringDcR = new DcBlocker()
  private loopL = new Svf()
  private loopR = new Svf()
  private filament = 0
  private flutterWalk = 0
  private motor = 1
  private slide = 0
  private spliceIn = 0
  private gapLeft = 0
  private readonly maxDelay: number
  private readonly loop: number
  private readonly gap: number
  private rng: Rng

  constructor(
    private readonly sr: number,
    seed: number,
  ) {
    // The line rounds up to a power of two, so at every rate the board runs at
    // this is the same buffer 4.5 s asked for — the last second of it was
    // allocated either way and simply wasn't reachable.
    this.maxDelay = 5.3 * sr
    this.loop = Math.floor(this.maxDelay)
    this.gap = Math.floor((GAP_MS / 1000) * sr)
    this.lineL = new DelayLine(this.maxDelay + 4)
    this.lineR = new DelayLine(this.maxDelay + 4)
    this.rng = mulberry32(seed)
  }

  when(p: Float32Array, ctx: Ctx) {
    return p[IDX.dlyMix]! > 0 || (ctx.fbDest === 3 && p[IDX.fbAmt]! > 0)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const baseDelay = (p[IDX.delayMs]! / 1000) * this.sr
    const fb = p[IDX.dlyFb]!
    const wowDepth = (p[IDX.wowDepthMs]! / 1000) * this.sr
    const wowHz = p[IDX.wowHz]!
    const flutter = p[IDX.flutter]!
    const mix = p[IDX.dlyMix]!
    const coef = lpCoef(p[IDX.dlyToneHz]!, this.sr)
    const micInject = Math.round(p[IDX.micPatch]!) === 3
    const fbInject = ctx.fbDest === 3
    const brake = p[IDX.tapeBrake]!
    const railDrag = p[IDX.tapeMotorRail]!
    const splice = p[IDX.dlySplice]!
    const erase = p[IDX.dlyErase]!
    const heads = HEAD_MASKS[Math.round(p[IDX.dlyHeads]!)] ?? 1
    const nHeads = (heads & 1) + ((heads >> 1) & 1) + ((heads >> 2) & 1)
    const lap = fixedTap(this.loop, this.maxDelay)
    const modSpeed = ctx.mod.read(DEST.tapeSpeed)
    // Two ways to move the repeats, and they don't sound alike: the motor has
    // weight, so a wire on the speed dives in pitch on its way there, while a
    // wire on the time moves the head itself — the tap jumps and the repeat that
    // was already on the tape comes back at a new spacing.
    const modTime = ctx.mod.read(DEST.delayMs)
    const inertia = timeCoef(0.3, this.sr)
    const recenter = 1 / (3 * this.sr)
    const wowK = SineOsc.rate(wowHz, this.sr)
    // Crossfade between the plain tap and the tap times a carrier, which by the
    // AM identity is the depth of the modulation. It lands on the tap before
    // the regen sum, so every repeat is shifted again and the tail becomes a
    // lattice rather than a chorus on the last lap alone.
    const ringDepth = p[IDX.dlyRing]!
    const ringing = ringDepth > 0
    const ringDc = 1 - (2 * Math.PI * 10) / this.sr
    if (ringing) this.ring.setRate(p[IDX.dlyRingHz]!, this.sr)
    const loopMode = Math.round(p[IDX.dlyLoopMode]!) - 1
    const loopHz = p[IDX.dlyLoopHz]!
    const modLoop = ctx.mod.read(DEST.dlyLoopHz)
    const loopDamp = dampAt(p[IDX.dlyLoopRes]!)
    const loopF = svfF(loopHz, this.sr)
    // Band-pass peaks at 1/damp, so it gives that back and a narrow band rings
    // rather than exploding.
    const bandTrim = loopMode === 1 ? Math.max(loopDamp, 0.15) : 1
    const lamp = p[IDX.dlyLamp]!
    const lampK = 1 / (p[IDX.dlyLampS]! * this.sr)

    for (let i = 0; i < io.n; i++) {
      const delaySamples = modTime
        ? Math.min(
            Math.max(baseDelay * octaves(2 * modTime[i]!), 1),
            this.maxDelay - 8,
          )
        : baseDelay
      this.flutterWalk = flushDenormal(
        (this.flutterWalk + (this.rng() - 0.5) * flutter * 0.6) * 0.995,
      )
      const wobble =
        wowDepth * this.wow.step(wowK) + this.flutterWalk * 0.002 * this.sr

      let want = (1 - brake) * (1 - railDrag * ctx.droop[i]!)
      if (modSpeed) want *= octaves(modSpeed[i]! * 1.5)
      this.motor += inertia * (Math.min(Math.max(want, 0), 4) - this.motor)
      // the read head runs at motor speed against a fixed write head, so the
      // gap opens while the transport is slow — that gap is the pitch dive
      this.slide = flushDenormal(
        this.slide + (1 - this.motor) - this.slide * recenter,
      )
      this.slide = Math.min(
        Math.max(this.slide, 1 - delaySamples),
        this.maxDelay - delaySamples - 4,
      )
      // The transport's slip and wobble are the tape's, so every head sees
      // the same pitch; the spacing is the head's own.
      let sumL = 0
      let sumR = 0
      for (let k = 1; k <= 3; k++) {
        if (!(heads & (1 << (k - 1)))) continue
        const d = Math.min(
          Math.max(k * delaySamples + this.slide + wobble, 1),
          this.maxDelay,
        )
        sumL += this.lineL.readHermite(d)
        sumR += this.lineR.readHermite(d * 1.007)
      }
      let tapL = this.toneL.process(sumL, coef)
      let tapR = this.toneR.process(sumR, coef)
      if (loopMode >= 0) {
        const f = modLoop
          ? svfF(loopHz * octaves(modLoop[i]! * 3), this.sr)
          : loopF
        tapL = bandTrim * this.loopL.process(tapL, f, loopDamp, loopMode)
        tapR = bandTrim * this.loopR.process(tapR, f, loopDamp, loopMode)
      }
      if (ringing) {
        this.ring.step()
        const rl = this.ringDcL.process(tapL * this.ring.im, ringDc)
        const rr = this.ringDcR.process(tapR * this.ring.re, ringDc)
        tapL += ringDepth * (RING_MAKEUP * rl - tapL)
        tapR += ringDepth * (RING_MAKEUP * rr - tapR)
      }
      let regen = fb / nHeads
      if (lamp > 0) {
        this.filament = flushDenormal(
          this.filament +
            lampK * (0.5 * (tapL * tapL + tapR * tapR) - this.filament),
        )
        regen /= 1 + LAMP_GAIN * lamp * this.filament
      }
      let wl = io.l[i]! + softclip(regen * tapL)
      let wr = io.r[i]! + softclip(regen * tapR)
      if (micInject) {
        wl += ctx.mic[i]!
        wr += ctx.mic[i]!
      }
      if (fbInject) {
        wl += ctx.fb[i]!
        wr += ctx.fb[i]!
      }
      if (erase > 0) {
        wl += softclip(erase * this.lineL.readAt(lap.whole, lap.frac))
        wr += softclip(erase * this.lineR.readAt(lap.whole, lap.frac))
      }
      if (splice > 0) {
        if (++this.spliceIn >= this.loop) {
          this.spliceIn = 0
          this.gapLeft = this.gap
        }
        if (this.gapLeft > 0) {
          this.gapLeft--
          const bump = THUMP * Math.sin((Math.PI * this.gapLeft) / this.gap)
          wl += splice * (bump - wl)
          wr += splice * (bump - wr)
        }
      }
      this.lineL.write(wl)
      this.lineR.write(wr)
      // The echo returns on its own fader, the way it does off a send: the dry
      // never leaves the desk, so asking for more repeats never costs top end.
      io.l[i] = io.l[i]! + tapL * mix
      io.r[i] = io.r[i]! + tapR * mix
    }
  }

  panic() {
    this.lineL.reset()
    this.lineR.reset()
    this.toneL.reset()
    this.toneR.reset()
    this.wow.reset()
    this.ring.reset()
    this.ringDcL.reset()
    this.ringDcR.reset()
    this.loopL.reset()
    this.loopR.reset()
    this.filament = 0
    this.flutterWalk = 0
    this.motor = 1
    this.slide = 0
    this.spliceIn = 0
    this.gapLeft = 0
  }
}
