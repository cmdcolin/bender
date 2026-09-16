import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { renderStems, rms } from '../dsp/testRender'
import { dailyBoard, dayKey } from './daily'
import { boardFromUrl } from './share'

const DAY = 24 * 60 * 60 * 1000
const noon = Date.UTC(2026, 8, 16, 12)

test('the board is the same all through a UTC day', () => {
  const morning = dailyBoard(Date.UTC(2026, 8, 16, 0, 0, 1))
  const night = dailyBoard(Date.UTC(2026, 8, 16, 23, 59, 59))
  expect(morning).toEqual(night)
  expect(morning.day).toBe('2026-09-16')
})

test('the board changes from one day to the next', () => {
  const queries = new Set(
    Array.from({ length: 14 }, (_, i) => dailyBoard(noon + i * DAY).query),
  )
  expect(queries.size).toBe(14)
})

test('dayKey reads the date in UTC', () => {
  expect(dayKey(Date.UTC(2026, 0, 1, 23, 30))).toBe('2026-01-01')
})

test('two weeks of daily boards all make sound', () => {
  for (let i = 0; i < 14; i++) {
    const { query, day } = dailyBoard(noon + i * DAY)
    const board = boardFromUrl('', `#${query}`)
    expect(board, day).not.toBe(null)
    const { master } = renderStems({ ...DEFAULT_CONTROLS, ...board }, 1.5)
    expect(rms(master), day).toBeGreaterThan(0.01)
  }
})
