// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { MicCap, MicMenu } from './MicJacks.tsx'
import { JACKS_BY_STAGE, MIC_JACKS } from './micWiring.ts'
import './testDom.ts'

const quietMic = () => {
  vi.spyOn(engine, 'start').mockResolvedValue()
  return vi.spyOn(engine, 'enableMic').mockResolvedValue()
}

const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: /mic into/i }))

test('every jack sits once under the stage it names', () => {
  const listed = JACKS_BY_STAGE.flatMap(s => s.jacks)
  expect(listed.toSorted((a, b) => a - b)).toEqual(
    Object.values(MIC).toSorted((a, b) => a - b),
  )
  for (const { stage, jacks } of JACKS_BY_STAGE)
    for (const j of jacks) expect(MIC_JACKS[j]!.stage).toBe(stage)
})

test('the bench menu lists every jack under its machine with what a voice does there', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<MicMenu />)
  openMenu()
  expect(screen.getAllByRole('menuitem')).toHaveLength(MIC_JACKS.length)
  const plinky = screen.getByRole('group', { name: 'Plinky' })
  expect(plinky.textContent).toContain('toy keyboard')
  expect(
    screen.getByRole('menuitem', {
      name: 'solder the mic to Spool’s capstan motor',
    }).textContent,
  ).toContain('stops in silence')
})

test('picking a jack solders the mic, opens it and turns up what was at zero', async () => {
  const open = quietMic()
  engine.writeBoard({ ...DEFAULT_CONTROLS, micLevel: 0, monoLevel: 0 })
  render(<MicMenu />)
  openMenu()
  fireEvent.click(
    screen.getByRole('menuitem', {
      name: 'solder the mic to Growler’s external input',
    }),
  )
  const c = engine.controls.get()
  expect(c.micPatch).toBe(MIC.growlerIn)
  expect(c.micLevel).toBeGreaterThan(0)
  expect(c.monoLevel).toBeGreaterThan(0)
  await vi.waitFor(() => expect(open).toHaveBeenCalled())
  vi.restoreAllMocks()
})

test('a stage’s cap lists only its own jacks, the wildest first', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<MicCap stage="Plinky" />)
  fireEvent.click(screen.getByRole('button', { name: 'mic into Plinky' }))
  expect(
    screen.getAllByRole('menuitem').map(b => b.getAttribute('aria-label')),
  ).toEqual([
    'solder the mic to Plinky’s clock pin',
    'solder the mic to Plinky’s address bus',
    'solder the mic to Plinky’s data bus',
    'solder the mic to Plinky’s supply rail',
  ])
})

test('the jack the open mic is in reads as plugged in, with a way to close the mic', () => {
  engine.writeBoard({
    ...DEFAULT_CONTROLS,
    micLevel: 1,
    micPatch: MIC.toyAddr,
  })
  act(() => engine.micOn.set(true))
  render(<MicCap stage="Plinky" />)
  const cap = screen.getByRole('button', { name: 'mic into Plinky' })
  fireEvent.click(cap)
  const live = screen.getByRole('menuitem', {
    name: 'solder the mic to Plinky’s address bus',
  })
  expect(live.getAttribute('aria-current')).toBe('true')
  expect(live.textContent).toContain('plugged in')
  expect(screen.getByRole('menuitem', { name: 'close the mic' })).toBeTruthy()
  act(() => engine.micOn.set(false))
})

test('a stage with no jack wears no mic cap', () => {
  const { container } = render(<MicCap stage="Boing" />)
  expect(container.innerHTML).toBe('')
})
