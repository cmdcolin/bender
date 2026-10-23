// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { RailLamp } from './RailLamp.tsx'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

afterEach(() => act(() => engine.patch(DEFAULT_CONTROLS)))

test('the voltage lamp on a deck opens the power supply panel', () => {
  const onOpen = vi.fn()
  render(<RailLamp onOpen={onOpen} />)
  fireEvent.click(screen.getByRole('button', { name: 'power supply settings' }))
  expect(onOpen).toHaveBeenCalledWith('Power supply')
})

test('a lamp with nowhere to open is not a button', () => {
  render(<RailLamp />)
  expect(screen.queryByRole('button')).toBeNull()
})

test('the supply panel carries the rail’s knobs, not the toy keyboard', () => {
  const keys = (name: string) =>
    GROUPS.find(g => g.name === name)!.sliders.map(s => s.key)
  expect(keys('Power supply')).toContain('chipStarve')
  expect(keys('Power supply')).toContain('chipWatchdog')
  expect(keys('Plinky')).not.toContain('chipStarve')
  expect(keys('Board parts')).not.toContain('chipWatchdog')
})

test('the supply panel opens on a reading of the rail', () => {
  const group = GROUPS.find(g => g.name === 'Power supply')!
  render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
  expect(screen.getByText(/Feeds Plinky/)).toBeTruthy()
  expect(screen.getByText('Starve')).toBeTruthy()
})

test('a deck on the bench supply says so on its lamp', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS, drumSupply: 2 }))
  render(<RailLamp supply="drumSupply" />)
  expect(screen.getByText('bench')).toBeTruthy()
})

test('the supply panel names what each set of cells feeds', () => {
  act(() =>
    engine.patch({
      ...DEFAULT_CONTROLS,
      drumSupply: 1,
      fmSupply: 1,
      chipSupply: 2,
    }),
  )
  const group = GROUPS.find(g => g.name === 'Power supply')!
  render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
  expect(screen.getByText('Feeds Parlor and Growler.')).toBeTruthy()
  expect(screen.getByText('Second cells feed Clatter and Glint.')).toBeTruthy()
  expect(screen.getByText('On the bench supply: Plinky.')).toBeTruthy()
})
