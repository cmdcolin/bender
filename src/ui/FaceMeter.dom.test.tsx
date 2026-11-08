// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { N_TAPS, SOURCE_TAPS } from '../engine/params.ts'
import { FaceMeter } from './FaceMeter.tsx'
import './testDom.ts'

const booted = engine.meter.get()
let frames: FrameRequestCallback[] = []

const runFrames = () => {
  const due = frames
  frames = []
  for (const frame of due) frame(performance.now())
}

const post = (taps: Float32Array) =>
  act(() => engine.meter.set({ ...engine.meter.get(), taps }))

const tapping = (tap: (typeof SOURCE_TAPS)[number], level: number) => {
  const taps = new Float32Array(N_TAPS)
  taps[SOURCE_TAPS.indexOf(tap)] = level
  return taps
}

const fillOf = (container: HTMLElement, stage: string) =>
  container.querySelector<HTMLElement>(`[data-meter="${stage}"] > span`)

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.push(frame)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  engine.meter.set(booted)
})

test('a pedal has no meter', () => {
  const { container } = render(<FaceMeter stage="Boing" />)
  expect(container.querySelector('[data-meter]')).toBeNull()
})

test('the bar rises with its own machine and falls back to empty', () => {
  const { container } = render(
    <>
      <FaceMeter stage="Glint" />
      <FaceMeter stage="Plinky" />
    </>,
  )
  act(runFrames)
  post(tapping('fmChip', 0.5))
  expect(frames).toHaveLength(1)
  act(runFrames)
  expect(fillOf(container, 'Glint')?.style.transform).not.toBe('scaleY(0)')
  expect(fillOf(container, 'Plinky')?.style.transform).toBe('scaleY(0)')

  let falling = 0
  for (; falling < 200 && frames.length > 0; falling++) {
    post(new Float32Array(N_TAPS))
    act(runFrames)
  }
  expect(falling).toBeLessThan(200)
  expect(fillOf(container, 'Glint')?.style.transform).toBe('scaleY(0)')
})

test('a hot machine lights the bar in the alarm colour', () => {
  const { container } = render(<FaceMeter stage="Growler" />)
  post(tapping('monoSynth', 1))
  act(runFrames)
  expect(fillOf(container, 'Growler')?.style.background).toBe('var(--alarm)')
})
