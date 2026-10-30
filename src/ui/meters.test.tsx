// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { engine } from '../engine/engine.ts'
import { N_TAPS, TAP_BUS } from '../engine/params.ts'
import { GROUPS } from './controls/index.ts'
import { Mixer } from './Mixer.tsx'
import { Scope } from './Scope.tsx'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

// The widgets that draw off the meter request animation frames only while
// they have something new to draw, so a silent board leaves the compositor
// idle. These count the frames each one requests.

const booted = engine.meter.get()
let frames: FrameRequestCallback[] = []

const runFrames = () => {
  const due = frames
  frames = []
  for (const frame of due) frame(performance.now())
}

const post = (patch: Partial<ReturnType<typeof engine.meter.get>>) =>
  act(() => engine.meter.set({ ...engine.meter.get(), ...patch }))

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.push(frame)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
})

afterEach(() => {
  vi.unstubAllGlobals()
  HTMLCanvasElement.prototype.getContext = () => null
  engine.meter.set(booted)
})

test('the scope requests no frames for silent meter posts once its flat trace is drawn', () => {
  render(<Scope />)
  act(runFrames)
  post({ peak: 0 })
  expect(frames).toHaveLength(0)

  post({ peak: 0.5, scope: new Float32Array(512).fill(0.5) })
  expect(frames).toHaveLength(1)
  act(runFrames)

  post({ peak: 0, scope: new Float32Array(512) })
  expect(frames).toHaveLength(1)
  act(runFrames)
  post({ peak: 0 })
  expect(frames).toHaveLength(0)
})

test('the desk requests frames while a bar falls and none once every bar is empty', () => {
  render(<Mixer />)
  act(runFrames)
  act(runFrames)
  post({ taps: new Float32Array(N_TAPS) })
  expect(frames).toHaveLength(0)

  const taps = new Float32Array(N_TAPS)
  taps[TAP_BUS] = 0.8
  post({ taps })
  expect(frames).toHaveLength(1)
  act(runFrames)
  post({ taps: new Float32Array(N_TAPS) })

  let drawn = 0
  while (frames.length > 0 && drawn < 1000) {
    act(runFrames)
    drawn++
  }
  expect(drawn).toBeGreaterThan(10)
  expect(drawn).toBeLessThan(1000)
  post({ taps: new Float32Array(N_TAPS) })
  expect(frames).toHaveLength(0)
})

test('a four-track reel repaints only when what it draws has moved', () => {
  let painted = 0
  const ctx = new Proxy(
    {},
    {
      get: (_, name) =>
        name === 'measureText'
          ? () => ({ width: 0 })
          : name === 'fillRect'
            ? () => painted++
            : () => {},
      set: () => true,
    },
  )
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
  const group = GROUPS.find(g => g.name === 'Layercake')
  if (!group) throw new Error('no four-track')
  render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
  act(runFrames)
  const laps = new Float32Array(4).fill(2)
  const heads = new Float32Array(4)
  post({ fourLaps: laps, fourHeads: heads })
  act(runFrames)
  painted = 0
  post({ fourLaps: laps.slice(), fourHeads: heads.slice() })
  act(runFrames)
  expect(painted).toBe(0)

  const moved = heads.slice()
  moved[2] = 0.5
  post({ fourLaps: laps.slice(), fourHeads: moved })
  act(runFrames)
  expect(painted).toBeGreaterThan(0)
  expect(painted).toBeLessThan(10)
})
