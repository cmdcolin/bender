import { expect, test } from 'vitest'

import { Mdct } from './mdct.ts'

function direct(x: Float64Array, n: number) {
  const out = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    let sum = 0
    for (let i = 0; i < 2 * n; i++) {
      const w = Math.sin((Math.PI * (i + 0.5)) / (2 * n))
      sum += x[i]! * w * Math.cos((Math.PI / n) * (i + 0.5 + n / 2) * (k + 0.5))
    }
    out[k] = sum
  }
  return out
}

const noise = (len: number) =>
  Float64Array.from({ length: len }, (_, i) => Math.sin(i * 12.9898) * 0.7)

test('the fast transform matches the MDCT sum', () => {
  for (const n of [16, 128]) {
    const m = new Mdct(n)
    const x = noise(2 * n)
    const fast = new Float64Array(n)
    m.forward(x, fast)
    const slow = direct(x, n)
    for (let k = 0; k < n; k++) expect(fast[k]).toBeCloseTo(slow[k]!, 9)
  }
})

test('overlapping inverses add back to the input', () => {
  const n = 64
  const m = new Mdct(n)
  const x = noise(n * 6)
  const y = new Float64Array(x.length)
  const coef = new Float64Array(n)
  const frame = new Float64Array(2 * n)
  for (let at = 0; at + 2 * n <= x.length; at += n) {
    m.forward(x.subarray(at, at + 2 * n), coef)
    m.inverse(coef, frame)
    for (let i = 0; i < 2 * n; i++) y[at + i]! += frame[i]!
  }
  for (let i = n; i < x.length - n; i++) expect(y[i]).toBeCloseTo(x[i]!, 9)
})
