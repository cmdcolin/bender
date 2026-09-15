import { expect, test } from 'vitest'
import { sinceWords } from './relativeTime'

test('the words get coarser as the gap grows', () => {
  const now = 10_000_000_000
  const ago = (ms: number) => sinceWords(now - ms, now)
  expect(ago(0)).toBe('just now')
  expect(ago(59_000)).toBe('just now')
  expect(ago(60_000)).toBe('1 minute ago')
  expect(ago(3 * 60_000)).toBe('3 minutes ago')
  expect(ago(2 * 3_600_000)).toBe('2 hours ago')
  expect(ago(3 * 86_400_000)).toBe('3 days ago')
  expect(ago(70 * 86_400_000)).toBe('2 months ago')
  expect(ago(800 * 86_400_000)).toBe('2 years ago')
})

test('a clock that ran backwards reads as just now', () => {
  expect(sinceWords(5000, 0)).toBe('just now')
  expect(sinceWords(Number.NaN, 0)).toBe('just now')
})
