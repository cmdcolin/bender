// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { MIN_GAP_MS, SETTLE_MS } from 'skillet-shared/session-gate'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { useCurrentSession } from './useCurrentSession.ts'
import './testDom.ts'

const { putSession, hashed } = vi.hoisted(() => ({
  putSession: vi.fn(() => Promise.resolve()),
  hashed: { count: 0 },
}))

vi.mock('./cloud.ts', () => ({ putSession }))
vi.mock('./share.ts', async importActual => {
  const actual = await importActual<typeof import('./share.ts')>()
  return {
    ...actual,
    boardHash: (...args: Parameters<typeof actual.boardHash>) => {
      hashed.count++
      return actual.boardHash(...args)
    },
  }
})

const stock = engine.controls.get()

beforeEach(() => {
  vi.useFakeTimers()
  putSession.mockClear()
  hashed.count = 0
})

afterEach(() => {
  vi.useRealTimers()
  engine.controls.set(stock)
})

test('a drag hashes the board once it settles, not once a frame', () => {
  renderHook(() => useCurrentSession('me'))
  const before = hashed.count
  act(() => {
    for (let i = 1; i <= 60; i++) engine.set('filtHz', 300 + i)
  })
  expect(hashed.count).toBe(before)
  act(() => {
    vi.advanceTimersByTime(SETTLE_MS)
  })
  expect(hashed.count).toBe(before + 1)
  expect(putSession).toHaveBeenCalledTimes(1)
})

test('a board that went away and came back before settling writes nothing', () => {
  renderHook(() => useCurrentSession('me'))
  const was = engine.controls.get().filtHz
  act(() => {
    engine.set('filtHz', was + 100)
    engine.set('filtHz', was)
  })
  act(() => {
    vi.advanceTimersByTime(SETTLE_MS + MIN_GAP_MS)
  })
  expect(putSession).not.toHaveBeenCalled()
})

test('hiding the tab writes a board still waiting to settle', () => {
  renderHook(() => useCurrentSession('me'))
  act(() => engine.set('filtHz', engine.controls.get().filtHz + 100))
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(putSession).toHaveBeenCalledTimes(1)
  act(() => {
    vi.advanceTimersByTime(SETTLE_MS + MIN_GAP_MS)
  })
  expect(putSession).toHaveBeenCalledTimes(1)
  vi.restoreAllMocks()
})
