// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { MicCap, MicMenu } from './MicJacks.tsx'
import { BY_STAGE, MIC_JACKS } from './micWiring.ts'
import './testDom.ts'

const quietMic = () => {
  vi.spyOn(engine, 'start').mockResolvedValue()
  return vi.spyOn(engine, 'enableMic').mockResolvedValue()
}

test('every jack the DSP knows has a name and a stage on the bench', () => {
  expect(MIC_JACKS).toHaveLength(Object.keys(MIC).length)
  for (const j of MIC_JACKS) expect(BY_STAGE).toContain(j.stage)
  expect(MIC_JACKS[MIC.toyClock]!.name).toBe('toy clock')
  expect(MIC_JACKS[MIC.glintBus]!.stage).toBe('Glint')
})

test('the bench menu lists every jack with what a voice does there', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<MicMenu />)
  fireEvent.click(screen.getByRole('button', { name: /mic into/i }))
  const items = screen.getAllByRole('menuitem')
  expect(items).toHaveLength(MIC_JACKS.length)
  expect(
    screen.getByRole('menuitem', { name: 'solder the mic to tape motor' })
      .textContent,
  ).toContain('stops in silence')
})

test('picking a jack solders the mic, opens it and turns up what was at zero', async () => {
  const open = quietMic()
  engine.writeBoard({ ...DEFAULT_CONTROLS, micLevel: 0, monoLevel: 0 })
  render(<MicMenu />)
  fireEvent.click(screen.getByRole('button', { name: /mic into/i }))
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'solder the mic to Growler in' }),
  )
  const c = engine.controls.get()
  expect(c.micPatch).toBe(MIC.growlerIn)
  expect(c.micLevel).toBeGreaterThan(0)
  expect(c.monoLevel).toBeGreaterThan(0)
  await vi.waitFor(() => expect(open).toHaveBeenCalled())
  vi.restoreAllMocks()
})

test('a stage’s cap lists only the jacks on that stage', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<MicCap stage="Plinky" />)
  fireEvent.click(screen.getByRole('button', { name: 'mic into Plinky' }))
  expect(
    screen.getAllByRole('menuitem').map(b => b.getAttribute('aria-label')),
  ).toEqual([
    'solder the mic to chip rail',
    'solder the mic to toy clock',
    'solder the mic to toy addr',
    'solder the mic to toy data',
  ])
})

test('a stage with no jack wears no mic cap', () => {
  const { container } = render(<MicCap stage="Boing" />)
  expect(container.innerHTML).toBe('')
})
