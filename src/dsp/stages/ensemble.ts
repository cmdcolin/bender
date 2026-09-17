import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import { Bbd } from '../util/bbd'
import { DelayLine } from '../util/delayline'
import { OnePoleLP, lpCoef } from '../util/onepole'
import { octaves, wrap1 } from '../util/pitch'
import { flushDenormal } from '../util/softclip'

import type { Ctx, Stage, StereoBlock } from '../stage'

export const ENS_MODE = {
  chorus: 0,
  ensemble: 1,
  dimension: 2,
  vibrato: 3,
  flange: 4,
} as const

// The switch's own legend, so the panel reads the modes off the box.
export const ENS_MODE_NAMES = Object.keys(ENS_MODE)

// A 512-bucket chip, which is the small one the chorus pedals used. At a
// millisecond its clock is half a megahertz and nothing of it is audible; at
// twenty-five it is down to twenty kilohertz, the band comes down with it, the
// staircase starts to show and the clock itself is in the take. Same chip as
// the delay pedal's, eight thousand buckets shorter — see util/bbd.ts.
const BBD = {
  stages: 512,
  bleed: [15000, 30000],
  level: 0.003,
  hiss: 0.0025,
  seed: 0x5e11,
} as const

// Three lines is what the string machines had, and the most any mode here
// needs. The others run one or two down the same rack.
const LINES = 3
const PHASE = [0, 1 / 3, 2 / 3]

// How much of the nominal delay the clock swings at full depth. Past about
// half and the sweep runs into its own floor at the short end.
const SWING = 0.55

// The string machine's second oscillator, off the same knob: ten times the
// rate, a third of the throw. At the stock 0.6 Hz that is the 6 Hz shimmer
// sitting on the 0.6 Hz sway, which is the whole of why an ensemble sounds
// like a section and a chorus sounds like one detuned voice.
const FAST_X = 10
const FAST = 0.35
const SLOW = 1 - FAST

/** What each mode does with the rack: how long its line may run, and how many
    of the three the signal goes down. Read off the mode at the top of the
    block — a chorus and a flanger are one circuit at two clock rates. */
const MODE = [
  { ms: [1, 10], lines: 1 },
  { ms: [1, 25], lines: 3 },
  { ms: [1, 20], lines: 2 },
  { ms: [1, 25], lines: 1 },
  { ms: [0.3, 3], lines: 1 },
] as const

/** And each mode's stereo image: what the dry and each of the three lines are
    worth on the left, then the same on the right. Eight numbers and how the
    lines are swept is the whole difference between these boxes, so they are
    read into locals once a block rather than switched on per sample. */
const IMAGE = [
  // Chorus, wired as the CE-1's two jacks: the wet alone on one side, dry and
  // wet on the other, which is where its width comes from.
  [0, 1, 0, 0, 0.5, 0.5, 0, 0],
  // The string machine: three lines across the field, the middle one in both.
  [0.5, 0.5, 0.5, 0, 0.5, 0, 0.5, 0.5],
  // Dimension: one line each side, dry up the middle, and the two lines swept
  // against each other so the wobble cancels when the sides are summed.
  [0.5, 1, 0, 0, 0.5, 0, 1, 0],
  // Vibrato has no dry at all — the pitch moves rather than beating against
  // something that isn't moving.
  [0, 1, 0, 0, 0, 1, 0, 0],
  [0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0],
] as const satisfies readonly (readonly number[])[]

// A triangle rather than a sine: the phase-shift oscillators in these pedals
// put out a triangle, and a sweep that dwells at its turns is a chorus that
// sounds like it is stopping.
const tri = (phase: number) => 4 * Math.abs(phase - 0.5) - 1

// The chorus the board never had, and the one texture a divider organ needs to
// stop sounding like a divider organ. Every mode is the same bucket brigade at
// a different clock with a different number of heads on it: a chorus is one
// line swept slowly, a flanger is the same line an order of magnitude shorter
// with its output fed back in, an ensemble is three of them 120° apart, and a
// dimension is two swept against each other so mono hears no wobble at all.
export class Ensemble implements Stage {
  label = 'ens'
  private readonly lines: DelayLine[]
  private readonly toneL = new OnePoleLP()
  private readonly toneR = new OnePoleLP()
  private readonly wet = new Float64Array(LINES)
  private readonly sweep = new Float64Array(LINES)
  private readonly bbd: Bbd
  private readonly maxRead: number
  private slow = 0
  private fast = 0
  /** what the flanger's line handed back, which is the only feedback here */
  private ret = 0

