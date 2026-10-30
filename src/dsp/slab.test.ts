import { expect, test } from 'vitest'

import { pour, slab } from './slab.ts'

const ramp = (n: number, from: number) =>
  Float32Array.from({ length: n }, (_, i) => from + i)

test('a block that straddles the seam posts a full slab and starts the next', () => {
  const into = slab(8)
  const posted: number[][] = []
  const full = () => {
    posted.push([...into.l.subarray(0, into.fill)])
    into.fill = 0
  }
  pour(into, ramp(6, 0), ramp(6, 100), 6, null, full)
  pour(into, ramp(6, 6), ramp(6, 106), 6, null, full)
  expect(posted).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]])
  expect(into.fill).toBe(4)
  expect([...into.l.subarray(0, 4)]).toEqual([8, 9, 10, 11])
  expect([...into.r.subarray(0, 4)]).toEqual([108, 109, 110, 111])
})

test('each track comes off its own block and onto its own slab, in step', () => {
  const into = slab(4)
  const tracks = {
    from: ramp(6, 0),
    block: 3,
    into: [new Float32Array(4), new Float32Array(4)],
  }
  const l = new Float32Array(3)
  pour(into, l, l, 3, tracks, () => {})
  pour(into, l, l, 1, tracks, () => (into.fill = 0))
  expect([...tracks.into[0]!]).toEqual([0, 1, 2, 0])
  expect([...tracks.into[1]!]).toEqual([3, 4, 5, 3])
  expect(into.fill).toBe(0)
})
