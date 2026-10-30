// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { SampleReel } from './SampleReel.tsx'
import './testDom.ts'

const meterWith = (o: Partial<ReturnType<typeof engine.meter.get>>) =>
  act(() => engine.meter.set({ ...engine.meter.get(), ...o }))

afterEach(() => meterWith({ sampleSecs: 0 }))

function threadedReel() {
  meterWith({ sampleSecs: 4 })
  const canvas = render(<SampleReel />).container.querySelector('canvas')
  if (canvas === null) throw new Error('no reel drawn')
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 100, 10)
  return canvas
}

test('a crossed marker is grabbed as the control it is', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, loopIn: 0.8, loopOut: 0.2 })
  const canvas = threadedReel()
  fireEvent.pointerDown(canvas, { clientX: 21, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 30, pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
  expect(engine.controls.get().loopIn).toBe(0.8)
  expect(engine.controls.get().loopOut).toBeCloseTo(0.3)
})
