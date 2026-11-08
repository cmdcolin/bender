import { expect, test } from 'vitest'

import { follower, punch } from './pileMeter.ts'

test('a hit after quiet reads near full, and a held level settles to a dim glow', () => {
  const f = follower()
  for (let i = 0; i < 200; i++) punch(f, 0.1)
  expect(punch(f, 0.8)).toBeGreaterThan(0.9)
  let held = 1
  for (let i = 0; i < 300; i++) held = punch(f, 0.8)
  expect(held).toBeGreaterThan(0.2)
  expect(held).toBeLessThan(0.4)
})
