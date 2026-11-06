import { ringSize } from './delayline.ts'
import { flushDenormal } from './softclip.ts'

// A bare concrete room a few metres across, as a second microphone hears it
// from the far wall: four reflection paths that trade energy through a
// Hadamard matrix every pass, each losing its highs to the air on the way.
const PATHS_MS = [31.2, 39.4, 49.6, 62.5]
const AIR_HZ = 3800
const DECAY_S = 3.6
const SILENT = 1e-9

export class Room {
  private readonly lines: Float32Array[]
  private readonly masks: Int32Array
  private readonly lengths: Int32Array
  private readonly keep: Float64Array
  private readonly air: Float64Array
  private readonly dull: number
  private pos = 0
  private energy = 0

  constructor(sr: number) {
    this.lengths = Int32Array.from(PATHS_MS, ms => Math.round((ms * sr) / 1000))
    this.lines = Array.from(
      this.lengths,
      len => new Float32Array(ringSize(len + 1)),
    )
    this.masks = Int32Array.from(this.lines, l => l.length - 1)
    this.keep = Float64Array.from(this.lengths, len =>
      Math.pow(10, (-3 * len) / (sr * DECAY_S)),
    )
    this.air = new Float64Array(PATHS_MS.length)
    this.dull = Math.exp((-2 * Math.PI * AIR_HZ) / sr)
  }

  clear() {
    for (const line of this.lines) line.fill(0)
    this.air.fill(0)
    this.energy = 0
  }

  /** Whether anything is still ringing, so a room nobody sends to costs nothing. */
  get quiet() {
    return this.energy < SILENT
  }

  /** Adds the room's answer to `send` onto l and r. */
  run(
    send: Float64Array,
    gain: number,
    l: Float32Array,
    r: Float32Array,
    n: number,
  ) {
    const { lines, masks, lengths, keep, air, dull } = this
    const wet = 1 - dull
    let energy = 0
    for (let i = 0; i < n; i++) {
      const at = this.pos
      const a = lines[0]![(at - lengths[0]!) & masks[0]!]!
      const b = lines[1]![(at - lengths[1]!) & masks[1]!]!
      const c = lines[2]![(at - lengths[2]!) & masks[2]!]!
      const d = lines[3]![(at - lengths[3]!) & masks[3]!]!
      l[i]! += (a - b + c - d) * gain
      r[i]! += (a + b - c - d) * gain
      const x = send[i]!
      const e = flushDenormal(
        0.5 * (a + b + c + d) * keep[0]! * wet + air[0]! * dull,
      )
      const f = flushDenormal(
        0.5 * (a - b + c - d) * keep[1]! * wet + air[1]! * dull,
      )
      const g = flushDenormal(
        0.5 * (a + b - c - d) * keep[2]! * wet + air[2]! * dull,
      )
      const h = flushDenormal(
        0.5 * (a - b - c + d) * keep[3]! * wet + air[3]! * dull,
      )
      air[0] = e
      air[1] = f
      air[2] = g
      air[3] = h
      lines[0]![at & masks[0]!] = e + x
      lines[1]![at & masks[1]!] = f - x
      lines[2]![at & masks[2]!] = g + x
      lines[3]![at & masks[3]!] = h - x
      energy += a * a + d * d + x * x
      this.pos = at + 1
    }
    this.pos &= 0x3fffffff
    this.energy = energy / n
  }
}