  constructor(private readonly sr: number) {
    this.maxRead = ((25 * (1 + SWING)) / 1000) * sr
    this.lines = Array.from(
      { length: LINES },
      () => new DelayLine(this.maxRead + 8),
    )
    this.bbd = new Bbd(sr, LINES, BBD)
  }

  when(p: Float32Array) {
    return p[IDX.ensMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const at = Math.round(p[IDX.ensMode]!)
    const mode = MODE[at] ?? MODE[0]
    const image = IMAGE[at] ?? IMAGE[0]
    const lines = mode.lines
    const ms = Math.min(Math.max(p[IDX.ensClock]!, mode.ms[0]), mode.ms[1])
    const nominal = (ms / 1000) * this.sr
    const swing = p[IDX.ensDepth]! * SWING * nominal
    const mix = p[IDX.ensMix]!
    const width = p[IDX.ensWidth]!
    // Only the flanger reads it: the other four have nothing going round.
    const fb = at === ENS_MODE.flange ? p[IDX.ensFeedback]! : 0
    const toneCoef = lpCoef(p[IDX.ensTone]!, this.sr)
    const strings = at === ENS_MODE.ensemble
    const hz = p[IDX.ensRate]!
    const slowStep = hz / this.sr
    const fastStep = (hz * FAST_X) / this.sr
    const rateLane = ctx.mod.read(DEST.ensRate)
    const [dryL, gl0, gl1, gl2, dryR, gr0, gr1, gr2] = image
    this.bbd.setClock(nominal)
    const clockStep = this.bbd.rate(nominal)

    for (let i = 0; i < io.n; i++) {
      const bend = rateLane ? octaves(2 * rateLane[i]!) : 1
      this.slow = wrap1(this.slow + slowStep * bend)
      this.fast = wrap1(this.fast + fastStep * bend)
      if (strings) {
        for (let c = 0; c < LINES; c++) {
          const ph = PHASE[c]!
          this.sweep[c] =
            SLOW * tri(wrap1(this.slow + ph)) +
            FAST * tri(wrap1(this.fast + ph))
        }
      } else {
        const a = tri(this.slow)
        this.sweep[0] = a
        this.sweep[1] = -a
      }

      // One whistle for the rack, the way one clock runs the lot.
      const bleed = this.bbd.bleed()
      for (let c = 0; c < lines; c++) {
        const tap = this.lines[c]!.readHermite(nominal + swing * this.sweep[c]!)
        this.wet[c] = this.bbd.band(c, tap) + bleed
      }
      this.ret = flushDenormal(this.wet[0]!)

      // The rack is fed in mono, the way an ensemble's one input jack is; the
      // width further down is where the stereo comes from. One compander and one
      // clock for the lot of them, which is also the circuit: a string machine
      // has one input amp in front of the three chips, not three.
      const dry = 0.5 * (io.l[i]! + io.r[i]!)
      this.bbd.feed[0] = dry + fb * this.ret
      this.bbd.sample(clockStep, 1)
      const held = this.bbd.held[0]!
      for (let c = 0; c < lines; c++) this.lines[c]!.write(held)

      const w0 = this.wet[0]!
      const w1 = this.wet[1]!
      const w2 = this.wet[2]!
      // The tone control sits on what came back off the lines and nowhere else:
      // a chorus that dulled the dry signal on its way past would be a chorus
      // you cannot leave switched on.
      const effL =
        dryL * dry +
        this.toneL.process(gl0 * w0 + gl1 * w1 + gl2 * w2, toneCoef)
      const effR =
        dryR * dry +
        this.toneR.process(gr0 * w0 + gr1 * w1 + gr2 * w2, toneCoef)
      // Spread as mid and side rather than as two pans: at no width the two
      // sides are the same signal, which is the only honest way to say a stereo
      // pedal is off.
      const mid = 0.5 * (effL + effR)
      const side = 0.5 * (effL - effR) * width
      io.l[i] = io.l[i]! + mix * (mid + side - io.l[i]!)
      io.r[i] = io.r[i]! + mix * (mid - side - io.r[i]!)
    }
  }

  panic() {
    for (const line of this.lines) line.reset()
    this.toneL.reset()
    this.toneR.reset()
    this.bbd.reset()
    this.wet.fill(0)
    this.sweep.fill(0)
    this.slow = 0
    this.fast = 0
    this.ret = 0
  }
}
