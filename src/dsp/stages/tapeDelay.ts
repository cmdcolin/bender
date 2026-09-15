import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { octaves } from '../util/pitch'
import { DelayLine, fixedTap } from '../util/delayline'
import { coef as timeCoef } from '../util/follower'
import { SineOsc } from '../util/lfo'
import { OnePoleLP, lpCoef } from '../util/onepole'
import { flushDenormal, softclip } from '../util/softclip'
import { mulberry32, type Rng } from '../util/rng'

// The reel is a loop, joined once. How long the join is past the heads, and
// how much of it is tape with no oxide on it.
const GAP_MS = 12
const THUMP = 0.5

// Three play heads along the tape, one, two and three spacings from the
// record head, and which of them the switch brings up. Their bits, in the
// switch's order.
export const HEAD_CHOICES = ['1', '1+2', '1+3', '2+3', '1+2+3'] as const
const HEAD_MASKS = [1, 3, 5, 6, 7]

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
      const tapL = this.toneL.process(sumL, coef)
      const tapR = this.toneR.process(sumR, coef)
      let wl = io.l[i]! + softclip((fb / nHeads) * tapL)
      let wr = io.r[i]! + softclip((fb / nHeads) * tapR)
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
    this.flutterWalk = 0
    this.motor = 1
    this.slide = 0
    this.spliceIn = 0
    this.gapLeft = 0
  }
}
