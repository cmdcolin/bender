// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { sliderFor } from './controls/index.ts'
import { ControlSlider } from './Slider.tsx'
import './testDom.ts'

test('an ordered pick is a track with one stop per choice', () => {
  const def = sliderFor('fmDataLine')
  render(<ControlSlider def={def} />)
  const track = screen.getByRole('slider', { name: def.label })
  expect(track.getAttribute('max')).toBe(String(def.choices!.length - 1))
  fireEvent.change(track, { target: { value: '3' } })
  expect(engine.controls.get().fmDataLine).toBe(def.min + 3)
  expect(track.getAttribute('aria-valuetext')).toBe(def.choices![3])
})

test('a long set of short names is a row of buttons', () => {
  render(<ControlSlider def={sliderFor('pcmChord')} />)
  expect(screen.queryByRole('combobox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'min9' }))
  expect(engine.controls.get().pcmChord).toBe(
    sliderFor('pcmChord').choices!.indexOf('min9') + sliderFor('pcmChord').min,
  )
})

test('a long unordered set of long names stays a list', () => {
  render(<ControlSlider def={sliderFor('keyScale')} />)
  expect(screen.getByRole('combobox', { name: 'Key lock' })).toBeTruthy()
})
