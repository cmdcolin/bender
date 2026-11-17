import { MACHINES } from '../../machines.ts'
import { hop } from '../modbus.ts'
import { Crossings } from '../util/crossings.ts'

export const CORD_DIV_NAMES = ['÷1', '÷2', '÷4', '÷8']

export const CORD_FROM = [
  'Plinky',
  'Clatter',
  'Glint',
  'Parlor',
  'Growler',
  'Howler',
] as const

export type CordSource = (typeof CORD_FROM)[number]

export const PIN = -1

const TAP_OF = CORD_FROM.map(name =>
  name === 'Plinky' ? PIN : MACHINES.findIndex(m => m.name === name),
)

/** The source tap a cord takes its signal from, or PIN for Plinky's output pin. */
export const cordTap = (from: number, lane: Float32Array | null) =>
  TAP_OF[hop(from, CORD_FROM.length, lane)] ?? PIN

const SQUARE = 0.7
const COUPLE_HZ = 20

export class Cord {
  private edges = new Crossings(0.05)
  private count = 0
  private dc = -SQUARE
  private readonly couple: number

  constructor(sr: number) {
    this.couple = 1 - Math.exp((-2 * Math.PI * COUPLE_HZ) / sr)
  }

  run(
    pin: Float32Array,
    out: Float32Array,
    n: number,
    stages: number,
    gain: number,
  ) {
    if (stages <= 0) {
      for (let i = 0; i < n; i++) out[i] = pin[i]! * gain
      return
    }
    const wrap = (1 << stages) - 1
    const bit = 1 << (stages - 1)
    for (let i = 0; i < n; i++) {
      if (this.edges.rise(pin[i]!)) this.count = (this.count + 1) & wrap
      const sq = this.count & bit ? SQUARE : -SQUARE
      this.dc += this.couple * (sq - this.dc)
      out[i] = (sq - this.dc) * gain
    }
  }

  reset() {
    this.edges.reset()
    this.count = 0
    this.dc = -SQUARE
  }
}
