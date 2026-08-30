// What a take is made of, by frequency — the measurement `knife.ts` and the
// tests reach for when the question is not "did this wire do anything" but
// "what kind of sound did it do".
//
// The rest of testRender measures one thing at a time: how much sits under
// 120 Hz, how much over 8 kHz, how peaky it is. That is enough to catch a
// board that sat down or a staircase that started aliasing, and it is not
// enough to answer the question a bend is actually judged on, which is whether
// the chip is making a *note* or making a *noise*. Those two can have the same
// level, the same crest and the same weight in every band, and be the
// difference between a bell and a cymbal.
//
// Flatness is what tells them apart: the geometric mean of the spectrum over
// its arithmetic mean. A sine puts all its energy in one bin, so the geometric
// mean is near zero and the ratio with it; white noise puts the same energy
// everywhere, so the two means agree and the ratio is one. Nothing else here
// separates a chip that has been detuned from a chip that has stopped being
// tonal at all.

/** Magnitudes of the first half of a Hann-windowed transform, radix-2. */
function magnitudes(x: Float32Array, at: number, n: number): Float64Array {
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i++)
    re[i] = (x[at + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n))
  // Bit-reversal, then the butterflies in place.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const t = re[i]!
      re[i] = re[j]!
      re[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const w = ang * k
        const wr = Math.cos(w)
        const wi = Math.sin(w)
        const a = i + k
        const b = a + (len >> 1)
        const xr = re[b]! * wr - im[b]! * wi
        const xi = re[b]! * wi + im[b]! * wr
        re[b] = re[a]! - xr
        im[b] = im[a]! - xi
        re[a] = re[a]! + xr
        im[a] = im[a]! + xi
      }
  }
  const out = new Float64Array(n >> 1)
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(re[k]!, im[k]!) / n
  return out
}

/** The band edges the bands below are counted between, in hertz. */
export const BANDS = ['sub', 'low', 'mid', 'high', 'air'] as const
const EDGES = [30, 120, 480, 1900, 7600, 20000]

export interface Spectrum {
  /** the balance point, in hertz — one number for how bright a take is */
  centroid: number
  /** 0 for a sine, 1 for white noise, and everything on this board between */
  flatness: number
  /** share of the power in each of BANDS, summing to one */
  bands: number[]
}

/**
 * A whole take, averaged over every window in it — a bend that changes what it
 * is doing halfway through is one measurement, not two, which is what a knife
 * on a bus mostly is.
 */
export function spectrum(x: Float32Array, sr: number, n = 4096): Spectrum {
  const hops = Math.max(1, Math.floor(x.length / n) - 1)
  const m = new Float64Array(n >> 1)
  for (let h = 0; h < hops; h++) {
    const w = magnitudes(x, h * n, n)
    for (let k = 0; k < m.length; k++) m[k]! += w[k]! / hops
  }
  const hzPer = sr / n
  const bands = new Array<number>(BANDS.length).fill(0)
  let weighted = 0
  let total = 0
  let logs = 0
  let counted = 0
  for (let k = 1; k < m.length; k++) {
    const hz = k * hzPer
    const power = m[k]! * m[k]!
    weighted += hz * power
    total += power
    // The flatness window stops short of both ends: a DC offset and the last
    // octave under Nyquist are where a geometric mean goes to meet the noise
    // floor rather than the signal.
    if (hz > 40 && hz < 16000) {
      logs += Math.log(power + 1e-18)
      counted++
    }
    for (let b = 0; b < BANDS.length; b++)
      if (hz >= EDGES[b]! && hz < EDGES[b + 1]!) bands[b]! += power
  }
  const sum = bands.reduce((a, b) => a + b, 0) + 1e-18
  return {
    centroid: total > 0 ? weighted / total : 0,
    flatness: Math.exp(logs / counted) / (total / (m.length - 1) + 1e-18),
    bands: bands.map(b => b / sum),
  }
}
