import { coef } from './util/follower.ts'

import type { StereoBlock } from './stage.ts'

// The kick duck: a vactrol on a desk channel. The kit's trigger line fires a
// one-shot that drives an LED through the channel's duck pot, and the LED lights
// a CdS cell shunting the line to ground behind a series resistor. The cell
// turns on in a few milliseconds and lets go slowly, slower still after a hard
// light, because the traps a bright pulse filled have to empty before its
// resistance climbs back.

const PULSE_S = 0.012
const ON_S = 0.0025
const OFF_FAST_S = 0.012
const OFF_SLOW_S = 0.12
const TRAP_FILL_S = 0.006
const TRAP_EMPTY_S = 0.9
/** The cell's conductance under full light, over the series resistor's. */
const G_FULL = 24
/** CdS conductance against light. */
const GAMMA = 0.75
/** Accents drive the LED harder, up to here. */
const MAX_HIT = 1.5
const DARK_G = 1e-4
const EMPTY_TRAP = 1e-6

export class Vactrol {
  /** The cell's conductance over the series resistor's: the line passes
      1 / (1 + g). Zero once the cell is dark. */
  g = 0
  private trap = 0
  private pulse = 0
  private lit = 0
  private litG = 0
  private readonly sr: number
  private readonly width: number
  private readonly on: number
  private readonly fill: number
  private readonly empty: number

  constructor(sr: number) {
    this.sr = sr
    this.width = Math.round(PULSE_S * sr)
    this.on = coef(ON_S, sr)
    this.fill = coef(TRAP_FILL_S, sr)
    this.empty = Math.exp(-1 / (TRAP_EMPTY_S * sr))
  }

  /** Whether the cell still darkens the line, or the pot can light it. */
  live(depth: number) {
    return depth > 0 || this.g > 0
  }

  /** Darkens the line, and says by how much at most, 0 to 1. */
  run(
    line: StereoBlock,
    depth: number,
    hits: Float32Array,
    weights: Float32Array,
    mask: number,
    trim: number,
  ) {
    const { l, r, n } = line
    const off = coef(
      OFF_FAST_S * (OFF_SLOW_S / OFF_FAST_S) ** this.trap * trim,
      this.sr,
    )
    let { g, trap, pulse, lit, litG } = this
    let least = 1
    for (let i = 0; i < n; i++) {
      if ((hits[i]! & mask) !== 0 && depth > 0) {
        pulse = this.width
        lit = Math.min(depth * Math.min(weights[i]!, MAX_HIT), MAX_HIT)
        litG = G_FULL * lit ** GAMMA
      }
      if (pulse > 0) {
        pulse--
        g += (litG - g) * (litG > g ? this.on : off)
        trap += (Math.min(lit, 1) - trap) * this.fill
      } else {
        g -= g * off
        trap *= this.empty
      }
      const pass = 1 / (1 + g)
      if (pass < least) least = pass
      l[i] = l[i]! * pass
      r[i] = r[i]! * pass
    }
    if (pulse === 0 && g < DARK_G) g = 0
    if (trap < EMPTY_TRAP) trap = 0
    this.g = g
    this.trap = trap
    this.pulse = pulse
    this.lit = lit
    this.litG = litG
    return 1 - least
  }

  reset() {
    this.g = 0
    this.trap = 0
    this.pulse = 0
    this.lit = 0
    this.litG = 0
  }
}
