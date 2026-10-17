import { describe, expect, it } from 'vitest'

import { N_PARAMS, SMOOTH_SEC } from '../engine/params.ts'
import { Smoother } from './smoother.ts'

const slew = SMOOTH_SEC.findIndex(s => s > 0)

function settle(from: number, to: number) {
  const s = new Smoother(48000, 128)
  const target = new Float32Array(N_PARAMS)
  target[slew] = from
  s.step(target)
  target[slew] = to
  for (let i = 0; i < 2000; i++) s.step(target)
  return s.cur[slew]
}

describe('Smoother', () => {
  it('lands a slew param exactly on 0', () => {
    expect(slew).toBeGreaterThanOrEqual(0)
    expect(settle(1, 0)).toBe(0)
  })

  it('lands a slew param exactly on 1', () => {
    expect(settle(0, 1)).toBe(1)
  })
})
