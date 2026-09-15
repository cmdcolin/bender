// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { choiceValue, GROUPS } from './controls'
import { OpenGroup } from './Section'
import './testDom'

// The bay reaching a stage from the stage's own panel. Every wire it solders is
// one of the bay's four and reads the same in the bay's own diagram — what is
// new is being able to ask for one, and dial it, from the knob you are looking
// at.

const SRC_OFF = choiceValue('mod0Src', 'off')
const SRC_LFO = choiceValue('mod0Src', 'LFO')

const openFilter = () => {
  const group = GROUPS.find(g => g.name === 'Screech filter')
  if (!group) throw new Error('no screech filter')
  render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
}

const plug = () =>
  screen.queryByRole('button', { name: 'put a bay wire on Cutoff' })
const chip = () =>
  screen.queryByRole('button', { name: 'the bay wire on Cutoff' })
const unplug = () =>
  screen.queryByRole('button', { name: 'unplug the bay wire on Cutoff' })
// The wire's own rows, drawn under the row it is on.
const wireRows = () => [
  screen.queryByRole('combobox', { name: 'picks up' }),
  screen.queryByRole('slider', { name: 'pushes' }),
]

test('a row solders a bay wire onto its own control, and takes it off again', () => {
  openFilter()
  fireEvent.click(plug()!)
  const wired = engine.controls.get()
  expect(wired.mod0Src).toBe(SRC_LFO)
  expect(wired.mod0Dest).toBe(choiceValue('mod0Dest', 'filt cut'))
  expect(plug()).toBeNull()

  fireEvent.click(unplug()!)
  expect(engine.controls.get().mod0Src).toBe(SRC_OFF)
  expect(chip()).toBeNull()
  expect(plug()).not.toBeNull()
})

// The press that patches also opens the wire, because the three numbers that
// decide what a wobble sounds like are the next thing you want and they used to
// be a stage away.
test('the wire it soldered is dialled where you are standing', () => {
  openFilter()
  expect(wireRows()).toEqual([null, null])
  fireEvent.click(plug()!)
  for (const row of wireRows()) expect(row).not.toBeNull()

  fireEvent.change(screen.getByRole('combobox', { name: 'picks up' }), {
    target: { value: String(choiceValue('mod0Src', 'body X')) },
  })
  expect(engine.controls.get().mod0Src).toBe(choiceValue('mod0Src', 'body X'))

  // Folded away, the wire is still on the lane — the chip is what says so.
  fireEvent.click(chip()!)
  expect(wireRows()).toEqual([null, null])
  expect(engine.controls.get().mod0Src).toBe(choiceValue('mod0Src', 'body X'))
})

// A badge that read the same for a 0.05 Hz sweep and a 200 Hz buzz would be
// sending you to the bay to answer a question it could answer standing there.
test('the chip says what is driving the row and how fast', () => {
  openFilter()
  fireEvent.click(plug()!)
  expect(chip()!.textContent).toBe('∿ LFO 1.0Hz▴')
  act(() => engine.set('modLfoHz', 40))
  expect(chip()!.textContent).toBe('∿ LFO 40Hz▴')
})

// One oscillator serves all four wires, so a row that draws its rate has to say
// when dialling it is more than this row's business — and must not say so on a
// board where it isn't.
test('the shared oscillator is named as shared only when it is', () => {
  openFilter()
  fireEvent.click(plug()!)
  expect(screen.queryByText(/one oscillator/)).toBeNull()
  act(() =>
    engine.writeBoard({
      ...engine.controls.get(),
      mod1Src: SRC_LFO,
      mod1Dest: choiceValue('mod0Dest', 'ring car'),
    }),
  )
  expect(screen.queryByText(/one oscillator/)).not.toBeNull()
})

// Everything else the panel writes lands in the walk, and a wire soldered by
// mistake is the same kind of mistake.
test('the press is one step in the undo walk', () => {
  openFilter()
  fireEvent.click(plug()!)
  act(() => engine.undo(0))
  expect(engine.controls.get().mod0Src).toBe(DEFAULT_CONTROLS.mod0Src)
})

// Four wires is four wires. The row keeps its place and says why rather than
// the offer quietly disappearing off every laned row on the board at once.
test('a full bay says so where the offer was', () => {
  act(() =>
    engine.writeBoard({
      ...DEFAULT_CONTROLS,
      mod0Src: SRC_LFO,
      mod0Dest: choiceValue('mod0Dest', 'fb amount'),
      mod1Src: SRC_LFO,
      mod1Dest: choiceValue('mod0Dest', 'glitch'),
      mod2Src: SRC_LFO,
      mod2Dest: choiceValue('mod0Dest', 'starve'),
      mod3Src: SRC_LFO,
      mod3Dest: choiceValue('mod0Dest', 'drum tune'),
    }),
  )
  openFilter()
  expect(plug()).toBeNull()
  expect(chip()).toBeNull()
  expect(screen.getAllByText('+ mod')).toHaveLength(2)
})

// The row is a door onto the bay rather than a bay of its own: a wire the bay
// already has on the lane is the wire the row reports, whatever put it there.
test('a wire patched anywhere else shows up on the row', () => {
  act(() =>
    engine.writeBoard({
      ...DEFAULT_CONTROLS,
      mod2Src: choiceValue('mod0Src', 'body X'),
      mod2Dest: choiceValue('mod0Dest', 'filt cut'),
    }),
  )
  openFilter()
  expect(plug()).toBeNull()
  expect(chip()!.textContent).toBe('∿ body X▾')
})

test('a selector row solders a wire onto its own lane too', () => {
  const group = GROUPS.find(g => g.name === 'FM chip')
  if (!group) throw new Error('no FM chip')
  render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
  fireEvent.click(
    screen.getByRole('button', { name: 'put a bay wire on Data line' }),
  )
  const wired = engine.controls.get()
  expect(wired.mod0Src).toBe(SRC_LFO)
  expect(wired.mod0Dest).toBe(choiceValue('mod0Dest', 'FM data line'))
  expect(screen.getByRole('combobox', { name: 'picks up' })).toBeTruthy()
})
