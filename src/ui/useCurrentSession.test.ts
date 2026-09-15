import { expect, test } from 'vitest'
import { MIN_GAP_MS, nextWriteAt, SETTLE_MS } from './useCurrentSession'

test('a board the account already holds is not written again', () => {
  expect(nextWriteAt({ query: 'p=1', at: 0 }, 'p=1', 1000)).toBeNull()
})

test('a settled board past the gap is written when the debounce is up', () => {
  const now = 100_000
  expect(nextWriteAt({ query: null, at: 0 }, 'p=1', now)).toBe(now + SETTLE_MS)
})

test('a write close behind the last one waits for the gap instead', () => {
  expect(nextWriteAt({ query: 'p=0', at: 1000 }, 'p=1', 1100)).toBe(
    1000 + MIN_GAP_MS,
  )
})
