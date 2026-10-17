import { flushDenormal } from './softclip.ts'

export interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

export const flat = (): Biquad => ({ b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 })

export function shelf(
  hz: number,
  db: number,
  sr: number,
  high: boolean,
): Biquad {
  const a = Math.pow(10, db / 40)
  const w = (2 * Math.PI * hz) / sr
  const cos = Math.cos(w)
  const alpha = (Math.sin(w) / 2) * Math.SQRT2
  const s = 2 * Math.sqrt(a) * alpha
  const sign = high ? -1 : 1
  const b0 = a * (a + 1 - sign * (a - 1) * cos + s)
  const b1 = sign * 2 * a * (a - 1 - sign * (a + 1) * cos)
  const b2 = a * (a + 1 - sign * (a - 1) * cos - s)
  const a0 = a + 1 + sign * (a - 1) * cos + s
  const a1 = -sign * 2 * (a - 1 + sign * (a + 1) * cos)
  const a2 = a + 1 + sign * (a - 1) * cos - s
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

export function peak(hz: number, db: number, q: number, sr: number): Biquad {
  const a = Math.pow(10, db / 40)
  const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const a0 = 1 + alpha / a
  return {
    b0: (1 + alpha * a) / a0,
    b1: (-2 * cos) / a0,
    b2: (1 - alpha * a) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha / a) / a0,
  }
}

export function lowpass(hz: number, q: number, sr: number): Biquad {
  const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const a0 = 1 + alpha
  const b = (1 - cos) / 2 / a0
  return {
    b0: b,
    b1: 2 * b,
    b2: b,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  }
}

export function highpass(hz: number, q: number, sr: number): Biquad {
  const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const a0 = 1 + alpha
  const b = (1 + cos) / 2 / a0
  return {
    b0: b,
    b1: -2 * b,
    b2: b,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  }
}

export class BiquadState {
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  process(x: number, c: Biquad): number {
    const y = flushDenormal(
      c.b0 * x +
        c.b1 * this.x1 +
        c.b2 * this.x2 -
        c.a1 * this.y1 -
        c.a2 * this.y2,
    )
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }

  reset() {
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
  }
}

/** A resonator with unity gain at its centre, however sharp. */
export function bandpass(hz: number, q: number, sr: number): Biquad {
  const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const a0 = 1 + alpha
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  }
}

/** The gain of a biquad at a frequency, as a ratio. */
export function response(c: Biquad, hz: number, sr: number): number {
  const w = (2 * Math.PI * hz) / sr
  const [cos1, sin1, cos2, sin2] = [
    Math.cos(w),
    Math.sin(w),
    Math.cos(2 * w),
    Math.sin(2 * w),
  ]
  const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2
  const ni = -(c.b1 * sin1 + c.b2 * sin2)
  const dr = 1 + c.a1 * cos1 + c.a2 * cos2
  const di = -(c.a1 * sin1 + c.a2 * sin2)
  return Math.hypot(nr, ni) / Math.hypot(dr, di)
}
