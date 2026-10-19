// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { GROUPS } from './controls/index.ts'
import { RailLamp } from './RailLamp.tsx'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

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
