// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

const drawing = () => {
  render(
    <OpenGroup
      group={GROUPS.find(g => g.name === 'Ember')!}
      onClose={() => {}}
      seconds={0}
    />,
  )
  return screen.getByRole('group', { name: 'ember signal path and tone' })
}

test('the amp drawing bends its tone stack curve with the knobs and prints no readings', () => {
  act(() => engine.set('ampBass', 0.5))
  const svg = drawing()
  expect(svg.textContent).not.toMatch(/dB|Hz/)
  const stack = () =>
    svg
      .querySelector('path[class*="curve"]:not([class*="Quiet"])')!
      .getAttribute('d')
  const before = stack()
  act(() => engine.set('ampBass', 1))
  expect(stack()).not.toBe(before)
})
