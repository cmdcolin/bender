// tanh as a rational, not a call into libm.
//
// The safety tail alone runs this four times a sample before a single bend is
// patched, and every saturating loop on the board adds two more — it was the
// most expensive single thing on the audio thread. This is the Padé (7,6)
// expansion, flat outside the range where a signal here can still be told
// apart from its own clipping: it holds to about a ten-thousandth, which is
// -79 dB, and it stays odd, smooth and monotonic. Those three are what a soft
// clipper is for; the fourth decimal place of it was never the sound.
const CLIP = 4.9

export function softclip(x: number): number {
  if (x < -CLIP) return -1
  if (x > CLIP) return 1
  const x2 = x * x
  return (
    (x * (135135 + x2 * (17325 + x2 * (378 + x2)))) /
    (135135 + x2 * (62370 + x2 * (3150 + x2 * 28)))
  )
}

// Two compares rather than Math.abs keeps this under V8's small-function size,
// so callers inline it without spending their inlining budget on it.
export function flushDenormal(x: number): number {
  return x < 1e-15 && x > -1e-15 ? 0 : x
}
