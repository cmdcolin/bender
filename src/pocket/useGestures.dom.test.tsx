// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useGestures } from './useGestures.ts'

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(HTMLElement.prototype, { setPointerCapture: () => {} })
})
afterEach(() => vi.useRealTimers())

function Stage(props: { onBend: () => void; onLift: () => void }) {
  const g = useGestures({
    onSwipe: () => {},
    onBend: () => props.onBend(),
    onLift: () => props.onLift(),
  })
  return (
    <div
      data-testid="stage"
      onPointerDown={e => g.press(e)}
      onPointerMove={e => g.drag(e)}
      onPointerUp={e => g.release(e)}
    />
  )
}

const hand = () => {
  const bends: string[] = []
  const lifts: string[] = []
  return {
    bends,
    lifts,
    stage: (who: string) => (
      <Stage onBend={() => bends.push(who)} onLift={() => lifts.push(who)} />
    ),
  }
}

test('a press still held when the stage goes away never turns into a bend', () => {
  const { bends, stage } = hand()
  const { getByTestId, unmount } = render(stage('first'))
  fireEvent.pointerDown(getByTestId('stage'), { pointerId: 1 })
  unmount()
  vi.advanceTimersByTime(1000)
  expect(bends).toEqual([])
})

test('a bend held when the stage goes away is let go', () => {
  const { bends, lifts, stage } = hand()
  const { getByTestId, unmount } = render(stage('first'))
  fireEvent.pointerDown(getByTestId('stage'), { pointerId: 1 })
  vi.advanceTimersByTime(1000)
  expect(bends).toEqual(['first'])
  unmount()
  expect(lifts).toEqual(['first'])
})

test('a hold becomes a bend through the handler of the latest render', () => {
  const { bends, stage } = hand()
  const { getByTestId, rerender } = render(stage('first'))
  fireEvent.pointerDown(getByTestId('stage'), { pointerId: 1 })
  rerender(stage('second'))
  vi.advanceTimersByTime(1000)
  expect(bends).toEqual(['second'])
})
