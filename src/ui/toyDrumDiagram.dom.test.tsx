// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import { VOICE_BOXES } from './toyBoxKeys.ts'
import { ToyDrumDiagram } from './ToyDrumDiagram.tsx'
import './testDom.ts'

const box = (name: string) =>
  screen.getByRole('button', { name: `${name} controls` })

test('each box opens its own rows and a second press puts them away', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<ToyDrumDiagram />)
  expect(screen.queryByText('Ring')).toBeNull()
  fireEvent.click(box('tanks'))
  expect(screen.getByText('Ring')).not.toBeNull()
  expect(screen.queryByText('Snappy')).toBeNull()
  fireEvent.click(box('noise'))
  expect(screen.getByText('Snappy')).not.toBeNull()
  expect(screen.queryByText('Ring')).toBeNull()
  fireEvent.click(box('noise'))
  expect(screen.queryByText('Snappy')).toBeNull()
})

test('the amps are drawn and open nothing', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<ToyDrumDiagram />)
  expect(screen.queryByRole('button', { name: 'amps controls' })).toBeNull()
})

test('the DAC opens the converter rows and the sample ROM opens the kit rows', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<ToyDrumDiagram verbs={part => <p>{`verbs for ${part}`}</p>} />)
  expect(screen.queryByText('Bit depth')).toBeNull()
  fireEvent.click(box('DAC'))
  expect(screen.getByText('Bit depth')).not.toBeNull()
  expect(screen.getByText('verbs for the converter')).not.toBeNull()
  fireEvent.click(box('sample ROM'))
  expect(screen.getByText('Kit')).not.toBeNull()
  expect(screen.getByText('verbs for Sample ROM')).not.toBeNull()
  expect(screen.queryByText('Bit depth')).toBeNull()
})

test('the pattern opens the bus rows, and the triggers leave their rows to their own drawing', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<ToyDrumDiagram verbs={part => <p>{`verbs for ${part}`}</p>} />)
  fireEvent.click(box('pattern'))
  expect(screen.getByText('Data line')).not.toBeNull()
  fireEvent.click(box('triggers'))
  expect(screen.getByText('verbs for triggers and cross-patch')).not.toBeNull()
  expect(screen.queryByText('Retrigger')).toBeNull()
})

test('the FM, sync and ROM wires open the box whose knob they stand for', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  render(<ToyDrumDiagram />)
  for (const [wire, row] of [
    ['FM', 'Bank FM'],
    ['sync', 'Bank sync'],
    ['ROM', 'Kit'],
  ] as const) {
    fireEvent.click(box(wire))
    expect(screen.getByText(row), wire).not.toBeNull()
    fireEvent.click(box(wire))
    expect(screen.queryByText(row), wire).toBeNull()
  }
})

test('a box goes accent when a knob inside it is off stock', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, drumBankFm: 0.5 })
  render(<ToyDrumDiagram />)
  expect(
    box('metal bank').querySelector('rect')!.getAttribute('class'),
  ).toMatch(/boxOn/)
  expect(box('tanks').querySelector('rect')!.getAttribute('class')).not.toMatch(
    /boxOn/,
  )
})

test('every knob in the voices fold sits in one of the boxes', () => {
  const drums = GROUPS.find(g => g.name === 'Clatter')!
  const fold = drums.sliders
    .filter(d => d.part === 'inside the voices')
    .map(d => d.key)
  expect(Object.values(VOICE_BOXES).flat().toSorted()).toEqual(fold.toSorted())
})

test('a kit that arrives knifed opens the pattern box', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, drumDataLine: 2 })
  render(<ToyDrumDiagram />)
  expect(screen.getByText('Data fault')).not.toBeNull()
})

const openKit = () =>
  render(
    <OpenGroup
      group={GROUPS.find(g => g.name === 'Clatter')!}
      onClose={() => {}}
      seconds={0}
    />,
  )

test('the pads box starts open on the kit rows, and the stage draws no folds', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  openKit()
  for (const row of ['Level', 'Tempo', 'Swing', 'Mute'])
    expect(screen.getByText(row)).not.toBeNull()
  expect(document.querySelectorAll('summary')).toHaveLength(0)
  fireEvent.click(box('tanks'))
  expect(screen.queryByText('Tempo')).toBeNull()
  expect(screen.getByText('Ring')).not.toBeNull()
  expect(screen.getAllByRole('img', { name: 'toy drum voices' })).toHaveLength(
    1,
  )
})

test('showing the drum pattern opens the pads box', () => {
  engine.writeBoard(DEFAULT_CONTROLS)
  openKit()
  fireEvent.click(box('noise'))
  expect(screen.queryByText('Tempo')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'show drum pattern' }))
  expect(screen.getByText('Tempo')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'show drum pattern' }))
})

test('the pads box lights when a kit knob moves', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, drumSwing: 0.4 })
  render(<ToyDrumDiagram />)
  expect(box('pads').querySelector('rect')!.getAttribute('class')).toContain(
    'boxOn',
  )
  engine.writeBoard(DEFAULT_CONTROLS)
})

test("a voice box's reset counts only that box's knobs", () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, drumRing: 0.5, drumSnappy: 0.5 })
  openKit()
  fireEvent.click(box('tanks'))
  expect(screen.getByRole('button', { name: 'reset 1' })).not.toBeNull()
})
