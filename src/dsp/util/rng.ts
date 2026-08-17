// Deterministic per-stage randomness so every render is reproducible in tests.

export type Rng = () => number

// Uniform draws make a spitty hiss; the ear hears the flat distribution as
// grit. Marsaglia polar, unit variance, second value cached.
export function gaussian(rng: Rng): Rng {
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

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
