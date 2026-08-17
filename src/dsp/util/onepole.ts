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
