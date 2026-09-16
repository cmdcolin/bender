import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { boardHash } from './share'
import {
  MIN_GAP_MS,
  nextWriteAt,
  observe,
  SETTLE_MS,
  type Opened,
} from './useCurrentSession'

test('a board already written to the account is not written again', () => {
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

const fresh: Opened = { query: null, moved: false }

test('the board the page opened on is not a session', () => {
  const stock = boardHash('', DEFAULT_CONTROLS)
  const at = observe(fresh, stock)
  expect(observe(at, stock).moved).toBe(false)
})

test('the session starts when the board moves off the one it opened on', () => {
  const at = observe(fresh, boardHash('', DEFAULT_CONTROLS))
  const bent = { ...DEFAULT_CONTROLS, chipStarve: 0.8 }
  expect(observe(at, boardHash('', bent)).moved).toBe(true)
})

test('a started session stays started, back on the opening board included', () => {
  const moved = observe(observe(fresh, 'p=1'), 'p=2')
  expect(observe(moved, 'p=1').moved).toBe(true)
})
