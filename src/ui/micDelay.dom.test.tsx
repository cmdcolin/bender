// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { MIC } from '../dsp/micJacks.ts'
import { DELAY_ON_FIRST } from '../dsp/micLine.ts'
import { engine } from '../engine/engine.ts'
import { Instruments } from './Instruments.tsx'
import { MicMenu } from './MicJacks.tsx'
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

test('the second wire goes on from the menu and the face names both jacks', () => {
  vi.spyOn(engine, 'start').mockResolvedValue()
  vi.spyOn(engine, 'enableMic').mockResolvedValue()
  engine.micOn.set(true)
  engine.writeBoard({ ...patched, micDelay: 0.5, micDelayOn: DELAY_ON_FIRST })
  render(<MicMenu />)
  fireEvent.click(screen.getByRole('button', { name: /mic into/i }))
  fireEvent.click(
    screen.getByRole('menuitem', {
      name: 'solder the second wire to Plinky’s clock pin',
    }),
  )
  const c = engine.controls.get()
  expect(c.micPatch).toBe(MIC.drumTrig)
  expect(c.micPatch2 - 1).toBe(MIC.toyClock)
  render(<Instruments seconds={0} onOpen={() => {}} />)
  const face = screen.getByRole('group', { name: 'mic' }).textContent
  expect(face).toContain('delay, then Clatter’s trigger line')
  expect(face).toContain('into Plinky’s clock pin')
  engine.micOn.set(false)
  vi.restoreAllMocks()
})

test('the drawing moves the second wire once it is picked', () => {
  engine.writeBoard(patched)
  render(<MicPatch />)
  fireEvent.click(screen.getByRole('button', { name: 'second wire' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'solder the second wire to Glint bus' }),
  )
  expect(engine.controls.get().micPatch2 - 1).toBe(MIC.glintBus)
  expect(engine.controls.get().micPatch).toBe(MIC.drumTrig)
  expect(screen.getByText(/fires the kit\. Glint’s data bus/)).toBeTruthy()
})

test('the face’s freeze key latches the delay', () => {
  engine.writeBoard({ ...patched, micDelay: 0.5 })
  render(<Instruments seconds={0} onOpen={() => {}} />)
  const freeze = screen.getByRole('button', { name: 'freeze' })
  fireEvent.click(freeze)
  expect(engine.controls.get().micFreeze).toBe(1)
  expect(freeze.getAttribute('aria-pressed')).toBe('true')
})
