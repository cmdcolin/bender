import { flushDenormal } from './softclip'

// Rounded up to a power of two so wrapping is a mask rather than a modulo. A
// tap costs three wraps and the board holds twenty-odd lines, and `%` on a
// length the compiler can't see is an integer divide every time — the spring
// tank alone was paying for fourteen of them a sample.
const ringSize = (n: number) => 1 << Math.ceil(Math.log2(Math.max(n, 2)))

/** A constant delay split into what readAt wants, matching read()'s clamp. */
export function fixedTap(delay: number, max: number) {
  const d = Math.min(Math.max(delay, 1), max)
  const whole = Math.floor(d)
  return { whole, frac: d - whole }
}

export class DelayLine {
  private buf: Float32Array
  private mask: number
  private pos = 0

  constructor(maxSamples: number) {
    this.buf = new Float32Array(ringSize(Math.ceil(maxSamples)))
    this.mask = this.buf.length - 1
  }

  write(x: number) {
    this.buf[this.pos] = flushDenormal(x)
    this.pos = (this.pos + 1) & this.mask
  }

  // delay in samples, >= 1, fractional; linear interpolation
  read(delay: number): number {
    const mask = this.mask
    const d = Math.min(Math.max(delay, 1), mask - 1)
    const i = Math.floor(d)
    const frac = d - i
    const p = this.pos - 1 - i
    const a = this.buf[p & mask]!
    const b = this.buf[(p - 1) & mask]!
    return a + frac * (b - a)
  }

  // A tap that never moves, with the whole and fractional parts of its delay
  // settled once by fixedTap. What is left per sample is two loads and a lerp:
  // a tank of fourteen fixed lines has no business clamping and flooring the
  // same constant forty-eight thousand times a second.
  readAt(whole: number, frac: number): number {
    const mask = this.mask
    const p = this.pos - 1 - whole
    const a = this.buf[p & mask]!
    return a + frac * (this.buf[(p - 1) & mask]! - a)
  }

  // 4-point cubic. A linearly interpolated tap loses highs as it moves, so a
  // modulated head darkens in step with its own wobble — audible as soon as the
  // path is meant to sound clean.
  readHermite(delay: number): number {
    const mask = this.mask
    const buf = this.buf
    const d = Math.min(Math.max(delay, 1), mask - 3)
    const i = Math.floor(d)
    const f = d - i
    const p = this.pos - i
    const ym1 = buf[p & mask]!
    const y0 = buf[(p - 1) & mask]!
    const y1 = buf[(p - 2) & mask]!
    const y2 = buf[(p - 3) & mask]!
    const c1 = 0.5 * (y1 - ym1)
    const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2
    const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1)
    return ((c3 * f + c2) * f + c1) * f + y0
  }

  reset() {
    this.buf.fill(0)
  }
}
