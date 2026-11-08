export const TOY_DIV_NAMES = ['pin', '÷2', '÷4', '÷8']

const HYST = 0.05
const SQUARE = 0.7
const COUPLE_HZ = 20

export class ToyCord {
  private high = false
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
      const x = pin[i]!
      if (!this.high && x > HYST) {
        this.high = true
        this.count = (this.count + 1) & wrap
      } else if (this.high && x < -HYST) this.high = false
      const sq = this.count & bit ? SQUARE : -SQUARE
      this.dc += this.couple * (sq - this.dc)
      out[i] = (sq - this.dc) * gain
    }
  }

  reset() {
    this.high = false
    this.count = 0
    this.dc = -SQUARE
  }
}
