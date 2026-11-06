// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { N_BANDS } from '../dsp/util/bandMeter.ts'
import { engine } from '../engine/engine.ts'
import { BAND_ROWS, N_TAPS, SOURCE_TAPS } from '../engine/params.ts'
import { CHANNELS } from './controls/index.ts'
import { showSourceMeters, sourceMetersShown } from './sourceMeters.ts'
import { SourceMeters, SourceMetersSwitch } from './SourceMeters.tsx'
import './testDom.ts'

const booted = engine.meter.get()
let frames: FrameRequestCallback[] = []

const runFrames = () => {
  const due = frames
  frames = []
  for (const frame of due) frame(performance.now())
}

const post = (
  taps: Float32Array,
  bands = new Float32Array(BAND_ROWS * N_BANDS),
) => act(() => engine.meter.set({ ...engine.meter.get(), taps, bands }))

const tile = (name: string) => screen.getByText(name).closest('figure')

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
  vi.restoreAllMocks()
  engine.meter.set(booted)
  act(() => showSourceMeters(false))
})

test('the switch shows a tile per channel and hides them again', () => {
  render(
    <>
      <SourceMetersSwitch />
      <SourceMeters />
    </>,
  )
  const button = screen.getByRole('button', { name: 'meters' })
  expect(screen.queryByLabelText('source meters')).toBeNull()

  fireEvent.click(button)
  expect(sourceMetersShown.get()).toBe(true)
  expect(button.getAttribute('aria-pressed')).toBe('true')
  for (const { name } of CHANNELS) expect(screen.getByText(name)).toBeTruthy()

  fireEvent.click(button)
  expect(screen.queryByLabelText('source meters')).toBeNull()
})

test('the audio thread splits the bands only while the tiles are up', () => {
  const watch = vi.spyOn(engine, 'watchBands')
  render(<SourceMeters />)
  expect(watch).not.toHaveBeenCalled()
  act(() => showSourceMeters(true))
  expect(watch).toHaveBeenLastCalledWith(true)
  act(() => showSourceMeters(false))
  expect(watch).toHaveBeenLastCalledWith(false)
})

test('a sounding source lights its tile, and a silent desk requests no frames', () => {
  act(() => showSourceMeters(true))
  render(<SourceMeters />)
  act(runFrames)
  const fm = SOURCE_TAPS.indexOf('fmChip')
  expect(tile('Glint')?.hasAttribute('data-quiet')).toBe(true)

  const taps = new Float32Array(N_TAPS)
  taps[fm] = 0.5
  const bands = new Float32Array(BAND_ROWS * N_BANDS)
  bands[fm * N_BANDS + 5] = 0.3
  post(taps, bands)
  expect(frames).toHaveLength(1)
  act(runFrames)
  expect(tile('Glint')?.hasAttribute('data-quiet')).toBe(false)
  expect(tile('Plinky')?.hasAttribute('data-quiet')).toBe(true)

  let falling = 0
  for (; falling < 200; falling++) {
    post(new Float32Array(N_TAPS))
    if (frames.length === 0) break
    act(runFrames)
  }
  expect(falling).toBeLessThan(200)
  expect(tile('Glint')?.hasAttribute('data-quiet')).toBe(true)
})
