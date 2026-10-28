// A sine-windowed MDCT of `n` bins over 2n samples, run as a DCT-IV on an
// n/2-point complex FFT. Frames overlap by n, and the overlap-add of two
// inverses cancels the time aliasing.
export class Mdct {
  readonly n: number
  readonly window: Float64Array
  private readonly half: number
  private readonly preRe: Float64Array
  private readonly preIm: Float64Array
  private readonly twRe: Float64Array
  private readonly twIm: Float64Array
  private readonly fftCos: Float64Array
  private readonly fftSin: Float64Array
  private readonly rev: Uint32Array
  private readonly re: Float64Array
  private readonly im: Float64Array
  private readonly fold: Float64Array

  constructor(n: number) {
    this.n = n
    const half = n / 2
    this.half = half
    this.window = Float64Array.from({ length: 2 * n }, (_, i) =>
      Math.sin((Math.PI * (i + 0.5)) / (2 * n)),
    )
    this.preRe = new Float64Array(half)
    this.preIm = new Float64Array(half)
    this.twRe = new Float64Array(half)
    this.twIm = new Float64Array(half)
    for (let k = 0; k < half; k++) {
      this.preRe[k] = Math.cos((-Math.PI * k) / n)
      this.preIm[k] = Math.sin((-Math.PI * k) / n)
      const a = (-Math.PI * (4 * k + 1)) / (4 * n)
      this.twRe[k] = Math.cos(a)
      this.twIm[k] = Math.sin(a)
    }
    this.fftCos = new Float64Array(half / 2)
    this.fftSin = new Float64Array(half / 2)
    for (let k = 0; k < half / 2; k++) {
      this.fftCos[k] = Math.cos((-2 * Math.PI * k) / half)
      this.fftSin[k] = Math.sin((-2 * Math.PI * k) / half)
    }
    const bits = Math.log2(half)
    this.rev = new Uint32Array(half)
    for (let i = 0; i < half; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      this.rev[i] = r
    }
    this.re = new Float64Array(half)
    this.im = new Float64Array(half)
    this.fold = new Float64Array(n)
  }

  /** windows `x` (2n samples) and writes its n coefficients into `out` */
  forward(x: Float64Array, out: Float64Array) {
    const { n, half, window: w, fold } = this
    for (let i = 0; i < half; i++) {
      const a = x[i]! * w[i]!
      const br = x[n - 1 - i]! * w[n - 1 - i]!
      const cr = x[n + half - 1 - i]! * w[n + half - 1 - i]!
      const d = x[n + half + i]! * w[n + half + i]!
      fold[i] = -cr - d
      fold[half + i] = a - br
    }
    this.dct4(fold, out)
  }

  /** writes the windowed 2n-sample inverse of `coef` into `out`, ready to
      overlap-add */
  inverse(coef: Float64Array, out: Float64Array) {
    const { n, half, window: w, fold } = this
    this.dct4(coef, fold)
    const s = 2 / n
    for (let i = 0; i < half; i++) {
      const u1 = fold[i]! * s
      const u2 = fold[half + i]! * s
      out[i] = u2 * w[i]!
      out[n - 1 - i] = -u2 * w[n - 1 - i]!
      out[n + half - 1 - i] = -u1 * w[n + half - 1 - i]!
      out[n + half + i] = -u1 * w[n + half + i]!
    }
  }

  private dct4(x: Float64Array, out: Float64Array) {
    const { n, half, preRe, preIm, twRe, twIm, re, im, rev } = this
    for (let k = 0; k < half; k++) {
      const a = x[2 * k]!
      const b = x[n - 1 - 2 * k]!
      const j = rev[k]!
      re[j] = a * preRe[k]! - b * preIm[k]!
      im[j] = a * preIm[k]! + b * preRe[k]!
    }
    this.fft()
    for (let k = 0; k < half; k++) {
      const yr = re[k]! * twRe[k]! - im[k]! * twIm[k]!
      const yi = re[k]! * twIm[k]! + im[k]! * twRe[k]!
      out[2 * k] = yr
      out[n - 1 - 2 * k] = -yi
    }
  }

  private fft() {
    const { half, re, im, fftCos, fftSin } = this
    for (let size = 2; size <= half; size *= 2) {
      const span = size / 2
      const stride = half / size
      for (let start = 0; start < half; start += size) {
        for (let k = 0; k < span; k++) {
          const c = fftCos[k * stride]!
          const s = fftSin[k * stride]!
          const p = start + k
          const q = p + span
          const tr = re[q]! * c - im[q]! * s
          const ti = re[q]! * s + im[q]! * c
          re[q] = re[p]! - tr
          im[q] = im[p]! - ti
          re[p] = re[p]! + tr
          im[p] = im[p]! + ti
        }
      }
    }
  }
}
