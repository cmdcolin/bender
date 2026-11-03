// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { Instruments } from './Instruments.tsx'
import { MicPatch } from './MicPatch.tsx'
import './testDom.ts'

const patched = { ...DEFAULT_CONTROLS, micLevel: 1, micPatch: MIC.drumTrig }

test('the mic face comes onto the bench with the mic and names its jack', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  const { unmount } = render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(screen.queryByRole('group', { name: 'mic' })).toBeNull()
  unmount()
  engine.writeBoard(patched)
  render(<Instruments seconds={0} onOpen={() => {}} />)
  const face = screen.getByRole('group', { name: 'mic' })
  expect(face.textContent).toContain('into Clatter’s trigger line')
})

test('with the delay up the face says the voice goes through it first', () => {
  engine.writeBoard({ ...patched, micDelay: 0.5 })
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(screen.getByRole('group', { name: 'mic' }).textContent).toContain(
    'delay, then Clatter’s trigger line',
  )
})

test('the patch drawing routes the wire through the delay box once it is up', () => {
  engine.writeBoard(patched)
  const { unmount } = render(<MicPatch />)
  expect(screen.queryByText(/through the delay/)).toBeNull()
  unmount()
  engine.writeBoard({ ...patched, micDelay: 0.5 })
  render(<MicPatch />)
  expect(screen.getByText(/through the delay/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'delay controls' })).toBeTruthy()
})
