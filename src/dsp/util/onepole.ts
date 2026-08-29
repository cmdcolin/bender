import { flushDenormal } from './softclip'

export function lpCoef(hz: number, sr: number): number {
  return 1 - Math.exp((-2 * Math.PI * hz) / sr)
}

export class OnePoleLP {
  private y = 0
  process(x: number, coef: number): number {
    this.y = flushDenormal(this.y + coef * (x - this.y))
    return this.y
  }
  reset() {
    this.y = 0
  }
  get state() {
    return this.y
  }
}

// A high-pass of as many one-poles as it takes, each one the low-pass taken off
// the signal. Six decibels an octave is a slope, not a wall: where what has to
// go is tens of decibels louder than what has to stay, the number of poles is
// the whole of whether the filter does anything at all.
export class Highpass {
  private poles: OnePoleLP[]
  constructor(n: number) {
    this.poles = Array.from({ length: n }, () => new OnePoleLP())
  }
  process(x: number, coef: number): number {
    let y = x
    for (const pole of this.poles) y -= pole.process(y, coef)
    return y
  }
  reset() {
    for (const pole of this.poles) pole.reset()
  }
}

// The same again the other way up: a low-pass steep enough to be a lid rather
// than a lean.
export class Lowpass {
  private poles: OnePoleLP[]
  constructor(n: number) {
    this.poles = Array.from({ length: n }, () => new OnePoleLP())
  }
  process(x: number, coef: number): number {
    let y = x
    for (const pole of this.poles) y = pole.process(y, coef)
    return y
  }
  reset() {
    for (const pole of this.poles) pole.reset()
  }
}

export class DcBlocker {
  private x1 = 0
  private y1 = 0
  process(x: number, coef: number): number {
    const y = x - this.x1 + coef * this.y1
    this.x1 = x
    this.y1 = flushDenormal(y)
    return y
  }
  reset() {
    this.x1 = 0
    this.y1 = 0
  }
}
