export const BAND_HZ = [
  31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const
export const N_BANDS = BAND_HZ.length

const Q = Math.SQRT2
const QUIET = 1e-5

export class BandMeter {
  on = false
  /** `levels[row * N_BANDS + band]`, scaled so a sine at a band's centre
      reads its own amplitude. */
  readonly levels: Float32Array
  private readonly sums: Float64Array
  private readonly state: Float64Array
  private readonly a1 = new Float64Array(N_BANDS).fill(1)
  private readonly a2 = new Float64Array(N_BANDS)
  private readonly a3 = new Float64Array(N_BANDS)
  private count = 0

  constructor(rows: number, sr: number) {
    this.levels = new Float32Array(rows * N_BANDS)
    this.sums = new Float64Array(rows * N_BANDS)
    this.state = new Float64Array(rows * N_BANDS * 2)
    for (const [b, hz] of BAND_HZ.entries())
      if (hz < 0.45 * sr) {
        const g = Math.tan((Math.PI * hz) / sr)
        const a1 = 1 / (1 + g * (g + 1 / Q))
        this.a1[b] = a1
        this.a2[b] = g * a1
        this.a3[b] = g * g * a1
      }
  }

  feed(row: number, x: Float32Array, at: number, n: number) {
    let peak = 0
    for (let i = 0; i < n; i++) {
      const v = x[at + i]!
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
    }
    const s = row * N_BANDS * 2
    if (peak < QUIET) this.state.fill(0, s, s + N_BANDS * 2)
    else {
      const { sums, state, a1, a2, a3 } = this
      for (let b = 0; b < N_BANDS; b += 2) {
        const a1p = a1[b]!
        const a2p = a2[b]!
        const a3p = a3[b]!
        const a1q = a1[b + 1]!
        const a2q = a2[b + 1]!
        const a3q = a3[b + 1]!
        const at1 = s + 2 * b
        let p1 = state[at1]!
        let p2 = state[at1 + 1]!
        let q1 = state[at1 + 2]!
        let q2 = state[at1 + 3]!
        let accP = 0
        let accQ = 0
        for (let i = 0; i < n; i++) {
          const v = x[at + i]!
          const p3 = v - p2
          const q3 = v - q2
          const pBand = a1p * p1 + a2p * p3
          const qBand = a1q * q1 + a2q * q3
          const pLow = p2 + a2p * p1 + a3p * p3
          const qLow = q2 + a2q * q1 + a3q * q3
          p1 = 2 * pBand - p1
          q1 = 2 * qBand - q1
          p2 = 2 * pLow - p2
          q2 = 2 * qLow - q2
          accP += pBand * pBand
          accQ += qBand * qBand
        }
        state[at1] = p1
        state[at1 + 1] = p2
        state[at1 + 2] = q1
        state[at1 + 3] = q2
        const j = row * N_BANDS + b
        sums[j] = sums[j]! + accP / (Q * Q)
        sums[j + 1] = sums[j + 1]! + accQ / (Q * Q)
      }
    }
  }

  pass(n: number) {
    this.count += n
  }

  settle() {
    const k = this.count > 0 ? 2 / this.count : 0
    for (let i = 0; i < this.levels.length; i++)
      this.levels[i] = Math.sqrt(this.sums[i]! * k)
    this.sums.fill(0)
    this.count = 0
  }

  reset() {
    this.state.fill(0)
    this.sums.fill(0)
    this.levels.fill(0)
    this.count = 0
  }
}
