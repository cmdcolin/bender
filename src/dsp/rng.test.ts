import { expect, test } from 'vitest'
import { gaussian, mulberry32 } from './util/rng'

// The table is drawn once and read for the life of the process, so whatever it
// averages to is a dc offset on every draw rather than an error that washes out
// with more of them. Thirty-two thousand gaussians landed about a
// three-hundredth of a deviation off zero, which is nothing under a hiss and
// everything under the tape's slow drift: a one-pole at 0.12 Hz averages sixty
// thousand draws, so it converged on the offset and stayed there, and a
// transport that was meant to wander either way sat pinned against the far end
// of its travel for the length of any take.
test('the gaussian table is centred', () => {
  const g = gaussian(mulberry32(11))
  let sum = 0
  // Enough draws that the index permutation's own sampling error is a third of
  // the bound, so what is left to fail on is the table.
  const n = 8_000_000
  for (let i = 0; i < n; i++) sum += g()
  expect(Math.abs(sum / n)).toBeLessThan(1e-3)
})

// What that costs downstream, in the units the tape reads it in: the drift is
// this filter times 260, and its travel is ±1.
test('a slow filter on the noise settles at zero rather than at one end', () => {
  const coef = 1 - Math.exp((-2 * Math.PI * 0.12) / 48000)
  for (const seed of [2323, 1, 7]) {
    const g = gaussian(mulberry32(seed))
    let y = 0
    let sum = 0
    const n = 30 * 48000
    for (let i = 0; i < n; i++) {
      y += coef * (g() - y)
      sum += y
    }
    expect(Math.abs((sum / n) * 260), `seed ${seed}`).toBeLessThan(0.4)
  }
})
