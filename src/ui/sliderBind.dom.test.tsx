// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, expect, test } from 'vitest'

import { sliderFor } from './controls/index.ts'
import { midi } from './midi.ts'
import { ControlSlider } from './Slider.tsx'
import './testDom.ts'

afterEach(() => {
  midi.status.set('idle')
  midi.pickups.set({})
})

test('a knob catching up on another control leaves this slider alone', () => {
  midi.status.set('ready')
  let renders = 0
  render(
    <Profiler id="slider" onRender={() => renders++}>
      <ControlSlider def={sliderFor('dlyMix')} />
    </Profiler>,
  )
  renders = 0
  act(() => midi.pickups.set({ revMix: 0.3 }))
  act(() => midi.pickups.set({ revMix: 0.4 }))
  expect(renders).toBe(0)
  act(() => midi.pickups.set({ dlyMix: 0.2 }))
  expect(renders).toBeGreaterThan(0)
})
