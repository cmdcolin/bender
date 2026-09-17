import { Follower, coef as timeCoef } from './follower'
import { SineOsc } from './lfo'
import { lpCoef } from './onepole'
import { gaussian, mulberry32, type Rng } from './rng'
import { flushDenormal, softclip } from './softclip'

// A bucket brigade, shared by the two boxes on the board built out of one: the
// delay pedal's analog mode and the ensemble.
//
// The chip is a row of capacitors and a clock that walks the charge along it one
// bucket a tick, so the delay is the stage count over the clock rate and the two
// cannot be set apart. A long delay is a slow clock, a slow clock is a narrow
// band, and the input is sampled once a tick and held — so anything above half
// the clock folds back down into the band rather than disappearing. The filters
// either side of the line sit a fraction of the way to the clock, two poles
// each, which is what the pedals had; what they cannot stop of the clock itself
// comes through as a whistle, dropping into earshot as the clock comes down.
//
// The compander is the other half of the circuit. A brigade's own noise floor is
// far too loud to use straight, so the signal goes in compressed and comes out
// expanded, and what is left is a hiss that lifts when there is nothing to hide
// behind it. A bucket brigade breathes rather than hissing evenly.
//
// What is *not* here is the line: the host owns its own delay buffer, because
// what it reads off it is the whole of what makes each box a different box — one
// read head that crosses, three that sweep 120° apart, or two that swing against
// each other.

// Two poles a side, run as flat state rather than as filter objects: the loop
// runs per sample per channel, and a chip is three channels at most.
const POLES = 2

/** One chip's own numbers, which is the whole of what makes two of these sound
    like different circuits. */
export interface BbdChip {
  /** How many buckets the charge walks through, which is what turns a delay
      time into a clock rate. A long line is more chips in series. */
  stages: number
  /** Where the clock's whistle comes in: full at the first hertz, gone by the
      second. A chip with fewer stages clocks faster for the same delay, so it
      whistles somewhere else. */
  bleed: readonly [number, number]
  /** How loud that whistle is at its loudest. */
  level: number
  /** The noise floor the compander is there to hide. */
  hiss: number
  /** Its own stream, so two chips on one board are two chips rather than one
      heard twice. */
  seed: number
}

export class Bbd {
  /** What the line takes this sample, one per channel — what the host writes
      into its own buffers once the clock has ticked. */
  readonly held: Float64Array
  /** Where the host puts this sample's input, one per channel, before it calls
      `sample`. A field rather than an argument list, because a chip carries two
      channels here and three there and neither may allocate to say so. */
  readonly feed: Float64Array
  /** The clock's rate this block, which is also where the band stops. */
  clockHz = 0
  readonly stages: number

  private readonly wet: Float64Array
  private readonly pre: Float64Array
  private readonly post: Float64Array
  private readonly comp = new Follower()
  private readonly whistle = new SineOsc()
  private readonly noise: Rng
  private readonly envA: number
  private readonly envR: number
  private readonly top: number
  private readonly span: number
  private readonly hiss: number
  private readonly level: number
  private phase = 0
  private preCoef = 0
  private postCoef = 0
  private whineK = 0
  private whineAmp = 0

  constructor(
    private readonly sr: number,
    private readonly n: number,
    chip: BbdChip,
  ) {
    this.stages = chip.stages
    this.hiss = chip.hiss
    this.level = chip.level
    this.top = chip.bleed[1]
    this.span = chip.bleed[1] - chip.bleed[0]
    this.held = new Float64Array(n)
    this.feed = new Float64Array(n)
    this.wet = new Float64Array(n)
    this.pre = new Float64Array(n * POLES)
    this.post = new Float64Array(n * POLES)
    this.noise = gaussian(mulberry32(chip.seed))
    this.envA = timeCoef(0.01, sr)
    this.envR = timeCoef(0.25, sr)
  }

  /** Settle the clock for a line of this many samples: how fast it runs, where
      the filters either side of it sit, and how loud it whistles. */
  setClock(delaySamples: number) {
    const hz = (this.stages * this.sr) / delaySamples
    this.clockHz = hz
    this.preCoef = lpCoef(Math.min(Math.max(hz / 3, 600), 14000), this.sr)
    this.postCoef = lpCoef(Math.min(Math.max(hz / 4, 600), 14000), this.sr)
    this.whineK = SineOsc.rate(hz, this.sr)
    this.whineAmp =
      this.level * Math.min(Math.max((this.top - hz) / this.span, 0), 1)
  }

  /** How far the clock walks per sample on a line this long. The host divides
      by whatever its head is riding on, which on a delay that is being dragged
      is not the length the knob names. */
  rate(delaySamples: number): number {
    return this.stages / delaySamples
  }

  /** The clock's own whistle for this sample, which lands on every tap. */
  bleed(): number {
    return this.whineAmp * this.whistle.step(this.whineK)
  }

  /** The lid the clock leaves on what comes back off the line. */
  band(ch: number, x: number): number {
    return this.lp(this.post, ch * POLES, x, this.postCoef)
  }

  /** In through the compander and onto the clock: what the line takes comes
      back on `held`, which only moves on a tick. `lines` is how many of the
      channels are in the path, since a mode with one line pays for one. */
  sample(inc: number, lines = this.n) {
    // The compander's noise floor is loudest with nothing to hide behind it,
    // and channel zero is what it listens to: one chip, one gain.
    const loud = this.comp.process(this.feed[0]!, this.envA, this.envR)
    const hiss = this.hiss * (0.2 + 0.8 * (1 - Math.min(loud, 1)))
    for (let c = 0; c < lines; c++) {
      this.wet[c] = this.lp(
        this.pre,
        c * POLES,
        softclip(1.5 * (this.feed[c]! + hiss * this.noise())) * 0.7,
        this.preCoef,
      )
    }
    this.phase += inc
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase)
      for (let c = 0; c < lines; c++) this.held[c] = this.wet[c]!
    }
  }

  reset() {
    this.held.fill(0)
    this.feed.fill(0)
    this.wet.fill(0)
    this.pre.fill(0)
    this.post.fill(0)
    this.comp.reset()
    this.whistle.reset()
    this.phase = 0
  }

  private lp(state: Float64Array, at: number, x: number, coef: number): number {
    let y = x
    for (let k = at; k < at + POLES; k++) {
      state[k] = flushDenormal(state[k]! + coef * (y - state[k]!))
      y = state[k]!
    }
    return y
  }
}
