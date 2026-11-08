import { expect, test } from 'vitest'

import { pitchHz, sine, SR } from '../testRender.ts'
import { Cord } from './cord.ts'

function through(stages: number, x: Float32Array) {
  const cord = new Cord(SR)
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i += 128) {
    const n = Math.min(128, x.length - i)
    cord.run(x.subarray(i, i + n), out.subarray(i, i + n), n, stages, 1)
  }
  return out
}

const peak = (x: Float32Array) =>
  x.reduce((a, v) => Math.max(a, Math.abs(v)), 0)

test('pin passes Plinky through untouched', () => {
  const x = sine(440, 0.1)
  expect(through(0, x)).toEqual(x)
})

test('two flip-flops divide a note by four', () => {
  expect(pitchHz(through(2, sine(440, 1)))).toBeCloseTo(110, -1)
})

test('the coupling cap drains the cord once the note stops crossing the trigger', () => {
  const x = new Float32Array(SR)
  x.set(sine(220, 0.3))
  expect(peak(through(1, x).subarray(0.5 * SR))).toBeLessThan(1e-3)
})

test('a note under the trigger never moves the count', () => {
  expect(peak(through(1, sine(220, 0.5, 0.04)))).toBeLessThan(1e-6)
})
