import { flushDenormal } from './softclip'

export class DelayLine {
  private buf: Float32Array
  private pos = 0

  constructor(maxSamples: number) {
    this.buf = new Float32Array(Math.max(2, Math.ceil(maxSamples)))
  }

  write(x: number) {
    this.buf[this.pos] = flushDenormal(x)
    this.pos = (this.pos + 1) % this.buf.length
  }

  // delay in samples, >= 1, fractional; linear interpolation
  read(delay: number): number {
    const n = this.buf.length
    const d = Math.min(Math.max(delay, 1), n - 2)
    const i = Math.floor(d)
    const frac = d - i
    const a = this.buf[(this.pos - 1 - i + 2 * n) % n]!
    const b = this.buf[(this.pos - 2 - i + 2 * n) % n]!
    return a + frac * (b - a)
  }

  // 4-point cubic. A linearly interpolated tap loses highs as it moves, so a
  // modulated head darkens in step with its own wobble — audible as soon as the
  // path is meant to sound clean.
  readHermite(delay: number): number {
    const n = this.buf.length
    const d = Math.min(Math.max(delay, 1), n - 4)
    const i = Math.floor(d)
    const f = d - i
    const p = this.pos + 2 * n
    const ym1 = this.buf[(p - i) % n]!
    const y0 = this.buf[(p - 1 - i) % n]!
    const y1 = this.buf[(p - 2 - i) % n]!
    const y2 = this.buf[(p - 3 - i) % n]!
    const c1 = 0.5 * (y1 - ym1)
    const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2
    const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1)
    return ((c3 * f + c2) * f + c1) * f + y0
  }

  reset() {
    this.buf.fill(0)
  }
}
