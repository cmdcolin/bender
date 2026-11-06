// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { jackFor } from '../jacks.ts'
import { BendFace } from './BendFaces.tsx'
import './testDom.ts'

const face = (stage: string) =>
  render(<BendFace stage={stage} seconds={0} onOpen={() => {}} />)

const tipOf = (el: HTMLElement) => {
  vi.useFakeTimers()
  fireEvent.pointerEnter(el)
  act(() => {
    vi.runAllTimers()
  })
  vi.useRealTimers()
  return document.getElementById(el.getAttribute('aria-describedby')!)
    ?.textContent
}

test('a patched bend with no socket reads as running on its machine', () => {
  engine.writeBoard({
    ...DEFAULT_CONTROLS,
    octInto: jackFor('toyDrum'),
    octMix: 1,
  })
  face('Octave')
  const foot = screen.getByRole('button', { name: 'bypass Octave' })
  expect(foot.getAttribute('aria-pressed')).toBe('false')
  expect(tipOf(foot.parentElement!)).toMatch(
    /^Press to take Octave out of the path/,
  )
  expect(tipOf(screen.getByRole('img', { name: 'patched into Clatter' }))).toBe(
    'Octave is patched into Clatter and runs on that machine alone, so it needs no socket.',
  )
})

test('a socketed patched bend’s badge says its joint rests', () => {
  engine.writeBoard({
    ...DEFAULT_CONTROLS,
    ringInto: jackFor('toyDrum'),
    ringMix: 1,
  })
  face('Ring mod')
  const tip = tipOf(screen.getByRole('img', { name: 'patched into Clatter' }))
  expect(tip).toMatch(/its joint rests/)
  expect(tip).not.toMatch(/Dry joints|Re-solder/)
})
