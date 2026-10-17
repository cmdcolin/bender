// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { choiceValue } from './controls/index.ts'
import { PatchBay } from './PatchBay.tsx'
import { bayFaults } from './presets/patch.ts'
import './testDom.ts'

// A wire off a mic nobody has turned on, onto a reverb that is dry: two rows of
// the panel saying something is happening, and nothing is.
const deadWire = () => ({
  ...DEFAULT_CONTROLS,
  mod0Src: choiceValue('mod0Src', 'mic'),
  mod0Dest: choiceValue('mod0Dest', 'verb decay'),
  mod0Depth: 0.8,
})

const solder = () => screen.queryByRole('button', { name: /reaches nothing/ })

test('the bay says which wire reaches nothing, and solders it on a press', () => {
  engine.writeBoard(deadWire())
  render(<PatchBay />)
  const press = solder()
  expect(press).not.toBeNull()
  expect(press!.textContent).toMatch(/one wire/)
  fireEvent.click(press!)
  expect(bayFaults(engine.controls.get())).toEqual([])
  expect(solder()).toBeNull()
})

// The repair is the blind dice's: it moves the loose end of the wire rather
// than turning a stage up to meet it.
test('soldering a loose wire turns nothing up', () => {
  engine.writeBoard(deadWire())
  render(<PatchBay />)
  fireEvent.click(solder()!)
  const after = engine.controls.get()
  expect(after.revMix).toBe(DEFAULT_CONTROLS.revMix)
  expect(after.mod0Src).toBe(choiceValue('mod0Src', 'mic'))
})

test('a bay with nothing wrong with it says nothing', () => {
  engine.writeBoard({
    ...DEFAULT_CONTROLS,
    mod0Src: choiceValue('mod0Src', 'LFO'),
    mod0Dest: choiceValue('mod0Dest', 'chip clock'),
    mod0Depth: 0.5,
  })
  render(<PatchBay />)
  expect(solder()).toBeNull()
})

test('a wire opens its from, to and depth rows when pressed, and shuts them on a second press', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<PatchBay />)
  const wire = screen.getByRole('button', { name: 'wire 2 controls' })
  expect(screen.queryByText('Wire 2 from')).toBeNull()
  fireEvent.click(wire)
  for (const row of ['from', 'to', 'depth'])
    expect(screen.getByText(`Wire 2 ${row}`)).not.toBeNull()
  expect(screen.queryByText('Wire 1 from')).toBeNull()
  fireEvent.click(wire)
  expect(screen.queryByText('Wire 2 from')).toBeNull()
})

// A stopped sequencer is not a setting, so the bay cannot see it — the picture
// says it where the picture is.
test('a wire off the kit says so while the kit is stopped', () => {
  engine.writeBoard({
    ...DEFAULT_CONTROLS,
    mod0Src: choiceValue('mod0Src', 'drum hit'),
    mod0Dest: choiceValue('mod0Dest', 'chip clock'),
    mod0Depth: 0.5,
  })
  const { container } = render(<PatchBay />)
  const said = () => container.querySelector('title')!.textContent
  expect(said()).toMatch(/kit is stopped/)
  expect(bayFaults(engine.controls.get())).toEqual([])
})
