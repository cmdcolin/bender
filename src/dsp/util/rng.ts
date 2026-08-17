// Deterministic per-stage randomness so every render is reproducible in tests.

export type Rng = () => number

// Uniform draws make a spitty hiss; the ear hears the flat distribution as
// grit. Marsaglia polar, unit variance, second value cached.
function polar(rng: Rng): Rng {
  let spare = 0
  let hasSpare = false
  return () => {
    if (hasSpare) {
      hasSpare = false
      return spare
    }
    let u = 0
    let v = 0
    let s = 0
    do {
      u = rng() * 2 - 1
      v = rng() * 2 - 1
      s = u * u + v * v
    } while (s === 0 || s >= 1)
    const f = Math.sqrt((-2 * Math.log(s)) / s)
    spare = v * f
    hasSpare = true
    return u * f
  }
}

// Thirty-two thousand gaussians, drawn the honest way once at load, so nothing
// on the audio thread ever runs the polar transform again. The tape machine
// alone pulls four draws a sample — two for the transport, one per head — and
// the rejection loop, the log and the sqrt behind each of them cost more than
// the head it feeds.
const NOISE_BITS = 15
const NOISE_MASK = (1 << NOISE_BITS) - 1
const NOISE = Float32Array.from(
  { length: 1 << NOISE_BITS },
  polar(mulberry32(0x1f5)),
)

// A draw is a scrambled index into that table rather than a walk along it. A
// fixed stride would repeat every 0.68 s, which on a quiet passage is a hiss
// with a pulse in it; xorshift32 runs for 2^32 draws before it comes round, and
// two draws landing on the same entry are as independent as any other pair.
export function gaussian(rng: Rng): Rng {
  let x = (rng() * 0x1_0000_0000) >>> 0 || 0x9e3779b9
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return NOISE[x & NOISE_MASK]!
  }
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
