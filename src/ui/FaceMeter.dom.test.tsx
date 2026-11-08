// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { N_TAPS, SOURCE_TAPS } from '../engine/params.ts'
import { DeviceVerbs } from './DeviceVerbs.tsx'
import { FaceMeter } from './FaceMeter.tsx'
import './testDom.ts'

const booted = engine.meter.get()
let frames: FrameRequestCallback[] = []
let now = 0

const runFrames = (ms = 16) => {
  now += ms
  const due = frames
  frames = []
  for (const frame of due) frame(now)
}

const post = (taps: Float32Array) =>
  act(() => engine.meter.set({ ...engine.meter.get(), taps }))

const tapping = (tap: (typeof SOURCE_TAPS)[number], level: number) => {
  const taps = new Float32Array(N_TAPS)
  taps[SOURCE_TAPS.indexOf(tap)] = level
  return taps
}

const meterOf = (container: HTMLElement, stage: string) =>
  container.querySelector<HTMLElement>(`[data-meter="${stage}"]`)

const fillOf = (container: HTMLElement, stage: string) =>
  container.querySelector<HTMLElement>(`[data-meter="${stage}"] > :first-child`)

const tickOf = (container: HTMLElement, stage: string) =>
  container.querySelector<HTMLElement>(`[data-meter="${stage}"] > :last-child`)

beforeEach(() => {
  frames = []
  now = 0
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
  act(() => runFrames())
  post(tapping('fmChip', 0.5))
  expect(frames).toHaveLength(1)
  act(() => runFrames())
  expect(fillOf(container, 'Glint')?.style.transform).not.toBe('scaleY(0)')
  expect(fillOf(container, 'Plinky')?.style.transform).toBe('scaleY(0)')

  let falling = 0
  for (; falling < 400 && frames.length > 0; falling++) {
    post(new Float32Array(N_TAPS))
    act(() => runFrames())
  }
  expect(falling).toBeLessThan(400)
  expect(fillOf(container, 'Glint')?.style.transform).toBe('scaleY(0)')
  expect(tickOf(container, 'Glint')?.style.transform).toBe('translateY(100%)')
})

test('the peak line holds for a second after the bar falls, then drops', () => {
  const { container } = render(<FaceMeter stage="Glint" />)
  post(tapping('fmChip', 0.5))
  act(() => runFrames())
  const top = tickOf(container, 'Glint')?.style.transform
  expect(top).not.toBe('translateY(100%)')

  for (let i = 0; i < 30; i++) {
    post(new Float32Array(N_TAPS))
    act(() => runFrames())
  }
  expect(tickOf(container, 'Glint')?.style.transform).toBe(top)

  for (let i = 0; i < 40; i++) {
    post(new Float32Array(N_TAPS))
    act(() => runFrames())
  }
  expect(tickOf(container, 'Glint')?.style.transform).not.toBe(top)
})

test('full scale latches a red outline until the volume cap is pressed', () => {
  const { container } = render(<DeviceVerbs stage="Growler" />)
  const cap = screen.getByRole('button', { name: 'volume Growler' })
  expect(cap.contains(meterOf(container, 'Growler'))).toBe(true)

  post(tapping('monoSynth', 0.9))
  act(() => runFrames())
  expect(meterOf(container, 'Growler')?.hasAttribute('data-clipped')).toBe(
    false,
  )

  post(tapping('monoSynth', 1.2))
  act(() => runFrames())
  for (let i = 0; i < 20; i++) {
    post(new Float32Array(N_TAPS))
    act(() => runFrames())
  }
  expect(meterOf(container, 'Growler')?.hasAttribute('data-clipped')).toBe(true)

  fireEvent.click(cap)
  expect(meterOf(container, 'Growler')?.hasAttribute('data-clipped')).toBe(
    false,
  )
  expect(cap.getAttribute('aria-expanded')).toBe('true')
})

test('a face with its Level on the deck wears the meter beside it', () => {
  const { container } = render(<DeviceVerbs stage="Spool" />)
  const meter = meterOf(container, 'Spool')
  expect(meter).toBeTruthy()
  expect(meter?.closest('button')).toBeNull()
})
