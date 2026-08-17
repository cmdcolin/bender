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

  reset() {
    this.buf.fill(0)
  }
}
